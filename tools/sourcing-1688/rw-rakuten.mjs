/** 1688 ルームウェア 9 款を楽天に登録（RMS 商品 API 2.0 PUT + 在庫 API 2.1）。
 *   node tools/sourcing-1688/rw-rakuten.mjs [--dry] [--only rw1688-01] [--stock 0] [--stock-only]
 *   ※ 初回登録後は必ず --stock-only で在庫だけ変える（PUT すると rw-desc-apply.mjs の文字入り主画像・画像説明が消える）
 * 前提：rw-images.py → R-Cabinet フォルダ rw1688 に c-wNN-MM.jpg（cabinet-urls.json）。
 * 公開（hideItem=false）・在庫は --stock（既定 0＝入荷待ち。到着後 --stock で数量を入れ直す）。
 * 既存の管理番号は上書き（PUT は全置換）。結果 out/rakuten-pj/rakuten-result.json
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const B = path.join(ROOT, 'tools/sourcing-1688');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, A) => a.startsWith('--') ? [a.slice(2), A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : true] : null).filter(Boolean));
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const AUTH = 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const spec = JSON.parse(fs.readFileSync(path.join(B, 'rw-spec.json'), 'utf8'));
const urls = JSON.parse(fs.readFileSync(path.join(B, 'out/rakuten-pj/cabinet-urls.json'), 'utf8'));
const loc = (mn, nn) => { const n = `c-w${mn.slice(-2)}-${nn}.jpg`; const u = urls.find((o) => o.name.toLowerCase() === n); if (!u?.url) throw new Error('no cabinet url ' + n); return u.url.replace(/^.*\/cabinet/, ''); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, url, body) {
  for (let t = 1; ; t++) {
    const r = await fetch(url, { method, headers: { Authorization: AUTH, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text();
    if ((r.status === 503 || r.status === 429) && t < 8) { await sleep(3000 * t); continue; }
    if (!r.ok) throw new Error(`${method} ${url.split('/es/')[1]} ${r.status} ${txt.slice(0, 600)}`);
    return txt ? JSON.parse(txt) : {};
  }
}

// variants 記法 → [{ sel: {key: value}, rep, price, img, size }]
function expand(p) {
  if (Array.isArray(p.variants)) return p.variants.map((x) => ({ vals: x.v, rep: x.color, price: x.price, img: x.img }));
  const parts = Object.fromEntries(p.variants.split('|').map((s) => { const i = s.indexOf(':'); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)]; }));
  const out = [];
  if (parts.TC) {
    for (const e of parts.TC.split(';')) { const [k, rest] = e.split('='); const [price, rep, img, sizes] = rest.split(':'); for (const s of sizes.split(',')) out.push({ vals: [k, s], rep, price: Number(price), img: Number(img) }); }
    return out;
  }
  const sizes = parts.SIZES.split(',');
  const types = parts.TYPES.split(',').map((t) => { const [n, pr] = t.split('='); return { n, pr: Number(pr) }; });
  const colors = parts.COLORS ? parts.COLORS.split(',').map((c) => { const [n, r] = c.split('='); const [rep, di, ri] = r.split(':'); return { n, rep, di: Number(di), ri: ri === undefined ? Number(di) : Number(ri) }; }) : [{ n: parts.COLOR, rep: parts.COLOR, di: null, ri: null, single: true }];
  for (const c of colors) for (const t of types) for (const s of sizes) {
    const vals = []; if (!c.single) vals.push(c.n); if (!parts.NOTYPE) vals.push(t.n); vals.push(s);
    out.push({ vals, rep: c.rep, price: t.pr, img: /ガウン/.test(t.n) ? c.ri : c.di, colorName: c.n });
  }
  return out;
}

const KEY = { 'カラー': 'color', 'タイプ': 'type', 'サイズ': 'size', 'タイプ・カラー': 'typecolor' };
function build(p) {
  const vs = expand(p);
  const imgsList = p.imgs.map((_, i) => ({ type: 'CABINET', location: loc(p.mn, String(i + 1).padStart(2, '0')), alt: p.title.slice(0, 120) }));
  imgsList.push({ type: 'CABINET', location: loc(p.mn, 'info'), alt: '商品情報' });
  const rawToProcessed = (raw) => { const i = p.imgs.findIndex(([r]) => r === raw); return i >= 0 ? imgsList[i].location : null; };
  const selectors = p.selectors.map((name) => ({ key: KEY[name], displayName: name, values: [...new Set(vs.map((v) => v.vals[p.selectors.indexOf(name)]))].map((d) => ({ displayValue: d })) }));
  const variants = {};
  vs.forEach((v, i) => {
    const id = `${p.mn}-${String(i + 1).padStart(2, '0')}`;
    const sel = Object.fromEntries(p.selectors.map((name, k) => [KEY[name], v.vals[k]]));
    const colorDisp = sel.color ?? (sel.typecolor ? sel.typecolor.split('/')[1] : v.colorName ?? v.rep);
    const im = v.img != null ? rawToProcessed(v.img) : null;
    variants[id] = {
      selectorValues: sel,
      ...(im ? { images: [{ type: 'CABINET', location: im }] } : {}),
      restockOnCancel: true, backOrderFlag: false, articleNumber: { exemptionReason: 5 },
      standardPrice: String(v.price), shipping: { postageIncluded: true, okihaiSetting: true }, orderQuantityLimit: 5,
      merchantDefinedSkuId: id, hidden: false, features: { restockNotification: true, noshi: false },
      attributes: [
        { name: 'カラー', values: [colorDisp] }, { name: '代表カラー', values: [v.rep] }, { name: 'ブランド名', values: ['-'] }, { name: 'メーカー型番', values: ['-'] },
        { name: '素材（生地・毛糸）', values: [p.material.slice(0, 50)] }, { name: 'サイズ（S/M/L）', values: [v.vals[v.vals.length - 1]] }, { name: '原産国／製造国', values: ['中国'] },
      ],
    };
  });
  const html = `<p>${p.tagline}</p>` + p.points.map((x) => `<p>・${x}</p>`).join('') +
    `<p><b>【素材】</b><br>${p.material}</p><p><b>【セット内容】</b><br>${p.set}</p><p><b>【サイズ】</b><br>${p.sizeNote}</p>` +
    `<p><b>【お手入れ】</b><br>洗濯ネットに入れて手洗い、または弱水流での洗濯をおすすめします。陰干ししてください。</p>` +
    `<p><b>【ご注意】</b><br>モニターの環境により、実物と色味が異なって見える場合があります。海外製品のため、縫製やサイズに多少の個体差がございます。</p>`;
  return {
    itemNumber: p.mn, itemType: 'NORMAL', title: p.title, tagline: p.tagline,
    productDescription: { pc: html, sp: html }, salesDescription: html,
    images: imgsList, genreId: String(p.genre), hideItem: false, unlimitedInventoryFlag: false,
    features: { searchVisibility: 'ALWAYS_VISIBLE', shopContact: true, review: 'SHOP_SETTING', displayManufacturerContents: true, displayNormalCartButton: true, displaySubscriptionCartButton: false, inventoryDisplay: 'DISPLAY_ABSOLUTE_STOCK_COUNT', socialGiftFlag: false },
    payment: { taxIncluded: true, cashOnDeliveryFeeIncluded: false },
    variantSelectors: selectors, variants,
  };
}

const res = [];
for (const p of spec.products.filter((x) => !args.only || x.mn === args.only)) {
  const item = build(p);
  fs.writeFileSync(path.join(B, `out/rakuten-pj/item-${p.mn}.json`), JSON.stringify(item, null, 1));
  if (args.dry) { console.log(p.mn, 'variants', Object.keys(item.variants).length, 'images', item.images.length); continue; }
  try {
    if (!args['stock-only']) await api('PUT', `https://api.rms.rakuten.co.jp/es/2.0/items/manage-numbers/${p.mn}`, item); // 在庫だけ変える時は --stock-only（PUT は全置換なので、rw-desc-apply の画像・説明文を消してしまう）
    const qty = Number(args.stock ?? 0);
    for (const vid of Object.keys(item.variants)) { await api('PUT', `https://api.rms.rakuten.co.jp/es/2.1/inventories/manage-numbers/${p.mn}/variants/${vid}`, { mode: 'ABSOLUTE', quantity: qty }); await sleep(1100); }
    const got = await api('GET', `https://api.rms.rakuten.co.jp/es/2.0/items/manage-numbers/${p.mn}`);
    res.push({ mn: p.mn, ok: true, variants: Object.keys(got.variants || {}).length, hide: got.hideItem, url: `https://item.rakuten.co.jp/anet-fashion/${p.mn}/` });
    console.log('ok', p.mn, Object.keys(got.variants || {}).length, 'variants', 'hide', got.hideItem);
  } catch (e) { res.push({ mn: p.mn, ok: false, err: e.message }); console.log('NG', p.mn, e.message); }
  await sleep(1000);
}
if (!args.dry) fs.writeFileSync(path.join(B, 'out/rakuten-pj/rakuten-result.json'), JSON.stringify(res, null, 1));
