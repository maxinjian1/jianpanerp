#!/usr/bin/env node
/**
 * 商品目录清理（Shopify 直改，带备份/回滚）。Windows 仓库根运行，读 .env 的 SHOPIFY_*。
 *  1) 标题：去掉批发商模板型号（YB-05、C-44 这类单字母-两位数、WBGHS-01-x、GYS-01-x、TEMU-xxxx、xB-02 等）
 *  2) 分类（productType）：把「🎉 サプライズセール🎉」「分类」「📦仓库耗材📦」「ファッション・鞄」「空」归入 8 个正式分类
 *     （用 6kpro 按标题判断；ファッション・鞄 直接归 衣類）
 *  3) 重复商品：只输出清单 out/duplicates.md，不自动删除
 *
 *   node tools/market-research/fix-catalog.mjs --dry        # 只看将改什么
 *   node tools/market-research/fix-catalog.mjs              # 执行
 *   node tools/market-research/fix-catalog.mjs --rollback tools/market-research/out/catalog-backup.json
 */
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const OUT = 'tools/market-research/out'; fs.mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const SHOP = env.SHOPIFY_STORE_DOMAIN, CID = env.SHOPIFY_CLIENT_ID, SECRET = env.SHOPIFY_CLIENT_SECRET, VER = env.SHOPIFY_API_VERSION || '2026-10';
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash';

const CANON = ['日用品雑貨', '健康・ダイエット', 'スマートフォン・パソコン・周辺機器', '家具・インテリア', '旅行・キャンプ用品', 'ペット・ペットグッズ', 'ベビー用品・マタニティ', '衣類 ·アクセサリー ·ジュエリー'];
const BAD_TYPES = new Set(['🎉 サプライズセール🎉', '分类', '📦仓库耗材📦', '', null, undefined]);
const DIRECT_MAP = { 'ファッション・鞄': '衣類 ·アクセサリー ·ジュエリー' };
// 模板型号：只删这些明确的模式，真实型号（DSHJ-S-2128-JP、R1004 等）保留
// 左边界 (?<![A-Za-z0-9]) 防止把 GYSLG-01 截成 GYSL；1–6 位大写字母-两位数(-字母) 覆盖批发商拼音首字母模板码（AB-03、DJDGH-04、GYSQHJ-01）
// 真实型号不受影响：WRTA-BR-479 / DSHJ-S-2128-JP（3–4 位数字组）、R1004（无连字符）、4K-60（边界）
const TEMPLATE_CODE = /(?:\s*[（(]?\s*(?<![A-Za-z0-9])(?:YB-05|[A-Z]{1,6}-\d{2}(?:-[A-Z]+)?|TEMU-\d{3,4}(?:-[A-Z])?|sg\d{3}(?:-[a-z])?|ny\d{3}|de\d{3}|zk\d{3}|sl\d{3})\s*[)）]?)+\s*$/;

let token;
async function getToken() { if (token) return token; const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CID, client_secret: SECRET }) }); if (!r.ok) throw new Error(`token ${r.status}`); token = (await r.json()).access_token; return token; }
async function gql(query, variables = {}) { const r = await fetch(`https://${SHOP}/admin/api/${VER}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': await getToken() }, body: JSON.stringify({ query, variables }) }); const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data; }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function classify(title) {
  const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 40, messages: [{ role: 'system', content: `次の商品名を、以下のカテゴリのいずれか1つに分類し、カテゴリ名だけを返してください：\n${CANON.join('\n')}` }, { role: 'user', content: title }] }) });
  const t = ((await r.json()).choices?.[0]?.message?.content ?? '').trim();
  return CANON.find((c) => t.includes(c.replace(/ ·/g, '').slice(0, 4)) || t === c) ?? '日用品雑貨';
}

async function rollback(file) {
  const b = JSON.parse(fs.readFileSync(file, 'utf8')); let n = 0;
  for (const x of b) { await gql(`mutation($i:ProductInput!){productUpdate(input:$i){userErrors{message}}}`, { i: { id: x.id, title: x.title, productType: x.productType } }); n++; await sleep(400); }
  console.log(`rolled back ${n}`);
}

async function main() {
  if (args.rollback) return rollback(args.rollback);
  if (args['from-changes']) return applyFromChanges();
  const all = []; let cursor = null;
  for (;;) { const d = await gql(`query($c:String){products(first:250,after:$c,query:"vendor:ANET"){pageInfo{hasNextPage endCursor} nodes{id title productType handle status}}}`, { c: cursor }); all.push(...d.products.nodes); if (!d.products.pageInfo.hasNextPage) break; cursor = d.products.pageInfo.endCursor; }
  console.log(`products=${all.length}`);
  const changes = [];
  for (const p of all) {
    const newTitle = p.title.replace(TEMPLATE_CODE, '').replace(/\s+/g, ' ').trim();
    let newType = p.productType;
    if (DIRECT_MAP[p.productType]) newType = DIRECT_MAP[p.productType];
    else if (BAD_TYPES.has(p.productType)) { newType = await classify(p.title); await sleep(150); }
    if (newTitle !== p.title || newType !== p.productType) changes.push({ id: p.id, handle: p.handle, title: p.title, productType: p.productType, newTitle, newType });
  }
  console.log(`title changes=${changes.filter((c) => c.newTitle !== c.title).length} type changes=${changes.filter((c) => c.newType !== c.productType).length}`);
  // 重复清单（去型号、去空格后同名）
  const groups = new Map();
  for (const p of all) { const k = p.title.replace(/[（(]?[A-Za-z]{1,6}-?\d{1,4}(?:-[A-Za-z0-9]{1,4})*[)）]?/g, '').replace(/\s+/g, ''); (groups.get(k) ?? groups.set(k, []).get(k)).push(p); }
  const dups = [...groups.values()].filter((g) => g.length > 1);
  fs.writeFileSync(path.join(OUT, 'duplicates.md'), ['# 疑似重复商品（同名不同型号；天然石手链等同系列不算重复，请人工判断）', '', ...dups.map((g) => `- ${g.length} 件: ${g.map((p) => `[${p.title.slice(0, 45)}](https://anetmc.com/products/${p.handle})`).join(' / ')}`)].join('\n'));
  console.log(`duplicate groups=${dups.length} -> out/duplicates.md`);
  fs.writeFileSync(path.join(OUT, 'catalog-changes.json'), JSON.stringify(changes, null, 1));
  if (args.dry) { changes.slice(0, 30).forEach((c) => console.log(`${c.title}  =>  ${c.newTitle}  [${c.productType} => ${c.newType}]`)); return; }
  const backupPath = path.join(OUT, 'catalog-backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(changes.map((c) => ({ id: c.id, title: c.title, productType: c.productType })), null, 1));
  let n = 0;
  for (const c of changes) {
    const d = await gql(`mutation($i:ProductInput!){productUpdate(input:$i){userErrors{field message}}}`, { i: { id: c.id, title: c.newTitle, productType: c.newType } });
    if (d.productUpdate.userErrors?.length) console.error(c.handle, d.productUpdate.userErrors);
    n++; if (n % 50 === 0) console.log(`${n}/${changes.length}`); await sleep(400);
  }
  console.log(`done ${n}; backup ${backupPath}`);
}
// --from-changes：复用 dry 产出的 catalog-changes.json 里的分类结果，只用新正则重算标题，直接写 Shopify（省掉 1 小时 LLM 归类）
async function applyFromChanges() {
  const prev = JSON.parse(fs.readFileSync(path.join(OUT, 'catalog-changes.json'), 'utf8'));
  const typeById = new Map(prev.map((c) => [c.id, c.newType]));
  const all = []; let cursor = null;
  for (;;) { const d = await gql(`query($c:String){products(first:250,after:$c,query:"vendor:ANET"){pageInfo{hasNextPage endCursor} nodes{id title productType handle status}}}`, { c: cursor }); all.push(...d.products.nodes); if (!d.products.pageInfo.hasNextPage) break; cursor = d.products.pageInfo.endCursor; }
  const changes = [];
  for (const p of all) {
    const newTitle = p.title.replace(/・\s*[A-Z]{1,6}-\d{2}\s*）$/, '）').replace(TEMPLATE_CODE, '').replace(/\s+/g, ' ').trim() || p.title;
    const newType = typeById.get(p.id) ?? (DIRECT_MAP[p.productType] ?? p.productType);
    if (newTitle !== p.title || newType !== p.productType) changes.push({ id: p.id, handle: p.handle, title: p.title, productType: p.productType, newTitle, newType });
  }
  const frag = changes.filter((c) => c.newTitle !== c.title && c.title.startsWith(c.newTitle) && !/^[\s（(]/.test(c.title.slice(c.newTitle.length)) && !/[\s（()）]/.test(c.title[c.newTitle.length - 1] ?? ' '));
  console.log(`products=${all.length} title changes=${changes.filter((c) => c.newTitle !== c.title).length} type changes=${changes.filter((c) => c.newType !== c.productType).length} fragments=${frag.length}`);
  if (frag.length) { console.error('发现截断碎片，停止：', frag.slice(0, 5).map((c) => `${c.title} => ${c.newTitle}`)); process.exit(2); }
  fs.writeFileSync(path.join(OUT, 'catalog-changes.json'), JSON.stringify(changes, null, 1));
  if (args.dry) { changes.slice(0, 30).forEach((c) => console.log(`${c.title}  =>  ${c.newTitle}  [${c.productType} => ${c.newType}]`)); return; }
  const backupPath = path.join(OUT, 'catalog-backup.json');
  fs.writeFileSync(backupPath, JSON.stringify(changes.map((c) => ({ id: c.id, title: c.title, productType: c.productType })), null, 1));
  let n = 0;
  for (const c of changes) {
    const d = await gql(`mutation($i:ProductInput!){productUpdate(input:$i){userErrors{field message}}}`, { i: { id: c.id, title: c.newTitle, productType: c.newType } });
    if (d.productUpdate.userErrors?.length) console.error(c.handle, d.productUpdate.userErrors);
    n++; if (n % 50 === 0) console.log(`${n}/${changes.length}`); await sleep(400);
  }
  console.log(`done ${n}; backup ${backupPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
