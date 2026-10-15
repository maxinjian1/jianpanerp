#!/usr/bin/env node
/**
 * kuajingyifan.com（日本国内一件代发）采集器 —— 不需要登录、不需要 Playwright
 *
 * 2026-10-15 调研结论：站点是 Nuxt 2 SSR，商品页 HTML 里 `window.__NUXT__` 已带 SKU 价格 / 库存 / 图片，
 * 匿名 curl 即可拿到；登录只在下单时需要。
 *
 * 用法（Windows，仓库根目录，Node 20+，零依赖）：
 *   node tools/kjyf-scraper/scrape.mjs --limit 300            # 采 300 个商品 → tools/kjyf-scraper/out/products.json
 *   node tools/kjyf-scraper/scrape.mjs --limit 3 --dump       # 顺便把前 3 个商品的 __NUXT__ 原始状态存到 out/dump-*.json（排查字段用）
 *   node tools/kjyf-scraper/scrape.mjs --limit 300 --post     # 采完直接 POST 到本机 API /dropship/import（读 .env 的 ERP_*）
 *   node tools/kjyf-scraper/scrape.mjs --post-only            # 只把上次的 out/products.json 推到 API
 *   选项：--offset N（从 sitemap 第 N 个商品开始）--concurrency 3 --delay 400（毫秒）--ids 39522,39523（只抓指定 goodId）
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const OUT_DIR = join(__dirname, 'out');
const BASE = 'https://www.kuajingyifan.com';
const LOCALE = 'ja-JP';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

// ───────────── 参数 ─────────────
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d;
};
const LIMIT = Number(opt('limit', 300));
const OFFSET = Number(opt('offset', 0));
const CONCURRENCY = Number(opt('concurrency', 3));
const DELAY = Number(opt('delay', 400));
const DUMP = flag('dump');
const POST = flag('post');
const POST_ONLY = flag('post-only');
const IDS = opt('ids', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

// ───────────── .env ─────────────
function loadEnv() {
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
}
loadEnv();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { retries = 3, type = 'text' } = {}) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Language': 'ja,zh-CN;q=0.8', Cookie: `vsf-locale=${LOCALE}` },
        signal: AbortSignal.timeout(30000),
        redirect: 'follow',
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return type === 'json' ? res.json() : res.text();
    } catch (e) {
      lastErr = e;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastErr;
}

// ───────────── 1. 商品 URL 列表 ─────────────
async function listProductUrls() {
  if (IDS.length) return IDS.map((id) => `${BASE}/${LOCALE}/p/${id}/-`);
  const xml = await get(`${BASE}/sitemap/${LOCALE}.xml`);
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  const products = locs.filter((u) => /\/p\/\d+/.test(u));
  // 去重（同一 goodId 可能多条）
  const seen = new Set();
  const uniq = [];
  for (const u of products) {
    const id = u.match(/\/p\/(\d+)/)[1];
    if (seen.has(id)) continue;
    seen.add(id);
    uniq.push(u);
  }
  console.log(`sitemap: ${locs.length} URL，商品 ${uniq.length} 个（去重后）`);
  return uniq.slice(OFFSET, OFFSET + LIMIT);
}

// ───────────── 2. 解析 __NUXT__ ─────────────
function extractNuxtState(html) {
  const m = html.match(/<script>\s*window\.__NUXT__\s*=\s*([\s\S]*?);?\s*<\/script>/);
  if (!m) throw new Error('页面里没有 window.__NUXT__');
  const code = m[1];
  const sandbox = { window: {} };
  // __NUXT__ 是 (function(a,b,...){return {...}})(args) 的形式，必须执行才能展开
  const value = vm.runInNewContext(`(${code})`, sandbox, { timeout: 5000 });
  return JSON.parse(JSON.stringify(value)); // 去掉 undefined / 函数
}

const IMG_RE = /^https?:\/\/[^\s"']+\.(?:jpe?g|png|webp|gif)(?:\?.*)?$/i;

function* walk(node, path = []) {
  if (node && typeof node === 'object') {
    yield [node, path];
    for (const [k, v] of Object.entries(node)) yield* walk(v, [...path, k]);
  }
}

const isSku = (o) => o && typeof o === 'object' && !Array.isArray(o) && ('skuId' in o || 'sku_id' in o) && ('price' in o || 'salePrice' in o);

function pickString(o, keys) {
  for (const k of keys) if (typeof o[k] === 'string' && o[k].trim()) return o[k].trim();
  return undefined;
}
function pickNumber(o, keys) {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  }
  return undefined;
}

/** 从 SKU 对象里挤出规格值（颜色/尺码…），尽量通用 */
function skuOptions(sku) {
  const out = [];
  for (const key of ['attrs', 'attributes', 'specs', 'specList', 'attrList', 'skuAttrs', 'properties', 'props']) {
    const arr = sku[key];
    if (Array.isArray(arr)) {
      for (const a of arr) {
        if (typeof a === 'string') out.push(a);
        else if (a && typeof a === 'object') {
          const v = pickString(a, ['value', 'attrValue', 'valueName', 'specValue', 'name', 'label']);
          if (v) out.push(v);
        }
      }
      if (out.length) return out;
    }
  }
  const name = pickString(sku, ['skuName', 'specName', 'attrValue', 'spec', 'name', 'title']);
  return name ? [name] : [];
}

function optionNames(sku) {
  for (const key of ['attrs', 'attributes', 'specs', 'specList', 'attrList', 'skuAttrs', 'properties', 'props']) {
    const arr = sku[key];
    if (Array.isArray(arr) && arr.length && typeof arr[0] === 'object') {
      const names = arr.map((a) => pickString(a, ['attrName', 'key', 'specKey', 'keyName', 'group', 'attr']));
      if (names.every(Boolean)) return names;
    }
  }
  return undefined;
}

/**
 * 2026-10-15 实测结构（Windows 会话 dump）：
 *   state.ssrRefs["useProduct-products-{goodId}"].list[0] = 商品对象
 *   商品：title(已是日文) subTitle note desc(HTML) imageUrl imageUrl1..9 catTree[{name}] skuProps[{propId,propName,values[{valueId,propValue}]}] skus[]
 *   SKU： skuId outId price originalPrice stockNum barcode skuImage propsIds("propId:valueId" 多规格用分隔符连接)
 */
function parseKnown(state, goodId, url) {
  const ref = state?.ssrRefs?.[`useProduct-products-${goodId}`];
  const p = ref?.list?.[0];
  if (!p || !Array.isArray(p.skus) || !p.skus.length) return null;

  // 规格表：propId → {name, values: valueId → propValue}
  const props = new Map();
  for (const sp of p.skuProps ?? []) {
    props.set(String(sp.propId), {
      name: String(sp.propName ?? '').trim(),
      values: new Map((sp.values ?? []).map((v) => [String(v.valueId), String(v.propValue ?? '').trim()])),
    });
  }
  const propOrder = [...props.keys()];
  const optionNames = propOrder.map((id) => props.get(id).name).filter(Boolean);

  const decodeProps = (propsIds) => {
    const vals = new Array(propOrder.length).fill(undefined);
    for (const pair of String(propsIds ?? '').split(/[;,|&\s]+/)) {
      const [pid, vid] = pair.split(':');
      const idx = propOrder.indexOf(String(pid));
      if (idx >= 0) vals[idx] = props.get(String(pid)).values.get(String(vid)) ?? vid;
    }
    return vals.map((v) => v ?? '');
  };

  const images = [];
  const seen = new Set();
  const push = (u) => {
    if (typeof u === 'string' && /^https?:\/\//.test(u) && !seen.has(u)) {
      seen.add(u);
      images.push(u);
    }
  };
  push(p.imageUrl);
  for (let i = 1; i <= 9; i++) push(p[`imageUrl${i}`]);
  for (const s of p.skus) push(s.skuImage);

  const variants = p.skus.map((s, i) => {
    const options = optionNames.length ? decodeProps(s.propsIds) : [];
    return {
      name: options.filter(Boolean).join(' / ') || undefined,
      sku: (s.outId && String(s.outId).trim()) || `KJYF-${goodId}-${i + 1}`,
      wholesalePrice: Number(s.price) || 0,
      stock: Number.isFinite(Number(s.stockNum)) ? Number(s.stockNum) : undefined,
      options: options.length ? options : undefined,
      barcode: s.barcode ? String(s.barcode) : undefined,
    };
  });

  const category = (p.catTree ?? []).map((c) => c?.name).filter(Boolean).join(' > ') || undefined;
  return {
    externalId: goodId,
    sourceUrl: url,
    titleZh: String(p.title ?? '').replace(/\s+/g, ' ').trim() || `商品 ${goodId}`,
    descriptionZh: typeof p.desc === 'string' && p.desc.trim() ? p.desc : undefined,
    category,
    images: images.slice(0, 30),
    variants,
    optionNames: optionNames.length ? optionNames : undefined,
    raw: {
      goodId,
      lang: 'ja', // ja-JP 站点，标题/描述本身已是日文
      subTitle: p.subTitle ?? null,
      note: p.note ?? null, // 发货说明（埼玉仓等）
      shippingPeriod: p.shippingPeriod ?? null,
      keywords: p.keywords ?? null,
      videoUrl: p.videoUrl ?? null,
      skuIds: p.skus.map((s) => s.skuId),
      originalPrices: p.skus.map((s) => s.originalPrice ?? null),
      taxRates: p.skus.map((s) => s.taxRate ?? null),
      skuImages: p.skus.map((s) => s.skuImage ?? null),
      propsIds: p.skus.map((s) => s.propsIds ?? null),
    },
  };
}

function parseProduct(html, url) {
  const goodId = url.match(/\/p\/(\d+)/)[1];
  const state = extractNuxtState(html);

  const known = parseKnown(state, goodId, url);
  if (known) return known;

  // ───── 退路：站点结构变了时的通用启发式解析 ─────
  let product;
  let skuList = [];
  const candidates = [];
  for (const [node] of walk(state)) {
    if (Array.isArray(node)) continue;
    for (const v of Object.values(node)) {
      if (Array.isArray(v) && v.length && v.every(isSku)) {
        candidates.push({ node, skus: v });
        break;
      }
    }
  }
  const byId = candidates.find((c) => String(c.node.goodId ?? c.node.id ?? c.node.goodsId ?? '') === goodId);
  const chosen = byId ?? candidates.sort((a, b) => b.skus.length - a.skus.length)[0];
  if (chosen) {
    product = chosen.node;
    skuList = chosen.skus;
  } else {
    // 退路：全页面所有 SKU 里 goodId 匹配的
    for (const [node] of walk(state)) if (isSku(node) && String(node.goodId ?? node.goodsId ?? '') === goodId) skuList.push(node);
    product = {};
  }
  if (!skuList.length) throw new Error('没找到 SKU 列表');

  // 标题：优先商品对象，其次 <title>
  const title =
    pickString(product, ['goodName', 'goodsName', 'name', 'title', 'productName']) ??
    (html.match(/<title>([^<]*)<\/title>/)?.[1] ?? '').replace(/\s*[-|｜].*$/, '').trim() ??
    `商品 ${goodId}`;
  const description = pickString(product, ['description', 'detail', 'content', 'goodDesc', 'descriptionHtml', 'detailHtml']);
  const category = pickString(product, ['categoryName', 'catName', 'category']);

  // 图片：商品对象及 SKU 内所有图片 URL（去重，保持顺序）
  const images = [];
  const seenImg = new Set();
  const collect = (root) => {
    for (const [node] of walk(root)) {
      for (const v of Object.values(node)) {
        if (typeof v === 'string' && IMG_RE.test(v) && !seenImg.has(v)) {
          seenImg.add(v);
          images.push(v);
        }
      }
    }
  };
  collect(product);
  if (!images.length) collect(state);

  const variants = skuList.map((s, i) => ({
    name: pickString(s, ['skuName', 'specName', 'name', 'title']),
    sku: pickString(s, ['outId', 'skuCode', 'code', 'sku']) ?? `KJYF-${goodId}-${i + 1}`,
    skuId: s.skuId ?? s.sku_id,
    wholesalePrice: pickNumber(s, ['price', 'salePrice', 'wholesalePrice']) ?? 0,
    originalPrice: pickNumber(s, ['originalPrice', 'marketPrice']),
    stock: pickNumber(s, ['stockNum', 'stock', 'inventory', 'qty']),
    weight: pickNumber(s, ['weight']),
    barcode: pickString(s, ['barcode']),
    image: Object.values(s).find((v) => typeof v === 'string' && IMG_RE.test(v)),
    options: skuOptions(s),
  }));

  return {
    externalId: goodId,
    sourceUrl: url,
    titleZh: title,
    descriptionZh: description,
    category,
    images: images.slice(0, 30),
    variants: variants.map(({ skuId, originalPrice, weight, image, ...v }) => ({ ...v, options: v.options.length ? v.options : undefined })),
    optionNames: optionNames(skuList[0]),
    raw: { goodId, skuIds: variants.map((v) => v.skuId), weights: variants.map((v) => v.weight), originalPrices: variants.map((v) => v.originalPrice), skuImages: variants.map((v) => v.image) },
  };
}

// ───────────── 3. 推送到 ERP ─────────────
async function erpSession() {
  const api = (process.env.ERP_API_URL || 'http://localhost:4000/api/v1').replace(/\/$/, '');
  const email = process.env.ERP_EMAIL || 'ops@anet.local';
  const password = process.env.ERP_PASSWORD;
  if (!password) throw new Error('.env 里缺 ERP_PASSWORD（采集器登录本机 API 用，自定一个即可）');
  const post = (path, body, headers = {}) =>
    fetch(`${api}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  let res = await post('/auth/login', { email, password });
  if (res.status === 401 || res.status === 404) {
    console.log(`ERP 账号 ${email} 不存在，自动注册…`);
    res = await post('/auth/register', { companyName: 'ANET', name: 'ops', email, password });
  }
  if (!res.ok) throw new Error(`ERP 登录/注册失败 HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  return { api, token: data.accessToken, tenantId: data.user.tenantId };
}

async function postToErp(items) {
  const { api, token, tenantId } = await erpSession();
  let created = 0;
  let updated = 0;
  const BATCH = Number(opt('batch', 20)); // 旧 api-core は 100KB body 上限（413）→ 小批次更稳
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const res = await fetch(`${api}/dropship/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'x-tenant-id': tenantId },
      body: JSON.stringify({ items: batch, supplier: 'kjyf' }),
    });
    if (!res.ok) throw new Error(`import 失败 HTTP ${res.status} ${await res.text()}`);
    const r = await res.json();
    created += r.created ?? 0;
    updated += r.updated ?? 0;
    console.log(`  已推送 ${Math.min(i + BATCH, items.length)}/${items.length}`);
  }
  console.log(`ERP 入库：新增 ${created}，更新 ${updated}`);
}

// ───────────── main ─────────────
async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, 'products.json');

  // --file x.html --ids 39522：离线解析一个已保存的商品页（调试字段映射用）
  if (opt('file')) {
    const html = readFileSync(opt('file'), 'utf8');
    console.log(JSON.stringify(parseProduct(html, `${BASE}/${LOCALE}/p/${IDS[0] ?? '0'}/-`), null, 2));
    return;
  }

  if (POST_ONLY) {
    const items = JSON.parse(readFileSync(outFile, 'utf8'));
    await postToErp(items);
    return;
  }

  const urls = await listProductUrls();
  console.log(`开始采集 ${urls.length} 个商品（并发 ${CONCURRENCY}，间隔 ${DELAY}ms）`);
  const results = [];
  const errors = [];
  let cursor = 0;
  let dumped = 0;

  async function worker() {
    while (cursor < urls.length) {
      const idx = cursor++;
      const url = urls[idx];
      try {
        const html = await get(url);
        if (!html) throw new Error('404');
        if (DUMP && dumped < 3) {
          dumped++;
          writeFileSync(join(OUT_DIR, `dump-${url.match(/\/p\/(\d+)/)[1]}.json`), JSON.stringify(extractNuxtState(html), null, 2));
        }
        const p = parseProduct(html, url);
        results.push(p);
        const min = Math.min(...p.variants.map((v) => v.wholesalePrice));
        console.log(`[${idx + 1}/${urls.length}] ${p.externalId} ${p.titleZh.slice(0, 30)} | SKU×${p.variants.length} | ¥${min}～ | 图×${p.images.length}`);
      } catch (e) {
        errors.push({ url, error: String(e.message ?? e) });
        console.warn(`[${idx + 1}/${urls.length}] 失败 ${url}: ${e.message ?? e}`);
      }
      await sleep(DELAY);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  results.sort((a, b) => Number(a.externalId) - Number(b.externalId));
  writeFileSync(outFile, JSON.stringify(results, null, 2));
  writeFileSync(join(OUT_DIR, 'errors.json'), JSON.stringify(errors, null, 2));
  const noPrice = results.filter((p) => p.variants.every((v) => !v.wholesalePrice)).length;
  console.log(`\n完成：成功 ${results.length}，失败 ${errors.length}，无价格 ${noPrice} → ${outFile}`);

  if (POST && results.length) await postToErp(results);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
