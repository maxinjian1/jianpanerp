// Amazon → ANET ERP：商品（①）、对照（②）、FBA 可售数（④）、订单（⑤）。来源是 Seller Central 手动下载的三份报告。
//   node tools/erp-bridge/amazon-listings.mjs [--dir tools/amazon-listing/in/reports-2026-11-26] [--fba-as-of 2026-11-25T23:00:00+09:00]
// 输入（--dir 下）：all-listings-*.txt（所有商品报告，UTF-8）、fba-inventory-*.txt（亚马逊配送库存，Shift_JIS）、all-orders-*.txt（所有订单，Shift_JIS，可多份）
// 输出：tools/erp-bridge/out/pending/amazon/{products.csv, listings.csv, notes.txt}、out/pending/stock-fba.csv、out/pending/orders-amazon-main.csv
// 规则（japan-erp/ECOMMERCE_INTEGRATION.md）：
//   - 同一实物一个 sku_code：去掉 SKU 末尾的 -SC（SALONCARE 新链接）和 -r / -rr / -R / -F / -n（旧店的重复出品）后相同的算同一件；
//     240208 系列 = ERP 已有款式 a01-240208（A01-<颜色>-<尺码>）；去掉后与 ERP 已有 sku_code 相同（不分大小写）的直接挂上去。
//   - sku_code 只用半角英数和 - _ .，40 字符以内；含日文或超长的改成 AMZ-<sha1 前 10 位>，原 SKU 原样写在 listing_key。
//   - parent_key = 子 ASIN；extra_key = FNSKU；units 一律 1（多件装没有可靠的判断依据，见 notes）。
//   - FBA 数量只算「販売可」，按 sku_code 合计。订单不写收货地；Non-Amazon（多渠道配送，替别的平台发货）不算 Amazon 的销售，不写。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'C:/Users/maxinjian/source/jianpanerp';
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const DIR = path.resolve(ROOT, arg('dir', 'tools/amazon-listing/in/reports-2026-11-26'));
const FBA_AS_OF = arg('fba-as-of', '2026-11-25T23:00:00+09:00');
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');
const sha16 = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
function tsv(file) {
  const raw = fs.readFileSync(file);
  let t; try { t = new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch { t = new TextDecoder('shift_jis').decode(raw); }
  const L = t.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.length);
  const H = L[0].split('\t').map((h) => h.trim());
  return L.slice(1).map((l) => { const f = l.split('\t'); return Object.fromEntries(H.map((h, i) => [h, (f[i] ?? '').trim()])); });
}
const files = fs.readdirSync(DIR);
const pick = (re) => files.filter((f) => re.test(f)).map((f) => path.join(DIR, f));
const listings = tsv(pick(/^all-listings/)[0]);
// FBA 报告有两列同名（商品の状態），按位置读：SKU, FNSKU, ASIN, 新品/中古, 販売可/販売不可, 数量
const fbaRows = new TextDecoder('shift_jis').decode(fs.readFileSync(pick(/^fba-inventory/)[0])).split(/\r?\n/).slice(1).filter(Boolean).map((l) => { const v = l.split('\t').map((x) => x.trim()); return { sku: v[0], fnsku: v[1], asin: v[2], sellable: v[4] === '販売可', qty: Number(v[5]) || 0 }; });
const orderRows = pick(/^all-orders/).flatMap(tsv);

const csvParse = (txt) => { const rows = []; let r = [], c = '', q = false;
  for (let i = 0; i < txt.length; i++) { const ch = txt[i];
    if (q) { if (ch === '"') { if (txt[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n') { r.push(c); rows.push(r); r = []; c = ''; } else if (ch !== '\r') c += ch; }
  if (c || r.length) { r.push(c); rows.push(r); } return rows; };
const erp = csvParse(fs.readFileSync(`${ROOT}/tools/erp-bridge/out/products.csv`, 'utf8').replace(/^\uFEFF/, ''));
const EH = erp[0]; const erpRows = erp.slice(1).map((r) => Object.fromEntries(EH.map((h, i) => [h, r[i] ?? ''])));
const erpBySku = new Map(erpRows.map((r) => [r.sku_code.toLowerCase(), r]));
const erpStyles = new Set(erpRows.map((r) => r.style_code.toLowerCase()));
const erpJan = new Set(erpRows.map((r) => r.jan).filter(Boolean));

const COLOR = { white: 'ホワイト', black: 'ブラック', apricot: 'アプリコット', babypink: 'ベビーピンク', beige: 'ベージュ', goldbeige: 'ゴールドベージュ', lavender: 'ラベンダー', peach: 'ピーチ',
  royalblue: 'ロイヤルブルー', winered: 'ワインレッド', red: 'レッド', blue: 'ブルー', pink: 'ピンク', purple: 'パープル', murasaki: 'パープル', brown: 'ブラウン', green: 'グリーン', gray: 'グレー', grey: 'グレー',
  yellow: 'イエロー', navy: 'ネイビー', orange: 'オレンジ', khaki: 'カーキ', kahki: 'カーキ', burgundy: 'バーガンディ', champagne: 'シャンパン', lightpink: 'ライトピンク', camel: 'キャメル', coffee: 'コーヒー', mustard: 'マスタード' };
const SIZE = /^(xs|s|m|l|ll|xl|xxl|2xl|3xl|4xl|free)$/i;
const DUP = /^(r|rr|rrr|f|n)$/i;
const OK = /^[A-Za-z0-9._-]{1,40}$/;
const FAMILY = { '240208': 'A01' };          // Amazon 型番 → ERP 已有款式的 SKU 前缀（只登记确认过的）

function canon(sku) {
  let tk = sku.replace(/-SC$/i, '').split('-');
  while (tk.length > 1 && DUP.test(tk.at(-1))) tk.pop();
  if (FAMILY[tk[0]]) tk[0] = FAMILY[tk[0]];
  const base = tk.join('-');
  const prefix = tk[0], rest = tk.slice(1);
  const si = rest.findLastIndex((x) => SIZE.test(x));
  const size = si >= 0 ? rest[si].toUpperCase() : '';
  const colorTk = rest.filter((_, i) => i !== si);
  const color = colorTk.length === 1 && COLOR[colorTk[0].toLowerCase()] ? COLOR[colorTk[0].toLowerCase()] : colorTk.join(' ');
  return { base, prefix, color, size };
}
const cleanTitle = (t) => t.replace(/[\[［【〔]?\s*(SARADEMUNT|SALONCARE|SALON CARE|サラデマント|Sarademunt)\s*[\]］】〕]?/gi, ' ').replace(/\s+/g, ' ').trim();

// ---- 汇总每个出品者 SKU ----
const fbaBySku = new Map(); for (const r of fbaRows) { const m = fbaBySku.get(r.sku) || { fnsku: r.fnsku, asin: r.asin, qty: 0 }; if (r.sellable) m.qty += r.qty; fbaBySku.set(r.sku, m); }
const asinFromOrders = new Map(orderRows.filter((o) => o.asin).map((o) => [o.sku, o.asin]));   // 出品报告里商品ID是 JAN 的行，ASIN 从订单报告补
const src = [];
const seen = new Set();
for (const r of listings) {
  const sku = r['出品者SKU']; seen.add(sku);
  const isAsin = r['商品IDタイプ'] === '1';
  const fb = fbaBySku.get(sku);
  src.push({ sku, title: r['商品名'], price: Math.round(Number(r['価格'])) || 0, asin: isAsin ? r['商品ID'] : (fb?.asin || asinFromOrders.get(sku) || ''), jan: !isAsin && /^\d{13}$/.test(r['商品ID']) ? r['商品ID'] : '',
    fba: r['フルフィルメント・チャンネル'] !== 'DEFAULT', active: r['ステータス'] === 'Active', state: r['ステータス'], fnsku: fb?.fnsku || '' });
}
// FBA 报告里有、出品报告里已经没有的 SKU：仓库里还有可售数量的也要有对照，否则库存没处挂
for (const [sku, fb] of fbaBySku) if (!seen.has(sku) && fb.qty > 0) src.push({ sku, title: '', price: 0, asin: fb.asin, jan: '', fba: true, active: false, state: '出品なし（FBA 在庫あり）', fnsku: fb.fnsku });

// ---- sku_code 归并 ----
const notes = { noAsin: [], hashed: [], attach: 0, lenFix: 0 };
const codeOf = new Map();       // lower(base) → { code, ... }
const items = new Map();        // code → product
const outListings = [];
for (const s of src) {
  const c = canon(s.sku);
  let key = c.base.toLowerCase(), code;
  const have = erpBySku.get(key);
  if (have) code = have.sku_code;
  else if (codeOf.has(key)) code = codeOf.get(key);
  else { const b2 = c.base.replace(/\s+/g, '_'); code = OK.test(b2) ? b2 : 'AMZ-' + sha1(c.base).slice(0, 10); if (!OK.test(b2)) notes.hashed.push(`${s.sku} → ${code}`); codeOf.set(key, code); }
  if (!s.asin) { notes.noAsin.push(`${s.sku}（${s.state}）`); continue; }
  const saloncare = /SALON\s?CARE/i.test(s.title);
  if (!have) {
    const it = items.get(code) || { code, prefix: c.prefix, color: c.color, size: c.size, titles: [], brand: '', price: 0, jan: '', active: false };
    if (s.title) it.titles.push({ t: s.title, sc: saloncare });
    if (saloncare) it.brand = 'SALONCARE'; else if (!it.brand && /SARADEMUNT|サラデマント/i.test(s.title)) it.brand = 'SARADEMUNT';
    if (s.price && (!it.price || s.active)) it.price = s.price;
    if (s.jan && !it.jan && !erpJan.has(s.jan)) it.jan = s.jan;
    it.active ||= s.active;
    items.set(code, it);
  } else notes.attach++;
  outListings.push({ channel_code: 'amazon-main', sku_code: code, parent_key: s.asin, listing_key: s.sku, extra_key: s.fba ? s.fnsku : '', units: 1, fulfillment: s.fba ? 'fba' : 'own',
    price_tax_included: s.price || '', status: s.active ? 'active' : 'stopped' });
}
// ---- 款式 ----
const styleOf = (it) => { let p = it.prefix; if (!OK.test(p)) p = 'amz-' + sha1(p).slice(0, 8); p = p.toLowerCase(); if (erpStyles.has(p)) p = ('amz-' + p).slice(0, 40); return p; };
const byStyle = new Map(); for (const it of items.values()) { const st = styleOf(it); it.style = st; (byStyle.get(st) || byStyle.set(st, []).get(st)).push(it); }
const usedJan = new Set();
const pRows = [];
const sizeOrder = ['XS', 'S', 'M', 'L', 'LL', 'XL', 'XXL', '2XL', '3XL', '4XL', 'FREE', ''];
for (const [st, list] of [...byStyle].sort((a, b) => a[0].localeCompare(b[0]))) {
  const all = list.flatMap((x) => x.titles); const tt = (all.find((x) => x.sc) || all[0])?.t || '';
  // 款式名：标题去掉品牌后取前面一段（内部名称，不用平台长标题）；标题为空的（只剩 FBA 库存）用款号
  const styleName = (cleanTitle(tt).split(' ').slice(0, 6).join(' ').slice(0, 60) || st).trim();
  const brand = list.some((x) => x.brand === 'SALONCARE') ? 'SALONCARE' : (list.find((x) => x.brand)?.brand || '');
  list.sort((a, b) => a.color.localeCompare(b.color) || sizeOrder.indexOf(a.size) - sizeOrder.indexOf(b.size));
  for (const it of list) {
    let jan = it.jan && !usedJan.has(it.jan) ? it.jan : ''; if (jan) usedJan.add(jan);
    pRows.push({ sku_code: it.code, style_code: st, style_name: styleName, sku_name: '', option1: it.color.slice(0, 80), option2: it.size, option1_name: it.color ? 'カラー' : '', option2_name: it.size ? 'サイズ' : '',
      brand, jan, unit: '個', tax_rate: 10, price_tax_included: it.price || '', cost_tax_included: '', cost_source: '', style_image_url: '', sku_image_url: '' });
  }
}
// 240208 的新颜色挂在 ERP 已有款式 a01-240208 下面
// 款式级的列照抄 ERP 现有的值；规格的写法也跟该款式现有 SKU 一致（例：现有是全角「２XL」就写全角）
const a01 = erpRows.filter((r) => r.style_code === 'a01-240208');
const a01Size = new Map(a01.map((r) => [r.option2.normalize('NFKC').toUpperCase(), r.option2]));
for (const p of pRows) if (p.sku_code.startsWith('A01-') && a01.length) { const e = a01[0];
  Object.assign(p, { style_code: e.style_code, style_name: e.style_name, brand: e.brand, style_image_url: e.style_image_url, option1_name: e.option1_name, option2_name: e.option2_name });
  if (a01Size.has(p.option2)) p.option2 = a01Size.get(p.option2); }

// ---- 检查 ----
const errs = [];
const lc = new Map(); for (const p of pRows) { const k = p.sku_code.toLowerCase(); if (lc.has(k) || erpBySku.has(k)) errs.push('sku_code 重复 ' + p.sku_code); lc.set(k, 1); if (!OK.test(p.sku_code) || !OK.test(p.style_code)) errs.push('编号不合规 ' + p.sku_code + ' / ' + p.style_code); if ((p.style_name + p.option1 + p.option2).length > 150) errs.push('名称过长 ' + p.sku_code); }
const lk = new Set(); for (const l of outListings) { const k = l.parent_key + '|' + l.listing_key; if (lk.has(k)) errs.push('对照重复 ' + k); lk.add(k); }
if (errs.length) { console.error(errs.slice(0, 30).join('\n')); process.exit(1); }

const esc = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const toCsv = (H, rows) => '\uFEFF' + [H, ...rows.map((r) => H.map((h) => r[h]))].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
const LH = ['channel_code', 'sku_code', 'parent_key', 'listing_key', 'extra_key', 'units', 'fulfillment', 'price_tax_included', 'status'];
const P = `${ROOT}/tools/erp-bridge/out/pending`; fs.mkdirSync(P + '/amazon', { recursive: true });
const pCsv = toCsv(EH, pRows), lCsv = toCsv(LH, outListings);
fs.writeFileSync(P + '/amazon/products.csv', pCsv); fs.writeFileSync(P + '/amazon/listings.csv', lCsv);

// ---- ④ FBA 可售数 ----
const codeBySku = new Map(outListings.map((l) => [l.listing_key, l.sku_code]));
const stock = new Map(); let fbaLost = 0, fbaUnits = 0;
for (const [sku, fb] of fbaBySku) { if (fb.qty <= 0) continue; const code = codeBySku.get(sku); if (!code) { fbaLost += fb.qty; continue; } stock.set(code, (stock.get(code) || 0) + fb.qty); fbaUnits += fb.qty; }
const sCsv = toCsv(['source', 'sku_code', 'quantity', 'as_of'], [...stock].sort().map(([sku_code, quantity]) => ({ source: 'fba', sku_code, quantity, as_of: FBA_AS_OF })));
fs.writeFileSync(P + '/stock-fba.csv', sCsv);

// ---- ⑤ 订单 ----
const OH = ['channel_code', 'order_no', 'line_id', 'line_no', 'order_date', 'status', 'shipped_date', 'parent_key', 'listing_key', 'item_name', 'quantity', 'line_amount_tax_included', 'tax_rate',
  'shipping_charged_tax_included', 'shop_discount_tax_included', 'platform_discount_tax_included', 'fulfillment', 'prefecture', 'returned_quantity', 'refund_tax_included', 'return_date'];
const n = (v) => Math.round(Number(v) || 0);
const jst = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString();
const oStat = { mcf: 0, byStatus: {}, unmatched: new Set(), revenue: 0, liveOrders: new Set(), min: '', max: '' };
const byOrder = new Map();
for (const o of orderRows) {
  if (o['sales-channel'] !== 'Amazon.co.jp') { oStat.mcf++; continue; }
  (byOrder.get(o['amazon-order-id']) || byOrder.set(o['amazon-order-id'], []).get(o['amazon-order-id'])).push(o);
}
const oRows = [];
for (const [no, list0] of byOrder) {
  // 整单取消的订单：报告里数量是 0，ERP 要求 1 以上，这一批不写（ERP 里本来也没有这些订单）。部分取消的订单目前没有；出现时按失败处理，不凑数。
  const isC = (o) => o['order-status'] === 'Cancelled' || o['item-status'] === 'Cancelled';
  if (list0.every(isC)) { oStat.cancelledOrders = (oStat.cancelledOrders || 0) + 1; oStat.cancelledLines = (oStat.cancelledLines || 0) + list0.length; continue; }
  if (list0.some((o) => isC(o) && n(o.quantity) < 1)) { console.error('部分取消且数量为 0 的订单 ' + no + '：需要和 ERP 会话商量写法'); process.exit(1); }
  const list = [...list0].sort((a, b) => (a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0));      // line_no = 订单内按出品者 SKU 排序的序号
  const seenItem = new Set(); let i = 0;
  const ship = list.reduce((s, o) => s + n(o['shipping-price']), 0), disc = list.reduce((s, o) => s + n(o['item-promotion-discount']) + n(o['ship-promotion-discount']), 0);
  for (const o of list) {
    const id = o['order-item-id']; if (seenItem.has(id)) continue; seenItem.add(id); i++;
    const cancelled = o['order-status'] === 'Cancelled' || o['item-status'] === 'Cancelled';
    const shipped = !cancelled && o['item-status'] === 'Shipped';
    const st = cancelled ? 'cancelled' : shipped ? 'shipped' : 'ordered';
    const d = jst(o['purchase-date']);
    oStat.byStatus[st] = (oStat.byStatus[st] || 0) + 1;
    if (!codeBySku.has(o.sku)) oStat.unmatched.add(o.sku);
    const amount = n(o['item-price']);
    if (!cancelled) { oStat.revenue += amount + (i === 1 ? ship - disc : 0); oStat.liveOrders.add(no); }
    const day = d.slice(0, 10); if (!oStat.min || day < oStat.min) oStat.min = day; if (day > oStat.max) oStat.max = day;
    oRows.push({ channel_code: 'amazon-main', order_no: no, line_id: id, line_no: i, order_date: d.slice(0, 16).replace('T', ' '), status: st,
      shipped_date: shipped ? jst(o['last-updated-date']).slice(0, 10) : '', parent_key: o.asin, listing_key: o.sku, item_name: o['product-name'].slice(0, 200),
      quantity: n(o.quantity), line_amount_tax_included: amount, tax_rate: 10, shipping_charged_tax_included: i === 1 ? ship : '', shop_discount_tax_included: i === 1 ? disc : '',
      platform_discount_tax_included: i === 1 ? 0 : '', fulfillment: o['fulfillment-channel'] === 'Amazon' ? 'fba' : 'own', prefecture: '', returned_quantity: 0, refund_tax_included: 0, return_date: '' });
  }
}
oRows.sort((a, b) => a.order_date.localeCompare(b.order_date) || a.order_no.localeCompare(b.order_no) || a.line_no - b.line_no);
const oCsv = toCsv(OH, oRows);
if (/(^|,)-\d/m.test(oCsv)) { console.error('订单文件里有负数'); process.exit(1); }
fs.writeFileSync(P + '/orders-amazon-main.csv', oCsv);

const cnt = (a, f) => a.reduce((m, x) => (m[f(x)] = (m[f(x)] || 0) + 1, m), {});
const perCode = cnt(outListings, (l) => l.sku_code);
const text = [
  `Amazon → ERP  生成 ${new Date().toLocaleString('sv-SE')}（电脑时间）  报告：${path.basename(DIR)}（所有商品报告 11-26 15:23 JST 申请；FBA 库存 11-25 23:00 JST；订单 ${oStat.min}〜${oStat.max}）`,
  ``,
  `① amazon/products.csv  ${pRows.length} 行（只有新建的 sku_code；已在 ERP 的不重复写）  款式 ${new Set(pRows.map((p) => p.style_code)).size} 个  sha ${sha16(pCsv)}`,
  `   品牌：${JSON.stringify(cnt(pRows, (p) => p.brand || '(空)'))}；有 JAN 的 ${pRows.filter((p) => p.jan).length} 行；没有售价的 ${pRows.filter((p) => !p.price_tax_included).length} 行；进价、图片全部留空`,
  `② amazon/listings.csv  ${outListings.length} 行  sha ${sha16(lCsv)}`,
  `   status ${JSON.stringify(cnt(outListings, (l) => l.status))}（报告里 Active = active；Inactive、Incomplete、已不在出品报告但 FBA 还有货 = stopped）`,
  `   fulfillment ${JSON.stringify(cnt(outListings, (l) => l.fulfillment))}；有 FNSKU 的 ${outListings.filter((l) => l.extra_key).length} 行`,
  `   挂到 ERP 已有 sku_code 的 ${notes.attach} 行；sku_code 合计 ${Object.keys(perCode).length} 个，其中挂了 2 条以上对照的 ${Object.values(perCode).filter((v) => v > 1).length} 个`,
  `④ stock-fba.csv  ${stock.size} 行 / ${fbaUnits} 件（只算「販売可」，as_of ${FBA_AS_OF}）  sha ${sha16(sCsv)}${fbaLost ? `；另有 ${fbaLost} 件挂不上对照，没写` : ''}`,
  `⑤ orders-amazon-main.csv  ${oRows.length} 行 / ${byOrder.size} 单  sha ${sha16(oCsv)}`,
  `   明细状态 ${JSON.stringify(oStat.byStatus)}；店铺收入（税込，未取消）${oStat.liveOrders.size} 单 / ${oStat.revenue} 円`,
  `   对不上对照的 SKU ${oStat.unmatched.size} 个${oStat.unmatched.size ? '：' + [...oStat.unmatched].slice(0, 20).join('、') : ''}`,
  `   没写的：Non-Amazon（多渠道配送，替别的平台发货，报告里没有金额）${oStat.mcf} 行`,
  ``,
  `口径和已知的不准确：`,
  `- line_id = order-item-id（报告里有这一列，和以后 SP-API 的值相同）。`,
  `- shipped_date：报告没有出货日，用的是「last-updated-date」的日期，可能晚于实际出货日。`,
  `- 整单取消的订单 ${oStat.cancelledOrders || 0} 单 / ${oStat.cancelledLines || 0} 行没有写：报告里数量是 0，ERP 要求 1 以上，不凑数。部分取消的订单这一批没有。`,
  `- 退货、退款：这份报告里没有，全部写 0。`,
  `- line_amount = item-price（已是 单价×件数，税込）；shop_discount = item-promotion-discount + ship-promotion-discount（是否全部由店铺承担没有核对）；积分没有数据。`,
  `- units 全部写 1。标题或 SKU 里像多件装的（2set、3set、セット 等）没有逐个核对。`,
  `- 颜色只把单个英文词翻成日文，其余原样（例如 shorts b black）；尺码取 SKU 里的 S/M/L/XL/2XL 等。款式名是标题去掉品牌后的前几个词。`,
  `- 同一实物的归并只做了机械的部分（-SC、-r/-rr/-R/-F/-n、240208=A01、与 ERP 已有编号相同）。手工建的 A06〜A09 等系列和旧型番（191120、220727T、261028）是同一批货，但颜色写法不同，没有合并，各有各的 sku_code。`,
  `- 240208 的 winered / royalblue 和 ERP 已有的 A01-red / A01-blue 是否同一种货，等用户确认，没有合并。`,
  ``,
  `没有写进对照的 SKU（没有 ASIN）${notes.noAsin.length} 个${notes.noAsin.length ? '：' + notes.noAsin.slice(0, 40).join('、') + (notes.noAsin.length > 40 ? ' 等' : '') : ''}`,
  `改成 AMZ- 编号的（含日文等）${notes.hashed.length} 个${notes.hashed.length ? '：\n  ' + notes.hashed.join('\n  ') : ''}`,
].join('\n');
fs.writeFileSync(P + '/amazon/notes.txt', text + '\n');
console.log(text);
