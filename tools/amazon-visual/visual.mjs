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
 *   node tools/amazon-visual/visual.mjs check                 # 鉄則の自己点検（主图 2000px・外周純白・商品長辺 ≈85%・後付け文字/小物なし、副图の数字の出典・禁止語）→ brief.check
 *   node tools/amazon-visual/visual.mjs publish [--dry]       # 合格＋approved.txt の原商品の画像を A 案 7 枚に（旧画像は media-backup.json、pipeline.mjs rollback で戻せる）＋ tag amazon-pick
 *   node tools/amazon-visual/visual.mjs collection            # 自動集合「Amazon おすすめ」（amazon-osusume、tag=amazon-pick）→ Online Store + Headless
 *   node tools/amazon-visual/visual.mjs listing               # Amazon 出品データ（SARADEMUNT 商品名・箇条書き 5・説明・キーワード・amazonPrice）→ out/<h>/amazon-listing.json + docs/amazon-visual/<h>.md ＋ 在庫ファイル dry-run
 *   node tools/amazon-visual/visual.mjs all                   # pick〜render
 * 全商品（lite＝竞品調査なし、自社の事実だけ。Amazon ページは読まない）：
 *   node tools/amazon-visual/visual.mjs pick --all            # ACTIVE・日文站在售・IP 除外・原図≥2 → out/set-all.json ＋原図 DL
 *   node tools/amazon-visual/visual.mjs bulk --set all --conc 3 [--from 0 --limit 100]
 *        # 試点と同じ：compete（Amazon、直列）→ teardown → reviews → render → check → listing。anetmc・Amazon には書かない
 *        # 竞品が取れない／CAPTCHA の商品は lite（自社の事実だけ）に落とす。CAPTCHA は突破しない（--full-retry で後でやり直し）。失敗 2% 超で停止
 *   node tools/amazon-visual/visual.mjs publish --set all     # approved.txt（用户が認めた分）＋合格 → A 案 7 枚を anetmc に（tag amazon-ready）
 *   node tools/amazon-visual/visual.mjs publish-passed --set all   # 既に生成済みの合格分をまとめて公開（同上）
 *   bulk … --publish                                          # 用户 2026-10-20「合格的全部直接换」：合格分を approved.txt に追記してその場で公開
 *   node tools/amazon-visual/visual.mjs sheet --set all       # 12 商品/枚の一覧 → docs/amazon-visual/all/sheet-NNN.jpg
 *   node tools/amazon-visual/visual.mjs status --set all      # 進捗・合格数・不合格理由 → docs/amazon-visual/all-status.md
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
// 日本語の改行位置：Intl.Segmenter の単語を文節っぽくまとめ、まとまりの間にだけ <wbr>（CSS は word-break:keep-all）
const SEG = new Intl.Segmenter('ja', { granularity: 'word' });
const kind = (w) => /^[ァ-ヺー]+$/.test(w) ? 'K' : /^[一-龯々〆]+$/.test(w) ? 'C' : /^[ぁ-ゖー]+$/.test(w) ? 'H' : /^[0-9A-Za-z.%]+$/.test(w) ? 'N' : /^[\s、。・，．）」』】〕！？!?:：/／〜~×]+$/.test(w) ? 'P' : 'M';
function jaPhrases(t) {
  const g = []; let pk = null;
  for (const { segment: w } of SEG.segment(t)) {
    const k = kind(w); const prev = g[g.length - 1];
    const glue = prev !== undefined && !/^[ごお]$/.test(w) && ((k === pk && (k === 'K' || k === 'C' || k === 'N')) || k === 'H' && (pk !== 'H' || w.length === 1) || k === 'P' || (k === 'C' && w.length === 1 && (pk === 'M' || pk === 'C')) || /^[ごお]$/.test(prev) || /[（「『【〔(]$/.test(prev) || /[0-9×〜~]$/.test(prev) || (k === 'N' && pk === 'P'));
    if (glue) g[g.length - 1] += w; else g.push(w); pk = k;
  }
  return g;
}
const jw = (s) => String(s ?? '').split(/<br\s*\/?>/).map((p) => jaPhrases(p).map((x) => esc(x)).join('<wbr>')).join('<br>');
const yen = (s) => Number(String(s ?? '').replace(/[^0-9]/g, '')) || null;
const starOf = (s) => Number((String(s).match(/(?:うち|中)\s*([0-9.]+)/) || String(s).match(/([0-9.]+)/) || [])[1]) || null; // 「5つ星のうち4.0」「星5つ中4つ」
// 他社ブランド・IP（kjyf-b2b/compare-ja.mjs と同じ）
const HOLD_RE = /W杯|ワールドカップ|世界杯|日本代表|FIFA|サッカー日本|オリンピック|五輪|ディズニー|Disney|サンリオ|Sanrio|キティ|Hello ?Kitty|ポケモン|Pokemon|ちいかわ|スヌーピー|ドラえもん|ミッキー|ジブリ|ナイキ|NIKE|アディダス|adidas|ルイ.?ヴィトン|LOUIS ?VUITTON|シャネル|CHANEL|グッチ|GUCCI|エルメス|HERMES|ロレックス|ダイソン|Dyson|iPhone|Apple|Galaxy|Switch|任天堂|ニンテンドー|PlayStation|SONY|ソニー|パナソニック|Panasonic|シャープ|SHARP|無印|ユニクロ|UNIQLO|ANKER|アンカー/i;
// 画像の訴求に使わない注意書き（顧慮への答えにならない）
const CAUTION_RE = /NG|ご注意|しないで|しない(?:で|こと)|避け|不可|禁止/;
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
let pyN = 0;
function py(cmd, jobs) { if (!jobs.length) return; const f = path.join(OUT, `_jobs-${cmd}-${process.pid}-${++pyN}.json`); fs.writeFileSync(f, JSON.stringify(jobs)); const r = spawnSync(PY, [path.join(ROOT, 'tools/product-images/imgtool.py'), cmd, f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 }); fs.unlinkSync(f); if (r.status !== 0) throw new Error(`imgtool ${cmd} failed`); }
// CDN の一時的な 5xx/429/通信エラーは 3 回まで再試行
async function download(url, file) { if (fs.existsSync(file)) return file; let r; for (let k = 1; ; k++) { r = await fetch(url).catch((e) => ({ ok: false, status: e.message })); if (r.ok || k >= 4 || !(r.status >= 500 || r.status === 429 || typeof r.status === 'string')) break; await sleep(2000 * k); } if (!r.ok) throw new Error(`img ${r.status} ${url.slice(0, 80)}`); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return file; }

// ---------- 対象 ----------
const PILOT = path.join(OUT, 'pilot.json');
const pdir = (p, ...sub) => { const d = path.join(OUT, p.handle, ...sub); fs.mkdirSync(d, { recursive: true }); return d; };
const briefF = (p) => path.join(OUT, p.handle, 'brief.json');
const brief = (p) => (fs.existsSync(briefF(p)) ? J(briefF(p)) : { handle: p.handle, title: p.title });
const saveBrief = (p, b) => W(briefF(p), b);
// --set all：全商品（out/set-all.json、pick --all で作る）。--from N --limit M でバッチ。lite＝竞品調査なし（自社の事実だけで Amazon 規格の画像・出品データ）
const SETF = () => (args.set ? path.join(OUT, `set-${args.set}.json`) : PILOT);
// 全商品も試点と同じ完全 SOP（竞品・評論・A/B）。竞品が取れない（CAPTCHA／竞品 3 件未満／レビュー 5 件未満）商品だけ brief.lite に理由を残して lite に落とす
const lite = (p) => Boolean(args.lite || brief(p).lite);
let amazonBlocked = false; let bLock = Promise.resolve();
const withBrowser = (fn) => { const r = bLock.then(fn); bLock = r.catch(() => {}); return r; }; // CDP のタブは 1 つ → ブラウザを使う段だけ直列
function pilot() { const f = SETF(); if (!fs.existsSync(f)) throw new Error(`${path.relative(ROOT, f)} が無い：先に pick${args.set ? ' --all' : ''}`); let ps = J(f).items; if (args.handle) ps = ps.filter((p) => p.handle === args.handle); const from = Number(args.from ?? 0); return ps.slice(from, args.limit ? from + Number(args.limit) : undefined); }
// --conc N：並列数（ブラウザを使う段は 1）。失敗が 2% を超えたら止める（最低 2 件までは続行）
async function each(fn, name = stage) {
  const ps = pilot(); let ok = 0, i = 0, stop = false, winStop = false; const errs = []; const max = Math.max(2, Math.floor(ps.length * 0.02));
  const worker = async () => { while (!stop && i < ps.length) { const p = ps[i++]; try { await fn(p); ok++; } catch (e) { log('ERR', p.handle.slice(0, 30), e.message); errs.push({ handle: p.handle, err: e.message.slice(0, 300) }); if (/WINDOW_CLOSED/.test(e.message)) { stop = true; winStop = true; errs.pop(); log('時間帯終了 → 停止（失敗扱いにしない）'); continue; } if (/BLOCKED/.test(e.message) && name !== 'bulk') stop = true; if (errs.length > max) { stop = true; log(`失敗 ${errs.length} 件 > 2%（${max}）→ 停止`); } } } };
  await Promise.all(Array.from({ length: Math.max(1, Number(args.conc ?? 1)) }, worker));
  log(`${name}: ok ${ok} / ${ps.length}`); if (errs.length) { W(path.join(OUT, `errors-${name}${args.set ? `-${args.set}` : ''}.json`), { at: new Date().toISOString(), errs }); process.exitCode = 1; }
  if (stop && !winStop) throw new Error(`${name} 停止（失敗 ${errs.length}）`);
}

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
  if (args.all) return pickAll();
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
// 全商品（2026-10-20 用户「把所有产品修改成amazon可上架模式」）：ACTIVE・日文站在售・他社ブランド/IP 除外・原図 2 枚以上 → out/set-all.json（lite）
async function pickAll() {
  args.set = 'all'; const f = SETF();
  if (fs.existsSync(f) && !args.force) { log('set-all.json あり（--force で選び直し）'); return downloadOwn(); }
  const ja = J(path.join(ROOT, 'tools/kjyf-b2b/out/ja-full.json')); const onSku = new Map(); for (const g of ja.on) for (const s of g.skus) onSku.set(K(s.out_id), g);
  const all = []; let c = null;
  for (;;) { const d = await gql(`query($c:String){ products(first:50, after:$c, query:"vendor:ANET status:active"){ pageInfo{hasNextPage endCursor} nodes{ id handle title productType description tags options{ name values } variants(first:50){ nodes{ id title sku price compareAtPrice selectedOptions{ name value } } } media(first:20){ nodes{ ... on MediaImage{ image{ url width height } } } } } } }`, { c }); all.push(...d.products.nodes); if (!d.products.pageInfo.hasNextPage) break; c = d.products.pageInfo.endCursor; }
  const items = [], skipped = [];
  for (const p of all) {
    const imgs = p.media.nodes.filter((m) => m.image?.url).map((m) => m.image.url); const g = p.variants.nodes.map((v) => onSku.get(K(v.sku))).find(Boolean);
    const why = p.title.startsWith('【Amazon審査】') ? '審査用 DRAFT' : HOLD_RE.test(`${p.title} ${p.description} ${g?.title ?? ''}`) ? '他社ブランド/IP' : !g ? '日文站に無い' : imgs.length < 2 ? `原図 ${imgs.length} 枚` : null;
    if (why) { skipped.push({ handle: p.handle, title: p.title, why }); continue; }
    const price = Math.min(...p.variants.nodes.map((v) => Number(v.price))); const cat = categorize(p);
    items.push({ handle: p.handle, id: p.id, title: p.title, productType: p.productType, price, amazon: { type: cat.feed_product_type, ...amazonPrice(price, cat.feed_product_type) }, options: p.options, variants: p.variants.nodes, images: imgs, description: p.description,
      ja: { good_id: g.good_id, title: g.title, sub_title: g.sub_title, desc: text(g.desc), skus: g.skus, fetchedAt: ja.fetchedAt } });
  }
  items.sort((a, z) => String(a.productType).localeCompare(String(z.productType)) || a.handle.localeCompare(z.handle)); // 分類ごとにバッチを切りやすく
  W(f, { at: new Date().toISOString(), rule: 'ACTIVE・日文站在售・他社ブランド/IP 除外・原図≥2（試点と同じ SOP、竞品が取れない商品は lite）', items, skipped });
  log('pick --all', items.length, '件', 'skip', skipped.length, Object.entries(skipped.reduce((a, x) => ((a[x.why] = (a[x.why] ?? 0) + 1), a), {})).map(([k, v]) => `${k} ${v}`).join(' / '));
  return downloadOwn();
}
async function downloadOwn() {
  for (const p of pilot()) { if (fs.existsSync(path.join(OUT, p.handle, 'thumbs', `${pad(p.images.length)}.jpg`))) continue; const jobs = []; for (const [i, u] of p.images.entries()) { const f = await download(u, path.join(pdir(p, 'src'), `${pad(i + 1)}.jpg`)); const t = path.join(pdir(p, 'thumbs'), `${pad(i + 1)}.jpg`); if (!fs.existsSync(t)) jobs.push({ src: f, out: t, max: 768 }); } py('thumbs', jobs); }
}

// ================= 2. compete =================
// Amazon 出品カテゴリ → ランキングのカテゴリ（research.mjs CATS）
const CAT_KEY = { Home: 'home', HomeFurnitureAndDecor: 'home', Lighting: 'home', Kitchen: 'kitchen', Luggage: 'luggage', Jewelry: 'jewelry', Watch: 'watch', Toys: 'toys', Beauty: 'beauty', HealthAndPersonalCare: 'hpc', Automotive: 'automotive', Clothing: 'fashion', Tools: 'diy', CE: 'electronics', Grocery: 'grocery', SportingGoods: 'sports' };
async function catLists(key = 'luggage') {
  const f = path.join(OUT, key === 'luggage' ? '_lists.json' : `_lists-${key}.json`); if (fs.existsSync(f) && !args['force-lists']) return J(f);
  const c = CATS[key] ?? CATS.home; const items = new Map();
  for (const [kind, url] of Object.entries(listUrls(c))) { if (kind === 'movers') continue; const page = await visit(url); for (let y = 0; y < 6; y++) { await page.mouse.wheel(0, 1500); await sleep(500); } for (const g of await readList(page)) if (!items.has(g.asin)) items.set(g.asin, { ...g, source: kind }); log('list', kind, items.size); }
  const out = { at: new Date().toISOString(), category: c.name, items: [...items.values()] }; W(f, out); return out;
}
async function compete(p) {
  const b = brief(p);
  if (b.competitors?.length && !args.force) { // 竞品は決定済み。レビュー本文を取れていない詳細（2026-10 の DOM 変更前に取ったもの）だけ取り直す
    for (const c of b.competitors) { const f = path.join(OUT, p.handle, 'comp', `${c.asin}.json`); const old = J(f); if (old.rv === 2) continue; const page = await visit(`https://www.amazon.co.jp/dp/${c.asin}?th=1&psc=1`); const d = await readDetail(page); W(f, { ...old, ...d, rv: 2, fetchedAt: new Date().toISOString() }); log('refetch', c.asin, d.images.length, 'img', d.reviews.filter((r) => r.body).length, 'rev'); }
    return;
  }
  if (!b.keywords || (lite(p) && args.force)) {
    const j = await chatJson([{ role: 'system', content: 'あなたは Amazon.co.jp の検索担当です。商品について、日本の買い手が Amazon で実際に検索する核心キーワードを 2〜4 個（型番・誇張語・色名を除く、短い日本語の組み合わせ）と、版型（形・サイズ感）・客群を答えます。JSON: {"keywords":["…"],"form":"版型 15字","segment":"客群 15字"}' }, { role: 'user', content: `商品名: ${p.title}\n卸の商品名: ${p.ja?.title ?? ''}\n説明: ${(p.ja?.desc || p.description).slice(0, 800)}` }], { maxTokens: 800 });
    b.keywords = (j.keywords ?? []).slice(0, 4); b.form = j.form; b.segment = j.segment; saveBrief(p, b);
  }
  if (lite(p)) return; // lite：キーワード・版型・客群だけ（出品データ用）。Amazon ページは読まない
  const lists = await catLists(CAT_KEY[p.amazon?.type] ?? 'home'); const cand = new Map();
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
  const b = brief(p); if (!lite(p) && !b.competitors?.length) throw new Error('competitors 無し：先に compete');
  if (!ownClassify(p) || args.force) { const th = pdir(p, 'thumbs'); const files = fs.readdirSync(th).filter((f) => f.endsWith('.jpg')).sort().map((f) => path.join(th, f)); W(path.join(OUT, p.handle, 'own.json'), { images: await visionBatch(OWN_SYS, files, `商品名: ${p.title}`) }); log('own classified', files.length); }
  if (lite(p) || (b.gaps?.length && !args.force)) return;
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
- concern の worry と points は同じ話題であること（例: 縫製が心配 → 縫製・補強についての fact が必要）。無関係な fact（素材名・ファスナー付き 等）で答えたことにしない。該当 fact が無い顧慮は unanswered へ。
- concern の headline は顧慮に正面から答える肯定的な言い方（「〜NG」「ご注意」「〜しないで」のような注意書きは不可）。facts で正面から答えられない顧慮は concern に使わず、代わりに需求（容量・サイズ・軽さ等）の具体的な証拠を見せる。
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
  const b = brief(p); const L = lite(p); if (!L && !b.competitors?.length) throw new Error('competitors 無し'); if (!ownClassify(p)) throw new Error('own.json 無し：先に teardown'); if (b.plan && !args.force) return;
  // 4-1 事実
  // facts の ID は plan-override から参照されるので --force では作り直さない（--refacts で作り直す）
  if (!b.facts || args.refacts) { const r = await facts(p); b.facts = r.facts; b.factsDropped = r.dropped.map((f) => `${f.k}: ${f.v}（${f.src}）`); saveBrief(p, b); log('facts', b.facts.length, 'dropped', r.dropped.length); }
  // 4-2 レビュー（商品ページの上位レビュー。★別の一覧ページはログインが要るので使わない）
  let low = [], high = [], T = [];
  if (!L) {
  const revs = []; for (const c of b.competitors) { const d = J(path.join(OUT, p.handle, 'comp', `${c.asin}.json`)); for (const r of d.reviews ?? []) if (r.body) revs.push({ asin: c.asin, star: starOf(r.star), title: r.title, body: r.body }); }
  low = revs.filter((r) => r.star && r.star <= 3); high = revs.filter((r) => r.star && r.star >= 4); const use = [...low, ...high];
  if (use.length < 5) throw new Error(`レビューが ${use.length} 件しか取れない`);
  const rj = await chatJson([{ role: 'system', content: REV_SYS }, { role: 'user', content: use.map((r, i) => `#${i} ★${r.star} ${r.title} — ${r.body.slice(0, 300)}`).join('\n') }], { maxTokens: 5000 });
  const topics = (rj.topics ?? []).map((t) => ({ ...t, count: 0, asins: new Set(), examples: [] }));
  for (const l of rj.labels ?? []) { const r = use[l.i]; if (!r) continue; for (const id of l.topics ?? []) { const t = topics.find((x) => x.id === id); if (!t) continue; if ((t.type === 'concern') !== (r.star <= 3)) continue; t.count++; t.asins.add(r.asin); if (t.examples.length < 2) t.examples.push(`★${r.star} ${r.title}`.slice(0, 60)); } }
  T = topics.filter((t) => t.count > 0).map((t) => ({ ...t, asins: [...t.asins] })).sort((a, z) => z.count - a.count);
  }
  // 4-3 plan
  const own = ownClassify(p).images;
  const pj = await chatJson([{ role: 'system', content: PLAN_SYS }, { role: 'user', content: `商品: ${p.title}\n客群: ${b.segment}\n${L ? '\n（竞品調査なし：concern1/concern2 は顧慮への回答ではなく、商品の細部・構造・機能を facts で見せる。worry は空にする。answers・unanswered は空でよい）\n' : ''}\n顧慮（差評 ${low.length} 件から、件数順）:\n${T.filter((t) => t.type === 'concern').map((t) => `${t.id} ${t.ja}（${t.label}） ${t.count}件`).join('\n') || 'なし'}\n\n需求（好評 ${high.length} 件から）:\n${T.filter((t) => t.type === 'need').map((t) => `${t.id} ${t.ja}（${t.label}） ${t.count}件`).join('\n')}\n\n竞品画像の空白:\n${(b.gaps ?? []).map((g) => `- ${g.observation} → ${g.ours}（原図 ${g.useImages?.join(',')}）`).join('\n')}\n\nfacts:\n${b.facts.filter((f) => !/注意|ブランド|商品番号|型番|品番/.test(f.k)).map((f) => `${f.id} ${f.k}: ${f.v}`).join('\n')}\n\n自社原図:\n${own.map((x) => `${x.n}. ${x.kind} ${x.angle} ${x.hasText ? '文字あり' : '文字なし'} ${x.hasPerson ? '人物' : ''} ${x.hasBrandLogo ? '他社ロゴ' : ''} ${x.caption}`).join('\n')}` }], { maxTokens: 5000 });
  // 人が直した内容（out/<h>/plan-override.json：slides の一部・unanswered）を重ねてから同じ検証にかける
  const ovF = path.join(OUT, p.handle, 'plan-override.json'); if (fs.existsSync(ovF)) { const ov = J(ovF); pj.slides = { ...(pj.slides ?? {}), ...(ov.slides ?? {}) }; const tid = (o) => ({ ...o, topic: o.topic ?? T.find((t) => o.topicLike && t.label.includes(o.topicLike))?.id ?? o.topicLike }); if (ov.answers) pj.answers = [...(pj.answers ?? []).filter((a) => !ov.answers.some((o) => o.slide === a.slide)), ...ov.answers.map(tid)]; if (ov.unanswered) { const un = ov.unanswered.map(tid); pj.unanswered = [...(pj.unanswered ?? []).filter((u) => !un.some((x) => x.topic === u.topic)), ...un]; pj.answers = (pj.answers ?? []).filter((a) => !un.some((x) => x.topic === a.topic)); } log('plan-override 適用', Object.keys(ov.slides ?? {}).join(',')); }
  const v = validatePlan(pj, b.facts, own); await verifyClaims(v, b.facts);
  const answeredBy = (t) => (v.answers ?? []).filter((a) => a.topic === t.id && a.factIds?.length).map((a) => ({ slide: a.slide, factIds: a.factIds }));
  b.concerns = T.filter((t) => t.type === 'concern').map((t) => ({ id: t.id, topic: t.label, ja: t.ja, count: t.count, asins: t.asins, examples: t.examples, answeredBy: answeredBy(t) }));
  b.needs = T.filter((t) => t.type === 'need').map((t) => ({ id: t.id, topic: t.label, ja: t.ja, count: t.count, asins: t.asins, examples: t.examples, answeredBy: answeredBy(t) }));
  const answered = new Set(b.concerns.filter((c) => c.answeredBy.length).map((c) => c.id));
  b.unanswered = [...(v.unanswered ?? []).filter((u) => !answered.has(u.topic)).map((u) => ({ ...u, topic: T.find((t) => t.id === u.topic)?.label ?? u.topic })), ...b.concerns.filter((c) => !c.answeredBy.length && !(v.unanswered ?? []).some((u) => u.topic === c.id)).map((c) => ({ topic: c.topic, why: '自家事实里没有可回答的数据' }))];
  b.reviewsUsed = { low: low.length, high: high.length, note: L ? 'lite：未做竞品调查（只用自家事实）' : '竞品商品页上的上位评论（按星级的评论列表需要登录，未使用）' };
  b.plan = { mainA: v.mainA, mainB: v.mainB, slides: v.slides, removed: v.removed, logoWarn: v.logoWarn, raw: v.raw,
    A: ['main', 'value', 'concern1', 'concern2', 'size', 'scene', 'set'], B: ['main', 'valueB', 'scene', 'concern1', 'concern2', 'size', 'set'] };
  b.tests = b.tests ?? [];
  saveBrief(p, b); log('plan', p.handle.slice(0, 30), 'concerns', b.concerns.length, 'needs', b.needs.length, 'unanswered', b.unanswered.length, 'removed', v.removed.length);
}
// 6kpro でもう一度：各テキストが引用した fact で本当に裏づけられているか（誇張・無関係な fact での「回答」を落とす）
async function verifyClaims(v, facts) {
  const byId = Object.fromEntries(facts.map((f) => [f.id, f])); const items = [];
  for (const [k, s] of Object.entries(v.slides)) { const ids = [...new Set([...(s.points ?? []), ...(s.rows ?? []), ...(s.items ?? []), ...(s.notes ?? [])].flatMap((x) => x.factIds ?? []))];
    if (s.headline) items.push({ k, f: 'headline', t: s.headline, ids, worry: s.worry }); if (s.sub) items.push({ k, f: 'sub', t: s.sub, ids, worry: s.worry }); for (const [arr, f] of [['points', 't'], ['rows', 'v'], ['items', 't'], ['notes', 't']]) (s[arr] ?? []).forEach((x, i) => items.push({ k, f: `${arr}.${i}`, t: x[f], ids: x.factIds ?? [], worry: s.worry })); }
  const j = await chatJson([{ role: 'system', content: '商品画像の文言チェック。各行の文言が、付いている根拠 fact の内容だけで言えるか判定する。誇張（抜群・しっかり・丈夫・安心 等で根拠が無い）、fact に無い機能（折りたたみ 等）、worry（顧慮）への答えになっていないのに答えたように見せる文言は ok=false。JSON: {"r":[{"i":番号,"ok":bool,"why":"中文 20 字"}]}' }, { role: 'user', content: `facts:\n${facts.map((f) => `${f.id} ${f.k}: ${f.v}`).join('\n')}\n\n文言:\n${items.map((x, i) => `#${i} [${x.k}${x.worry ? ` 顧慮「${x.worry}」` : ''}] ${x.t.replace(/<br>/g, '')}  根拠: ${x.ids.map((id) => `${id}=${byId[id]?.v ?? '?'}`).join(' / ') || 'なし'}`).join('\n')}` }], { maxTokens: 3000 }).catch(() => null);
  if (!j?.r) { v.removed.push('verifyClaims: 判定できず（未検証）'); return; }
  for (const r of j.r) { if (r.ok !== false) continue; const x = items[r.i]; if (!x) continue; const s = v.slides[x.k]; v.removed.push(`${x.k}.${x.f}: ${x.t}（裏づけ不足：${r.why ?? ''}）`);
    if (x.f === 'headline' || x.f === 'sub') s[x.f] = ''; else { const [arr, i] = x.f.split('.'); s[arr][Number(i)] = null; } }
  for (const s of Object.values(v.slides)) { for (const arr of ['points', 'rows', 'items', 'notes']) if (s[arr]) s[arr] = s[arr].filter(Boolean); if ('headline' in s && !s.headline) s.headline = (s.points ?? s.items ?? [])[0]?.t ?? (s.rows?.length ? 'サイズ・仕様' : ''); }
  if (v.slides.scene && !v.slides.scene.headline && v.slides.scene.sub) { v.slides.scene.headline = v.slides.scene.sub; v.slides.scene.sub = ''; }
  if (v.slides.set && !v.slides.set.items.length) v.slides.set.items = [{ t: '本体 ×1', factIds: [] }];
}
// 数字が facts に無い・NG 語を含むテキストは消す（コードで強制）
function validatePlan(pj, facts, own) {
  const removed = []; const byId = Object.fromEntries(facts.map((f) => [f.id, f])); const brands = facts.filter((f) => /ブランド/.test(f.k)).map((f) => String(f.v).replace(/^ブランド[:：\s]*/, '').trim()).filter((x) => x.length >= 3); const allNums = new Set(facts.flatMap((f) => nums(f.v)));
  const okText = (t, ids, where) => { if (!t) return ''; const s = String(t); if (NG_RE.test(s) || HOLD_RE.test(s) || CAUTION_RE.test(s) || brands.some((x) => s.includes(x)) || /ブランド/.test(s)) { removed.push(`${where}: ${s}（NG 語/注意書き）`); return ''; } const allowed = new Set((ids ?? []).flatMap((id) => nums(byId[id]?.v))); const bad = nums(s.replace(/<br>/g, '')).filter((n) => !allowed.has(n) && !allNums.has(n)); if (bad.length) { removed.push(`${where}: ${s}（数字 ${bad.join(',')} が facts に無い）`); return ''; } return s; };
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

function jpegSize(f) { const b = fs.readFileSync(f); for (let i = 2; i < b.length - 9;) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1], len = b.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }; i += 2 + len; } return { w: 1000, h: 1000 }; }
// シーン写真：人物・生活背景のある原図（scene/model）を使う。卸の文字は帯なら切り落とし、中ほどは周囲の色で塗る → 6kpro で残りを確認
async function sceneSource(p, b, own, work) {
  const want = b.plan.slides.scene?.img; const src = (n) => path.join(OUT, p.handle, 'src', `${pad(n)}.jpg`);
  const cands = own.filter((o) => ['scene', 'model'].includes(o.kind)).sort((a, z) => Number(z.n === want) - Number(a.n === want) || Number(a.hasText) - Number(z.hasText) || Number(z.kind === 'scene') - Number(a.kind === 'scene'));
  if (!cands.length) return { file: null, note: '原图里没有生活场景/着用图，场景页用了抠图（需要补拍或换图）' };
  const cf = path.join(work, 'scenefix.json'); const cache = fs.existsSync(cf) && !args.force ? J(cf) : {};
  for (const x of cands.slice(0, 4)) {
    if (!x.hasText) return { file: src(x.n), note: `原图 ${x.n}（无文字）` };
    const out = path.join(work, `scene-${pad(x.n)}.jpg`); let c = cache[x.n];
    if (!c) {
      const th = path.join(OUT, p.handle, 'thumbs', `${pad(x.n)}.jpg`);
      const r = await chatJson([{ role: 'system', content: '画像編集で後から載せた文字・図形（キャッチコピー・説明文・ラベル・ロゴ透かし・色名の帯・はめ込みの小画像）の領域を全部、矩形で返す。商品本体・服・看板など写真に写っている物の印字は含めない。座標は 0〜1。JSON: {"boxes":[[x0,y0,x1,y1]]}' }, { role: 'user', content: [{ type: 'image_url', image_url: { url: b64(th) } }] }], { model: VISION, maxTokens: 800 }).catch(() => ({ boxes: null }));
      const sz = jpegSize(th); const norm = (q) => { const m = Math.max(...q); if (m <= 1.0001) return q; const fit = q[0] <= sz.w && q[2] <= sz.w && q[1] <= sz.h && q[3] <= sz.h && m > 1000 === false && (q[2] > 1000 || q[3] > 1000 || sz.w !== 1000); return fit ? [q[0] / sz.w, q[1] / sz.h, q[2] / sz.w, q[3] / sz.h] : q.map((v) => v / 1000); }; // モデルが 0〜1 でなくピクセル/千分率で返すことがある
      const boxes = (r.boxes ?? []).filter(okBox).map(norm).filter(okBox).map((q) => [Math.max(0, q[0] - 0.02), Math.max(0, q[1] - 0.02), Math.min(1, q[2] + 0.02), Math.min(1, q[3] + 0.02)]);
      // 上下の帯にある文字は切り落とす（残す高さ 60% 以上のとき）。中ほどの文字は塗る
      // 上下・左右の端にある文字は帯ごと切り落とす（高さ 60%・幅 50% 以上残るとき）。中ほどの文字だけ塗る
      let y0 = 0, y1 = 1, x0 = 0, x1 = 1; for (const q of boxes) { if (q[3] <= 0.35) y0 = Math.max(y0, q[3]); else if (q[1] >= 0.65) y1 = Math.min(y1, q[1]); else if (q[0] >= 0.5) x1 = Math.min(x1, q[0]); else if (q[2] <= 0.5) x0 = Math.max(x0, q[2]); }
      if (y1 - y0 < 0.6) { y0 = 0; y1 = 1; } if (x1 - x0 < 0.5) { x0 = 0; x1 = 1; }
      const fill = boxes.filter((q) => !(q[3] <= y0 || q[1] >= y1 || q[2] <= x0 || q[0] >= x1)).map((q) => [(Math.max(q[0], x0) - x0) / (x1 - x0), (Math.max(q[1], y0) - y0) / (y1 - y0), (Math.min(q[2], x1) - x0) / (x1 - x0), (Math.min(q[3], y1) - y0) / (y1 - y0)]);
      py('scenefix', [{ src: src(x.n), out, boxes: fill.map((q) => [q[0] * (x1 - x0) + x0, q[1] * (y1 - y0) + y0, q[2] * (x1 - x0) + x0, q[3] * (y1 - y0) + y0]), band: [y0, y1], xband: [x0, x1] }]);
      const t = out.replace(/\.jpg$/, '-t.jpg'); py('thumbs', [{ src: out, out: t, max: 512 }]);
      const v = (await visionBatch('画像編集で後から載せた文字（説明文・キャッチコピー・色名ラベル・透かし）が残っているか。商品本体・服・看板など写真に写っている物の印字は除く。JSON: {"images":[{"n":1,"hasText":bool,"what":"20字"}]}', [t], 'シーン写真'))[0] ?? { hasText: true };
      c = cache[x.n] = { boxes: boxes.length, band: [y0, y1], xband: [x0, x1], filled: fill.length, left: !!v.hasText, what: v.what ?? '' }; W(cf, cache);
    }
    if (!c.left && fs.existsSync(out)) return { file: out, note: `原图 ${x.n}：${c.band[0] > 0 || c.band[1] < 1 || c.xband?.[0] > 0 || c.xband?.[1] < 1 ? `裁掉文字带(y ${c.band.map((v) => v.toFixed(2)).join('–')} / x ${(c.xband ?? [0, 1]).map((v) => v.toFixed(2)).join('–')})` : ''}${c.filled ? ` 色块盖住 ${c.filled} 处文字` : ''}` };
  }
  return { file: null, note: `场景原图（${cands.slice(0, 4).map((x) => x.n).join(',')}）的批发商文字去不干净，场景页暂用抠图——需要换图` };
}
// ================= 5. render =================
const PX = 1600, SCALE = 1.25; // CSS 1600px → 出力 2000px
function fontLinks() { const d = path.join(ROOT, 'node_modules/@fontsource/noto-sans-jp'); return ['400', '700', '900'].filter((w) => fs.existsSync(path.join(d, `${w}.css`))).map((w) => `<link rel="stylesheet" href="${pathToFileURL(path.join(d, `${w}.css`)).href}">`).join(''); }
// 配色は tools/brand-assets/product-cards.mjs の B（量販専門店風）
const TH = { bg: '#FFFFFF', panel: '#F4F4F4', ink: '#111111', sub: '#555555', accent: '#BF0000', line: '#E5E5E5' };
const page = (body) => `<!doctype html><html lang="ja"><head><meta charset="utf-8">${fontLinks()}<style>
*{box-sizing:border-box;margin:0;padding:0} html,body{width:${PX}px;height:${PX}px;overflow:hidden;background:${TH.bg}}
body{font-family:"Noto Sans JP",sans-serif;color:${TH.ink};font-feature-settings:"palt";letter-spacing:.02em;word-break:keep-all;overflow-wrap:normal;line-break:strict} .pt span{display:block;flex:1;min-width:0}
.wrap{position:relative;width:${PX}px;height:${PX}px} h1{font-weight:900;line-height:1.22;font-size:84px;letter-spacing:.02em}
.sub{font-size:36px;color:${TH.sub};margin-top:18px;font-weight:700} .chip{display:inline-block;background:${TH.accent};color:#fff;font-weight:700;font-size:32px;padding:.28em 1em;border-radius:4px}
.rule{height:8px;width:120px;background:${TH.accent};margin-top:26px} .panel{background:${TH.panel};border-radius:6px;overflow:hidden}
.pt{display:flex;align-items:center;gap:22px;font-size:44px;font-weight:900;padding:26px 30px;background:#fff;border:3px solid ${TH.line};border-radius:6px;line-height:1.3} .pt i{font-style:normal;color:${TH.accent};font-size:48px}
.ph{width:100%;height:100%;object-fit:cover;display:block} .ct{width:100%;height:100%;object-fit:contain;display:block}
</style></head><body><div class="wrap">${body}</div></body></html>`;
const furl = (f) => pathToFileURL(f).href;
async function renderHtml(shots) { // [{html, out, w?, h?, scale?}]
  const { chromium } = await import('playwright'); const br = await chromium.launch();
  try { for (const s of shots) { const f = s.out.replace(/\.jpg$/, '.html'); fs.writeFileSync(f, s.html); const pg = await br.newPage({ viewport: { width: s.w ?? PX, height: s.h ?? PX }, deviceScaleFactor: s.scale ?? SCALE }); await pg.goto(furl(f), { waitUntil: 'networkidle' }); await pg.evaluate(() => document.fonts.ready);
    // 文節の途中で折り返さない代わりに、はみ出す見出し・要点はフォントを 2px ずつ縮めて収める
    await pg.evaluate(() => { for (const el of document.querySelectorAll('h1, .pt span, .sub, .fit')) { let f = parseFloat(getComputedStyle(el).fontSize); while (el.scrollWidth > el.clientWidth + 1 && f > 24) { f -= 2; el.style.fontSize = `${f}px`; } } });
    await pg.screenshot({ path: s.out, type: 'jpeg', quality: 92 }); await pg.close(); fs.unlinkSync(f); } }
  finally { await br.close(); } // 自分で起動した headless Chromium だけ閉じる（CDP のブラウザではない）
}
const okBox = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === 'number') && b[2] > b[0] && b[3] > b[1];
// pipeline.mjs mainBox と同じ：文字入りなら mainBox ∩ cleanBox
function boxFor(x) { let b = okBox(x?.mainBox) ? [...x.mainBox] : null; if (x?.hasText && okBox(x.cleanBox)) { const c = x.cleanBox; const i = b ? [Math.max(b[0], c[0]), Math.max(b[1], c[1]), Math.min(b[2], c[2]), Math.min(b[3], c[3])] : c; if (i[2] - i[0] > 0.3 && i[3] - i[1] > 0.3) b = i; } if (!b || (b[2] - b[0] >= 0.97 && b[3] - b[1] >= 0.97)) return null; return b; }
const SLIDE_ZH = { main: '主图', value: '价值（需求最大点）', valueB: '价值（场景切入）', concern1: '顾虑回答①', concern2: '顾虑回答②', size: '尺寸/规格', scene: '使用场景', set: '套装内容/发货' };
async function render(p) {
  const b = brief(p); if (!b.plan) throw new Error('plan 無し：先に reviews'); const own = ownClassify(p).images; const byN = Object.fromEntries(own.map((x) => [x.n, x]));
  const A = pdir(p, 'a'), B = pdir(p, 'b'), work = pdir(p, 'work');
  if (args['main-b'] && args.handle) { const n = args['main-b'] === 'a' ? b.plan.mainA.img : Number(args['main-b']); b.plan.mainB = { img: n, why: args['main-b'] === 'a' ? 'B 案主图原图不合规（含非附带小物），改用与 A 相同的主图；A/B 只比较副图顺序' : '手动指定' }; saveBrief(p, b); }
  if (fs.existsSync(path.join(B, '07.jpg')) && fs.existsSync(path.join(OUT, p.handle, 'preview.jpg')) && !args.force) return;
  const src = (n) => path.join(OUT, p.handle, 'src', `${pad(n)}.jpg`);
  // 切り抜き（rembg、主图 A/B 用）
  const cut = (n) => path.join(work, `cut-${pad(n)}.png`); const jobs = [];
  for (const n of new Set([b.plan.mainA.img, b.plan.mainB.img])) if (!fs.existsSync(cut(n)) || args.force) jobs.push({ src: src(n), out: cut(n), box: boxFor(byN[n]) });
  py('cutout', jobs);
  // 副图の写真：文字入りの原図は cleanBox で切る。切れなければ切り抜きで代用
  const crops = [], used = new Set(); let badCrops = new Set();
  const photo = (n) => { const x = byN[n]; if (!x) return null; if (!x.hasText) return src(n); if (!okBox(x.cleanBox) || (x.cleanBox[2] - x.cleanBox[0]) * (x.cleanBox[3] - x.cleanBox[1]) < 0.25) return null; const o = path.join(work, `crop-${pad(n)}.jpg`); if (badCrops.has(o)) return null; used.add(o); if ((!fs.existsSync(o) || args.force) && !crops.some((c) => c.out === o)) crops.push({ src: src(n), out: o, box: x.cleanBox }); return o; };
  const S = b.plan.slides; const cutA = cut(b.plan.mainA.img), cutB = cut(b.plan.mainB.img);
  const sc = await sceneSource(p, b, own, work); const sceneF = sc.file; b.sceneNote = sc.note;
  const imgOr = (n, fallbackCut) => { const f = n ? photo(n) : null; return f ? `<img class="ph" src="${furl(f)}">` : `<div style="width:100%;height:100%;padding:60px;background:#fff"><img class="ct" src="${furl(fallbackCut)}"></div>`; };
  const pts = (list) => list.map((q) => `<div class="pt"><i>✓</i><span>${jw(q.t)}</span></div>`).join('');
  const big = (list) => list.map((q) => `<div class="pt" style="font-size:${String(q.t).length > 9 ? 58 : 66}px;padding:30px 30px;gap:20px"><i style="font-size:66px">✓</i><span>${jw(q.t)}</span></div>`).join('');
  // 文字はスマホのサムネイルでも読める大きさ（見出し ≥ 画面幅 60%、要点 ≥ 画面高 4%＝64px@1600）
  const T = {
    main: (cutF) => `<div style="position:absolute;inset:0;background:#fff;display:flex;align-items:center;justify-content:center"><img src="${furl(cutF)}" style="width:${PX * 0.85}px;height:${PX * 0.85}px;object-fit:contain"></div>`,
    value: (s, cutF) => `<div style="position:absolute;left:70px;right:70px;top:70px"><h1 style="font-size:132px;line-height:1.15">${jw(s.headline)}</h1>${s.sub ? `<div class="sub" style="font-size:52px;margin-top:22px">${jw(s.sub)}</div>` : ''}</div>
      <div class="panel" style="position:absolute;left:70px;top:560px;bottom:70px;width:${s.points.length ? 820 : PX - 140}px">${imgOr(s.img, cutF)}</div>
      <div style="position:absolute;left:930px;right:70px;top:560px;bottom:70px;display:flex;flex-direction:column;justify-content:space-between;gap:28px">${big(s.points)}</div>`,
    concern: (s, cutF) => `<div class="panel" style="position:absolute;left:0;top:0;width:${PX * 0.44}px;height:${PX}px;border-radius:0">${imgOr(s.img, cutF)}</div>
      <div style="position:absolute;left:${PX * 0.44 + 60}px;right:60px;top:80px;bottom:70px;display:flex;flex-direction:column">${s.worry ? `<div style="font-size:50px;font-weight:700;color:${TH.sub};line-height:1.35">「${jw(s.worry)}」</div>` : ''}<div class="chip" style="font-size:44px;margin-top:40px;align-self:flex-start">ANSWER</div><h1 style="margin-top:26px;font-size:104px;line-height:1.18">${jw(s.headline)}</h1><div style="flex:1"></div><div style="display:grid;gap:26px">${big(s.points)}</div></div>`,
    size: (s, cutF) => `<div style="position:absolute;left:70px;right:70px;top:70px"><h1 style="font-size:128px">${jw(s.headline)}</h1></div>
      <div style="position:absolute;left:40px;top:330px;width:${PX * 0.42}px;bottom:70px;display:flex;align-items:center;justify-content:center"><img class="ct" src="${furl(cutF)}"></div>
      <div style="position:absolute;left:${PX * 0.45}px;right:70px;top:330px;bottom:70px;display:flex;flex-direction:column;justify-content:center">${s.rows.map((r) => `<div style="padding:26px 0;border-bottom:4px solid ${TH.line}"><div style="font-size:44px;color:${TH.sub};font-weight:700">${jw(r.k)}</div><div style="font-size:68px;font-weight:900;line-height:1.25;margin-top:6px">${jw(r.v)}</div></div>`).join('')}</div>`,
    scene: (s, cutF) => `<div style="position:absolute;inset:0">${sceneF ? `<img class="ph" src="${furl(sceneF)}">` : imgOr(s.img, cutF)}</div><div style="position:absolute;left:0;right:0;bottom:0;padding:80px 70px;background:linear-gradient(transparent,rgba(17,17,17,.78) 35%)">${s.tag ? `<div class="chip" style="font-size:48px">${jw(s.tag)}</div>` : ''}<h1 style="color:#fff;margin-top:26px;font-size:132px;line-height:1.15;text-shadow:0 2px 12px rgba(0,0,0,.35)">${jw(s.headline)}</h1>${s.sub ? `<div style="color:#fff;font-size:56px;font-weight:700;margin-top:18px">${jw(s.sub)}</div>` : ''}</div>`,
    set: (s, cutF) => `<div style="position:absolute;left:70px;right:70px;top:70px"><h1 style="font-size:128px">${jw(s.headline)}</h1></div>
      <div style="position:absolute;left:40px;top:330px;width:${PX * 0.42}px;bottom:70px;display:flex;align-items:center;justify-content:center"><img class="ct" src="${furl(cutF)}"></div>
      <div style="position:absolute;left:${PX * 0.45}px;right:70px;top:330px;bottom:70px;display:flex;flex-direction:column;justify-content:center;gap:26px">${big(s.items)}${s.notes.map((q) => `<div style="font-size:52px;font-weight:700;color:${TH.sub};line-height:1.35">・${jw(q.t)}</div>`).join('')}</div>`,
  };
  const slideHtml = (key, cutF) => { if (key === 'main') return page(T.main(cutF)); const s = S[key]; const tpl = key.startsWith('value') ? T.value : key.startsWith('concern') ? T.concern : T[key]; return page(tpl(s, cutF)); };
  const shots = []; const names = {};
  for (const [set, dir, cutF] of [['A', A, cutA], ['B', B, cutB]]) b.plan[set].forEach((key, i) => { const out = path.join(dir, `${pad(i + 1)}.jpg`); (names[set] ??= []).push({ n: i + 1, key, file: path.relative(path.join(OUT, p.handle), out).replace(/\\/g, '/') }); shots.push({ key, cutF, out }); });
  for (const s of shots) slideHtml(s.key, s.cutF); py('crop', crops); // HTML を作る過程で使う crop が決まる → 先に作る
  // cleanBox で切っても卸の文字が残ることがある → 6kpro 視覚で確認し、文字が残る crop は切り抜き表示に替える
  const ctF = path.join(work, 'croptext.json'); const ct = fs.existsSync(ctF) && !args.force ? J(ctF) : {}; const todo = [...used].filter((f) => !(path.basename(f) in ct));
  if (todo.length) { const th = todo.map((f) => ({ src: f, out: f.replace(/\.jpg$/, '-t.jpg'), max: 512 })); py('thumbs', th); const r = await visionBatch('各画像に文字（日本語・中国語・英語の説明文、キャッチコピー、ラベル、透かし）が見えるか判定。商品本体に印刷・刻印された文字は除く。JSON: {"images":[{"n":1,"hasText":bool,"what":"見える文字 20 字以内"}]}', th.map((t) => t.out), '自社商品の切り抜き写真'); todo.forEach((f, i) => { ct[path.basename(f)] = r.find((x) => x.n === i + 1) ?? { hasText: true, what: '判定なし' }; }); W(ctF, ct); }
  badCrops = new Set([...used].filter((f) => ct[path.basename(f)]?.hasText)); if (badCrops.size) log('文字が残る crop → 切り抜きで代用', [...badCrops].map((f) => path.basename(f)).join(','));
  const htmls = shots.map((s) => ({ ...s, html: slideHtml(s.key, s.cutF) }));
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
  if (!lite(p)) { fs.mkdirSync(DOCS, { recursive: true }); fs.copyFileSync(out, path.join(DOCS, `${String(p.id).split('/').pop()}-preview.jpg`)); } // 全商品分は git に入れない（sheet で一覧）
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
    `<h3>对标竞品（${b.competitors?.length ?? 0}）</h3><p>${e(b.competeNote ?? 'lite：未做竞品调查')}</p>${li((b.competitors ?? []).map((c) => `<a href="${c.url}">${c.asin}</a> ${e(c.title.slice(0, 40))}｜${e(c.price)}｜★${c.rating ?? '-'}（${c.reviews ?? '-'}）｜${e(c.source)}｜${e(c.reason)}`))}`,
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
    b.check ? `<h3>SOP 自检：${b.check.pass ? '合格' : '不合格'}</h3>${li([...b.check.issues.map((x) => `✗ ${e(x)}`), ...b.check.warn.map((x) => `⚠ ${e(x)}`), `A 主图像素：外周纯白 ${b.check.pixels.a.borderPureWhite}、商品长边占比 ${b.check.pixels.a.longSideRatio}、${b.check.pixels.a.w}px ${b.check.pixels.a.format}`])}` : '',
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
  if (exists) { // --force：既存の審査 DRAFT の画像と説明を作り直す（重複商品を作らない）
    const old = (await gql(`query($id:ID!){ product(id:$id){ status media(first:60){ nodes{ id } } } }`, { id: exists.id })).product; if (old.status !== 'DRAFT') throw new Error('審査商品が DRAFT ではない');
    const cm = await gql(`mutation($id:ID!,$m:[CreateMediaInput!]!){ productCreateMedia(productId:$id, media:$m){ media{ id } mediaUserErrors{ message } } }`, { id: exists.id, m: media }); if (cm.productCreateMedia.mediaUserErrors.length) throw new Error(cm.productCreateMedia.mediaUserErrors[0].message);
    const ids = cm.productCreateMedia.media.map((m) => m.id); let urls = [];
    for (let i = 0; i < 40; i++) { await sleep(3000); const m = await gql(`query($id:ID!){ product(id:$id){ media(first:60){ nodes{ id alt status ... on MediaImage{ image{ url } } } } } }`, { id: exists.id }); const mine = m.product.media.nodes.filter((x) => ids.includes(x.id)); if (mine.some((x) => x.status === 'FAILED')) throw new Error('media FAILED'); if (mine.length === ids.length && mine.every((x) => x.status === 'READY')) { urls = mine.filter((x) => /^B案/.test(x.alt ?? '')).map((x) => x.image.url); break; } }
    await gql(`mutation($id:ID!,$m:[MoveInput!]!){ productReorderMedia(id:$id, moves:$m){ userErrors{ message } } }`, { id: exists.id, m: ids.map((x, i) => ({ id: x, newPosition: String(i) })) });
    if (old.media.nodes.length) await gql(`mutation($id:ID!,$m:[ID!]!){ productDeleteMedia(productId:$id, mediaIds:$m){ mediaUserErrors{ message } } }`, { id: exists.id, m: old.media.nodes.map((x) => x.id) });
    const u = await gql(`mutation($p:ProductUpdateInput!){ productUpdate(product:$p){ userErrors{ message } } }`, { p: { id: exists.id, descriptionHtml: summaryHtml(p, b, urls) } }); if (ue(u.productUpdate)) throw new Error(ue(u.productUpdate));
    W(rf, { id: exists.id, adminUrl: adminUrl(exists.id), updatedAt: new Date().toISOString(), bImages: urls.length, status: 'DRAFT' }); log('review 更新', adminUrl(exists.id), `${ids.length} new / ${old.media.nodes.length} old`); return;
  }
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

// ================= check（SOP 鉄則の自己点検。A 案＝公開する案）=================
async function check(p) {
  const b = brief(p); if (!b.render) throw new Error('render 無し'); const issues = []; const warn = [];
  // 主图：2000px・JPEG・外周が純白 RGB255・商品の長辺が約 85%（コードで測る）
  const mains = ['a', 'b'].map((s) => ({ s, src: path.join(OUT, p.handle, s, '01.jpg'), out: path.join(OUT, p.handle, 'work', `white-${s}.json`) })); py('whitecheck', mains);
  const px = Object.fromEntries(mains.map((m) => [m.s, J(m.out)]));
  for (const [s, r] of Object.entries(px)) { const tag = `${s.toUpperCase()}主图`; if (r.format !== 'JPEG' || r.mode !== 'RGB') issues.push(`${tag}：形式 ${r.format}/${r.mode}`); if (Math.max(r.w, r.h) < 2000) issues.push(`${tag}：长边 ${Math.max(r.w, r.h)}px`); if (r.borderPureWhite < 0.99) issues.push(`${tag}：外周纯白率 ${r.borderPureWhite}`); if (r.longSideRatio < 0.8 || r.longSideRatio > 0.9) issues.push(`${tag}：商品长边占比 ${r.longSideRatio}`); }
  // 主图：文字・ロゴ・透かし・付属しない小物（6kpro 視覚。商品本体の印字は別扱い）
  const th = mains.map((m) => ({ src: m.src, out: m.src.replace(/01\.jpg$/, '').replace(/[\\/]$/, '') + '-qa.jpg', max: 768 })); py('thumbs', th);
  const q = await visionBatch('Amazon 主图の規約チェック。各画像について JSON: {"images":[{"n":1,"addedText":bool（画像に後から載せた文字・数字・透かし・枠）,"printOnProduct":"商品本体に印刷/刻印された文字やロゴ（無ければ空）","extraProps":bool（商品以外の物：ハンガー・フック・タグ・人体・家具など）,"pureWhiteBg":bool,"note":"問題点 中文 30 字以内"}]}', th.map((t) => t.out), '画像1=A案主图 画像2=B案主图');
  for (const r of q) { const tag = `${r.n === 1 ? 'A' : 'B'}主图`; const bad = [r.addedText && '有后加文字/水印', r.extraProps && '有非附带小物', r.pureWhiteBg === false && '背景非纯白'].filter(Boolean); (r.n === 1 ? issues : warn).push(...bad.map((x) => `${tag}：${x}（${r.note ?? ''}）`)); if (r.printOnProduct) warn.push(`${tag}：商品本体印字「${r.printOnProduct}」——非 SARADEMUNT 的品牌名需确认`); }
  // 副图：文字は validatePlan 済み。最終の slides を再点検（数字の出処・禁止語・他社/IP）
  const allNums = new Set(b.facts.flatMap((f) => nums(f.v))); const texts = [];
  for (const [k, s] of Object.entries(b.plan.slides)) for (const t of [s.worry, s.headline, s.sub, s.tag, ...(s.points ?? []).map((x) => x.t), ...(s.rows ?? []).map((x) => x.v), ...(s.items ?? []).map((x) => x.t), ...(s.notes ?? []).map((x) => x.t)]) if (t) texts.push([k, String(t)]);
  for (const [k, t] of texts) { if (NG_RE.test(t) || HOLD_RE.test(t)) issues.push(`副图 ${k}：禁止语「${t}」`); const bad = nums(t.replace(/<br>/g, '')).filter((n) => !allNums.has(n)); if (bad.length) issues.push(`副图 ${k}：数字 ${bad.join(',')} 无出处`); }
  b.check = { at: new Date().toISOString(), pass: !issues.length, issues, warn, pixels: px, vision: q }; saveBrief(p, b);
  log('check', p.handle.slice(0, 30), b.check.pass ? 'PASS' : 'FAIL', issues.join(' / '), warn.length ? `warn ${warn.length}` : '');
  if (!b.check.pass) process.exitCode = 1;
}

// ================= publish（A 案を原商品の画像に。用户 2026-10-20 承認：anetmc.com で展示、Amazon はまだ出さない）=================
// バックアップは tools/product-images/out/<handle>/media-backup.json（pipeline.mjs rollback --handle <h> で元に戻せる形式。localDir に置換前の画像を保存）
const PI_OUT = path.join(ROOT, 'tools/product-images/out');
async function publishA(p) {
  const b = brief(p); if (!b.check?.pass) throw new Error('check 未合格'); const approved = new Set(fs.readFileSync(path.join(ROOT, 'tools/product-images/approved.txt'), 'utf8').split(/\r?\n/).map((x) => x.trim()));
  if (!approved.has(p.handle)) throw new Error('approved.txt に無い');
  const bakF = path.join(PI_OUT, p.handle, 'media-backup.json'); const done = fs.existsSync(bakF) && J(bakF).by === 'amazon-visual';
  const cur = (await gql(`query($id:ID!){ product(id:$id){ vendor tags media(first:60){ nodes{ id ... on MediaImage{ image{ url } } } } } }`, { id: p.id })).product;
  if (cur.vendor !== 'ANET') throw new Error('vendor が ANET ではない');
  if (done && !args.force) { log('publish 済み', p.handle.slice(0, 30)); } else {
    if (args.dry) { log('[dry] replace', cur.media.nodes.length, '→ A 7', p.handle.slice(0, 30)); return; }
    // 1) 置換前の画像を保存（rollback 用 localDir）
    const live = cur.media.nodes.filter((m) => m.image?.url).map((m) => ({ id: m.id, url: m.image.url })); const localDir = 'amazon-pick-old';
    const prevBak = done ? J(bakF) : null; const old = prevBak?.old ?? live; // 2 回目以降：rollback 先は初回の原図のまま（localDir も初回のもの）
    if (!prevBak) for (const [i, m] of old.entries()) await download(m.url, path.join(PI_OUT, p.handle, localDir, `${pad(i + 1)}.jpg`));
    // 2) A 案 7 枚を追加 → 処理待ち → 並べ替え → 旧画像を削除
    const alts = { main: p.title, value: `${p.title} 特長`, valueB: `${p.title} 特長`, concern1: `${p.title} ディテール`, concern2: `${p.title} 収納・使い方`, size: `${p.title} サイズ・仕様`, scene: `${p.title} 使用シーン`, set: `${p.title} セット内容` };
    const media = []; for (const x of b.render.A) media.push({ originalSource: await upload(path.join(OUT, p.handle, x.file), `amz-${String(p.id).split('/').pop()}-a-${pad(x.n)}.jpg`), mediaContentType: 'IMAGE', alt: alts[x.key] });
    const cm = await gql(`mutation($id:ID!,$m:[CreateMediaInput!]!){ productCreateMedia(productId:$id, media:$m){ media{ id } mediaUserErrors{ message } } }`, { id: p.id, m: media });
    if (cm.productCreateMedia.mediaUserErrors.length) throw new Error(cm.productCreateMedia.mediaUserErrors[0].message); const ids = cm.productCreateMedia.media.map((m) => m.id);
    W(bakF, { productId: p.id, old, new: ids, prevNew: prevBak?.new, localDir, by: 'amazon-visual', at: new Date().toISOString() }); // 先に書く（途中で落ちても rollback できる）
    for (let i = 0; i < 40; i++) { await sleep(2000); const d = await gql(`query($id:ID!){ product(id:$id){ media(first:80){ nodes{ id status } } } }`, { id: p.id }); const mine = d.product.media.nodes.filter((m) => ids.includes(m.id)); if (mine.some((m) => m.status === 'FAILED')) throw new Error('media FAILED（旧画像は残したまま）'); if (mine.length === ids.length && mine.every((m) => m.status === 'READY')) break; }
    await gql(`mutation($id:ID!,$m:[MoveInput!]!){ productReorderMedia(id:$id, moves:$m){ userErrors{ message } } }`, { id: p.id, m: ids.map((id, i) => ({ id, newPosition: String(i) })) });
    const del = await gql(`mutation($id:ID!,$m:[ID!]!){ productDeleteMedia(productId:$id, mediaIds:$m){ deletedMediaIds mediaUserErrors{ message } } }`, { id: p.id, m: live.map((o) => o.id) }); // 今ある画像（初回は原図、再発行時は前回の A 案）を消す
    if (del.productDeleteMedia.mediaUserErrors.length) throw new Error(del.productDeleteMedia.mediaUserErrors[0].message);
    log('published A', p.handle.slice(0, 30), `${ids.length} new / ${live.length} removed (backup old ${old.length})`);
  }
  // 試点 5 件＝amazon-pick（「Amazon おすすめ」集合）、全商品＝amazon-ready（集合には入れない）
  const tag = args.set ? 'amazon-ready' : 'amazon-pick';
  if (!cur.tags.includes(tag)) { const t = await gql(`mutation($id:ID!,$t:[String!]!){ tagsAdd(id:$id, tags:$t){ userErrors{ message } } }`, { id: p.id, t: [tag] }); if (ue(t.tagsAdd)) throw new Error(ue(t.tagsAdd)); log('tag', tag, p.handle.slice(0, 30)); }
}

// ================= collection「Amazon おすすめ」（tag = amazon-pick の自動集合）→ Online Store + Headless =================
async function collection() {
  let c = (await gql(`{ collectionByHandle(handle:"amazon-osusume"){ id handle title } }`)).collectionByHandle;
  if (!c) { const d = await gql(`mutation($i:CollectionInput!){ collectionCreate(input:$i){ collection{ id handle title } userErrors{ message } } }`, { i: { title: 'Amazon おすすめ', handle: 'amazon-osusume', descriptionHtml: '<p>Amazon の売れ筋と口コミを調べて選んだバッグ。</p>', ruleSet: { appliedDisjunctively: false, rules: [{ column: 'TAG', relation: 'EQUALS', condition: 'amazon-pick' }] }, sortOrder: 'MANUAL' } }); if (ue(d.collectionCreate)) throw new Error(ue(d.collectionCreate)); c = d.collectionCreate.collection; log('collection created', c.handle); }
  const pubs = (await gql(`{ publications(first:20){ nodes{ id name } } }`)).publications.nodes.filter((x) => /online store|headless/i.test(x.name));
  const r = await gql(`mutation($id:ID!,$in:[PublicationInput!]!){ publishablePublish(id:$id, input:$in){ userErrors{ message } } }`, { id: c.id, in: pubs.map((x) => ({ publicationId: x.id })) }); if (ue(r.publishablePublish)) throw new Error(ue(r.publishablePublish));
  const v = (await gql(`query($id:ID!){ collection(id:$id){ productsCount{ count } resourcePublicationsV2(first:10){ nodes{ publication{ name } } } } }`, { id: c.id })).collection;
  W(path.join(OUT, 'collection.json'), { id: c.id, handle: c.handle, url: `https://anetmc.com/collections/${c.handle}`, admin: `https://admin.shopify.com/store/${SHOP.replace(/\.myshopify\.com$/, '')}/collections/${c.id.split('/').pop()}`, products: v.productsCount.count, publications: v.resourcePublicationsV2.nodes.map((x) => x.publication.name) });
  log('collection', c.handle, 'products', v.productsCount.count, 'pubs', v.resourcePublicationsV2.nodes.map((x) => x.publication.name).join(' / '));
}

// ================= listing（Amazon 出品データ。アップロードはしない）=================
const LIST_SYS = `あなたは Amazon.co.jp の出品担当です。与えられた facts（出典付き事実）と顧客の需求・顧慮から、出品データを日本語で作ります。
厳守：
- 数字・仕様は facts にあるものだけ。各箇条書きに根拠の factIds。
- 最強/No.1/絶対/日本一/世界一/最安/激安/送料無料/限定/セール/即納/正規品/医療効果/他社ブランド名/【】★■ などの記号は使わない。
- title: 「SARADEMUNT 」で始め、商品の種類・主要な特徴・素材/用途を自然に並べる。全角換算 65 字以内。型番は入れない。
- bullets: 5 本、各「【見出し】本文」ではなく「見出し：本文」の形で 100 字以内。需求の大きい順、顧慮への回答を含める。
- description: 400〜800 字、です・ます調。
- keywords: タイトルに無い検索語をスペース区切りで、全体 200 バイト以内（同義語・用途・シーン）。
JSON: {"title":"","bullets":[{"t":"見出し：本文（1 つの文字列）","factIds":[]}],"description":"","keywords":""}`;
async function listing(p) {
  const b = brief(p); const f = path.join(OUT, p.handle, 'amazon-listing.json'); if (fs.existsSync(f) && !args.force) { log('listing あり', p.handle.slice(0, 30)); return; }
  const j = await chatJson([{ role: 'system', content: LIST_SYS }, { role: 'user', content: `商品: ${p.title}\n版型: ${b.form}　客群: ${b.segment}\n需求: ${b.needs.map((x) => `${x.ja}(${x.count})`).join('、')}\n顧慮: ${b.concerns.map((x) => `${x.ja}(${x.count})`).join('、')}\nfacts:\n${b.facts.map((x) => `${x.id} ${x.k}: ${x.v}`).join('\n')}` }], { maxTokens: 4000 });
  const byId = Object.fromEntries(b.facts.map((x) => [x.id, x])); const allNums = new Set(b.facts.flatMap((x) => nums(x.v))); const removed = [];
  const ok = (t, where) => { const s = String(t ?? '').replace(/[【】★☆■◆●◎♪]/g, ' ').replace(/\s+/g, ' ').trim(); if (!s) return ''; if (NG_RE.test(s) || HOLD_RE.test(s) || /限定|セール|即納|正規品/.test(s)) { removed.push(`${where}: ${s}（禁止语）`); return ''; } const bad = nums(s).filter((n) => !allNums.has(n)); if (bad.length) { removed.push(`${where}: ${s}（数字 ${bad.join(',')} 无出处）`); return ''; } return s; };
  let title = ok(j.title, 'title'); if (!title.startsWith('SARADEMUNT')) title = `SARADEMUNT ${title}`.trim(); if (title.length > 65) title = title.slice(0, 65).replace(/\s\S*$/, '');
  // 箇条書き：形の揺れを吸収（{t} / {h,b} / 文字列）→ 本文の無いものは捨てる → 6kpro で裏づけ確認（誇張・fact に無い機能・注意書きの言い換えを落とす）
  let bullets = (j.bullets ?? []).map((x, i) => { const t = typeof x === 'string' ? x : [x.t ?? x.text ?? x.title ?? x.h ?? x.head ?? '', x.body ?? x.b ?? x.d ?? ''].filter(Boolean).join(x.body || x.b || x.d ? '：' : ''); return { t: ok(t, `bullet${i + 1}`).slice(0, 120), factIds: ((typeof x === 'object' && x.factIds) || []).filter((id) => byId[id]) }; }).filter((x) => x.t && !/[：:]\s*$/.test(x.t) && x.t.replace(/^[^：:]*[：:]/, '').trim().length >= 8);
  const factsTxt = b.facts.map((x) => `${x.id} ${x.k}: ${x.v}`).join('\n');
  const verify = (list) => chatJson([{ role: 'system', content: 'Amazon 箇条書きの裏づけチェック。商品の性質・機能・性能についての主張が根拠 fact に無いもの（撥水・丈夫・しっかり・底板付き 等）、注意事項を長所のように書いたものだけ ok=false。用途の言い換え（〜に便利、持ち運びやすい）や fact の数値・仕様の言い換えは ok=true。JSON: {"r":[{"i":番号,"ok":bool,"why":"中文 20 字"}]}' }, { role: 'user', content: `facts:\n${factsTxt}\n\n${list.map((x, i) => `#${i} ${x.t}  根拠: ${x.factIds.join(',') || 'なし'}`).join('\n')}` }], { maxTokens: 1500 }).catch(() => null);
  // 裏づけ不足の行は 1 回だけ fact の言葉で書き直させて再判定、それでも駄目なら捨てる
  let vr = await verify(bullets);
  if (vr?.r) {
    const badIdx = vr.r.filter((r) => r.ok === false).map((r) => r.i).filter((i) => bullets[i]);
    if (badIdx.length) {
      const rw = await chatJson([{ role: 'system', content: '次の Amazon 箇条書きを、指摘を直して facts の内容だけで書き直す。「見出し：本文」1 つの文字列、100 字以内、誇張なし、注意事項は書かない。JSON: {"bullets":[{"i":番号,"t":"","factIds":[]}]}' }, { role: 'user', content: `facts:\n${factsTxt}\n\n${badIdx.map((i) => `#${i} ${bullets[i].t}  指摘: ${vr.r.find((r) => r.i === i)?.why ?? ''}`).join('\n')}` }], { maxTokens: 1500 }).catch(() => null);
      const fixed = (rw?.bullets ?? []).filter((x) => badIdx.includes(x.i)).map((x) => ({ i: x.i, t: ok(x.t, `bullet-rw${x.i}`).slice(0, 120), factIds: (x.factIds ?? []).filter((id) => byId[id]) })).filter((x) => x.t);
      const vr2 = fixed.length ? await verify(fixed) : null; const good = new Set((vr2?.r ?? []).filter((r) => r.ok !== false).map((r) => r.i));
      for (const i of badIdx) { const k = fixed.findIndex((x) => x.i === i); if (k >= 0 && good.has(k)) { removed.push(`bullet 書き直し: ${bullets[i].t} → ${fixed[k].t}`); bullets[i] = { t: fixed[k].t, factIds: fixed[k].factIds }; } else { removed.push(`bullet: ${bullets[i].t}（裏づけ不足：${vr.r.find((r) => r.i === i)?.why ?? ''}）`); bullets[i] = null; } }
      bullets = bullets.filter(Boolean);
    }
  } else removed.push('bullets: 裏づけ確認できず（未検証）');
  bullets = bullets.slice(0, 5); if (bullets.length < 5) removed.push(`bullets が ${bullets.length} 本（5 本未満：裏づけのある事実が足りない）`);
  const description = ok(j.description, 'description').slice(0, 1900); let keywords = ok(j.keywords, 'keywords'); while (Buffer.byteLength(keywords) > 200) keywords = keywords.replace(/\s*\S+$/, '');
  const cat = categorize(p); const prices = p.variants.map((v) => ({ sku: v.sku, variant: v.title, shopify: Number(v.price), ...amazonPrice(v.price, cat.feed_product_type) }));
  const out = { handle: p.handle, brand: 'SARADEMUNT', feed_product_type: cat.feed_product_type, title, bullets, description, keywords, prices, fulfillment: '出品者出荷', shipping: '全国送料無料', images: 'anetmc.com 商品画像（A 案 7 枚）', removed, at: new Date().toISOString(), uploaded: false };
  W(f, out); log('listing', p.handle.slice(0, 30), title.length, '字', bullets.length, 'bullets', removed.length ? `removed ${removed.length}` : '');
  // docs：中文摘要 + 日文原文
  const id = String(p.id).split('/').pop(); const r = fs.existsSync(path.join(OUT, p.handle, 'review.json')) ? J(path.join(OUT, p.handle, 'review.json')) : {};
  const md = [`# ${p.title}`, '', `- anetmc.com：https://anetmc.com/products/${p.handle}`, `- 审核用 DRAFT（B 案保留）：${r.adminUrl ?? '-'}`, `- A/B 对比：[preview](${id}-preview.jpg)`, `- Amazon 预计价：${[...new Set(prices.map((x) => `¥${x.price}`))].join(' / ')}（Shopify ${[...new Set(prices.map((x) => `¥${x.shopify}`))].join(' / ')}，类目 ${cat.feed_product_type}，手续费 ${Math.round(prices[0].fee * 100)}%）；**未上传 Amazon**`, '',
    '## 中文摘要', '', `- 关键词：${(b.keywords ?? []).join(' / ')}；版型 ${b.form}；客群 ${b.segment}`, `- 竞品 ${b.competitors?.length ?? 0} 件：${(b.competitors ?? []).map((c) => `${c.asin}（${c.price}，★${c.rating ?? '-'}，${c.reviews ?? '-'} 评）`).join('、')}`, `- 大家都一样：${(b.teardown?.same ?? []).join('；')}`, `- 没人展示：${(b.gaps ?? []).map((g) => g.observation).join('；')}`,
    `- 顾虑：${b.concerns.map((c) => `${c.topic} ${c.count}${c.answeredBy.length ? '' : '（未答）'}`).join('、') || '无'}`, `- 需求：${b.needs.map((c) => `${c.topic} ${c.count}`).join('、')}`, `- 答不了（要问供应商）：${b.unanswered.map((u) => u.topic).join('、') || '无'}`,
    `- A 案（已上 anetmc.com）：${b.plan.A.map((k, i) => `${i + 1}.${SLIDE_ZH[k]}`).join(' / ')}，主图原图 ${b.plan.mainA.img}；B 案（留在 DRAFT）：${b.plan.B.map((k, i) => `${i + 1}.${SLIDE_ZH[k]}`).join(' / ')}，主图原图 ${b.plan.mainB.img}`,
    `- 自检：${b.check?.pass ? '合格' : '不合格'}${b.check?.issues?.length ? '（' + b.check.issues.join('；') + '）' : ''}${b.check?.warn?.length ? '；注意：' + b.check.warn.join('；') : ''}`, ...(removed.length ? [`- 出品文案里被自动删掉的：${removed.join('；')}`] : []), '',
    '## Amazon 出品データ（日本語原文）', '', `**商品名**（${title.length} 字）`, '', title, '', '**箇条書き**', '', ...bullets.map((x) => `- ${x.t}（根拠 ${x.factIds.join(',') || '—'}）`), '', '**商品説明**', '', description, '', `**検索キーワード**（${Buffer.byteLength(keywords)} バイト）`, '', keywords, '',
    '**根拠（facts）**', '', ...b.facts.map((x) => `- ${x.id} ${x.k}：${x.v}（${x.src}）`), ''].join('\n');
  if (lite(p)) fs.writeFileSync(path.join(OUT, p.handle, 'amazon-listing.md'), md); else { fs.mkdirSync(DOCS, { recursive: true }); fs.writeFileSync(path.join(DOCS, `${p.handle}.md`), md); }
}
// 在庫ファイル（dry-run）：amazon-pick の原商品＋ listing.json → build-inventory-file（アップロードしない）
async function listingFile() {
  const items = [];
  for (const p of pilot()) {
    const L = path.join(OUT, p.handle, 'amazon-listing.json'); if (!fs.existsSync(L)) continue;
    const q = await gql(`query($h:String!){ productByHandle(handle:$h){ id handle title description productType tags status vendor options{ name values } variants(first:50){ nodes{ id title price compareAtPrice sku selectedOptions{ name value } } } media(first:12){ nodes{ ... on MediaImage{ image{ url } } } } } }`, { h: p.handle });
    const x = q.productByHandle; if (!x || x.vendor !== 'ANET' || !x.tags.includes('amazon-pick')) { log('skip（amazon-pick でない）', p.handle.slice(0, 30)); continue; }
    items.push({ ...x, amazonListing: J(L) });
  }
  if (!items.length) { log('対象なし'); return; }
  const dir = path.join(OUT, 'listing'); W(path.join(dir, 'products.json'), items);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/amazon-listing/build-inventory-file.mjs'), 'build', '--products', path.join(dir, 'products.json'), '--out', dir], { encoding: 'utf8', stdio: 'inherit' }); if (r.status !== 0) throw new Error('build-inventory-file 失敗');
  for (const p of items) { const f = path.join(OUT, p.handle, 'amazon-listing.json'); W(f, { ...J(f), inventoryFiles: fs.readdirSync(dir).filter((x) => /^inventory-.*\.tsv$/.test(x)).map((x) => path.relative(ROOT, path.join(dir, x)).replace(/\\/g, '/')) }); }
  log(`dry-run：${path.relative(ROOT, dir)}/inventory-*.tsv（アップロードしていない）`);
}

// ================= 全商品：一覧と進捗 =================
const SLIDES_SHORT = 7;
// 1 枚に 12 商品（A 案 7 枚の縮小＋自己点検の結果）→ docs/amazon-visual/all/sheet-NNN.jpg（用户がバッチ単位で見る）
async function sheet() {
  const ps = pilot().filter((p) => brief(p).render); const per = 12; const tile = 150; const dir = path.join(DOCS, 'all'); fs.mkdirSync(dir, { recursive: true }); const from = Number(args.from ?? 0);
  const shots = [];
  for (let i = 0; i < ps.length; i += per) {
    const rows = ps.slice(i, i + per).map((p, k) => { const b = brief(p); const c = b.check; const badge = !c ? '<b style="color:#888">未检</b>' : c.pass ? '<b style="color:#1a7f37">合格</b>' : `<b style="color:#c00">不合格</b> ${esc((c.issues ?? []).join(' / ').slice(0, 80))}`;
      return `<div style="display:flex;gap:6px;align-items:flex-start;margin-top:10px"><div style="width:260px;font-size:14px;line-height:1.35"><b>${from + i + k + 1}.</b> ${esc(p.title.slice(0, 48))}<br><span style="color:#666">${esc(p.productType ?? '')}｜¥${p.amazon.price}</span><br>${badge}</div>${(b.render.A ?? []).slice(0, SLIDES_SHORT).map((x) => `<img src="${furl(path.join(OUT, p.handle, x.file))}" style="width:${tile}px;height:${tile}px;border:1px solid #ddd">`).join('')}</div>`; });
    const w = 280 + SLIDES_SHORT * (tile + 8) + 30;
    shots.push({ html: `<!doctype html><html><head><meta charset="utf-8">${fontLinks()}<style>body{margin:0;padding:14px;font-family:"Noto Sans JP",sans-serif;background:#fff;width:${w}px}</style></head><body><div style="font-size:18px;font-weight:700">Amazon 規格（A 案）一覧 ${from + i + 1}〜${from + i + rows.length}</div>${rows.join('')}</body></html>`, out: path.join(dir, `sheet-${String(Math.floor((from + i) / per) + 1).padStart(3, '0')}.jpg`), w, h: 50 + rows.length * (tile + 12), scale: 1 });
  }
  await renderHtml(shots); log('sheet', shots.length, '枚 →', path.relative(ROOT, dir));
}
// 進捗と自己点検の集計 → docs/amazon-visual/all-status.md（不合格の理由つき）
async function status() {
  const f = SETF(); const set = J(f); const ps = set.items; const st = { 対象: ps.length, 除外: set.skipped?.length ?? 0, keywords: 0, own: 0, plan: 0, render: 0, 合格: 0, 不合格: 0, listing: 0 }; const fails = []; const reasons = {}; const byType = {};
  for (const p of ps) { const b = brief(p); const t = (byType[p.productType || '—'] ??= { n: 0, ok: 0 }); t.n++;
    if (b.keywords) st.keywords++; if (ownClassify(p)) st.own++; if (b.plan) st.plan++; if (b.render) st.render++; if (fs.existsSync(path.join(OUT, p.handle, 'amazon-listing.json'))) st.listing++;
    if (b.check?.pass) { st.合格++; t.ok++; } else if (b.check) { st.不合格++; fails.push(`- ${p.handle}｜${p.title.slice(0, 40)}｜${b.check.issues.join(' / ')}`); for (const x of b.check.issues) { const k = x.replace(/[0-9.]+/g, 'n').replace(/（.*$/, ''); reasons[k] = (reasons[k] ?? 0) + 1; } } }
  const md = ['# 全商品 Amazon 規格化 進捗', '', `更新 ${new Date().toISOString()}｜対象 ${set.rule}`, '', '| 項目 | 件数 |', '|---|---|', ...Object.entries(st).map(([k, v]) => `| ${k} | ${v} |`), '',
    '## 分類別（合格 / 対象）', '', ...Object.entries(byType).sort((a, z) => z[1].n - a[1].n).map(([k, v]) => `- ${k}：${v.ok} / ${v.n}`), '',
    '## 不合格の理由（件数）', '', ...Object.entries(reasons).sort((a, z) => z[1] - a[1]).map(([k, v]) => `- ${k}：${v}`), '',
    '## 除外', '', ...Object.entries((set.skipped ?? []).reduce((a, x) => ((a[x.why] = (a[x.why] ?? 0) + 1), a), {})).map(([k, v]) => `- ${k}：${v}`), '',
    '## 不合格一覧', '', ...fails].join('\n');
  fs.mkdirSync(DOCS, { recursive: true }); fs.writeFileSync(path.join(DOCS, 'all-status.md'), md + '\n'); log('status', JSON.stringify(st));
}
// 1 商品ずつ全段（--conc で並列）。Shopify の公開商品・Amazon には何も書かない
// --publish：用户 2026-10-20 選択「合格的全部直接换」＝ check 合格の商品は承認済み → approved.txt に追記し A 案 7 枚を anetmc に公開（旧画像は media-backup.json、rollback 可）。不合格は原図のまま
const APPROVED = path.join(ROOT, 'tools/product-images/approved.txt');
async function approveAndPublish(p) {
  if (!brief(p).check?.pass) return;
  const have = new Set(fs.readFileSync(APPROVED, 'utf8').split(/\r?\n/).map((x) => x.trim()));
  if (!have.has(p.handle)) fs.appendFileSync(APPROVED, `${p.handle}\n`);
  await publishA(p);
}
// 6kpro（第三方）が止まっている間は失敗扱いにせず待つ（5 分おきに /health、最長 --wait-hours 時間、既定 12）
const llmUp = async () => { try { const r = await fetch(`${LLM.replace(/\/v1$/, '')}/health`, { signal: AbortSignal.timeout(10000) }); return r.ok; } catch { return false; } };
let llmWait = null;
// 6kpro の利用可能時間帯（用户 2026-10-22：北京時間 20:00〜翌 10:00 は自由に使ってよい）。.env の LLM_WINDOW=20-10 / LLM_WINDOW_TZ=Asia/Shanghai、または --window 20-10。未設定なら常時
const WIN = String(args.window ?? env.LLM_WINDOW ?? ''), WIN_TZ = env.LLM_WINDOW_TZ || 'Asia/Shanghai';
function inWindow() {
  const m = WIN.match(/^(\d{1,2})-(\d{1,2})$/); if (!m) return true;
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: WIN_TZ }).format(new Date()));
  const [a, b] = [Number(m[1]), Number(m[2])]; return a <= b ? h >= a && h < b : h >= a || h < b;
}
async function waitLLM() {
  if (!inWindow()) throw new Error(`WINDOW_CLOSED 6kpro の利用時間外（${WIN} ${WIN_TZ}）→ 今夜の続きは次の時間帯で`);
  if (await llmUp()) return;
  llmWait ??= (async () => { const until = Date.now() + Number(args['wait-hours'] ?? 12) * 3600e3; log('6kpro 停止中 → 復旧待ち'); while (Date.now() < until) { await sleep(300e3); if (!inWindow()) throw new Error('WINDOW_CLOSED 待機中に利用時間外'); if (await llmUp()) { log('6kpro 復旧'); return; } } throw new Error('6kpro が復旧しない（待ち時間切れ）'); })().finally(() => { llmWait = null; });
  await llmWait;
}
async function bulk() {
  args.set ??= 'all'; if (!fs.existsSync(SETF())) await pickAll();
  if (args['full-retry']) for (const p of pilot()) { const b = brief(p); if (/CAPTCHA|BLOCKED/.test(b.lite ?? '')) { delete b.lite; delete b.plan; delete b.render; delete b.check; saveBrief(p, b); } }
  const toLite = (p, why) => { const b = brief(p); b.lite = why; saveBrief(p, b); log('→ lite', p.handle.slice(0, 30), why); };
  const SOFT = /BLOCKED|竞品が|レビューが|competitors 無し/;
  await each(async (p) => { for (let k = 0; ; k++) { await waitLLM(); try { return await bulkOne(p); } catch (e) { if (k < 2 && !(await llmUp())) { log('6kpro 途中停止', p.handle.slice(0, 30), '→ 復旧後にやり直し'); continue; } throw e; } } }, 'bulk');
  async function bulkOne(p) {
    // 済み（自己点検＋出品データあり）はやり直さない：夜間の再実行で前回の続きから進むため
    if (brief(p).check && fs.existsSync(path.join(OUT, p.handle, 'amazon-listing.json')) && !args.force) { if (args.publish) await approveAndPublish(p); return; }
    if (!lite(p)) {
      if (amazonBlocked) toLite(p, 'Amazon CAPTCHA 中（後で --full-retry）');
      else {
        try { await withBrowser(() => compete(p)); await teardown(p); await reviews(p); }
        catch (e) { if (!SOFT.test(e.message)) throw e; if (/BLOCKED/.test(e.message)) { amazonBlocked = true; log('Amazon CAPTCHA → 以降は lite（突破しない）'); } toLite(p, e.message.slice(0, 120)); }
      }
    }
    if (lite(p)) { await compete(p); await teardown(p); await reviews(p); }
    await render(p); await check(p); await listing(p);
    if (args.publish) await approveAndPublish(p);
  }
}

// ---------- CLI ----------
const run = { pick, compete: () => each(compete), teardown: () => each(teardown), reviews: () => each(reviews), render: () => each(render), review: () => each(review), watch,
  check: () => each(check), publish: () => each(publishA), collection, listing: async () => { await each(listing); await listingFile(); },
  all: async () => { await pick(); for (const s of [compete, teardown, reviews, render]) await each(s); },
  bulk: async () => { try { await bulk(); } finally { await listingFile().catch((e) => log('listingFile', e.message)); await status(); await sheet(); } }, sheet, status, 'publish-passed': () => each(approveAndPublish) };
if (!run[stage]) { console.error('usage: pick | compete | teardown | reviews | render | review [--dry] | check | publish [--dry] | collection | listing | watch [--mark-listed --handles …] | all | bulk | sheet | status  (--handle h / --force / --cdp url / --set all --from N --limit M --conc N --lite)'); process.exit(2); }
// CDP ブラウザは自分のタブだけ閉じる（ウィンドウ・ブラウザは閉じない）。最後は process.exit
Promise.resolve(run[stage]()).then(async () => { if (BR) await BR.page.close().catch(() => {}); log('done', stage); process.exit(process.exitCode ?? 0); }, async (e) => { console.error(e); if (BR) await BR.page.close().catch(() => {}); process.exit(1); });
