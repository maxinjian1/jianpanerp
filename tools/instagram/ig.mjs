#!/usr/bin/env node
/**
 * Instagram「アネット」運用ツール（2026-10-27 用户決定：做；主目的 = anetmc.com（Shopify）への送客）。
 * 「IG 小编技能包」の日本版。AI は 計画・文案・返信草稿 まで。投稿は用户承認後に Meta Graph API で、返信・他人の投稿へのコメントは絶対に自動送信しない。
 *
 *   node tools/instagram/ig.mjs setup                    # .env の META_APP_ID / META_APP_SECRET / IG_ACCESS_TOKEN（短期でも可）→ 長期トークンに交換、/me/accounts から IG ユーザー ID・ユーザー名を取得して .env に書き戻す（伏せ字で表示）
 *   node tools/instagram/ig.mjs products                 # Shopify ANET 在售商品 + 楽天 A 档 + 新着 → out/products.json
 *   node tools/instagram/ig.mjs plan   [--week 2026-11-03] [--n 7]   # 週計画（商品選定・投稿種別・日時）→ out/plan-<week>.json + docs/instagram/plan-<week>.md
 *   node tools/instagram/ig.mjs plan --catalog [--per-day 6] [--from 2026-11-02]   # 全商品カバー：カテゴリ別 5 商品×2 枚のカルーセル、1 日 N 本 → plan-catalog.json（caption/approve/assets は --file catalog）
 *   node tools/instagram/ig.mjs caption --week …        # 6kpro で日本語キャプション + ハッシュタグ（夜間窓口、禁止語チェック）
 *   node tools/instagram/ig.mjs assets  --week …        # 画像は Shopify CDN URL、Reel は real モード動画を Shopify Files へ staged upload → 公開 URL
 *   node tools/instagram/ig.mjs approve --week … [--only 1,3,5]   # 用户が docs/instagram/plan-<week>.md を見て「承認」と言った後に実行
 *   node tools/instagram/ig.mjs publish [--due] [--no-fb] # approved かつ 予定時刻 ≤ 今 の投稿を Graph API で公開（Windows の時間タスクで 1 時間ごと）。本文末尾に anetmc.com 案内を付け、FB_PAGE_* があれば Facebook ページにも同時投稿
 *   node tools/instagram/ig.mjs fb-backfill [--max N]  # IG 公開済みで Facebook に無い投稿をページに追加投稿
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
import { execSync } from 'node:child_process';
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
const BANNED = /¥|円|送料|セール|SALE|割引|クーポン|No\.?\s?1|ナンバーワン|最強|最高級|日本一|業界初|世界一|絶対|完全|永久|治る|治療|効く|痩せる|バストアップ|美白|抗菌率|殺菌|医療|iPhone|Apple|ダイソン|Dyson|ニトリ|無印|IKEA|Amazon|楽天|メルカリ|PSE|認証/i;   // PSE 等の認証は証明書未保有のため書かない（2026-10-28 用户）
// 他社名・紛らわしい語は caption 生成前後で言い換える（2026-10-28 用户：iPhone→スマホ、円形→丸型）
const soften = (t) => String(t ?? '').replace(/iPhone/gi, 'スマホ').replace(/円形/g, '丸型');
const weekStart = (s) => { const d = s ? new Date(s + 'T00:00:00Z') : new Date(Date.now() + 9 * 3600e3); const day = (d.getUTCDay() + 6) % 7; const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + (s ? 0 : 7))); return m.toISOString().slice(0, 10); };
const WEEK = args.week ? weekStart(args.week) : weekStart();
const PLAN_NAME = args.file || (args.catalog ? 'catalog' : WEEK);   // plan-<name>.json / docs/instagram/plan-<name>.md
const planPath = () => path.join(OUT, `plan-${PLAN_NAME}.json`);

// ───────── setup（トークン交換 + IG ID 取得） ─────────
// 短い値（誤ってパスワード等を入れた場合）は先頭も出さない。長い値でも先頭 4 文字まで
const mask = (v) => v ? (String(v).length >= 20 ? `${String(v).slice(0, 4)}…(${String(v).length})` : `***(${String(v).length})`) : '(未設定)';
function writeEnv(kv) {
  const f = path.join(ROOT, '.env'); let txt = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  for (const [k, v] of Object.entries(kv)) { const re = new RegExp(`^${k}=.*$`, 'm'); txt = re.test(txt) ? txt.replace(re, `${k}=${v}`) : txt.replace(/\s*$/, '') + `\n${k}=${v}\n`; }
  fs.writeFileSync(f, txt);
}
async function setup() {
  const appId = env.META_APP_ID, secret = env.META_APP_SECRET, short = env.IG_ACCESS_TOKEN;
  console.log('META_APP_ID =', mask(appId), ' META_APP_SECRET =', mask(secret), ' IG_ACCESS_TOKEN =', mask(short));
  if (!appId || !secret || !short) { console.error('.env に META_APP_ID / META_APP_SECRET / IG_ACCESS_TOKEN（グラフ API エクスプローラで発行した短期トークン）が必要'); process.exit(2); }
  const ex = await (await fetch(`${GRAPH}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${secret}&fb_exchange_token=${short}`)).json();
  if (ex.error) throw new Error('exchange: ' + JSON.stringify(ex.error).slice(0, 300));
  const long = ex.access_token; log('長期トークン取得', mask(long), 'expires_in', ex.expires_in ? Math.round(ex.expires_in / 86400) + '日' : '(無期限/ページ)');
  const acc = await (await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}&access_token=${long}`)).json();
  if (acc.error) throw new Error('accounts: ' + JSON.stringify(acc.error).slice(0, 300));
  const pages = acc.data || []; if (!pages.length) throw new Error('Facebook ページが見つからない：アプリのユーザーがページ管理者か、権限 pages_show_list を付けたか確認');
  for (const pg of pages) log('page', pg.name, pg.id, 'ig', pg.instagram_business_account ? `${pg.instagram_business_account.id} @${pg.instagram_business_account.username}` : '(未リンク)');
  const pg = pages.find((x) => x.instagram_business_account); if (!pg) throw new Error('Instagram がリンクされたページが無い：Meta Business Suite → 設定 → Instagram でリンク');
  writeEnv({ IG_ACCESS_TOKEN: long, IG_USER_ID: pg.instagram_business_account.id, IG_HANDLE: pg.instagram_business_account.username, ...(pg.access_token ? { FB_PAGE_ID: pg.id, FB_PAGE_TOKEN: pg.access_token, FB_PAGE_NAME: pg.name } : {}) });
  log(pg.access_token ? `Facebook ページ「${pg.name}」のトークンも保存 → publish が IG と同時にページへも投稿（権限 pages_manage_posts が必要）` : 'ページトークン無し（権限 pages_manage_posts / pages_read_engagement を付けて再発行すると Facebook 同時投稿が有効）');
  const me = await (await fetch(`${GRAPH}/${pg.instagram_business_account.id}?fields=id,username,name,followers_count,media_count&access_token=${long}`)).json();
  log('OK  @' + me.username, 'followers', me.followers_count, 'media', me.media_count, '→ .env の IG_ACCESS_TOKEN / IG_USER_ID / IG_HANDLE を更新（トークンは 60 日。期限前に setup を再実行）');
}

// ───────── Shopify ─────────
let tok; async function token() { if (tok) return tok; const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }) }); if (!r.ok) throw new Error(`shopify token ${r.status}`); tok = (await r.json()).access_token; return tok; }
async function gql(query, variables = {}) { const r = await fetch(`https://${SHOP}/admin/api/${env.SHOPIFY_API_VERSION || '2026-10'}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': await token() }, body: JSON.stringify({ query, variables }) }); const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.data; }

async function products() {
  const all = []; let c = null;
  for (;;) {
    const d = await gql(`query($c:String){ products(first:50, after:$c, query:"vendor:ANET status:active"){ pageInfo{hasNextPage endCursor} nodes{ id handle title productType tags createdAt onlineStoreUrl descriptionHtml featuredImage{url} images(first:6){nodes{url altText}} variants(first:5){nodes{sku price inventoryQuantity inventoryItem{tracked}}} } } }`, { c });
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
    // Shopify は在庫を追跡していない（tracked=false → 数量は常に 0）。追跡していない商品は在庫ありとみなす
    inStock: p.variants.nodes.some((v) => v.inventoryItem?.tracked === false || (v.inventoryQuantity ?? 0) > 0),
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
  if (args.catalog) return planCatalog(ps);
  const used = new Set(fs.readdirSync(OUT).filter((f) => /^plan-.*\.json$/.test(f)).flatMap((f) => (J(path.join(OUT, f)) || []).map((x) => x.handle)));
  const fresh = ps.filter((p) => !used.has(p.handle) && p.images.length >= 1 && (p.inStock ?? p.stock > 0));
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
  J(planPath(), posts);
  writePlanMd(posts);
  log('plan', WEEK, posts.length, 'posts →', `docs/instagram/plan-${PLAN_NAME}.md`);
}
// 全商品カバー（2026-10-27 用户「anetmc.com の商品を全部 IG に」）：カテゴリ別に 5 商品×2 枚 = 10 枚カルーセル、1 日 N 本（既定 6、API 上限 50/日・見た目の上限を考え 8 まで）
function planCatalog(ps) {
  const perDay = Math.min(10, Number(args['per-day'] || 6)); const start = args.from || weekStart();
  const posted = new Set(fs.readdirSync(OUT).filter((f) => /^plan-.*\.json$/.test(f) && f !== `plan-${PLAN_NAME}.json`).flatMap((f) => (J(path.join(OUT, f)) || []).filter((x) => x.status === 'published').flatMap((x) => x.handles || [x.handle])));
  const items = ps.filter((p) => p.images.length >= 1 && (p.inStock ?? p.stock > 0) && !posted.has(p.handle));
  const byType = {}; for (const p of items) (byType[p.type || 'その他'] ||= []).push(p);
  const groups = []; for (const [type, arr] of Object.entries(byType)) { arr.sort((a, b) => (b.tierA - a.tierA) || b.createdAt.localeCompare(a.createdAt)); for (let i = 0; i < arr.length; i += 5) groups.push({ type, items: arr.slice(i, i + 5) }); }
  // カテゴリを交互に出す（同じカテゴリが連続しないように round-robin）
  const queues = Object.values(groups.reduce((m, g) => ((m[g.type] ||= []).push(g), m), {})); const order = []; while (queues.some((q) => q.length)) for (const q of queues) if (q.length) order.push(q.shift());
  const times = ['08:00', '12:00', '18:00', '20:00', '21:30', '10:00', '15:00', '22:00', '07:00', '13:00'].slice(0, perDay).sort();
  const posts = order.map((g, i) => { const d = new Date(start + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + Math.floor(i / perDay)); const day = d.toISOString().slice(0, 10);
    return { n: i + 1, week: 'catalog', at: `${day}T${times[i % perDay]}:00+09:00`, dow: '', kind: 'carousel', theme: `カテゴリ:${g.type}`, handle: g.items[0].handle, handles: g.items.map((p) => p.handle), title: `${g.type}｜${g.items.map((p) => p.title.slice(0, 14)).join('・')}`, url: `${SITE}/collections/all?utm_source=instagram&utm_medium=social&utm_campaign=catalog`, images: g.items.flatMap((p) => p.images.slice(0, 2)).slice(0, 10), facts: g.items.map((p, k) => `${k + 1}. ${p.title}：${p.desc.slice(0, 120)}`).join('\n'), approved: false, status: 'planned' }; });
  // 既存 plan-catalog の caption / approved / status を同じ商品組み合わせに引き継ぐ（draft-sync 後の画像 URL 差し替え用）
  const prev = J(planPath()); if (prev) { const key = (x) => (x.handles || [x.handle]).slice().sort().join('|'); const m = new Map(prev.map((x) => [key(x), x])); let kept = 0; for (const p of posts) { const o = m.get(key(p)); if (o) { Object.assign(p, { caption: o.caption, hashtags: o.hashtags, alt: o.alt, approved: o.approved, status: o.status, mediaId: o.mediaId, publishedAt: o.publishedAt, at: o.status === 'published' ? o.at : p.at }); kept++; } } log('kept from previous plan', kept); }
  J(planPath(), posts); writePlanMd(posts);
  log('catalog plan', posts.length, 'posts /', items.length, 'products /', perDay, 'per day →', `${Math.ceil(posts.length / perDay)} 日`, `docs/instagram/plan-${PLAN_NAME}.md`);
}
function writePlanMd(posts) {
  const md = [`# Instagram 計画 ${PLAN_NAME}（@${IG.handle}）`, '', '用户が見て「承認」→ `ig.mjs approve --week ' + WEEK + '`（catalog は `--file catalog`）。承認した投稿だけ予定時刻に公開。キャプションの価格・送料は書かない（変わるため）。リンクはプロフィールの anetmc.com（UTM 付き）。', '',
    '| # | 日時(JST) | 種別 | テーマ | 商品 | キャプション | タグ | 素材 | 状態 |', '|---|---|---|---|---|---|---|---|---|',
    ...posts.map((p) => `| ${p.n} | ${p.at.slice(5, 16).replace('T', ' ')} ${p.dow} | ${p.kind} | ${p.theme} | [${p.title.slice(0, 28)}](${p.url.split('?')[0]}) | ${(p.caption || '（caption 未生成）').replace(/\n/g, ' ').slice(0, 90)} | ${(p.hashtags || []).slice(0, 5).join(' ')} | ${p.kind === 'reel' ? (p.videoUrl ? '動画OK' : '動画未') : p.images.length + '枚'} | ${p.approved ? '✅承認' : '未承認'}${p.status !== 'planned' ? ' / ' + p.status : ''}${p.fbPostId ? ' / FB' : p.fbError ? ' / FB失敗' : ''} |`), '',
    '## キャプション全文', '', ...posts.flatMap((p) => [`### ${p.n}. ${p.title}`, '', p.caption || '（未生成）', '', (p.hashtags || []).map((h) => '#' + h.replace(/^#/, '')).join(' '), ''])];
  fs.writeFileSync(path.join(DOCS, `plan-${PLAN_NAME}.md`), md.join('\n'));
}

// ───────── 6kpro ─────────
async function chatJson(messages) {
  const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model: MODEL, messages, temperature: 0.7, max_tokens: 6000, response_format: { type: 'json_object' } }) });
  // 推論でトークンを使い切ると content が途中で切れる → 例外にせず {} を返して呼び出し側で再試行
  const j = await r.json().catch(() => ({})); const t = j.choices?.[0]?.message?.content || '{}'; try { return JSON.parse(t); } catch { try { return JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1)); } catch { log('JSON 解析失敗', j.choices?.[0]?.finish_reason, t.length); return {}; } }
}
const CAP_SYS = `あなたは日本の生活雑貨ブランド「アネット」（公式オンラインショップ anetmc.com）の Instagram 担当。読者は 20〜50 代の女性中心、暮らしを少しラクにしたい人。カタログの羅列ではなく、友人にすすめるような自然な投稿文を書く。
構成（必ずこの順）：
・1 行目：読者の「あるある」への問いかけ、または場面描写を 1 文（15〜30 字、商品名を出さない）
・空行
・本文：複数商品（facts が 1. 2. 3.…）なら各商品を「✔ 短い商品名｜どんな人・どんな場面に向くか」の 1 行ずつ（facts の数字・素材はあっても 1 つだけ添える）。単品なら「使う場面 → 良さ → ひとこと」の 3〜4 行。
・最後：読者への軽いひとこと 1 文で締める（リンク案内は書かない。システムが別途付ける）。
文体：やさしい丁寧語、1 文は短く、絵文字は全体で 2 個まで、「！」は 1 個まで。スペックの列挙、型番、「〜を実現」「〜をサポート」「〜を提供」のような説明書口調は禁止。
禁止：価格・送料・セール・No.1・最強・日本一・絶対・医療効能・他社ブランド名、facts に無い数字や機能。
ハッシュタグ 12〜15 個：大（#暮らし #暮らしを楽しむ #収納 など）5、中（カテゴリ）5、小（具体）3〜5。必ず #アネット を含める。英語は 2 個まで。
出力 JSON：{"caption":"…","hashtags":["…"],"alt":"画像の代替テキスト 60 字以内"}`;
// 投稿文の末尾に必ず付ける店舗案内（2026-10-28 用户「IG 投稿に anetmc.com が無い」）。Instagram の本文 URL はリンクにならないため「プロフィールのリンク」も併記。Facebook 側は URL がそのままリンクになる
const FOOTER = `\n\n━━━━━━━━━━\n🛒 公式オンラインショップ「アネット」\nanetmc.com（プロフィールのリンクからどうぞ）`;
const SHOP_URL = `${SITE}/?utm_source=instagram&utm_medium=social&utm_campaign=catalog`;
async function caption() {
  const f = planPath(); const posts = J(f); if (!posts) { console.error('先に plan'); process.exit(2); }
  // 6kpro 待ちの間に publish が status を更新するため、保存時はファイルを読み直して caption 系だけ書き戻す（古い posts で上書きしない）
  const gen = new Map(); const save = () => { const cur = J(f); for (const q of cur) { const g = gen.get(q.n); if (g && q.status !== 'published') Object.assign(q, g); } J(f, cur); writePlanMd(cur); };
  const only = args.only ? new Set(String(args.only).split(',').map(Number)) : null;   // --only 26,141 で指定番号だけ（--force と併用で作り直し）
  for (const p of posts) {
    if (only && !only.has(p.n)) continue;
    if (p.caption && !args.force) continue;
    if (p.status === 'published') continue;
    if (!(await waitLLM(LLM, WIN, log))) { log('6kpro 窓口外/停止 → 中断'); break; }
    let r; for (let k = 0; k < 3; k++) {
      r = await chatJson([{ role: 'system', content: CAP_SYS }, { role: 'user', content: `種別:${p.kind} テーマ:${p.theme}\n商品名:${soften(p.title)}\nfacts:${soften(p.facts).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')}${args.hint ? '\n追加指示:' + args.hint : ''}` }]);
      if (r.caption) { r.caption = soften(r.caption); r.hashtags = (r.hashtags || []).map(soften); r.alt = soften(r.alt); }
      var bad = [r.caption, r.alt, ...(r.hashtags || [])].map((t) => String(t ?? '').match(BANNED)?.[0]).filter(Boolean); if (!bad.length && r.caption) break; log('retry', p.n, bad.slice(0, 3));
    }
    if (bad.length || !r.caption) { log('caption 不可（3 回とも禁語/空）→ 旧文のまま', p.n); if (args.force) { p.approved = false; gen.set(p.n, { approved: false }); } continue; }   // --force 時は旧文の承認も外す（旧文体のまま投稿させない）
    p.caption = r.caption; p.hashtags = (r.hashtags || []).map((h) => String(h).replace(/^#/, '')).slice(0, 15); p.alt = r.alt; log('caption', p.n, p.title.slice(0, 20));
    if (args.force) p.approved = false;   // 作り直した投稿文は再承認が必要
    gen.set(p.n, { caption: p.caption, hashtags: p.hashtags, alt: p.alt, ...(args.force ? { approved: false } : {}) }); if (gen.size % 10 === 0) save();   // 途中で落ちても生成済みを失わない
  }
  save();
}

// ───────── 素材（Reel 動画を Shopify Files に上げて公開 URL を得る） ─────────
async function assets() {
  const f = planPath(); const posts = J(f); if (!posts) { console.error('先に plan'); process.exit(2); }
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
  const f = planPath(); const posts = J(f); if (!posts) { console.error('先に plan'); process.exit(2); }
  const only = args.only ? new Set(String(args.only).split(',').map(Number)) : null;
  for (const p of posts) if (!only || only.has(p.n)) { if (!p.caption) { log('skip（caption 無し）', p.n); continue; } p.approved = true; }
  J(f, posts); writePlanMd(posts); log('approved', posts.filter((p) => p.approved).length, '/', posts.length);
}

// ───────── Graph API 公開 ─────────
async function graph(p, body) { const u = new URL(`${GRAPH}/${p}`); const r = await fetch(u, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify({ ...body, access_token: IG.token }) : undefined, ...(body ? {} : {}) }); const j = await r.json(); if (!r.ok || j.error) throw new Error(`graph ${p}: ${JSON.stringify(j.error || j).slice(0, 300)}`); return j; }
const retry = async (fn, n = 2, wait = 8000) => { for (let k = 0; ; k++) { try { return await fn(); } catch (e) { if (k >= n) throw e; log('retry', k + 1, e.message.slice(0, 120)); await sleep(wait); } } };
async function graphGet(p, q = {}) { const u = new URL(`${GRAPH}/${p}`); for (const [k, v] of Object.entries({ ...q, access_token: IG.token })) u.searchParams.set(k, v); const r = await fetch(u); const j = await r.json(); if (!r.ok || j.error) throw new Error(`graph ${p}: ${JSON.stringify(j.error || j).slice(0, 300)}`); return j; }
async function waitContainer(id) { for (let i = 0; i < 60; i++) { const s = await graphGet(id, { fields: 'status_code,status' }); if (s.status_code === 'FINISHED') return; if (s.status_code === 'ERROR') throw new Error('container error ' + s.status); await sleep(5000); } throw new Error('container timeout'); }
// Shopify CDN は Accept により .jpg でも WebP を返す → IG は弾く（2207052）。format=pjpg で JPEG 固定（2026-10-28）
const igImg = (u) => /cdn.shopify.com/.test(u) && !/[?&]format=/.test(u) ? u + (u.includes('?') ? '&' : '?') + 'format=pjpg' : u;
// ───────── Facebook ページへの同時投稿（2026-10-28 用户「IG にはあるが Facebook に無い」） ─────────
// IG API の投稿はページに自動共有されないため、同じ画像・本文をページの投稿として別に作る。本文の URL は Facebook ではリンクになる。
// 必要：.env の FB_PAGE_ID / FB_PAGE_TOKEN（setup が /me/accounts から保存）、アプリ権限 pages_manage_posts + pages_read_engagement。
const FB = { id: env.FB_PAGE_ID, token: env.FB_PAGE_TOKEN };
async function fbApi(p, body) { const r = await fetch(`${GRAPH}/${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, access_token: FB.token }) }); const j = await r.json(); if (!r.ok || j.error) throw new Error(`fb ${p}: ${JSON.stringify(j.error || j).slice(0, 300)}`); return j; }
async function fbCrossPost(p) {
  if (!FB.id || !FB.token) return null;
  const message = `${p.caption}\n\n🛒 公式オンラインショップ「アネット」\n${SHOP_URL}\n\n${p.hashtags.map((h) => '#' + h).join(' ')}`;
  let post;
  if (p.kind === 'reel' && p.videoUrl) post = await fbApi(`${FB.id}/videos`, { file_url: p.videoUrl, description: message });
  else { const ids = []; for (const u of p.images.slice(0, 10)) ids.push((await fbApi(`${FB.id}/photos`, { url: igImg(u), published: false })).id); post = await fbApi(`${FB.id}/feed`, { message, attached_media: ids.map((id) => ({ media_fbid: id })) }); }
  p.fbPostId = post.id || post.post_id; delete p.fbError; log('facebook', p.n, p.fbPostId); return p.fbPostId;
}
// IG に公開済みだが Facebook に無い投稿（最初の試投稿など）をページに追加投稿する
async function fbBackfill() {
  if (!FB.id || !FB.token) { console.error('.env に FB_PAGE_ID / FB_PAGE_TOKEN が必要（setup を再実行）'); process.exit(2); }
  const files = fs.readdirSync(OUT).filter((f) => /^plan-.*\.json$/.test(f)); let n = 0;
  for (const f of files) { const posts = J(path.join(OUT, f)); let changed = false;
    for (const p of posts) { if (p.status !== 'published' || p.fbPostId) continue; if (args.max && n >= Number(args.max)) break; n++;
      try { await fbCrossPost(p); } catch (e) { p.fbError = e.message.slice(0, 300); log('FB ERR', f, p.n, p.fbError); } changed = true; await sleep(3000); }
    if (changed) { J(path.join(OUT, f), posts); if (f === `plan-${PLAN_NAME}.json`) writePlanMd(posts); } }
  log('fb-backfill done', n);
}

async function publish() {
  if (!IG.id || !IG.token) { console.error('.env に IG_USER_ID / IG_ACCESS_TOKEN が必要'); process.exit(2); }
  const files = fs.readdirSync(OUT).filter((f) => /^plan-.*\.json$/.test(f));
  const now = Date.now(); let done = 0, tried = 0; const MAX_RUN = Number(args.max || 2);   // 遅れ分を 1 時間に一気に出さない（1 日 10 件計画なら 2 件/時で追いつく）
  const LOGF = path.join(OUT, 'publish-log.jsonl'), STOP = path.join(OUT, 'publish-STOPPED.txt');
  // 同時実行防止（2026-10-29：手動 publish と 1 時間タスクが重なり 2 件を二重投稿）
  const LOCK = path.join(OUT, 'publish.lock');
  if (fs.existsSync(LOCK) && Date.now() - fs.statSync(LOCK).mtimeMs < 3 * 3600e3) { log('別の publish が実行中（publish.lock）→ 今回は見送り'); return; }
  fs.writeFileSync(LOCK, `${process.pid} ${new Date().toISOString()}
`);
  process.on('exit', () => { try { fs.unlinkSync(LOCK); } catch {} });
  if (fs.existsSync(STOP)) { log('停止中 →', fs.readFileSync(STOP, 'utf8').trim(), '（原因を直して publish-STOPPED.txt を消し、タスクを有効化すると再開）'); return; }
  const plog = fs.existsSync(LOGF) ? fs.readFileSync(LOGF, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const posted = new Set(plog.filter((l) => l.ok === true).map((l) => `${l.file}#${l.n}`));   // ログで公開済みなら plan の status に関係なく再投稿しない
  const last24 = plog.filter((l) => l.ok === true && now - new Date(l.at).getTime() < 86400e3).length;
  if (last24 >= 40) { log('24 時間で 40 件公開済み（API 上限 50）→ 今回は見送り'); return; }
  let fails = 0; for (let i = plog.length - 1; i >= 0 && plog[i].ok === false; i--) fails++;   // 末尾の連続失敗（前回実行分も含む）。{reset:true} 行（ok 無し）で区切られる
  if (fails >= 3) log(`publish-log.jsonl 末尾が連続失敗 ${fails} 件のため今回は公開しない（再開するには {"reset":true} 行を追記）`);
  const halt = () => {   // 連続 3 件失敗 → 停止フラグ + Windows タスク無効化
    const msg = `${new Date().toISOString()} 連続 ${fails} 件失敗で停止`; fs.writeFileSync(STOP, msg + '\n'); log(msg);
    if (process.platform === 'win32') try { execSync('schtasks /Change /TN anet-ig-publish /DISABLE', { stdio: 'ignore' }); log('タスク anet-ig-publish を無効化'); } catch { log('タスク無効化に失敗（手動で停止が必要）'); }
  };
  for (const f of files) {
    const posts = J(path.join(OUT, f)); let changed = false;
    for (const p of posts) {
      if (!p.approved || p.status === 'published' || p.status === 'error' || !p.caption) continue;
      if (posted.has(`${f}#${p.n}`)) { p.status = 'published'; changed = true; continue; }   // error は自動再試行しない（直して status を戻す）
      if (args.due && new Date(p.at).getTime() > now) continue;
      if (tried >= MAX_RUN || last24 + done >= 40 || fails >= 3) break;   // --max は失敗も含めた試行数
      tried++;
      const text = `${p.caption}${FOOTER}\n\n${p.hashtags.map((h) => '#' + h).join(' ')}`;
      try {
        let creation;
        if (p.kind === 'reel' && p.videoUrl) { creation = (await graph(`${IG.id}/media`, { media_type: 'REELS', video_url: p.videoUrl, caption: text, share_to_feed: true })).id; await waitContainer(creation); }
        else if (p.kind === 'carousel' && p.images.length >= 2) { const kids = []; for (const u of p.images.slice(0, 10)) kids.push((await retry(() => graph(`${IG.id}/media`, { image_url: igImg(u), is_carousel_item: true }), 2, 8000)).id); /* 2207052（Meta が画像を取れなかった）は一時的なことが多い → 画像ごとに 8 秒おいて 2 回まで再試行 */ creation = (await graph(`${IG.id}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: text })).id; }
        else { creation = (await graph(`${IG.id}/media`, { image_url: igImg(p.images[0]), caption: text })).id; }
        const pub = await graph(`${IG.id}/media_publish`, { creation_id: creation });
        p.status = 'published'; p.mediaId = pub.id; p.publishedAt = new Date().toISOString(); changed = true; done++; log('published', f, p.n, pub.id);
        if (!args['no-fb']) await fbCrossPost(p).catch((e) => { p.fbError = e.message.slice(0, 300); log('FB ERR（IG は成功、FB のみ失敗）', p.n, p.fbError); });
        fs.appendFileSync(LOGF, JSON.stringify({ at: p.publishedAt, ok: true, file: f, week: p.week, n: p.n, handle: p.handle, kind: p.kind, mediaId: pub.id }) + '\n'); fails = 0;
      } catch (e) {
        p.status = 'error'; p.error = e.message; changed = true; fails++; log('ERR', f, p.n, e.message);
        fs.appendFileSync(LOGF, JSON.stringify({ at: new Date().toISOString(), ok: false, file: f, week: p.week, n: p.n, handle: p.handle, kind: p.kind, error: e.message.slice(0, 300) }) + '\n');
        if (fails >= 3) halt();
      }
      if (changed) J(path.join(OUT, f), posts);   // 1 件ごとに保存（途中で止まっても二重投稿しない）
      await sleep(3000);
    }
    if (changed) { J(path.join(OUT, f), posts); if (f === `plan-${PLAN_NAME}.json`) writePlanMd(posts); }
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

const run = { setup, products, plan, caption, assets, approve, publish, 'fb-backfill': fbBackfill, replies, profile, insights }[cmd];
if (!run) { console.error('usage: ig.mjs setup|products|plan|caption|assets|approve|publish|fb-backfill|replies|profile|insights'); process.exit(2); }
Promise.resolve().then(run).catch((e) => { console.error(e); process.exit(1); });
