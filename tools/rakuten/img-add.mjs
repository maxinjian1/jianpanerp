#!/usr/bin/env node
/**
 * 追加画像（シーン・訴求）を楽天商品に入れる（2026-11-20）
 *   node tools/rakuten/img-add.mjs <管理番号> a.jpg b.jpg …   → R-Cabinet anet2025-02 に上げ、1 枚目の直後に挿入（既存画像は順番そのまま後ろへ、20 枚上限）
 * ファイル名はそのまま R-Cabinet 名になる（親の親ディレクトリ名-ファイル名、20 字以内に）。変更前は out/img-audit/add-backup.json。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out/img-audit');
const [mn, ...files] = process.argv.slice(2);
if (!mn || !files.length) { console.error('usage: img-add.mjs <mn> files…'); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const AUTH = 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, url, body) {
  for (let t = 1; ; t++) {
    const r = await fetch('https://api.rms.rakuten.co.jp/es/2.0' + url, { method, headers: { Authorization: AUTH, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const x = await r.text(); if ((r.status === 429 || r.status === 503) && t < 6) { await sleep(3000 * t); continue; }
    if (!r.ok) throw new Error(`${method} ${url} ${r.status} ${x.slice(0, 400)}`); return x ? JSON.parse(x) : {};
  }
}
const res = path.join(OUT, 'extra', `${mn}-cab.json`);
execFileSync('node', [path.join(ROOT, 'tools/rakuten/cabinet.mjs'), 'upload', '--folder', 'anet2025-02', '--out', res, ...files.map((f) => path.resolve(f))], { stdio: 'inherit' });
const locs = JSON.parse(fs.readFileSync(res, 'utf8')).map((o) => { if (!o.url) throw new Error('no url ' + o.src); return o.url.replace(/^.*\/cabinet/, ''); });
const it = await api('GET', `/items/manage-numbers/${encodeURIComponent(mn)}`);
const imgs = it.images || [];
const BK = path.join(OUT, 'add-backup.json');
const bk = fs.existsSync(BK) ? JSON.parse(fs.readFileSync(BK, 'utf8')) : {};
if (!bk[mn]) { bk[mn] = imgs; fs.writeFileSync(BK, JSON.stringify(bk, null, 1)); }
const alt = (imgs[0]?.alt || it.title || '').slice(0, 100);
const rest = imgs.filter((i) => !locs.includes(i.location));
const next = [rest[0], ...locs.map((location) => ({ type: 'CABINET', location, alt })), ...rest.slice(1)].filter(Boolean).slice(0, 20);
await sleep(1000);
await api('PATCH', `/items/manage-numbers/${encodeURIComponent(mn)}`, { images: next });
console.log('ok', mn, 'added', locs.length, 'total', next.length, imgs.length + locs.length > 20 ? '（20 枚超過分は末尾を削除）' : '');
