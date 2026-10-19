#!/usr/bin/env node
/**
 * anetmc.com（Shopify vendor=ANET）全店 と kjyf B2B 全量の SKU 単位対比（読み取りのみ。何も書き込まない）。
 *   node tools/kjyf-b2b/sync.mjs fetch          # 先に B2B 最新化（out/b2b-full.json）
 *   node tools/kjyf-b2b/compare.mjs             # → out/compare.json（docs/anetmc-vs-b2b-对比.md はこれを元に書く）
 *   --view 2：下架一覧を B2B（view 2）で取る。既定は view 0（日文站。2026-10-19 から在售/下架の基準）。b2b-full.json も同じ view で fetch しておく。
 * 下架（on_shelves=2）一覧は匿名 search で取得（間隔 1.1 秒）。店面抽查は公開ページを GET するだけ（カート・決済は触らない）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'tools/kjyf-b2b/out');
const VIEW = (() => { const i = process.argv.indexOf('--view'); return i >= 0 ? Number(process.argv[i + 1]) : 0; })();
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const SHOP = env.SHOPIFY_STORE_DOMAIN, VER = env.SHOPIFY_API_VERSION || '2026-10', STORE = 'https://anetmc.com';
const MARKUP = Number(env.KJYF_MARKUP || 1.15);
const retail = (w) => Math.ceil((w * MARKUP) / 10) * 10;
const K = (x) => String(x ?? '').trim().toUpperCase().replace(/^0+(?=[A-Z])/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
// sync.mjs と同じ規則
const TEMPLATE_CODE = /(?:\s*[（(]?\s*(?<![A-Za-z0-9])(?:YB-05|[A-Z]{1,6}-\d{2}(?:-[A-Z]+)?|TEMU-\d{3,4}(?:-[A-Z])?|sg\d{3}(?:-[a-z])?|ny\d{3}|de\d{3}|zk\d{3}|sl\d{3})\s*[)）]?)+\s*$/;
const HOLD_RE = /W杯|ワールドカップ|世界杯|日本代表|FIFA|サッカー日本|オリンピック|五輪|ディズニー|Disney|サンリオ|Sanrio|キティ|Hello ?Kitty|ポケモン|Pokemon|ちいかわ|スヌーピー|ドラえもん|ミッキー|ジブリ|ナイキ|NIKE|アディダス|adidas|ルイ.?ヴィトン|LOUIS ?VUITTON|シャネル|CHANEL|グッチ|GUCCI|エルメス|HERMES|ロレックス|ダイソン|Dyson/i;
// 中国語残留：かなを含まない漢字タイトル、または日本語で使わない簡体字を含む
const SIMPLIFIED = /[这们个为对时说从买卖东车门马长发种类质码货运费产单价颜觉见气鞋袜饰贝备护肤妆宠电脑钟锅壶镜项链环级优岁层带]/; // 灯・装・机・号・宝など日本語でも使う字は除外
const zhTitle = (t) => (/[一-鿿]/.test(t) && !/[぀-ヿ]/.test(t)) || SIMPLIFIED.test(t);
const text = (h) => String(h ?? '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim();

async function b2b(pathname, body) {
  for (let i = 0; ; i++) {
    try { const r = await fetch('https://beehole.kuajingyifan.com' + pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const j = await r.json(); if (j.code !== 0) throw new Error(`${pathname} ${j.code} ${j.message}`); return j.data; }
    catch (e) { if (i >= 3) throw e; await sleep(3000 * (i + 1)); } finally { await sleep(1100); }
  }
}
let tk;
async function gql(query, variables = {}) {
  tk ??= (await (await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }) })).json()).access_token;
  for (let i = 0; ; i++) {
    const r = await fetch(`https://${SHOP}/admin/api/${VER}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': tk }, body: JSON.stringify({ query, variables }) });
    const j = await r.json().catch(() => ({ errors: [{ message: `http ${r.status}` }] }));
    if ((r.status === 429 || j.errors?.some((e) => e.extensions?.code === 'THROTTLED')) && i < 8) { await sleep(2000 * (i + 1)); continue; }
    if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400));
    if ((j.extensions?.cost?.throttleStatus?.currentlyAvailable ?? 1000) < 200) await sleep(3000);
    return j.data;
  }
}

// ── データ ──
const B = J(path.join(OUT, 'b2b-full.json'));
log('on sale (view', B.view ?? 2, ')', B.list.length, 'fetchedAt', B.fetchedAt); if ((B.view ?? 2) !== VIEW) log('警告: b2b-full.json の view', B.view ?? 2, '≠ --view', VIEW);
const off = []; for (let page = 1; ; page++) { const d = await b2b('/admin/product/2b/search', { viewId: VIEW, page, limit: 50, order_type: 'desc', on_shelves: 2 }); off.push(...d.list); if (!d.list.length || off.length >= d.total) break; }
log('B2B off shelf', off.length);
const S = []; let c = null;
for (;;) { const d = await gql(`query($c:String){ products(first:50, after:$c, query:"vendor:ANET"){ pageInfo{hasNextPage endCursor} nodes{ id handle title status vendor descriptionHtml mediaCount{count} variants(first:100){ nodes{ id sku price } } } } }`, { c }); S.push(...d.products.nodes.filter((p) => p.vendor === 'ANET')); if (!d.products.pageInfo.hasNextPage) break; c = d.products.pageInfo.endCursor; }
log('Shopify ANET', S.length);

// ── SKU 索引 ──
const onSku = new Map(); // K(out_id) → [{good_id, price, stock}]（B2B 重複出品は複数）
for (const g of B.list) for (const s of g.skus) if (s.out_id) { const k = K(s.out_id); if (!onSku.has(k)) onSku.set(k, []); onSku.get(k).push({ good_id: g.good_id, price: s.price, stock: s.stock_num | 0 }); }
const offSku = new Map(); for (const g of off) for (const s of g.skus ?? []) if (s.out_id) offSku.set(K(s.out_id), g.good_id);
const shopSkuAll = new Map(); for (const p of S) for (const v of p.variants.nodes) if (v.sku) { const k = K(v.sku); if (!shopSkuAll.has(k)) shopSkuAll.set(k, []); shopSkuAll.get(k).push(p); }
const goods = new Map(B.list.map((g) => [g.good_id, g]));

// ── 商品単位（sync.mjs plan と同じ多数決） ──
const matched = [], shopOnly = [];
for (const p of S) {
  const votes = new Map(); for (const v of p.variants.nodes) for (const h of onSku.get(K(v.sku)) ?? []) votes.set(h.good_id, (votes.get(h.good_id) ?? 0) + 1);
  if (!votes.size) { shopOnly.push(p); continue; }
  const top = Math.max(...votes.values()); const ties = [...votes].filter(([, n]) => n === top).map(([g]) => g).sort((a, b) => a - b);
  matched.push({ p, ties, good_id: ties[0] });
}
// B2B 重複出品（同じ SKU の別 good_id）が Shopify でも別商品になっている場合、同点の good を 1 対 1 に割り当てる
{ const taken = new Set(); for (const m of matched) { const free = m.ties.find((g) => !taken.has(g)); if (free != null) m.good_id = free; taken.add(m.good_id); } }
const usedGoods = new Set(matched.map((m) => m.good_id));
const b2bOnly = [], dup = [];
for (const g of B.list) { if (usedGoods.has(g.good_id)) continue; (g.skus.some((s) => shopSkuAll.has(K(s.out_id))) ? dup : b2bOnly).push(g); }

// 価格
const priceBad = []; let priceChecked = 0;
for (const p of S) for (const v of p.variants.nodes) {
  const hs = onSku.get(K(v.sku)); if (!hs) continue; priceChecked++;
  const exp = [...new Set(hs.map((h) => retail(h.price)))];
  if (!exp.includes(Number(v.price))) priceBad.push({ handle: p.handle, title: p.title, status: p.status, sku: v.sku, shopify: Number(v.price), expected: exp.join('/'), wholesale: [...new Set(hs.map((h) => h.price))].join('/') });
}
// 状態
const activeNotOnB2B = shopOnly.filter((p) => p.status === 'ACTIVE').map((p) => ({ p, why: p.variants.nodes.every((v) => !v.sku) ? 'SKU なし' : p.variants.nodes.some((v) => offSku.has(K(v.sku))) ? 'B2B 下架' : 'B2B に存在しない' }));
const dupOfActive = (p) => p.variants.nodes.every((v) => (shopSkuAll.get(K(v.sku)) ?? []).some((q) => q !== p && q.status === 'ACTIVE'));
const draftOnB2B = matched.filter((m) => m.p.status !== 'ACTIVE').map((m) => ({ ...m, why: HOLD_RE.test(m.p.title) ? 'IP（W杯等）で DRAFT' : dupOfActive(m.p) ? '重複出品で DRAFT（同 SKU が別 ACTIVE 商品にある）' : 'その他' }));
const shopOnlyDraft = shopOnly.filter((p) => p.status !== 'ACTIVE');
// 規格（SKU 集合差）
const specDiff = [];
for (const { p, good_id } of matched) {
  const g = goods.get(good_id); const gs = new Set(g.skus.map((s) => K(s.out_id)).filter(Boolean)); const ps = new Set(p.variants.nodes.map((v) => K(v.sku)));
  const onlyShop = [...ps].filter((k) => !gs.has(k)); const onlyB2B = [...gs].filter((k) => !ps.has(k));
  if (onlyShop.length || onlyB2B.length) specDiff.push({ handle: p.handle, title: p.title, status: p.status, good_id, onlyShop, onlyB2B, onlyB2BElsewhere: onlyB2B.filter((k) => shopSkuAll.has(k)) });
}
const shopSkuSet = new Set(shopSkuAll.keys());
const b2bSkuNotInShop = [...onSku.keys()].filter((k) => !shopSkuSet.has(k));
const shopSkuNotInB2B = [...shopSkuSet].filter((k) => !onSku.has(k));
const multiShopSku = [...shopSkuAll].filter(([, ps]) => ps.length > 1).map(([k, ps]) => ({ sku: k, products: ps.map((p) => `${p.status}:${p.handle}`) }));
// Shopify 側の重複出品：SKU を共有する商品のグループ（union-find）
const par = new Map(S.map((p) => [p.id, p.id])); const find = (x) => (par.get(x) === x ? x : (par.set(x, find(par.get(x))), par.get(x)));
for (const [, ps] of shopSkuAll) for (const q of ps.slice(1)) par.set(find(q.id), find(ps[0].id));
const groups = new Map(); for (const p of S) { const r = find(p.id); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(p); }
const dupGroups = [...groups.values()].filter((g) => g.length > 1).map((g) => g.map((p) => ({ handle: p.handle, title: p.title, status: p.status, skus: p.variants.nodes.length })));
// 在庫
const act = S.filter((p) => p.status === 'ACTIVE');
const stockOf = (v) => onSku.get(K(v.sku));
const zeroStock = act.flatMap((p) => p.variants.nodes.filter((v) => { const hs = stockOf(v); return hs && hs.every((h) => h.stock <= 0); }).map((v) => ({ p, v })));
const zeroProducts = new Set(zeroStock.map((x) => x.p.id));
const allZeroProducts = act.filter((p) => p.variants.nodes.every((v) => { const hs = stockOf(v); return hs && hs.every((h) => h.stock <= 0); }));
// 内容
const descEmpty = S.filter((p) => !text(p.descriptionHtml) && !/<img/i.test(p.descriptionHtml ?? ''));
const descImgOnly = S.filter((p) => !text(p.descriptionHtml) && /<img/i.test(p.descriptionHtml ?? ''));
const noImg = S.filter((p) => !p.mediaCount?.count);
const zh = S.filter((p) => zhTitle(p.title));
const code = S.filter((p) => TEMPLATE_CODE.test(p.title));

// ── 店面抽查（公開ページ GET のみ）──
let seed = 20261019; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pool = [...act]; const sample = []; while (sample.length < 20 && pool.length) sample.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
const spot = [];
for (const p of sample) {
  const url = `${STORE}/products/${encodeURIComponent(p.handle)}`; const row = { handle: p.handle, title: p.title, url };
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; anet-compare read-only)' } }); row.status = r.status; const html = await r.text();
    await sleep(1100);
    const js = await (await fetch(`${url}.js`)).json().catch(() => null);
    const admin = p.variants.nodes.map((v) => Number(v.price)).sort((a, b) => a - b);
    const front = (js?.variants ?? []).map((v) => v.price / 100).sort((a, b) => a - b); // .js の price は ×100
    row.adminPrices = [...new Set(admin)].join('/'); row.frontPrices = [...new Set(front)].join('/');
    row.priceMatch = front.length === admin.length && front.every((x, i) => x === admin[i]);
    row.priceOnPage = html.includes(admin[0].toLocaleString('en-US')) || html.includes(String(admin[0]));
    const btn = html.match(/<button[^>]*id="ProductSubmitButton[^>]*>[\s\S]{0,200}?<\/span>/)?.[0] ?? '';
    row.cartButton = /name="add"/.test(btn) && /カートに(追加|入れる)/.test(btn); row.cartDisabled = /\sdisabled/.test(btn.split('>')[0]);
    row.available = js ? js.available : null;
  } catch (e) { row.error = String(e.message).slice(0, 120); }
  spot.push(row); await sleep(1100);
}
log('spot', spot.filter((r) => r.status === 200 && r.priceMatch && r.cartButton).length, '/', spot.length, 'OK');

const sum = {
  shopifyActive: act.length, shopifyDraft: S.filter((p) => p.status === 'DRAFT').length, shopifyArchived: S.filter((p) => p.status === 'ARCHIVED').length, shopifyTotal: S.length,
  b2bOnSale: B.list.length, b2bOffShelf: off.length,
  bothProducts: matched.length, bothB2BGoods: usedGoods.size, shopifyOnlyProducts: shopOnly.length, shopifyOnlyActive: shopOnly.filter((p) => p.status === 'ACTIVE').length, b2bOnlyGoods: b2bOnly.length, b2bDuplicateGoods: dup.length,
  shopifySkus: shopSkuSet.size, b2bSkus: onSku.size, bothSkus: [...shopSkuSet].filter((k) => onSku.has(k)).length, shopifyOnlySkus: shopSkuNotInB2B.length, b2bOnlySkus: b2bSkuNotInShop.length, skuOnMultipleShopifyProducts: multiShopSku.length, shopifyDupGroups: dupGroups.length, shopifyDupProducts: dupGroups.reduce((a, g) => a + g.length, 0), shopifyDupActiveExtra: dupGroups.reduce((a, g) => a + Math.max(0, g.filter((p) => p.status === 'ACTIVE').length - 1), 0),
  priceChecked, priceMismatch: priceBad.length,
  activeNotOnB2B: activeNotOnB2B.length, draftButB2BOnSale: draftOnB2B.length, specDiffProducts: specDiff.length,
  zeroStockActiveSkus: zeroStock.length, activeSkusMatched: act.flatMap((p) => p.variants.nodes).filter((v) => stockOf(v)).length, zeroStockActiveProductsAny: zeroProducts.size, zeroStockActiveProductsAll: allZeroProducts.length,
  descEmpty: descEmpty.length, descImageOnly: descImgOnly.length, noImage: noImg.length, titleChinese: zh.length, titleTemplateCode: code.length,
  spotOk: spot.filter((r) => r.status === 200 && r.priceMatch && r.cartButton).length, spotTotal: spot.length,
};
fs.writeFileSync(path.join(OUT, 'compare.json'), JSON.stringify({
  at: new Date().toISOString(), b2bFetchedAt: B.fetchedAt, sum, priceBad,
  activeNotOnB2B: activeNotOnB2B.map((x) => ({ handle: x.p.handle, title: x.p.title, skus: x.p.variants.nodes.map((v) => v.sku).join(','), why: x.why })),
  draftOnB2B: draftOnB2B.map((x) => ({ handle: x.p.handle, title: x.p.title, good_id: x.good_id, why: x.why })),
  shopOnlyDraft: shopOnlyDraft.map((p) => ({ handle: p.handle, title: p.title })),
  specDiff, multiShopSku, dupGroups, b2bOnly: b2bOnly.map((g) => ({ good_id: g.good_id, title: B.info[g.good_id]?.title || g.title_zh, skus: g.skus.map((s) => s.out_id).join(','), price: g.skus.map((s) => s.price).join('/'), stock: g.skus.reduce((a, s) => a + (s.stock_num | 0), 0) })),
  dup: dup.map((g) => g.good_id), b2bSkuNotInShop, shopSkuNotInB2B,
  zeroStock: zeroStock.map(({ p, v }) => ({ handle: p.handle, sku: v.sku })), allZeroProducts: allZeroProducts.map((p) => ({ handle: p.handle, title: p.title })),
  descEmpty: descEmpty.map((p) => ({ handle: p.handle, status: p.status, title: p.title })), descImageOnly: descImgOnly.length, noImg: noImg.map((p) => ({ handle: p.handle, status: p.status, title: p.title })),
  zh: zh.map((p) => ({ status: p.status, title: p.title })), code: code.map((p) => ({ status: p.status, title: p.title })), spot,
}, null, 1) + '\n');
console.log(JSON.stringify(sum, null, 1));
process.exit(0);
