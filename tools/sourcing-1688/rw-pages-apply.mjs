/** rw-pages.py の正方形画像（c-xNN-MM）を楽天 9 商品に反映。PATCH で images（先頭 20 枚）と説明文（全ページ）だけ変える。
 *   node tools/sourcing-1688/rw-pages-apply.mjs [--only rw1688-16]
 * 変更前の商品データは out/rakuten-pj/backup2-<mn>.json。在庫・SKU・価格は触らない。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd(); const B = path.join(ROOT, 'tools/sourcing-1688');
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const AUTH = 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const API = 'https://api.rms.rakuten.co.jp/es/2.0/items/manage-numbers/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, url, body) {
  for (let t = 1; ; t++) {
    const r = await fetch(url, { method, headers: { Authorization: AUTH, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text();
    if ((r.status === 503 || r.status === 429) && t < 8) { await sleep(3000 * t); continue; }
    if (!r.ok) throw new Error(`${method} ${r.status} ${txt.slice(0, 500)}`);
    return txt ? JSON.parse(txt) : {};
  }
}
const urls = JSON.parse(fs.readFileSync(path.join(B, 'out/rakuten-pj/cabinet-urls3.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(B, 'rw-spec.json'), 'utf8'));
for (const p of spec.products.filter((x) => !only || x.mn === only)) {
  const nn = p.mn.slice(-2);
  const mine = urls.filter((o) => o.name.toLowerCase().startsWith(`c-x${nn}-`) && o.url).sort((a, b) => a.name.localeCompare(b.name));
  if (mine.length < 15) throw new Error(`${p.mn}: 画像 ${mine.length} 枚しかない`);
  const cur = await api('GET', API + p.mn);
  fs.writeFileSync(path.join(B, `out/rakuten-pj/backup2-${p.mn}.json`), JSON.stringify(cur, null, 1));
  const images = mine.slice(0, 20).map((o, i) => ({ type: 'CABINET', location: o.url.replace(/^.*\/cabinet/, ''), alt: i === 0 ? p.title.slice(0, 120) : p.tagline.slice(0, 60) }));
  const html = mine.map((o) => `<img src="${o.url}" width="100%" alt="">`).join('<br>');
  await api('PATCH', API + p.mn, { images, productDescription: { pc: html, sp: html }, salesDescription: html });
  const got = await api('GET', API + p.mn);
  console.log('ok', p.mn, 'gallery', got.images.length, 'desc imgs', (got.productDescription.pc.match(/<img/g) || []).length);
  await sleep(1000);
}
