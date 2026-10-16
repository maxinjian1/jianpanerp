#!/usr/bin/env node
/**
 * 把 score.mjs 产出的 seo_title / keywords / hook 写回 Shopify（标题 + SEO title/description + tags）。
 * 在 Windows 仓库根运行（读 .env 的 SHOPIFY_STORE_DOMAIN / CLIENT_ID / CLIENT_SECRET / API_VERSION）。零依赖。
 *
 *   node tools/market-research/apply-seo.mjs --dry                  # 只打印将要改的前 20 条
 *   node tools/market-research/apply-seo.mjs --only-hero            # 只改 hero-top50.json 里的商品
 *   node tools/market-research/apply-seo.mjs                        # 全部（跳过 risk != none 的）
 *   node tools/market-research/apply-seo.mjs --rollback out/seo-backup.json   # 回滚
 *
 * 每次运行先把原标题/SEO 追加写入 out/seo-backup.json，可随时回滚。限速：每秒 2 次 mutation。
 */
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const OUT = 'tools/market-research/out';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const SHOP = env.SHOPIFY_STORE_DOMAIN, CID = env.SHOPIFY_CLIENT_ID, SECRET = env.SHOPIFY_CLIENT_SECRET, VER = env.SHOPIFY_API_VERSION || '2026-10';
if (!SHOP || !CID || !SECRET) { console.error('缺少 SHOPIFY_STORE_DOMAIN / CLIENT_ID / CLIENT_SECRET'); process.exit(1); }

let token;
async function getToken() {
  if (token) return token;
  const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CID, client_secret: SECRET }) });
  if (!r.ok) throw new Error(`token ${r.status}`);
  token = (await r.json()).access_token; return token;
}
async function gql(query, variables = {}) {
  const r = await fetch(`https://${SHOP}/admin/api/${VER}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': await getToken() }, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function rollback(file) {
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const b of backup) {
    await gql(`mutation($input: ProductInput!){ productUpdate(input:$input){ userErrors{ field message } } }`, { input: { id: b.gid, title: b.title, seo: b.seo, tags: b.tags } });
    n++; await sleep(500);
  }
  console.log(`rolled back ${n}`);
}

async function main() {
  if (args.rollback) return rollback(args.rollback);
  const rows = fs.readFileSync(path.join(OUT, 'scores.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const heroIds = args['only-hero'] ? new Set(JSON.parse(fs.readFileSync(path.join(OUT, 'hero-top50.json'), 'utf8')).map((h) => h.id)) : null;
  const products = JSON.parse(fs.readFileSync(path.join(OUT, 'products.json'), 'utf8'));
  const gidByHandle = new Map();
  // 通过 handle 查 Shopify 商品 gid（分页 250）
  let cursor = null;
  for (;;) {
    const d = await gql(`query($c:String){ products(first:250, after:$c, query:"vendor:ANET"){ pageInfo{hasNextPage endCursor} nodes{ id handle title tags seo{ title description } } } }`, { c: cursor });
    for (const p of d.products.nodes) gidByHandle.set(p.handle, p);
    if (!d.products.pageInfo.hasNextPage) break; cursor = d.products.pageInfo.endCursor;
  }
  const todo = rows.filter((r) => r.seo_title && r.seo_title.length <= 70 && (!r.risk || r.risk === 'none') && (!heroIds || heroIds.has(r.id)) && gidByHandle.has(r.handle));
  console.log(`candidates=${todo.length} (shopify products=${gidByHandle.size})`);
  const backupPath = path.join(OUT, 'seo-backup.json');
  const backup = fs.existsSync(backupPath) ? JSON.parse(fs.readFileSync(backupPath, 'utf8')) : [];
  let n = 0;
  for (const r of todo) {
    const p = gidByHandle.get(r.handle);
    const title = r.seo_title.trim(); // 商品标题用全长（≤70，过滤已保证），只有 SEO meta title 截到 60，避免标题中途截断
    const seoTitle = title.slice(0, 60);
    const seoDesc = `${r.hook ?? ''}。${(r.keywords ?? []).slice(0, 3).join('・')}。全国送料無料・平日12時までのご注文は当日出荷。`.slice(0, 155);
    const tags = Array.from(new Set([...(p.tags ?? []), ...(r.keywords ?? []).slice(0, 5)]));
    if (args.dry) { if (n < 20) console.log(`\n[${p.handle}]\n  旧: ${p.title}\n  新: ${title}\n  SEO: ${seoDesc}`); n++; continue; }
    backup.push({ gid: p.id, handle: p.handle, title: p.title, seo: p.seo, tags: p.tags });
    const d = await gql(`mutation($input: ProductInput!){ productUpdate(input:$input){ product{ id } userErrors{ field message } } }`, { input: { id: p.id, title, seo: { title: seoTitle, description: seoDesc }, tags } });
    const ue = d.productUpdate.userErrors; if (ue?.length) console.error(p.handle, ue);
    n++; if (n % 25 === 0) { fs.writeFileSync(backupPath, JSON.stringify(backup, null, 1)); console.log(`${n}/${todo.length}`); }
    await sleep(500);
  }
  if (!args.dry) fs.writeFileSync(backupPath, JSON.stringify(backup, null, 1));
  console.log(`done ${n}${args.dry ? ' (dry)' : ''}; backup: ${backupPath}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
