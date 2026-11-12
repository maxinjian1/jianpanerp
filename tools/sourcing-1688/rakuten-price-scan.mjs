/** 1688 選品 → 楽天の同類商品の価格帯・レビュー数を調べる（検索結果 1 ページ、PR 除外、当店除外）
 *   node tools/sourcing-1688/rakuten-price-scan.mjs
 * 出力 tools/sourcing-1688/out/rakuten-pj/price-scan.json
 */
import fs from 'node:fs';
import { chromium } from 'playwright';
const OUT = 'tools/sourcing-1688/out/rakuten-pj/price-scan.json';
const Q = {
  1: 'サテン キャミワンピース パッド付き ルームウェア',
  2: 'サテン ナイトドレス ガウン セット',
  3: 'サテン ナイトドレス レース バックオープン',
  4: 'ドット柄 キャミワンピース ガウン ルームウェア',
  5: 'もこもこ ルームウェア 3点セット レディース',
  6: 'ベロア パジャマ カップ付き 長袖 レディース',
  8: 'パジャマ レディース 長袖 フリル 冷感',
  9: 'サテン キャミワンピース 胸パッド付き',
  11: 'サテン キャミワンピース レース ガウン セット',
  12: 'サテン ナイトドレス バッククロス',
  13: 'サテン ナイトドレス リボン ガウン',
  14: 'サテン ナイトドレス ガウン 刺繍',
  16: 'サテン パジャマ レディース 長袖 レース',
};
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ locale: 'ja-JP', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', viewport: { width: 1280, height: 900 } })).newPage();
const res = {};
for (const [no, q] of Object.entries(Q)) {
  await page.goto(`https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500 + Math.random() * 1500);
  const items = await page.$$eval('div[class*="searchresultitem"], div[data-testid*="searchresultitem"], .searchresultitem', (els) => els.slice(0, 45).map((e) => {
    const text = e.innerText ?? ''; const a = e.querySelector('a[href*="item.rakuten.co.jp/"]'); const href = a?.getAttribute('href') ?? '';
    const shop = (href.match(/item\.rakuten\.co\.jp\/([^/]+)\//) ?? [])[1] ?? '';
    const sponsored = /^\s*(PR|\[PR\]|広告)/m.test(text) || !!e.querySelector('[class*="advertise"], [aria-label*="広告"]');
    const m = text.match(/([\d,]{3,})\s*円/); const rv = text.match(/\(([\d,]+)件\)/) ?? text.match(/([\d,]+)件/);
    const title = (e.querySelector('h2, a[title], [class*="title"]')?.textContent ?? '').trim();
    return { sponsored, shop, price: m ? Number(m[1].replace(/,/g, '')) : null, reviews: rv ? Number(rv[1].replace(/,/g, '')) : 0, title: title.slice(0, 70) };
  }));
  const comp = items.filter((x) => !x.sponsored && x.price && x.shop !== 'anet-fashion');
  const top = [...comp].sort((a, b) => b.reviews - a.reviews).slice(0, 5);
  res[no] = { q, n: comp.length, min: Math.min(...comp.map((x) => x.price)), median: median(comp.map((x) => x.price)), p25: (() => { const s = comp.map((x) => x.price).sort((a, b) => a - b); return s[Math.floor(s.length / 4)]; })(), topReviewed: top };
  console.log(no, q, res[no].n, res[no].min, res[no].p25, res[no].median, top.map((t) => `${t.price}円/${t.reviews}件`).join(' '));
}
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
await browser.close();
