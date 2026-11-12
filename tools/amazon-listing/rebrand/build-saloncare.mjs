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
import crypto from 'node:crypto';

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

const attrs = Object.assign({}, ...['part1', 'part2', 'part3'].map((p) => A(`out/rebrand/attrs/${p}.json`)).filter((f) => fs.existsSync(f)).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')))); // part3 = 11-12 補読（211218TPC-PINK-L）
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

// 試作 2 回目（92 行中 4 成功）の処理レポートで必須と出た項目を、旧ページの文言から埋める。
// 選択肢は「推奨値」シートの商品タイプ別リスト（無い商品タイプは汎用値）。素材が文言に無ければ埋めない（推測しない）
const REC = (() => { const m = {}; for (const r of R['0_APPAREL-VEST.xlsm|推奨値']) { const h = String(r[1]); const mm = h.match(/^(.+?) - \[ (\w+) \]$/); if (mm) (m[mm[1]] ??= {})[mm[2]] = r.slice(2).filter(Boolean); } return m; })();
const pick = (attr, pt, prefs, dflt) => { const opts = REC[attr]?.[pt]; if (!opts) return dflt; for (const p of prefs) { const o = opts.find((x) => x.startsWith(p)); if (o) return o; } return dflt === null ? null : opts.includes(dflt) ? dflt : null; };
const pageOf = (asin) => { try { return JSON.parse(fs.readFileSync(A(`out/opt/${asin}/current.json`), 'utf8')); } catch { return {}; } };
const FIBER = /(ポリエステル|ポリウレタン|ポリアミド|ナイロン|コットン|綿|レーヨン|スパンデックス|ナイロン|アクリル|ウール|シルク|麻|リネン|モダール|ビスコース)\s*[0-9０-９]{0,3}\s*[%％]?/g;
function fillRequired(v, { pt, asin, prefix, price, listPrice }) {
  const pg = pageOf(asin); const text = [v[C('item_name#1.value')], pg.title, ...(pg.bullets ?? []), pg.description, v[C('product_description#1.value')]].filter(Boolean).join('\n');
  const put = (k, val) => { const c = COL[k]; if (c != null && (v[c] == null || v[c] === '') && val != null && val !== '') v[c] = val; };
  // 旧出品に残っていた中国語の文言（かな無し＋簡体字）は使わない：説明は旧ページの日本語説明に、箇条書きは削除、単位は「個」
  const ZH = (x) => typeof x === 'string' && !/[ぁ-ん]/.test(x) && /[这们个么产设适颜码时让为发热请选择号该款开带罩弹压长贴种]/.test(x);
  for (const k of ['product_description#1.value', ...[1, 2, 3, 4, 5].map((n) => `bullet_point#${n}.value`)]) { const c = COL[k]; if (c != null && ZH(v[c])) delete v[c]; }
  const ZHW = [[/涤纶/g, 'ポリエステル'], [/尼龙/g, 'ナイロン'], [/丙烯酸/g, 'アクリル'], [/粘纤/g, 'レーヨン'], [/亚麻/g, 'リネン'], [/混纺/g, '混'], [/丝绸/g, 'シルク'], [/^棉$|棉(?=[ ,、混]|$)/g, 'コットン']];
  for (const k of ['material#1.value', 'material#2.value', 'material#3.value', 'fabric_type#1.value']) { const c = COL[k]; if (c != null && typeof v[c] === 'string') { for (const [re, w] of ZHW) v[c] = v[c].replace(re, w); if (/泰派/.test(v[c])) delete v[c]; } }
  for (const c of Object.keys(v)) if (typeof v[c] === 'string' && !/[ぁ-ん]/.test(v[c]) && /[涤纶尼龙丙烯粘纤亚纺宽松泰]/.test(v[c])) delete v[c];
  for (const c of Object.keys(v)) if (v[c] === '每个') v[c] = '個'; else if (v[c] === '魔术贴') v[c] = '面ファスナー'; else if (ZH(v[c])) delete v[c];
  put('model_name#1.value', prefix);
  put('list_price#1.value', listPrice || price);
  put('product_description#1.value', pg.description && !ZH(pg.description) ? rebrand(pg.description).slice(0, 2000) : (pg.bullets ?? []).map(rebrand).join('\n').slice(0, 2000));
  BRAND_RE.lastIndex = 0;
  const cl = /ファスナー|ジッパー/.test(text) ? ['ファスナー', 'ジッパー'] : /ホック/.test(text) ? ['鉤ホック', 'かぎホック', 'フックアンドバー'] : /ボタン/.test(text) ? ['ボタン'] : [];
  put('closure#1.type#1.value', pick('留め具の種類', pt, [...cl, 'プルオン'], 'プルオン'));
  const fib = [...new Set((text.match(FIBER) ?? []).map((s) => s.trim()))];
  if (fib.length) put('fabric_type#1.value', fib.slice(0, 4).join('、'));
  else if (v[C('fabric_type#1.value')] == null) warns.push(`${prefix}\t${asin}\t素材が文言に無い`);
  { const c = COL['style#1.value']; if (c != null && typeof v[c] === 'string' && !/[ぁ-んァ-ヶA-Za-z]/.test(v[c])) delete v[c]; } // 旧データの中国語（「只需套上即可」等）は捨てる
  put('style#1.value', pick('スタイル', pt, [...(/ポンチョ/.test(text) ? ['ポンチョコート'] : []), ...(/かぶる/.test(text) ? ['ピナフォア'] : []), 'カジュアル', 'モダン', 'クラシック'], 'カジュアル'));
  const care = /手洗い/.test(text) ? ['手洗い'] : /洗濯機|ネット/.test(text) ? ['洗濯機'] : ['手洗い'];
  put('care_instructions#1.value', pick('お手入れ方法', pt, care, '手洗いのみ'));
  put('number_of_items#1.value', '1'); put('number_of_pieces#1.value', '1');
  const len = /マキシ|ロング/.test(text) ? ['ロング', 'マキシ', 'アンクル'] : /ミニ/.test(text) ? ['ミニ'] : /膝|ひざ|ニー/.test(text) ? ['ニー', '膝'] : [];
  put('item_length_description#1.value', pick('商品の長さの説明', pt, [...len, 'スタンダード', '標準', 'ミディ'], null));
  // ---- 本番 A/B（810/1231 成功）の処理レポート対応 ----
  // サイズ：商品タイプごとに要る構造が違う（アパレル/シェイプウェア/ボトムス/シャツ）。全部に同じ値を入れ、対象外は Amazon が無視（警告のみ）
  const SZ = { s: 'S', m: 'M', l: 'L', x_l: 'XL', xx_l: '2XL', '2x_l': '2XL', '3x_l': '3XL', x_s: 'XS', free_size: 'Free Size', 'フリーサイズ': 'Free Size', 'フリー': 'Free Size', 'ワンサイズ': 'Free Size', LL: 'XL', '2L': '2XL', '3L': '3XL' };
  const raw = ['apparel_size#1.size', 'shapewear_size#1.size', 'bottoms_size#1.size', 'shirt_size#1.size', 'size#1.value'].map((k) => v[COL[k]]).find((x) => x != null && x !== '');
  let sz = raw == null ? 'Free Size' : (SZ[raw] ?? SZ[String(raw).toUpperCase()] ?? String(raw).toUpperCase().replace(/^XXL$/, '2XL').replace(/^XXXL$/, '3XL'));
  if (!/^(XS|S|M|L|XL|[2-5]XL|Free Size)$/.test(sz)) sz = /フリー|FREE|ONE/i.test(String(raw)) ? 'Free Size' : sz;
  for (const g of ['apparel_size', 'shapewear_size', 'bottoms_size', 'shirt_size']) {
    const c = COL[`${g}#1.size`]; if (c != null && (v[c] == null || v[c] === '' || /_/.test(v[c]))) v[c] = sz;
    put(`${g}#1.size_class`, 'アルファベット'); put(`${g}#1.size_system`, 'JP');
  }
  put('target_gender#1.value', /メンズ|男性/.test(text) && !/レディース|女性/.test(text) ? '男性' : '女性');
  put('age_range_description#1.value', '大人');
  put('fit_type#1.value', pick('フィットタイプ', pt, [...(/ゆったり|オーバーサイズ/.test(text) ? ['ゆったり'] : []), 'レギュラー'], 'レギュラー'));
  { const c = COL['sleeve#1.type#2.value']; if (c != null) delete v[c]; } // 袖のタイプは 1 つまで
  { const c = COL['waist#1.size#1.unit']; if (c != null && /センチ/.test(v[c] ?? '')) v[c] = 'cm'; }
  // 単位は値があるときだけ（値なしで単位だけ入れると 99022）。値が無い行は後で同じ型番・商品タイプの兄弟から写す
  for (const d of ['length', 'width', 'height']) if (v[COL[`item_package_dimensions#1.${d}.value`]] != null) put(`item_package_dimensions#1.${d}.unit`, 'センチメートル');
  if (v[COL['item_package_weight#1.value']] != null) put('item_package_weight#1.unit', 'キログラム');
  // 素材（material）：素材構成の主繊維 → 推奨値の語
  const MAT = [[/ポリエステル/, 'ポリエステル'], [/綿|コットン/, 'コットン'], [/ナイロン|ポリアミド/, 'ナイロン'], [/レーヨン|ビスコース/, 'レーヨン'], [/麻|リネン/, 'リネン'], [/ウール/, 'ウール'], [/シルク/, 'シルク'], [/アクリル/, 'アクリル'], [/モダール/, 'モダール'], [/スパンデックス|ポリウレタン/, 'スパンデックス']];
  const fab = String(v[COL['fabric_type#1.value']] ?? '');
  const mats = MAT.filter(([re]) => re.test(fab)).map(([, w]) => w);
  if (mats.length) put('material#1.value', pick('素材', pt, mats.length > 1 ? [mats[0] + '混', mats[0]] : [mats[0]], mats[0]) ?? mats[0]);
  // 箇条書き：レビュー依頼・満足保証・返品の文言は規約違反（99300）→ その行を落とし、空いたら旧ページの箇条書きで補う
  const bad = /レビュー|口コミ|満足度?保証|返金|返品|★5|星5/;
  const bl = [1, 2, 3, 4, 5].map((n) => v[COL[`bullet_point#${n}.value`]]).filter((x) => x && !bad.test(x) && !ZH(x));
  if (!bl.length) for (const b of pg.bullets ?? []) if (!bad.test(b) && !ZH(b)) bl.push(rebrand(b));
  BRAND_RE.lastIndex = 0;
  [1, 2, 3, 4, 5].forEach((n, i) => { const c = COL[`bullet_point#${n}.value`]; if (bl[i]) v[c] = bl[i]; else delete v[c]; });
}
// 商品名：同じ語を 2 回以上使うと 100470（例「ショートパンツ … パンツ」）→ 他の語に含まれる語・重複語を落とす
const dedupeTitle0 = (t) => { const w = t.split(/\s+/); return w.filter((x, i) => !w.some((y, j) => j !== i && y !== x && y.includes(x) && x.length >= 2) && w.indexOf(x) === i).join(' '); };
// 複合語でも同じカタカナ語（3 字以上、例「毛糸パンツ 腹巻きパンツ ニットパンツ」）が 2 語以上に出たら、2 つ目以降の語を落とす（末尾 2 語＝色・サイズは残す）
const dedupeTitle = (t) => { const w = dedupeTitle0(t).split(' '); const seen = new Set(); return w.filter((x, i) => { if (i >= w.length - 2) return true; const ks = x.match(/[ァ-ヶー]{3,}/g) ?? []; if (ks.some((k) => [...seen].some((s) => s.includes(k) || k.includes(s)))) return false; ks.forEach((k) => seen.add(k)); return true; }).join(' '); };
const REJECT = (() => { try { return JSON.parse(fs.readFileSync(path.join(OUT, 'image-reject.json'), 'utf8')); } catch { return {}; } })();
const modelOf = (sku) => (sku.startsWith('FBA-') ? sku.split('-')[1] : sku.split('-')[0]);
// SKU は 40 バイトまで（90118）。超える場合は非 ASCII 部分を短いハッシュに
const newSku = (old) => { const s = old + '-SC'; if (Buffer.byteLength(s) <= 40) return s; return old.replace(/[^\x00-\x7f]+/g, (m) => 'j' + crypto.createHash('md5').update(m).digest('hex').slice(0, 6)) + '-SC'; };
// メイン画像にマネキン（18185）→ 2 枚目をメインに
const MANNEQUIN = new Set(['221111T-beige', '221111T-pink']);

// 画像：ページの画像（フルサイズ）→ image-plan に従い置換/除外
const uploads = new Map();
function imagesFor(asin, f) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(A(`out/opt/${asin}/current.json`), 'utf8')).images ?? []; } catch {}
  // ページの画像に加え、属性 JSON の pt01〜08 も足す（空欄の枠は Amazon 側に前回の画像が残るため、できるだけ埋める）
  const idOf = (u) => (u.match(/\/I\/([^._]+)/) ?? [])[1];
  const extra = Object.keys(f).filter((k) => /^(main_product_image_locator|pt0\d_image_url|detail_page_primary_image_url)/.test(k)).sort().map((k) => f[k]);
  for (const u of extra) if (!list.some((x) => idOf(x) === idOf(u))) list.push(u);
  const norm = (u) => u.replace(/\._[^.]+_(?=\.(jpg|png|jpeg)$)/i, '');
  const outL = [];
  for (const u0 of list) {
    const u = norm(u0); if (outL.includes(u)) continue;
    const p = plan[u];
    if (p?.action === 'drop') continue;
    if (p?.action === 'replace') { const rel = p.file.split('/fixed/')[1]; const pub = HOSTED[rel]; uploads.set(p.file, rel); if (pub) outL.push(pub); else warns.push(`${asin}\t修正画像未ホスト ${rel}`); continue; }
    if (/\.gif$/i.test(u)) continue; // 160px のプレースホルダ GIF（20009）
    if (/play-button|PKmb|SX\d+_SY\d+/.test(u)) continue; // 動画サムネイル（38×50、再生ボタン付き）→ 100232「性的に露骨/子供モデル」と誤判定される
    outL.push(u);
  }
  return outL.slice(0, 9);
}

const warns = [];
const children = [];
for (const row of OLD) {
  const sku = row[2]; const asin = row[C('amzn1.volt.ca.product_id_value')]; const pt = row[3];
  if (ONLY && !ONLY.includes(sku.split('-')[0])) continue;
  if (REJECT.skip?.[sku]) { warns.push(`${sku}\t除外：${REJECT.skip[sku]}`); continue; }
  const o = imsv(sku);
  if (!o && !full(row)) { warns.push(`${sku}\t属性なし・スキップ`); continue; }
  const v = {};
  if (full(row)) row.forEach((x, i) => { if (x !== '') v[i] = x; });
  else for (const [k, code] of Object.entries(flatten(o))) { const c = COL[k]; if (c == null) continue; const l = toLabel(c, code); if (l != null) v[c] = l; }
  // 参照列・識別子・バリエーション・画像・オファー系はクリアして作り直す
  for (const k of Object.keys(v)) { const key = strip(H[k]); if (/^::|^amzn1\.volt|^contribution_sku|^parentage_level|^child_parent|^variation_theme|image_locator|_image_url|^purchasable_offer|^fulfillment_availability|^merchant_shipping|^externally_assigned|^skip_offer|^product_site_launch|^sales_rank|^detail_page/.test(key)) delete v[k]; }
  // 文字列の旧ブランド置換
  for (const k of Object.keys(v)) if (typeof v[k] === 'string' && BRAND_RE.test(v[k])) { BRAND_RE.lastIndex = 0; v[k] = rebrand(v[k]); }
  BRAND_RE.lastIndex = 0;
  const prefix = modelOf(sku).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const title = titleOf(v[C('item_name#1.value')] ?? row[1]).replace(new RegExp(`\\s*\\S*${prefix}\\S*`, 'gi'), '').trim(); // 型番を除く
  const titleD = dedupeTitle(title);
  const imgs = imagesFor(asin, o ? flatten(o) : {});
  if (!imgs.length) { warns.push(`${sku}\t画像なし・スキップ`); continue; }
  const color = v[C('color#1.value')] ?? ''; const size = v[C('size#1.value')] ?? '';
  const theme = o?.variation_theme?.[0]?.name ?? '';
  children.push({ sku, asin, pt, v, title: titleD, imgs: MANNEQUIN.has(sku) && imgs.length > 1 ? [...imgs.slice(1), imgs[0]] : imgs, color, size, theme, listPrice: row[C('list_price#1.value')] || (o ? flatten(o)['list_price#1.value'] : ''), price: row[C('purchasable_offer#1.our_price#1.schedule#1.value_with_tax')], fc: row[C('fulfillment_availability#1.fulfillment_channel_code')], par: parentOf[asin] ?? '' });
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
    fillRequired(v, { pt: a.pt, asin: a.asin, prefix: modelOf(a.sku) });
    rows.push(v); review.push([f.parent, '', '', '', a.pt, '', '', '', a.imgs.length, '', v[C('item_name#1.value')]]);
  }
  for (const c of f.items) {
    const v = { ...c.v };
    set(v, 'contribution_sku#1.value', newSku(c.sku)); set(v, 'product_type#1.value', c.pt); set(v, '::record_action', '作成または置換 (完全更新)');
    if (f.parent) { set(v, 'parentage_level#1.value', '子供'); set(v, 'child_parent_sku_relationship#1.parent_sku', f.parent); set(v, 'variation_theme#1.name', f.theme); }
    set(v, 'item_name#1.value', c.title); set(v, 'brand#1.value', 'SALONCARE'); set(v, 'amzn1.volt.ca.product_id_type', 'GTIN免除');
    c.imgs.forEach((u, i) => set(v, i === 0 ? 'main_product_image_locator#1.media_location' : `other_product_image_locator_${i}#1.media_location`, u));
    set(v, 'condition_type#1.value', '新品');
    // 試作 2238 の処理レポートで必須と出た項目（無ければ既定値）
    v[C('special_size_type#1.value')] ??= '標準'; v[C('distribution_designation#1.value')] ??= '正規品'; v[C('batteries_required#1.value')] ??= 'いいえ';
    fillRequired(v, { pt: c.pt, asin: c.asin, prefix: modelOf(c.sku), price: c.price, listPrice: c.listPrice });
    if (c.price) set(v, 'purchasable_offer#1.our_price#1.schedule#1.value_with_tax', c.price); else warns.push(`${c.sku}\t価格なし`);
    set(v, 'fulfillment_availability#1.fulfillment_channel_code', c.fc || 'フルフィルメントby Amazon（JP）');
    rows.push(v);
    review.push([newSku(c.sku), f.parent ?? '', c.sku, c.asin, c.pt, c.color, c.size, c.price, c.imgs.length, c.imgs.filter((u) => u.startsWith(IMG_BASE)).length, c.title]);
  }
}

const q = (s) => /[",\r\n]/.test(String(s)) ? `"${String(s).replace(/"/g, '""')}"` : String(s);
// 前回送った画像（動画サムネイル）が Amazon 側の枠に残っている SKU（image-reject.json fillSlot）→ 手持ちの画像を繰り返して、その枠まで埋めて上書きする
for (const v of rows) {
  const n = REJECT.fillSlot?.[v[C('contribution_sku#1.value')]]; if (!n) continue;
  const slot = (i) => C(i === 0 ? 'main_product_image_locator#1.media_location' : `other_product_image_locator_${i}#1.media_location`);
  const have = []; for (let i = 0; i <= 8; i++) if (v[slot(i)]) have.push(v[slot(i)]);
  for (let i = 1; i <= n; i++) if (!v[slot(i)]) v[slot(i)] = have[i % have.length];
}
// 梱包サイズ・重量が無い行（例 220523-b）→ 同じ型番・商品タイプの行から写す
{
  const PK = ['length', 'width', 'height'].flatMap((d) => [`item_package_dimensions#1.${d}.value`, `item_package_dimensions#1.${d}.unit`]).concat(['item_package_weight#1.value', 'item_package_weight#1.unit']).map((k) => COL[k]);
  const key = (v) => `${modelOf(String(v[C('contribution_sku#1.value')]).replace(/^SC-/, '').replace(/-SC$/, ''))}|${v[C('product_type#1.value')]}`;
  const donor = {}; for (const v of rows) if (PK.every((c) => v[c] != null && v[c] !== '')) donor[key(v)] ??= v;
  let filled = 0; for (const v of rows) if (PK.some((c) => v[c] == null || v[c] === '')) { const d = donor[key(v)]; if (d) { PK.forEach((c) => { v[c] = d[c]; }); filled++; } else warns.push(`${v[C('contribution_sku#1.value')]}\t梱包サイズなし`); }
  console.log('package dims copied', filled);
}
fs.writeFileSync(path.join(OUT, 'rows.json'), JSON.stringify(rows));
fs.writeFileSync(path.join(OUT, 'review.csv'), '﻿' + review.map((r) => r.map(q).join(',')).join('\r\n'));
fs.writeFileSync(path.join(OUT, 'warnings.txt'), warns.join('\n'));
fs.writeFileSync(path.join(OUT, 'upload-images.txt'), [...uploads].map(([l, r]) => `${l}\t${r}`).join('\n'));
const nParents = families.filter((f) => f.parent).length;
console.log({ old: OLD.length, children: children.length, parents: nParents, standalone: families.filter((f) => !f.parent).length, rows: rows.length, fixedImages: uploads.size, warnings: warns.length });
