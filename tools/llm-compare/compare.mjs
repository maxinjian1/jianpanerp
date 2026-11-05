// 6kpro と自前モデル（Strata 等 OpenAI 互換）を、当社の実作業と同じ指示で比べる（2026-11-05 用户「本地模型改用 Strata，接入并对比 6kpro」）。
// node tools/llm-compare/compare.mjs [--only ig,title,long,cs,zh] → docs/llm/compare-<日付>.md
// 6kpro は北京の昼（10〜20 時）は機主側が使うので、1 件ずつ順番に呼ぶ（並列にしない）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null).filter(Boolean));
const MODELS = [
  { key: '6kpro', label: `6kpro（${env.CN_LLM_MODEL}）`, base: env.CN_LLM_BASE_URL, model: env.CN_LLM_MODEL, key_: env.CN_LLM_API_KEY },
  { key: 'local', label: `自前（${env.LOCAL_LLM_MODEL}）`, base: env.LOCAL_LLM_BASE_URL, model: env.LOCAL_LLM_MODEL, key_: env.LOCAL_LLM_API_KEY },
];

// ig.mjs と同じ指示・禁語を使う（コピーせずソースから読む）
const igSrc = fs.readFileSync(path.join(ROOT, 'tools/instagram/ig.mjs'), 'utf8');
const CAP_SYS_SINGLE = igSrc.match(/const CAP_SYS_SINGLE = `([\s\S]*?)`;/)[1];
const BANNED = eval(igSrc.match(/^const BANNED = (\/.*\/[a-z]*);/m)[1]);
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/instagram/out/plan-single.json'), 'utf8'));

async function call(m, messages, { json = false, max = 6000 } = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(`${m.base.replace(/\/$/, '')}/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(600e3), headers: { 'content-type': 'application/json', ...(m.key_ ? { authorization: `Bearer ${m.key_}` } : {}) }, body: JSON.stringify({ model: m.model, messages, temperature: 0.7, max_tokens: max, ...(json ? { response_format: { type: 'json_object' } } : {}) }) });
    const j = await r.json(); const sec = (Date.now() - t0) / 1000;
    if (!r.ok || j.error) return { err: JSON.stringify(j.error || j).slice(0, 300), sec };
    const c = j.choices?.[0]; const out = j.usage?.completion_tokens ?? 0;
    return { text: String(c?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(), finish: c?.finish_reason, sec, out, tps: out && sec ? out / sec : 0, think: (c?.message?.reasoning_content || c?.message?.reasoning || '').length };
  } catch (e) { return { err: e.message, sec: (Date.now() - t0) / 1000 }; }
}
const parseJson = (t) => { try { return JSON.parse(t); } catch { try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { return null; } } };
const nums = (s) => [...new Set((String(s).normalize('NFKC').match(/\d+(?:\.\d+)?/g) || []))];

// ───── 課題 ─────
const TASKS = [];
// 1) IG/FB/Threads 文案（本番と同じ指示）。説明ありの商品 3 件
for (const n of [21, 22, 26]) {
  const p = plan.find((x) => x.n === n); if (!p) continue;
  TASKS.push({ id: `ig#${n}`, group: 'ig', name: `IG 文案 #${n} ${p.title.slice(0, 24)}`, json: true,
    messages: [{ role: 'system', content: CAP_SYS_SINGLE }, { role: 'user', content: `種別:${p.kind} テーマ:${p.theme}\n商品名:${p.title}\nfacts:${p.facts}` }],
    check(r) {
      const o = parseJson(r.text); if (!o?.caption) return { ok: false, notes: ['JSON/caption なし'] };
      const notes = []; const all = [o.caption, o.threads, o.alt, ...(o.hashtags || [])].join('\n');
      const ban = all.match(new RegExp(BANNED.source, BANNED.flags.replace('g', '') + 'g')); if (ban) notes.push('禁語: ' + [...new Set(ban)].join(' '));
      const factN = new Set(nums(p.facts + p.title)); const invented = nums(o.caption + o.threads).filter((x) => !factN.has(x) && !/^[1-5]$/.test(x)); if (invented.length) notes.push('facts に無い数字: ' + invented.join(', '));
      const cl = [...o.caption].length, tl = [...String(o.threads || '')].length; if (cl < 250 || cl > 450) notes.push(`caption ${cl} 字（指定 250〜450）`); if (tl < 60) notes.push(`threads ${tl} 字（60 未満）`);
      if (!(o.hashtags || []).some((h) => /アネット/.test(h))) notes.push('#アネット なし');
      return { ok: !notes.length, notes, show: `【caption】\n${o.caption}\n\n【threads】\n${o.threads}\n\n${(o.hashtags || []).map((h) => '#' + String(h).replace(/^#+/, '')).join(' ')}` };
    } });
}
// 2) 楽天 商品名の修正（文字数・禁止表現）
const longTitle = '【楽天1位】【送料無料】折りたたみテーブル ローテーブル 完成品 おしゃれ 北欧 木目 軽量 コンパクト 一人暮らし アウトドア キャンプ 座卓 センターテーブル 在宅 テレワーク 子供 学習机 ちゃぶ台 収納 ホワイト ブラウン ナチュラル 幅80cm 奥行50cm 高さ32cm TB-04 プレゼント ギフト 母の日';
TASKS.push({ id: 'title', group: 'title', name: '楽天 商品名の修正', json: true,
  messages: [{ role: 'system', content: '楽天市場の商品名を規約に合わせて直す。全角 127 文字（半角は 0.5）以内、「楽天1位」「送料無料」「ランキング」など根拠のない表示・販促語・【】の煽り・機種依存文字は削除、型番は末尾に残してよい、元の情報（サイズ・色・用途）は削らずに優先度順。出力 JSON：{"title":"…","removed":["削った語"]}' }, { role: 'user', content: longTitle }],
  check(r) {
    const o = parseJson(r.text); if (!o?.title) return { ok: false, notes: ['JSON/title なし'] };
    const w = [...o.title].reduce((s, c) => s + (/[\x20-\x7e]/.test(c) ? 0.5 : 1), 0); const notes = [];
    if (w > 127) notes.push(`長さ ${w}（127 超）`); if (/楽天1位|送料無料|ランキング/.test(o.title)) notes.push('販促語が残る');
    for (const k of ['80', '50', '32', 'TB-04']) if (!o.title.includes(k)) notes.push(`「${k}」が消えた`);
    return { ok: !notes.length, notes, show: `${o.title}\n（長さ ${w}）削除: ${(o.removed || []).join(' / ')}` };
  } });
// 3) 長い入力（約 1 万字の商品一覧から条件に合うものを全部探す）。正解はプログラムで出せる
const pool = plan.filter((x) => x.facts && x.facts.length > 80).slice(0, 60);
let blob = ''; const used = []; for (const x of pool) { const line = `[${x.n}] ${x.title}｜${x.facts.replace(/\s+/g, ' ').slice(0, 260)}\n`; if ((blob + line).length > 11000) break; blob += line; used.push(x); }
const truth = used.filter((x) => /折りたたみ|折り畳み|折畳/.test(x.title + x.facts.slice(0, 260))).map((x) => x.n).sort((a, b) => a - b);
TASKS.push({ id: 'long', group: 'long', name: `長文から抽出（約 ${blob.length} 字・${used.length} 商品）`, json: true,
  messages: [{ role: 'system', content: '与えられた商品一覧（各行 [番号] 商品名｜説明）から、商品名か説明に「折りたたみ」「折り畳み」「折畳」のいずれかを含む商品の番号を漏れなく全部挙げる。推測しない。出力 JSON：{"ids":[番号,...]}' }, { role: 'user', content: blob }],
  check(r) {
    const o = parseJson(r.text); const ids = (o?.ids || []).map(Number).sort((a, b) => a - b); if (!o) return { ok: false, notes: ['JSON なし'] };
    const miss = truth.filter((x) => !ids.includes(x)), extra = ids.filter((x) => !truth.includes(x)); const notes = [];
    if (miss.length) notes.push('漏れ: ' + miss.join(',')); if (extra.length) notes.push('余分: ' + extra.join(','));
    return { ok: !notes.length, notes, show: `回答 ${ids.join(',')}\n正解 ${truth.join(',')}` };
  } });
// 4) 楽天のお客様問い合わせ 返信草稿（人が送る前提）
TASKS.push({ id: 'cs', group: 'cs', name: '楽天 問い合わせ返信草稿', json: false,
  messages: [{ role: 'system', content: 'あなたは楽天市場「アネットショップ」の店舗スタッフ。お客様への返信草稿を日本語の丁寧なビジネス文で書く（送信は人が確認してから）。分からないことは確認して連絡すると書き、在庫・到着日・返金を約束しない。300 字以内。' }, { role: 'user', content: '注文番号 123456-20261101-0000001 です。11/1 に折りたたみテーブルを注文しましたが、まだ発送されていません。いつ届きますか？急いでいるのでキャンセルも考えています。\n（店舗メモ：仕入先からの出荷待ち、仕入先回答では 11/6 出荷予定、未確定）' }],
  check(r) { const notes = []; if (/お届けします|必ず|確実に/.test(r.text)) notes.push('断定表現あり'); if ([...r.text].length > 330) notes.push(`${[...r.text].length} 字（300 超）`); return { ok: !notes.length, notes, show: r.text }; } });
// 5) 中国語での業務説明（社内向け）
TASKS.push({ id: 'zh', group: 'zh', name: '中文业务说明', json: false,
  messages: [{ role: 'user', content: '用中文、给不懂电商的老板解释（300 字以内）：我们乐天 421 件商品按比价分成 A 45 / B 95 / C 281 档，A 档 = 当店价 ≤ 同款最低价×1.05、售价 ≥2000 円、库存 ≥10。为什么乐天 RPP 广告首月 3 万円只投 A 档？给 3 个理由，最后一句说风险。' }],
  check(r) { const notes = []; if (!/A/.test(r.text)) notes.push('没提 A 档'); if ([...r.text].length > 360) notes.push(`${[...r.text].length} 字`); return { ok: !notes.length, notes, show: r.text }; } });

// ───── 実行 ─────
const only = args.only ? String(args.only).split(',') : null;
const rows = []; const md = [];
for (const t of TASKS.filter((t) => !only || only.includes(t.group))) {
  md.push(`\n## ${t.name}\n`);
  for (const m of MODELS) {
    process.stdout.write(`${t.id} ${m.key} … `);
    const r = await call(m, t.messages, { json: t.json });
    const c = r.err ? { ok: false, notes: ['エラー: ' + r.err], show: '' } : t.check(r);
    if (!r.err && r.finish === 'length') c.notes.unshift('途中で切れた（max_tokens）');
    console.log(`${r.sec?.toFixed(1)}s ${c.ok ? 'OK' : 'NG ' + c.notes.join(' / ')}`);
    rows.push({ task: t.name, model: m.key, ok: c.ok, sec: r.sec, tps: r.tps, out: r.out, think: r.think, notes: c.notes });
    md.push(`### ${m.label} — ${c.ok ? '✅ 合格' : '⚠️ ' + c.notes.join(' / ')}（${r.sec?.toFixed(1)} 秒、出力 ${r.out ?? '-'} tok、${r.tps ? r.tps.toFixed(0) + ' tok/s 実効' : ''}）\n\n\`\`\`\n${c.show || r.text || ''}\n\`\`\`\n`);
  }
}
const sum = (k) => { const x = rows.filter((r) => r.model === k); return { ok: x.filter((r) => r.ok).length, n: x.length, sec: x.reduce((s, r) => s + (r.sec || 0), 0) }; };
const head = [`# 6kpro vs 自前モデル 比較（${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })} JST）`, '', '同じ指示（IG 文案は ig.mjs 本番の指示・禁語チェック）で 1 件ずつ順番に実行。「実効 tok/s」＝出力トークン ÷ 待ち時間（思考・入力処理込み）。', '',
  '| 課題 | ' + MODELS.map((m) => m.label).join(' | ') + ' |', '|---|' + MODELS.map(() => '---|').join(''),
  ...[...new Set(rows.map((r) => r.task))].map((task) => `| ${task} | ` + MODELS.map((m) => { const r = rows.find((x) => x.task === task && x.model === m.key); return r ? `${r.ok ? '✅' : '⚠️'} ${r.sec?.toFixed(0)}s${r.notes.length ? ' ' + r.notes.join('；').slice(0, 60) : ''}` : '-'; }).join(' | ') + ' |'),
  '| **合計** | ' + MODELS.map((m) => { const s = sum(m.key); return `**${s.ok}/${s.n} 合格、${s.sec.toFixed(0)} 秒**`; }).join(' | ') + ' |'];
const out = path.join(ROOT, 'docs/llm', `compare-${new Date().toISOString().slice(0, 10)}.md`);
fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, head.join('\n') + '\n' + md.join('\n'));
fs.writeFileSync(out.replace(/\.md$/, '.json'), JSON.stringify(rows, null, 1));
console.log('→', path.relative(ROOT, out));
