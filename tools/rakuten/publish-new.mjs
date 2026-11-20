#!/usr/bin/env node
/**
 * 批発商新着 1 件を楽天に直接登録（RMS 商品 API 2.0 PUT + 在庫 API 2.1 + 店舗カテゴリ）。2026-11-20
 *
 *   node tools/rakuten/publish-new.mjs <goodId> --mn FBAGH-01-A --genre 204697 --shopcat 27 [--price 3290] [--stock 10] [--dry]
 *
 * 前提：new-item-pack.mjs <goodId> で pack 作成済み（title.txt / description.html / attributes.json / pack.json）
 *       画像は cabinet.mjs upload --out tools/rakuten/out/new/<goodId>/cabinet-urls.json で R-Cabinet に上げ済み（並び順＝商品画像順）
 *       任意：out/new/<goodId>/extra.html（説明文の末尾に足す仕様など。卸の資料・画像にある事実だけ）
 * 必須属性はジャンルの rmsMandatoryFlg を見て埋める（ブランド名・型番は '-'、原産国は中国）。
 * 既存の管理番号は上書きしない（--force で上書き）。結果は out/new/<goodId>/rakuten-result.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [goodId, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((a, i, A) => a.startsWith('--') ? [a.slice(2), A[i + 1] && !A[i + 1].startsWith('--') ? A[i + 1] : true] : null).filter(Boolean));
if (!/^\d+$/.test(goodId || '') || !args.mn || !args.genre) { console.error('usage: publish-new.mjs <goodId> --mn <管理番号> --genre <id> [--shopcat id] [--price n] [--stock n] [--dry] [--force]'); process.exit(2); }
const D = path.join(ROOT, 'tools/rakuten/out/new', goodId);
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const AUTH = 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const API = 'https://api.rms.rakuten.co.jp/es';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, url, body, ok404 = false) {
  for (let t = 1; ; t++) {
    const r = await fetch(API + url, { method, headers: { Authorization: AUTH, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text();
    if ((r.status === 503 || r.status === 429) && t < 8) { await sleep(3000 * t); continue; }
    if (ok404 && r.status === 404) return null;
    if (!r.ok) throw new Error(`${method} ${url} ${r.status} ${txt.slice(0, 900)}`);
    return txt ? JSON.parse(txt) : {};
  }
}

const title = fs.readFileSync(path.join(D, 'title.txt'), 'utf8').trim().slice(0, 127);
const pack = JSON.parse(fs.readFileSync(path.join(D, 'pack.json'), 'utf8'));
const attrs = JSON.parse(fs.readFileSync(path.join(D, 'attributes.json'), 'utf8'));
const extra = fs.existsSync(path.join(D, 'extra.html')) ? fs.readFileSync(path.join(D, 'extra.html'), 'utf8') : '';
const html = fs.readFileSync(path.join(D, 'description.html'), 'utf8').trim() + extra;
const cab = JSON.parse(fs.readFileSync(path.join(D, 'cabinet-urls.json'), 'utf8'));
const images = cab.map((o) => ({ type: 'CABINET', location: String(o.url).replace(/^.*\/cabinet/, ''), alt: title.slice(0, 100) })).slice(0, 20);
const tagline = String(pack.catchcopy || '').slice(0, 87);

const REP = [[/ピンク/, 'ピンク'], [/グレー/, 'グレー'], [/ブラック|黒/, 'ブラック'], [/ホワイト|白/, 'ホワイト'], [/ベージュ/, 'ベージュ'], [/ブラウン/, 'ブラウン'], [/ブルー|ネイビー/, 'ブルー'], [/グリーン/, 'グリーン'], [/パープル/, 'パープル'], [/イエロー/, 'イエロー'], [/レッド|赤/, 'レッド']];
const rep = (t) => (REP.find(([r]) => r.test(t)) || [0, 'マルチカラー'])[1];

const ga = await api('GET', `/2.0/navigation/genres/${args.genre}/attributes?attributeIdOnly=false`);
const mand = ((ga.genre?.attributes || ga.attributes) || []).filter((a) => a.properties?.rmsMandatoryFlg).map((a) => a.nameJa);

const skus = attrs.skus || [];
const axes = attrs.variantAxes || [];
const multi = skus.length > 1;
const selectors = multi ? [{ key: 'opt1', displayName: axes[0] === 'SIZE' ? 'サイズ' : 'カラー', values: [...new Set(skus.map((s) => s.options.join(' ')))].map((d) => ({ displayValue: d.slice(0, 32) })) }] : [];
const variants = {};
skus.forEach((s, i) => {
  const id = multi ? `${args.mn}-${String(i + 1).padStart(2, '0')}` : args.mn;
  const opt = s.options.join(' ');
  variants[id] = {
    ...(multi ? { selectorValues: { opt1: opt.slice(0, 32) } } : {}),
    restockOnCancel: true, backOrderFlag: false, articleNumber: { exemptionReason: 5 },
    standardPrice: String(args.price || s.suggestedPrice), shipping: { postageIncluded: true, okihaiSetting: true }, orderQuantityLimit: 5,
    merchantDefinedSkuId: s.sku || id, hidden: false, features: { restockNotification: true, noshi: false },
    attributes: mand.map((nm) => ({ name: nm, values: [({ 'ブランド名': '-', 'メーカー型番': '-', '原産国／製造国': '中国', '代表カラー': rep(opt + ' ' + title), 'カラー': (opt || '-').slice(0, 30) })[nm] ?? '-'] })),
  };
});
const item = {
  itemNumber: args.mn, itemType: 'NORMAL', title, tagline,
  productDescription: { pc: html, sp: html }, salesDescription: html,
  images, genreId: String(args.genre), hideItem: false, unlimitedInventoryFlag: false,
  features: { searchVisibility: 'ALWAYS_VISIBLE', shopContact: true, review: 'SHOP_SETTING', displayManufacturerContents: true, displayNormalCartButton: true, displaySubscriptionCartButton: false, inventoryDisplay: 'DISPLAY_ABSOLUTE_STOCK_COUNT', socialGiftFlag: false },
  payment: { taxIncluded: true, cashOnDeliveryFeeIncluded: false },
  ...(multi ? { variantSelectors: selectors } : {}), variants,
};
fs.writeFileSync(path.join(D, 'rakuten-item.json'), JSON.stringify(item, null, 1));
console.log(args.mn, 'title', title.length, '字 / images', images.length, '/ variants', Object.keys(variants).length, '/ mandatory', mand.join(','), '/ price', Object.values(variants).map((v) => v.standardPrice).join(','));
if (args.dry) process.exit(0);

const exists = await api('GET', `/2.0/items/manage-numbers/${encodeURIComponent(args.mn)}`, null, true);
if (exists && !args.force) { console.error('管理番号が既にある → --force で上書き'); process.exit(1); }
await api('PUT', `/2.0/items/manage-numbers/${encodeURIComponent(args.mn)}`, item);
const qty = Number(args.stock ?? 10);
for (const vid of Object.keys(variants)) { await api('PUT', `/2.1/inventories/manage-numbers/${encodeURIComponent(args.mn)}/variants/${encodeURIComponent(vid)}`, { mode: 'ABSOLUTE', quantity: qty }); await sleep(700); }
if (args.shopcat) await api('PUT', `/2.0/categories/item-mappings/manage-numbers/${encodeURIComponent(args.mn)}`, { categoryIds: [String(args.shopcat)] });
const got = await api('GET', `/2.0/items/manage-numbers/${encodeURIComponent(args.mn)}`);
const res = { goodId, mn: args.mn, ok: true, hide: got.hideItem, variants: Object.keys(got.variants || {}).length, images: (got.images || []).length, url: `https://item.rakuten.co.jp/anet-fashion/${args.mn.toLowerCase()}/`, at: new Date().toISOString() };
fs.writeFileSync(path.join(D, 'rakuten-result.json'), JSON.stringify(res, null, 1));
console.log('ok', JSON.stringify(res));
