/**
 * Amazon.co.jp 既存出品（SARADEMUNT）のリスティング最適化 — 売上上位 10 ASIN は凍結、それ以外を全部直す
 *
 *   node tools/amazon-listing/optimize/optimize.mjs rank                 # 在庫レポート + ビジネスレポートから凍結 10 件と対象リストを作る → out/opt/plan.md, targets.json
 *   node tools/amazon-listing/optimize/optimize.mjs fetch [--all] [--limit N]  # --all は凍結 10 件も取得（監査用）
 *   node tools/amazon-listing/optimize/optimize.mjs audit [--limit N] / audit-report   # 読み取り専用の深掘り診断 → docs/amazon-audit-report.md
 *   node tools/amazon-listing/optimize/optimize.mjs fetch [--limit N]    # 商品ページ（自社 ASIN）から現在の title/bullets/説明/画像を取得（Windows, CDP 9222 のブラウザを使う）
 *   node tools/amazon-listing/optimize/optimize.mjs write [--limit N]    # 6kpro で新 title / bullets / 説明 / 検索キーワード / サブ画像ブリーフを生成 → out/opt/<asin>/listing.json
 *   node tools/amazon-listing/optimize/optimize.mjs cards [--limit N]    # サブ画像（サイズ表・素材・安心梱包・4つの約束）を Chromium で描画 → out/opt/<asin>/cards/*.png
 *   node tools/amazon-listing/optimize/optimize.mjs build                # 出品ファイル PartialUpdate TSV（テキスト）+ 画像 URL 用 TSV → out/opt/update-*.tsv
 *   node tools/amazon-listing/optimize/optimize.mjs report               # 変更前後の一覧 → out/opt/review.md
 *
 * 入力（Windows の Seller Central から手で落とす、git 管理外）：
 *   tools/amazon-listing/in/active-listings.txt        出品中の商品レポート（TSV、UTF-8 / Shift_JIS どちらでも）
 *   tools/amazon-listing/in/business-report-90d.csv    詳細ページ 売上・トラフィック（子商品別）90 日
 *   tools/amazon-listing/in/business-report-30d.csv    同 30 日（任意、同点の並び替え用）
 *
 * ルール（skill sarademunt-jp-ad-video より）：
 *   - メイン画像は触らない（レディース服は実人着用のメイン画像が必須。AI では作らない）
 *   - サブ画像は A 層（商品本体・素材・パッケージ）と B 層（空間・小物）だけ。人物は描かない
 *   - 文案は 安心・清潔・快適・上品。性的示唆なし、「最強/No.1/絶対/完全」なし、「バストアップ/痩せる」などの効果断言なし
 *   - プライバシー梱包（中身がわからない梱包）は必ず訴求
 *   - 顧客データは一切扱わない。6kpro に送るのは商品情報のみ
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
const IN = path.resolve(__dirname, '../in');
const OUT = path.resolve(__dirname, '../out/opt'); fs.mkdirSync(OUT, { recursive: true });
const stage = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash';
const BRAND = 'SARADEMUNT';
const FROZEN_N = Number(args.freeze ?? 10);
const PUBLIC_BASE = (env.AMAZON_IMAGE_BASE_URL || 'https://japanerp.com/brand/amazon').replace(/\/$/, ''); // web-client/public/brand/amazon/<asin>/<file> として配信
const PUBLIC_DIR = path.join(ROOT, 'apps/web-client/public/brand/amazon');

// ---------- 入出力ユーティリティ ----------
function readText(f) { const b = fs.readFileSync(f); try { const s = new TextDecoder('utf-8', { fatal: true }).decode(b); return s.replace(/^﻿/, ''); } catch { return new TextDecoder('shift_jis').decode(b); } }
function parseDelimited(text, delim) { // 簡易 CSV/TSV（引用符対応）
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; } else if (c === '"') q = true; else if (c === delim) { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => x !== ''));
}
function table(f, delim) { const rows = parseDelimited(readText(f), delim); const hdr = rows[0].map((h) => h.trim()); return rows.slice(1).map((r) => Object.fromEntries(hdr.map((h, i) => [h, (r[i] ?? '').trim()]))); }
const col = (obj, re) => { const k = Object.keys(obj).find((k) => re.test(k)); return k ? obj[k] : ''; };
const num = (s) => Number(String(s ?? '').replace(/[,%￥¥\s]/g, '')) || 0;
const TARGETS = path.join(OUT, 'targets.json');
const loadTargets = () => { let t = JSON.parse(fs.readFileSync(TARGETS, 'utf8')); if (args.all && fs.existsSync(path.join(OUT, 'frozen-top10.json'))) t = [...JSON.parse(fs.readFileSync(path.join(OUT, 'frozen-top10.json'), 'utf8')), ...t]; if (args.asin) t = t.filter((x) => x.asin === args.asin); if (args.limit) t = t.slice(0, Number(args.limit)); return t; };
const dirOf = (asin) => { const d = path.join(OUT, asin); fs.mkdirSync(d, { recursive: true }); return d; };

// ---------- 6kpro ----------
async function chatJson(messages, { maxTokens = 3000, retries = 3 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model: MODEL, temperature: 0.3, max_tokens: maxTokens, response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false, thinking: false }, messages }) });
      const j = await r.json(); const c = j.choices?.[0]?.message?.content; if (!c) throw new Error(`empty: ${JSON.stringify(j).slice(0, 200)}`);
      const m = c.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : c);
    } catch (e) { if (i === retries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}

// ---------- 文案ルール（6kpro へのシステムプロンプト） ----------
const SYSTEM = `あなたは Amazon.co.jp でレディースインナー（ブランド ${BRAND}、出品者 アネット株式会社）を売る日本人のECコピーライター兼リスティング最適化担当です。
目的：既存商品ページを「日本の女性客が安心して買える」内容に書き直し、検索露出とコンバージョンを上げる。

絶対ルール：
- トーン：安心感・清潔感・快適・上品。性的な示唆や扇情的表現は一切禁止。
- 禁止語：最強 / No.1 / 絶対 / 完全 / 最安 / 激安 / 送料無料 / セール / 限定 / 正規品 / ★☆■◆【】以外の装飾記号。
- 効果の断言禁止：バストアップ / 痩せる / 小顔 / 治る / 改善する などは書かない。「〜をサポート」「〜しにくい設計」までに留める。
- 事実にない数値・素材・機能を作らない。元データに無い情報は書かない（不明なら触れない）。
- 全角日本語。敬体（です・ます）で統一。
- SARADEMUNT の差別化「中身がわからないプライバシー梱包」「国内倉庫から発送」は必ず入れる（箇条書きと説明文のどちらかに）。

出力フィールドの制約：
- title：55〜70 全角。構成 = ${BRAND} + 商品種類（例 ノンワイヤーブラ）+ 最大 3 つの特徴語 + 主要サイズ/カラー展開 + 用途。検索語を自然に含める。記号は「 」と半角スペースのみ。
- bullets：5 本。各 60〜100 全角。先頭は【見出し 6〜10 字】、続けて具体的な説明。順番 = ①素材・着け心地 ②設計・サポート/ひびかない ③サイズ・体型フィット ④シーン・お手入れ ⑤プライバシー梱包・国内発送・サイズ交換の案内。
- description：400〜900 全角。段落ごとに全角スペース区切り。痛点→解決→素材→サイズ選び→安心（梱包・発送）の順。
- search_terms：半角スペース区切り、合計 250 バイト以内（全角 1 字 = 2 バイト目安、合計 120 文字以内）。ブランド名・title と重複する語・記号・競合ブランド名は入れない。表記ゆれ（ひらがな/カタカナ、ブラジャー/ブラ、ノンワイヤー/ワイヤレス）と検索者の言い回し（産後 / 大きいサイズ / 楽 / 締め付けない）を優先。
- image_brief：サブ画像 4 枚分（サイズ表 / 素材・機能 / プライバシー梱包・発送 / 選ばれる理由）に載せる短文。人物は描かない前提。各項目は 12 字以内の見出し + 24 字以内の補足。サイズ表は元データのサイズ表記から表形式 rows を作る（不明なら空配列）。
- ng_found：元の文案にあった禁止表現・不自然な翻訳調の例（最大 5 個）。

JSON のみ返す：{"title":"","bullets":["","","","",""],"description":"","search_terms":"","image_brief":{"size":{"headline":"","note":"","rows":[["サイズ","バスト(cm)","アンダー(cm)"]]},"material":{"headline":"","points":[{"t":"","d":""}]},"privacy":{"headline":"","points":[{"t":"","d":""}]},"why":{"headline":"","points":[{"t":"","d":""}]}},"ng_found":[]}`;

// ---------- stages ----------
const run = {
  rank() {
    const act = table(path.join(IN, 'active-listings.txt'), '\t');
    const items = act.map((r) => ({ sku: col(r, /^seller-sku$|出品者SKU/i), asin: col(r, /^asin1$|^ASIN ?1$|^ASIN$|^商品ID$/i), title: col(r, /^item-name$|商品名/i), price: num(col(r, /^price$|価格/i)), qty: num(col(r, /^quantity$|数量/i)), image: col(r, /image-url|画像/i), status: col(r, /^status$|ステータス/i), desc: col(r, /item-description|商品説明/i) })).filter((x) => x.asin);
    const bizF = (n) => path.join(IN, `business-report-${n}.csv`);
    const biz = (n) => fs.existsSync(bizF(n)) ? table(bizF(n), ',').map((r) => ({ asin: col(r, /\(子\)|（子）|子商品|child/i) || col(r, /ASIN/i), sessions: num(col(r, /セッション(?!率)|^Sessions/i)), pv: num(col(r, /ページビュー|Page Views/i)), units: num(col(r, /注文品目数|注文された商品点数|Units Ordered/i)), cvr: num(col(r, /ユニットセッション率|コンバージョン|Unit Session/i)), sales: num(col(r, /売上|Ordered Product Sales/i)) })) : [];
    const b90 = new Map(biz('90d').map((b) => [b.asin, b])), b30 = new Map(biz('30d').map((b) => [b.asin, b]));
    const byAsin = new Map();
    for (const it of items) { const a = byAsin.get(it.asin) ?? { asin: it.asin, skus: [], title: it.title, price: it.price, image: it.image, desc: it.desc, qty: 0 }; a.skus.push(it.sku); a.qty += it.qty; a.price = a.price || it.price; byAsin.set(it.asin, a); }
    const all = [...byAsin.values()].map((a) => { const x = b90.get(a.asin) ?? {}, y = b30.get(a.asin) ?? {}; return { ...a, units90: x.units ?? 0, sales90: x.sales ?? 0, sessions90: x.sessions ?? 0, cvr90: x.cvr ?? 0, units30: y.units ?? 0 }; });
    all.sort((p, q) => q.units90 - p.units90 || q.sales90 - p.sales90 || q.units30 - p.units30 || q.sessions90 - p.sessions90);
    const frozen = all.slice(0, FROZEN_N).filter((a) => a.units90 > 0); const frozenSet = new Set(frozen.map((a) => a.asin));
    const targets = all.filter((a) => !frozenSet.has(a.asin)).map((a) => ({ ...a, segment: a.sessions90 === 0 ? 'no-traffic' : a.units90 === 0 ? 'traffic-no-sales' : a.cvr90 < 3 ? 'low-cvr' : 'ok-low-volume' }));
    fs.writeFileSync(path.join(OUT, 'frozen-top10.json'), JSON.stringify(frozen, null, 1));
    fs.writeFileSync(TARGETS, JSON.stringify(targets, null, 1));
    const seg = {}; for (const t of targets) seg[t.segment] = (seg[t.segment] ?? 0) + 1;
    const md = ['# Amazon 既存出品 最適化プラン', '', `出品 ASIN: ${all.length}　凍結（売上上位 ${FROZEN_N}）: ${frozen.length}　対象: ${targets.length}`, '', '## 凍結（触らない）', '', '| # | ASIN | 90日 注文数 | 売上 | 商品名 |', '|---|---|---|---|---|', ...frozen.map((a, i) => `| ${i + 1} | ${a.asin} | ${a.units90} | ¥${a.sales90.toLocaleString('ja-JP')} | ${a.title.slice(0, 40)} |`), '', '## 対象の内訳', '', ...Object.entries(seg).map(([k, v]) => `- ${k}: ${v}`), '', '- no-traffic: 検索に出ていない → タイトル・検索キーワード・カテゴリを優先', '- traffic-no-sales / low-cvr: 見られているのに買われない → サブ画像・箇条書き・価格を優先', '- ok-low-volume: 文案を整えるだけ', '', '## 対象一覧', '', '| ASIN | セグメント | セッション | 注文 | CVR | 価格 | 商品名 |', '|---|---|---|---|---|---|---|', ...targets.map((a) => `| ${a.asin} | ${a.segment} | ${a.sessions90} | ${a.units90} | ${a.cvr90}% | ¥${a.price} | ${a.title.slice(0, 40)} |`)];
    fs.writeFileSync(path.join(OUT, 'plan.md'), md.join('\n')); console.log(md.slice(0, 20 + frozen.length).join('\n')); log('targets', targets.length);
  },
  async fetch() { // Windows：CDP のブラウザで自社商品ページを読む（人物画像を含め、自社のページ情報のみ）
    const { chromium } = await import('playwright');
    const b = await chromium.connectOverCDP('http://127.0.0.1:9222'); const ctx = b.contexts()[0]; const page = await ctx.newPage();
    for (const t of loadTargets()) {
      const f = path.join(dirOf(t.asin), 'current.json'); if (fs.existsSync(f) && !args.force) continue;
      try {
        await page.goto(`https://www.amazon.co.jp/dp/${t.asin}?th=1&psc=1`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await sleep(1500 + Math.random() * 1500);
        const cur = await page.evaluate(() => {
          const txt = (s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          const bullets = [...document.querySelectorAll('#feature-bullets li span.a-list-item, #productFactsDesktopExpander ul.a-unordered-list li span.a-list-item')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter((s) => s && !/詳細はこちら|もっと見る/.test(s));
          let images = []; for (const s of document.scripts) { const m = s.textContent.match(/'colorImages':\s*\{\s*'initial':\s*(\[[\s\S]*?\])\s*\}/); if (m) { try { images = eval(m[1]).map((x) => x.hiRes || x.large).filter(Boolean); } catch {} if (images.length) break; } }
          if (!images.length) images = [...document.querySelectorAll('#altImages img')].map((i) => i.src.replace(/\._[^.]+_\./, '.')).filter((u) => !/sprite|play-icon|360_icon/.test(u));
          const sizes = [...document.querySelectorAll('#native_dropdown_selected_size_name option, #variation_size_name li')].map((e) => e.textContent.trim()).filter((s) => s && !/選択/.test(s));
          const colors = [...document.querySelectorAll('#variation_color_name li img')].map((i) => i.alt).filter(Boolean);
          const detail = Object.fromEntries([...document.querySelectorAll('#productDetails_techSpec_section_1 tr, #productOverview_feature_div tr, #detailBullets_feature_div li')].map((tr) => { const th = tr.querySelector('th, .a-span3, .a-text-bold')?.textContent?.replace(/[\s:：‏‎]+/g, ' ').trim(); const td = tr.querySelector('td, .a-span9, span:not(.a-text-bold)')?.textContent?.replace(/\s+/g, ' ').trim(); return th && td ? [th, td] : null; }).filter(Boolean));
          return { title: txt('#productTitle'), price: txt('.a-price .a-offscreen'), bullets, description: txt('#productDescription') || txt('#aplus'), images, sizes, colors, detail, rating: txt('#acrPopover .a-icon-alt'), reviews: txt('#acrCustomerReviewText') };
        });
        cur.fetchedAt = new Date().toISOString(); fs.writeFileSync(f, JSON.stringify(cur, null, 1));
        const imgDir = path.join(dirOf(t.asin), 'images'); fs.mkdirSync(imgDir, { recursive: true });
        for (const [i, u] of cur.images.slice(0, 9).entries()) { const p = path.join(imgDir, `${String(i + 1).padStart(2, '0')}.jpg`); if (!fs.existsSync(p)) { const r = await fetch(u); if (r.ok) fs.writeFileSync(p, Buffer.from(await r.arrayBuffer())); } }
        log('fetched', t.asin, cur.title.slice(0, 30), cur.bullets.length, 'bullets', cur.images.length, 'images');
      } catch (e) { log('ERR fetch', t.asin, e.message); fs.appendFileSync(path.join(OUT, 'errors.log'), `${new Date().toISOString()} fetch ${t.asin} ${e.message}\n`); }
    }
    await page.close(); await b.close();
  },
  async write() {
    const ts = loadTargets(); let n = 0;
    for (const t of ts) {
      const d = dirOf(t.asin); const f = path.join(d, 'listing.json'); if (fs.existsSync(f) && !args.force) continue;
      const cur = fs.existsSync(path.join(d, 'current.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'current.json'), 'utf8')) : { title: t.title, bullets: [], description: t.desc ?? '', sizes: [], colors: [], detail: {} };
      const user = `ASIN: ${t.asin}\n現在のタイトル: ${cur.title}\n価格: ${cur.price || '¥' + t.price}\n現在の箇条書き:\n${cur.bullets.map((b) => '- ' + b).join('\n') || '(なし)'}\n現在の説明文:\n${String(cur.description).slice(0, 2500) || '(なし)'}\nサイズ展開: ${cur.sizes.join(' / ') || '不明'}\nカラー展開: ${cur.colors.join(' / ') || '不明'}\n商品詳細: ${JSON.stringify(cur.detail).slice(0, 1500)}\n90日間の実績: セッション ${t.sessions90}、注文 ${t.units90}、CVR ${t.cvr90}%（セグメント ${t.segment}）\n\nセグメントが no-traffic ならタイトルと検索キーワードに検索者の言い回しを厚めに、traffic-no-sales / low-cvr なら箇条書きの先頭 2 本と image_brief で不安（サイズ・透け・ひびき・梱包）を先回りで解消してください。`;
      try { const j = await chatJson([{ role: 'system', content: SYSTEM }, { role: 'user', content: user }]); j.asin = t.asin; j.generatedAt = new Date().toISOString(); fs.writeFileSync(f, JSON.stringify(j, null, 1)); n++; log('written', t.asin, j.title?.slice(0, 40)); }
      catch (e) { log('ERR write', t.asin, e.message); fs.appendFileSync(path.join(OUT, 'errors.log'), `${new Date().toISOString()} write ${t.asin} ${e.message}\n`); }
    }
    log('written', n);
  },
  cards() {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'lingerie-cards.mjs'), '--targets', TARGETS, '--out', OUT, ...(args.limit ? ['--limit', args.limit] : []), ...(args.asin ? ['--asin', args.asin] : []), ...(args.force ? ['--force'] : [])], { stdio: 'inherit', cwd: ROOT, env: process.env });
    if (r.status !== 0) throw new Error('cards failed');
  },
  build() {
    const ts = loadTargets(); const act = table(path.join(IN, 'active-listings.txt'), '\t');
    const skusOf = (asin) => act.filter((r) => col(r, /^asin1$|^ASIN ?1$|^ASIN$|^商品ID$/i) === asin).map((r) => col(r, /^seller-sku$|出品者SKU/i)).filter(Boolean);
    const tsv = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ');
    const textFields = ['sku', 'product-id', 'product-id-type', 'item_name', 'bullet_point1', 'bullet_point2', 'bullet_point3', 'bullet_point4', 'bullet_point5', 'product_description', 'generic_keywords', 'update_delete'];
    const imgFields = ['sku', 'other_image_url1', 'other_image_url2', 'other_image_url3', 'other_image_url4', 'other_image_url5', 'other_image_url6', 'other_image_url7', 'other_image_url8', 'update_delete'];
    const textRows = [], imgRows = [], review = [];
    for (const t of ts) {
      const d = path.join(OUT, t.asin); const lf = path.join(d, 'listing.json'); if (!fs.existsSync(lf)) continue;
      const L = JSON.parse(fs.readFileSync(lf, 'utf8')); const cur = fs.existsSync(path.join(d, 'current.json')) ? JSON.parse(fs.readFileSync(path.join(d, 'current.json'), 'utf8')) : null;
      const cards = fs.existsSync(path.join(d, 'cards')) ? fs.readdirSync(path.join(d, 'cards')).filter((f) => f.endsWith('.png')).sort() : [];
      if (cards.length) { fs.mkdirSync(path.join(PUBLIC_DIR, t.asin), { recursive: true }); for (const c of cards) fs.copyFileSync(path.join(d, 'cards', c), path.join(PUBLIC_DIR, t.asin, c)); }
      // サブ画像の並び：既存の実写サブ画像（モデル着用・商品）を先に残し、その後に新カード。メイン（01）は触らない
      const keepOld = (cur?.images ?? []).slice(1, 8 - cards.length);
      const newImgs = [...keepOld, ...cards.map((c) => `${PUBLIC_BASE}/${t.asin}/${c}`)].slice(0, 8);
      for (const sku of skusOf(t.asin)) {
        textRows.push({ sku, 'product-id': t.asin, 'product-id-type': '1', item_name: L.title, ...Object.fromEntries((L.bullets ?? []).slice(0, 5).map((b, i) => [`bullet_point${i + 1}`, b])), product_description: L.description, generic_keywords: L.search_terms, update_delete: 'PartialUpdate' });
        if (cards.length) imgRows.push({ sku, ...Object.fromEntries(newImgs.map((u, i) => [`other_image_url${i + 1}`, u])), update_delete: 'PartialUpdate' });
      }
      review.push(`## ${t.asin}（${t.segment}）\n\n**旧** ${cur?.title ?? t.title}\n\n**新** ${L.title}\n\n` + (L.bullets ?? []).map((b) => `- ${b}`).join('\n') + `\n\n検索語: ${L.search_terms}\n\n${L.ng_found?.length ? '元文案の問題: ' + L.ng_found.join(' / ') : ''}\n`);
    }
    const write = (name, fields, rows) => { const f = path.join(OUT, name); fs.writeFileSync(f, '﻿' + [['TemplateType=fptcustom', 'Version=2026.1017', 'TemplateSignature=PartialUpdate', ...Array(fields.length - 3).fill('')].join('\t'), fields.join('\t'), fields.join('\t'), ...rows.map((r) => fields.map((k) => tsv(r[k])).join('\t'))].join('\r\n') + '\r\n'); log(name, rows.length, 'rows'); };
    write('update-text.tsv', textFields, textRows); if (imgRows.length) write('update-images.tsv', imgFields, imgRows);
    fs.writeFileSync(path.join(OUT, 'review.md'), `# 変更一覧（${review.length} ASIN）\n\n` + review.join('\n'));
    log('注意: ヘッダは既定値。Seller Central の「出品ファイル（レディース服）」テンプレートの 3 行ヘッダを tools/amazon-listing/templates/Clothing.headers.tsv に置いた場合は build-inventory-file.mjs と同様に差し替えること');
  },
  report() { run.build(); console.log(fs.readFileSync(path.join(OUT, 'review.md'), 'utf8').slice(0, 6000)); },
};

// ---------- 監査（読み取り専用：変更はしない。ユーザー向けレポートを作る） ----------
const AUDIT_SYSTEM = `あなたは Amazon.co.jp のリスティング監査員です（出品者 アネット株式会社。レディースインナー SARADEMUNT のほか、イヤーマフ・キッズ用品・工具・生活雑貨など多カテゴリを扱う）。まずタイトルと箇条書きから商品のカテゴリと想定購入者を判断し、その購入者の目線で、与えられた商品ページの現状と 90 日実績から「売れない原因」と「直し方」を具体的に指摘してください。カテゴリを取り違えて別ジャンルの基準で採点しないこと。
評価軸：title（検索語・長さ・ブランド順序・記号）、bullets（本数・見出し・購入前の不安解消：サイズ・素材・対象年齢・使い方・梱包などカテゴリに応じて）、description（構成・敬体・情報量）、images（枚数・メイン画像の規約：白背景/文字なし/衣類は着用またはフラット、サブ画像にサイズ表/素材/梱包があるか。画像は URL とファイル名から推測できる範囲で）、keywords（そのカテゴリで購入者が使う検索語の網羅・表記ゆれ）、price（同種商品との整合は不明なら触れない）、compliance（最強/No.1/絶対/効果の断言 等の NG、カテゴリ固有の規制表現）、reviews（評価と件数から見た信頼シグナル）。
出力は JSON のみ：{"score":0-100,"verdict":"一言","top_fixes":["最優先の直し 3 つ以内、日本語"],"issues":[{"area":"title|bullets|description|images|keywords|price|compliance|reviews","severity":"high|mid|low","finding":"何が問題か（具体）","fix":"どう直すか（具体、文例があれば）"}]}`;
run.audit = async function () {
  const all = [...JSON.parse(fs.readFileSync(path.join(OUT, 'frozen-top10.json'), 'utf8')).map((t) => ({ ...t, frozen: true })), ...JSON.parse(fs.readFileSync(TARGETS, 'utf8'))];
  const ts = args.asin ? all.filter((t) => t.asin === args.asin) : args.limit ? all.slice(0, Number(args.limit)) : all; let n = 0;
  const todo = ts.filter((t) => args.force || !fs.existsSync(path.join(dirOf(t.asin), 'audit.json')));
  const worker = async () => { for (let t; (t = todo.shift()); ) {
    const d = dirOf(t.asin); const f = path.join(d, 'audit.json');
    const cf = path.join(d, 'current.json'); const cur = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : { title: t.title, bullets: [], description: t.desc ?? '', images: t.image ? [t.image] : [], sizes: [], colors: [], detail: {}, rating: '', reviews: '' };
    const user = `ASIN: ${t.asin}（${t.frozen ? '売上上位：変更しない前提で診断のみ' : t.segment}）\nタイトル: ${cur.title}\n価格: ${cur.price || '¥' + t.price}\n評価: ${cur.rating || '不明'} / ${cur.reviews || 'レビュー数不明'}\n箇条書き:\n${cur.bullets.map((b) => '- ' + b).join('\n') || '(なし)'}\n説明文:\n${String(cur.description).slice(0, 2000) || '(なし)'}\n画像 ${cur.images.length} 枚: ${cur.images.slice(0, 9).map((u) => u.split('/').pop()).join(', ')}\nサイズ: ${cur.sizes.join('/') || '不明'}　カラー: ${cur.colors.join('/') || '不明'}\n商品詳細: ${JSON.stringify(cur.detail).slice(0, 1200)}\n90 日実績: セッション ${t.sessions90 ?? 0}、注文 ${t.units90 ?? 0}、CVR ${t.cvr90 ?? 0}%、売上 ¥${t.sales90 ?? 0}`;
    try { const j = await chatJson([{ role: 'system', content: AUDIT_SYSTEM }, { role: 'user', content: user }], { maxTokens: 4000 }); j.asin = t.asin; j.frozen = !!t.frozen; j.auditedAt = new Date().toISOString(); fs.writeFileSync(f, JSON.stringify(j, null, 1)); n++; log('audited', t.asin, j.score, j.verdict); }
    catch (e) { log('ERR audit', t.asin, e.message); fs.appendFileSync(path.join(OUT, 'errors.log'), `${new Date().toISOString()} audit ${t.asin} ${e.message}\n`); }
  } };
  await Promise.all(Array.from({ length: Number(args.concurrency ?? 4) }, worker));
  log('audited', n);
};
run['audit-report'] = function () {
  const all = [...JSON.parse(fs.readFileSync(path.join(OUT, 'frozen-top10.json'), 'utf8')).map((t) => ({ ...t, frozen: true })), ...JSON.parse(fs.readFileSync(TARGETS, 'utf8'))];
  // 商品IDタイプ=EAN で出品された行は「商品ID」が JAN になり ASIN が分からない → ページ取得できず採点も無意味なので別枠
  const isAsin = (x) => /^B0[A-Z0-9]{8}$|^[0-9]{9}[0-9X]$/.test(x); const noAsin = all.filter((t) => !isAsin(t.asin));
  const rows = all.filter((t) => isAsin(t.asin)).map((t) => { const f = path.join(OUT, t.asin, 'audit.json'); return fs.existsSync(f) ? { t, a: JSON.parse(fs.readFileSync(f, 'utf8')) } : null; }).filter(Boolean);
  const sev = { high: 0, mid: 0, low: 0 }; const byArea = {}; for (const { a } of rows) for (const i of a.issues ?? []) { sev[i.severity] = (sev[i.severity] ?? 0) + 1; byArea[i.area] = (byArea[i.area] ?? 0) + 1; }
  const md = ['# Amazon 店铺深度审计报告（SARADEMUNT，只读诊断）', '', `审计日期：${new Date().toISOString().slice(0, 10)}　商品数：${rows.length}（其中销量 Top ${rows.filter((r) => r.t.frozen).length} 为「不改动」，仅诊断）`, '', `问题统计：high ${sev.high} / mid ${sev.mid} / low ${sev.low}`, '', '| 领域 | 问题数 |', '|---|---|', ...Object.entries(byArea).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`), '', '## 总览（按得分从低到高）', '', '| ASIN | 得分 | 90日会话 | 订单 | CVR | 状态 | 一句话结论 | 最优先修改 |', '|---|---|---|---|---|---|---|---|'];
  rows.sort((p, q) => (p.a.score ?? 0) - (q.a.score ?? 0));
  for (const { t, a } of rows) md.push(`| ${t.asin} | ${a.score ?? '-'} | ${t.sessions90 ?? 0} | ${t.units90 ?? 0} | ${t.cvr90 ?? 0}% | ${t.frozen ? '**不改动**' : t.segment} | ${a.verdict ?? ''} | ${(a.top_fixes ?? []).join('；')} |`);
  if (noAsin.length) { md.push('', `## 未审计：商品ID 是 JAN、没有 ASIN（${noAsin.length} 件）`, '', '这些出品在「全出品レポート」里商品IDタイプ为 EAN，商品ID 是 JAN 码，报告里没有 ASIN，所以没法取商品页、没有打分。需要在卖家后台按 SKU 查到 ASIN 后再审计。', '', '| JAN | SKU | 商品名 |', '|---|---|---|'); for (const t of noAsin) md.push(`| ${t.asin} | ${[].concat(t.skus ?? []).join(" ")} | ${(t.title ?? '').slice(0, 60)} |`); }
  md.push('', '## 逐产品明细', '');
  for (const { t, a } of rows) { md.push(`### ${t.asin}　${(t.title ?? '').slice(0, 50)}`, '', `得分 ${a.score}　${t.frozen ? '（销量 Top，不改动，仅供参考）' : ''}`, '', '| 领域 | 严重度 | 问题 | 修改建议 |', '|---|---|---|---|'); for (const i of a.issues ?? []) md.push(`| ${i.area} | ${i.severity} | ${String(i.finding).replace(/\|/g, '／')} | ${String(i.fix).replace(/\|/g, '／')} |`); md.push(''); }
  const out = path.join(ROOT, 'docs/amazon-audit-report.md'); fs.writeFileSync(out, md.join('\n')); console.log(md.slice(0, 30).join('\n')); log('report →', path.relative(ROOT, out));
};
// ---------- 第 1 段：ルールベースの安全な修正（AI 不使用、タイトルのみ） ----------
// 監査で全店共通だった「ブランド括弧の崩れ」「型番」「販促 NG 語」「記号の乱用」だけを機械的に直す。
// 他ブランド名（ALAIX / slenderlady / KissSmell 等）のタイトルはブランド属性と一致させる必要があるので、ブランド部分は触らない。
const PROMO_NG = /最強|No\.?\s?1|ナンバーワン|絶対|完全版?|最安値?|激安|送料無料|セール|期間限定|限定価格|正規品|新品未使用/gi;
const UNIT = /^(\d+(\.\d+)?(cm|mm|m|ml|mL|L|g|kg|W|V|mAh|枚|個|本|色|点|足|組|セット|P|p|%|インチ|号))$|^UPF\d+\+?$|^SPF\d+$|^[0-9]?X{0,4}[SML]$|^\d?XL$|^\d+-\d+(cm|歳|才|ヶ月|か月)?$/i;
function fixTitle(t0) {
  let t = String(t0 ?? '');
  const notes = [];
  const before = t;
  // ブランド括弧：[SARADEMUNT] サラデマント〕 / SARADEMUNT【サラデマント】 / SARADEMUNT〔サラデマント〕 → SARADEMUNT サラデマント
  t = t.replace(/^[\[［【〔(（]?\s*SARADEMUNT\s*[\]］】〕)）]?\s*[〔【\[［(（]?\s*サラデマント\s*[〕】\]］)）]?/i, 'SARADEMUNT サラデマント ');
  t = t.replace(/^[\[［【〔]\s*SARADEMUNT\s*[\]］】〕]/i, 'SARADEMUNT ');
  if (t !== before) notes.push('ブランド表記');
  // 対応の取れない単独の 〔 〕 を削除
  const b2 = t; t = t.replace(/[〔〕]/g, ' '); if (t !== b2) notes.push('括弧');
  // 販促 NG 語
  const b3 = t; t = t.replace(/【[^】]*(?:送料無料|セール|限定|最安|激安)[^】]*】/g, ' ').replace(PROMO_NG, ' '); if (t !== b3) notes.push('NG語');
  // 型番：英数字混在で数字 2 桁以上、単位・サイズ表記ではないトークン（末尾/括弧内に多い）
  const ws = (x) => x.replace(/[ 　]+/g, ' ').trim(); const b4 = ws(t);
  t = t.replace(/[（(]\s*([A-Za-z]{1,6}[-_]?\d{2,}[A-Za-z0-9-]*)\s*[)）]/g, (m, code) => UNIT.test(code) ? m : ' ');
  t = t.split(/\s+/).filter((w) => { const x = w.replace(/^[・、,]+|[・、,]+$/g, ''); if (!x) return false; if (UNIT.test(x)) return true; return !/^(?=.*[A-Za-z])(?=(?:.*\d){2,})[A-Za-z0-9][A-Za-z0-9_-]{3,}$/.test(x) || /^(UPF|SPF|USB|LED|PM|COVID|IPX)\d/i.test(x); }).join(' ');
  if (ws(t) !== b4) notes.push('型番');
  // 記号の乱用・重複空白
  const b5 = ws(t); t = ws(t.replace(/[★☆■□◆◇●○※♪♡♥◎]+/g, ' ').replace(/\s*[、,]\s*/g, ' ')); if (t !== b5) notes.push('記号');
  return { title: t, changed: notes.length > 0, notes };
}
run.fix = function () { // 提案を作るだけ（アップロードしない）→ out/opt/fix-titles.json + docs/amazon-fix-titles-review.md
  const all = JSON.parse(fs.readFileSync(TARGETS, 'utf8')); // 凍結 10 件は targets に含まれない
  const isAsin = (x) => /^B0[A-Z0-9]{8}$/.test(x);
  const out = [];
  for (const t of all.filter((x) => isAsin(x.asin))) {
    const cf = path.join(OUT, t.asin, 'current.json'); const cur = fs.existsSync(cf) ? JSON.parse(fs.readFileSync(cf, 'utf8')) : null;
    const old = cur?.title || t.title; const r = fixTitle(old);
    if (r.changed) out.push({ asin: t.asin, skus: t.skus, segment: t.segment, old, title: r.title, notes: r.notes, lenOld: old.length, lenNew: r.title.length });
  }
  fs.writeFileSync(path.join(OUT, 'fix-titles.json'), JSON.stringify(out, null, 1));
  const cnt = {}; for (const o of out) for (const n of o.notes) cnt[n] = (cnt[n] ?? 0) + 1;
  const md = ['# Amazon タイトル修正案（第 1 段・ルールベース）', '', `対象 ${all.length} ASIN 中 ${out.length} 件を修正（凍結 Top10 は除外、まだアップロードしていません）`, '', ...Object.entries(cnt).map(([k, v]) => `- ${k}: ${v}`), '', '| ASIN | 修正内容 | 旧 | 新 |', '|---|---|---|---|', ...out.map((o) => `| ${o.asin} | ${o.notes.join('・')} | ${o.old.replace(/\|/g, '／')} | ${o.title.replace(/\|/g, '／')} |`)];
  fs.writeFileSync(path.join(ROOT, 'docs/amazon-fix-titles-review.md'), md.join('\n')); console.log(md.slice(0, 12).join('\n')); log('fix proposals', out.length);
};

if (!run[stage]) { console.error('usage: rank | fetch | audit | audit-report | write | cards | build | report | fix'); process.exit(2); }
Promise.resolve(run[stage]()).then(() => log('done', stage)).catch((e) => { console.error(e); process.exit(1); });
