/**
 * 1688 找同款 + 供应商对接（Windows：用户本人登录的 1688 Chrome，CDP 9223）
 *
 *   node tools/amazon-listing/seller-central/browser.mjs --profile anet-1688 --url https://www.1688.com --port 9223   # 先开窗口，用户自己登录 1688
 *   node tools/sourcing-1688/find.mjs search  --in tools/amazon-research/out/home/sourcing.json [--limit 20] [--per 15]   # 关键词 + 以图搜图 → out/<asin>/offers.json
 *   node tools/sourcing-1688/find.mjs match   --in ... [--limit 20]      # 6kpro 视觉比对 Amazon 图 vs 1688 货品图 → 同款判定 + 供应商打分 → out/<asin>/match.json
 *   node tools/sourcing-1688/find.mjs draft   --in ...                   # 生成每个供应商的首条消息（用户话术 + 微信号）→ out/outreach-queue.json + docs/sourcing/1688-候选供应商-<date>.md
 *   node tools/sourcing-1688/find.mjs send    --max 20 [--dry]           # 在旺旺网页版逐条发送（每条间隔 ≥60s，每天 ≤ --max；只发 queue 里 approved=true 的）
 *
 * 规则：
 *  - 账号登录由用户本人完成；脚本不碰密码。
 *  - 默认不发任何消息：draft 产出的 queue 里 approved 默认 false，用户审完后把要发的改为 true（或传 --approve-all，仅限用户明确同意后）。
 *  - 1688 风控：同一账号每天建议 ≤20 条首次问询；遇到验证码/滑块立即停止。
 *  - 发送内容只含商品问询与用户自己给的联系方式，不含客户数据。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const stage = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const jitter = (a = 2500, b = 6000) => sleep(a + Math.random() * (b - a));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash', VISION_MODEL = env.CN_LLM_VISION_MODEL || MODEL;
const CDP = args.cdp ?? 'http://127.0.0.1:9223';
const WECHAT = env.SOURCING_WECHAT || '215914546'; // 用户 2026-10-18 给出的联系方式
const COMPANY = env.SOURCING_COMPANY || 'アネット株式会社（ANET，日本）';
const QUEUE = path.join(OUT, 'outreach-queue.json');
const dirOf = (asin) => { const d = path.join(OUT, asin); fs.mkdirSync(d, { recursive: true }); return d; };
const loadIn = () => { if (!args.in) throw new Error('--in <sourcing.json> を指定'); let a = JSON.parse(fs.readFileSync(path.resolve(ROOT, args.in), 'utf8')); if (args.asin) a = a.filter((x) => x.asin === args.asin); if (args.limit) a = a.slice(0, Number(args.limit)); return a; };

async function chat(messages, { json = true, maxTokens = 2500, retries = 3, model = MODEL } = {}) {
  for (let i = 0; i < retries; i++) {
    try { const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model, temperature: 0.2, max_tokens: maxTokens, ...(json ? { response_format: { type: 'json_object' } } : {}), messages }) }); const j = await r.json(); const c = j.choices?.[0]?.message?.content; if (!c) throw new Error('empty'); if (!json) return c; const m = c.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : c); }
    catch (e) { if (i === retries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}
async function browser() { const { chromium } = await import('playwright'); const b = await chromium.connectOverCDP(CDP); const ctx = b.contexts()[0]; const page = await ctx.newPage(); return { b, ctx, page }; }
const risky = (page) => /login|passport|punish|captcha|_____tmd_____|sec\.1688/i.test(page.url());
const num = (s) => Number(String(s ?? '').replace(/[^0-9.]/g, '')) || 0;

async function scrapeOffers(page) {
  for (let y = 0; y < 5; y++) { await page.mouse.wheel(0, 1600); await sleep(600); }
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.offer-list-row-offer, .sm-offer-item, [class*="offer-item"], .space-offer-card-box, [data-h5-type="offerCard"]')];
    return cards.map((el) => {
      const t = (s) => el.querySelector(s)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      const a = el.querySelector('a[href*="detail.1688.com"], a[href*="offer/"]'); const url = a?.href ?? '';
      const text = el.innerText.replace(/\s+/g, ' ');
      return { url, offerId: (url.match(/offer\/(\d+)/) || [])[1] ?? '', title: t('.title, .offer-title, [class*="title"]') || a?.getAttribute('title') || '', price: (text.match(/¥\s*([0-9.]+)/) || [])[1] ?? '', moq: (text.match(/([0-9]+)\s*(件|个|套|双|条|只|箱)起批/) || [])[0] ?? '', sold: (text.match(/(成交|已售)\s*([0-9.]+万?\+?)/) || [])[0] ?? '', supplier: t('.company-name, [class*="company"], [class*="shop-name"]'), years: (text.match(/([0-9]+)\s*年/) || [])[1] ?? '', repurchase: (text.match(/回头率\s*([0-9.]+%)/) || [])[1] ?? '', image: el.querySelector('img')?.src ?? '', badges: ['实力商家', '源头工厂', '深度验厂', '一件代发', '48小时发货', '7天包换', '严选'].filter((b) => text.includes(b)) };
    }).filter((x) => x.url);
  });
}

const run = {
  async search() {
    const { b, page } = await browser(); const per = Number(args.per ?? 15);
    for (const it of loadIn()) {
      const f = path.join(dirOf(it.asin), 'offers.json'); if (fs.existsSync(f) && !args.force) continue;
      const offers = new Map();
      for (const kw of (it.keywords ?? []).slice(0, 3)) {
        try { await page.goto(`https://s.1688.com/selloffer/offer_search.htm?keywords=${encodeURIComponent(kw)}&sortType=va_rmdarkgmv30rt`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await jitter(); if (risky(page)) { log('RISK/LOGIN', page.url()); await page.screenshot({ path: path.join(OUT, `risk-${Date.now()}.png`) }); break; }
          const got = await scrapeOffers(page); for (const o of got.slice(0, per)) if (!offers.has(o.offerId || o.url)) offers.set(o.offerId || o.url, { ...o, via: kw }); log('search', it.asin, kw, got.length); }
        catch (e) { log('ERR search', it.asin, kw, e.message); }
      }
      // 以图搜图（1688 画像検索 URL は仕様変更が多いので失敗しても続行）
      if (it.image && !args['no-image']) { try { await page.goto(`https://s.1688.com/youyuan/index.htm?tab=imageSearch&imageAddress=${encodeURIComponent(it.image)}`, { waitUntil: 'domcontentloaded', timeout: 60000 }); await jitter(); if (!risky(page)) { const got = await scrapeOffers(page); for (const o of got.slice(0, per)) if (!offers.has(o.offerId || o.url)) offers.set(o.offerId || o.url, { ...o, via: 'image' }); log('image-search', it.asin, got.length); } } catch (e) { log('image-search skip', it.asin, e.message.slice(0, 80)); } }
      fs.writeFileSync(f, JSON.stringify({ asin: it.asin, title: it.title, price_jpy: it.price_jpy, image: it.image, target_cost_cny: it.target_cost_cny, offers: [...offers.values()] }, null, 1)); log(it.asin, 'offers', offers.size);
    }
    await page.close(); await b.close();
  },
  async match() {
    const SYS = `你是跨境选品采购。给你一个 Amazon.co.jp 热卖商品（标题、日元价、主图 URL）和若干 1688 货品（标题、价格、起批、成交、供应商、标签、图 URL）。请判断每个货品是否为同款/可替代款，并给供应商打分。
打分依据：同款相似度（标题+图）、价格是否在目标采购价内、起批量是否友好（≤50 为好）、成交量、实力商家/源头工厂/一件代发 标签、经营年限、回头率。
输出 JSON：{"items":[{"offerId":"","same_product":"same|similar|different","similarity":0-100,"supplier_score":0-100,"why":"一句话","ask":["向该供应商要确认的 1-3 个关键问题（日本认证/包装/最小起订/打样/日文说明书）"]}],"best":["按综合排序的 offerId 前 5"]}`;
    for (const it of loadIn()) {
      const d = dirOf(it.asin); const of = path.join(d, 'offers.json'); if (!fs.existsSync(of)) continue; const out = path.join(d, 'match.json'); if (fs.existsSync(out) && !args.force) continue;
      const O = JSON.parse(fs.readFileSync(of, 'utf8')); if (!O.offers.length) continue;
      const content = [{ type: 'text', text: `Amazon 商品：${O.title}　价格 ${O.price_jpy}　目标采购价 ${O.target_cost_cny}\n1688 货品：\n${O.offers.slice(0, 20).map((o, i) => `${i + 1}. offerId=${o.offerId} | ${o.title} | ¥${o.price} | ${o.moq} | ${o.sold} | ${o.supplier} | ${o.years}年 | 回头率${o.repurchase} | ${o.badges.join('/')}`).join('\n')}` }];
      if (O.image) content.push({ type: 'text', text: 'Amazon 主图：' }, { type: 'image_url', image_url: { url: O.image } });
      for (const o of O.offers.slice(0, 8)) if (o.image) content.push({ type: 'text', text: `1688 offerId=${o.offerId} 图：` }, { type: 'image_url', image_url: { url: o.image.startsWith('//') ? 'https:' + o.image : o.image } });
      try { const j = await chat([{ role: 'system', content: SYS }, { role: 'user', content }], { maxTokens: 3000, model: VISION_MODEL }); fs.writeFileSync(out, JSON.stringify({ asin: it.asin, ...j }, null, 1)); log('matched', it.asin, (j.best ?? []).length); }
      catch (e) { log('ERR match', it.asin, e.message); }
    }
  },
  async draft() {
    const items = loadIn(); const queue = fs.existsSync(QUEUE) ? JSON.parse(fs.readFileSync(QUEUE, 'utf8')) : []; const seen = new Set(queue.map((q) => q.offerId));
    const date = new Date().toISOString().slice(0, 10); const md = [`# 1688 候选供应商与首条问询（${date}）`, '', `> 发送前请审核：把 \`tools/sourcing-1688/out/outreach-queue.json\` 里要发的条目 approved 改为 true；或在 Windows 会话里说「批准全部」。微信：${WECHAT}`, ''];
    for (const it of items) {
      const d = dirOf(it.asin); const of = path.join(d, 'offers.json'), mf = path.join(d, 'match.json'); if (!fs.existsSync(of) || !fs.existsSync(mf)) continue;
      const O = JSON.parse(fs.readFileSync(of, 'utf8')), M = JSON.parse(fs.readFileSync(mf, 'utf8')); const byId = Object.fromEntries(O.offers.map((o) => [o.offerId, o])); const mi = Object.fromEntries((M.items ?? []).map((x) => [x.offerId, x]));
      const best = (M.best ?? []).map((id) => byId[id]).filter(Boolean).slice(0, Number(args.top ?? 3));
      md.push(`## ${it.asin}　${String(it.title).slice(0, 50)}`, '', `Amazon 售价 ${it.price_jpy}　目标采购价 ${it.target_cost_cny}`, '', '| 供应商 | 货品 | 价格 | 起批 | 成交 | 标签 | 同款 | 供应商分 | 链接 |', '|---|---|---|---|---|---|---|---|---|');
      for (const o of best) {
        const m = mi[o.offerId] ?? {}; md.push(`| ${o.supplier} | ${String(o.title).slice(0, 30)} | ¥${o.price} | ${o.moq} | ${o.sold} | ${o.badges.join('/')} | ${m.same_product ?? '-'} ${m.similarity ?? ''} | ${m.supplier_score ?? '-'} | [打开](${o.url}) |`);
        if (seen.has(o.offerId)) continue;
        const asks = (m.ask ?? []).slice(0, 2).join('；');
        const message = `您好，我们是${COMPANY}，在日本做 Amazon、楽天、Yahoo、Shopify 多平台销售。看到贵公司的「${String(o.title).slice(0, 30)}」，希望能拿到贵公司的产品长期合作。想先了解：${asks || '起订量、打样周期、是否支持一件代发到日本集货仓'}。方便的话可以加微信 ${WECHAT} 详聊吗？谢谢。`;
        queue.push({ asin: it.asin, offerId: o.offerId, url: o.url, supplier: o.supplier, offerTitle: o.title, message, approved: args['approve-all'] === '1', status: 'pending', createdAt: new Date().toISOString() }); seen.add(o.offerId);
      }
      md.push('');
    }
    fs.writeFileSync(QUEUE, JSON.stringify(queue, null, 1)); const docDir = path.join(ROOT, 'docs/sourcing'); fs.mkdirSync(docDir, { recursive: true }); const outMd = path.join(docDir, `1688-候选供应商-${date}.md`); fs.writeFileSync(outMd, md.join('\n'));
    log('queue', queue.length, 'pending', queue.filter((q) => q.status === 'pending').length, '→', path.relative(ROOT, outMd));
  },
  async send() {
    const queue = JSON.parse(fs.readFileSync(QUEUE, 'utf8')); const max = Number(args.max ?? 20); const today = new Date().toISOString().slice(0, 10);
    const sentToday = queue.filter((q) => q.status === 'sent' && (q.sentAt ?? '').startsWith(today)).length; let budget = Math.max(0, max - sentToday);
    const todo = queue.filter((q) => q.status === 'pending' && q.approved === true); log('approved pending', todo.length, 'budget today', budget);
    if (!todo.length || !budget) return;
    const { b, ctx, page } = await browser();
    for (const q of todo) {
      if (budget <= 0) break;
      try {
        await page.goto(q.url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await jitter(); if (risky(page)) { log('RISK — stop', page.url()); await page.screenshot({ path: path.join(OUT, `risk-${Date.now()}.png`) }); break; }
        const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 20000 }).catch(() => null), page.getByText(/联系供应商|联系厂家|和我联系|在线咨询/).first().click({ timeout: 15000 })]);
        const chat = popup ?? page; await chat.waitForLoadState('domcontentloaded'); await jitter(3000, 5000);
        const box = chat.locator('textarea, [contenteditable="true"], #chat-input, .send-textarea').first(); await box.waitFor({ timeout: 20000 });
        if (args.dry) { log('[dry] would send to', q.supplier, q.message.slice(0, 40)); if (popup) await popup.close(); continue; }
        await box.click(); await box.fill(q.message); await sleep(800); await chat.keyboard.press('Enter'); await sleep(1500);
        if (await chat.locator('button:has-text("发送"), .send-btn').count()) { try { await chat.locator('button:has-text("发送"), .send-btn').first().click({ timeout: 3000 }); } catch {} }
        await chat.screenshot({ path: path.join(OUT, `sent-${q.offerId}.png`) }); q.status = 'sent'; q.sentAt = new Date().toISOString(); budget--; fs.writeFileSync(QUEUE, JSON.stringify(queue, null, 1)); log('sent', q.supplier, 'remaining budget', budget);
        if (popup) await popup.close(); await sleep(60000 + Math.random() * 30000); // ≥60s 間隔
      } catch (e) { q.status = 'failed'; q.error = e.message.slice(0, 200); fs.writeFileSync(QUEUE, JSON.stringify(queue, null, 1)); log('ERR send', q.supplier, e.message.slice(0, 120)); await page.screenshot({ path: path.join(OUT, `fail-${q.offerId}.png`) }).catch(() => {}); }
    }
    await page.close(); await b.close();
  },
};
if (!run[stage]) { console.error('usage: search | match | draft | send'); process.exit(2); }
Promise.resolve(run[stage]()).then(() => log('done', stage)).catch((e) => { console.error(e); process.exit(1); });
