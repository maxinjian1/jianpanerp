// Amazon 的商品（文件 ①）和对照（文件 ②）→ tools/erp-bridge/out/pending/amazon/{products.csv, listings.csv, notes.txt}
//   node tools/erp-bridge/amazon-listings.mjs --family 240208
// 现在的数据来源（样板阶段，没有新报告）：
//   - tools/amazon-listing/in/category-report-2026-11-11/report.json（カテゴリー別出品レポート：SKU、ASIN、状态、价格、发货方式）
//   - tools/amazon-listing/out/rebrand/saloncare/rows.json（11-12 新建的 SALONCARE -SC 链接；ASIN 当时还没有）
//   - tools/erp-bridge/out/products.csv（已读进 ERP 的乐天商品：同一实物用它的 sku_code）
// 全量时改用用户浏览器里新取的 出品詳細レポート + FBA 在庫レポート（ASIN、FNSKU、现在的状态）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'C:/Users/maxinjian/source/jianpanerp';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const FAMILY = arg('family', '240208');
// 系列 → ERP 里已有的款式（乐天的管理番号）。只登记确认是同一实物的。
const STYLE = { '240208': { style_code: 'a01-240208', prefix: 'A01', erpPrefix: 'A01' } }[FAMILY];
if (!STYLE) { console.error('未登记的系列 ' + FAMILY); process.exit(2); }
// 颜色：SKU 里的英文 → 日文。sure=false 的不和 ERP 已有颜色合并（见 notes）。
const COLOR = { white: 'ホワイト', black: 'ブラック', apricot: 'アプリコット', babypink: 'ベビーピンク', beige: 'ベージュ', goldbeige: 'ゴールドベージュ', lavender: 'ラベンダー',
  peach: 'ピーチ', royalblue: 'ロイヤルブルー', winered: 'ワインレッド', red: 'レッド', blue: 'ブルー', pink: 'ピンク', purple: 'パープル', murasaki: 'パープル' };

const csvParse = (txt) => { const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < txt.length; i++) { const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; }
  if (c || r.length) { r.push(c); rows.push(r); } return rows; };
const erp = csvParse(fs.readFileSync(`${ROOT}/tools/erp-bridge/out/products.csv`, 'utf8').replace(/^\uFEFF/, ''));
const EH = erp[0]; const erpRows = erp.slice(1).map((r) => Object.fromEntries(EH.map((h, i) => [h, r[i] ?? ''])));
const erpStyle = erpRows.filter((r) => r.style_code === STYLE.style_code);
const erpBySku = new Map(erpStyle.map((r) => [r.sku_code.toLowerCase(), r]));

const rep = JSON.parse(fs.readFileSync(`${ROOT}/tools/amazon-listing/in/category-report-2026-11-11/report.json`, 'utf8'));
const t = rep['0_APPAREL-VEST.xlsm|テンプレート'];
const C = { status: 0, sku: 2, level: 5, parent: 6, idType: 11, id: 12, chan: 572, price: 577 };
const famRe = new RegExp(`^(${FAMILY}-|${STYLE.prefix}-)`);
const src = [];
for (const r of t.slice(5)) {
  const sku = String(r[C.sku] ?? ''); if (!famRe.test(sku) || r[C.level] === '親') continue;
  src.push({ sku, asin: r[C.idType] === 'ASIN' ? String(r[C.id] || '') : String(r[C.id] || ''), deleted: r[C.status] === '削除されました',
    chan: String(r[C.chan] || ''), price: Number(r[C.price]) || 0, from: '11-11 报告' });
}
const sc = Object.values(JSON.parse(fs.readFileSync(`${ROOT}/tools/amazon-listing/out/rebrand/saloncare/rows.json`, 'utf8')));
const priceKey = (r) => Object.entries(r).find(([k, v]) => Number(k) > 500 && /^\d{3,6}$/.test(String(v)))?.[1];
for (const r of sc) {
  const sku = String(r[2] || ''); if (!sku.startsWith(FAMILY + '-') || r[5] === '親') continue;
  src.push({ sku, asin: '', deleted: false, chan: 'AMAZON_JP', price: Number(priceKey(r)) || 0, from: '11-12 新建（-SC）' });
}

const SIZE = /^(S|M|L|XL|2XL|3XL|free)$/i;
function parse(sku) {
  let p = sku.replace(/-SC$/, '').split('-').slice(1).filter((x) => !/^(r|rr|R|F)$/.test(x));
  const size = p.findLast((x) => SIZE.test(x)); const color = p.find((x) => !SIZE.test(x));
  return { color: (color || '').toLowerCase(), size: (size || '').toUpperCase() };
}
const products = new Map(), listings = [], notes = { attach: 0, created: 0, unparsed: [], noAsin: [], noPrice: [], unsure: new Set() };
const styleName = erpStyle[0]?.style_name || '';
for (const s of src) {
  const { color, size } = parse(s.sku);
  if (!color || !size || !COLOR[color]) { notes.unparsed.push(s.sku); continue; }
  const code = `${STYLE.erpPrefix}-${color}-${size.toLowerCase()}`;
  if (code.length > 40 || !/^[A-Za-z0-9._-]+$/.test(code)) { notes.unparsed.push(s.sku + '（sku_code 不合规）'); continue; }
  const have = erpBySku.get(code.toLowerCase());
  if (!have && !products.has(code)) {
    products.set(code, { sku_code: code, style_code: STYLE.style_code, style_name: styleName.slice(0, 160), sku_name: '', option1: COLOR[color], option2: size,
      option1_name: 'カラー', option2_name: 'サイズ', brand: erpStyle[0]?.brand || 'SALON CARE', jan: '', unit: '個', tax_rate: 10, price_tax_included: s.price || '',
      cost_tax_included: '', cost_source: '', style_image_url: erpStyle[0]?.style_image_url || '', sku_image_url: '' });
    notes.created++;
  }
  if (have) notes.attach++;
  if (!s.asin) notes.noAsin.push(s.sku);
  if (!s.price) notes.noPrice.push(s.sku);
  listings.push({ channel_code: 'amazon-main', sku_code: have ? have.sku_code : code, parent_key: s.asin, listing_key: s.sku, extra_key: '', units: 1,
    fulfillment: /AMAZON/i.test(s.chan) || !s.chan ? 'fba' : 'own', price_tax_included: s.price || '', status: s.deleted ? 'stopped' : 'active', _from: s.from });
}
// ERP 已有 red / blue，Amazon 有 winered / royalblue：是不是同一种颜色没有确认 → 不合并，各自成行，写进 notes
for (const [a, b] of [['winered', 'red'], ['royalblue', 'blue']]) if ([...products.keys()].some((k) => k.includes('-' + a + '-')) && [...erpBySku.keys()].some((k) => k.includes('-' + b + '-'))) notes.unsure.add(`${a}（Amazon）↔ ${b}（ERP 已有）`);

const esc = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const LH = ['channel_code', 'sku_code', 'parent_key', 'listing_key', 'extra_key', 'units', 'fulfillment', 'price_tax_included', 'status'];
const OUT = `${ROOT}/tools/erp-bridge/out/pending/amazon`; fs.mkdirSync(OUT, { recursive: true });
const ready = listings.filter((l) => l.parent_key);          // parent_key（ASIN）是必填：没有 ASIN 的行先不写
const pUsed = new Set(ready.map((l) => l.sku_code));
const pRows = [...products.values()].filter((p) => pUsed.has(p.sku_code));
const pCsv = '\uFEFF' + [EH, ...pRows.map((p) => EH.map((h) => p[h]))].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
const lCsv = '\uFEFF' + [LH, ...ready.map((l) => LH.map((h) => l[h]))].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
fs.writeFileSync(path.join(OUT, 'products.csv'), pCsv); fs.writeFileSync(path.join(OUT, 'listings.csv'), lCsv);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const cnt = (a, f) => a.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
const text = [
  `Amazon 样板（系列 ${FAMILY} = ERP 款式 ${STYLE.style_code}）  生成 ${new Date().toLocaleString('sv-SE')}（电脑时间）`,
  `用途：只给 ERP 会话在 trial 看格式。数据是 11-11 的旧报告，不是现在的状态，不要读进 anet。`,
  `products.csv  ${pRows.length} 行（全部是新建的 sku_code；已在 ERP 的 sku_code 不重复写）  sha ${sha(pCsv)}`,
  `listings.csv  ${ready.length} 行  sha ${sha(lCsv)}`,
  `  挂到 ERP 已有 sku_code 的对照：${ready.filter((l) => erpBySku.has(l.sku_code.toLowerCase())).length} 行；挂到新建 sku_code 的：${ready.filter((l) => !erpBySku.has(l.sku_code.toLowerCase())).length} 行`,
  `  status：${JSON.stringify(cnt(ready, (l) => l.status))}（stopped = 11-11 报告里「削除されました」）`,
  `  fulfillment：${JSON.stringify(cnt(ready, (l) => l.fulfillment))}`,
  `填法：parent_key = 子 ASIN；listing_key = 出品者 SKU 原样；extra_key（FNSKU）全部留空——没有 FBA 在庫レポート，取不到。`,
  `sku_code 规则：${STYLE.erpPrefix}-<颜色英文>-<尺码小写>，与 ERP 里乐天的写法相同；旧 SARADEMUNT 链接、-SC 链接、手工建的 ${STYLE.prefix}-* 链接是同一实物，挂同一个 sku_code。`,
  `没有写进文件的：`,
  `  没有 ASIN 的 ${notes.noAsin.length} 个（-SC 链接 11-12 新建，手头的报告早于它，ASIN 要等新报告）${notes.noAsin.length ? '：' + notes.noAsin.slice(0, 6).join('、') + ' 等' : ''}`,
  `  SKU 解析不出颜色或尺码的 ${notes.unparsed.length} 个${notes.unparsed.length ? '：' + notes.unparsed.join('、') : ''}`,
  `没有价格的行 ${ready.filter((l) => !l.price_tax_included).length} 个（报告里该格为空，留空）。进价全部留空。`,
  notes.unsure.size ? `需要用户确认的颜色：${[...notes.unsure].join('；')} 是否同一种颜色。没有确认前不合并，各建各的 sku_code。` : '',
].filter(Boolean).join('\n');
fs.writeFileSync(path.join(OUT, 'notes.txt'), text + '\n');
console.log(text);
