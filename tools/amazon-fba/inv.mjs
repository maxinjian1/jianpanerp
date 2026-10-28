// cdp-run 用手順：商品の管理 で ASIN ごとに FBA 手持ち在庫・在庫あり・価格・手数料を読む → tools/amazon-fba/out/inventory.json
//   node tools/amazon-fba/cdp-run.mjs tools/amazon-fba/inv.mjs
import fs from 'node:fs';
import path from 'node:path';
export default async ({ page }) => {
  const ROOT = path.resolve(import.meta.dirname, '../..'); const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/amazon-fba/out/top30.json'), 'utf8'));
  const asins = [...T.top30.map((x) => x.asin), ...T.newcomers.map((x) => x.asin)]; const out = {};
  for (const a of asins) {
    await page.goto(`https://sellercentral-japan.amazon.com/myinventory/inventory?fulfilledBy=all&page=1&pageSize=25&searchField=all&searchTerm=${a}&sort=date_created_desc&status=all`, { waitUntil: 'domcontentloaded' });
    let t = ''; for (let k = 0; k < 20; k++) { await page.waitForTimeout(1000); t = await page.locator('body').innerText(); if (t.includes('手数料の合計') || t.includes('結果がありません') || t.includes('0件')) break; }
    const rows = t.split(/\n(?=\[|\S+ \S+\n)/); const i = t.indexOf(`\n${a}\n`);
    const seg = i < 0 ? '' : t.slice(i, (t.indexOf('価格の詳細', i) + 1 || t.length + 1) - 1);
    const m = (re) => (seg.match(re) || [])[1];
    const skus = [...t.matchAll(new RegExp(`\n${a}\n\|\n([^\n]+)\n\|\n([^\n]*)`, 'g'))].map((x) => ({ sku: x[1], fnsku: x[2] }));
    out[a] = { found: i >= 0, skus, status: m(/新規\n\s*\n?\s*([^\n]+)/), onHand: Number(m(/手持ち在庫（FBA）\n(\d+)/) ?? NaN), available: Number(m(/在庫あり\n(\d+)/) ?? NaN), fbm: m(/出品者出荷[^\n]*\n(\d+)/), price: Number((m(/価格\n￥([\d,]+)/) || '').replace(/,/g, '')) || null, feeTotal: Number((m(/手数料の合計\n￥([\d,]+)/) || '').replace(/,/g, '')) || null, fbaFee: Number((m(/FBA手数料\n￥([\d,]+)/) || '').replace(/,/g, '')) || null };
    console.log(a, JSON.stringify(out[a]));
  }
  fs.writeFileSync(path.join(ROOT, 'tools/amazon-fba/out/inventory.json'), JSON.stringify({ at: new Date().toISOString(), items: out }, null, 1));
};
