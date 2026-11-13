/** 楽天 ベビー系サブジャンルの週間ランキングを Playwright で取得 → out/baby/rank.json
 *   node tools/sourcing-1688/baby/rank.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
const G = { 566089: '抱っこひも', 200822: 'ベビー寝具', 566090: 'ベビーインテリア収納', 200815: 'おふろ', 200839: 'ベビーセーフティ', 111102: 'ベビーファッション', 111116: 'マタニティ・ママ', 508445: '出産祝い', 200827: '授乳・食事', 200833: 'ベビーカー', 551702: 'ベビー教材', 205200: 'ヘルスケア衛生' };
const b = await chromium.launch({ headless: false }); const pg = await b.newPage({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', locale: 'ja-JP' });
const out = [];
for (const [id, g] of Object.entries(G)) {
  for (const p of [1, 2]) {
    await pg.goto(`https://ranking.rakuten.co.jp/weekly/${id}/${p > 1 ? `p=${p}/` : ''}`, { waitUntil: 'domcontentloaded' });
    for (let y = 0; y < 30; y++) { await pg.mouse.wheel(0, 1500); await pg.waitForTimeout(150); }
    const rows = await pg.$$eval('.rnkRanking_itemName a', (as) => as.map((a) => {
      let c = a; for (let k = 0; k < 8 && c && !(c.querySelector('.rnkRanking_price') || /円/.test(c.innerText) && c.querySelector('img')); k++) c = c.parentElement;
      const t = c ? c.innerText : '';
      return { name: a.innerText.trim(), url: a.href.split('?')[0], rev: +((t.match(/レビュー\(([\d,]+)件/) || [])[1] || '0').replace(/,/g, ''), price: +((t.match(/([\d,]+)円/) || [])[1] || '0').replace(/,/g, ''), img: ((c && c.querySelector('img')) || {}).src?.split('?')[0] || '' };
    }));
    rows.forEach((r, i) => out.push({ genre: g, rank: (p - 1) * 80 + i + 1, ...r }));
    console.log(g, p, rows.length);
    await pg.waitForTimeout(1200);
  }
}
fs.mkdirSync('tools/sourcing-1688/out/baby', { recursive: true });
fs.writeFileSync('tools/sourcing-1688/out/baby/rank.json', JSON.stringify(out, null, 1));
await b.close();
