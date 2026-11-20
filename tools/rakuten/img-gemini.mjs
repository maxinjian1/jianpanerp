#!/usr/bin/env node
/**
 * Gemini で文字を消した 1 枚目画像を楽天商品の先頭に入れる（2026-11-20）
 *   node tools/rakuten/img-gemini.mjs <管理番号> <gemini の画像(png/jpg)>
 * 正方形にトリム→1000px JPEG（out/img-audit/gm/up/<mn>.jpg）→ R-Cabinet anet2025-02 に上げる → images の先頭に追加（元の画像は全部その後ろに残す）。
 * 変更前の images は out/img-audit/gemini-backup.json（img-reorder.mjs --rollback と同形式、手で戻せる）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out/img-audit');
const [mn, src] = process.argv.slice(2);
if (!mn || !src) { console.error('usage: img-gemini.mjs <mn> <image>'); process.exit(2); }
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const AUTH = 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
async function api(method, url, body) {
  const r = await fetch('https://api.rms.rakuten.co.jp/es/2.0' + url, { method, headers: { Authorization: AUTH, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); if (!r.ok) throw new Error(`${method} ${url} ${r.status} ${t.slice(0, 400)}`); return t ? JSON.parse(t) : {};
}
const up = path.join(OUT, 'gm/up'); fs.mkdirSync(up, { recursive: true });
const jpg = path.join(up, mn.toLowerCase() + '.jpg');
const py = path.join(ROOT, 'apps/ai-service/venv/Scripts/python.exe');
execFileSync(py, ['-c', `
import sys
from PIL import Image
im=Image.open(sys.argv[1]).convert('RGB');w,h=im.size;s=min(w,h)
im=im.crop(((w-s)//2,(h-s)//2,(w-s)//2+s,(h-s)//2+s)).resize((1000,1000),Image.LANCZOS)
im.save(sys.argv[2],quality=92)`, src, jpg]);
const res = path.join(OUT, 'gm', mn.toLowerCase() + '-cab.json');
execFileSync('node', [path.join(ROOT, 'tools/rakuten/cabinet.mjs'), 'upload', '--folder', 'anet2025-02', '--out', res, jpg], { stdio: 'inherit' });
const url = JSON.parse(fs.readFileSync(res, 'utf8'))[0].url;
if (!url) throw new Error('no cabinet url');
const loc = url.replace(/^.*\/cabinet/, '');
const it = await api('GET', `/items/manage-numbers/${encodeURIComponent(mn)}`);
const imgs = it.images || [];
const BK = path.join(OUT, 'gemini-backup.json');
const bk = fs.existsSync(BK) ? JSON.parse(fs.readFileSync(BK, 'utf8')) : {};
if (!bk[mn]) { bk[mn] = imgs; fs.writeFileSync(BK, JSON.stringify(bk, null, 1)); }
const rest = imgs.filter((i) => i.location !== loc);
const next = [{ type: 'CABINET', location: loc, alt: (imgs[0]?.alt || it.title || '').slice(0, 100) }, ...rest].slice(0, 20);
await api('PATCH', `/items/manage-numbers/${encodeURIComponent(mn)}`, { images: next });
console.log('ok', mn, loc, 'images', next.length, rest.length + 1 > 20 ? '（20 枚超過で末尾を削除）' : '');
