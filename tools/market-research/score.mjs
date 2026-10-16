#!/usr/bin/env node
/**
 * ANET 市场调研：用 6kpro（免费国内 LLM）给全部上架商品打分，产出「主推商品 + 分类机会 + SEO 建议」报告。
 * 只读数据库导出的 JSON，不改任何线上数据。零依赖，Node 20+。
 *
 * 1) Windows 上导出商品（在仓库根执行）：
 *    docker exec jianpanerp-postgres psql -U erp -d japan_erp -At -c "SELECT json_agg(t) FROM (SELECT id, \"titleJa\", \"descriptionJa\", \"bulletsJa\", \"retailPrice\", \"wholesalePrice\", category, \"shopifyHandle\", images FROM \"SupplierProduct\" WHERE status='published') t;" > tools\market-research\out\products.json
 * 2) 打分：
 *    node tools/market-research/score.mjs --in tools/market-research/out/products.json
 *    可选：--limit 50（先试跑）、--concurrency 4、--base http://100.82.2.101:8199/v1 --model GLM-5.3-Flash
 * 3) 输出：out/scores.jsonl（逐件）、out/report.md（汇总）、out/hero-top50.json（主推清单，供价格对比脚本使用）
 */
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const IN = args.in ?? 'tools/market-research/out/products.json';
const OUT_DIR = path.dirname(IN);
const BASE = (args.base ?? process.env.CN_LLM_BASE_URL ?? 'http://100.82.2.101:8199/v1').replace(/\/$/, '');
const MODEL = args.model ?? process.env.CN_LLM_MODEL ?? 'GLM-5.3-Flash';
const KEY = process.env.CN_LLM_API_KEY ?? '';
const LIMIT = Number(args.limit ?? 0);
const CONC = Number(args.concurrency ?? 4);
const MONTH = new Date().getMonth() + 1;

const SYSTEM = `あなたは日本のEC（楽天・Amazon.co.jp・Yahoo!ショッピング）で10年以上の経験を持つMD兼SEO担当です。
与えられた商品について、日本市場での販売可能性を冷静に評価し、必ず次のJSONだけを返してください（説明文は不要）：
{
 "demand": 1-5の整数（日本での需要の強さ。5=定番・検索多い、1=ほぼ売れない）,
 "competition": 1-5の整数（Amazon/楽天での競合の多さ。5=同型商品が溢れている）,
 "price_sense": "cheap" | "fair" | "high"（提示価格が日本の相場に対してどうか）,
 "market_price_jpy": 日本での一般的な販売価格の目安（整数、不明なら null）,
 "season": "all" | "spring" | "summer" | "autumn" | "winter" | "yearend"（売れる時期）,
 "target": 20文字以内の主要ターゲット（例：一人暮らしの20代女性）,
 "seo_title": 全角60文字以内の日本語商品名（主要キーワード→特徴→用途の順、記号は【】と・のみ、誇大表現禁止）,
 "keywords": 検索キーワード5個の配列（日本語）,
 "hook": 30文字以内の一言セールスポイント,
 "risk": "none" | "legal" | "safety" | "ip" | "quality"（販売上の懸念。医療効果・電波法・PSE・著作権など）,
 "risk_note": 懸念の具体内容（なければ空文字）,
 "push": true/false（ホームページ・広告で主推すべきか）
}`;

function userMsg(p) {
  const bullets = Array.isArray(p.bulletsJa) ? p.bulletsJa.slice(0, 5).join(' / ') : '';
  const desc = String(p.descriptionJa ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600);
  return `現在の月: ${MONTH}月\n商品名: ${p.titleJa}\nカテゴリ: ${p.category ?? ''}\n販売価格(税込): ¥${Math.round(Number(p.retailPrice ?? 0))}\n要点: ${bullets}\n説明: ${desc}`;
}

async function callLLM(p, retry = 2) {
  const body = {
    model: MODEL,
    temperature: 0.2,
    max_tokens: 700,
    response_format: { type: 'json_object' },
    messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: userMsg(p) }],
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const txt = j.choices?.[0]?.message?.content ?? '';
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json in response');
    return JSON.parse(m[0]);
  } catch (e) {
    if (retry > 0) return callLLM(p, retry - 1);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const products = JSON.parse(fs.readFileSync(IN, 'utf8'));
  const list = LIMIT ? products.slice(0, LIMIT) : products;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, 'scores.jsonl');
  const done = new Set();
  if (fs.existsSync(outPath)) for (const line of fs.readFileSync(outPath, 'utf8').split('\n')) { if (line.trim()) try { done.add(JSON.parse(line).id); } catch {} }
  const todo = list.filter((p) => !done.has(p.id));
  console.log(`total=${list.length} done=${done.size} todo=${todo.length} model=${MODEL} conc=${CONC}`);
  const fd = fs.openSync(outPath, 'a');
  let i = 0, ok = 0, fail = 0;
  const t0 = Date.now();
  async function worker() {
    while (i < todo.length) {
      const p = todo[i++];
      try {
        const s = await callLLM(p);
        fs.writeSync(fd, JSON.stringify({ id: p.id, titleJa: p.titleJa, category: p.category, retailPrice: Number(p.retailPrice ?? 0), wholesalePrice: Number(p.wholesalePrice ?? 0), handle: p.shopifyHandle, image: Array.isArray(p.images) ? p.images[0] : null, ...s }) + '\n');
        ok++;
      } catch (e) {
        fail++;
        console.error(`fail ${p.id}: ${e.message}`);
      }
      if ((ok + fail) % 25 === 0) console.log(`${ok + fail}/${todo.length} ok=${ok} fail=${fail} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  fs.closeSync(fd);
  console.log(`scoring done ok=${ok} fail=${fail} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  report(outPath);
}

function report(outPath) {
  const rows = fs.readFileSync(outPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const byCat = {};
  for (const r of rows) {
    const c = r.category ?? '未分類';
    (byCat[c] ??= { n: 0, demand: 0, comp: 0, push: 0, high: 0, risk: 0 });
    byCat[c].n++; byCat[c].demand += r.demand ?? 0; byCat[c].comp += r.competition ?? 0;
    if (r.push) byCat[c].push++; if (r.price_sense === 'high') byCat[c].high++; if (r.risk && r.risk !== 'none') byCat[c].risk++;
  }
  const score = (r) => (r.demand ?? 0) * 2 - (r.competition ?? 0) + (r.price_sense === 'cheap' ? 1 : r.price_sense === 'high' ? -2 : 0) + (r.push ? 1 : 0) + (r.risk && r.risk !== 'none' ? -3 : 0) + (r.season === 'all' || seasonNow(r.season) ? 1 : 0);
  const ranked = [...rows].sort((a, b) => score(b) - score(a));
  const hero = ranked.filter((r) => !(r.risk && r.risk !== 'none')).slice(0, 50);
  fs.writeFileSync(path.join(OUT_DIR, 'hero-top50.json'), JSON.stringify(hero, null, 2));
  const risky = rows.filter((r) => r.risk && r.risk !== 'none');
  const high = rows.filter((r) => r.price_sense === 'high');
  const L = [];
  L.push(`# ANET 商品市場調査レポート（${new Date().toISOString().slice(0, 10)}、${rows.length} 件、評価: ${MODEL}）`, '');
  L.push('## 1. カテゴリ別サマリー', '', '| カテゴリ | 件数 | 需要(平均) | 競合(平均) | 主推候補 | 価格高め | 懸念あり |', '|---|---|---|---|---|---|---|');
  for (const [c, v] of Object.entries(byCat).sort((a, b) => b[1].n - a[1].n)) L.push(`| ${c} | ${v.n} | ${(v.demand / v.n).toFixed(1)} | ${(v.comp / v.n).toFixed(1)} | ${v.push} | ${v.high} | ${v.risk} |`);
  L.push('', '## 2. 主推 TOP 50（需要高・競合少・価格妥当・懸念なし・今の季節）', '', '| # | 商品 | カテゴリ | 価格 | 相場目安 | 需要 | 競合 | ターゲット | 一言 |', '|---|---|---|---|---|---|---|---|---|');
  hero.forEach((r, i) => L.push(`| ${i + 1} | [${r.titleJa.slice(0, 40)}](https://anetmc.com/products/${r.handle ?? ''}) | ${r.category ?? ''} | ¥${r.retailPrice} | ${r.market_price_jpy ? '¥' + r.market_price_jpy : '-'} | ${r.demand} | ${r.competition} | ${r.target ?? ''} | ${r.hook ?? ''} |`));
  L.push('', `## 3. 価格が相場より高いと判定された商品（${high.length} 件、上位 40）`, '', '| 商品 | 販売価格 | 相場目安 | 卸価格 |', '|---|---|---|---|');
  high.sort((a, b) => (b.retailPrice - (b.market_price_jpy ?? 0)) - (a.retailPrice - (a.market_price_jpy ?? 0))).slice(0, 40).forEach((r) => L.push(`| ${r.titleJa.slice(0, 40)} | ¥${r.retailPrice} | ${r.market_price_jpy ? '¥' + r.market_price_jpy : '-'} | ¥${r.wholesalePrice} |`));
  L.push('', `## 4. 販売上の懸念がある商品（${risky.length} 件）— 要確認`, '', '| 商品 | 懸念 | 内容 |', '|---|---|---|');
  risky.forEach((r) => L.push(`| ${r.titleJa.slice(0, 40)} | ${r.risk} | ${r.risk_note ?? ''} |`));
  const seasonal = rows.filter((r) => r.season && r.season !== 'all' && seasonNow(r.season) && r.demand >= 4);
  L.push('', `## 5. 今の季節（${MONTH}月）に合う高需要商品（${seasonal.length} 件）`, '');
  seasonal.slice(0, 40).forEach((r) => L.push(`- ${r.titleJa.slice(0, 50)}（¥${r.retailPrice}、${r.season}）`));
  L.push('', '## 6. SEO タイトル案（主推 TOP 50）', '', '| 現在 | 提案 | キーワード |', '|---|---|---|');
  hero.forEach((r) => L.push(`| ${r.titleJa.slice(0, 40)} | ${r.seo_title ?? ''} | ${(r.keywords ?? []).join('、')} |`));
  fs.writeFileSync(path.join(OUT_DIR, 'report.md'), L.join('\n'));
  console.log(`report: ${path.join(OUT_DIR, 'report.md')}  hero: hero-top50.json  risky=${risky.length} high=${high.length}`);
}

function seasonNow(s) {
  const m = MONTH;
  return (s === 'spring' && m >= 3 && m <= 5) || (s === 'summer' && m >= 6 && m <= 8) || (s === 'autumn' && m >= 9 && m <= 11) || (s === 'winter' && (m === 12 || m <= 2)) || (s === 'yearend' && m >= 11);
}

if (args.report) report(path.join(OUT_DIR, 'scores.jsonl')); else main().catch((e) => { console.error(e); process.exit(1); });
