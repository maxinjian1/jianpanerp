/** rw-desc.py の画像を楽天の 9 商品に反映（PATCH：画像リストと説明文だけ。バリエーション・在庫は触らない）。
 *   node tools/sourcing-1688/rw-desc-apply.mjs [--only rw1688-16]
 * 主画像 = c-wNN-m（文字入り）、元の写真（m の素材）は外し、末尾の旧「商品情報」を c-wNN-s に置換。
 * 説明文（PC/スマホ/PC販売説明文）= POINT 画像 → カラー一覧 → 商品情報 の 3 枚。変更前は out/rakuten-pj/backup-<mn>.json に保存。
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
const SRC = { 'rw1688-04': '02' }; // 主画像の素材（既定 01）
const spec = JSON.parse(fs.readFileSync(path.join(B, 'rw-spec.json'), 'utf8'));
for (const p of spec.products.filter((x) => !only || x.mn === only)) {
  const nn = p.mn.slice(-2); const cab = (s) => `/rw1688/c-w${nn}-${s}.jpg`; const full = (s) => `https://image.rakuten.co.jp/anet-fashion/cabinet${cab(s)}`;
  const cur = await api('GET', API + p.mn);
  fs.writeFileSync(path.join(B, `out/rakuten-pj/backup-${p.mn}.json`), JSON.stringify(cur, null, 1));
  const src = SRC[p.mn] ?? '01';
  const rest = cur.images.filter((i) => !i.location.endsWith(`-${src}.jpg`) && !/-info\.jpg$|-[mps c]\.jpg$/.test(i.location));
  const images = [{ type: 'CABINET', location: cab('m'), alt: p.title.slice(0, 120) }, ...rest, { type: 'CABINET', location: cab('s'), alt: '商品情報' }].slice(0, 20);
  const html = ['p', 'c', 's'].map((s) => `<img src="${full(s)}" width="100%" alt="${s === 'p' ? p.tagline : s === 'c' ? 'カラー・タイプ' : '商品情報'}"><br>`).join('');
  await api('PATCH', API + p.mn, { images, productDescription: { pc: html, sp: html }, salesDescription: html });
  const got = await api('GET', API + p.mn);
  console.log('ok', p.mn, 'images', got.images.length, got.images[0].location, 'desc', got.productDescription.pc.length);
  await sleep(1000);
}
