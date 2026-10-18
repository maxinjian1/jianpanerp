/**
 * Amazon.co.jp 市场调研：抓取热卖榜 → 商品详情 + 评论 → 6kpro 分析「为什么好卖」→ 1688 找货关键词
 *
 *   node tools/amazon-research/research.mjs collect --cat home [--cat kitchen ...] [--pages 2]   # ベストセラー / 新着 / 急上昇 を取得 → out/<cat>/items.json
 *   node tools/amazon-research/research.mjs detail  --cat home [--limit 50]                        # 各商品ページ：箇条書き・BSR・出品者・発売日・レビュー上位 → out/<cat>/<asin>.json
 *   node tools/amazon-research/research.mjs analyze --cat home [--limit 50]                        # 6kpro：売れる理由・価格帯・差別化余地・仕入れ用中国語キーワード → out/<cat>/analysis/<asin>.json
 *   node tools/amazon-research/research.mjs report  --cat home                                     # docs/market-research/amazon-<cat>-<date>.md（中文报告）+ out/<cat>/sourcing.json（给 1688 工具用）
 *   node tools/amazon-research/research.mjs cats                                                   # 使えるカテゴリ別名一覧
 *
 * ブラウザ：Windows の CDP（既定 http://127.0.0.1:9222、seller-central/browser.mjs が開いた Chrome）を使う。--cdp で変更可。
 * 速度：1 ページ 2〜5 秒のランダム待ち。公開ページのみ、ログイン不要。顧客データは扱わない。
 * 注意：Amazon はページ構造を変えるので、取れない項目は空のまま進める（analyze は欠損に耐える）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const stage = process.argv[2];
const argv = process.argv.slice(3); const args = {}; for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const k = argv[i].slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : '1'; args[k] = args[k] ? [].concat(args[k], v) : v; }
const cats = [].concat(args.cat ?? []);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const jitter = (a = 2000, b = 5000) => sleep(a + Math.random() * (b - a));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash';
const CDP = args.cdp ?? 'http://127.0.0.1:9222';

// カテゴリ別名 → ベストセラーのパス（node ID は Amazon.co.jp の公開ランキング URL から）
const CATS = {
  home: { name: 'ホーム＆キッチン', path: 'kitchen' }, kitchen: { name: 'キッチン用品', path: 'kitchen', node: '13938481' }, beauty: { name: 'ビューティー', path: 'beauty' }, hpc: { name: 'ドラッグストア', path: 'hpc' },
  fashion: { name: '服＆ファッション小物', path: 'fashion' }, lingerie: { name: 'レディースインナー', path: 'fashion', node: '2131487051' }, baby: { name: 'ベビー＆マタニティ', path: 'baby' }, toys: { name: 'おもちゃ', path: 'toys' },
  sports: { name: 'スポーツ＆アウトドア', path: 'sports' }, pet: { name: 'ペット用品', path: 'pet-supplies' }, electronics: { name: '家電＆カメラ', path: 'electronics' }, diy: { name: 'DIY・工具・ガーデン', path: 'diy' },
  automotive: { name: '車＆バイク', path: 'automotive' }, office: { name: '文房具・オフィス用品', path: 'office-products' }, grocery: { name: '食品・飲料', path: 'food-beverage' }, jewelry: { name: 'ジュエリー', path: 'jewelry' }, watch: { name: '腕時計', path: 'watch' }, luggage: { name: 'バッグ・スーツケース', path: 'fashion', node: '2221077051' },
};
const listUrls = (c) => { const base = `https://www.amazon.co.jp/gp`; const node = c.node ? `/${c.node}` : ''; return { bestsellers: `${base}/bestsellers/${c.path}${node}`, newreleases: `${base}/new-releases/${c.path}${node}`, movers: `${base}/movers-and-shakers/${c.path}${node}` }; };
const catDir = (k) => { const d = path.join(OUT, k); fs.mkdirSync(d, { recursive: true }); return d; };

async function chatJson(messages, { maxTokens = 4000, retries = 3 } = {}) {
  for (let i = 0; i < retries; i++) {
    try { const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model: MODEL, temperature: 0.3, max_tokens: maxTokens, response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false, thinking: false }, messages }) }); const j = await r.json(); const c = j.choices?.[0]?.message?.content; if (!c) throw new Error('empty'); const m = c.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : c); }
    catch (e) { if (i === retries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}
async function browser() { const { chromium } = await import('playwright'); const b = await chromium.connectOverCDP(CDP); const ctx = b.contexts()[0]; const page = await ctx.newPage(); return { b, page }; }
const blocked = (page) => /captcha|validateCaptcha|\/errors\/|ap\/signin/i.test(page.url());

const run = {
  cats() { for (const [k, v] of Object.entries(CATS)) console.log(k.padEnd(12), v.name, listUrls(v).bestsellers); },
  async collect() {
    if (!cats.length) throw new Error('--cat を指定（research.mjs cats で一覧）');
    const { b, page } = await browser(); const pages = Number(args.pages ?? 2);
    for (const k of cats) {
      const c = CATS[k] ?? { name: k, path: k }; const items = new Map();
      for (const [kind, url] of Object.entries(listUrls(c))) for (let pg = 1; pg <= (kind === 'bestsellers' ? pages : 1); pg++) {
        const u = pg > 1 ? `${url}?pg=${pg}` : url;
        try {
          await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }); await jitter(); if (blocked(page)) { log('BLOCKED', page.url()); await page.screenshot({ path: path.join(catDir(k), `blocked-${Date.now()}.png`) }); continue; }
          for (let y = 0; y < 6; y++) { await page.mouse.wheel(0, 1500); await sleep(500); } // 遅延読み込み
          const got = await page.evaluate(() => [...document.querySelectorAll('#gridItemRoot, .zg-grid-general-faceout, [data-asin].p13n-sc-uncoverable-faceout')].map((el) => {
            const a = el.querySelector('a[href*="/dp/"]'); const asin = (a?.href.match(/\/dp\/([A-Z0-9]{10})/) || [])[1] || el.getAttribute('data-asin') || el.closest('[data-asin]')?.getAttribute('data-asin');
            const t = (s) => el.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            return { asin, rank: Number((t('.zg-bdg-text') || '').replace(/[^0-9]/g, '')) || null, title: t('._cDEzb_p13n-sc-css-line-clamp-3_g3dy1, ._cDEzb_p13n-sc-css-line-clamp-4_2q2cc, .p13n-sc-truncate-desktop-type2, [class*=line-clamp]'), price: t('._cDEzb_p13n-sc-price_3mJ9Z, .p13n-sc-price, .a-price .a-offscreen'), rating: t('.a-icon-alt'), reviews: t('.a-size-small:not(.a-color-price), a[href*="customerReviews"] span'), image: el.querySelector('img')?.src ?? '' };
          }).filter((x) => x.asin));
          for (const g of got) { const prev = items.get(g.asin) ?? { asin: g.asin, lists: [] }; items.set(g.asin, { ...prev, ...Object.fromEntries(Object.entries(g).filter(([, v]) => v)), lists: [...new Set([...prev.lists, kind])], rank: prev.rank ?? g.rank, rankIn: { ...(prev.rankIn ?? {}), [kind]: g.rank } }); }
          log(k, kind, pg, got.length, 'items');
        } catch (e) { log('ERR', k, kind, e.message); }
      }
      const arr = [...items.values()].sort((p, q) => (p.rankIn?.bestsellers ?? 999) - (q.rankIn?.bestsellers ?? 999));
      fs.writeFileSync(path.join(catDir(k), 'items.json'), JSON.stringify({ category: c.name, key: k, collectedAt: new Date().toISOString(), items: arr }, null, 1)); log(k, 'total', arr.length);
    }
    await page.close(); await b.close();
  },
  async detail() {
    const { b, page } = await browser();
    for (const k of cats) {
      const meta = JSON.parse(fs.readFileSync(path.join(catDir(k), 'items.json'), 'utf8')); const list = meta.items.slice(0, Number(args.limit ?? 60));
      for (const it of list) {
        const f = path.join(catDir(k), `${it.asin}.json`); if (fs.existsSync(f) && !args.force) continue;
        try {
          await page.goto(`https://www.amazon.co.jp/dp/${it.asin}?th=1&psc=1`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await jitter(); if (blocked(page)) { log('BLOCKED', it.asin); await sleep(60000); continue; }
          const d = await page.evaluate(() => {
            const txt = (s) => document.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
            const bullets = [...document.querySelectorAll('#feature-bullets li span.a-list-item')].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter((s) => s && !/詳細はこちら|もっと見る/.test(s));
            const body = document.body.innerText;
            const bsr = (body.match(/Amazon 売れ筋ランキング:?\s*([\s\S]{0,300}?)(?:カスタマーレビュー|Amazon\.co\.jp での取り扱い開始日|$)/) || [])[1]?.replace(/\s+/g, ' ').trim() ?? '';
            const since = (body.match(/取り扱い開始日\s*[:：]?\s*([0-9]{4}\/[0-9]{1,2}\/[0-9]{1,2})/) || [])[1] ?? '';
            const seller = txt('#sellerProfileTriggerId') || txt('#merchant-info'); const brand = txt('#bylineInfo').replace(/^ブランド[:：]\s*/, '').replace(/のストアを表示$/, '');
            const reviews = [...document.querySelectorAll('[data-hook="review"]')].slice(0, 8).map((r) => ({ star: r.querySelector('[data-hook="review-star-rating"] .a-icon-alt, .review-rating .a-icon-alt')?.textContent?.trim() ?? '', title: r.querySelector('[data-hook="review-title"]')?.textContent?.replace(/\s+/g, ' ').trim() ?? '', body: r.querySelector('[data-hook="review-body"]')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 400) ?? '' }));
            const images = []; for (const s of document.scripts) { const m = s.textContent.match(/'colorImages':\s*\{\s*'initial':\s*(\[[\s\S]*?\])\s*\}/); if (m) { try { images.push(...eval(m[1]).map((x) => x.hiRes || x.large).filter(Boolean)); } catch {} break; } }
            const variants = [...document.querySelectorAll('#twister li, #variation_color_name li, #variation_size_name li')].map((e) => e.getAttribute('title')?.replace(/^.*?選択\s*/, '') ?? e.textContent.trim()).filter(Boolean).slice(0, 30);
            return { title: txt('#productTitle'), price: txt('.a-price .a-offscreen') || txt('#priceblock_ourprice'), rating: txt('#acrPopover .a-icon-alt'), reviewCount: txt('#acrCustomerReviewText'), brand, seller, fulfilled: /Amazon\.co\.jp が発送|Amazonが発送/.test(body) ? 'FBA' : 'FBM?', bullets, description: txt('#productDescription') || txt('#aplus_feature_div').slice(0, 1500), bsr, since, images, variants, reviews, hasAplus: !!document.querySelector('#aplus'), hasVideo: !!document.querySelector('#altImages .videoThumbnail, [data-video-url]'), couponOrSale: !!document.querySelector('#couponBadgeRegularVpc, .dealBadge, #dealBadgeSupportingText') };
          });
          fs.writeFileSync(f, JSON.stringify({ ...it, ...d, fetchedAt: new Date().toISOString() }, null, 1)); log('detail', k, it.asin, d.title.slice(0, 30), d.reviews.length, 'reviews');
        } catch (e) { log('ERR detail', it.asin, e.message); }
      }
    }
    await page.close(); await b.close();
  },
  async analyze() {
    const SYS = `你是日本电商（Amazon.co.jp）选品与运营分析师，服务于一家在日本做多平台（Amazon/楽天/Yahoo/Shopify）的中国背景公司 ANET，货源主要来自 1688。请基于给出的单个热卖商品数据，用中文输出严谨、可执行的分析。不要编造数据；数据缺失就写「不明」。
输出 JSON：{"category_jp":"","product_type":"一句话品类","price_band":"价格带判断（含与同类的相对位置，不明则写不明）","why_it_sells":["3-6 条，按重要度，结合标题/卖点/评论/图片数/视频/A+/FBA/发售时间"],"customer_pain_points":["评论里反映的痛点/不满（可做差异化）"],"differentiation":["我们做同款时可以做的差异化（规格/套装/颜色/说明书/包装/赠品）"],"risks":["侵权/认证(PSE/食品/薬機法)/季节性/大牌垄断/低价内卷 等风险"],"entry_score":0-100,"entry_reason":"是否值得跟进的一句话","est_monthly_units":"按 BSR 粗估的月销区间（写明是粗估）","sourcing":{"cn_keywords":["1688 搜索用中文关键词 3-6 个，从具体到泛"],"spec_must_have":["向供应商确认的必要规格"],"target_cost_cny":"按日本售价倒推的目标采购价区间（人民币，假设售价×0.25〜0.35 为到手成本含运费）"},"listing_lessons":["这个 listing 的标题/图片/卖点里值得我们学的 2-4 点"]}`;
    for (const k of cats) {
      const dir = catDir(k); const adir = path.join(dir, 'analysis'); fs.mkdirSync(adir, { recursive: true });
      const files = fs.readdirSync(dir).filter((f) => /^B0[A-Z0-9]{8}\.json$/.test(f)).slice(0, Number(args.limit ?? 60)); let n = 0;
      const todo = files.filter((f) => args.force || !fs.existsSync(path.join(adir, f)));
      const worker = async () => { for (let f; (f = todo.shift()); ) {
        const out = path.join(adir, f);
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        const user = `カテゴリ: ${CATS[k]?.name ?? k}\nASIN: ${d.asin}　榜单: ${(d.lists ?? []).join('/')}　排名: ${JSON.stringify(d.rankIn ?? {})}\n标题: ${d.title}\n价格: ${d.price}　评分: ${d.rating}　评论数: ${d.reviewCount}\n品牌: ${d.brand}　卖家: ${d.seller}　配送: ${d.fulfilled}　发售: ${d.since || '不明'}\nBSR: ${d.bsr || '不明'}\n图片数: ${(d.images ?? []).length}　视频: ${d.hasVideo}　A+: ${d.hasAplus}　优惠券/特卖: ${d.couponOrSale}\n规格选项: ${(d.variants ?? []).slice(0, 15).join(' / ')}\n卖点:\n${(d.bullets ?? []).map((b) => '- ' + b).join('\n')}\n说明: ${String(d.description ?? '').slice(0, 1200)}\n评论样本:\n${(d.reviews ?? []).map((r) => `[${r.star}] ${r.title} — ${r.body}`).join('\n')}`;
        try { const j = await chatJson([{ role: 'system', content: SYS }, { role: 'user', content: user }]); fs.writeFileSync(out, JSON.stringify({ asin: d.asin, title: d.title, price: d.price, rating: d.rating, reviewCount: d.reviewCount, image: d.image ?? d.images?.[0], rankIn: d.rankIn, ...j }, null, 1)); n++; log('analyzed', k, d.asin, j.entry_score); }
        catch (e) { log('ERR analyze', d.asin, e.message); }
      } };
      await Promise.all(Array.from({ length: Number(args.concurrency ?? 4) }, worker));
      log(k, 'analyzed', n);
    }
  },
  report() {
    for (const k of cats) {
      const dir = catDir(k); const adir = path.join(dir, 'analysis'); if (!fs.existsSync(adir)) continue;
      const rows = fs.readdirSync(adir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(adir, f), 'utf8'))).sort((p, q) => (q.entry_score ?? 0) - (p.entry_score ?? 0));
      const date = new Date().toISOString().slice(0, 10); const name = CATS[k]?.name ?? k;
      const md = [`# Amazon.co.jp 市场调研：${name}（${date}）`, '', `样本 ${rows.length} 件（ベストセラー／新着／急上昇 榜单）。entry_score 为「我们是否值得跟进」的综合分，est 为按 BSR 的粗估。`, '', '## 跟进优先级', '', '| # | ASIN | 商品 | 价格 | 评分/评论 | 榜单排名 | 粗估月销 | 跟进分 | 结论 |', '|---|---|---|---|---|---|---|---|---|'];
      rows.forEach((r, i) => md.push(`| ${i + 1} | [${r.asin}](https://www.amazon.co.jp/dp/${r.asin}) | ${String(r.title).slice(0, 40)} | ${r.price} | ${r.rating} / ${r.reviewCount} | ${Object.entries(r.rankIn ?? {}).map(([a, b]) => `${a[0]}${b ?? '-'}`).join(' ')} | ${r.est_monthly_units ?? '-'} | ${r.entry_score} | ${r.entry_reason} |`));
      md.push('', '## 逐品分析', '');
      for (const r of rows) md.push(`### ${r.asin}　${String(r.title).slice(0, 60)}`, '', `![](${r.image ?? ''})`, '', `**品类** ${r.product_type}　**价格带** ${r.price_band}`, '', '**为什么好卖**', ...(r.why_it_sells ?? []).map((x) => `- ${x}`), '', '**评论痛点**', ...(r.customer_pain_points ?? []).map((x) => `- ${x}`), '', '**我们的差异化**', ...(r.differentiation ?? []).map((x) => `- ${x}`), '', '**风险**', ...(r.risks ?? []).map((x) => `- ${x}`), '', `**1688 找货** 关键词：${(r.sourcing?.cn_keywords ?? []).join('、')}；必确认规格：${(r.sourcing?.spec_must_have ?? []).join('、')}；目标采购价：${r.sourcing?.target_cost_cny ?? '-'}`, '', '**listing 可学之处**', ...(r.listing_lessons ?? []).map((x) => `- ${x}`), '');
      const docDir = path.join(ROOT, 'docs/market-research'); fs.mkdirSync(docDir, { recursive: true }); const out = path.join(docDir, `amazon-${k}-${date}.md`); fs.writeFileSync(out, md.join('\n'));
      fs.writeFileSync(path.join(dir, 'sourcing.json'), JSON.stringify(rows.filter((r) => (r.entry_score ?? 0) >= Number(args['min-score'] ?? 60)).map((r) => ({ asin: r.asin, title: r.title, price_jpy: r.price, image: r.image, keywords: r.sourcing?.cn_keywords ?? [], spec: r.sourcing?.spec_must_have ?? [], target_cost_cny: r.sourcing?.target_cost_cny ?? '', entry_score: r.entry_score })), null, 1));
      log('report →', path.relative(ROOT, out), '| sourcing.json', rows.filter((r) => (r.entry_score ?? 0) >= 60).length, 'items');
    }
  },
};
if (!run[stage]) { console.error('usage: cats | collect | detail | analyze | report  (--cat <key> …)'); process.exit(2); }
Promise.resolve(run[stage]()).then(() => log('done', stage)).catch((e) => { console.error(e); process.exit(1); });
