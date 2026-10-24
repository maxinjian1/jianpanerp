#!/usr/bin/env node
/**
 * 斑馬 乐天草稿箱（人手で整えた日本語の画像・説明）を母本にして anetmc.com（Shopify）へ同期する。
 * 用户決定 2026-10-25：タイトルは Shopify 現状を維持（A）／対応できた商品は一括で画像を置換（A）／説明文は草稿で上書き（同意）。
 *
 *   node tools/rakuten/draft-sync.mjs probe                 # drafts/<spu>.json 1 件の構造を表示（画像・説明のキーが合っているか確認）
 *   node tools/rakuten/draft-sync.mjs plan                  # 草稿 ↔ Shopify を SKU/型番で突き合わせ → out/draft-sync-plan.json + docs/rakuten/draft-sync-plan.md
 *   node tools/rakuten/draft-sync.mjs apply [--limit N] [--only handle,handle]   # 旧画像をローカルに保存→草稿画像を登録→並べ替え→旧画像削除→説明上書き
 *   node tools/rakuten/draft-sync.mjs rollback [--only handle]                   # バックアップ（ローカル画像＋旧説明）から復元
 *   node tools/rakuten/draft-sync.mjs status
 *
 * 入力：tools/rakuten/out/drafts/<spu>.json（banma-export.browser.js で取得）
 * バックアップ：tools/rakuten/out/shopify-backup/<handle>/{backup.json, NN.jpg}
 * 安全：価格・在庫・タイトル・タグは触らない。失敗率 2% 超または連続 5 件失敗で停止。Shopify 書き込みは 1 件ずつ、間隔 ≥ 1 秒。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out'); const DRAFTS = path.join(OUT, 'drafts'); const BAK = path.join(OUT, 'shopify-backup');
fs.mkdirSync(BAK, { recursive: true });
const argv = process.argv.slice(2); const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : (i >= 0 ? '1' : d); };
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const SHOP = env.SHOPIFY_STORE_DOMAIN, VER = env.SHOPIFY_API_VERSION || '2026-10';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const W = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n'); };
const LOG = path.join(OUT, 'draft-sync-log.jsonl'); const record = (o) => fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
const K = (x) => String(x ?? '').trim().toUpperCase().replace(/^0+(?=[A-Z])/, '');

// ───────── 草稿の正規化（斑馬の product オブジェクトはキー名が揺れるので候補を順に試す） ─────────
const pick = (o, keys) => { for (const k of keys) { const v = o?.[k]; if (v !== undefined && v !== null && v !== '') return v; } return undefined; };
const deepFind = (o, pred, depth = 0, acc = []) => { if (!o || depth > 6) return acc; if (Array.isArray(o)) { for (const x of o) deepFind(x, pred, depth + 1, acc); } else if (typeof o === 'object') { for (const [k, v] of Object.entries(o)) { if (pred(k, v)) acc.push(v); deepFind(v, pred, depth + 1, acc); } } return acc; };
const isImgUrl = (s) => typeof s === 'string' && /^https?:\/\/\S+\.(jpe?g|png|gif|webp)(\?\S*)?$/i.test(s);
function normalize(d) {
  const p = d.product ?? d;
  // 画像：Images / ImageList / ImgList / Pictures … の配列。要素は URL 文字列か {Url|ImageUrl|Src|url}
  let imgs = pick(p, ['Images', 'ImageList', 'ImgList', 'Pictures', 'PicList', 'ProductImages', 'images', 'imageList', 'imgs']);
  if (!Array.isArray(imgs)) { const found = deepFind(p, (k, v) => /image|img|pic/i.test(k) && Array.isArray(v) && v.length && (isImgUrl(v[0]) || typeof v[0] === 'object')); imgs = found[0] ?? []; }
  const urls = imgs.map((x) => (typeof x === 'string' ? x : pick(x, ['Url', 'ImageUrl', 'Src', 'url', 'imageUrl', 'src', 'Path', 'path', 'ImgUrl', 'imgUrl']))).filter(isImgUrl);
  // 説明：PC 用／スマホ用／販売説明文。HTML のまま使う
  const desc = pick(p, ['PcDescription', 'PCDescription', 'Description', 'SalesDescription', 'ProductDescription', 'DescriptionPc', 'pcDescription', 'description', 'Caption', 'ItemCaption']);
  const descSp = pick(p, ['SpDescription', 'SPDescription', 'SmartphoneDescription', 'DescriptionSp', 'spDescription', 'MobileDescription']);
  const title = pick(p, ['Title', 'ItemName', 'ProductName', 'Name', 'title', 'itemName', 'name']);
  const mn = pick(p, ['ManageNumber', 'ItemManageNumber', 'ManageNo', 'manageNumber', 'Spu', 'SPU']) ?? d.spu;
  const skus = pick(p, ['Skus', 'SkuList', 'SKUs', 'skus', 'skuList', 'Variants']) ?? [];
  const skuCodes = (Array.isArray(skus) ? skus : []).map((s) => pick(s, ['SkuNumber', 'SkuCode', 'Sku', 'VariantId', 'ManageNumber', 'skuNumber', 'sku', 'code'])).filter(Boolean);
  return { spu: d.spu, mn, title, urls, desc: typeof desc === 'string' ? desc : '', descSp: typeof descSp === 'string' ? descSp : '', skuCodes };
}
function loadDrafts() { if (!fs.existsSync(DRAFTS)) throw new Error('out/drafts がない。先に banma-export.browser.js で取得'); return fs.readdirSync(DRAFTS).filter((f) => f.endsWith('.json')).map((f) => { try { return normalize(J(path.join(DRAFTS, f))); } catch (e) { log('bad draft', f, e.message); return null; } }).filter(Boolean); }

// ───────── Shopify ─────────
let tok; async function token() { if (tok) return tok; const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }) }); if (!r.ok) throw new Error(`shopify token ${r.status}`); tok = (await r.json()).access_token; return tok; }
async function gql(query, variables = {}) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(`https://${SHOP}/admin/api/${VER}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': await token() }, body: JSON.stringify({ query, variables }) });
    if (r.status === 429 || r.status >= 500) { await sleep(2000 * (i + 1)); continue; }
    const j = await r.json(); if (j.errors) { if (/THROTTLED/.test(JSON.stringify(j.errors))) { await sleep(3000); continue; } throw new Error(JSON.stringify(j.errors).slice(0, 300)); } return j.data;
  }
  throw new Error('shopify: retries exhausted');
}
const P_FIELDS = `id handle title status descriptionHtml variants(first:100){ nodes{ id sku title } } media(first:50){ nodes{ id mediaContentType alt ... on MediaImage { image{ url } } } }`;
async function shopifyAll() { const all = []; let c = null; for (;;) { const d = await gql(`query($c:String){ products(first:50, after:$c, query:"vendor:ANET"){ pageInfo{hasNextPage endCursor} nodes{ ${P_FIELDS} } } }`, { c }); all.push(...d.products.nodes); if (!d.products.pageInfo.hasNextPage) break; c = d.products.pageInfo.endCursor; } log('shopify products', all.length); return all; }
async function product(id) { return (await gql(`query($id:ID!){ product(id:$id){ ${P_FIELDS} } }`, { id })).product; }

// ───────── probe ─────────
function probe() {
  const f = fs.readdirSync(DRAFTS).filter((x) => x.endsWith('.json'))[0]; if (!f) throw new Error('drafts が空');
  const d = J(path.join(DRAFTS, f)); const p = d.product ?? d;
  console.log('file', f); console.log('top keys', Object.keys(p).slice(0, 80).join(', '));
  const n = normalize(d); console.log('normalized →', { spu: n.spu, mn: n.mn, title: String(n.title).slice(0, 60), images: n.urls.length, firstImage: n.urls[0], descLen: n.desc.length, descSpLen: n.descSp.length, skuCodes: n.skuCodes.slice(0, 5) });
  if (!n.urls.length || !n.desc) console.log('!! 画像か説明が取れていない。top keys を見て normalize() の候補キーを足すこと');
}

// ───────── plan ─────────
function plan() {
  const drafts = loadDrafts(); const S = J(opt('shopify', path.join(OUT, 'shopify-products.json')));
  const bySku = new Map(); for (const d of drafts) { bySku.set(K(d.mn), d); for (const c of d.skuCodes) bySku.set(K(c), d); }
  const matched = [], unmatched = [], used = new Map();
  for (const p of S) {
    const votes = new Map();
    for (const v of p.variants.nodes) { const d = bySku.get(K(v.sku)); if (d) votes.set(d.spu, (votes.get(d.spu) ?? 0) + 1); }
    if (!votes.size) { const h = p.handle.toUpperCase(); const d = drafts.find((x) => x.mn && h.endsWith('-' + K(x.mn).toLowerCase().toUpperCase().replace(/[^A-Z0-9]+/g, '-'))); if (d) votes.set(d.spu, 1); }
    if (!votes.size) { unmatched.push({ handle: p.handle, title: p.title, skus: p.variants.nodes.map((v) => v.sku) }); continue; }
    const spu = [...votes].sort((a, b) => b[1] - a[1])[0][0]; const d = drafts.find((x) => x.spu === spu);
    used.set(spu, (used.get(spu) ?? 0) + 1);
    matched.push({ id: p.id, handle: p.handle, status: p.status, spu, images: d.urls.length, shopifyImages: p.media.nodes.length, descLen: d.desc.length, noImages: !d.urls.length, noDesc: !d.desc });
  }
  const dup = [...used].filter(([, n]) => n > 1).map(([spu, n]) => ({ spu, n, handles: matched.filter((m) => m.spu === spu).map((m) => m.handle) }));
  const draftsUnused = drafts.filter((d) => !used.has(d.spu)).map((d) => ({ spu: d.spu, title: String(d.title).slice(0, 60) }));
  W(path.join(OUT, 'draft-sync-plan.json'), { at: new Date().toISOString(), matched, unmatched, dup, draftsUnused });
  const t = (s, n = 70) => String(s ?? '').replace(/\|/g, '｜').slice(0, n);
  const md = [`# 草稿箱 → anetmc.com 同期計画（${new Date().toISOString().slice(0, 16)}Z）`, '',
    `| 項目 | 件数 |`, `|---|---|`, `| Shopify（vendor ANET） | ${S.length} |`, `| 草稿 | ${drafts.length} |`, `| 対応できた（画像＋説明を同期） | ${matched.length} |`, `| └ 草稿に画像なし | ${matched.filter((m) => m.noImages).length} |`, `| └ 草稿に説明なし | ${matched.filter((m) => m.noDesc).length} |`, `| Shopify 側 未対応（触らない） | ${unmatched.length} |`, `| 草稿 側 未使用 | ${draftsUnused.length} |`, `| 1 草稿が複数 Shopify 商品に対応（要確認） | ${dup.length} |`, '',
    '## 1 草稿 → 複数 Shopify 商品', '', '| SPU | 件数 | handle |', '|---|---|---|', ...dup.map((d) => `| ${d.spu} | ${d.n} | ${t(d.handles.join(', '), 120)} |`), '',
    '## Shopify 側 未対応（SKU/型番が草稿と一致しない）', '', '| handle | タイトル | SKU |', '|---|---|---|', ...unmatched.map((u) => `| ${t(u.handle, 50)} | ${t(u.title)} | ${t(u.skus.join(','), 50)} |`), '',
    '## 草稿 側 未使用', '', '| SPU | 商品名 |', '|---|---|', ...draftsUnused.map((d) => `| ${d.spu} | ${t(d.title)} |`), ''].join('\n');
  fs.writeFileSync(path.join(ROOT, 'docs/rakuten/draft-sync-plan.md'), md);
  log('matched', matched.length, 'unmatched', unmatched.length, 'dup', dup.length, 'draftsUnused', draftsUnused.length);
}

// ───────── apply ─────────
const toHtml = (s) => /<[a-z][\s\S]*>/i.test(s) ? s : s.split(/\r?\n{2,}/).map((p) => `<p>${p.replace(/\r?\n/g, '<br>')}</p>`).join('');
async function download(url, dst) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer())); return; } catch (e) { if (i === 2) throw e; await sleep(1500 * (i + 1)); } } }
async function waitReady(pid, ids) { for (let i = 0; i < 40; i++) { const p = await product(pid); const st = p.media.nodes.filter((m) => ids.includes(m.id)); if (st.length === ids.length && st.every((m) => m.image?.url)) return p; await sleep(3000); } throw new Error('media not READY in time'); }
async function applyOne(m, d) {
  const dir = path.join(BAK, m.handle); const bf = path.join(dir, 'backup.json');
  if (fs.existsSync(bf) && !opt('force')) { log('already synced (skip)', m.handle); return 'skip'; }
  const p = await product(m.id); fs.mkdirSync(dir, { recursive: true });
  // 1) バックアップ：旧画像をローカルへ、旧説明を JSON へ
  const old = p.media.nodes.filter((x) => x.mediaContentType === 'IMAGE' && x.image?.url);
  const locals = []; for (const [i, x] of old.entries()) { const f = path.join(dir, `${String(i + 1).padStart(2, '0')}.jpg`); if (!fs.existsSync(f)) await download(x.image.url, f); locals.push({ id: x.id, url: x.image.url, file: path.basename(f), alt: x.alt }); }
  W(bf, { id: p.id, handle: p.handle, title: p.title, descriptionHtml: p.descriptionHtml, media: locals, spu: d.spu, at: new Date().toISOString() });
  // 2) 草稿画像を登録（公開 URL を originalSource として渡す）
  const srcs = d.urls.slice(0, 50);
  const cm = await gql(`mutation($id:ID!,$m:[CreateMediaInput!]!){ productCreateMedia(productId:$id, media:$m){ media{ id } mediaUserErrors{ message } } }`, { id: p.id, m: srcs.map((u) => ({ originalSource: u, mediaContentType: 'IMAGE', alt: p.title })) });
  if (cm.productCreateMedia.mediaUserErrors.length) throw new Error(cm.productCreateMedia.mediaUserErrors[0].message);
  const ids = cm.productCreateMedia.media.map((x) => x.id);
  await waitReady(p.id, ids);
  // 3) 並べ替え → 旧画像削除
  await gql(`mutation($id:ID!,$m:[MoveInput!]!){ productReorderMedia(id:$id, moves:$m){ userErrors{ message } } }`, { id: p.id, m: ids.map((id, i) => ({ id, newPosition: String(i) })) });
  const stale = old.map((x) => x.id);
  if (stale.length) { const del = await gql(`mutation($id:ID!,$m:[ID!]!){ productDeleteMedia(productId:$id, mediaIds:$m){ deletedMediaIds mediaUserErrors{ message } } }`, { id: p.id, m: stale }); if (del.productDeleteMedia.mediaUserErrors.length) log('warn delete', m.handle, del.productDeleteMedia.mediaUserErrors[0].message); }
  // 4) 説明上書き（タイトルは触らない）
  if (d.desc) { const u = await gql(`mutation($i:ProductInput!){ productUpdate(input:$i){ userErrors{ message } } }`, { i: { id: p.id, descriptionHtml: toHtml(d.desc) } }); if (u.productUpdate.userErrors.length) throw new Error(u.productUpdate.userErrors[0].message); }
  record({ handle: m.handle, spu: d.spu, images: ids.length, oldImages: old.length, desc: !!d.desc });
  return 'ok';
}
async function apply() {
  const P = J(path.join(OUT, 'draft-sync-plan.json')); const drafts = new Map(loadDrafts().map((d) => [d.spu, d]));
  const only = opt('only') ? new Set(opt('only').split(',')) : null; const dupSpu = new Set(P.dup.map((d) => d.spu));
  let targets = P.matched.filter((m) => !m.noImages && !dupSpu.has(m.spu) && (!only || only.has(m.handle)));
  if (opt('limit')) targets = targets.slice(0, Number(opt('limit')));
  log('targets', targets.length, '(dup 除外', P.matched.filter((m) => dupSpu.has(m.spu)).length, ')');
  let ok = 0, fail = 0, streak = 0;
  for (const [i, m] of targets.entries()) {
    try { const r = await applyOne(m, drafts.get(m.spu)); if (r === 'ok') ok++; streak = 0; log(`${i + 1}/${targets.length}`, r, m.handle); }
    catch (e) { fail++; streak++; record({ handle: m.handle, spu: m.spu, error: e.message }); log('ERR', m.handle, e.message); if (streak >= 5 || (ok + fail >= 20 && fail / (ok + fail) > 0.02)) { log('停止：失敗率超過'); break; } }
    await sleep(1000);
  }
  log('done ok', ok, 'fail', fail);
}
async function rollbackOne(handle) {
  const dir = path.join(BAK, handle); const bf = path.join(dir, 'backup.json'); if (!fs.existsSync(bf)) { log('no backup', handle); return; }
  const b = J(bf); const p = await product(b.id);
  const st = await gql(`mutation($i:[StagedUploadInput!]!){ stagedUploadsCreate(input:$i){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ message } } }`, { i: b.media.map((x) => ({ filename: x.file, mimeType: 'image/jpeg', resource: 'IMAGE', httpMethod: 'POST', fileSize: String(fs.statSync(path.join(dir, x.file)).size) })) });
  if (st.stagedUploadsCreate.userErrors.length) throw new Error(st.stagedUploadsCreate.userErrors[0].message);
  const urls = [];
  for (const [i, t] of st.stagedUploadsCreate.stagedTargets.entries()) { const fd = new FormData(); for (const q of t.parameters) fd.append(q.name, q.value); fd.append('file', new Blob([fs.readFileSync(path.join(dir, b.media[i].file))], { type: 'image/jpeg' }), b.media[i].file); const r = await fetch(t.url, { method: 'POST', body: fd }); if (!r.ok) throw new Error(`upload ${r.status}`); urls.push(t.resourceUrl); }
  const cm = await gql(`mutation($id:ID!,$m:[CreateMediaInput!]!){ productCreateMedia(productId:$id, media:$m){ media{ id } mediaUserErrors{ message } } }`, { id: b.id, m: urls.map((u, i) => ({ originalSource: u, mediaContentType: 'IMAGE', alt: b.media[i].alt ?? b.title })) });
  if (cm.productCreateMedia.mediaUserErrors.length) throw new Error(cm.productCreateMedia.mediaUserErrors[0].message);
  const ids = cm.productCreateMedia.media.map((x) => x.id); await waitReady(b.id, ids);
  await gql(`mutation($id:ID!,$m:[MoveInput!]!){ productReorderMedia(id:$id, moves:$m){ userErrors{ message } } }`, { id: b.id, m: ids.map((id, i) => ({ id, newPosition: String(i) })) });
  const stale = p.media.nodes.map((x) => x.id).filter((id) => !ids.includes(id));
  if (stale.length) await gql(`mutation($id:ID!,$m:[ID!]!){ productDeleteMedia(productId:$id, mediaIds:$m){ deletedMediaIds mediaUserErrors{ message } } }`, { id: b.id, m: stale });
  await gql(`mutation($i:ProductInput!){ productUpdate(input:$i){ userErrors{ message } } }`, { i: { id: b.id, descriptionHtml: b.descriptionHtml } });
  fs.renameSync(bf, path.join(dir, 'backup.rolledback.json')); record({ handle, rollback: true }); log('rolled back', handle);
}
async function rollback() { const hs = opt('only') ? opt('only').split(',') : fs.readdirSync(BAK).filter((h) => fs.existsSync(path.join(BAK, h, 'backup.json'))); log('rollback', hs.length); for (const h of hs) { try { await rollbackOne(h); } catch (e) { log('ERR', h, e.message); } await sleep(1000); } }
function status() { const done = fs.existsSync(BAK) ? fs.readdirSync(BAK).filter((h) => fs.existsSync(path.join(BAK, h, 'backup.json'))).length : 0; const P = fs.existsSync(path.join(OUT, 'draft-sync-plan.json')) ? J(path.join(OUT, 'draft-sync-plan.json')) : null; console.log({ drafts: fs.existsSync(DRAFTS) ? fs.readdirSync(DRAFTS).length : 0, matched: P?.matched.length, synced: done, errors: fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter((l) => l.includes('"error"')).length : 0 }); }
async function fetchShopify() { W(path.join(OUT, 'shopify-products.json'), await shopifyAll()); }

const cmds = { probe, plan, apply, rollback, status, 'fetch-shopify': fetchShopify };
if (!cmds[cmd]) { console.log(Object.keys(cmds).join(' | ')); process.exit(1); }
await cmds[cmd]();
