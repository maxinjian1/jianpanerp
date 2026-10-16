#!/usr/bin/env node
/**
 * 主推商品的真实市场价抽样：用 Playwright 打开 楽天市場（默认）或 Amazon.co.jp 搜索页，
 * 取前 8 个自然结果（去掉 PR/スポンサー）的价格中位数，与我们的售价和 AI 估价对比。只读，不登录，不下单。
 * Windows 上运行（需 playwright + chromium：npm i -D playwright && npx playwright install chromium）。
 *
 *   node tools/market-research/price-check.mjs                    # 楽天，hero-top50.json 全部
 *   node tools/market-research/price-check.mjs --limit 10         # 先试 10 个
 *   node tools/market-research/price-check.mjs --site amazon      # 改比 Amazon
 * 输出 out/price-check-<site>.json 与 out/price-check-<site>.md
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const SITE = args.site === 'amazon' ? 'amazon' : 'rakuten';
const SITE_LABEL = SITE === 'amazon' ? 'Amazon' : '楽天';
const OUT = 'tools/market-research/out';
const hero = JSON.parse(fs.readFileSync(path.join(OUT, 'hero-top50.json'), 'utf8')).slice(0, Number(args.limit ?? 50));
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: 'ja-JP', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

async function searchAmazon(q) {
  await page.goto(`https://www.amazon.co.jp/s?k=${encodeURIComponent(q)}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(1500 + Math.random() * 1500);
  return page.$$eval('div.s-result-item[data-component-type="s-search-result"]', (els) => els.slice(0, 12).map((e) => {
    const sponsored = !!e.querySelector('.puis-sponsored-label-text, [aria-label*="スポンサー"]');
    const whole = e.querySelector('.a-price .a-price-whole')?.textContent?.replace(/[^\d]/g, '');
    const title = e.querySelector('h2')?.textContent?.trim() ?? '';
    return { sponsored, price: whole ? Number(whole) : null, title: title.slice(0, 60) };
  }));
}

// 楽天搜索页的 class 名带哈希会变，所以不依赖具体 class：按商品卡容器取 innerText，正则抓第一个「X円」
async function searchRakuten(q) {
  await page.goto(`https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/?s=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2000 + Math.random() * 1500);
  return page.$$eval('div[class*="searchresultitem"], div[data-testid*="searchresultitem"], .searchresultitem', (els) => els.slice(0, 15).map((e) => {
    const text = e.innerText ?? '';
    const sponsored = /^\s*(PR|\[PR\]|広告)/m.test(text) || !!e.querySelector('[class*="advertise"], [class*="Advertise"], [aria-label*="広告"]');
    const m = text.match(/([\d,]{3,})\s*円/);
    const title = (e.querySelector('h2, a[title], [class*="title"]')?.textContent ?? text.split('\n').find((l) => l.length > 10) ?? '').trim();
    return { sponsored, price: m ? Number(m[1].replace(/,/g, '')) : null, title: title.slice(0, 60) };
  }));
}

const results = [];
for (const [i, h] of hero.entries()) {
  const q = (h.keywords ?? []).slice(0, 2).join(' ') || h.titleJa.slice(0, 30);
  try {
    const items = SITE === 'amazon' ? await searchAmazon(q) : await searchRakuten(q);
    const organic = items.filter((x) => !x.sponsored && x.price).slice(0, 8);
    const med = median(organic.map((x) => x.price));
    const row = { id: h.id, title: h.titleJa, handle: h.handle, our: h.retailPrice, ai_estimate: h.market_price_jpy, query: q, site: SITE, median: med, min: organic.length ? Math.min(...organic.map((x) => x.price)) : null, samples: organic.length, top3: organic.slice(0, 3) };
    results.push(row);
    console.log(`${i + 1}/${hero.length} ${h.titleJa.slice(0, 30)} | our ¥${h.retailPrice} | ${SITE_LABEL} med ${med ?? '-'} (n=${organic.length})`);
  } catch (e) {
    results.push({ id: h.id, title: h.titleJa, handle: h.handle, our: h.retailPrice, site: SITE, error: e.message });
    console.error(`fail ${h.titleJa.slice(0, 30)}: ${e.message}`);
  }
  await page.waitForTimeout(2500 + Math.random() * 2500);
}
await browser.close();
fs.writeFileSync(path.join(OUT, `price-check-${SITE}.json`), JSON.stringify(results, null, 2));
const L = [`# 主推商品 ${SITE_LABEL} 価格比較`, '', `| 商品 | 当店 | AI 推定 | ${SITE_LABEL} 中央値 | ${SITE_LABEL} 最安 | 判定 |`, '|---|---|---|---|---|---|'];
let cheaper = 0, same = 0, higher = 0;
for (const r of results) {
  if (r.error) { L.push(`| ${r.title.slice(0, 40)} | ¥${r.our} | - | 取得失敗 | - | - |`); continue; }
  const verdict = r.median == null ? '-' : r.our <= r.median * 0.9 ? '◎ 安い' : r.our <= r.median * 1.1 ? '○ 同等' : r.our <= r.median * 1.3 ? '△ やや高い' : '× 高い';
  if (verdict.startsWith('◎')) cheaper++; else if (verdict.startsWith('○')) same++; else if (verdict !== '-') higher++;
  L.push(`| [${r.title.slice(0, 40)}](https://anetmc.com/products/${r.handle ?? ''}) | ¥${r.our} | ${r.ai_estimate ? '¥' + r.ai_estimate : '-'} | ${r.median ? '¥' + Math.round(r.median) : '-'} | ${r.min ? '¥' + r.min : '-'} | ${verdict} |`);
}
L.push('', `合計: 安い ${cheaper} / 同等 ${same} / 高い ${higher}（取得失敗・該当なしを除く）`);
fs.writeFileSync(path.join(OUT, `price-check-${SITE}.md`), L.join('\n'));
console.log(`written out/price-check-${SITE}.md  (安い ${cheaper} / 同等 ${same} / 高い ${higher})`);
