/**
 * Amazon.co.jp 在庫ファイル（フラットファイル）ジェネレータ — Shopify(ANET) → Amazon 出品者出荷
 *
 *   node tools/amazon-listing/build-inventory-file.mjs classify            # カテゴリ振り分け＋出品許可が要るカテゴリ一覧 → out/category-report.md
 *   node tools/amazon-listing/build-inventory-file.mjs refresh             # Shopify から公開後の画像 URL / 価格を取り直す → out/products-live.json
 *   node tools/amazon-listing/build-inventory-file.mjs build [--type Home] [--limit 10] [--handles file] [--qty 50] [--latency 1] [--shipping 全国送料無料]
 *                                                                           # feed_product_type ごとに out/inventory-<type>.tsv（UTF-8 TSV、3 行ヘッダ）
 *   node tools/amazon-listing/build-inventory-file.mjs check               # 禁止語・文字数・画像不足を点検 → out/check-report.md
 *
 * 入力：tools/product-images/out/products.json（pipeline fetch）＋ out/<handle>/spec.json（pipeline spec）
 *       refresh 後は out/products-live.json を優先（公開済みの 8 枚画像 URL）。
 * ヘッダ：templates/<type>.headers.tsv があれば、その 3 行（TemplateType 行 / 日本語ラベル行 / 英字フィールド名行）を
 *        そのまま使い、フィールド名で値を流し込む。無ければ DEFAULT_FIELDS で生成（Seller Central でアップロード前に
 *        同じカテゴリのテンプレートをダウンロードし、ヘッダ 3 行をコピーして置くのが確実）。
 * ルール：GTIN 免除（external_product_id 空欄）、brand/manufacturer = ANET、condition = New、
 *        バリエーションは parent/child（variation_theme は Color / Size / SizeColor を自動判定）。
 *        個人情報は含まない。6kpro 等の外部 AI は呼ばない（spec.json を再利用するだけ）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const IMG_OUT = path.resolve(ROOT, 'tools/product-images/out');
const OUT = path.resolve(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const TPL = path.resolve(__dirname, 'templates');
const stage = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, 'category-map.json'), 'utf8'));

const BRAND = args.brand ?? 'SARADEMUNT'; // 2026-10-17 決定：Amazon では ANET が既存ブランドと衝突 → ユーザー保有の SARADEMUNT を使う（GTIN 免除が即時承認）
const QTY = Number(args.qty ?? 50);                 // 代発なので在庫は見込み値。売れたら pipeline 側で同期する
const LATENCY = Number(args.latency ?? 1);          // 平日12時までのご注文は当日出荷 → 1 日
const SHIPPING = args.shipping ?? '全国送料無料';    // Seller Central の配送パターン名と一致させる
const TITLE_MAX = Number(args['title-max'] ?? 65);
const BULLET_MAX = 120, DESC_MAX = 1900, KW_MAX = 100;
// ---------- Amazon 価格（2026-10-18 ユーザー確認：卸価格は税込・送料込み。Shopify は卸×1.15） ----------
// Shopify 価格 = ceil(卸×1.15 / 10)×10 なので 卸 ≈ Shopify 価格 / 1.15（切り上げ分だけ高めに見積もる＝安全側）。
// 税抜利益 = P/1.1 − 手数料率×P − 広告率×P/1.1 − 卸/1.1 が「200 円以上」かつ「税抜売価の 10% 以上」になる最小の P。
// 手数料率はカテゴリーごとに category-map.json の referralFee（無ければ 15%＝最も高い側）。実際の料率は Seller Central の料金シミュレーターで確認する。
const SHOPIFY_MARKUP = Number(args['shopify-markup'] ?? 1.15);
const AD_RATE = Number(args['ad-rate'] ?? 0.05), MIN_PROFIT = Number(args['min-profit'] ?? 200), MIN_MARGIN = Number(args['min-margin'] ?? 0.10);
function amazonPrice(shopifyPrice, type) {
  const fee = MAP.referralFee?.[type] ?? MAP.referralFee?.default ?? 0.15;
  const cost = Number(shopifyPrice) / SHOPIFY_MARKUP; const costEx = cost / 1.1;
  const keep = 1 / 1.1 - fee - AD_RATE / 1.1; // 売価 1 円あたり手元に残る税抜額
  const p = Math.max((costEx + MIN_PROFIT) / keep, costEx / (keep - MIN_MARGIN / 1.1));
  const price = Math.ceil(p / 10) * 10;
  return { price, cost: Math.round(cost), fee, profitEx: Math.round(price / 1.1 - fee * price - AD_RATE * price / 1.1 - costEx), markup: price / cost - 1 };
}
const PRICING = []; // build 時に out/pricing.tsv へ

// Amazon.co.jp で使えない / 薬機法・景表法で危ない語（タイトル・箇条書きから除去 or 警告）
const STRIP_RE = /送料無料|最安値?|激安|No\.?1|ナンバーワン|日本一|世界一|SALE|セール|限定|即納|正規品|【[^】]*】|★|☆|■|◆|●|◎|♪|！！+/g;
const WARN_RE = /治る|治す|完治|効く|効果|改善|痩せる|ダイエット効果|医療|殺菌|抗菌率|アンチエイジング|若返|美白|脂肪燃焼|血圧が下が/;

// ---------- 入力 ----------
function loadProducts() {
  const live = path.join(OUT, 'products-live.json');
  const f = fs.existsSync(live) ? live : path.join(IMG_OUT, 'products.json');
  if (!fs.existsSync(f)) throw new Error(`products.json が無い：先に pipeline fetch を実行（${f}）`);
  let all = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (args.handles) { const set = new Set(fs.readFileSync(args.handles, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)); all = all.filter((p) => set.has(p.handle)); }
  if (args.handle) all = all.filter((p) => p.handle === args.handle);
  if (args.limit && stage !== 'build') all = all.slice(0, Number(args.limit)); // build は type で絞ってから limit
  return all;
}
const specOf = (p) => { const f = path.join(IMG_OUT, p.handle, 'spec.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
const numId = (gid) => String(gid).split('/').pop();

// ---------- カテゴリ ----------
function categorize(p) {
  const text = p.title; // タグは雑音が多い（色名・用途語）ので見ない
  for (const k of MAP.keywords) if (new RegExp(k.re).test(text)) return { feed_product_type: k.feed_product_type, approval: !!k.approval, by: 'keyword', browse_node: k.browse_node ?? MAP.browseNodes?.[k.feed_product_type] ?? '' };
  const t = MAP.byType[p.productType];
  if (t) return { feed_product_type: t.feed_product_type, approval: !!t.approval, by: 'type', browse_node: t.browse_node ?? MAP.browseNodes?.[t.feed_product_type] ?? '' };
  return { feed_product_type: MAP.fallback ?? 'Home', approval: false, by: 'fallback', browse_node: MAP.browseNodes?.[MAP.fallback ?? 'Home'] ?? '' };
}

// ---------- 文字整形 ----------
const clean = (s) => String(s ?? '').replace(/<li[^>]*>/gi, '・').replace(/<\/(p|li|h[1-6]|div|tr)>|<br\s*\/?>/gi, '　').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/[ \t\r\n]+/g, ' ').replace(/(　\s*){2,}/g, '　').trim();
const cut = (s, n) => { s = clean(s); if (s.length <= n) return s; const c = s.slice(0, n); const i = Math.max(c.lastIndexOf('。'), c.lastIndexOf('、'), c.lastIndexOf(' ')); return (i > n * 0.6 ? c.slice(0, i) : c).trim(); };
const title = (p, spec) => cut(`${p.title}`.replace(STRIP_RE, ' '), TITLE_MAX);
function bullets(p, spec) {
  const b = (spec?.features ?? []).map((f) => cut(`${f.t}：${f.d}`.replace(STRIP_RE, ' '), BULLET_MAX)).filter(Boolean);
  if (spec?.dimensions) { const d = spec.dimensions; const ok = (v) => typeof v === 'string' && /[0-9０-９]/.test(v); const dims = [ok(d.w) && `幅${d.w}`, ok(d.h) && `高さ${d.h}`, ok(d.d) && `奥行${d.d}`].filter(Boolean); if (dims.length) b.push(cut(`サイズ：${dims.join('×')}${d.note && !/記載なし|不明/.test(d.note) ? ' ' + d.note : ''}`, BULLET_MAX)); }
  if (spec?.setContents?.length) b.push(cut(`セット内容：${spec.setContents.join('、')}`, BULLET_MAX));
  while (b.length < 5) b.push(b.length === 0 ? cut(p.description, BULLET_MAX) : '');
  return b.slice(0, 5);
}
function description(p, spec) {
  const parts = [spec?.catch, spec?.sceneCopy, ...(spec?.features ?? []).map((f) => `■${f.t}：${f.d}`), spec?.variantsNote, clean(p.description)].filter(Boolean).map(clean);
  return cut(parts.join(' ').replace(STRIP_RE, ' '), DESC_MAX);
}
function keywords(p, spec) {
  const words = new Set();
  for (const w of [spec?.shortTitle, ...(p.tags ?? []), ...(spec?.badge ? [spec.badge] : []), p.productType]) for (const t of clean(w).split(/[\s・/／,、]+/)) if (t && t.length >= 2 && !/^[0-9]+$/.test(t) && !p.title.includes(t)) words.add(t);
  let s = ''; for (const w of words) { if ((s + ' ' + w).length > KW_MAX) break; s += (s ? ' ' : '') + w; }
  return s;
}
function images(p) {
  const urls = (p.media?.nodes ?? []).filter((m) => m.image?.url).map((m) => m.image.url);
  return { main: urls[0] ?? '', others: urls.slice(1, 9) };
}
const COLORISH = /color|colour|カラー|色/i, SIZEISH = /size|サイズ|寸法|容量|長さ|タイプ|型|セット|枚数|本数|個数|重さ|kg|cm|数量|規格|仕様/i;
function variationTheme(p) {
  const opts = (p.options ?? []).filter((o) => o.values.length > 1 && o.values[0] !== 'Default Title');
  if (!opts.length) return null;
  const hasColor = opts.some((o) => COLORISH.test(o.name)), hasSize = opts.some((o) => !COLORISH.test(o.name));
  return { theme: hasColor && hasSize ? 'SizeColor' : hasColor ? 'Color' : 'Size', colorOpt: opts.find((o) => COLORISH.test(o.name))?.name, sizeOpt: opts.find((o) => !COLORISH.test(o.name))?.name };
}

// ---------- 行の生成 ----------
const DEFAULT_FIELDS = ['feed_product_type', 'item_sku', 'brand_name', 'item_name', 'external_product_id', 'external_product_id_type', 'manufacturer', 'part_number', 'recommended_browse_nodes', 'item_type_keyword', 'update_delete',
  'standard_price', 'currency', 'quantity', 'fulfillment_latency', 'merchant_shipping_group_name', 'condition_type',
  'main_image_url', 'other_image_url1', 'other_image_url2', 'other_image_url3', 'other_image_url4', 'other_image_url5', 'other_image_url6', 'other_image_url7', 'other_image_url8', 'swatch_image_url',
  'parent_child', 'parent_sku', 'relationship_type', 'variation_theme', 'color_name', 'color_map', 'size_name',
  'product_description', 'bullet_point1', 'bullet_point2', 'bullet_point3', 'bullet_point4', 'bullet_point5', 'generic_keywords',
  'country_of_origin', 'is_adult_product', 'number_of_items', 'item_package_quantity', 'manufacturer_contact_information'];
const DEFAULT_LABELS = { feed_product_type: '商品タイプ', item_sku: '出品者SKU', brand_name: 'ブランド名', item_name: '商品名', external_product_id: '商品コード(JANコード等)', external_product_id_type: '商品コードのタイプ', manufacturer: 'メーカー名', part_number: 'メーカー型番', recommended_browse_nodes: '推奨ブラウズノード', item_type_keyword: '商品タイプキーワード', update_delete: 'アップデート・削除', standard_price: '商品の販売価格', currency: '通貨', quantity: '在庫数', fulfillment_latency: 'リードタイム', merchant_shipping_group_name: '配送パターン', condition_type: '商品のコンディション', main_image_url: '商品メイン画像URL', parent_child: '親子関係の指定', parent_sku: '親商品のSKU', relationship_type: '親子関係のタイプ', variation_theme: 'バリエーションテーマ', color_name: '色', color_map: 'カラーマップ', size_name: 'サイズ', product_description: '商品説明文', generic_keywords: '検索キーワード', country_of_origin: '原産国/地域', is_adult_product: 'アダルト商品', number_of_items: '商品の数量', item_package_quantity: '商品パッケージ数', manufacturer_contact_information: 'メーカー連絡先' };

// 新形式テンプレート（2026 年版：5 行ヘッダ、5 行目が属性パス contribution_sku#1.value …、データは 7 行目から）。
// 値は表示ラベル（「親」「新品」等）で入れる。ラベルは category-map.json の flatFileValues で上書きできる（テンプレートの「有効な値」シートで確認すること）。
const MP = '[marketplace_id=A1VC38T7YXB528]', JA = '[language_tag=ja_JP]';
const FV = { create: '作成または置換 (完全更新)', parent: '親', child: '子供', condition: '新品', channel: '出品者出荷（デフォルト）', origin: '中国', productIdType: 'GTIN免除', dgRegulation: '該当なし', variationTheme: { Size: 'サイズ', Color: '色', SizeColor: 'サイズ/色' }, exclusive: 'いいえ', noBattery: 'いいえ', components: '本体', multiColor: 'マルチカラー', ...(MAP.flatFileValues ?? {}) };
function newFormatRow(r, type) {
  const o = {
    'contribution_sku#1.value': r.item_sku, 'product_type#1.value': MAP.productTypes?.[type] ?? type, '::record_action': FV.create,
    [`parentage_level${MP}#1.value`]: r.parent_child === 'parent' ? FV.parent : r.parent_child === 'child' ? FV.child : '',
    [`child_parent_sku_relationship${MP}#1.parent_sku`]: r.parent_sku ?? '', 'variation_theme#1.name': FV.variationTheme[r.variation_theme] ?? r.variation_theme ?? '',
    'amzn1.volt.ca.product_id_type': FV.productIdType, [`supplier_declared_dg_hz_regulation${MP}#1.value`]: FV.dgRegulation, // どちらも必須（GTIN 免除済み・危険物なし）
    [`item_name${MP}${JA}#1.value`]: r.item_name, [`brand${MP}${JA}#1.value`]: r.brand_name, [`manufacturer${MP}${JA}#1.value`]: r.manufacturer,
    [`recommended_browse_nodes${MP}#1.value`]: r.recommended_browse_nodes ?? '', [`model_number${MP}#1.value`]: r.part_number ?? '', [`part_number${MP}#1.value`]: r.part_number ?? '',
    [`main_product_image_locator${MP}#1.media_location`]: r.main_image_url ?? '', [`product_description${MP}${JA}#1.value`]: r.product_description ?? '',
    [`generic_keyword${MP}${JA}#1.value`]: r.generic_keywords ?? '', [`color${MP}${JA}#1.value`]: r.color_name || (r.parent_child === 'parent' ? '' : r.color_fallback) || FV.multiColor, [`size${MP}${JA}#1.value`]: r.size_name ?? '',
    [`country_of_origin${MP}#1.value`]: FV.origin, // テンプレートで必須（親行も）
    // 以下 3 つは「条件付きで必須」だが、Seller Central の「ファイルを検証」で空欄がエラーになった（2026-10-19 Home 試点）
    [`is_exclusive_product${MP}#1.value`]: FV.exclusive, [`batteries_required${MP}#1.value`]: FV.noBattery,
    [`included_components${MP}${JA}#1.value`]: r.included_components || FV.components,
  };
  for (let i = 1; i <= 8; i++) o[`other_product_image_locator_${i}${MP}#1.media_location`] = r[`other_image_url${i}`] ?? '';
  for (let i = 1; i <= 5; i++) o[`bullet_point${MP}${JA}#${i}.value`] = r[`bullet_point${i}`] ?? '';
  if (r.parent_child !== 'parent') Object.assign(o, { // 親行は売買しない（価格・在庫は子に付ける）
    [`condition_type${MP}#1.value`]: FV.condition, 'fulfillment_availability#1.fulfillment_channel_code': FV.channel, 'fulfillment_availability#1.quantity': r.quantity,
    'fulfillment_availability#1.lead_time_to_ship_max_days': r.fulfillment_latency, [`purchasable_offer${MP}[audience=ALL]#1.our_price#1.schedule#1.value_with_tax`]: r.standard_price,
    [`merchant_shipping_group${MP}#1.value`]: r.merchant_shipping_group_name });
  return o;
}

function headerRows(type) {
  const f = path.join(TPL, `${type}.headers.tsv`);
  if (fs.existsSync(f)) { const all5 = fs.readFileSync(f, 'utf8').replace(/^\ufeff/, '').split(/\r?\n/).filter((l) => l.length).map((l) => l.split('\t'));
    if (all5.length >= 5 && all5[4][0]?.trim() === 'contribution_sku#1.value') return { rows: [...all5.slice(0, 5), all5[0].map(() => '')], fields: all5[4].map((s) => s.trim()), fromTemplate: true, newFormat: true }; }
  if (fs.existsSync(f)) { const rows = fs.readFileSync(f, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.length).slice(0, 3).map((l) => l.split('\t')); if (rows.length === 3) return { rows, fields: rows[2].map((s) => s.trim()), fromTemplate: true }; log('warn: headers.tsv は 3 行必要', f); }
  const fields = DEFAULT_FIELDS;
  return { rows: [[`TemplateType=fptcustom`, `Version=2026.1017`, `TemplateSignature=${type}`, 'settings=contentLanguageTag=ja_JP&feedType=113&headerLanguageTag=ja_JP&metadataVersion=MatprodVkxpdmVNYXRwcm9kQWtzVjJfMjAyNjEw&primaryMarketplaceId=amzn1.mp.o.A1VC38T7YXB528&templateIdentifier=generic', ...Array(fields.length - 4).fill('')], fields.map((k) => DEFAULT_LABELS[k] ?? k), fields], fields, fromTemplate: false };
}

// 色は親行・単品でも必須：単品はオプション値（色系の名前を優先）、無ければマルチカラー
const vs1Color = (p) => { const vs = p.variants?.nodes ?? []; const so = vs[0]?.selectedOptions ?? []; const o = so.find((x) => COLORISH.test(x.name)) ?? (vs.length === 1 ? so.find((x) => x.value !== 'Default Title') : null); return o?.value ?? ''; };
// 電池・充電式の商品は電池属性（種類・重量・リチウム量）が必要 → 自動では出さない
const BATTERY_RE = /電池|バッテリー|充電|USB|ソーラー|LED|電動|リモコン|コードレス|ワイヤレス/;
function rowsFor(p, cat) {
  const spec = specOf(p); const img = images(p); const vt = variationTheme(p);
  const base = { feed_product_type: cat.feed_product_type, brand_name: BRAND, manufacturer: BRAND, recommended_browse_nodes: cat.browse_node, item_type_keyword: cat.item_type_keyword ?? '', update_delete: 'Update', currency: 'JPY', condition_type: 'New', country_of_origin: args.origin ?? 'CN', is_adult_product: 'FALSE',
    product_description: description(p, spec), included_components: cut((spec?.setContents ?? []).join('、'), 100), color_fallback: vs1Color(p), generic_keywords: keywords(p, spec), manufacturer_contact_information: args.contact ?? '', ...Object.fromEntries(bullets(p, spec).map((b, i) => [`bullet_point${i + 1}`, b])) };
  const imgs = { main_image_url: img.main, ...Object.fromEntries(img.others.map((u, i) => [`other_image_url${i + 1}`, u])) };
  const sell = (v) => { const a = amazonPrice(v.price, cat.feed_product_type); PRICING.push({ handle: p.handle, variant: v.title ?? '', type: cat.feed_product_type, shopify: Math.round(Number(v.price)), ...a }); return { standard_price: String(a.price), quantity: String(QTY), fulfillment_latency: String(LATENCY), merchant_shipping_group_name: SHIPPING, part_number: `ANET-${numId(v.id)}`, number_of_items: '1', item_package_quantity: '1' }; };
  const vs = p.variants?.nodes ?? [];
  if (!vt || vs.length <= 1) return [{ ...base, ...imgs, ...sell(vs[0] ?? { price: 0, id: p.id }), item_sku: `ANET-V${numId(vs[0]?.id ?? p.id)}`, item_name: title(p, spec), parent_child: '', parent_sku: '', relationship_type: '', variation_theme: '' }];
  const parentSku = `ANET-P${numId(p.id)}`;
  const parent = { ...base, ...imgs, item_sku: parentSku, item_name: title(p, spec), parent_child: 'parent', variation_theme: vt.theme, parent_sku: '', relationship_type: '', standard_price: '', quantity: '', fulfillment_latency: '', merchant_shipping_group_name: '', part_number: '' };
  const children = vs.map((v) => {
    const so = Object.fromEntries((v.selectedOptions ?? []).map((o) => [o.name, o.value]));
    const color = vt.colorOpt ? so[vt.colorOpt] ?? '' : '', size = vt.sizeOpt ? so[vt.sizeOpt] ?? '' : '';
    const suffix = [color, size].filter(Boolean).join(' ');
    return { ...base, ...imgs, ...sell(v), item_sku: `ANET-V${numId(v.id)}`, item_name: cut(`${title(p, spec)} ${suffix}`, TITLE_MAX + 20), parent_child: 'child', parent_sku: parentSku, relationship_type: 'Variation', variation_theme: vt.theme, color_name: color, size_name: size };
  });
  return [parent, ...children];
}

const tsv = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ');

// ---------- ステージ ----------
const run = {
  classify() {
    const ps = loadProducts(); const by = {}; const rows = [];
    for (const p of ps) { const c = categorize(p); (by[c.feed_product_type] ??= { n: 0, approval: c.approval, handles: [] }); by[c.feed_product_type].n++; by[c.feed_product_type].handles.push(p.handle); rows.push({ handle: p.handle, title: p.title, productType: p.productType, ...c }); }
    fs.writeFileSync(path.join(OUT, 'mapping.json'), JSON.stringify(rows, null, 1));
    const lines = ['# Amazon カテゴリ振り分け', '', `商品数: ${ps.length}`, '', '| feed_product_type | 件数 | 出品許可 | 例 |', '|---|---|---|---|'];
    for (const [k, v] of Object.entries(by).sort((a, b) => b[1].n - a[1].n)) lines.push(`| ${k} | ${v.n} | ${v.approval ? '**要申請**' : '不要'} | ${v.handles.slice(0, 2).map((h) => rows.find((r) => r.handle === h).title.slice(0, 25)).join(' / ')} |`);
    const need = Object.entries(by).filter(([, v]) => v.approval);
    lines.push('', '## 出品許可申請が必要なカテゴリ（Seller Central → 在庫 → 商品登録 → 出品許可を申請）', '', ...need.map(([k, v]) => `- **${k}**：${v.n} 件`), '', '> 注意：feed_product_type の正式値と推奨ブラウズノードは、各カテゴリのテンプレート（在庫ファイルのダウンロード）の「データ定義」「有効な値」シートで確認して category-map.json の browseNodes に入れること。');
    fs.writeFileSync(path.join(OUT, 'category-report.md'), lines.join('\n'));
    console.log(lines.join('\n'));
  },
  async refresh() {
    const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
    const SHOP = env.SHOPIFY_STORE_DOMAIN, VER = env.SHOPIFY_API_VERSION || '2026-10';
    const tr = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }) });
    if (!tr.ok) throw new Error(`token ${tr.status}`); const token = (await tr.json()).access_token;
    const gql = async (query, variables) => { const r = await fetch(`https://${SHOP}/admin/api/${VER}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': token }, body: JSON.stringify({ query, variables }) }); const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data; };
    let cursor = null; const all = [];
    for (;;) {
      const d = await gql(`query($c:String){ products(first:100, after:$c, query:"vendor:ANET status:active"){ pageInfo{hasNextPage endCursor} nodes{ id handle title description productType tags options{ name values } variants(first:50){ nodes{ id title price compareAtPrice sku selectedOptions{ name value } } } media(first:12){ nodes{ ... on MediaImage { image{ url } } } } } } }`, { c: cursor });
      all.push(...d.products.nodes); log('fetched', all.length); if (!d.products.pageInfo.hasNextPage) break; cursor = d.products.pageInfo.endCursor;
    }
    fs.writeFileSync(path.join(OUT, 'products-live.json'), JSON.stringify(all, null, 1)); log('products-live.json', all.length);
  },
  build() {
    const ps = loadProducts(); const groups = {};
    let n = 0; const max = args.limit ? Number(args.limit) : Infinity;
    for (const p of ps) { const c = categorize(p); if (args.type && c.feed_product_type !== args.type) continue;
      if ((p.variants?.nodes ?? []).some((v) => !(Number(v.price) > 0))) { log('skip（Shopify 価格 0 のバリエーションあり）', p.handle); continue; }
      if (BATTERY_RE.test(p.title)) { log('skip（電池・充電式の可能性：電池属性が必要）', p.handle); continue; }
      if (n++ >= max) break; (groups[c.feed_product_type] ??= []).push(...rowsFor(p, c)); }
    const summary = [];
    for (const [type, rows] of Object.entries(groups)) {
      const h = headerRows(type); const unknown = new Set();
      const body = rows.map((r0) => { const r = h.newFormat ? newFormatRow(r0, type) : r0; for (const k of Object.keys(r)) if (!h.fields.includes(k) && r[k] !== '' && !/^(other_image_url[2-8]|bullet_point[2-5])$/.test(k)) unknown.add(k); return h.fields.map((k) => tsv(r[k])).join('\t'); });
      const f = path.join(OUT, `inventory-${type}.tsv`);
      fs.writeFileSync(f, '﻿' + [...h.rows.map((r) => r.join('\t')), ...body].join('\r\n') + '\r\n');
      summary.push(`${type}: ${rows.length} 行（${rows.filter((r) => r.parent_child !== 'child').length} 商品）→ ${path.relative(ROOT, f)}${h.fromTemplate ? '' : '  [ヘッダは既定値。templates/' + type + '.headers.tsv を置くと公式ヘッダで出力]'}${unknown.size ? '  テンプレートに無い列（捨てた）: ' + [...unknown].join(',') : ''}`);
    }
    console.log(summary.join('\n'));
    if (PRICING.length) { // 価格の根拠（卸の推定値・手数料率・税抜利益）を残す。利益 0 未満は出ない設計だが念のため件数を出す
      fs.writeFileSync(path.join(OUT, 'pricing.tsv'), '\ufeff' + ['handle\tvariant\ttype\tshopify\tcost_est\tamazon\tfee\tmarkup\tprofit_ex_tax', ...PRICING.map((r) => [r.handle, r.variant, r.type, r.shopify, r.cost, r.price, r.fee, (r.markup * 100).toFixed(0) + '%', r.profitEx].join('\t'))].join('\r\n') + '\r\n');
      const mk = PRICING.map((r) => r.markup).sort((a, b) => a - b);
      log('pricing', PRICING.length, 'variants, markup median', (mk[mk.length >> 1] * 100).toFixed(0) + '%', 'loss', PRICING.filter((r) => r.profitEx < 0).length, '→', path.relative(ROOT, path.join(OUT, 'pricing.tsv')));
    }
  },
  check() {
    const ps = loadProducts(); const lines = ['# 在庫ファイル点検', ''];
    let warn = 0;
    for (const p of ps) {
      const spec = specOf(p); const img = images(p); const issues = [];
      if (!spec) issues.push('spec.json 無し（箇条書きが説明文からの切り出しになる）');
      if (!img.main) issues.push('画像無し'); else if (img.others.length < 5) issues.push(`画像 ${1 + img.others.length} 枚のみ`);
      if (!/01-main-amazon|main-amazon/.test(img.main) && img.others.length >= 7) issues.push('メイン画像が 01-main-amazon ではない可能性（refresh を実行）');
      const t = title(p, spec); if (t.length < 10) issues.push(`タイトルが短い: ${t}`);
      const text = `${p.title} ${description(p, spec)} ${bullets(p, spec).join(' ')}`; const m = text.match(WARN_RE); if (m) issues.push(`要確認ワード「${m[0]}」（薬機法/景表法）`);
      if (p.variants.nodes.length > 1 && !variationTheme(p)) issues.push('バリエーションのテーマ不明');
      if (issues.length) { warn++; lines.push(`- ${p.handle}：${issues.join('；')}`); }
    }
    lines.splice(2, 0, `商品数 ${ps.length}、要確認 ${warn}`, '');
    fs.writeFileSync(path.join(OUT, 'check-report.md'), lines.join('\n')); console.log(lines.slice(0, 40).join('\n')); if (lines.length > 40) console.log(`... 全文は out/check-report.md`);
  },
};
if (!run[stage]) { console.error('usage: classify | refresh | build | check'); process.exit(2); }
Promise.resolve(run[stage]()).then(() => log('done', stage)).catch((e) => { console.error(e); process.exit(1); });
