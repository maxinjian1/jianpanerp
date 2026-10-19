#!/usr/bin/env node
/**
 * kjyf 日文站（view 0 = www.kuajingyifan.com/ja-JP・上架中）を正として Shopify（vendor=ANET）を「原地更新」同期する。画像は一切触らない。
 * 2026-10-19 ユーザー決定：在售/下架の基準は日文站（view 0）。B2B（view 2）は参考のみ（--view 2 で旧基準に切替可）。
 * Windows のリポジトリ直下で実行。.env の SHOPIFY_* / ERP_* を読む（値はログにもファイルにも出さない）。
 *
 *   node tools/kjyf-b2b/sync.mjs fetch [--view 2]      # A1 全量（search view0（既定）+ info view0=日本語）→ out/b2b-full.json（途中再開可）
 *   node tools/kjyf-b2b/sync.mjs backup                # A2 Shopify ANET 全商品 → out/shopify-backup-<時刻>.json（ロールバック用）
 *   node tools/kjyf-b2b/sync.mjs plan [--backup f]     # A3 突き合わせ → out/sync-plan.json + docs/kjyf-b2b-同步计划.md
 *   node tools/kjyf-b2b/sync.mjs apply [--only draft|update|create] [--limit N] [--stock]   # B 段：draft → update → create
 *     --stock：在庫数も同期（tracked=true + inventorySetQuantities）。Shopify アプリに read_inventory / write_inventory /
 *     read_locations スコープが必要（2026-10-19 時点で無いので既定は OFF）
 *     --content：タイトル・説明も B2B（view 0）で上書き。既定 OFF：現行 Shopify の説明は GLM 箇条書き付きの文章で、
 *     B2B の説明は大半が卸の画像だけ・タイトルはキーワード羅列（平均 39→86 文字）のため、ユーザー確認待ち
 *     --desc-only：説明（descriptionHtml）だけ上書き（2026-10-19 ユーザー決定「先使用，之后再换」、タイトルは現行維持）。
 *     B2B 説明に日本語（かな）本文が無い／空／VIP・防盗の文言を含む商品は現行のまま。--content と同時指定不可
 *   node tools/kjyf-b2b/sync.mjs rollback <backup.json> --desc-only   # 説明だけ戻す
 *   node tools/kjyf-b2b/sync.mjs rollback <backup.json>
 *
 * B2B API は匿名で呼ぶ（ログイン時と結果が同じことを 2026-10-19 調査で確認、docs/kjyf-b2b-调研.md）。間隔 1.1 秒。
 * 突き合わせ：Shopify variant.sku = B2B skus[].out_id。何度実行しても同じ結果になる（差分だけ書き込む）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'tools/kjyf-b2b/out'); fs.mkdirSync(OUT, { recursive: true });
const DOC = path.join(ROOT, 'docs/kjyf-b2b-同步计划.md');
const argv = process.argv.slice(2); const cmd = argv[0];
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const SHOP = env.SHOPIFY_STORE_DOMAIN, VER = env.SHOPIFY_API_VERSION || '2026-10';
const MARKUP = Number(env.KJYF_MARKUP || 1.15);
const VIEW = Number(opt('view', 0)); // 在售判定の基準ビュー：0=日文站（既定）, 2=B2B
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const W = (f, o) => fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n');

// 販売価格 = 卸価格 × 1.15 を ¥10 単位に切り上げ（api-core dropship.service.ts の retailPrice と同じ）
const retail = (w) => Math.ceil((w * MARKUP) / 10) * 10;
// fix-catalog.mjs と同じ「批発商テンプレート型番」除去規則（真の型番 DSHJ-S-2128-JP / R1004 等は残る）
const TEMPLATE_CODE = /(?:\s*[（(]?\s*(?<![A-Za-z0-9])(?:YB-05|[A-Z]{1,6}-\d{2}(?:-[A-Z]+)?|TEMU-\d{3,4}(?:-[A-Z])?|sg\d{3}(?:-[a-z])?|ny\d{3}|de\d{3}|zk\d{3}|sl\d{3})\s*[)）]?)+\s*$/;
const cleanTitle = (t) => String(t ?? '').replace(/\s+/g, ' ').trim().replace(TEMPLATE_CODE, '').replace(/\s+/g, ' ').trim();
// 新品の上架保留：W杯・日本代表などの IP、明らかな他社商標
const HOLD_RE = /W杯|ワールドカップ|世界杯|日本代表|FIFA|サッカー日本|オリンピック|五輪|ディズニー|Disney|サンリオ|Sanrio|キティ|Hello ?Kitty|ポケモン|Pokemon|ちいかわ|スヌーピー|ドラえもん|ミッキー|ジブリ|ナイキ|NIKE|アディダス|adidas|ルイ.?ヴィトン|LOUIS ?VUITTON|シャネル|CHANEL|グッチ|GUCCI|エルメス|HERMES|ロレックス|ダイソン|Dyson/i;

// ───────────── B2B（匿名） ─────────────
async function b2b(pathname, body, { nullOk = false } = {}) {
  for (let i = 0; ; i++) {
    try {
      const r = await fetch('https://beehole.kuajingyifan.com' + pathname, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json(); if (nullOk && j.code !== 0 && /data is null/.test(j.message)) return null; if (j.code !== 0) throw new Error(`${pathname} code=${j.code} ${j.message}`); return j.data;
    } catch (e) { if (i >= 3) throw e; await sleep(3000 * (i + 1)); }
    finally { await sleep(1100); }
  }
}

async function fetchB2B() {
  const file = path.join(OUT, 'b2b-full.json');
  const prev = fs.existsSync(file) ? J(file) : null;
  const list = []; let total = Infinity;
  for (let page = 1; list.length < total; page++) {
    const d = await b2b('/admin/product/2b/search', { viewId: VIEW, page, limit: 50, order_type: 'desc', on_shelves: 1 });
    total = d.total; list.push(...d.list); log('search page', page, list.length, '/', total);
    if (!d.list.length) break;
  }
  const info = prev?.info ?? {}; let n = 0;
  for (const g of list) {
    const key = String(g.good_id);
    if (info[key] && prev?.listById?.[key]?.update_sig === sig(g)) continue; // 前回取得済みで変化なし
    // view 0 = 日本語原文（view 2 は中国語機械翻訳）。view 0 に無い商品だけ view 2 を使い lang=view2 と記録
    let d = await b2b('/admin/good/2b/info', { good_id: g.good_id, view_id: 0 }, { nullOk: true }); let lang = 'view0';
    if (!d) { d = await b2b('/admin/good/2b/info', { good_id: g.good_id, view_id: 2 }, { nullOk: true }); lang = 'view2'; }
    if (!d) { d = { title: g.title || g.sub_title || '', desc: '', skus: g.skus, sku_props: g.sku_props }; lang = 'view2'; } // 詳細 API が null を返す商品は検索結果だけで扱う（タイトル等は変更しない）
    info[key] = { lang, title: d.title, desc: d.desc, cat: d.cats?.name ?? '', sku_props: d.sku_props, skus: (d.skus ?? []).map((s) => ({ sku_id: s.sku_id, out_id: s.out_id, props_ids: s.props_ids })), images: ['image_url', ...Array.from({ length: 9 }, (_, i) => `image_url_${i + 1}`)].map((k) => d[k]).filter(Boolean), on_shelves: d.on_shelves, update_time: d.update_time };
    if (++n % 50 === 0) { log('info', n); W(file, { fetchedAt: new Date().toISOString(), view: VIEW, total, list: list.map(slim), info, listById: Object.fromEntries(list.map((x) => [x.good_id, { update_sig: sig(x) }])) }); }
  }
  W(file, { fetchedAt: new Date().toISOString(), view: VIEW, total, list: list.map(slim), info, listById: Object.fromEntries(list.map((x) => [x.good_id, { update_sig: sig(x) }])) });
  log('b2b-full.json view', VIEW, list.length, 'goods, info fetched now', n);
}
const slim = (g) => ({ good_id: g.good_id, cat_id: g.cat_id, title_zh: g.title, skus: g.skus.map((s) => ({ sku_id: s.sku_id, out_id: s.out_id, price: s.price, stock_num: s.stock_num, props_ids: s.props_ids })) });
const sig = (g) => g.skus.map((s) => `${s.sku_id}:${s.out_id}:${s.props_ids}`).join('|');

// ───────────── Shopify ─────────────
let tokenCache;
async function token() { if (tokenCache) return tokenCache; const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }) }); if (!r.ok) throw new Error(`shopify token ${r.status}`); tokenCache = (await r.json()).access_token; return tokenCache; }
async function gql(query, variables = {}) {
  for (let i = 0; ; i++) {
    const r = await fetch(`https://${SHOP}/admin/api/${VER}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': await token() }, body: JSON.stringify({ query, variables }) });
    const j = await r.json().catch(() => ({ errors: [{ message: `http ${r.status}` }] }));
    const throttled = r.status === 429 || j.errors?.some((e) => e.extensions?.code === 'THROTTLED');
    if (throttled && i < 8) { await sleep(2000 * (i + 1)); continue; }
    if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 500));
    const avail = j.extensions?.cost?.throttleStatus?.currentlyAvailable; if (avail != null && avail < 200) await sleep(3000);
    return j.data;
  }
}
const PRODUCT_FIELDS = `id handle title status vendor productType descriptionHtml createdAt tags options{ name position values } variants(first:100){ nodes{ id sku title price compareAtPrice inventoryQuantity inventoryPolicy selectedOptions{ name value } inventoryItem{ id tracked } } }`;
async function shopifyAll() {
  const all = []; let c = null;
  for (;;) { const d = await gql(`query($c:String){ products(first:10, after:$c, query:"vendor:ANET"){ pageInfo{hasNextPage endCursor} nodes{ ${PRODUCT_FIELDS} } } }`, { c }); all.push(...d.products.nodes.filter((p) => p.vendor === 'ANET')); if (all.length % 200 < 10) log('shopify', all.length); if (!d.products.pageInfo.hasNextPage) break; c = d.products.pageInfo.endCursor; }
  return all;
}
async function backup() {
  const all = await shopifyAll();
  const f = path.join(OUT, `shopify-backup-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`);
  W(f, { takenAt: new Date().toISOString(), products: all });
  log('backup', all.length, 'products,', all.reduce((s, p) => s + p.variants.nodes.length, 0), 'variants →', f);
  return f;
}
const latestBackup = () => { const f = fs.readdirSync(OUT).filter((x) => x.startsWith('shopify-backup-')).sort().pop(); if (!f) throw new Error('backup がありません。先に backup を実行'); return path.join(OUT, f); };

// ───────────── 計画 ─────────────
// SKU 照合は大文字小文字・前後空白を無視（Shopify 側は大文字化されているものが多い）
const K = (x) => String(x ?? '').trim().toUpperCase().replace(/^0+(?=[A-Z])/, ''); // 卸側の誤記 0C-25-E = C-25-E
function plan() {
  const B = J(path.join(OUT, 'b2b-full.json')); const bf = opt('backup') ?? latestBackup(); const S = J(bf);
  const goods = new Map(B.list.map((g) => [g.good_id, g]));
  const outToGood = new Map(); for (const g of B.list) for (const s of g.skus) if (s.out_id) outToGood.set(K(s.out_id), g.good_id);
  const ipDraft = (p) => p.status === 'DRAFT' && HOLD_RE.test(p.title);
  const update = [], draft = [], usedGoods = new Set(), manual = [];
  for (const p of S.products) {
    const vs = p.variants.nodes; const votes = new Map();
    for (const v of vs) { const g = outToGood.get(K(v.sku)); if (g) votes.set(g, (votes.get(g) ?? 0) + 1); }
    if (!votes.size) { if (p.status !== 'DRAFT' && p.status !== 'ARCHIVED') draft.push({ id: p.id, handle: p.handle, title: p.title, status: p.status, skus: vs.map((v) => v.sku) }); continue; }
    const gid = [...votes].sort((a, b) => b[1] - a[1])[0][0]; const g = goods.get(gid); const info = B.info[gid] ?? {}; usedGoods.add(gid);
    const bySku = new Map(g.skus.map((s) => [K(s.out_id), s]));
    const priceChanges = [], stock = [], del = [];
    for (const v of vs) {
      const s = bySku.get(K(v.sku));
      if (!s) { del.push({ id: v.id, sku: v.sku, title: v.title }); continue; }
      const np = retail(s.price); if (Number(v.price) !== np) priceChanges.push({ id: v.id, sku: v.sku, from: Number(v.price), to: np, wholesale: s.price });
      stock.push({ id: v.id, sku: v.sku, inventoryItemId: v.inventoryItem?.id, tracked: v.inventoryItem?.tracked, from: v.inventoryQuantity, to: Math.max(0, s.stock_num | 0) });
    }
    if (del.length === vs.length) del.length = 0; // 全消しはしない（念のため）
    // 追加 SKU：既存オプション名の順に B2B（日本語）の規格値を当てはめる。数が合わなければ手作業リストへ
    const have = new Set(vs.map((v) => K(v.sku))); const add = [];
    const props = new Map((info.sku_props ?? []).map((sp) => [String(sp.prop_id), { name: sp.prop_name, values: new Map((sp.values ?? []).map((x) => [String(x.value_id), x.prop_value])) }]));
    for (const s of g.skus) {
      if (!s.out_id || have.has(K(s.out_id))) continue;
      const vals = String(s.props_ids ?? '').split(/[;,]/).filter(Boolean).map((pair) => { const [pid, vid] = pair.split(':'); return props.get(pid)?.values.get(vid) ?? ''; }).filter(Boolean);
      const names = p.options.map((o) => o.name);
      if (names.length === 1 && names[0] === 'Title') { manual.push({ id: p.id, handle: p.handle, reason: '単品商品に SKU 追加が必要', sku: s.out_id }); continue; }
      if (vals.length !== names.length) { manual.push({ id: p.id, handle: p.handle, reason: `オプション数不一致 shopify=${names.length} b2b=${vals.length}`, sku: s.out_id }); continue; }
      add.push({ sku: s.out_id, price: retail(s.price), stock: Math.max(0, s.stock_num | 0), optionValues: names.map((n, i) => ({ optionName: n, name: vals[i] })) });
    }
    const ja = info.lang !== 'view2'; // 日本語原文が無い商品はタイトル・説明を変えない（中国語で上書きしない）
    const newTitle = (ja && cleanTitle(info.title)) || p.title; const newDesc = ja ? info.desc ?? '' : '';
    update.push({ id: p.id, handle: p.handle, status: p.status, ipDraft: ipDraft(p), good_id: gid, title: newTitle !== p.title ? { from: p.title, to: newTitle } : null, descChanged: !!newDesc && newDesc !== p.descriptionHtml, desc: newDesc && newDesc !== p.descriptionHtml ? newDesc : null, priceChanges, stock, del, add });
  }
  const create = [], hold = [], duplicate = [];
  const shopSkus = new Set(S.products.flatMap((p) => p.variants.nodes.map((v) => K(v.sku))).filter(Boolean));
  for (const g of B.list) {
    if (usedGoods.has(g.good_id)) continue; const info = B.info[g.good_id] ?? {};
    const row = { good_id: g.good_id, title: cleanTitle(info.title) || g.title_zh, cat: info.cat, skus: g.skus.length, minPrice: Math.min(...g.skus.map((s) => s.price)) };
    // B2B 側の重複出品（別 good_id が同じ out_id を持つ）：SKU が既に Shopify にあるなら新規作成しない
    if (g.skus.some((x) => shopSkus.has(K(x.out_id)))) { duplicate.push({ ...row, sameSkuAs: [...new Set(g.skus.map((x) => outToGood.get(K(x.out_id))).filter((x) => x && x !== g.good_id))] }); continue; }
    if (!g.skus.length) { hold.push({ ...row, reason: 'SKU なし' }); continue; }
    if (!/[぀-ヿ一-鿿]/.test(row.title)) { hold.push({ ...row, reason: '日本語タイトルなし' }); continue; }
    if (info.lang === 'view2') { manual.push({ id: '', handle: `good ${g.good_id}`, reason: '新品だが日本語（view 0）データが無い → 既存上架フローで作れない', sku: g.skus.map((x) => x.out_id).join(',') }); continue; }
    (HOLD_RE.test(`${info.title} ${g.title_zh}`) ? hold : create).push({ ...row, ...(HOLD_RE.test(`${info.title} ${g.title_zh}`) ? { reason: 'IP・他社商標の疑い' } : {}) });
  }
  const sum = {
    backup: path.relative(ROOT, bf), b2bGoods: B.list.length, shopifyProducts: S.products.length,
    update: update.length, updateDraftKept: update.filter((u) => u.status !== 'ACTIVE').length, draft: draft.length, create: create.length, hold: hold.length, b2bDuplicate: duplicate.length,
    variantsAdd: update.reduce((s, u) => s + u.add.length, 0), variantsDelete: update.reduce((s, u) => s + u.del.length, 0), manual: manual.length,
    productsPriceChanged: update.filter((u) => u.priceChanges.length).length, variantsPriceChanged: update.reduce((s, u) => s + u.priceChanges.length, 0),
    titleChanged: update.filter((u) => u.title).length, descChanged: update.filter((u) => u.descChanged).length,
    stockUntrackedNow: update.reduce((s, u) => s + u.stock.filter((x) => !x.tracked).length, 0), stockZero: update.reduce((s, u) => s + u.stock.filter((x) => x.to === 0).length, 0),
  };
  W(path.join(OUT, 'sync-plan.json'), { createdAt: new Date().toISOString(), summary: sum, update, draft, create, hold, duplicate, manual });
  writeDoc(sum, update, draft, create, hold, manual, duplicate, B);
  console.log(JSON.stringify(sum, null, 1));
}
function writeDoc(sum, update, draft, create, hold, manual, duplicate, B) {
  const t = (s, n = 50) => String(s ?? '').replace(/\|/g, '／').replace(/\s+/g, ' ').slice(0, n);
  const L = [];
  L.push('# kjyf B2B → Shopify 同期計画', '', `生成：${new Date().toISOString()}（\`node tools/kjyf-b2b/sync.mjs plan\`）。基準＝view ${B.view ?? 2}（0=日文站, 2=B2B）・上架中。タイトル・説明は同じ good_id の view 0（日本語原文）。画像は変更しない。`, '');
  L.push('## 集計', '', '| 項目 | 件数 |', '|---|---|', ...Object.entries(sum).map(([k, v]) => `| ${k} | ${v} |`), '');
  L.push('- update は status を変えない（現在 DRAFT のもの、W杯等 IP で DRAFT にした 6 件を含めて、DRAFT のまま）。', '- 在庫：現在 Shopify は在庫を追跡していない（tracked=false）。アプリに在庫スコープが無いため在庫同期は既定 OFF（`--stock` で有効）。stockZero は B2B 在庫 0 の SKU 数（参考）。', '');
  const sec = (h, rows, head, f) => { L.push(`## ${h}（${rows.length} 件、先頭 50）`, '', head, head.replace(/[^|]+/g, '---'), ...rows.slice(0, 50).map(f), ''); };
  sec('draft（基準ビューに無い → DRAFT）', draft, '| handle | 現在 | タイトル | SKU |', (r) => `| ${t(r.handle, 40)} | ${r.status} | ${t(r.title)} | ${t(r.skus.join(','), 40)} |`);
  sec('create（基準ビューにあり Shopify に無い）', create, '| good_id | 分類 | タイトル | SKU 数 | 最低卸価格 |', (r) => `| ${r.good_id} | ${t(r.cat, 16)} | ${t(r.title)} | ${r.skus} | ${r.minPrice} |`);
  sec('hold（上架しない）', hold, '| good_id | 理由 | タイトル |', (r) => `| ${r.good_id} | ${r.reason} | ${t(r.title, 70)} |`);
  sec('B2B 側の重複出品（SKU が既に Shopify にある → 作成しない）', duplicate, '| good_id | 同じ SKU の good_id | タイトル |', (r) => `| ${r.good_id} | ${r.sameSkuAs.join(',')} | ${t(r.title, 60)} |`);
  sec('価格変更', update.filter((u) => u.priceChanges.length), '| handle | SKU: 旧→新（卸） |', (u) => `| ${t(u.handle, 40)} | ${t(u.priceChanges.map((c) => `${c.sku}: ${c.from}→${c.to}（${c.wholesale}）`).join('; '), 160)} |`);
  sec('variant 追加', update.filter((u) => u.add.length), '| handle | 追加 SKU |', (u) => `| ${t(u.handle, 40)} | ${t(u.add.map((a) => `${a.sku}(${a.optionValues.map((o) => o.name).join('/')})`).join(', '), 120)} |`);
  sec('variant 削除', update.filter((u) => u.del.length), '| handle | 削除 SKU |', (u) => `| ${t(u.handle, 40)} | ${t(u.del.map((d) => d.sku).join(', '), 120)} |`);
  sec('タイトル変更', update.filter((u) => u.title), '| 旧 | 新 |', (u) => `| ${t(u.title.from, 60)} | ${t(u.title.to, 60)} |`);
  sec('手作業（自動で SKU を追加できない）', manual, '| handle | 理由 | SKU |', (r) => `| ${t(r.handle, 40)} | ${r.reason} | ${r.sku} |`);
  fs.writeFileSync(DOC, L.join('\n') + '\n');
}

// ───────────── 実行 ─────────────
// 説明に使えるか：タグを除いた本文にかなを含み、VIP・防盗（卸の盗用防止画像の注記）を含まない
const descText = (h) => String(h ?? '').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;|&#d+;/g, ' ');
const descUsable = (h) => /[぀-ヿ]/.test(descText(h)) && !/VIP|防盗|防盜/i.test(h);
const LOG = path.join(OUT, 'sync-log.jsonl');
const record = (o) => fs.appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
class Guard { constructor(name, total) { Object.assign(this, { name, total, ok: 0, fail: 0, errors: [] }); }
  done(okFlag, err, id) { okFlag ? this.ok++ : (this.fail++, this.errors.push({ id, err: String(err).slice(0, 300) })); const n = this.ok + this.fail; if (n % 50 === 0) { record({ phase: this.name, progress: n, total: this.total, ok: this.ok, fail: this.fail }); log(this.name, n, '/', this.total, 'fail', this.fail); }
    if (n >= 20 && this.fail / n > 0.02) { record({ phase: this.name, stopped: true, ok: this.ok, fail: this.fail, sample: this.errors.slice(0, 5) }); throw new Error(`${this.name}: userErrors ${this.fail}/${n} > 2% → 停止。例: ${JSON.stringify(this.errors.slice(0, 3))}`); } }
  end() { record({ phase: this.name, finished: true, total: this.total, ok: this.ok, fail: this.fail, sample: this.errors.slice(0, 5) }); log(this.name, 'done ok', this.ok, 'fail', this.fail); return this; } }
const ue = (x) => (x?.userErrors ?? []).map((e) => e.message).join('; ');

async function locationId() { const l = (await gql(`{ locations(first:10){ nodes{ id isActive } } }`)).locations.nodes.filter((x) => x.isActive); if (l.length !== 1) throw new Error(`有効ロケーションが ${l.length} 件。在庫同期先を決められない`); return l[0].id; }
async function setStock(locId, items) { // items: [{inventoryItemId, quantity, tracked}]
  for (const it of items.filter((x) => !x.tracked)) { const d = await gql(`mutation($id:ID!){ inventoryItemUpdate(id:$id, input:{tracked:true}){ userErrors{message} } }`, { id: it.inventoryItemId }); const e = ue(d.inventoryItemUpdate); if (e) return e; }
  for (let i = 0; i < items.length; i += 100) {
    const d = await gql(`mutation($in:InventorySetQuantitiesInput!){ inventorySetQuantities(input:$in){ userErrors{message} } }`, { in: { name: 'available', reason: 'correction', ignoreCompareQuantity: true, quantities: items.slice(i, i + 100).map((x) => ({ inventoryItemId: x.inventoryItemId, locationId: locId, quantity: x.quantity })) } });
    const e = ue(d.inventorySetQuantities); if (e) return e;
  }
  return '';
}

async function apply() {
  const P = J(path.join(OUT, 'sync-plan.json')); const only = opt('only'); const limit = Number(opt('limit', Infinity));
  const S = J(path.join(ROOT, P.summary.backup)); const anet = new Set(S.products.map((p) => p.id)); // ANET 以外は絶対に触らない
  record({ start: true, only: only ?? 'all', backup: P.summary.backup });
  if (!only || only === 'draft') {
    const g = new Guard('draft', Math.min(P.draft.length, limit));
    for (const r of P.draft.slice(0, limit)) { if (!anet.has(r.id)) continue; const d = await gql(`mutation($i:ProductInput!){ productUpdate(input:$i){ userErrors{message} } }`, { i: { id: r.id, status: 'DRAFT' } }); const e = ue(d.productUpdate); g.done(!e, e, r.id); await sleep(300); }
    g.end();
  }
  if (!only || only === 'update') {
    const STOCK = argv.includes('--stock'), CONTENT = argv.includes('--content'), DESC_ONLY = argv.includes('--desc-only');
    if (CONTENT && DESC_ONLY) throw new Error('--content と --desc-only は同時に使えない'); const locId = STOCK ? await locationId() : null; const todo = P.update.slice(0, limit); const g = new Guard('update', todo.length);
    for (const u of todo) {
      if (!anet.has(u.id)) continue; let err = '';
      try {
        if (DESC_ONLY && u.desc && descUsable(u.desc)) { const d = await gql(`mutation($i:ProductInput!){ productUpdate(input:$i){ userErrors{message} } }`, { i: { id: u.id, descriptionHtml: u.desc } }); err ||= ue(d.productUpdate); }
        if (CONTENT && (u.title || u.desc)) { const d = await gql(`mutation($i:ProductInput!){ productUpdate(input:$i){ userErrors{message} } }`, { i: { id: u.id, ...(u.title ? { title: u.title.to } : {}), ...(u.desc ? { descriptionHtml: u.desc } : {}) } }); err ||= ue(d.productUpdate); }
        if (!err && u.priceChanges.length) { const d = await gql(`mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$p, variants:$v){ userErrors{message} } }`, { p: u.id, v: u.priceChanges.map((c) => ({ id: c.id, price: String(c.to) })) }); err ||= ue(d.productVariantsBulkUpdate); }
        if (!err && u.del.length) { const d = await gql(`mutation($p:ID!,$v:[ID!]!){ productVariantsBulkDelete(productId:$p, variantsIds:$v){ userErrors{message} } }`, { p: u.id, v: u.del.map((x) => x.id) }); err ||= ue(d.productVariantsBulkDelete); }
        const stockItems = u.stock.filter((s) => s.inventoryItemId && (s.from !== s.to || !s.tracked)).map((s) => ({ inventoryItemId: s.inventoryItemId, quantity: s.to, tracked: s.tracked }));
        if (!err && u.add.length) {
          const d = await gql(`mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkCreate(productId:$p, variants:$v){ productVariants{ id sku inventoryItem{ id } } userErrors{message} } }`, { p: u.id, v: u.add.map((a) => ({ price: String(a.price), optionValues: a.optionValues, inventoryItem: { sku: a.sku, tracked: STOCK } })) });
          err ||= ue(d.productVariantsBulkCreate);
          for (const nv of d.productVariantsBulkCreate?.productVariants ?? []) stockItems.push({ inventoryItemId: nv.inventoryItem.id, quantity: u.add.find((a) => a.sku === nv.sku)?.stock ?? 0, tracked: true });
        }
        if (STOCK && !err && stockItems.length) err ||= await setStock(locId, stockItems);
      } catch (e) { err = e.message; }
      g.done(!err, err, u.handle); await sleep(250);
    }
    g.end();
  }
  if (!only || only === 'create') await createViaErp(P.create.slice(0, limit));
}

// 新規作成は既存の上架フロー（kjyf-scraper → api-core /dropship/import → publish-loop）を使う。
// 作成後に plan → apply --only update をもう一度回すと、在庫追跡・在庫数・分類以外の差分が揃う。
async function createViaErp(rows) {
  if (!rows.length) { log('create: 0'); return; }
  const ids = rows.map((r) => r.good_id).join(',');
  record({ phase: 'create', start: true, count: rows.length });
  const run = (file, a) => execFileSync(process.execPath, [path.join(ROOT, file), ...a], { cwd: ROOT, stdio: 'inherit', timeout: 0 });
  run('tools/kjyf-scraper/scrape.mjs', ['--ids', ids, '--post', '--concurrency', '1', '--delay', '1100']);
  run('tools/dropship/publish-loop.mjs', ['--limit', '50', '--status', 'ACTIVE']);
  record({ phase: 'create', finished: true, requested: rows.length });
}

// ───────────── ロールバック ─────────────
async function rollback(file) {
  const S = J(file); const now = await shopifyAll(); const cur = new Map(now.map((p) => [p.id, p]));
  if (argv.includes('--desc-only')) { let n = 0, fail = 0; for (const p of S.products) { const c = cur.get(p.id); if (!c || c.descriptionHtml === p.descriptionHtml) continue; const d = await gql(`mutation($i:ProductInput!){ productUpdate(input:$i){ userErrors{message} } }`, { i: { id: p.id, descriptionHtml: p.descriptionHtml } }); ue(d.productUpdate) ? fail++ : n++; await sleep(250); } log('rollback desc ok', n, 'fail', fail); return; }
  let n = 0, fail = 0;
  for (const p of S.products) {
    const c = cur.get(p.id); if (!c) { log('消えた商品（再作成はしない）', p.handle); fail++; continue; }
    const errs = [];
    let d = await gql(`mutation($i:ProductInput!){ productUpdate(input:$i){ userErrors{message} } }`, { i: { id: p.id, title: p.title, descriptionHtml: p.descriptionHtml, status: p.status, productType: p.productType } }); errs.push(ue(d.productUpdate));
    const oldIds = new Set(p.variants.nodes.map((v) => v.id)); const curById = new Map(c.variants.nodes.map((v) => [v.id, v]));
    const added = c.variants.nodes.filter((v) => !oldIds.has(v.id)).map((v) => v.id);
    const removed = p.variants.nodes.filter((v) => !curById.has(v.id));
    if (removed.length) { d = await gql(`mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkCreate(productId:$p, variants:$v){ userErrors{message} } }`, { p: p.id, v: removed.map((v) => ({ price: v.price, compareAtPrice: v.compareAtPrice, optionValues: v.selectedOptions.map((o) => ({ optionName: o.name, name: o.value })), inventoryItem: { sku: v.sku, tracked: !!v.inventoryItem?.tracked } })) }); errs.push(ue(d.productVariantsBulkCreate)); }
    if (added.length) { d = await gql(`mutation($p:ID!,$v:[ID!]!){ productVariantsBulkDelete(productId:$p, variantsIds:$v){ userErrors{message} } }`, { p: p.id, v: added }); errs.push(ue(d.productVariantsBulkDelete)); }
    const keep = p.variants.nodes.filter((v) => curById.has(v.id));
    const pc = keep.filter((v) => curById.get(v.id).price !== v.price);
    if (pc.length) { d = await gql(`mutation($p:ID!,$v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$p, variants:$v){ userErrors{message} } }`, { p: p.id, v: pc.map((v) => ({ id: v.id, price: v.price })) }); errs.push(ue(d.productVariantsBulkUpdate)); }
    for (const v of keep.filter((v) => curById.get(v.id).inventoryItem?.tracked !== v.inventoryItem?.tracked)) {
      if (v.inventoryItem?.tracked) continue; // 元が tracked なら数量を戻す（下）
      d = await gql(`mutation($id:ID!){ inventoryItemUpdate(id:$id, input:{tracked:false}){ userErrors{message} } }`, { id: v.inventoryItem.id }); errs.push(ue(d.inventoryItemUpdate));
    }
    const qs = keep.filter((v) => v.inventoryItem?.tracked && curById.get(v.id).inventoryQuantity !== v.inventoryQuantity).map((v) => ({ inventoryItemId: v.inventoryItem.id, quantity: v.inventoryQuantity, tracked: true }));
    if (qs.length) errs.push(await setStock(await locationId(), qs));
    const e = errs.filter(Boolean).join('; '); e ? (fail++, log('rollback fail', p.handle, e)) : n++;
    if ((n + fail) % 50 === 0) log('rollback', n + fail, '/', S.products.length); await sleep(250);
  }
  // バックアップ後に新規作成された ANET 商品は削除せず DRAFT にする
  const created = now.filter((p) => !S.products.some((x) => x.id === p.id) && p.createdAt > S.takenAt && p.status === 'ACTIVE');
  for (const p of created) { const d = await gql(`mutation($i:ProductInput!){ productUpdate(input:$i){ userErrors{message} } }`, { i: { id: p.id, status: 'DRAFT' } }); ue(d.productUpdate) ? fail++ : n++; await sleep(250); }
  log('rollback done ok', n, 'fail', fail, 'new→DRAFT', created.length);
}

const cmds = { fetch: fetchB2B, backup, plan, apply, rollback: () => rollback(argv[1]) };
if (!cmds[cmd]) { console.error('usage: sync.mjs fetch|backup|plan|apply|rollback <backup.json>'); process.exit(2); }
await cmds[cmd]();
