#!/usr/bin/env node
/** reps-asin.json の ASIN の店頭画像の並びを取得 → out/rebrand/scene/front-imgs.json（{asin:[id,...]}）。2.5 秒間隔。2026-11-20 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const S = path.join(ROOT, 'tools/amazon-listing/out/rebrand/scene');
const reps = JSON.parse(fs.readFileSync(path.join(S, 'reps-asin.json'), 'utf8'));
const F = path.join(S, 'front-imgs.json');
const out = fs.existsSync(F) ? JSON.parse(fs.readFileSync(F, 'utf8')) : {};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
for (const asin of [...new Set(Object.values(reps))]) {
  if (out[asin] && process.argv[2] !== '--force') continue;
  const h = await (await fetch(`https://www.amazon.co.jp/dp/${asin}?th=1&psc=1`, { headers: { 'user-agent': UA, 'accept-language': 'ja-JP,ja;q=0.9' } })).text();
  const m = h.match(/'colorImages':\s*\{\s*'initial':\s*A\.\$\.parseJSON\('(\[.*?\])'\)/);
  out[asin] = m ? JSON.parse(m[1].replace(/\'/g, "'")).map((x) => (x.hiRes || x.large || '').split('/').pop().replace(/\._[^.]+_\./, '.').replace('.jpg', '')) : (/captcha/i.test(h) ? ['CAPTCHA'] : ['NONE']);
  fs.writeFileSync(F, JSON.stringify(out, null, 1));
  if (out[asin][0] === 'CAPTCHA') { console.log('captcha → stop'); break; }
  await new Promise((r) => setTimeout(r, 2500));
}
console.log('asins', Object.keys(out).length, 'counts', JSON.stringify(Object.values(out).reduce((a, v) => (a[v.length] = (a[v.length] || 0) + 1, a), {})));
