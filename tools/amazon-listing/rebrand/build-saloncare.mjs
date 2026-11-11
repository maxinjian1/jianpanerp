/** SARADEMUNT 在售 SKU → SALONCARE 新建出品データ（11-11 カテゴリー別出品レポートのテンプレート形式）
 *
 *   node tools/amazon-listing/rebrand/build-saloncare.mjs [--only <prefix,...>] [--limit N]
 *
 * 入力
 *   in/category-report-2026-11-11/report.json   … テンプレート（ヘッダ 1〜6 行）と既存行（約 200 SKU は全属性あり）
 *   out/rebrand/attrs/part{1,2}.json            … 旧 SKU の完全属性（Listings 属性 JSON、値はコード）
 *   out/opt/<ASIN>/current.json                 … 商品ページの画像（フルサイズ URL）
 *   out/rebrand/image-plan.json                 … 旧ブランド字入り画像 → replace(修正版) / drop
 *   in/business-report-90d-2026-10-30.csv       … （親）ASIN（バリエーション分割の補助）
 * 出力
 *   out/rebrand/saloncare/rows.json   … 列番号 → 値（Python 側で xlsm に書く）
 *   out/rebrand/saloncare/review.csv  … 1 SKU 1 行の確認表
 *   out/rebrand/saloncare/warnings.txt
 *   out/rebrand/saloncare/upload-images.txt … japanerp.com に置く修正画像（ローカル → 公開パス）
 *
 * 方針（2026-11-11 用户全権委任）
 *   新 SKU = 旧 SKU + "-SC"、親 SKU = "SC-<前缀>-<商品タイプ>"、GTIN 免除、ブランド SALONCARE、
 *   旧ブランド表記（SARADEMUNT / サラデマント）はテキストから全て置換、画像は image-plan に従う。
 *   価格・配送チャネル（FBA）は旧 SKU と同じ。新 SKU は在庫 0 から（FBA 納品は別途）。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const A = (p) => path.join(ROOT, 'tools/amazon-listing', p);
const OUT = A('out/rebrand/saloncare');
fs.mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const ONLY = opt('--only')?.split(',');
const LIMIT = +(opt('--limit') ?? 0);
const IMG_BASE = 'https://cdn.shopify.com/';
// 修正画像は host-images.mjs で Shopify CDN に置いた URL（japanerp.com は Cloudflare 静的サイトで /img/ が届かない）
const HOSTED = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'hosted.json'), 'utf8')); } catch { return {}; } })();

const R = JSON.parse(fs.readFileSync(A('in/category-report-2026-11-11/report.json'), 'utf8'));
const T = R['0_APPAREL-VEST.xlsm|テンプレート'];
const H = T[4];
const strip = (k) => k.replace(/\[[^\]]*\]/g, '');
const COL = {}; H.forEach((k, i) => { if (k) COL[strip(k)] ??= i; });
const C = (k) => { const i = COL[k]; if (i == null) throw new Error('no column ' + k); return i; };
const PTMAP = (() => { // 商品タイプ → 使える列
  const m = R['0_APPAREL-VEST.xlsm|AttributePTDMAP']; const types = m[0]; const ok = {};
  for (const row of m.slice(1)) { const col = COL[strip(String(row[0]))]; if (col == null) continue; types.forEach((t, j) => { if (j && row[j] == 1) (ok[t] ??= new Set()).add(col); }); }
  return ok;
})();

const attrs = { ...JSON.parse(fs.readFileSync(A('out/rebrand/attrs/part1.json'), 'utf8')), ...JSON.parse(fs.readFileSync(A('out/rebrand/attrs/part2.json'), 'utf8')) };
const imsv = (sku) => { const d = attrs[sku]?.data?.reconciledListing?.detailPageListingResponseImsv3; try { return d ? JSON.parse(d) : null; } catch { return null; } };
const plan = JSON.parse(fs.readFileSync(A('out/rebrand/image-plan.json'), 'utf8'));
const parentOf = (() => { const m = {}; const t = fs.readFileSync(A('in/business-report-90d-2026-10-30.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1);
  for (const l of t) { const c = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((s) => s.replace(/,$/, '').replace(/^"|"$/g, '')); if (c?.[1]) m[c[1]] = c[0]; } return m; })();

// Listings 属性 JSON → { strippedColumnKey: value }
function flatten(o) {
  const out = {};
  const walk = (v, key) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${key}#${i + 1}`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (k === 'marketplace_id' || k === 'language_tag') continue; walk(x, `${key}.${k}`); }
    else out[key] = String(v);
  };
  for (const [k, v] of Object.entries(o ?? {})) walk(v, k);
  return out;
}

const BRAND_RE = /\[?\s*(SARADEMUNT|Sarademunt|sarademunt|サラデマント)\s*[\]〕】]?/g;
const rebrand = (s) => {
  if (!s) return s;
  let t = String(s).replace(BRAND_RE, ' SALONCARE ').replace(/(SALONCARE\s*)+/g, 'SALONCARE ').replace(/[ 　]{2,}/g, ' ').trim();
  return t;
};
const titleOf = (s) => { let t = rebrand(s).replace(/^\[?SALONCARE\]?\s*/, ''); return ('SALONCARE ' + t).slice(0, 150); };

// 旧行
const br = C('brand#1.value');
const OLD = T.slice(6).filter((x) => x[2] && x[0] === '有効' && (x[br] === 'SARADEMUNT' || /SARADEMUNT/.test(x[1])) && !/-SC$/.test(x[2]));
const full = (row) => row.filter((v) => v !== '').length > 40;

// コード → ラベル（全属性のある旧行と属性 JSON を突き合わせて学習）
const LABEL = {}; // col → code → label
for (const row of T.slice(6).filter((x) => x[2] && full(x))) {
  const f = flatten(imsv(row[2])); for (const [k, code] of Object.entries(f)) { const c = COL[k]; if (c == null || row[c] === '' || row[c] === code) continue; (LABEL[c] ??= {})[code] ??= row[c]; }
}
const GENERIC = { true: 'はい', false: 'いいえ', centimeters: 'センチメートル', kilograms: 'キログラム', grams: 'グラム', millimeters: 'ミリメートル', meters: 'メートル', female: '女性', male: '男性', unisex: 'ユニセックス', not_applicable: '該当なし', new_new: '新品' };
// 学習で拾えなかったコード → テンプレート「推奨値」シートのラベル（2026-11-12 確認）。辞書に無い英小文字コードは列ごと落とす
const SIZE = { s: 'S', m: 'M', l: 'L', x_l: 'XL', xx_l: '2XL', x_s: 'XS', free_size: 'Free Size' };
const CODE = {
  size_system: { as7: 'JP' }, size_class: { alpha: 'アルファベット' }, size: SIZE, size_to: SIZE, 'size.value': SIZE,
  'apparel_fabric_weight_class.value': { lightweight: '軽量', medium_weight: '中重量（201-267 GSM）', heavyweight: '重量（336-403 GSM）' },
  'apparel_fabric_stretch.value': { no_stretch: 'ストレッチなし', low_stretch: '低ストレッチ', medium_stretch: 'ミディアムストレッチ', high_stretch: 'ハイストレッチ' },
  'sleeve.length_description.value': { sleeveless: 'ノースリーブ', short_sleeve: '半袖', half_sleeve: '五分袖', long_sleeve: '長袖' },
  'formality_level.value': { casual: 'カジュアル', business_casual: 'ビジネスカジュアル', semi_formal: 'セミフォーマル' },
  'fit_to_size_sentiment.value': { fits_true_to_size: 'サイズ通り', runs_large: '大きめ', runs_small: '小さめ' },
  'fabric_stretchability.value': { stretchable: '伸縮可能', non_stretchable: '伸縮性なし' },
  'sweater_form.value': { cardigan: 'カーディガン', sweater_vest: 'セーターベスト', sweater_pullover: 'セータープルオーバー' },
  'undergarment_slip_form.value': { half_slip: 'ハーフスリップ', full_slip: 'フルスリップ' },
  'skirt_silhouette.value': { a_line_skirt: 'Aラインスカート', bodycon_skirt: 'ボディコンスカート' },
  'swimwear_form_type.value': { one_piece: 'ワンピース' }, 'rise.style.value': { low: 'ロー' }, 'strap_type.value': { adjustable: '調節可能' },
};
const isCode = (v) => /^[a-z][a-z0-9_]*$/.test(v);
const toLabel = (c, code) => {
  const l = LABEL[c]?.[code] ?? GENERIC[code]; if (l) return l; if (!isCode(code)) return code;
  const a = strip(H[c]).replace(/#\d+/g, ''); const leaf = a.split('.').pop();
  return CODE[a]?.[code] ?? (/_size$/.test(a.split('.')[0]) ? CODE[leaf]?.[code] : undefined) ?? null;
};

// 画像：ページの画像（フルサイズ）→ image-plan に従い置換/除外
const uploads = new Map();
function imagesFor(asin, f) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(A(`out/opt/${asin}/current.json`), 'utf8')).images ?? []; } catch {}
  if (!list.length) list = Object.keys(f).filter((k) => /^(main_product_image_locator|pt0\d_image_url|detail_page_primary_image_url)/.test(k)).map((k) => f[k]);
  const norm = (u) => u.replace(/\._[^.]+_(?=\.(jpg|png|jpeg)$)/i, '');
  const outL = [];
  for (const u0 of list) {
    const u = norm(u0); if (outL.includes(u)) continue;
    const p = plan[u];
    if (p?.action === 'drop') continue;
    if (p?.action === 'replace') { const rel = p.file.split('/fixed/')[1]; const pub = HOSTED[rel]; uploads.set(p.file, rel); if (pub) outL.push(pub); else warns.push(`${asin}\t修正画像未ホスト ${rel}`); continue; }
    outL.push(u);
  }
  return outL.slice(0, 9);
}

const warns = [];
const children = [];
for (const row of OLD) {
  const sku = row[2]; const asin = row[C('amzn1.volt.ca.product_id_value')]; const pt = row[3];
  if (ONLY && !ONLY.includes(sku.split('-')[0])) continue;
  const o = imsv(sku);
  if (!o && !full(row)) { warns.push(`${sku}\t属性なし・スキップ`); continue; }
  const v = {};
  if (full(row)) row.forEach((x, i) => { if (x !== '') v[i] = x; });
  else for (const [k, code] of Object.entries(flatten(o))) { const c = COL[k]; if (c == null) continue; const l = toLabel(c, code); if (l != null) v[c] = l; }
  // 参照列・識別子・バリエーション・画像・オファー系はクリアして作り直す
  for (const k of Object.keys(v)) { const key = strip(H[k]); if (/^::|^amzn1\.volt|^contribution_sku|^parentage_level|^child_parent|^variation_theme|image_locator|_image_url|^purchasable_offer|^fulfillment_availability|^list_price|^merchant_shipping|^externally_assigned|^skip_offer|^product_site_launch|^sales_rank|^detail_page/.test(key)) delete v[k]; }
  // 文字列の旧ブランド置換
  for (const k of Object.keys(v)) if (typeof v[k] === 'string' && BRAND_RE.test(v[k])) { BRAND_RE.lastIndex = 0; v[k] = rebrand(v[k]); }
  BRAND_RE.lastIndex = 0;
  const prefix = sku.split('-')[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const title = titleOf(v[C('item_name#1.value')] ?? row[1]).replace(new RegExp(`\\s*\\S*${prefix}\\S*`, 'gi'), '').trim(); // 型番を除く
  const imgs = imagesFor(asin, o ? flatten(o) : {});
  if (!imgs.length) warns.push(`${sku}\t画像なし`);
  const color = v[C('color#1.value')] ?? ''; const size = v[C('size#1.value')] ?? '';
  const theme = o?.variation_theme?.[0]?.name ?? '';
  children.push({ sku, asin, pt, v, title, imgs, color, size, theme, price: row[C('purchasable_offer#1.our_price#1.schedule#1.value_with_tax')], fc: row[C('fulfillment_availability#1.fulfillment_channel_code')], par: parentOf[asin] ?? '' });
  if (LIMIT && children.length >= LIMIT) break;
}

// 家族：前缀 + 商品タイプ。同じ 色×サイズ が重なったら（親）ASIN で分け、それでも重なれば単品出品
const fam = new Map();
for (const c of children) { const k = `${c.sku.split('-')[0]}|${c.pt}`; (fam.get(k) ?? fam.set(k, []).get(k)).push(c); }
const THEME = { 'SIZE/COLOR': 'サイズ/色', 'COLOR/SIZE': 'サイズ/色', SIZE_NAME_COLOR_NAME: 'サイズ/色', COLOR: '色', SIZE: 'サイズ', COLOR_NAME: '色', SIZE_NAME: 'サイズ' };
const families = [];
for (const [k, list] of fam) {
  const groups = [];
  const seenKey = (g, c) => g.some((x) => x.color === c.color && x.size === c.size);
  for (const c of list) { let g = groups.find((g) => !seenKey(g.items, c) && (!g.par || !c.par || g.par === c.par)); if (!g) groups.push(g = { items: [], par: c.par }); g.items.push(c); if (!g.par) g.par = c.par; }
  groups.forEach((g, i) => {
    const [prefix, pt] = k.split('|');
    if (g.items.length === 1) { families.push({ parent: null, items: g.items }); return; }
    const hasC = g.items.some((x) => x.color) , hasS = g.items.some((x) => x.size);
    const theme = hasC && hasS ? 'サイズ/色' : hasC ? '色' : hasS ? 'サイズ' : null;
    if (!theme) { g.items.forEach((x) => families.push({ parent: null, items: [x] })); return; }
    families.push({ parent: `SC-${prefix}-${pt}${groups.length > 1 ? '-' + (i + 1) : ''}`, theme, items: g.items });
  });
}

const rows = [];
const review = [['新SKU', '親SKU', '旧SKU', '旧ASIN', '商品タイプ', '色', 'サイズ', '価格', '画像数', '修正画像', 'タイトル']];
const set = (v, k, val) => { v[C(k)] = val; };
for (const f of families) {
  if (f.parent) {
    const a = f.items[0]; const v = {};
    for (const k of ['brand#1.value', 'product_description#1.value', 'department#1.value', 'target_gender#1.value', 'age_range_description#1.value', 'recommended_browse_nodes#1.value', 'fabric_type#1.value', 'country_of_origin#1.value', 'supplier_declared_dg_hz_regulation#1.value', 'style#1.value', 'material#1.value'].concat([1, 2, 3, 4, 5].map((n) => `bullet_point#${n}.value`))) { const c = COL[k]; if (c != null && a.v[c] != null) v[c] = a.v[c]; }
    set(v, 'contribution_sku#1.value', f.parent); set(v, 'product_type#1.value', a.pt); set(v, '::record_action', '作成または置換 (完全更新)');
    set(v, 'parentage_level#1.value', '親'); set(v, 'variation_theme#1.name', f.theme);
    set(v, 'item_name#1.value', a.title.replace(new RegExp(`\\s*${a.color.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '').trim() || a.title);
    set(v, 'brand#1.value', 'SALONCARE'); set(v, 'amzn1.volt.ca.product_id_type', 'GTIN免除');
    a.imgs.forEach((u, i) => set(v, i === 0 ? 'main_product_image_locator#1.media_location' : `other_product_image_locator_${i}#1.media_location`, u));
    set(v, 'condition_type#1.value', '新品'); set(v, 'skip_offer#1.value', 'いいえ'); set(v, 'batteries_required#1.value', 'いいえ');
    rows.push(v); review.push([f.parent, '', '', '', a.pt, '', '', '', a.imgs.length, '', v[C('item_name#1.value')]]);
  }
  for (const c of f.items) {
    const v = { ...c.v };
    set(v, 'contribution_sku#1.value', c.sku + '-SC'); set(v, 'product_type#1.value', c.pt); set(v, '::record_action', '作成または置換 (完全更新)');
    if (f.parent) { set(v, 'parentage_level#1.value', '子供'); set(v, 'child_parent_sku_relationship#1.parent_sku', f.parent); set(v, 'variation_theme#1.name', f.theme); }
    set(v, 'item_name#1.value', c.title); set(v, 'brand#1.value', 'SALONCARE'); set(v, 'amzn1.volt.ca.product_id_type', 'GTIN免除');
    c.imgs.forEach((u, i) => set(v, i === 0 ? 'main_product_image_locator#1.media_location' : `other_product_image_locator_${i}#1.media_location`, u));
    set(v, 'condition_type#1.value', '新品');
    // 試作 2238 の処理レポートで必須と出た項目（無ければ既定値）
    v[C('special_size_type#1.value')] ??= '標準'; v[C('distribution_designation#1.value')] ??= '正規品'; v[C('batteries_required#1.value')] ??= 'いいえ';
    if (c.price) set(v, 'purchasable_offer#1.our_price#1.schedule#1.value_with_tax', c.price); else warns.push(`${c.sku}\t価格なし`);
    set(v, 'fulfillment_availability#1.fulfillment_channel_code', c.fc || 'フルフィルメントby Amazon（JP）');
    rows.push(v);
    review.push([c.sku + '-SC', f.parent ?? '', c.sku, c.asin, c.pt, c.color, c.size, c.price, c.imgs.length, c.imgs.filter((u) => u.startsWith(IMG_BASE)).length, c.title]);
  }
}

const q = (s) => /[",\r\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s);
fs.writeFileSync(path.join(OUT, 'rows.json'), JSON.stringify(rows));
fs.writeFileSync(path.join(OUT, 'review.csv'), '﻿' + review.map((r) => r.map(q).join(',')).join('\r\n'));
fs.writeFileSync(path.join(OUT, 'warnings.txt'), warns.join('\n'));
fs.writeFileSync(path.join(OUT, 'upload-images.txt'), [...uploads].map(([l, r]) => `${l}\t${r}`).join('\n'));
const nParents = families.filter((f) => f.parent).length;
console.log({ old: OLD.length, children: children.length, parents: nParents, standalone: families.filter((f) => !f.parent).length, rows: rows.length, fixedImages: uploads.size, warnings: warns.length });
