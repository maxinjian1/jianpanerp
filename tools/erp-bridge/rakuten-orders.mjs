// 乐天订单 → ANET ERP 导入文件 ⑤ orders.csv（规格：japan-erp/ECOMMERCE_INTEGRATION.md「⑤ 订单明细」）
//   node tools/erp-bridge/rakuten-orders.mjs [--from 2026-09-01] [--to 2026-11-24] [--days 90] [--out-dir <目录>]
//   --days N = 从 N 天前（日本时间）起，每晚自动导出用；--out-dir = 写到别的目录（每晚导出先写临时目录，成功后再改名进 out/）
// 输出: tools/erp-bridge/out/orders.csv（UTF-8 带 BOM）+ out/orders-review.txt
// 不写买家姓名、地址、电话、邮箱：只取收货都道府县。API 原始响应不落盘。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
if (!env.RAKUTEN_SERVICE_SECRET || !env.RAKUTEN_LICENSE_KEY) { console.error('.env 缺 RAKUTEN_SERVICE_SECRET / RAKUTEN_LICENSE_KEY'); process.exit(2); }
const AUTH = 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const API = 'https://api.rms.rakuten.co.jp/es/2.0/order';
const CH = 'rakuten-main';
const O = path.join(ROOT, 'tools/erp-bridge/out');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = 0;
async function post(p, body) {
  const w = 1100 - (Date.now() - last); if (w > 0) await sleep(w); last = Date.now();
  const r = await fetch(`${API}/${p}/`, { method: 'POST', headers: { Authorization: AUTH, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  const errs = (j.MessageModelList || []).filter((m) => m.messageType === 'ERROR');
  if (!r.ok || errs.length) throw new Error(`${p} http ${r.status} ${JSON.stringify(j.MessageModelList || j).slice(0, 300)}`);
  return j;
}
const jst = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 19) + '+0900';
const OUT = arg('out-dir') ? path.resolve(arg('out-dir')) : O;
const dayJst = (d) => new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const from = new Date((arg('days') ? dayJst(new Date(Date.now() - Number(arg('days')) * 86400e3)) : arg('from', '2026-09-01')) + 'T00:00:00+09:00');
const to = arg('to') ? new Date(arg('to') + 'T23:59:59+09:00') : new Date();

// 1) 订单号（按下单日，每次最多 63 天 → 用 60 天一段）
const numbers = [];
for (let a = from; a < to; a = new Date(a.getTime() + 60 * 86400e3)) {
  const b = new Date(Math.min(to.getTime(), a.getTime() + 60 * 86400e3 - 1000));
  for (let page = 1; ; page++) {
    const j = await post('searchOrder', { dateType: 1, startDatetime: jst(a), endDatetime: jst(b), PaginationRequestModel: { requestRecordsAmount: 1000, requestPage: page } });
    numbers.push(...(j.orderNumberList || []));
    if (page >= (j.PaginationResponseModel?.totalPages || 1)) break;
  }
}
const uniq = [...new Set(numbers)];
console.log('订单号', uniq.length);

// 2) 订单明细（每次 100 个）
const orders = [];
for (let i = 0; i < uniq.length; i += 100) {
  const j = await post('getOrder', { orderNumberList: uniq.slice(i, i + 100), version: 7 });
  orders.push(...(j.OrderModelList || []));
}

// 3) 对照（文件 ②）里乐天的键
const lst = fs.readFileSync(path.join(O, 'listings.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
const keys = new Set(lst.filter((r) => r[0] === CH).map((r) => r[2] + '\t' + r[3]));

const H = ['channel_code', 'order_no', 'line_id', 'line_no', 'order_date', 'status', 'shipped_date', 'parent_key', 'listing_key', 'item_name', 'quantity',
  'line_amount_tax_included', 'tax_rate', 'shipping_charged_tax_included', 'shop_discount_tax_included', 'platform_discount_tax_included', 'fulfillment', 'prefecture',
  'returned_quantity', 'refund_tax_included', 'return_date'];
const rows = [], rev = { byStatus: {}, unmatched: {}, goodsMismatch: [], noShipDate: 0, keySource: {}, progress: {} };
const SHIPPED = new Set([500, 600, 700]);
orders.sort((a, b) => (a.orderDatetime + a.orderNumber).localeCompare(b.orderDatetime + b.orderNumber));
for (const o of orders) {
  rev.progress[o.orderProgress] = (rev.progress[o.orderProgress] || 0) + 1;
  let status = o.orderProgress === 900 ? 'cancelled' : SHIPPED.has(o.orderProgress) ? 'shipped' : 'ordered';
  const pk = o.PackageModelList || [];
  const dates = pk.flatMap((p) => (p.ShippingModelList || []).map((s) => s.shippingDate)).filter(Boolean).sort();
  let shipped = dates.at(-1) || (o.shippingCmplRptDatetime || '').slice(0, 10);
  if (status === 'shipped' && !shipped) { rev.noShipDate++; status = 'ordered'; }
  const items = pk.flatMap((p) => p.ItemModelList || []);
  const live = items.filter((it) => !it.deleteItemFlag);
  const sum = live.reduce((n, it) => n + it.priceTaxIncl * it.units, 0);
  if (status !== 'cancelled' && sum !== o.goodsPrice) rev.goodsMismatch.push(`${o.orderNumber} 明细合计 ${sum} ≠ goodsPrice ${o.goodsPrice}`);
  const first = [o.postagePrice + (o.deliveryPrice || 0) + (o.paymentCharge || 0), o.couponShopPrice || 0, (o.couponOtherPrice || 0) + (o.PointModel?.usedPoint || 0)];
  let n = 0;
  for (const it of items) {
    n++;
    const sku = (it.SkuModelList || [])[0] || {};
    const src = sku.variantId ? 'variantId' : sku.merchantDefinedSkuId ? 'merchantDefinedSkuId' : 'manageNumber';
    rev.keySource[src] = (rev.keySource[src] || 0) + 1;
    const lk = sku.variantId || sku.merchantDefinedSkuId || it.manageNumber;
    const st = it.deleteItemFlag ? 'cancelled' : status;
    if (st !== 'cancelled' && !keys.has(it.manageNumber + '\t' + lk)) { const k = it.manageNumber + ' / ' + lk; rev.unmatched[k] = (rev.unmatched[k] || 0) + it.units; }
    rev.byStatus[st] = (rev.byStatus[st] || 0) + 1;
    rows.push([CH, o.orderNumber, String(it.itemDetailId), n, o.orderDatetime.slice(0, 16).replace('T', ' '), st, st === 'shipped' ? shipped : '', it.manageNumber, lk,
      String(it.itemName || '').replace(/[\r\n]+/g, ' ').slice(0, 200), it.units, it.priceTaxIncl * it.units, Math.round((it.taxRate ?? 0.1) * 100),
      n === 1 ? first[0] : '', n === 1 ? first[1] : '', n === 1 ? first[2] : '', '', (pk[0]?.SenderModel?.prefecture || '').slice(0, 10), 0, 0, '']);
  }
}
const esc = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = '﻿' + [H, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'orders.csv'), csv);

// 自检与摘要
const revenue = (f) => { let s = 0; const seen = new Set(); for (const o of orders) { if (o.orderProgress === 900 || !f(o)) continue; if (seen.has(o.orderNumber)) continue; seen.add(o.orderNumber);
  s += (o.PackageModelList || []).flatMap((p) => p.ItemModelList || []).filter((it) => !it.deleteItemFlag).reduce((n, it) => n + it.priceTaxIncl * it.units, 0) + o.postagePrice + (o.deliveryPrice || 0) + (o.paymentCharge || 0) - (o.couponShopPrice || 0); } return [seen.size, s]; };
const inWin = (o) => o.orderDatetime >= '2026-09-12' && o.orderDatetime < '2026-11-13';
const um = Object.entries(rev.unmatched).sort((a, b) => b[1] - a[1]);
const text = [
  `乐天 orders.csv  生成 ${new Date().toLocaleString('sv-SE')}  期间 ${jst(from).slice(0, 10)} 〜 ${jst(to).slice(0, 10)}`,
  `sha256 前 16 位 ${crypto.createHash('sha256').update(csv).digest('hex').slice(0, 16)}  行数 ${rows.length}  订单 ${orders.length}`,
  `orderProgress 分布 ${JSON.stringify(rev.progress)}`,
  `明细状态 ${JSON.stringify(rev.byStatus)}`,
  `listing_key 来源 ${JSON.stringify(rev.keySource)}`,
  `店铺收入（税込，未取消）：全期间 ${revenue(() => true).join(' 单 / ')} 円；2026-09-12〜11-12 ${revenue(inWin).join(' 单 / ')} 円`,
  `已出货但没有出货日 → 写成 ordered：${rev.noShipDate} 单`,
  `明细合计与 goodsPrice 不一致：${rev.goodsMismatch.length} 单${rev.goodsMismatch.length ? '\n  ' + rev.goodsMismatch.slice(0, 20).join('\n  ') : ''}`,
  `对不上对照（未取消的行）：${um.length} 个键、${um.reduce((n, x) => n + x[1], 0)} 件`,
  ...um.map(([k, v]) => `  ${k}  ×${v}`),
].join('\n');
fs.writeFileSync(path.join(OUT, 'orders-review.txt'), text + '\n');
console.log(text);
