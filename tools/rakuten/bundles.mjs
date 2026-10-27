#!/usr/bin/env node
/**
 * 専門店化 + セット商品（2026-10-27 用户「全部按建议做」）
 *
 *   node tools/rakuten/bundles.mjs genres                 # price-tier × publish-log の楽天ジャンルで A/B 档が集中する上位 3 ジャンル → docs/rakuten/focus-genres.md
 *   node tools/rakuten/bundles.mjs propose [--n 20] [--window 20-10]   # 6kpro で 3 ジャンルの A/B 商品から補完セット候補（2〜3 点）→ docs/rakuten/bundle-candidates.md（用户が選ぶ、作成はしない）
 *
 * セット価格 = 仕入合計 × 1.35（10 円単位切り上げ）。仕入が取れない商品はセットに入れない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitLLM } from '../night/window.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out'), DOCS = path.join(ROOT, 'docs/rakuten');
const [cmd = 'genres', ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : null).filter(Boolean));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash', WIN = args.window ?? env.LLM_WINDOW ?? '';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const J = (f) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
const K = (s) => String(s || '').toLowerCase().replace(/[\s_]/g, '-');
const csv = (f) => { const [h, ...ls] = fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean); const H = h.split(','); return ls.map((l) => { const c = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { c.push(cur); cur = ''; } else cur += ch; } c.push(cur); return Object.fromEntries(H.map((k, i) => [k, c[i] ?? ''])); }); };

function load() {
  const tier = J(path.join(OUT, 'price-tier.json')) || []; if (!tier.length) { console.error('先に price-tier.mjs'); process.exit(2); }
  const genreOf = new Map(); for (const r of csv(path.join(DOCS, 'publish-log.csv'))) if (r.platform_category_name) genreOf.set(r.spu, r.platform_category_name);
  const b2b = J(path.join(ROOT, 'tools/kjyf-b2b/out/b2b-full.json')); const bySku = new Map(); for (const g of b2b?.list || []) for (const s of g.skus || []) if (s.out_id && Number(s.price) > 0) bySku.set(K(s.out_id), Number(s.price));
  const keys = [...bySku.keys()]; const W = (spu) => { const k = K(spu); if (bySku.has(k)) return bySku.get(k); const c = keys.filter((x) => x.startsWith(k + '-') || k.startsWith(x + '-')); return c.length ? Math.min(...c.map((x) => bySku.get(x))) : null; };
  return tier.map((r) => ({ ...r, genre: genreOf.get(r.spu) || '', top: (genreOf.get(r.spu) || '').split(/>|»/)[0].trim(), wholesale: W(r.spu) }));
}

function genres() {
  const rows = load(); const by = {};
  for (const r of rows) { const g = r.top || '（未分類）'; by[g] ||= { A: 0, B: 0, C: 0, n: 0 }; by[g][r.tier]++; by[g].n++; }
  const ranked = Object.entries(by).map(([g, v]) => ({ g, ...v, score: v.A * 3 + v.B })).sort((a, b) => b.score - a.score);
  const top3 = ranked.filter((x) => x.g !== '（未分類）').slice(0, 3);
  fs.writeFileSync(path.join(DOCS, 'focus-genres.md'), [`# 専門店化：主力 3 ジャンル（${new Date().toISOString().slice(0, 10)}）`, '', 'スコア = A 档 ×3 + B 档。店舗トップ・店名の訴求・RPP・ポイント施策はこの 3 ジャンルに集中。他ジャンルは掲載のみ。', '', '| 順位 | 楽天ジャンル | 商品数 | A | B | C | スコア |', '|---|---|---|---|---|---|---|', ...ranked.map((x, i) => `| ${i + 1} | ${x.g} | ${x.n} | ${x.A} | ${x.B} | ${x.C} | ${x.score} |`), '', `## 決定（用户 2026-10-27「按比価データ選」）`, '', ...top3.map((x, i) => `${i + 1}. **${x.g}**（A ${x.A} / B ${x.B}）`), ''].join('\n'));
  fs.writeFileSync(path.join(OUT, 'focus-genres.json'), JSON.stringify(top3.map((x) => x.g)));
  log('focus genres:', top3.map((x) => x.g).join(' / '), '→ docs/rakuten/focus-genres.md');
}

async function chatJson(messages) {
  const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model: MODEL, messages, temperature: 0.5, max_tokens: 6000, response_format: { type: 'json_object' } }) });
  // 推論でトークンを使い切ると JSON が途中で切れる → 例外にせず {} を返し、呼び出し側で再試行
  const j = await r.json().catch(() => ({})); const t = j.choices?.[0]?.message?.content || '{}'; try { return JSON.parse(t); } catch { try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { log('JSON 解析失敗', j.choices?.[0]?.finish_reason, t.length); return {}; } }
}
const SYS = `あなたは楽天市場の店舗 MD。与えられた商品リスト（同じジャンル、当店が価格で勝てる商品）から、「一緒に使う・一緒に買う」補完関係のセット商品を提案する。
ルール：①1 セット = 2〜3 商品、同じ商品を複数セットに使ってよいが、各セットは異なる用途 ②組み合わせの理由は生活場面で具体的に（「引っ越し初日の収納セット」など）③セット名は日本語 30 字以内、楽天検索されそうな語を含める ④価格・効能・No.1 は書かない ⑤facts に無い機能を想像しない。
出力 JSON：{"sets":[{"name":"…","spus":["…","…"],"scene":"…","why":"…"}]}`;
async function propose() {
  const rows = load(); const focus = J(path.join(OUT, 'focus-genres.json')) || []; if (!focus.length) { console.error('先に genres'); process.exit(2); }
  const n = Number(args.n || 20); const sets = [];
  for (const g of focus) {
    const items = rows.filter((r) => r.top === g && (r.tier === 'A' || r.tier === 'B') && r.wholesale && r.stock >= 5);
    if (items.length < 2) { log('skip genre（候補不足）', g, items.length); continue; }
    if (!(await waitLLM(LLM, WIN, log))) { log('6kpro 窓口外 → 中断'); break; }
    const want = Math.ceil(n / focus.length);
    let res = {}; for (let k = 0; k < 3 && !(res.sets || []).length; k++) res = await chatJson([{ role: 'system', content: SYS }, { role: 'user', content: `ジャンル:${g}\n${want} セット提案。\n商品リスト:\n${items.map((r) => `- SPU ${r.spu}: ${r.name}`).join('\n')}` }]);
    for (const s of res.sets || []) {
      const parts = (s.spus || []).map((spu) => items.find((r) => r.spu === spu)).filter(Boolean); if (parts.length < 2) continue;
      const cost = parts.reduce((a, r) => a + r.wholesale, 0), cur = parts.reduce((a, r) => a + r.our, 0);
      sets.push({ genre: g, name: s.name, scene: s.scene, why: s.why, parts: parts.map((r) => ({ spu: r.spu, name: r.name, our: r.our, wholesale: r.wholesale })), cost, price: Math.ceil(cost * 1.35 / 10) * 10, sumCurrent: cur });
    }
    log('genre', g, 'sets', sets.filter((s) => s.genre === g).length);
  }
  fs.writeFileSync(path.join(OUT, 'bundle-candidates.json'), JSON.stringify(sets, null, 1));
  fs.writeFileSync(path.join(DOCS, 'bundle-candidates.md'), [`# セット商品 候補（${new Date().toISOString().slice(0, 10)}、${sets.length} 組）`, '', 'セット価格 = 仕入合計 ×1.35。用户が採用するセットに ○ を付ける → 斑馬草稿箱にセット商品として登録（画像は構成商品の 1 枚目を横並び、セット名・説明は本表から）。', '', '| # | ジャンル | セット名 | 構成（SPU） | 仕入合計 | 単品合計（現行） | セット価格 | 場面 | 理由 |', '|---|---|---|---|---|---|---|---|---|', ...sets.map((s, i) => `| ${i + 1} | ${s.genre} | ${s.name} | ${s.parts.map((p) => `${p.spu}（${String(p.name).slice(0, 14)}）`).join('＋')} | ¥${s.cost} | ¥${s.sumCurrent} | **¥${s.price}** | ${s.scene} | ${s.why} |`), ''].join('\n'));
  log('→ docs/rakuten/bundle-candidates.md', sets.length);
}

const run = { genres, propose }[cmd]; if (!run) { console.error('usage: bundles.mjs genres|propose'); process.exit(2); }
Promise.resolve().then(run).catch((e) => { console.error(e); process.exit(1); });
