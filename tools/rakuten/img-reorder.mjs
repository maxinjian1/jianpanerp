#!/usr/bin/env node
/**
 * 楽天：商品画像の並び替え（1 枚目＝検索・スマホ一覧に出る画像を差し替える）2026-11-20
 *   node tools/rakuten/img-reorder.mjs plan.json [--apply]    plan = { "<管理番号>": <新しい 1 枚目の現番号(1始まり)> , ... }
 *   node tools/rakuten/img-reorder.mjs --rollback              out/img-audit/reorder-backup.json の並びに戻す
 * 新しい並び = [選んだ画像, 元の 1 枚目, 残り（元の順）]。変更前の images は reorder-backup.json に保存。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out/img-audit');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const AUTH = 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, url, body) {
  for (let t = 1; ; t++) {
    const r = await fetch('https://api.rms.rakuten.co.jp/es/2.0' + url, { method, headers: { Authorization: AUTH, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if ((r.status === 429 || r.status === 503) && t < 8) { await sleep(3000 * t); continue; }
    const txt = await r.text(); if (!r.ok) throw new Error(`${method} ${url} ${r.status} ${txt.slice(0, 500)}`); return txt ? JSON.parse(txt) : {};
  }
}
const BK = path.join(OUT, 'reorder-backup.json');
const backup = fs.existsSync(BK) ? JSON.parse(fs.readFileSync(BK, 'utf8')) : {};
const enc = encodeURIComponent;
if (process.argv[2] === '--rollback') {
  for (const [mn, images] of Object.entries(backup)) { await api('PATCH', `/items/manage-numbers/${enc(mn)}`, { images }); console.log('rolled back', mn); await sleep(600); }
  process.exit(0);
}
const plan = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const apply = process.argv.includes('--apply');
for (const [mn, pick] of Object.entries(plan)) {
  const it = await api('GET', `/items/manage-numbers/${enc(mn)}`);
  const imgs = it.images || [];
  if (!imgs[pick - 1]) { console.log('SKIP', mn, 'no image', pick, '/', imgs.length); continue; }
  const order = [pick - 1, 0, ...imgs.map((_, i) => i).filter((i) => i !== pick - 1 && i !== 0)];
  const next = order.map((i) => imgs[i]);
  console.log(apply ? 'APPLY' : 'PLAN ', mn, `#${pick} → 1`, next[0].location);
  if (!apply) continue;
  if (!backup[mn]) { backup[mn] = imgs; fs.writeFileSync(BK, JSON.stringify(backup, null, 1)); }
  await api('PATCH', `/items/manage-numbers/${enc(mn)}`, { images: next });
  await sleep(700);
}
