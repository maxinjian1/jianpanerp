// Shopify（anetmc.com）订单 → ANET ERP 导入文件 ⑤（规格：japan-erp/ECOMMERCE_INTEGRATION.md「⑤ 订单明细」）
//   node tools/erp-bridge/shopify-orders.mjs [--days 60] [--out-dir <目录>]
// 输出: <目录>/orders-shopify-main.csv（UTF-8 带 BOM）+ orders-shopify-review.txt。默认目录 tools/erp-bridge/out/pending
// 现有应用只有 read_orders → 只能取最近 60 天的订单。不写买家姓名、地址、电话、邮箱：只取收货都道府县。API 原始响应不落盘。
// parent_key = product handle；listing_key = variant id 的数字部分（与文件 ② 的约定相同）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('='))
  .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; }));
for (const k of ['SHOPIFY_STORE_DOMAIN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET']) if (!env[k]) { console.error('.env 缺 ' + k); process.exit(2); }
const SHOP = env.SHOPIFY_STORE_DOMAIN, VER = env.SHOPIFY_API_VERSION || '2025-10';
const CH = 'shopify-main';
const OUT = path.resolve(arg('out-dir', path.join(ROOT, 'tools/erp-bridge/out/pending')));
const days = Number(arg('days', 60));

const tr = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }) });
if (!tr.ok) { console.error('shopify token http ' + tr.status); process.exit(1); }
const token = (await tr.json()).access_token;
async function gql(query, variables) {
  const r = await fetch(`https://${SHOP}/admin/api/${VER}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query, variables }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.errors) throw new Error(`graphql http ${r.status} ${JSON.stringify(j.errors || j).slice(0, 400)}`);
  return j.data;
}
const money = (m) => Math.round(Number(m?.shopMoney?.amount || 0));
const Q = (addr) => `query($q: String!, $after: String) { orders(first: 50, after: $after, query: $q, sortKey: CREATED_AT) { pageInfo { hasNextPage endCursor } nodes {
  name createdAt cancelledAt displayFulfillmentStatus taxesIncluded
  totalShippingPriceSet { shopMoney { amount } } totalDiscountsSet { shopMoney { amount } } totalRefundedSet { shopMoney { amount } }
  fulfillments(first: 10) { createdAt status }
  ${addr ? 'shippingAddress { province }' : ''}
  refunds(first: 10) { createdAt refundLineItems(first: 50) { nodes { quantity lineItem { id } } } }
  lineItems(first: 100) { nodes { id name quantity currentQuantity
    originalTotalSet { shopMoney { amount } } discountedTotalSet { shopMoney { amount } }
    taxLines { rate priceSet { shopMoney { amount } } }
    product { handle } variant { id } } } } } }`;
const since = new Date(Date.now() - days * 86400e3).toISOString().slice(0, 10);
let orders = [], addr = true, note = '';
for (let attempt = 0; attempt < 2; attempt++) {
  try {
    orders = [];
    for (let after = null; ;) {
      const d = await gql(Q(addr), { q: `created_at:>=${since}`, after });
      orders.push(...d.orders.nodes);
      if (!d.orders.pageInfo.hasNextPage) break;
      after = d.orders.pageInfo.endCursor;
    }
    break;
  } catch (e) {
    if (addr && attempt === 0) { addr = false; note = '收货地址字段取不到（应用没有该权限）→ prefecture 留空：' + String(e.message).slice(0, 160); continue; }
    throw e;
  }
}

const H = ['channel_code', 'order_no', 'line_id', 'line_no', 'order_date', 'status', 'shipped_date', 'parent_key', 'listing_key', 'item_name', 'quantity',
  'line_amount_tax_included', 'tax_rate', 'shipping_charged_tax_included', 'shop_discount_tax_included', 'platform_discount_tax_included', 'fulfillment', 'prefecture',
  'returned_quantity', 'refund_tax_included', 'return_date'];
const jstMin = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
const jstDay = (iso) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const rows = [], rev = { byStatus: {}, noVariant: [], taxExcluded: 0 };
let revenue = 0, live = 0;
for (const o of orders) {
  const ships = (o.fulfillments || []).filter((f) => f.status !== 'CANCELLED').map((f) => f.createdAt).sort();
  const base = o.cancelledAt ? 'cancelled' : (o.displayFulfillmentStatus === 'FULFILLED' && ships.length) ? 'shipped' : 'ordered';
  const returned = {}; let returnDate = '';
  for (const rf of o.refunds || []) for (const n of rf.refundLineItems.nodes) { returned[n.lineItem.id] = (returned[n.lineItem.id] || 0) + n.quantity; returnDate = jstDay(rf.createdAt); }
  if (!o.taxesIncluded) rev.taxExcluded++;
  let n = 0, lineSum = 0, lineDisc = 0;
  const items = o.lineItems.nodes;
  for (const it of items) { lineDisc += money(it.originalTotalSet) - money(it.discountedTotalSet); }
  const orderDisc = Math.max(0, money(o.totalDiscountsSet) - lineDisc);
  for (const it of items) {
    n++;
    const tax = (it.taxLines || []).reduce((s, t) => s + Math.round(Number(t.priceSet?.shopMoney?.amount || 0)), 0);
    const amount = money(it.discountedTotalSet) + (o.taxesIncluded ? 0 : tax);
    const rate = Math.round(((it.taxLines || [])[0]?.rate ?? 0.1) * 100);
    const handle = it.product?.handle || '', vid = (it.variant?.id || '').split('/').pop();
    if (!handle || !vid) rev.noVariant.push(`${o.name} ${it.name}`);
    const ret = Math.min(it.quantity, returned[it.id] || 0);
    const st = base;
    rev.byStatus[st] = (rev.byStatus[st] || 0) + 1;
    if (st !== 'cancelled') lineSum += amount;
    rows.push([CH, o.name, it.id.split('/').pop(), n, jstMin(o.createdAt), st, st === 'shipped' ? jstDay(ships.at(-1)) : '', handle || '(不明)', vid || '(不明)',
      String(it.name || '').replace(/[\r\n]+/g, ' ').slice(0, 200), it.quantity, amount, [10, 8, 0].includes(rate) ? rate : 10,
      n === 1 ? money(o.totalShippingPriceSet) : '', n === 1 ? orderDisc : '', n === 1 ? 0 : '', '', (o.shippingAddress?.province || '').slice(0, 10),
      ret, n === 1 ? money(o.totalRefundedSet) : 0, ret ? returnDate : '']);
  }
  if (base !== 'cancelled') { live++; revenue += lineSum + money(o.totalShippingPriceSet) - orderDisc - money(o.totalRefundedSet); }
}
const esc = (v) => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = '﻿' + [H, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'orders-shopify-main.csv'), csv);
const text = [
  `Shopify orders-shopify-main.csv  生成 ${new Date().toLocaleString('sv-SE')}  下单日 ${since} 起（最近 ${days} 天，read_orders 权限上限 60 天）`,
  `sha256 前 16 位 ${crypto.createHash('sha256').update(csv).digest('hex').slice(0, 16)}  行数 ${rows.length}  订单 ${orders.length}`,
  `明细状态 ${JSON.stringify(rev.byStatus)}`,
  `店铺收入（税込，未取消）：${live} 单 / ${revenue} 円`,
  `税別表示的订单（金额已加上消费税）：${rev.taxExcluded} 单`,
  `商品或规格已删除、取不到 handle / variant id 的行：${rev.noVariant.length}${rev.noVariant.length ? '\n  ' + rev.noVariant.slice(0, 20).join('\n  ') : ''}`,
  note,
].filter(Boolean).join('\n');
fs.writeFileSync(path.join(OUT, 'orders-shopify-review.txt'), text + '\n');
console.log(text);
