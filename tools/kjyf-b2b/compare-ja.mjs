#!/usr/bin/env node
/**
 * anetmc.com（Shopify vendor=ANET）全店 と 卸の日本語サイト www.kuajingyifan.com/ja-JP（= view 0）の SKU 単位対比（読み取りのみ）。
 *   node tools/kjyf-b2b/compare-ja.mjs        # → out/ja-full.json（view 0 在售＋下架）+ out/compare-ja.json
 * view 0 の search API は日本語サイトと同じデータ（good_id・価格・SKU 一致、docs/kjyf-b2b-调研.md）。匿名、間隔 1.1 秒。
 * B2B（view 2）との価格比較は out/b2b-full.json（sync.mjs fetch）を使う。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'tools/kjyf-b2b/out');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const SHOP = env.SHOPIFY_STORE_DOMAIN, VER = env.SHOPIFY_API_VERSION || '2026-10';
const MARKUP = Number(env.KJYF_MARKUP || 1.15);
const retail = (w) => Math.ceil((w * MARKUP) / 10) * 10;
const K = (x) => String(x ?? '').trim().toUpperCase().replace(/^0+(?=[A-Z])/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const TEMPLATE_CODE = /(?:\s*[（(]?\s*(?<![A-Za-z0-9])(?:YB-05|[A-Z]{1,6}-\d{2}(?:-[A-Z]+)?|TEMU-\d{3,4}(?:-[A-Z])?|sg\d{3}(?:-[a-z])?|ny\d{3}|de\d{3}|zk\d{3}|sl\d{3})\s*[)）]?)+\s*$/;
const HOLD_RE = /W杯|ワールドカップ|世界杯|日本代表|FIFA|サッカー日本|オリンピック|五輪|ディズニー|Disney|サンリオ|Sanrio|キティ|Hello ?Kitty|ポケモン|Pokemon|ちいかわ|スヌーピー|ドラえもん|ミッキー|ジブリ|ナイキ|NIKE|アディダス|adidas|ルイ.?ヴィトン|LOUIS ?VUITTON|シャネル|CHANEL|グッチ|GUCCI|エルメス|HERMES|ロレックス|ダイソン|Dyson|iPhone|Apple|Galaxy|Switch|任天堂|ニンテンドー|PlayStation|SONY|ソニー|パナソニック|Panasonic|シャープ|SHARP|無印|ユニクロ|UNIQLO|ANKER|アンカー/i;
const text = (h) => String(h ?? '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&[a-z]+;|&#\d+;/gi, ' ').replace(/\s+/g, ' ').trim();
const norm = (t) => String(t ?? '').normalize('NFKC').replace(TEMPLATE_CODE, '').replace(/[\s・、。,.!！?？()（）【】「」『』\[\]／/|｜:：;；~〜\-－ー_＿+＋&＆*※★☆♪]+/g, '').toLowerCase();
const dice = (a, b) => { const g = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const k = s.slice(i, i + 2); m.set(k, (m.get(k) ?? 0) + 1); } return m; }; const A = g(norm(a)), B = g(norm(b)); let n = 0, ta = 0, tb = 0; for (const v of A.values()) ta += v; for (const v of B.values()) tb += v; for (const [k, v] of A) n += Math.min(v, B.get(k) ?? 0); return ta + tb ? (2 * n) / (ta + tb) : 1; };
const fileOf = (u) => String(u).split('?')[0].split('/').pop().replace(/_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\.\w+$)/, '').toLowerCase();
const IMG_KEYS = ['image_url', ...Array.from({ length: 9 }, (_, i) => `image_url_${i + 1}`)];

async function api(pathname, body) {
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
const slim = (g) => ({ good_id: g.good_id, cat_id: g.cat_id, title: g.title || g.sub_title || '', sub_title: g.sub_title, desc: g.desc ?? '', images: IMG_KEYS.filter((k) => g[k]).length, imageFiles: IMG_KEYS.map((k) => g[k]).filter(Boolean).map(fileOf), slug: g.slug, skus: (g.skus ?? []).map((s) => ({ out_id: s.out_id, price: s.price, stock_num: s.stock_num })) });
async function list(on_shelves) { const out = []; for (let page = 1; ; page++) { const d = await api('/admin/product/2b/search', { viewId: 0, page, limit: 50, order_type: 'desc', on_shelves }); out.push(...d.list.map(slim)); if (!d.list.length || out.length >= d.total) break; } return out; }

// ── データ ──
const on = await list(1); log('ja on sale', on.length);
const off = await list(2); log('ja off shelf', off.length);
const cats = new Map((await api('/admin/cat/2b/list', { show_main: 1, view_id: 0 })).list.map((c) => [c.cat_id, c.name]));
fs.writeFileSync(path.join(OUT, 'ja-full.json'), JSON.stringify({ fetchedAt: new Date().toISOString(), on, off, cats: [...cats] }) + '\n');
const B2 = J(path.join(OUT, 'b2b-full.json'));
const S = []; let c = null;
for (;;) { const d = await gql(`query($c:String){ products(first:25, after:$c, query:"vendor:ANET"){ pageInfo{hasNextPage endCursor} nodes{ id handle title status vendor descriptionHtml mediaCount{count} media(first:30){ nodes{ ... on MediaImage{ image{ url } } } } variants(first:100){ nodes{ sku price } } } } }`, { c }); S.push(...d.products.nodes.filter((p) => p.vendor === 'ANET')); if (!d.products.pageInfo.hasNextPage) break; c = d.products.pageInfo.endCursor; }
log('Shopify ANET', S.length);

// ── 索引 ──
const onSku = new Map(); for (const g of on) for (const s of g.skus) if (s.out_id) { const k = K(s.out_id); if (!onSku.has(k)) onSku.set(k, []); onSku.get(k).push({ good_id: g.good_id, price: s.price, stock: s.stock_num | 0 }); }
const offSku = new Set(off.flatMap((g) => g.skus.map((s) => K(s.out_id))));
const b2Price = new Map(); for (const g of B2.list) for (const s of g.skus) b2Price.set(`${g.good_id}:${K(s.out_id)}`, s.price);
const b2Goods = new Set(B2.list.map((g) => g.good_id));
const shopSku = new Map(); for (const p of S) for (const v of p.variants.nodes) if (v.sku) { const k = K(v.sku); if (!shopSku.has(k)) shopSku.set(k, []); shopSku.get(k).push(p); }
const goods = new Map(on.map((g) => [g.good_id, g]));

// ── 商品の対応（多数決＋同点は 1 対 1） ──
const matched = [], shopOnly = [];
for (const p of S) {
  const votes = new Map(); for (const v of p.variants.nodes) for (const h of onSku.get(K(v.sku)) ?? []) votes.set(h.good_id, (votes.get(h.good_id) ?? 0) + 1);
  if (!votes.size) { shopOnly.push(p); continue; }
  const top = Math.max(...votes.values()); matched.push({ p, ties: [...votes].filter(([, n]) => n === top).map(([g]) => g).sort((a, b) => a - b) });
}
{ const taken = new Set(); for (const m of matched) { m.good_id = m.ties.find((g) => !taken.has(g)) ?? m.ties[0]; taken.add(m.good_id); } }
const used = new Set(matched.map((m) => m.good_id));
const draftOnlyGoods = new Set([...used].filter((gid) => matched.filter((m) => m.good_id === gid).every((m) => m.p.status !== 'ACTIVE')));
const jaOnly = [], jaDup = [];
for (const g of on) { if (used.has(g.good_id)) continue; (g.skus.some((s) => shopSku.has(K(s.out_id))) ? jaDup : jaOnly).push(g); }

// 価格：日本語サイト vs B2B、anetmc vs retail(日本語サイト)
const jaVsB2b = { same: 0, diff: [], notInB2b: 0 };
for (const g of on) for (const s of g.skus) { const b = b2Price.get(`${g.good_id}:${K(s.out_id)}`); if (b == null) { jaVsB2b.notInB2b++; continue; } b === s.price ? jaVsB2b.same++ : jaVsB2b.diff.push({ good_id: g.good_id, sku: s.out_id, ja: s.price, b2b: b }); }
const priceBad = []; let priceChecked = 0; const markup = []; const priceRows = [];
for (const p of S) for (const v of p.variants.nodes) { const hs = onSku.get(K(v.sku)); if (!hs) continue; priceChecked++; const exp = [...new Set(hs.map((h) => retail(h.price)))]; const h = hs.find((x) => retail(x.price) === Number(v.price)) ?? hs[0]; markup.push(Number(v.price) / h.price); { const b = b2Price.get(`${h.good_id}:${K(v.sku)}`); priceRows.push({ sku: v.sku, status: p.status, title: p.title, good_id: h.good_id, anetmc: Number(v.price), ja: h.price, b2b: b ?? '', expected: retail(h.price), anetmcOk: exp.includes(Number(v.price)), jaEqB2b: b == null ? '' : b === h.price }); } if (!exp.includes(Number(v.price))) priceBad.push({ title: p.title, status: p.status, sku: v.sku, anetmc: Number(v.price), expected: exp.join('/'), ja: [...new Set(hs.map((h) => h.price))].join('/') }); }
// 状態
const activeOffJa = shopOnly.filter((p) => p.status === 'ACTIVE').map((p) => ({ title: p.title, skus: p.variants.nodes.map((v) => v.sku).join(','), why: p.variants.nodes.some((v) => offSku.has(K(v.sku))) ? '日本語サイトで下架' : '日本語サイトに存在しない' }));
// タイトル
const tsim = matched.map(({ p, good_id }) => ({ status: p.status, anetmc: p.title, ja: goods.get(good_id).title, sim: dice(p.title, goods.get(good_id).title), jaLen: goods.get(good_id).title.length, anLen: p.title.length }));
const bucket = (x) => (x.sim >= 0.999 ? '同一' : x.sim >= 0.8 ? 'ほぼ同じ(≥0.8)' : x.sim >= 0.5 ? '部分一致(0.5–0.8)' : '大きく異なる(<0.5)');
const titleBuckets = tsim.reduce((a, x) => ((a[bucket(x)] = (a[bucket(x)] ?? 0) + 1), a), {});
const sorted = [...tsim].sort((a, b) => a.sim - b.sim); const ex = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.85, 0.97].map((q) => sorted[Math.floor(q * (sorted.length - 1))]);
// 画像・説明
// anetmc の画像ファイル名：2026-10-18 に全件を卸原図（src/NN.jpg）で再アップロードしたため現 URL は 01.jpg…。
// 元の卸ファイル名は tools/product-images/out/<handle>/media-backup*.json の old[]（10-15/16 の初回取込＝卸 URL のファイル名、同じ順）。
// 現在の枚数が old[] と同じなら old[] のファイル名を使い、無ければ現 URL のファイル名（今日の新規作成分は卸ファイル名のまま）。
const PI = path.join(ROOT, 'tools/product-images/out');
const anetFiles = (p) => {
  const cur = p.media.nodes.filter((m) => m.image).map((m) => fileOf(m.image.url));
  for (const f of ['media-backup.rolledback.json', 'media-backup.json']) { const fp = path.join(PI, p.handle, f); if (!fs.existsSync(fp)) continue; const old = J(fp).old ?? []; if (old.length === cur.length) return { files: old.map((o) => fileOf(o.url)), src: 'backup' }; return { files: cur, src: `current(backup ${old.length}≠${cur.length})` }; }
  return { files: cur, src: 'current' };
};
const img = matched.map(({ p, good_id }) => {
  const g = goods.get(good_id); const a = anetFiles(p); const ja = g.imageFiles; const aSet = new Set(a.files), jSet = new Set(ja);
  const missing = ja.filter((x) => !aSet.has(x)), extra = a.files.filter((x) => !jSet.has(x));
  const common = a.files.filter((x) => jSet.has(x)); const orderSame = common.join() === ja.filter((x) => aSet.has(x)).join();
  const kind = !missing.length && !extra.length ? (orderSame ? '一致' : '順序違い') : !common.length ? '全て別画像（卸が差し替え）' : missing.length && extra.length ? '一部差し替え' : missing.length ? 'anetmc に不足' : 'anetmc が多い';
  return { handle: p.handle, title: p.title, status: p.status, good_id, an: a.files.length, ja: ja.length, kind, missing: missing.length, extra: extra.length, firstSame: a.files[0] === ja[0], basis: a.src, slug: g.slug };
});
const imgStat = { byKind: img.reduce((a, x) => ((a[x.kind] = (a[x.kind] ?? 0) + 1), a), {}), countSame: img.filter((x) => x.an === x.ja).length, anetmcFewerCount: img.filter((x) => x.an < x.ja).length, anetmcMoreCount: img.filter((x) => x.an > x.ja).length, mainImageDiff: img.filter((x) => !x.firstSame).length, avgAnetmc: +(img.reduce((a, x) => a + x.an, 0) / img.length).toFixed(2), avgJa: +(img.reduce((a, x) => a + x.ja, 0) / img.length).toFixed(2), basis: img.reduce((a, x) => ((a[x.basis.split('(')[0]] = (a[x.basis.split('(')[0]] ?? 0) + 1), a), {}) };
const desc = matched.map(({ p, good_id }) => { const g = goods.get(good_id); if (p.descriptionHtml === g.desc) return 'HTML 完全一致'; if (text(p.descriptionHtml) && text(p.descriptionHtml) === text(g.desc)) return '本文一致（HTML 差）'; return '異なる'; });
const descStat = desc.reduce((a, x) => ((a[x] = (a[x] ?? 0) + 1), a), {});
const jaDescKind = { textWithKana: on.filter((g) => /[぀-ヿ]/.test(text(g.desc))).length, imageOnly: on.filter((g) => !text(g.desc) && /<img/i.test(g.desc)).length, empty: on.filter((g) => !text(g.desc) && !/<img/i.test(g.desc)).length };

const sum = {
  jaOnSale: on.length, jaOffShelf: off.length, jaOnSaleNotInB2B: on.filter((g) => !b2Goods.has(g.good_id)).length, b2bNotInJa: B2.list.filter((g) => !goods.has(g.good_id)).length,
  anetmcActive: S.filter((p) => p.status === 'ACTIVE').length, anetmcDraft: S.filter((p) => p.status === 'DRAFT').length,
  bothProducts: matched.length, bothGoods: used.size, anetmcOnly: shopOnly.length, anetmcOnlyActive: shopOnly.filter((p) => p.status === 'ACTIVE').length, jaOnlyNew: jaOnly.length, jaOnlySkuAlreadyInAnetmc: jaDup.length,
  skusJa: onSku.size, skusAnetmc: shopSku.size, skusBoth: [...shopSku.keys()].filter((k) => onSku.has(k)).length,
  jaVsB2bSame: jaVsB2b.same, jaVsB2bDiff: jaVsB2b.diff.length, jaSkuNotInB2b: jaVsB2b.notInB2b,
  priceChecked, priceMismatch: priceBad.length, markupMin: +Math.min(...markup).toFixed(3), markupMax: +Math.max(...markup).toFixed(3),
  activeOffJa: activeOffJa.length, draftOnlyGoods: draftOnlyGoods.size, titleBuckets, imgStat, descStat, jaDescKind,
};
fs.writeFileSync(path.join(OUT, 'compare-ja.json'), JSON.stringify({
  at: new Date().toISOString(), sum, jaVsB2bDiff: jaVsB2b.diff, priceBad, activeOffJa,
  jaOnly: jaOnly.map((g) => ({ good_id: g.good_id, cat: cats.get(g.cat_id) ?? String(g.cat_id), title: g.title, sub_title: g.sub_title, images: g.images, skus: g.skus.length, skuList: g.skus.map((s) => s.out_id).join(','), price: g.skus.length ? `${Math.min(...g.skus.map((s) => s.price))}–${Math.max(...g.skus.map((s) => s.price))}` : 'SKU なし', stock: g.skus.reduce((a, s) => a + (s.stock_num | 0), 0), risk: HOLD_RE.test(g.title) ? (g.title.match(HOLD_RE)[0]) : '', inB2B: b2Goods.has(g.good_id), slug: g.slug })),
  jaDup: jaDup.map((g) => ({ good_id: g.good_id, title: g.title, cat: cats.get(g.cat_id) ?? String(g.cat_id), price: Math.min(...g.skus.map((s) => s.price)), images: g.images, slug: g.slug, sameSkuOn: [...new Set(g.skus.flatMap((s) => (shopSku.get(K(s.out_id)) ?? []).map((p) => `${p.status}:${p.title.slice(0, 30)}`)))].join(' / ') })),
  draftOnly: [...draftOnlyGoods].map((gid) => { const g = goods.get(gid); const ps = matched.filter((m) => m.good_id === gid).map((m) => m.p); return { good_id: gid, title: g.title, cat: cats.get(g.cat_id) ?? String(g.cat_id), price: Math.min(...g.skus.map((s) => s.price)), images: g.images, slug: g.slug, anetmcTitle: ps[0].title, ip: HOLD_RE.test(g.title) || HOLD_RE.test(ps[0].title), sameSkuActiveElsewhere: g.skus.every((s) => (shopSku.get(K(s.out_id)) ?? []).some((p) => p.status === 'ACTIVE')) }; }),
  priceRows, img, titleExamples: ex, shopOnly: shopOnly.map((p) => ({ status: p.status, title: p.title })),
}, null, 1) + '\n');
console.log(JSON.stringify(sum, null, 1));
process.exit(0);
