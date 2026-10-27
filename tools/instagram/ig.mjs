#!/usr/bin/env node
/**
 * Instagram「アネット」運用ツール（2026-10-27 用户決定：做；主目的 = anetmc.com（Shopify）への送客）。
 * 「IG 小编技能包」の日本版。AI は 計画・文案・返信草稿 まで。投稿は用户承認後に Meta Graph API で、返信・他人の投稿へのコメントは絶対に自動送信しない。
 *
 *   node tools/instagram/ig.mjs products                 # Shopify ANET 在售商品 + 楽天 A 档 + 新着 → out/products.json
 *   node tools/instagram/ig.mjs plan   [--week 2026-11-03] [--n 7]   # 週計画（商品選定・投稿種別・日時）→ out/plan-<week>.json + docs/instagram/plan-<week>.md
 *   node tools/instagram/ig.mjs caption --week …        # 6kpro で日本語キャプション + ハッシュタグ（夜間窓口、禁止語チェック）
 *   node tools/instagram/ig.mjs assets  --week …        # 画像は Shopify CDN URL、Reel は real モード動画を Shopify Files へ staged upload → 公開 URL
 *   node tools/instagram/ig.mjs approve --week … [--only 1,3,5]   # 用户が docs/instagram/plan-<week>.md を見て「承認」と言った後に実行
 *   node tools/instagram/ig.mjs publish [--due]         # approved かつ 予定時刻 ≤ 今 の投稿を Graph API で公開（Windows の時間タスクで 1 時間ごと）
 *   node tools/instagram/ig.mjs replies                 # 直近 7 日のコメントを取得 → 6kpro 返信草稿 → docs/instagram/replies-<date>.md（送信しない）
 *   node tools/instagram/ig.mjs profile                 # プロフィール文案 3 案 → docs/instagram/profile.md
 *   node tools/instagram/ig.mjs insights                # 直近投稿の reach / likes / saves → docs/instagram/insights.md
 *
 * .env（Windows、git に入れない）：
 *   IG_USER_ID=            # Instagram ビジネス/クリエイターアカウントの ID（Graph API の /me/accounts → instagram_business_account）
 *   IG_ACCESS_TOKEN=       # 長期トークン（60 日。用户本人が Meta for Developers で発行して貼る）
 *   IG_HANDLE=anet_official   # 表示用
 *   SHOPIFY_STORE_DOMAIN / SHOPIFY_CLIENT_ID / SHOPIFY_CLIENT_SECRET（既存）  CN_LLM_BASE_URL / CN_LLM_MODEL（既存）
 *   ANET_SITE=https://anetmc.com
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inWindow, waitLLM } from '../night/window.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/instagram/out'), DOCS = path.join(ROOT, 'docs/instagram');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DOCS, { recursive: true });
const [cmd = 'plan', ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : null).filter(Boolean));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const SHOP = env.SHOPIFY_STORE_DOMAIN, SITE = (env.ANET_SITE || 'https://anetmc.com').replace(/\/$/, '');
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash', WIN = args.window ?? env.LLM_WINDOW ?? '';
const IG = { id: env.IG_USER_ID, token: env.IG_ACCESS_TOKEN, handle: env.IG_HANDLE || 'anet' };
const GRAPH = 'https://graph.facebook.com/v21.0';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (f, d) => d === undefined ? (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null) : fs.writeFileSync(f, JSON.stringify(d, null, 1));
// 景表法・薬機法・プラットフォーム規約：価格/送料はキャプションに書かない（変わるので）、断定表現・他社名禁止
const BANNED = /¥|円|送料|セール|SALE|割引|クーポン|No\.?\s?1|ナンバーワン|最強|最高級|日本一|業界初|世界一|絶対|完全|永久|治る|治療|効く|痩せる|バストアップ|美白|抗菌率|殺菌|医療|iPhone|Apple|ダイソン|Dyson|ニトリ|無印|IKEA|Amazon|楽天|メルカリ/i;
const weekStart = (s) => { const d = s ? new Date(s + 'T00:00:00+09:00') : new Date(); const day = (d.getUTCDay() + 6) % 7; const m = new Date(d); m.setUTCDate(d.getUTCDate() - day + (s ? 0 : 7)); return m.toISOString().slice(0, 10); };
const WEEK = args.week ? weekStart(args.week) : weekStart();

// ───────── Shopify ─────────
let tok; async function token() { if (tok) return tok; const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }) }); if (!r.ok) throw new Error(`shopify token ${r.status}`); tok = (await r.json()).access_token; return tok; }
async function gql(query, variables = {}) { const r = await fetch(`https://${SHOP}/admin/api/${env.SHOPIFY_API_VERSION || '2026-10'}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': await token() }, body: JSON.stringify({ query, variables }) }); const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.data; }

async function products() {
  const all = []; let c = null;
  for (;;) {
    const d = await gql(`query($c:String){ products(first:50, after:$c, query:"vendor:ANET status:active"){ pageInfo{hasNextPage endCursor} nodes{ id handle title productType tags createdAt onlineStoreUrl descriptionHtml featuredImage{url} images(first:6){nodes{url altText}} variants(first:5){nodes{sku price inventoryQuantity}} } } }`, { c });
    all.push(...d.products.nodes); if (!d.products.pageInfo.hasNextPage) break; c = d.products.pageInfo.endCursor;
  }
  // 楽天 A 档（docs/rakuten/price-tier.md の A 表）を SKU 前方一致で付与
  const tier = fs.existsSync(path.join(ROOT, 'docs/rakuten/price-tier.md')) ? fs.readFileSync(path.join(ROOT, 'docs/rakuten/price-tier.md'), 'utf8') : '';
  const aSec = tier.split(/\n## /).find((s) => s.startsWith('A 档')) || '';
  const aSpu = new Set([...aSec.matchAll(/^\| ([^|]+?) \|/gm)].map((m) => m[1].trim().toLowerCase()).filter((s) => s && s !== 'spu'));
  const K = (s) => String(s || '').toLowerCase().replace(/[\s_]/g, '-');
  const out = all.map((p) => ({
    id: p.id, handle: p.handle, title: p.title, type: p.productType, tags: p.tags, createdAt: p.createdAt, url: p.onlineStoreUrl || `${SITE}/products/${p.handle}`,
    images: p.images.nodes.map((i) => i.url), skus: p.variants.nodes.map((v) => v.sku).filter(Boolean), price: Number(p.variants.nodes[0]?.price || 0), stock: p.variants.nodes.reduce((s, v) => s + (v.inventoryQuantity ?? 0), 0),
    desc: String(p.descriptionHtml || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600),
    tierA: p.variants.nodes.some((v) => [...aSpu].some((a) => K(v.sku).startsWith(a) || a.startsWith(K(v.sku)))),
  }));
  J(path.join(OUT, 'products.json'), out); log('products', out.length, 'tierA', out.filter((p) => p.tierA).length);
}

// ───────── 週計画 ─────────
// 日本の季節フック（月別）。投稿テーマの「生活の場面」に使う。数字や効能は書かない
const SEASON = { 1: ['新年の片づけ', '寒さ対策', '受験シーズンの集中環境'], 2: ['花粉対策の掃除', 'バレンタイン', '引っ越し準備'], 3: ['新生活準備', '卒業・入学', '春の衣替え'], 4: ['新生活スタート', 'お花見ピクニック', 'GW 前の整理'], 5: ['GW のおうち時間', '母の日', '梅雨前の湿気対策'], 6: ['梅雨の部屋干し', '父の日', '衣替え'], 7: ['夏休み', '暑さ対策', 'ボーナス後の買い替え'], 8: ['お盆の帰省', '夏休みの子ども', '防災の日準備'], 9: ['防災の日', '秋の模様替え', '敬老の日'], 10: ['ハロウィン', '秋の夜長', '年末大掃除の前倒し'], 11: ['ブラックフライデー', '大掃除スタート', '冬支度'], 12: ['大掃除', 'クリスマス', '年末年始のおもてなし'] };
const SLOTS = [['Mon', '12:00'], ['Tue', '20:00'], ['Wed', '12:00'], ['Thu', '20:00'], ['Fri', '12:00'], ['Sat', '10:00'], ['Sun', '20:00']]; // 日本の IG 閲覧ピーク（昼休み・20〜21 時・週末朝）
function plan() {
  const ps = J(path.join(OUT, 'products.json')); if (!ps) { console.error('先に products'); process.exit(2); }
  const used = new Set(fs.readdirSync(OUT).filter((f) => /^plan-.*\.json$/.test(f)).flatMap((f) => (J(path.join(OUT, f)) || []).map((x) => x.handle)));
  const fresh = ps.filter((p) => !used.has(p.handle) && p.images.length >= 1 && p.stock > 0);
  const byNew = [...fresh].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const A = fresh.filter((p) => p.tierA), N = byNew.filter((p) => !p.tierA).slice(0, 20), rest = fresh.filter((p) => !p.tierA);
  const pick = (arr, n, excl) => { const o = []; for (const p of arr) { if (o.length >= n) break; if (!excl.has(p.handle)) { o.push(p); excl.add(p.handle); } } return o; };
  const ex = new Set();
  const n = Number(args.n || 7);
  const month = Number(WEEK.slice(5, 7));
  // 構成：A 档 3（うち 1 本は Reel）、新着 2、季節/生活場面 2（どの商品でもよい、場面が主役）
  const chosen = [...pick(A, 3, ex).map((p, i) => ({ kind: i === 0 ? 'reel' : 'carousel', theme: 'A', p })), ...pick(N, 2, ex).map((p) => ({ kind: 'carousel', theme: '新着', p })), ...pick(rest.sort(() => Math.random() - 0.5), 2, ex).map((p, i) => ({ kind: 'image', theme: SEASON[month][i % SEASON[month].length], p }))].slice(0, n);
  const posts = chosen.map((c, i) => {
    const [dow, hm] = SLOTS[i % 7]; const d = new Date(WEEK + 'T00:00:00+09:00'); d.setUTCDate(d.getUTCDate() + i);
    return { n: i + 1, week: WEEK, at: `${d.toISOString().slice(0, 10)}T${hm}:00+09:00`, dow, kind: c.kind, theme: c.theme, handle: c.p.handle, title: c.p.title, url: `${c.p.url}?utm_source=instagram&utm_medium=social&utm_campaign=${WEEK}`, images: c.p.images.slice(0, c.kind === 'carousel' ? 4 : 1), facts: c.p.desc, approved: false, status: 'planned' };
  });
  J(path.join(OUT, `plan-${WEEK}.json`), posts);
  writePlanMd(posts);
  log('plan', WEEK, posts.length, 'posts →', `docs/instagram/plan-${WEEK}.md`);
}
function writePlanMd(posts) {
  const md = [`# Instagram 週計画 ${WEEK}（@${IG.handle}）`, '', '用户が見て「承認」→ `ig.mjs approve --week ' + WEEK + '`。承認した投稿だけ予定時刻に公開。キャプションの価格・送料は書かない（変わるため）。リンクはプロフィールの anetmc.com（UTM 付き）。', '',
    '| # | 日時(JST) | 種別 | テーマ | 商品 | キャプション | タグ | 素材 | 状態 |', '|---|---|---|---|---|---|---|---|---|',
    ...posts.map((p) => `| ${p.n} | ${p.at.slice(5, 16).replace('T', ' ')} ${p.dow} | ${p.kind} | ${p.theme} | [${p.title.slice(0, 28)}](${p.url.split('?')[0]}) | ${(p.caption || '（caption 未生成）').replace(/\n/g, ' ').slice(0, 90)} | ${(p.hashtags || []).slice(0, 5).join(' ')} | ${p.kind === 'reel' ? (p.videoUrl ? '動画OK' : '動画未') : p.images.length + '枚'} | ${p.approved ? '✅承認' : '未承認'}${p.status !== 'planned' ? ' / ' + p.status : ''} |`), '',
    '## キャプション全文', '', ...posts.flatMap((p) => [`### ${p.n}. ${p.title}`, '', p.caption || '（未生成）', '', (p.hashtags || []).map((h) => '#' + h.replace(/^#/, '')).join(' '), ''])];
  fs.writeFileSync(path.join(DOCS, `plan-${WEEK}.md`), md.join('\n'));
}

// ───────── 6kpro ─────────
async function chatJson(messages) {
  const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, max_tokens: 1500, response_format: { type: 'json_object' } }) });
  const j = await r.json(); const t = j.choices?.[0]?.message?.content || '{}'; try { return JSON.parse(t); } catch { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); }
}
const CAP_SYS = `あなたは日本の生活雑貨ブランド「アネット」の Instagram 担当。anetmc.com のお客さま（20〜50 代の女性中心、暮らしを少しラクにしたい人）向けに投稿文を書く。
ルール：①冒頭 1 行で「場面・困りごと」から入る（商品名から始めない）②本文 3〜5 行、やさしい丁寧語、絵文字は 2 個まで ③最後に「詳しくはプロフィールのリンクから」④数字・素材・サイズは facts にあるものだけ。無ければ書かない ⑤価格・送料・セール・No.1・最強・日本一・絶対・医療効能・他社ブランド名は禁止 ⑥ハッシュタグ 12〜15 個：大（#暮らし #収納 など）5、中（カテゴリ）5、小（具体）3〜5、日本語中心、英語は 2 個まで。
出力 JSON：{"caption":"…","hashtags":["…"],"alt":"画像の代替テキスト 60 字以内"}`;
async function caption() {
  const f = path.join(OUT, `plan-${WEEK}.json`); const posts = J(f); if (!posts) { console.error('先に plan'); process.exit(2); }
  for (const p of posts) {
    if (p.caption && !args.force) continue;
    if (!(await waitLLM(LLM, WIN, log))) { log('6kpro 窓口外/停止 → 中断'); break; }
    let r; for (let k = 0; k < 3; k++) { r = await chatJson([{ role: 'system', content: CAP_SYS }, { role: 'user', content: `種別:${p.kind} テーマ:${p.theme}\n商品名:${p.title}\nfacts:${p.facts}` }]); const bad = [r.caption, ...(r.hashtags || [])].filter((t) => BANNED.test(String(t ?? ''))); if (!bad.length && r.caption) break; log('retry', p.n, bad.slice(0, 2)); }
    p.caption = r.caption; p.hashtags = (r.hashtags || []).map((h) => String(h).replace(/^#/, '')).slice(0, 15); p.alt = r.alt; log('caption', p.n, p.title.slice(0, 20));
  }
  J(f, posts); writePlanMd(posts);
}

// ───────── 素材（Reel 動画を Shopify Files に上げて公開 URL を得る） ─────────
async function assets() {
  const f = path.join(OUT, `plan-${WEEK}.json`); const posts = J(f); if (!posts) { console.error('先に plan'); process.exit(2); }
  for (const p of posts.filter((x) => x.kind === 'reel' && !x.videoUrl)) {
    const spu = p.handle; const cands = [path.join(ROOT, 'tools/product-video/out', spu, 'final', `${spu}-9x16.mp4`), ...fs.existsSync(path.join(ROOT, 'tools/product-video/out')) ? fs.readdirSync(path.join(ROOT, 'tools/product-video/out')).filter((d) => d.toLowerCase() === spu.toLowerCase() || spu.toLowerCase().startsWith(d.toLowerCase())).map((d) => path.join(ROOT, 'tools/product-video/out', d, 'final', `${d}-9x16.mp4`)) : []];
    const mp4 = cands.find((c) => fs.existsSync(c)); if (!mp4) { log('reel 動画なし → carousel に変更', p.n, spu, '（node tools/product-video/video.mjs render で作成可）'); p.kind = 'carousel'; p.images = p.images.length ? p.images : []; continue; }
    const size = fs.statSync(mp4).size; const name = `ig-${WEEK}-${path.basename(mp4)}`;
    const su = await gql(`mutation($i:[StagedUploadInput!]!){ stagedUploadsCreate(input:$i){ stagedTargets{ url resourceUrl parameters{name value} } userErrors{message} } }`, { i: [{ filename: name, mimeType: 'video/mp4', resource: 'FILE', fileSize: String(size), httpMethod: 'POST' }] });
    const t = su.stagedUploadsCreate.stagedTargets[0]; const fd = new FormData(); for (const q of t.parameters) fd.append(q.name, q.value); fd.append('file', new Blob([fs.readFileSync(mp4)]), name);
    const up = await fetch(t.url, { method: 'POST', body: fd }); if (!up.ok) throw new Error('staged upload ' + up.status);
    const fc = await gql(`mutation($f:[FileCreateInput!]!){ fileCreate(files:$f){ files{ id fileStatus } userErrors{message} } }`, { f: [{ originalSource: t.resourceUrl, contentType: 'VIDEO', alt: p.alt || p.title }] });
    const id = fc.fileCreate.files[0].id; let url;
    for (let i = 0; i < 30; i++) { await sleep(5000); const q = await gql(`query($id:ID!){ node(id:$id){ ... on Video { fileStatus sources{ url format } } } }`, { id }); if (q.node.fileStatus === 'READY') { url = (q.node.sources.find((s) => s.format === 'mp4') || q.node.sources[0]).url; break; } if (q.node.fileStatus === 'FAILED') throw new Error('shopify video failed'); }
    if (!url) throw new Error('video not ready'); p.videoUrl = url; log('reel', p.n, url);
  }
  J(f, posts); writePlanMd(posts);
}

function approve() {
  const f = path.join(OUT, `plan-${WEEK}.json`); const posts = J(f); if (!posts) { console.error('先に plan'); process.exit(2); }
  const only = args.only ? new Set(String(args.only).split(',').map(Number)) : null;
  for (const p of posts) if (!only || only.has(p.n)) { if (!p.caption) { log('skip（caption 無し）', p.n); continue; } p.approved = true; }
  J(f, posts); writePlanMd(posts); log('approved', posts.filter((p) => p.approved).length, '/', posts.length);
}

// ───────── Graph API 公開 ─────────
async function graph(p, body) { const u = new URL(`${GRAPH}/${p}`); const r = await fetch(u, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify({ ...body, access_token: IG.token }) : undefined, ...(body ? {} : {}) }); const j = await r.json(); if (!r.ok || j.error) throw new Error(`graph ${p}: ${JSON.stringify(j.error || j).slice(0, 300)}`); return j; }
async function graphGet(p, q = {}) { const u = new URL(`${GRAPH}/${p}`); for (const [k, v] of Object.entries({ ...q, access_token: IG.token })) u.searchParams.set(k, v); const r = await fetch(u); const j = await r.json(); if (!r.ok || j.error) throw new Error(`graph ${p}: ${JSON.stringify(j.error || j).slice(0, 300)}`); return j; }
async function waitContainer(id) { for (let i = 0; i < 60; i++) { const s = await graphGet(id, { fields: 'status_code,status' }); if (s.status_code === 'FINISHED') return; if (s.status_code === 'ERROR') throw new Error('container error ' + s.status); await sleep(5000); } throw new Error('container timeout'); }
async function publish() {
  if (!IG.id || !IG.token) { console.error('.env に IG_USER_ID / IG_ACCESS_TOKEN が必要'); process.exit(2); }
  const files = fs.readdirSync(OUT).filter((f) => /^plan-.*\.json$/.test(f));
  const now = Date.now(); let done = 0;
  for (const f of files) {
    const posts = J(path.join(OUT, f)); let changed = false;
    for (const p of posts) {
      if (!p.approved || p.status === 'published' || !p.caption) continue;
      if (args.due && new Date(p.at).getTime() > now) continue;
      const text = `${p.caption}\n\n${p.hashtags.map((h) => '#' + h).join(' ')}`;
      try {
        let creation;
        if (p.kind === 'reel' && p.videoUrl) { creation = (await graph(`${IG.id}/media`, { media_type: 'REELS', video_url: p.videoUrl, caption: text, share_to_feed: true })).id; await waitContainer(creation); }
        else if (p.kind === 'carousel' && p.images.length >= 2) { const kids = []; for (const u of p.images.slice(0, 10)) kids.push((await graph(`${IG.id}/media`, { image_url: u, is_carousel_item: true })).id); creation = (await graph(`${IG.id}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: text })).id; }
        else { creation = (await graph(`${IG.id}/media`, { image_url: p.images[0], caption: text })).id; }
        const pub = await graph(`${IG.id}/media_publish`, { creation_id: creation });
        p.status = 'published'; p.mediaId = pub.id; p.publishedAt = new Date().toISOString(); changed = true; done++; log('published', f, p.n, pub.id);
        fs.appendFileSync(path.join(OUT, 'publish-log.jsonl'), JSON.stringify({ at: p.publishedAt, week: p.week, n: p.n, handle: p.handle, kind: p.kind, mediaId: pub.id }) + '\n');
      } catch (e) { p.status = 'error'; p.error = e.message; changed = true; log('ERR', f, p.n, e.message); }
      await sleep(3000);
    }
    if (changed) { J(path.join(OUT, f), posts); const w = f.replace(/^plan-|\.json$/g, ''); if (w === WEEK) writePlanMd(posts); }
  }
  log('publish done', done);
}

// ───────── コメント返信草稿（送信しない） ─────────
const REPLY_SYS = `あなたは「アネット」の Instagram 担当。コメントへの返信文を日本語で 1〜2 文、丁寧で温かく。質問には facts の範囲で答え、分からないことは「DM で詳しくご案内します」と書く。価格・在庫・納期の断言、医療効能、他社比較は禁止。出力 JSON：{"reply":"…","needsHuman":true|false,"reason":"…"}`;
async function replies() {
  if (!IG.id || !IG.token) { console.error('.env に IG_USER_ID / IG_ACCESS_TOKEN が必要'); process.exit(2); }
  const since = Math.floor(Date.now() / 1000) - 7 * 86400;
  const media = (await graphGet(`${IG.id}/media`, { fields: 'id,caption,timestamp,permalink', limit: 30 })).data || [];
  const rows = [];
  for (const m of media) {
    const cs = (await graphGet(`${m.id}/comments`, { fields: 'id,text,username,timestamp,replies{text,username}', limit: 50 })).data || [];
    for (const c of cs) { if (new Date(c.timestamp).getTime() / 1000 < since) continue; if ((c.replies?.data || []).some((r) => r.username === IG.handle)) continue; rows.push({ media: m.permalink, caption: (m.caption || '').slice(0, 40), id: c.id, user: c.username, text: c.text }); }
  }
  for (const r of rows) { if (!(await waitLLM(LLM, WIN, log))) break; const d = await chatJson([{ role: 'system', content: REPLY_SYS }, { role: 'user', content: `投稿:${r.caption}\nコメント(@${r.user}):${r.text}` }]); r.draft = d.reply; r.needsHuman = d.needsHuman; r.reason = d.reason; }
  const date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(DOCS, `replies-${date}.md`), [`# コメント返信草稿 ${date}（送信は用户が手で。AI は送らない）`, '', '| 投稿 | ユーザー | コメント | 返信草稿 | 要人判断 |', '|---|---|---|---|---|', ...rows.map((r) => `| [${r.caption}](${r.media}) | @${r.user} | ${r.text.replace(/\|/g, '｜')} | ${(r.draft || '').replace(/\|/g, '｜')} | ${r.needsHuman ? '⚠ ' + (r.reason || '') : ''} |`)].join('\n'));
  log('replies', rows.length, '→', `docs/instagram/replies-${date}.md`);
}

async function profile() {
  const md = `# Instagram プロフィール案（@${IG.handle}）

| 案 | 名前 | 自己紹介（150 字以内） | リンク |
|---|---|---|---|
| A（推奨） | アネット｜暮らしの雑貨 | 日本一の安さを、目指して。収納・キッチン・ペット・DIY まで、暮らしをラクにする道具を毎日お届け🛒 全国送料無料／平日12時までのご注文は当日出荷 ↓公式サイト | ${SITE}/?utm_source=instagram&utm_medium=bio |
| B | ANET アネット公式 | 1,000 点以上の生活雑貨をお手頃に。使ってみてよかったものだけ紹介します。質問は DM へ📩 | 同上 |
| C | アネット【安い】 | スマホアプリ「安い」もあります📱 新着は毎週月・木に更新 | 同上 |

- ハイライト：新着 / 収納 / キッチン / ペット / お客さまの声（承認後）
- カテゴリ：ショッピング・小売
- 注意：「日本一の安さを、目指して」は目標表現（断定でない）なので可。「最安」「No.1」は不可。
`;
  fs.writeFileSync(path.join(DOCS, 'profile.md'), md); log('→ docs/instagram/profile.md');
}

async function insights() {
  if (!IG.id || !IG.token) { console.error('.env に IG_USER_ID / IG_ACCESS_TOKEN が必要'); process.exit(2); }
  const media = (await graphGet(`${IG.id}/media`, { fields: 'id,caption,media_type,timestamp,permalink,like_count,comments_count', limit: 30 })).data || [];
  const rows = [];
  for (const m of media) { let reach = '', saved = ''; try { const ins = (await graphGet(`${m.id}/insights`, { metric: 'reach,saved' })).data || []; reach = ins.find((x) => x.name === 'reach')?.values?.[0]?.value ?? ''; saved = ins.find((x) => x.name === 'saved')?.values?.[0]?.value ?? ''; } catch {} rows.push({ ...m, reach, saved }); }
  fs.writeFileSync(path.join(DOCS, 'insights.md'), [`# Instagram 投稿実績（${new Date().toISOString().slice(0, 10)}）`, '', '| 日時 | 種別 | リーチ | いいね | 保存 | コメント | 投稿 |', '|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.timestamp.slice(0, 16)} | ${r.media_type} | ${r.reach} | ${r.like_count} | ${r.saved} | ${r.comments_count} | [${(r.caption || '').slice(0, 30)}](${r.permalink}) |`)].join('\n'));
  log('→ docs/instagram/insights.md');
}

const run = { products, plan, caption, assets, approve, publish, replies, profile, insights }[cmd];
if (!run) { console.error('usage: ig.mjs products|plan|caption|assets|approve|publish|replies|profile|insights'); process.exit(2); }
run().catch((e) => { console.error(e); process.exit(1); });
