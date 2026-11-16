/** ベビー 30 選を楽天に登録（RMS 商品 API 2.0 PUT + 在庫 API 2.1）。
 *   node tools/sourcing-1688/baby/rakuten.mjs [--dry] [--only baby-01] [--stock 0] [--stock-only]
 * 前提：spec.py → spec.json、render.py → made.json、R-Cabinet フォルダ baby2026（out/baby/cabinet-urls.json）。
 * 公開（hideItem=false）・在庫は --stock（既定 0＝入荷待ち）。既存管理番号は上書き（PUT は全置換）。結果 out/baby/rakuten-result.json
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const B = path.join(ROOT, 'tools/sourcing-1688/baby'); const O = path.join(ROOT, 'tools/sourcing-1688/out/baby');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, A) => a.startsWith('--') ? [a.slice(2), A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : true] : null).filter(Boolean));
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const AUTH = 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const spec = JSON.parse(fs.readFileSync(path.join(B, 'spec.json'), 'utf8')).products;
const made = JSON.parse(fs.readFileSync(path.join(O, 'made.json'), 'utf8'));
const urls = JSON.parse(fs.readFileSync(path.join(O, 'cabinet-urls.json'), 'utf8'));
const loc = (file) => { const n = ('b-' + file).toLowerCase(); const u = urls.find((o) => (o.name || '').toLowerCase() === n); if (!u?.url) throw new Error('no cabinet url ' + n); return u.url.replace(/^.*\/cabinet/, ''); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, url, body) {
  for (let t = 1; ; t++) {
    const r = await fetch(url, { method, headers: { Authorization: AUTH, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text();
    if ((r.status === 503 || r.status === 429) && t < 8) { await sleep(3000 * t); continue; }
    if (!r.ok) throw new Error(`${method} ${url.split('/es/')[1]} ${r.status} ${txt.slice(0, 900)}`);
    return txt ? JSON.parse(txt) : {};
  }
}
const GA = JSON.parse(fs.readFileSync(path.join(O, 'genre-attrs.json'), 'utf8'));
const mand = (g) => ((GA[g].genre?.attributes || GA[g].attributes) || []).filter((a) => a.properties?.rmsMandatoryFlg).map((a) => a.nameJa);
const REP = [[/ピンク|ピーチ/, 'ピンク'], [/グレー/, 'グレー'], [/ブラック/, 'ブラック'], [/ホワイト|アイボリー|クリーム|しろくま/, 'ホワイト'], [/ベージュ|モカ|カーキ/, 'ベージュ'], [/ブラウン/, 'ブラウン'], [/ブルー|ネイビー/, 'ブルー'], [/グリーン/, 'グリーン'], [/パープル|ラベンダー/, 'パープル'], [/イエロー/, 'イエロー']];
const rep = (t) => (REP.find(([r]) => r.test(t)) || [0, 'マルチカラー'])[1];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function build(p) {
  const n = p.mn.slice(-2); const ph = made[p.mn];
  const images = [...ph.map((o) => ({ type: 'CABINET', location: loc(o.file), alt: p.title.slice(0, 100) })),
    { type: 'CABINET', location: loc(`b${n}-pt.jpg`), alt: 'ポイント' }, { type: 'CABINET', location: loc(`b${n}-info.jpg`), alt: '商品情報' }].slice(0, 20);
  const k = p.sel_names.length; const keys = p.sel_names.map((_, i) => 'opt' + (i + 1));
  const selectors = p.sel_names.map((name, i) => ({ key: keys[i], displayName: name, values: [...new Set(p.v.map((v) => v[i]))].map((d) => ({ displayValue: d })) }));
  const variants = {};
  p.v.forEach((v, i) => {
    const id = `${p.mn}-${String(i + 1).padStart(2, '0')}`; const img = v[k + 1]; const price = v[k + 2];
    const f = img && ph.find((o) => o.src === img);
    variants[id] = {
      selectorValues: Object.fromEntries(keys.map((kk, j) => [kk, v[j]])),
      ...(f ? { images: [{ type: 'CABINET', location: loc(f.file) }] } : {}),
      restockOnCancel: true, backOrderFlag: false, articleNumber: { exemptionReason: 5 },
      standardPrice: String(price), shipping: { postageIncluded: true, okihaiSetting: true }, orderQuantityLimit: 5,
      merchantDefinedSkuId: id, hidden: false, features: { restockNotification: true, noshi: false },
      attributes: mand(p.genre).map((nm) => ({ name: nm, values: [({ 'ブランド名': '-', 'メーカー型番': '-', '原産国／製造国': '中国', '代表カラー': rep(v.slice(0, k).join(' ')), 'カラー': (v.slice(0, k).find((x) => rep(x) !== 'マルチカラー') || v[0]).slice(0, 30), '素材（生地・毛糸）': p.material.slice(0, 50) })[nm] ?? '-'] })),
    };
  });
  const html = `<p>${esc(p.tagline)}</p>` + p.points.map((x) => `<p>・${esc(x)}</p>`).join('') +
    `<p><b>【素材】</b><br>${esc(p.material)}</p><p><b>【セット内容】</b><br>${esc(p.set)}</p><p><b>【サイズ】</b><br>${esc(p.size)}</p>` +
    (p.caution ? `<p><b>【ご注意】</b><br>${esc(p.caution)}</p>` : '') +
    `<p><b>【その他】</b><br>海外製品のため、縫製や寸法に多少の個体差があります。モニターの環境により、実物と色味が異なって見える場合があります。</p>`;
  return {
    itemNumber: p.mn, itemType: 'NORMAL', title: p.title.slice(0, 127), tagline: p.tagline.slice(0, 87),
    productDescription: { pc: html, sp: html }, salesDescription: html,
    images, genreId: String(p.genre), hideItem: false, unlimitedInventoryFlag: false,
    features: { searchVisibility: 'ALWAYS_VISIBLE', shopContact: true, review: 'SHOP_SETTING', displayManufacturerContents: true, displayNormalCartButton: true, displaySubscriptionCartButton: false, inventoryDisplay: 'DISPLAY_ABSOLUTE_STOCK_COUNT', socialGiftFlag: false },
    payment: { taxIncluded: true, cashOnDeliveryFeeIncluded: false },
    variantSelectors: selectors, variants,
  };
}

const res = [];
for (const p of spec.filter((x) => !args.only || String(args.only).split(',').includes(x.mn))) {
  const item = build(p);
  fs.writeFileSync(path.join(O, `item-${p.mn}.json`), JSON.stringify(item, null, 1));
  if (args.dry) { console.log(p.mn, 'variants', Object.keys(item.variants).length, 'images', item.images.length, item.title.length); continue; }
  try {
    if (!args['stock-only']) await api('PUT', `https://api.rms.rakuten.co.jp/es/2.0/items/manage-numbers/${p.mn}`, item);
    const qty = Number(args.stock ?? 0);
    for (const vid of Object.keys(item.variants)) { await api('PUT', `https://api.rms.rakuten.co.jp/es/2.1/inventories/manage-numbers/${p.mn}/variants/${vid}`, { mode: 'ABSOLUTE', quantity: qty }); await sleep(700); }
    const got = await api('GET', `https://api.rms.rakuten.co.jp/es/2.0/items/manage-numbers/${p.mn}`);
    res.push({ mn: p.mn, ok: true, variants: Object.keys(got.variants || {}).length, hide: got.hideItem, url: `https://item.rakuten.co.jp/anet-fashion/${p.mn}/` });
    console.log('ok', p.mn, Object.keys(got.variants || {}).length, 'variants');
  } catch (e) { res.push({ mn: p.mn, ok: false, err: e.message }); console.log('NG', p.mn, e.message.slice(0, 700)); }
  await sleep(800);
}
if (!args.dry) { const f = path.join(O, 'rakuten-result.json'); const prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : []; const m = Object.fromEntries(prev.map((r) => [r.mn, r])); res.forEach((r) => (m[r.mn] = r)); fs.writeFileSync(f, JSON.stringify(Object.values(m), null, 1)); }
