#!/usr/bin/env node
/**
 * 上架循环：读 .env 的 ERP_API_URL / ERP_EMAIL / ERP_PASSWORD → 登录 → 循环 POST /dropship/publish-batch?limit=50
 * 直到返回空数组。每轮打印 ok/failed；单条失败由服务端标记 status=error，不会重复拾取。
 * 结束后补发布渠道：把 vendor=ANET 的 ACTIVE 商品中还没发布到 Online Store / Headless（App「安い」）的，直接用 Shopify Admin API
 * （.env 的 SHOPIFY_*）发布到这两个渠道（2026-10-19 用户决定：以后默认两个渠道都发布）。api-core 的 publishToSalesChannels
 * 也已改成两个渠道，但要重新 build + 重启 api-core 才生效，所以这里兜底；幂等，重复跑无副作用。
 * 用法：node tools/dropship/publish-loop.mjs [--limit 50] [--status ACTIVE] [--no-channels]
 *       node tools/dropship/publish-loop.mjs --channels-only      # 只补发布渠道
 * 另外：本次运行期间新建的 ANET 商品，标题末尾的批发商模板型号（YKOGH-01、YB-05 等，规则同 fix-catalog.mjs）会被去掉
 * （api-core 也已改，但同样要重启才生效；--no-channels 时也跳过这一步）。
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LIMIT = Number(opt('limit', 50));
const STATUS = opt('status', 'ACTIVE');
const CHANNELS = !argv.includes('--no-channels');
const CHANNELS_ONLY = argv.includes('--channels-only');

(function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
})();

const API = (process.env.ERP_API_URL || 'http://127.0.0.1:4000/api/v1').replace(/\/$/, '');
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(ts(), ...a);

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ERP_EMAIL, password: process.env.ERP_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login HTTP ${res.status} ${await res.text()}`);
  const j = await res.json();
  const token = j.accessToken ?? j.access_token ?? j.data?.accessToken;
  const tenantId = j.user?.tenantId ?? j.tenantId ?? j.data?.user?.tenantId;
  if (!token || !tenantId) throw new Error(`login 响应缺少 accessToken/tenantId: ${JSON.stringify(j).slice(0, 200)}`);
  return { token, tenantId };
}

function postNoTimeout(url, headers) {
  const u = new URL(url);
  const mod = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method: 'POST', headers: { ...headers, 'Content-Length': 0 }, timeout: 0 }, (r) => {
      let text = '';
      r.setEncoding('utf8');
      r.on('data', (c) => (text += c));
      r.on('end', () => resolve({ status: r.statusCode, ok: r.statusCode >= 200 && r.statusCode < 300, text }));
    });
    req.setTimeout(0);
    req.on('error', reject);
    req.end();
  });
}

// ───────────── 渠道补发布（Shopify Admin API 直连） ─────────────
async function shopifyGql(query, variables = {}) {
  const shop = process.env.SHOPIFY_STORE_DOMAIN, ver = process.env.SHOPIFY_API_VERSION || '2026-10';
  shopifyGql.token ??= await (async () => {
    const r = await fetch(`https://${shop}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.SHOPIFY_CLIENT_ID, client_secret: process.env.SHOPIFY_CLIENT_SECRET }) });
    if (!r.ok) throw new Error(`shopify token HTTP ${r.status}`);
    return (await r.json()).access_token;
  })();
  for (let i = 0; ; i++) {
    const r = await fetch(`https://${shop}/admin/api/${ver}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': shopifyGql.token }, body: JSON.stringify({ query, variables }) });
    const j = await r.json().catch(() => ({ errors: [{ message: `http ${r.status}` }] }));
    if ((r.status === 429 || j.errors?.some((e) => e.extensions?.code === 'THROTTLED')) && i < 8) { await new Promise((ok) => setTimeout(ok, 2000 * (i + 1))); continue; }
    if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300));
    return j.data;
  }
}

const TEMPLATE_CODE = /(?:\s*[（(]?\s*(?<![A-Za-z0-9])(?:YB-05|[A-Z]{1,6}-\d{2}(?:-[A-Z]+)?|TEMU-\d{3,4}(?:-[A-Z])?|sg\d{3}(?:-[a-z])?|ny\d{3}|de\d{3}|zk\d{3}|sl\d{3})\s*[)）]?)+\s*$/;
// 本次运行开始以后新建的 ANET 商品：标题去模板型号
async function stripNewTitles(since) {
  let ok = 0, fail = 0;
  for (let c = null; ;) {
    const d = await shopifyGql(`query($c: String, $q: String) { products(first: 100, after: $c, query: $q) { pageInfo { hasNextPage endCursor } nodes { id vendor handle title } } }`, { c, q: `vendor:ANET AND created_at:>='${since}'` });
    for (const n of d.products.nodes) {
      if (n.vendor !== 'ANET') continue;
      const t = n.title.replace(/\s+/g, ' ').trim(); const clean = t.replace(TEMPLATE_CODE, '').replace(/\s+/g, ' ').trim();
      if (!clean || clean === n.title) continue;
      const r = await shopifyGql(`mutation($i: ProductInput!) { productUpdate(input: $i) { userErrors { message } } }`, { i: { id: n.id, title: clean } });
      const e = r.productUpdate.userErrors.map((x) => x.message).join('; ');
      if (e) { fail++; log(`  标题失败 ${n.handle}: ${e}`); } else { ok++; log(`  标题去型番：${n.title} → ${clean}`); }
    }
    if (!d.products.pageInfo.hasNextPage) break; c = d.products.pageInfo.endCursor;
  }
  log(`标题去型番结束：ok=${ok} failed=${fail}`);
}

async function ensureChannels() {
  const pubs = (await shopifyGql(`{ publications(first: 25) { nodes { id name } } }`)).publications.nodes;
  const want = [pubs.find((p) => /online store|オンラインストア/i.test(p.name)), ...pubs.filter((p) => /headless/i.test(p.name))].filter(Boolean);
  log(`渠道补发布：${want.map((p) => p.name).join(' / ')}`);
  const todo = [];
  for (let c = null; ;) {
    const d = await shopifyGql(`query($c: String) { products(first: 100, after: $c, query: "vendor:ANET AND status:active") { pageInfo { hasNextPage endCursor } nodes { id vendor handle ${want.map((p, i) => `p${i}: publishedOnPublication(publicationId: "${p.id}")`).join(' ')} } } }`, { c });
    for (const n of d.products.nodes) { if (n.vendor !== 'ANET') continue; const miss = want.filter((_, i) => !n[`p${i}`]); if (miss.length) todo.push({ id: n.id, handle: n.handle, miss }); }
    if (!d.products.pageInfo.hasNextPage) break; c = d.products.pageInfo.endCursor;
  }
  let ok = 0, fail = 0;
  for (const t of todo) {
    const d = await shopifyGql(`mutation($id: ID!, $in: [PublicationInput!]!) { publishablePublish(id: $id, input: $in) { userErrors { message } } }`, { id: t.id, in: t.miss.map((p) => ({ publicationId: p.id })) });
    const e = d.publishablePublish.userErrors.map((x) => x.message).join('; ');
    if (e) { fail++; log(`  渠道失败 ${t.handle}: ${e}`); } else { ok++; log(`  已发布 ${t.handle} → ${t.miss.map((p) => p.name).join(' / ')}`); }
  }
  log(`渠道补发布结束：需要 ${todo.length}，ok=${ok} failed=${fail}`);
}

async function main() {
  if (CHANNELS_ONLY) return ensureChannels();
  const startedAt = new Date(Date.now() - 60000).toISOString();
  let auth = await login();
  log(`登录成功 tenant=${auth.tenantId} api=${API} limit=${LIMIT} status=${STATUS}`);
  let round = 0, totalOk = 0, totalFail = 0;
  for (;;) {
    round++;
    // Node 内建 fetch 有 5 分钟 headers 超时，50 件一批约 20 分钟 → 用 node:http 无超时请求
    let res;
    try {
      res = await postNoTimeout(`${API}/dropship/publish-batch?limit=${LIMIT}&status=${STATUS}`, {
        Authorization: `Bearer ${auth.token}`, 'x-tenant-id': auth.tenantId,
      });
    } catch (e) {
      log(`第 ${round} 轮请求异常：${String(e).slice(0, 200)}，60s 后重试`);
      await new Promise((r) => setTimeout(r, 60000));
      continue;
    }
    if (res.status === 401) { log('token 过期，重新登录'); auth = await login(); continue; }
    if (!res.ok) {
      log(`第 ${round} 轮 HTTP ${res.status} ${res.text.slice(0, 200)}，60s 后重试`);
      await new Promise((r) => setTimeout(r, 60000));
      continue;
    }
    const out = JSON.parse(res.text);
    if (!Array.isArray(out) || out.length === 0) { log('publish-batch 返回空，全部处理完毕'); break; }
    const ok = out.filter((x) => x.ok).length, failed = out.length - ok;
    totalOk += ok; totalFail += failed;
    log(`第 ${round} 轮：ok=${ok} failed=${failed}  累计 ok=${totalOk} failed=${totalFail}`);
    for (const x of out.filter((x) => !x.ok)) log(`  失败 ${x.id}: ${x.error}`);
  }
  log(`结束：累计 published=${totalOk} error=${totalFail}`);
  if (CHANNELS) { await stripNewTitles(startedAt); await ensureChannels(); }
}

main().then(() => process.exit(0), (e) => { log('致命错误', e); process.exit(1); });
