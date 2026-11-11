#!/usr/bin/env node
/**
 * SARADEMUNT → SALONCARE 切替（2026-11-11 用户決定）用：既存商品画像のうち旧ブランド表記が写っているものを 6kpro の視覚で探す。
 *
 *   node tools/amazon-listing/rebrand/scan-images.mjs [--limit N]
 *
 * 入力：in/category-report-2026-11-11/report.json（有効な SARADEMUNT SKU → ASIN）、out/opt/<ASIN>/current.json と images/NN.jpg（10-18 取得）
 * 出力：out/rebrand/image-scan.jsonl（画像 URL ごとに 1 行、再開可）。同じ URL は 1 回だけ見る。
 * 6kpro は 1 本ずつ順番に呼ぶ（並列なし）。停止中は 5 分おきに待つ。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const OPT = path.join(ROOT, 'tools/amazon-listing/out/opt');
const OUT = path.join(ROOT, 'tools/amazon-listing/out/rebrand'); fs.mkdirSync(OUT, { recursive: true });
const FILE = path.join(OUT, 'image-scan.jsonl');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : null).filter(Boolean));
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_VISION_MODEL || env.CN_LLM_MODEL || 'GLM-5.3-Flash';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const rep = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/amazon-listing/in/category-report-2026-11-11/report.json'), 'utf8'))['0_APPAREL-VEST.xlsm|テンプレート'];
const H = rep[4], iT = H.indexOf('amzn1.volt.ca.product_id_type'), iV = H.indexOf('amzn1.volt.ca.product_id_value');
const asins = [...new Set(rep.slice(6).filter((r) => r[0] === '有効' && /sarademunt|サラデマント/i.test(String(r[1])) && r[iT] === 'ASIN').map((r) => r[iV]))];

// URL → ローカルファイル（最初に見つかったもの）と、その画像を使っている ASIN
const imgs = new Map();
for (const a of asins) {
  const p = path.join(OPT, a, 'current.json'); if (!fs.existsSync(p)) continue;
  const c = JSON.parse(fs.readFileSync(p, 'utf8'));
  (c.images || []).forEach((u, i) => {
    if (/play-button|SX38/.test(u)) return;   // 動画サムネイル
    const f = path.join(OPT, a, 'images', `${String(i + 1).padStart(2, '0')}.jpg`); if (!fs.existsSync(f)) return;
    const e = imgs.get(u) ?? { url: u, file: f, pos: i + 1, asins: [] }; e.asins.push(a); imgs.set(u, e);
  });
}
const done = new Set(fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).url) : []);
let todo = [...imgs.values()].filter((e) => !done.has(e.url)); if (args.limit) todo = todo.slice(0, Number(args.limit));
log('ASIN', asins.length, 'unique images', imgs.size, 'done', done.size, 'todo', todo.length);

const SYS = `商品画像を 1 枚見て、画像の中に写っている文字とロゴを調べる。出力は JSON のみ：
{"hasText":true/false,"brand":"画像内に読めるブランド名・ロゴ・透かしの文字をそのまま（無ければ空文字）","sarademunt":true/false,"kind":"photo|text-card|size-chart|other","texts":"画像内の主な文字を 80 字以内で"}
sarademunt は「SARADEMUNT」「サラデマント」またはそれに近い綴りが、タグ・透かし・ロゴ・説明文字のどこかに読める場合だけ true。読めない・写っていないなら false。推測しない。`;
async function healthy() { try { return (await fetch(LLM.replace(/\/v1$/, '') + '/health', { signal: AbortSignal.timeout(8000) })).ok; } catch { return false; } }
async function ask(file) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', signal: AbortSignal.timeout(180000), headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) },
        body: JSON.stringify({ model: MODEL, temperature: 0.1, max_tokens: 3000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYS }, { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + fs.readFileSync(file).toString('base64') } }, { type: 'text', text: 'この画像を調べて JSON で答える。' }] }] }) });
      const c = (await r.json()).choices?.[0]?.message?.content;
      if (c) return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1));
    } catch (e) { log('retry', i + 1, String(e.message).slice(0, 80)); }
    while (!(await healthy())) { log('6kpro 停止中 → 5 分待つ'); await sleep(300000); }
    await sleep(8000);
  }
  return null;
}
let n = 0, hit = 0, fail = 0;
for (const e of todo) {
  const v = await ask(e.file);
  if (!v) { fail++; if (fail >= 20 && fail > n * 0.3) { log('失敗が多いので停止'); break; } continue; }
  fs.appendFileSync(FILE, JSON.stringify({ url: e.url, file: path.relative(ROOT, e.file).replace(/\\/g, '/'), pos: e.pos, asins: e.asins, ...v }) + '\n');
  n++; if (v.sarademunt) hit++;
  if (n % 25 === 0) log('scanned', n, '/', todo.length, 'sarademunt', hit, 'fail', fail);
}
log('done', n, 'sarademunt', hit, 'fail', fail, '→', path.relative(ROOT, FILE));
