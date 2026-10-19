#!/usr/bin/env node
/**
 * Amazon 上架前の画像づくり（SOP：.claude/skills/amazon-visual-sop/SKILL.md）第一版。生成 AI は使わない。
 *   node tools/amazon-visual/visual.mjs pick                  # 試点 5 件を選ぶ → out/pilot.json（--handles a,b,… で指定も可）＋原図 DL
 *   node tools/amazon-visual/visual.mjs compete               # キーワード → Amazon 検索上位＋バッグ類ランキング → 竞品 5〜8 件（CDP ブラウザ、2〜5 秒間隔）
 *   node tools/amazon-visual/visual.mjs teardown              # 竞品画像を DL → 6kpro 視覚で 1 枚ずつ分類 → 「みんな同じ / 誰も見せていない」→ gaps
 *   node tools/amazon-visual/visual.mjs reviews               # 竞品レビュー（★1-3 / ★4-5）→ 顧慮・需求を集計 → 自社の事実（facts）で答えられるものだけ plan へ
 *   node tools/amazon-visual/visual.mjs render                # A/B 各 7 枚（主图＝原図 rembg 切り抜き＋純白、副图＝原図＋コード描画の日本語）→ preview.jpg
 *   node tools/amazon-visual/visual.mjs review [--dry]        # Shopify に【Amazon審査】DRAFT を作る（どのチャネルにも公開しない。原商品は触らない）
 *   node tools/amazon-visual/visual.mjs watch                 # amazon-approved-a/-b の審査商品 → 在庫ファイル（TSV）を作る（dry-run。Amazon へのアップロードはしない）
 *   node tools/amazon-visual/visual.mjs watch --mark-listed --handles a,b   # Seller Central で処理成功を確認した後だけ：タグを amazon-listed に替える
 *   node tools/amazon-visual/visual.mjs all                   # pick〜render
 * 共通：--handle <h>（1 件だけ）/ --force（作り直し）/ --cdp http://127.0.0.1:9224（公開ページのみ、ログインしない）
 * 再実行可：各段は out/<handle>/ のファイルがあれば飛ばす。出力 out/ は git に入れない（preview は docs/amazon-visual/ にコピー）。
 * 鉄則：画像内の数字は facts（日文站の説明・SKU・原図内の表記）にあるものだけ。最強/No.1/絶対/日本一/医療効果/他社ブランドは使わない。
 * Amazon で CAPTCHA・ログイン画面が出たらその段を止める（突破しない）。
 * 再利用：Amazon ページ読み取り = amazon-research/research.mjs、切り抜き/縮小 = product-images/imgtool.py（pipeline cutout と同じ rembg）、
 *        配色 = brand-assets/product-cards.mjs の B、価格・カテゴリ・在庫ファイル = amazon-listing/build-inventory-file.mjs。
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CATS, listUrls, readList, readDetail, readSearch, blocked, jitter, sleep } from '../amazon-research/research.mjs';
import { amazonPrice, categorize } from '../amazon-listing/build-inventory-file.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const DOCS = path.join(ROOT, 'docs/amazon-visual');
const stage = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const SHOP = env.SHOPIFY_STORE_DOMAIN, VER = env.SHOPIFY_API_VERSION || '2026-10';
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash', VISION = env.CN_LLM_VISION_MODEL || MODEL;
const PY = env.IMAGE_PY || (process.platform === 'win32' ? path.join(ROOT, 'apps/image-service/venv/Scripts/python.exe') : 'python3');
const CDP = args.cdp ?? 'http://127.0.0.1:9224';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const W = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n'); };
const K = (x) => String(x ?? '').trim().toUpperCase().replace(/^0+(?=[A-Z])/, '');
const pad = (n) => String(n).padStart(2, '0');
const text = (h) => String(h ?? '').replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<\/(p|li|h\d|div|tr)>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&times;/g, '×').replace(/&hellip;/g, '…').replace(/&amp;/g, '&').replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/&lt;br\s*\/?&gt;/g, '<br>');
const yen = (s) => Number(String(s ?? '').replace(/[^0-9]/g, '')) || null;
const starOf = (s) => Number((String(s).match(/(?:うち|中)\s*([0-9.]+)/) || String(s).match(/([0-9.]+)/) || [])[1]) || null; // 「5つ星のうち4.0」「星5つ中4つ」
// 他社ブランド・IP（kjyf-b2b/compare-ja.mjs と同じ）
const HOLD_RE = /W杯|ワールドカップ|世界杯|日本代表|FIFA|サッカー日本|オリンピック|五輪|ディズニー|Disney|サンリオ|Sanrio|キティ|Hello ?Kitty|ポケモン|Pokemon|ちいかわ|スヌーピー|ドラえもん|ミッキー|ジブリ|ナイキ|NIKE|アディダス|adidas|ルイ.?ヴィトン|LOUIS ?VUITTON|シャネル|CHANEL|グッチ|GUCCI|エルメス|HERMES|ロレックス|ダイソン|Dyson|iPhone|Apple|Galaxy|Switch|任天堂|ニンテンドー|PlayStation|SONY|ソニー|パナソニック|Panasonic|シャープ|SHARP|無印|ユニクロ|UNIQLO|ANKER|アンカー/i;
// 画像に入れない語（SOP 鉄則 4。送料無料は Amazon の画像に書かない）
const NG_RE = /最強|No\.?\s*1|ナンバーワン|絶対|日本一|世界一|業界初|最安|激安|完璧|永久|治る|痩せ|医療|送料無料|保証付き/i;

// ---------- Shopify ----------
let tk;
async function gql(query, variables = {}) {
  tk ??= (await (await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }) })).json()).access_token;
  for (let i = 0; ; i++) {
    const r = await fetch(`https://${SHOP}/admin/api/${VER}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': tk }, body: JSON.stringify({ query, variables }) });
    const j = await r.json().catch(() => ({ errors: [{ message: `http ${r.status}` }] }));
    if ((r.status === 429 || j.errors?.some((e) => e.extensions?.code === 'THROTTLED')) && i < 8) { await sleep(2000 * (i + 1)); continue; }
    if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 400));
    return j.data;
  }
}
const ue = (x) => (x?.userErrors ?? []).map((e) => e.message).join('; ');
const adminUrl = (gid) => `https://admin.shopify.com/store/${SHOP.replace(/\.myshopify\.com$/, '')}/products/${String(gid).split('/').pop()}`;

// ---------- 6kpro ----------
async function chatJson(messages, { maxTokens = 6000, model = MODEL, retries = 3 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model, temperature: 0.2, max_tokens: maxTokens, response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false, thinking: false }, messages }) });
      const j = await r.json(); const c = j.choices?.[0]?.message?.content; if (!c) throw new Error(`empty: ${JSON.stringify(j).slice(0, 200)}`);
      const m = c.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : c);
    } catch (e) { if (i === retries - 1) throw e; await sleep(2000 * (i + 1)); }
  }
}
const b64 = (p) => `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;
function py(cmd, jobs) { if (!jobs.length) return; const f = path.join(OUT, `_jobs-${cmd}-${process.pid}.json`); fs.writeFileSync(f, JSON.stringify(jobs)); const r = spawnSync(PY, [path.join(ROOT, 'tools/product-images/imgtool.py'), cmd, f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 }); fs.unlinkSync(f); if (r.status !== 0) throw new Error(`imgtool ${cmd} failed`); }
async function download(url, file) { if (fs.existsSync(file)) return file; const r = await fetch(url); if (!r.ok) throw new Error(`img ${r.status} ${url.slice(0, 80)}`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return file; }

// ---------- 対象 ----------
const PILOT = path.join(OUT, 'pilot.json');
const pdir = (p, ...sub) => { const d = path.join(OUT, p.handle, ...sub); fs.mkdirSync(d, { recursive: true }); return d; };
const briefF = (p) => path.join(OUT, p.handle, 'brief.json');
const brief = (p) => (fs.existsSync(briefF(p)) ? J(briefF(p)) : { handle: p.handle, title: p.title });
const saveBrief = (p, b) => W(briefF(p), b);
function pilot() { if (!fs.existsSync(PILOT)) throw new Error('out/pilot.json が無い：先に pick'); let ps = J(PILOT).items; if (args.handle) ps = ps.filter((p) => p.handle === args.handle); return ps; }
async function each(fn) { const ps = pilot(); let ok = 0; const errs = []; for (const p of ps) { try { await fn(p); ok++; } catch (e) { log('ERR', p.handle.slice(0, 30), e.message); errs.push(p.handle); if (/BLOCKED/.test(e.message)) break; } } log(`${stage}: ok ${ok} / ${ps.length}`); if (errs.length) process.exitCode = 1; }

// ---------- ブラウザ（既存の CDP Chrome に新しいタブを 1 つ。ウィンドウは閉じない）----------
let BR;
async function tab() { if (BR) return BR; const { chromium } = await import('playwright'); const b = await chromium.connectOverCDP(CDP); const page = await b.contexts()[0].newPage(); BR = { b, page }; return BR; }
async function visit(url) {
  const { page } = await tab(); await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await jitter();
  if (blocked(page) || /captcha|ロボット/i.test(await page.title().catch(() => ''))) { await page.screenshot({ path: path.join(OUT, `blocked-${Date.now()}.png`) }).catch(() => {}); throw new Error(`BLOCKED ${page.url().slice(0, 80)}（CAPTCHA/ログイン画面。突破しないで停止）`); }
  return page;
}

// ================= 1. pick =================
const BAG = /ショルダー|トート|ポシェット|斜め掛け|ハンドバッグ|サコッシュ|ボディバッグ/;
const NOT_FASHION = /リュック|ポーチ|トラベル|ボストン|シューズ|財布|ランチ|コスメ|保冷|キッズ|ベビー|スーツケース|プリズム|収納/;
async function pick() {
  if (fs.existsSync(PILOT) && !args.force) { log('pilot.json あり（--force で選び直し）'); return downloadOwn(); }
  const ja = J(path.join(ROOT, 'tools/kjyf-b2b/out/ja-full.json')); const onSku = new Map(); for (const g of ja.on) for (const s of g.skus) onSku.set(K(s.out_id), g);
  const all = []; let c = null;
  for (;;) { const d = await gql(`query($c:String){ products(first:50, after:$c, query:"vendor:ANET status:active"){ pageInfo{hasNextPage endCursor} nodes{ id handle title productType description tags options{ name values } variants(first:50){ nodes{ id title sku price compareAtPrice selectedOptions{ name value } } } media(first:20){ nodes{ ... on MediaImage{ image{ url width height } } } } } } }`, { c }); all.push(...d.products.nodes); if (!d.products.pageInfo.hasNextPage) break; c = d.products.pageInfo.endCursor; }
  const want = args.handles ? new Set(String(args.handles).split(',')) : null;
  const cands = [];
  for (const p of all) {
    const imgs = p.media.nodes.filter((m) => m.image?.url).map((m) => m.image.url); const g = p.variants.nodes.map((v) => onSku.get(K(v.sku))).find(Boolean);
    if (want) { if (want.has(p.handle)) cands.push({ p, g, imgs }); continue; }
    if (!BAG.test(p.title) || NOT_FASHION.test(p.title) || HOLD_RE.test(`${p.title} ${p.description}`) || imgs.length < 5 || !g || HOLD_RE.test(g.title)) continue;
    cands.push({ p, g, imgs, type: /トート/.test(p.title) ? 'tote' : 'shoulder' });
  }
  // 同じ卸商品（good_id）は 1 件だけ（画像が多いもの）。ショルダー系 3 + トート系 2
  const best = new Map(); for (const x of cands) { const k = x.g?.good_id ?? x.p.handle; if (!best.has(k) || best.get(k).imgs.length < x.imgs.length) best.set(k, x); }
  const sorted = [...best.values()].sort((a, b) => b.imgs.length - a.imgs.length || a.p.title.length - b.p.title.length);
  const chosen = want ? sorted : [...sorted.filter((x) => x.type === 'shoulder').slice(0, 3), ...sorted.filter((x) => x.type === 'tote').slice(0, 2)];
  const items = chosen.map(({ p, g, imgs, type }) => {
    const price = Math.min(...p.variants.nodes.map((v) => Number(v.price))); const cat = categorize(p);
    return { handle: p.handle, id: p.id, title: p.title, productType: p.productType, type, price, amazon: { type: cat.feed_product_type, ...amazonPrice(price, cat.feed_product_type) }, options: p.options, variants: p.variants.nodes, images: imgs, description: p.description,
      ja: g ? { good_id: g.good_id, title: g.title, sub_title: g.sub_title, desc: text(g.desc), skus: g.skus, fetchedAt: ja.fetchedAt } : null };
  });
  W(PILOT, { at: new Date().toISOString(), rule: 'ACTIVE・日文站在售（ja-full.json）・画像≥5・ショルダー/トート系・他社ブランド/IP 除外・同一卸商品は 1 件', items });
  for (const x of items) log('pick', x.type, x.images.length, '枚', x.ja?.good_id, x.title.slice(0, 40), `Amazon ¥${x.amazon.price}`);
  return downloadOwn();
}
async function downloadOwn() {
  for (const p of pilot()) { const jobs = []; for (const [i, u] of p.images.entries()) { const f = await download(u, path.join(pdir(p, 'src'), `${pad(i + 1)}.jpg`)); const t = path.join(pdir(p, 'thumbs'), `${pad(i + 1)}.jpg`); if (!fs.existsSync(t)) jobs.push({ src: f, out: t, max: 768 }); } py('thumbs', jobs); }
}

// ================= 2. compete =================
async function bagLists() {
  const f = path.join(OUT, '_lists.json'); if (fs.existsSync(f) && !args.force) return J(f);
  const c = CATS.luggage; const items = new Map();
  for (const [kind, url] of Object.entries(listUrls(c))) { if (kind === 'movers') continue; const page = await visit(url); for (let y = 0; y < 6; y++) { await page.mouse.wheel(0, 1500); await sleep(500); } for (const g of await readList(page)) if (!items.has(g.asin)) items.set(g.asin, { ...g, source: kind }); log('list', kind, items.size); }
  const out = { at: new Date().toISOString(), category: c.name, items: [...items.values()] }; W(f, out); return out;
}
async function compete(p) {
  const b = brief(p);
  if (b.competitors?.length && !args.force) { // 竞品は決定済み。レビュー本文を取れていない詳細（2026-10 の DOM 変更前に取ったもの）だけ取り直す
    for (const c of b.competitors) { const f = path.join(OUT, p.handle, 'comp', `${c.asin}.json`); const old = J(f); if (old.rv === 2) continue; const page = await visit(`https://www.amazon.co.jp/dp/${c.asin}?th=1&psc=1`); const d = await readDetail(page); W(f, { ...old, ...d, rv: 2, fetchedAt: new Date().toISOString() }); log('refetch', c.asin, d.images.length, 'img', d.reviews.filter((r) => r.body).length, 'rev'); }
    return;
  }
  if (!b.keywords) {
    const j = await chatJson([{ role: 'system', content: 'あなたは Amazon.co.jp の検索担当です。商品について、日本の買い手が Amazon で実際に検索する核心キーワードを 2〜4 個（型番・誇張語・色名を除く、短い日本語の組み合わせ）と、版型（形・サイズ感）・客群を答えます。JSON: {"keywords":["…"],"form":"版型 15字","segment":"客群 15字"}' }, { role: 'user', content: `商品名: ${p.title}\n卸の商品名: ${p.ja?.title ?? ''}\n説明: ${(p.ja?.desc || p.description).slice(0, 800)}` }], { maxTokens: 800 });
    b.keywords = (j.keywords ?? []).slice(0, 4); b.form = j.form; b.segment = j.segment; saveBrief(p, b);
  }
  const lists = await bagLists(); const cand = new Map();
  for (const kw of b.keywords) { const page = await visit(`https://www.amazon.co.jp/s?k=${encodeURIComponent(kw)}`); for (const x of (await readSearch(page)).slice(0, 24)) if (!cand.has(x.asin)) cand.set(x.asin, { ...x, source: `検索「${kw}」${x.sponsored ? '(広告)' : ''} ${x.pos}位` }); log('search', kw, cand.size); }
  for (const x of lists.items) if (!cand.has(x.asin)) cand.set(x.asin, { ...x, source: `${x.source === 'bestsellers' ? 'ベストセラー' : '新着'} ${x.rank ?? ''}位` });
  const target = p.amazon.price; let band = 0.3; let pool = [];
  for (; band <= 0.61; band += 0.15) { pool = [...cand.values()].filter((x) => yen(x.price) && Math.abs(yen(x.price) - target) / target <= band && !HOLD_RE.test(x.title)); if (pool.length >= 15) break; }
  band = Math.min(band, 0.6);
  const j = await chatJson([{ role: 'system', content: '自社商品と「同じ版型・同じ価格帯・同じ客群」の Amazon 竞品を候補から 5〜8 件選びます。版型が違う（リュック/財布/ポーチ等）、子供向け、ブランド品は選ばない。レビュー数が多いもの・検索上位を優先。JSON: {"competitors":[{"asin":"候補の asin","reason":"選んだ理由（中文 30 字以内）"}]}' }, { role: 'user', content: `自社: ${p.title}\n版型: ${b.form}\n客群: ${b.segment}\n想定 Amazon 価格: ¥${target}（±${Math.round(band * 100)}%）\n候補:\n${pool.slice(0, 80).map((x) => `${x.asin}\t${x.price}\t★${starOf(x.rating) ?? '-'}\t${x.reviews || 0}件\t${x.source}\t${x.title.slice(0, 70)}`).join('\n')}` }], { maxTokens: 1500 });
  const seen = new Set(); const picked = (j.competitors ?? []).filter((x) => cand.has(x.asin) && !seen.has(x.asin) && seen.add(x.asin)).slice(0, 8);
  if (picked.length < 3) throw new Error(`竞品が ${picked.length} 件しか選べない（候補 ${pool.length}）`);
  const comps = [];
  for (const x of picked) {
    const f = path.join(pdir(p, 'comp'), `${x.asin}.json`);
    if (!fs.existsSync(f) || args.force) { const page = await visit(`https://www.amazon.co.jp/dp/${x.asin}?th=1&psc=1`); const d = await readDetail(page); W(f, { asin: x.asin, ...cand.get(x.asin), ...d, rv: 2, fetchedAt: new Date().toISOString() }); log('detail', x.asin, d.title.slice(0, 30), d.images.length, 'img', d.reviews.length, 'rev'); }
    const d = J(f); comps.push({ asin: x.asin, url: `https://www.amazon.co.jp/dp/${x.asin}`, title: d.title || cand.get(x.asin).title, price: d.price || cand.get(x.asin).price, rating: starOf(d.rating || cand.get(x.asin).rating), reviews: yen(d.reviewCount) ?? yen(cand.get(x.asin).reviews), bsr: d.bsr, since: d.since, brand: d.brand, images: d.images.length, source: cand.get(x.asin).source, reason: x.reason });
  }
  Object.assign(b, { competitors: comps, competeNote: `候補 ${cand.size} 件（検索 ${b.keywords.length} 語＋${lists.category} ベストセラー/新着）→ 価格 ±${Math.round(band * 100)}% で ${pool.length} 件 → ${comps.length} 件` }); saveBrief(p, b);
  log('compete', p.handle.slice(0, 30), comps.length, '件', b.competeNote);
}

// ================= 3. teardown =================
const TEAR_SYS = `あなたは Amazon 商品画像のアナリストです。1 つの出品の画像（1 枚目が主图）を 1 枚ずつ分類します。JSON:
{"images":[{"n":1,"role":"main|feature|detail|size|scene|model|compare|package|color|other","angle":"正面|斜め45°|真上|側面|背面|内側|複数カット|その他","light":"フラット|サイド光|逆光|自然光|スタジオ","background":"純白|単色|室内|屋外|合成|その他","info":["素材感","構造","サイズ","容量・装載","使用場面","着用イメージ","付属品","比較","保証","カラー展開","機能説明"]から該当するもの,"hasText":bool,"hasModel":bool,"caption":"見せている内容 20字以内"}]}`;
const OWN_SYS = `あなたは EC 商品画像の検品担当です。自社商品の原図を 1 枚ずつ判定します。JSON:
{"images":[{"n":1,"kind":"main|scene|detail|infographic|size|package|model|color|other","angle":"正面|斜め45°|真上|側面|背面|内側|複数カット|その他","hasText":bool,"hasPerson":bool,"hasBrandLogo":bool,"background":"white|plain|room|outdoor|other","mainBox":[x0,y0,x1,y1],"cleanBox":[x0,y0,x1,y1],"caption":"写っている内容 15字以内","textJa":"画像内の文字のうち寸法・重量・素材・容量・ポケット数など仕様の表記をそのまま書き写す（無ければ空）"}]}
- main=商品単体 / scene=使用シーン / detail=部分アップ / infographic=文字説明中心 / size=寸法図 / package=セット内容 / model=人が持つ・着用 / color=色違い並べ
- mainBox: 主要な商品 1 個だけを囲む枠（0〜1 の割合）。文字ステッカー・はめ込み小画像・別の色の同商品は含めない。無ければ null
- cleanBox: 文字・ロゴ・はめ込み小画像を含まない実写部分の最大矩形（0〜1）。全面に文字があれば null
- hasBrandLogo: 他社ブランドのロゴ・商品が写っていれば true`;
async function visionBatch(sys, files, intro) {
  const content = [{ type: 'text', text: `${intro}\n画像は ${files.length} 枚、番号順。` }]; files.forEach((f, i) => { content.push({ type: 'text', text: `画像 ${i + 1}:` }); content.push({ type: 'image_url', image_url: { url: b64(f) } }); });
  const j = await chatJson([{ role: 'system', content: sys }, { role: 'user', content }], { model: VISION, maxTokens: 6000 }); if (!Array.isArray(j.images)) throw new Error('vision: images not array'); return j.images;
}
function ownClassify(p) { const f = path.join(OUT, p.handle, 'own.json'); return fs.existsSync(f) ? J(f) : null; }
async function teardown(p) {
  const b = brief(p); if (!b.competitors?.length) throw new Error('competitors 無し：先に compete');
  if (!ownClassify(p) || args.force) { const th = pdir(p, 'thumbs'); const files = fs.readdirSync(th).filter((f) => f.endsWith('.jpg')).sort().map((f) => path.join(th, f)); W(path.join(OUT, p.handle, 'own.json'), { images: await visionBatch(OWN_SYS, files, `商品名: ${p.title}`) }); log('own classified', files.length); }
  if (b.gaps?.length && !args.force) return;
  const per = {};
  for (const c of b.competitors) {
    const f = path.join(pdir(p, 'comp'), `${c.asin}.tear.json`);
    if (!fs.existsSync(f) || args.force) {
      const d = J(path.join(OUT, p.handle, 'comp', `${c.asin}.json`)); const urls = (d.images ?? []).slice(0, 9); const jobs = []; const files = [];
      for (const [i, u] of urls.entries()) { const src = await download(u, path.join(pdir(p, 'comp', c.asin), `${pad(i + 1)}.jpg`)); const t = path.join(pdir(p, 'comp', c.asin), `t${pad(i + 1)}.jpg`); if (!fs.existsSync(t)) jobs.push({ src, out: t, max: 512 }); files.push(t); await sleep(300); }
      py('thumbs', jobs); if (!files.length) { W(f, { images: [] }); continue; }
      W(f, { images: await visionBatch(TEAR_SYS, files, `商品: ${c.title.slice(0, 60)}`) }); log('teardown', c.asin, files.length);
    }
    per[c.asin] = J(f).images;
  }
  // 集計（コードで数える。数字＝竞品の件数）
  const n = Object.keys(per).length; const cnt = (pred) => Object.values(per).filter((imgs) => imgs.some(pred)).length;
  const mains = Object.values(per).map((imgs) => imgs[0]).filter(Boolean); const dist = (k) => mains.reduce((a, x) => ((a[x[k]] = (a[x[k]] ?? 0) + 1), a), {});
  const INFO = ['素材感', '構造', 'サイズ', '容量・装載', '使用場面', '着用イメージ', '付属品', '比較', '保証', 'カラー展開', '機能説明'];
  const stats = { competitors: n, imagesAvg: +(Object.values(per).reduce((s, x) => s + x.length, 0) / Math.max(n, 1)).toFixed(1), mainAngle: dist('angle'), mainLight: dist('light'), mainBackground: dist('background'), mainHasModel: mains.filter((x) => x.hasModel).length,
    info: Object.fromEntries(INFO.map((k) => [k, cnt((x) => (x.info ?? []).includes(k))])), roles: Object.fromEntries(['size', 'scene', 'model', 'detail', 'compare', 'package', 'color'].map((r) => [r, cnt((x) => x.role === r)])), lightAll: Object.values(per).flat().reduce((a, x) => ((a[x.light] = (a[x.light] ?? 0) + 1), a), {}) };
  const own = ownClassify(p).images.map((x) => ({ n: x.n, kind: x.kind, angle: x.angle, hasText: x.hasText, hasPerson: x.hasPerson, caption: x.caption }));
  const j = await chatJson([{ role: 'system', content: '你是 Amazon 商品图策略分析师。根据竞品图片拆解统计（数字=竞品件数），找出「大家都一样的」和「没人展示的」表达空缺，并给出我们怎么用自家原图做出差异。只能用我们已有的原图（不能新拍、不能 AI 生成）。输出 JSON（中文）：{"same":["大家都一样的 3-5 条，带数字"],"gaps":[{"observation":"观察（带数字）","ours":"我们怎么做出差异","useImages":[原图编号]}]}，gaps 3-5 条。' }, { role: 'user', content: `自家商品: ${p.title}\n竞品 ${n} 件，拆解统计:\n${JSON.stringify(stats)}\n各竞品图片摘要:\n${Object.entries(per).map(([a, imgs]) => `${a}: ${imgs.map((x) => `${x.n}.${x.role}/${x.angle}/${x.light}/${(x.info ?? []).join('+')}/${x.caption}`).join(' | ')}`).join('\n')}\n自家原图:\n${own.map((x) => `${x.n}. ${x.kind} ${x.angle} ${x.hasText ? '有字' : ''}${x.hasPerson ? '有人' : ''} ${x.caption}`).join('\n')}` }], { maxTokens: 2500 });
  Object.assign(b, { teardown: { stats, same: j.same ?? [] }, gaps: (j.gaps ?? []).map((g) => ({ ...g, useImages: (g.useImages ?? []).filter((k) => own.some((x) => x.n === k)) })) }); saveBrief(p, b);
  log('gaps', p.handle.slice(0, 30), b.gaps.length);
}

// ================= 4. reviews + facts + plan =================
const FACT_SYS = `あなたは商品データの事実確認担当です。与えられた「出典テキスト」だけから、商品画像に使える事実を抜き出します。推測・一般論・誇張は入れない。
JSON: {"facts":[{"k":"項目（例: サイズ, 重量, 素材, ポケット数, 収納目安, 仕様, 色, セット内容, 発送）","v":"値（日本語、短く）","src":"出典キー（下の [ ] 内のキー）","quote":"出典テキストからそのまま抜き出した根拠部分（改変しない）"}]}
- 数字（寸法・重量・枚数・容量）は quote に同じ数字が書かれているものだけ。
- v は必ず自然な日本語（出典が中国語なら日本語に訳す。例: 12:00前下单当日发送 → 12時までのご注文は当日発送）。
- 送料・追加料金・遠隔地加算など、Amazon の画像に書けない配送条件は抜かない。色は 1 件にまとめる。
- 15〜30 件。`;
const nfkc = (s) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');
const nums = (s) => String(s ?? '').normalize('NFKC').match(/\d+(?:\.\d+)?/g) ?? [];
async function facts(p) {
  const own = ownClassify(p)?.images ?? [];
  const sources = { 'ja.title': p.ja?.title ?? '', 'ja.desc': p.ja?.desc ?? '', 'ja.ship': p.ja?.sub_title ?? '', 'shopify.title': p.title, 'shopify.desc': p.description ?? '', sku: p.variants.map((v) => `${v.sku}: ${v.title}`).join('\n'), ...Object.fromEntries(own.filter((x) => x.textJa).map((x) => [`img:${pad(x.n)}`, x.textJa])) };
  const j = await chatJson([{ role: 'system', content: FACT_SYS }, { role: 'user', content: Object.entries(sources).filter(([, v]) => v).map(([k, v]) => `[${k}]\n${String(v).slice(0, 3500)}`).join('\n\n') }], { maxTokens: 4000 });
  const ok = [], dropped = [];
  for (const f of j.facts ?? []) { const src = sources[f.src]; const q = nfkc(f.quote); const good = src && q.length >= 2 && nfkc(src).includes(q) && nums(f.v).every((n) => nums(f.quote).includes(n)); (good ? ok : dropped).push(f); }
  // バリエーション（色）は SKU から機械的に
  const colorOpt = p.options.find((o) => /色|カラー|colou?r/i.test(o.name)); if (colorOpt && colorOpt.values.length > 1) ok.push({ k: 'カラー', v: colorOpt.values.join('・'), src: 'sku', quote: colorOpt.values.join(' / ') });
  return { facts: ok.map((f, i) => ({ id: `F${i + 1}`, ...f })), dropped };
}
const REV_SYS = `你是评论分析师。给你同类竞品的 Amazon 评论（带编号、星级）。先定义话题，再给每条评论打话题标签（可多个，无关则空）。差评(★1-3)里的不满=顾虑(concern)，好评(★4-5)里被称赞的点=需求(need)。
输出 JSON：{"topics":[{"id":"T1","type":"concern|need","label":"中文话题 15 字内","ja":"日本語の言い方 15 字内"}],"labels":[{"i":评论编号,"topics":["T1"]}]}。话题 6-14 个，要具体（例「扣具不牢」「比想象装得少」「轻」「百搭」），不要笼统。`;
const PLAN_SYS = `あなたは Amazon.co.jp の商品画像ディレクターです。竞品レビューの顧慮・需求、竞品画像の空白、自社の事実（facts）から、副图 6 枚（2〜7 枚目）の内容を決めます。
厳守：
- 画像に書く数字・仕様は facts にあるものだけ。各テキストに根拠の factIds を付ける。facts で答えられない顧慮は answers に入れず unanswered に入れる。
- 最強/No.1/絶対/日本一/世界一/業界初/最安/送料無料/医療効果/他社ブランド名は使わない。
- 文字は短く：headline は 1 行 12 字以内（<br> で最大 2 行）、sub 24 字以内、points の t は 14 字以内。名詞止め。
- img は自社原図の番号。文字の無い原図を優先。副图は着用（人物入り）でもよい。mainA/mainB は人が写っていない原図（白背景の商品単体が無ければ、物だけが写った scene）。
JSON:
{"answers":[{"topic":"T?","slide":"concern1|concern2|value|size|scene|set","factIds":["F1"]}],
 "unanswered":[{"topic":"T?","why":"中文：为什么答不了、要向供应商确认什么"}],
 "mainA":{"img":番号,"why":"中文"},"mainB":{"img":番号（mainA と違う角度・構図）,"why":"中文"},
 "slides":{
  "value":{"headline":"最大の需求に答える一言","sub":"","points":[{"t":"","factIds":[]}],"img":番号},
  "valueB":{"headline":"使用シーン起点の一言","sub":"","points":[{"t":"","factIds":[]}],"img":番号},
  "concern1":{"worry":"顧慮を買い手の言葉で 16 字以内","headline":"答え","points":[{"t":"","factIds":[]}],"img":番号},
  "concern2":{"worry":"","headline":"","points":[{"t":"","factIds":[]}],"img":番号},
  "size":{"headline":"サイズ・仕様","rows":[{"k":"","v":"","factIds":[]}]},
  "scene":{"tag":"シーン 8 字","headline":"","sub":"","img":番号},
  "set":{"headline":"セット内容","items":[{"t":"","factIds":[]}],"notes":[{"t":"発送など","factIds":[]}]}}}`;
async function reviews(p) {
  const b = brief(p); if (!b.competitors?.length) throw new Error('competitors 無し'); if (!ownClassify(p)) throw new Error('own.json 無し：先に teardown'); if (b.plan && !args.force) return;
  // 4-1 事実
  if (!b.facts || args.force) { const r = await facts(p); b.facts = r.facts; b.factsDropped = r.dropped.map((f) => `${f.k}: ${f.v}（${f.src}）`); saveBrief(p, b); log('facts', b.facts.length, 'dropped', r.dropped.length); }
  // 4-2 レビュー（商品ページの上位レビュー。★別の一覧ページはログインが要るので使わない）
  const revs = []; for (const c of b.competitors) { const d = J(path.join(OUT, p.handle, 'comp', `${c.asin}.json`)); for (const r of d.reviews ?? []) if (r.body) revs.push({ asin: c.asin, star: starOf(r.star), title: r.title, body: r.body }); }
  const low = revs.filter((r) => r.star && r.star <= 3), high = revs.filter((r) => r.star && r.star >= 4); const use = [...low, ...high];
  if (use.length < 5) throw new Error(`レビューが ${use.length} 件しか取れない`);
  const rj = await chatJson([{ role: 'system', content: REV_SYS }, { role: 'user', content: use.map((r, i) => `#${i} ★${r.star} ${r.title} — ${r.body.slice(0, 300)}`).join('\n') }], { maxTokens: 5000 });
  const topics = (rj.topics ?? []).map((t) => ({ ...t, count: 0, asins: new Set(), examples: [] }));
  for (const l of rj.labels ?? []) { const r = use[l.i]; if (!r) continue; for (const id of l.topics ?? []) { const t = topics.find((x) => x.id === id); if (!t) continue; if ((t.type === 'concern') !== (r.star <= 3)) continue; t.count++; t.asins.add(r.asin); if (t.examples.length < 2) t.examples.push(`★${r.star} ${r.title}`.slice(0, 60)); } }
  const T = topics.filter((t) => t.count > 0).map((t) => ({ ...t, asins: [...t.asins] })).sort((a, z) => z.count - a.count);
  // 4-3 plan
  const own = ownClassify(p).images;
  const pj = await chatJson([{ role: 'system', content: PLAN_SYS }, { role: 'user', content: `商品: ${p.title}\n客群: ${b.segment}\n\n顧慮（差評 ${low.length} 件から、件数順）:\n${T.filter((t) => t.type === 'concern').map((t) => `${t.id} ${t.ja}（${t.label}） ${t.count}件`).join('\n') || 'なし'}\n\n需求（好評 ${high.length} 件から）:\n${T.filter((t) => t.type === 'need').map((t) => `${t.id} ${t.ja}（${t.label}） ${t.count}件`).join('\n')}\n\n竞品画像の空白:\n${(b.gaps ?? []).map((g) => `- ${g.observation} → ${g.ours}（原図 ${g.useImages?.join(',')}）`).join('\n')}\n\nfacts:\n${b.facts.map((f) => `${f.id} ${f.k}: ${f.v}`).join('\n')}\n\n自社原図:\n${own.map((x) => `${x.n}. ${x.kind} ${x.angle} ${x.hasText ? '文字あり' : '文字なし'} ${x.hasPerson ? '人物' : ''} ${x.hasBrandLogo ? '他社ロゴ' : ''} ${x.caption}`).join('\n')}` }], { maxTokens: 5000 });
  const v = validatePlan(pj, b.facts, own);
  const answeredBy = (t) => (v.answers ?? []).filter((a) => a.topic === t.id && a.factIds?.length).map((a) => ({ slide: a.slide, factIds: a.factIds }));
  b.concerns = T.filter((t) => t.type === 'concern').map((t) => ({ id: t.id, topic: t.label, ja: t.ja, count: t.count, asins: t.asins, examples: t.examples, answeredBy: answeredBy(t) }));
  b.needs = T.filter((t) => t.type === 'need').map((t) => ({ id: t.id, topic: t.label, ja: t.ja, count: t.count, asins: t.asins, examples: t.examples, answeredBy: answeredBy(t) }));
  const answered = new Set(b.concerns.filter((c) => c.answeredBy.length).map((c) => c.id));
  b.unanswered = [...(v.unanswered ?? []).filter((u) => !answered.has(u.topic)).map((u) => ({ ...u, topic: T.find((t) => t.id === u.topic)?.label ?? u.topic })), ...b.concerns.filter((c) => !c.answeredBy.length && !(v.unanswered ?? []).some((u) => u.topic === c.id)).map((c) => ({ topic: c.topic, why: '自家事实里没有可回答的数据' }))];
  b.reviewsUsed = { low: low.length, high: high.length, note: '竞品商品页上的上位评论（按星级的评论列表需要登录，未使用）' };
  b.plan = { mainA: v.mainA, mainB: v.mainB, slides: v.slides, removed: v.removed, logoWarn: v.logoWarn, raw: v.raw,
    A: ['main', 'value', 'concern1', 'concern2', 'size', 'scene', 'set'], B: ['main', 'valueB', 'scene', 'concern1', 'concern2', 'size', 'set'] };
  b.tests = b.tests ?? [];
  saveBrief(p, b); log('plan', p.handle.slice(0, 30), 'concerns', b.concerns.length, 'needs', b.needs.length, 'unanswered', b.unanswered.length, 'removed', v.removed.length);
}
// 数字が facts に無い・NG 語を含むテキストは消す（コードで強制）
function validatePlan(pj, facts, own) {
  const removed = []; const byId = Object.fromEntries(facts.map((f) => [f.id, f])); const allNums = new Set(facts.flatMap((f) => nums(f.v)));
  const okText = (t, ids, where) => { if (!t) return ''; const s = String(t); if (NG_RE.test(s) || HOLD_RE.test(s)) { removed.push(`${where}: ${s}（NG 語）`); return ''; } const allowed = new Set((ids ?? []).flatMap((id) => nums(byId[id]?.v))); const bad = nums(s.replace(/<br>/g, '')).filter((n) => !allowed.has(n) && !allNums.has(n)); if (bad.length) { removed.push(`${where}: ${s}（数字 ${bad.join(',')} が facts に無い）`); return ''; } return s; };
  const okImg = (n) => own.find((o) => o.n === Number(n))?.n ?? null;
  const okMain = (n) => { const x = own.find((o) => o.n === Number(n)); return x && x.kind !== 'model' && x.kind !== 'infographic' && (!x.hasPerson || x.kind === 'scene') ? x.n : null; }; // hasBrandLogo は商品自体の刻印でも true になるので除外しない（警告に出す）
  const s = pj.slides ?? {}; const out = {};
  for (const k of ['value', 'valueB', 'concern1', 'concern2']) { const x = s[k] ?? {}; out[k] = { worry: okText(x.worry, [], `${k}.worry`), headline: okText(x.headline, (x.points ?? []).flatMap((q) => q.factIds ?? []), `${k}.headline`), sub: okText(x.sub, [], `${k}.sub`), points: (x.points ?? []).map((q, i) => ({ t: okText(q.t, q.factIds, `${k}.points${i}`), factIds: (q.factIds ?? []).filter((id) => byId[id]) })).filter((q) => q.t).slice(0, 3), img: okImg(x.img) }; }
  out.size = { headline: okText(s.size?.headline, [], 'size.headline') || 'サイズ・仕様', rows: (s.size?.rows ?? []).map((r, i) => ({ k: r.k, v: okText(r.v, r.factIds, `size.rows${i}`), factIds: (r.factIds ?? []).filter((id) => byId[id]) })).filter((r) => r.v && r.factIds.length).slice(0, 6) };
  out.scene = { tag: okText(s.scene?.tag, [], 'scene.tag'), headline: okText(s.scene?.headline, [], 'scene.headline'), sub: okText(s.scene?.sub, [], 'scene.sub'), img: okImg(s.scene?.img) };
  out.set = { headline: okText(s.set?.headline, [], 'set.headline') || 'セット内容', items: (s.set?.items ?? []).map((q, i) => ({ t: okText(q.t, q.factIds, `set.items${i}`), factIds: q.factIds ?? [] })).filter((q) => q.t).slice(0, 4), notes: (s.set?.notes ?? []).map((q, i) => ({ t: okText(q.t, q.factIds, `set.notes${i}`), factIds: (q.factIds ?? []).filter((id) => byId[id]) })).filter((q) => q.t && q.factIds.length).slice(0, 3) };
  if (!out.set.items.length) out.set.items = [{ t: '本体 ×1', factIds: [] }];
  const KR = { main: 0, color: 1, package: 2, detail: 3, scene: 4 }; const mains = own.filter((o) => okMain(o.n) && o.kind in KR).sort((a, z) => KR[a.kind] - KR[z.kind] || Number(a.hasPerson) - Number(z.hasPerson) || Number(a.hasBrandLogo) - Number(z.hasBrandLogo) || Number(a.hasText) - Number(z.hasText));
  let mA = okMain(pj.mainA?.img) ?? mains[0]?.n ?? 1; let mB = okMain(pj.mainB?.img) ?? mains.find((m) => m.n !== mA)?.n ?? mA;
  if (mB === mA) mB = mains.find((m) => m.n !== mA && m.angle !== own.find((o) => o.n === mA)?.angle)?.n ?? mains.find((m) => m.n !== mA)?.n ?? mA;
  const answers = (pj.answers ?? []).map((a) => ({ ...a, factIds: (a.factIds ?? []).filter((id) => byId[id]) }));
  const used = [mA, mB, ...Object.values(out).map((x) => x.img)].filter(Boolean); const logoWarn = [...new Set(used)].filter((n) => own.find((o) => o.n === n)?.hasBrandLogo);
  return { answers, unanswered: pj.unanswered ?? [], slides: out, removed, logoWarn, raw: pj, mainA: { img: mA, why: Number(pj.mainA?.img) === mA ? pj.mainA?.why : '自動選択（文字なしの商品単体）' }, mainB: { img: mB, why: Number(pj.mainB?.img) === mB ? pj.mainB?.why : '自動選択（A と別の原図）' } };
}

// ================= 5. render =================
const PX = 1600, SCALE = 1.25; // CSS 1600px → 出力 2000px
function fontLinks() { const d = path.join(ROOT, 'node_modules/@fontsource/noto-sans-jp'); return ['400', '700', '900'].filter((w) => fs.existsSync(path.join(d, `${w}.css`))).map((w) => `<link rel="stylesheet" href="${pathToFileURL(path.join(d, `${w}.css`)).href}">`).join(''); }
// 配色は tools/brand-assets/product-cards.mjs の B（量販専門店風）
const TH = { bg: '#FFFFFF', panel: '#F4F4F4', ink: '#111111', sub: '#555555', accent: '#BF0000', line: '#E5E5E5' };
const page = (body) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">${fontLinks()}<style>
*{box-sizing:border-box;margin:0;padding:0} html,body{width:${PX}px;height:${PX}px;overflow:hidden;background:${TH.bg}}
body{font-family:"Noto Sans JP",sans-serif;color:${TH.ink};font-feature-settings:"palt";letter-spacing:.02em}
.wrap{position:relative;width:${PX}px;height:${PX}px} h1{font-weight:900;line-height:1.22;font-size:84px;letter-spacing:.02em}
.sub{font-size:36px;color:${TH.sub};margin-top:18px;font-weight:700} .chip{display:inline-block;background:${TH.accent};color:#fff;font-weight:700;font-size:32px;padding:.28em 1em;border-radius:4px}
.rule{height:8px;width:120px;background:${TH.accent};margin-top:26px} .panel{background:${TH.panel};border-radius:6px;overflow:hidden}
.pt{display:flex;align-items:center;gap:22px;font-size:44px;font-weight:900;padding:26px 30px;background:#fff;border:3px solid ${TH.line};border-radius:6px;line-height:1.3} .pt i{font-style:normal;color:${TH.accent};font-size:48px}
.ph{width:100%;height:100%;object-fit:cover;display:block} .ct{width:100%;height:100%;object-fit:contain;display:block}
</style></head><body><div class="wrap">${body}</div></body></html>`;
const furl = (f) => pathToFileURL(f).href;
async function renderHtml(shots) { // [{html, out, w?, h?, scale?}]
  const { chromium } = await import('playwright'); const br = await chromium.launch();
  try { for (const s of shots) { const f = s.out.replace(/\.jpg$/, '.html'); fs.writeFileSync(f, s.html); const pg = await br.newPage({ viewport: { width: s.w ?? PX, height: s.h ?? PX }, deviceScaleFactor: s.scale ?? SCALE }); await pg.goto(furl(f), { waitUntil: 'networkidle' }); await pg.evaluate(() => document.fonts.ready); await pg.screenshot({ path: s.out, type: 'jpeg', quality: 92 }); await pg.close(); fs.unlinkSync(f); } }
  finally { await br.close(); } // 自分で起動した headless Chromium だけ閉じる（CDP のブラウザではない）
}
const okBox = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === 'number') && b[2] > b[0] && b[3] > b[1];
// pipeline.mjs mainBox と同じ：文字入りなら mainBox ∩ cleanBox
function boxFor(x) { let b = okBox(x?.mainBox) ? [...x.mainBox] : null; if (x?.hasText && okBox(x.cleanBox)) { const c = x.cleanBox; const i = b ? [Math.max(b[0], c[0]), Math.max(b[1], c[1]), Math.min(b[2], c[2]), Math.min(b[3], c[3])] : c; if (i[2] - i[0] > 0.3 && i[3] - i[1] > 0.3) b = i; } if (!b || (b[2] - b[0] >= 0.97 && b[3] - b[1] >= 0.97)) return null; return b; }
const SLIDE_ZH = { main: '主图', value: '价值（需求最大点）', valueB: '价值（场景切入）', concern1: '顾虑回答①', concern2: '顾虑回答②', size: '尺寸/规格', scene: '使用场景', set: '套装内容/发货' };
async function render(p) {
  const b = brief(p); if (!b.plan) throw new Error('plan 無し：先に reviews'); const own = ownClassify(p).images; const byN = Object.fromEntries(own.map((x) => [x.n, x]));
  const A = pdir(p, 'a'), B = pdir(p, 'b'), work = pdir(p, 'work');
  if (fs.existsSync(path.join(B, '07.jpg')) && fs.existsSync(path.join(OUT, p.handle, 'preview.jpg')) && !args.force) return;
  const src = (n) => path.join(OUT, p.handle, 'src', `${pad(n)}.jpg`);
  // 切り抜き（rembg、主图 A/B 用）
  const cut = (n) => path.join(work, `cut-${pad(n)}.png`); const jobs = [];
  for (const n of new Set([b.plan.mainA.img, b.plan.mainB.img])) if (!fs.existsSync(cut(n)) || args.force) jobs.push({ src: src(n), out: cut(n), box: boxFor(byN[n]) });
  py('cutout', jobs);
  // 副图の写真：文字入りの原図は cleanBox で切る。切れなければ切り抜きで代用
  const crops = []; const photo = (n) => { const x = byN[n]; if (!x) return null; if (!x.hasText) return src(n); if (!okBox(x.cleanBox) || (x.cleanBox[2] - x.cleanBox[0]) * (x.cleanBox[3] - x.cleanBox[1]) < 0.25) return null; const o = path.join(work, `crop-${pad(n)}.jpg`); if ((!fs.existsSync(o) || args.force) && !crops.some((c) => c.out === o)) crops.push({ src: src(n), out: o, box: x.cleanBox }); return o; };
  const S = b.plan.slides; const cutA = cut(b.plan.mainA.img), cutB = cut(b.plan.mainB.img);
  const imgOr = (n, fallbackCut) => { const f = n ? photo(n) : null; return f ? `<img class="ph" src="${furl(f)}">` : `<div style="width:100%;height:100%;padding:60px;background:#fff"><img class="ct" src="${furl(fallbackCut)}"></div>`; };
  const pts = (list) => list.map((q) => `<div class="pt"><i>✓</i><span>${esc(q.t)}</span></div>`).join('');
  const T = {
    main: (cutF) => `<div style="position:absolute;inset:0;background:#fff;display:flex;align-items:center;justify-content:center"><img src="${furl(cutF)}" style="width:${PX * 0.85}px;height:${PX * 0.85}px;object-fit:contain"></div>`,
    value: (s, cutF) => `<div style="padding:90px 90px 0"><div class="chip">POINT</div><h1 style="margin-top:28px">${esc(s.headline)}</h1>${s.sub ? `<div class="sub">${esc(s.sub)}</div>` : ''}<div class="rule"></div></div>
      <div class="panel" style="position:absolute;left:90px;right:${s.points.length ? 760 : 90}px;top:540px;bottom:90px">${imgOr(s.img, cutF)}</div>
      <div style="position:absolute;right:90px;width:640px;top:540px;display:grid;gap:26px">${pts(s.points)}</div>`,
    concern: (s, cutF) => `<div class="panel" style="position:absolute;left:0;top:0;width:${PX * 0.5}px;height:${PX}px;border-radius:0">${imgOr(s.img, cutF)}</div>
      <div style="position:absolute;left:${PX * 0.5 + 70}px;right:80px;top:110px">${s.worry ? `<div style="font-size:36px;font-weight:700;color:${TH.sub};border-left:8px solid ${TH.line};padding:8px 0 8px 22px">「${esc(s.worry)}」</div>` : ''}<div class="chip" style="margin-top:46px">ANSWER</div><h1 style="margin-top:24px;font-size:72px">${esc(s.headline)}</h1><div class="rule"></div><div style="display:grid;gap:24px;margin-top:56px">${pts(s.points)}</div></div>`,
    size: (s, cutF) => `<div style="padding:90px 90px 0"><div class="chip">SPEC</div><h1 style="margin-top:28px">${esc(s.headline)}</h1><div class="rule"></div></div>
      <div style="position:absolute;left:90px;top:440px;width:${PX * 0.42}px;height:${PX * 0.6}px;display:flex;align-items:center;justify-content:center"><img class="ct" src="${furl(cutF)}"></div>
      <div style="position:absolute;right:90px;top:460px;width:${PX * 0.46}px">${s.rows.map((r) => `<div style="display:flex;gap:26px;padding:28px 0;border-bottom:3px solid ${TH.line}"><div style="min-width:190px;font-size:34px;color:${TH.sub};font-weight:700">${esc(r.k)}</div><div style="font-size:40px;font-weight:900;line-height:1.35">${esc(r.v)}</div></div>`).join('')}</div>`,
    scene: (s, cutF) => `<div style="position:absolute;inset:0">${imgOr(s.img, cutF)}</div><div style="position:absolute;left:0;right:0;bottom:0;padding:90px;background:linear-gradient(transparent,rgba(17,17,17,.72))">${s.tag ? `<div class="chip">${esc(s.tag)}</div>` : ''}<h1 style="color:#fff;margin-top:24px;text-shadow:0 2px 12px rgba(0,0,0,.35)">${esc(s.headline)}</h1>${s.sub ? `<div class="sub" style="color:#fff;opacity:.92">${esc(s.sub)}</div>` : ''}</div>`,
    set: (s, cutF) => `<div style="padding:90px 90px 0"><div class="chip">SET</div><h1 style="margin-top:28px">${esc(s.headline)}</h1><div class="rule"></div></div>
      <div style="position:absolute;left:90px;top:440px;width:${PX * 0.44}px;height:${PX * 0.56}px;display:flex;align-items:center;justify-content:center"><img class="ct" src="${furl(cutF)}"></div>
      <div style="position:absolute;right:90px;top:460px;width:${PX * 0.42}px;display:grid;gap:24px">${pts(s.items)}${s.notes.map((q) => `<div style="font-size:32px;font-weight:700;color:${TH.sub};padding:10px 4px">・${esc(q.t)}</div>`).join('')}</div>`,
  };
  const slideHtml = (key, cutF) => { if (key === 'main') return page(T.main(cutF)); const s = S[key]; const tpl = key.startsWith('value') ? T.value : key.startsWith('concern') ? T.concern : T[key]; return page(tpl(s, cutF)); };
  const shots = []; const names = {};
  for (const [set, dir, cutF] of [['A', A, cutA], ['B', B, cutB]]) b.plan[set].forEach((key, i) => { const out = path.join(dir, `${pad(i + 1)}.jpg`); (names[set] ??= []).push({ n: i + 1, key, file: path.relative(path.join(OUT, p.handle), out).replace(/\\/g, '/') }); shots.push({ key, cutF, out }); });
  const htmls = shots.map((s) => ({ ...s, html: slideHtml(s.key, s.cutF) })); py('crop', crops); // HTML を作る過程で crop が決まる → 先に作る
  await renderHtml(htmls);
  b.render = { A: names.A, B: names.B, at: new Date().toISOString() };
  // 主图の自動点検（純白・文字・ロゴ・付属しない小物）
  const th = ['a', 'b'].map((s) => ({ src: path.join(OUT, p.handle, s, '01.jpg'), out: path.join(work, `qa-${s}.jpg`), max: 512 })); py('thumbs', th);
  b.render.mainQa = await chatJson([{ role: 'system', content: 'Amazon 主图の規約チェック。各画像について JSON: {"images":[{"n":1,"whiteBg":bool,"hasText":bool,"hasLogo":bool,"extraProps":bool,"productRatio":"商品が画面に占める割合の目安（%）","note":"問題点 中文 30 字以内（無ければ空）"}]}' }, { role: 'user', content: [{ type: 'text', text: '画像1=A案主图, 画像2=B案主图' }, ...th.map((t) => ({ type: 'image_url', image_url: { url: b64(t.out) } }))] }], { model: VISION, maxTokens: 800 }).catch((e) => ({ error: e.message }));
  saveBrief(p, b);
  await preview(p, b);
  log('render', p.handle.slice(0, 30), 'A/B 7+7');
}
async function preview(p, b) {
  const tile = 300; const row = (set, list) => `<div style="display:flex;align-items:flex-start;gap:10px;margin-top:14px"><div style="width:60px;font-size:40px;font-weight:900;color:${TH.accent};padding-top:120px">${set}</div>${list.map((x) => `<div style="width:${tile}px"><img src="${furl(path.join(OUT, p.handle, x.file))}" style="width:${tile}px;height:${tile}px;border:1px solid #ddd;display:block"><div style="font-size:16px;color:#555;margin-top:4px">${x.n}. ${SLIDE_ZH[x.key]}</div></div>`).join('')}</div>`;
  const w = 60 + 7 * (tile + 10) + 50;
  const html = `<!doctype html><html><head><meta charset="utf-8">${fontLinks()}<style>body{margin:0;padding:20px;font-family:"Noto Sans JP",sans-serif;background:#fff;width:${w}px}</style></head><body><div style="font-size:22px;font-weight:700">${esc(p.title)}　<span style="color:#888;font-size:18px">Amazon 想定 ¥${p.amazon.price}｜A=顧慮先 / B=シーン先</span></div>${row('A', b.render.A)}${row('B', b.render.B)}</body></html>`;
  const out = path.join(OUT, p.handle, 'preview.jpg'); await renderHtml([{ html, out, w, h: 2 * (tile + 40) + 80, scale: 1 }]);
  fs.mkdirSync(DOCS, { recursive: true }); fs.copyFileSync(out, path.join(DOCS, `${String(p.id).split('/').pop()}-preview.jpg`));
}

// ================= 6. review（Shopify DRAFT）=================
async function upload(file, name) {
  const d = await gql(`mutation($i:[StagedUploadInput!]!){ stagedUploadsCreate(input:$i){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ message } } }`, { i: [{ resource: 'IMAGE', filename: name, mimeType: 'image/jpeg', httpMethod: 'POST' }] });
  if (ue(d.stagedUploadsCreate)) throw new Error(ue(d.stagedUploadsCreate)); const t = d.stagedUploadsCreate.stagedTargets[0];
  const fd = new FormData(); for (const x of t.parameters) fd.append(x.name, x.value); fd.append('file', new Blob([fs.readFileSync(file)], { type: 'image/jpeg' }), name);
  const r = await fetch(t.url, { method: 'POST', body: fd }); if (!r.ok) throw new Error(`staged upload ${r.status}`); return t.resourceUrl;
}
function summaryHtml(p, b, bUrls) {
  const li = (a) => `<ul>${a.map((x) => `<li>${x}</li>`).join('')}</ul>`; const e = esc;
  const where = (slide) => { const ia = b.plan.A.indexOf(slide), ib = b.plan.B.indexOf(slide === 'value' ? 'valueB' : slide); return `A 第${ia + 1}张${ib >= 0 ? ` / B 第${ib + 1}张` : ''}`; };
  const slideOf = (list) => list.map((a) => `${SLIDE_ZH[a.slide] ?? a.slide}（${where(a.slide)}，依据 ${a.factIds.join(',')}）`).join('；');
  return [`<p><b>【Amazon 审核用 DRAFT】</b>不公开、不在任何销售渠道。原商品：<code>${e(p.handle)}</code>（不改动）。<br>采用：加 tag <b>amazon-approved-a</b> 或 <b>amazon-approved-b</b>；重做：加 <b>amazon-redo</b> 并在备注写原因。</p>`,
    `<p><b>预计 Amazon 售价</b>：¥${p.amazon.price}（Shopify ¥${p.price}，类目 ${p.amazon.type}，手续费 ${Math.round(p.amazon.fee * 100)}%，税抜利益约 ¥${p.amazon.profitEx}；amazonPrice()）</p>`,
    `<h3>核心关键词</h3><p>${(b.keywords ?? []).map(e).join(' / ')}　版型：${e(b.form)}　客群：${e(b.segment)}</p>`,
    `<h3>对标竞品（${b.competitors.length}）</h3><p>${e(b.competeNote)}</p>${li(b.competitors.map((c) => `<a href="${c.url}">${c.asin}</a> ${e(c.title.slice(0, 40))}｜${e(c.price)}｜★${c.rating ?? '-'}（${c.reviews ?? '-'}）｜${e(c.source)}｜${e(c.reason)}`))}`,
    `<h3>竞品图：大家都一样的</h3>${li((b.teardown?.same ?? []).map(e))}<h3>没人展示的（我们的差异）</h3>${li((b.gaps ?? []).map((g) => `${e(g.observation)} → ${e(g.ours)}（原图 ${(g.useImages ?? []).join(',')}）`))}`,
    `<h3>顾虑（差评 ${b.reviewsUsed.low} 条）→ 对应图片</h3>${li(b.concerns.map((c) => `${e(c.topic)} ${c.count} 条 → ${c.answeredBy.length ? slideOf(c.answeredBy) : '<i>未回答</i>'}`))}`,
    `<h3>需求（好评 ${b.reviewsUsed.high} 条）→ 对应图片</h3>${li(b.needs.map((c) => `${e(c.topic)} ${c.count} 条 → ${c.answeredBy.length ? slideOf(c.answeredBy) : '—'}`))}`,
    `<h3>未能回答的顾虑（要向供应商确认）</h3>${b.unanswered.length ? li(b.unanswered.map((u) => `${e(u.topic)}：${e(u.why)}`)) : '<p>无</p>'}`,
    `<h3>图中使用的事实（出处）</h3>${li(b.facts.map((f) => `${f.id} ${e(f.k)}：${e(f.v)}（${e(f.src)}）`))}`,
    b.plan.logoWarn?.length ? `<p><b>注意</b>：原图 ${b.plan.logoWarn.join(',')} 被识别为带有 logo/品牌刻印（可能是商品本身的印字）。上 Amazon（品牌 SARADEMUNT）前请确认图中没有他牌标识。</p>` : '',
    b.plan.removed?.length ? `<h3>被自动删掉的文字（数字无出处/违规词）</h3>${li(b.plan.removed.map(e))}` : '',
    `<h3>A 案（本商品图片第 1〜7 张）</h3><p>${b.plan.A.map((k, i) => `${i + 1}.${SLIDE_ZH[k]}`).join(' / ')}<br>主图：原图 ${b.plan.mainA.img}（${e(b.plan.mainA.why)}）</p>`,
    `<h3>B 案（本商品图片第 8〜14 张）</h3><p>${b.plan.B.map((k, i) => `${i + 1}.${SLIDE_ZH[k]}`).join(' / ')}<br>主图：原图 ${b.plan.mainB.img}（${e(b.plan.mainB.why)}）</p>`,
    `<p>${bUrls.map((u, i) => `<img src="${u}" alt="B案 ${pad(i + 1)}" width="300" style="margin:4px">`).join('')}</p>`,
    b.render?.mainQa?.images ? `<h3>主图自动检查</h3>${li(b.render.mainQa.images.map((q) => `${q.n === 1 ? 'A' : 'B'}：白底 ${q.whiteBg ? 'OK' : 'NG'}／文字 ${q.hasText ? '有' : '无'}／Logo ${q.hasLogo ? '有' : '无'}／多余小物 ${q.extraProps ? '有' : '无'}／占比 ${e(q.productRatio)} ${e(q.note)}`))}` : ''].join('\n');
}
async function review(p) {
  const b = brief(p); if (!b.render) throw new Error('render 無し'); const rf = path.join(OUT, p.handle, 'review.json');
  if (fs.existsSync(rf) && !args.force) { log('review あり', J(rf).adminUrl); return; }
  const ex = await gql(`query($q:String){ products(first:5, query:$q){ nodes{ id title status tags } } }`, { q: `tag:amazon-review` });
  const exists = ex.products.nodes.find((x) => x.tags.includes(`amazon-src:${p.handle}`)); if (exists && !args.force) { W(rf, { id: exists.id, adminUrl: adminUrl(exists.id), reused: true }); log('既存の審査商品', adminUrl(exists.id)); return; }
  if (args.dry) { log('dry', p.handle.slice(0, 30), '→ 【Amazon審査】', b.render.A.length, '+', b.render.B.length, '枚'); return; }
  const id = String(p.id).split('/').pop(); const files = [...b.render.A.map((x) => ['A', x]), ...b.render.B.map((x) => ['B', x])];
  const media = []; for (const [set, x] of files) media.push({ originalSource: await upload(path.join(OUT, p.handle, x.file), `amz-${id}-${set.toLowerCase()}-${pad(x.n)}.jpg`), mediaContentType: 'IMAGE', alt: `${set}案 ${pad(x.n)} ${SLIDE_ZH[x.key]}` });
  // 画像は A 案 7 枚が先頭（1 枚目＝A 主图）。B 案 7 枚は 8 枚目以降（アプリに write_files が無いので、説明文の <img> 用に商品メディアに置く）
  const d = await gql(`mutation($p:ProductCreateInput!, $m:[CreateMediaInput!]){ productCreate(product:$p, media:$m){ product{ id handle variants(first:1){ nodes{ id } } } userErrors{ field message } } }`, { p: { title: `【Amazon審査】${p.title}`, vendor: 'ANET', productType: p.productType, status: 'DRAFT', tags: ['amazon-review', `amazon-src:${p.handle}`], descriptionHtml: summaryHtml(p, b, []) }, m: media });
  if (ue(d.productCreate)) throw new Error(ue(d.productCreate)); const prod = d.productCreate.product;
  W(rf, { id: prod.id, handle: prod.handle, adminUrl: adminUrl(prod.id), createdAt: new Date().toISOString() });
  // メディア処理待ち → B 案 URL で説明文を更新。価格＝Amazon 想定価格（SKU は付けない：卸同期・比較の対象外）
  let urls = []; for (let i = 0; i < 40; i++) { await sleep(3000); const m = await gql(`query($id:ID!){ product(id:$id){ media(first:20){ nodes{ alt status ... on MediaImage{ image{ url } } } } } }`, { id: prod.id }); const ns = m.product.media.nodes; if (ns.some((x) => x.status === 'FAILED')) throw new Error('media FAILED'); if (ns.length >= media.length && ns.every((x) => x.status === 'READY')) { urls = ns.filter((x) => /^B案/.test(x.alt ?? '')).map((x) => x.image.url); break; } }
  if (!urls.length) log('warn: B 案 URL 未取得（処理待ちタイムアウト）');
  const u = await gql(`mutation($p:ProductUpdateInput!){ productUpdate(product:$p){ userErrors{ message } } }`, { p: { id: prod.id, descriptionHtml: summaryHtml(p, b, urls) } }); if (ue(u.productUpdate)) throw new Error(ue(u.productUpdate));
  const v = await gql(`mutation($pid:ID!, $v:[ProductVariantsBulkInput!]!){ productVariantsBulkUpdate(productId:$pid, variants:$v){ userErrors{ message } } }`, { pid: prod.id, v: [{ id: prod.variants.nodes[0].id, price: String(p.amazon.price) }] }); if (ue(v.productVariantsBulkUpdate)) log('price warn', ue(v.productVariantsBulkUpdate));
  const pub = await gql(`query($id:ID!){ product(id:$id){ status resourcePublicationsV2(first:10){ nodes{ publication{ name } } } } }`, { id: prod.id });
  W(rf, { ...J(rf), bImages: urls.length, status: pub.product.status, publications: pub.product.resourcePublicationsV2.nodes.map((x) => x.publication.name) });
  log('review', adminUrl(prod.id), pub.product.status, 'publications', pub.product.resourcePublicationsV2.nodes.length);
}

// ================= 7. watch（dry-run：在庫ファイルを作るだけ）=================
async function watch() {
  const d = await gql(`{ products(first:100, query:"tag:amazon-review"){ nodes{ id title status tags media(first:20){ nodes{ alt ... on MediaImage{ image{ url } } } } } } }`);
  const approved = [], redo = [], waiting = [], listed = [];
  for (const r of d.products.nodes) { if (!r.tags.includes('amazon-review')) continue; const src = r.tags.find((t) => t.startsWith('amazon-src:'))?.slice(11); const set = r.tags.includes('amazon-approved-a') ? 'A' : r.tags.includes('amazon-approved-b') ? 'B' : null; const x = { review: r, src, set };
    if (r.tags.includes('amazon-listed')) listed.push(x); else if (r.tags.includes('amazon-redo')) redo.push(x); else if (set) approved.push(x); else waiting.push(x); }
  log(`承認 ${approved.length} / やり直し ${redo.length} / 未判断 ${waiting.length} / 出品済 ${listed.length}`);
  for (const x of redo) log('  redo（スキップ）', x.src, adminUrl(x.review.id));
  if (args['mark-listed']) { // Seller Central で処理成功を確認したものだけ
    const want = new Set(String(args.handles ?? '').split(',').filter(Boolean)); if (!want.size) throw new Error('--handles を指定');
    for (const x of approved.filter((y) => want.has(y.src))) { const m = await gql(`mutation($id:ID!){ a:tagsAdd(id:$id, tags:["amazon-listed"]){ userErrors{ message } } r:tagsRemove(id:$id, tags:["amazon-approved-a","amazon-approved-b"]){ userErrors{ message } } }`, { id: x.review.id }); log('listed', x.src, ue(m.a) || ue(m.r) || 'ok'); }
    return;
  }
  const dir = path.join(OUT, 'watch'); const items = [];
  for (const x of approved) {
    const q = await gql(`query($h:String!){ productByHandle(handle:$h){ id handle title description productType tags status vendor options{ name values } variants(first:50){ nodes{ id title price compareAtPrice sku selectedOptions{ name value } } } } }`, { h: x.src });
    const p = q.productByHandle; if (!p || p.vendor !== 'ANET') { log('skip（原商品なし/ANET 以外）', x.src); continue; }
    const imgs = x.review.media.nodes.filter((m) => m.alt?.startsWith(`${x.set}案`)).map((m) => m.image.url);
    if (imgs.length < 7) { log('skip（画像不足）', x.src, imgs.length); continue; }
    items.push({ ...p, media: { nodes: imgs.map((url) => ({ image: { url } })) } }); log('approved', x.set, x.src);
  }
  W(path.join(dir, 'report.json'), { at: new Date().toISOString(), approved: approved.map((x) => ({ src: x.src, set: x.set, review: adminUrl(x.review.id) })), redo: redo.map((x) => ({ src: x.src, review: adminUrl(x.review.id) })), waiting: waiting.length, listed: listed.length });
  if (!items.length) { log('承認済みなし → 在庫ファイルは作らない'); return; }
  W(path.join(dir, 'products.json'), items);
  // 既存の在庫ファイル生成（ブランド SARADEMUNT・出品者出荷・配送パターン「全国送料無料」・価格 amazonPrice()）を別ディレクトリで実行
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/amazon-listing/build-inventory-file.mjs'), 'build', '--products', path.join(dir, 'products.json'), '--out', dir], { encoding: 'utf8', stdio: 'inherit' });
  if (r.status !== 0) throw new Error('build-inventory-file 失敗');
  log(`dry-run：${path.relative(ROOT, dir)}/inventory-*.tsv を作成。Amazon へのアップロードはしていない。処理成功を確認したら watch --mark-listed --handles …`);
}

// ---------- CLI ----------
const run = { pick, compete: () => each(compete), teardown: () => each(teardown), reviews: () => each(reviews), render: () => each(render), review: () => each(review), watch,
  all: async () => { await pick(); for (const s of [compete, teardown, reviews, render]) await each(s); } };
if (!run[stage]) { console.error('usage: pick | compete | teardown | reviews | render | review [--dry] | watch [--mark-listed --handles …] | all   (--handle h / --force / --cdp url)'); process.exit(2); }
// CDP ブラウザは自分のタブだけ閉じる（ウィンドウ・ブラウザは閉じない）。最後は process.exit
Promise.resolve(run[stage]()).then(async () => { if (BR) await BR.page.close().catch(() => {}); log('done', stage); process.exit(process.exitCode ?? 0); }, async (e) => { console.error(e); if (BR) await BR.page.close().catch(() => {}); process.exit(1); });
