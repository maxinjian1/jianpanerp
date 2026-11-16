/** 楽天トップ「ベビー・マタニティ」コーナー用バナー＋タイル（2026-11-16 用户「挑选美图放在首页」）。
 *   node tools/rakuten/top-banners/render-baby.mjs → out/bb/x/bbNN.jpg（R-Cabinet 名 bb-bbNN.jpg）
 * 写真は baby-NN 商品画像（1688 原図の切り落としのみ）だけ。価格は baby/spec.json の最低価格。文字は代码で描画。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '../../..');
const OUT = path.join(DIR, 'out', 'bb', 'x'); fs.mkdirSync(OUT, { recursive: true });
const FS = pathToFileURL(path.join(ROOT, 'node_modules/@fontsource')).href;
const P = (f) => 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, 'tools/sourcing-1688/out/baby/b/r', f)).toString('base64');
const spec = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/sourcing-1688/baby/spec.json'), 'utf8')).products;
const minPrice = (mn) => Math.min(...spec.find((p) => p.mn === mn).v.map((v) => v[v.length - 2]));

const head = (w, h) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FS}/zen-kaku-gothic-new/700.css"><link rel="stylesheet" href="${FS}/zen-kaku-gothic-new/900.css">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden}
body{font-family:"Zen Kaku Gothic New",sans-serif;font-weight:700;color:#4a3a32;background:#fbf6f0}
.ph{position:absolute;object-fit:cover;border-radius:28px;box-shadow:0 8px 24px rgba(120,90,70,.18)}
</style></head><body>`;

export const TILES = [
  ['baby-21', 'b21-02.jpg', 'フード付きバスタオル'],
  ['baby-06', 'b06-02.jpg', 'バンザイ スワドル'],
  ['baby-04', 'b04-02.jpg', '6重ガーゼ スリーパー'],
  ['baby-11', 'b11-01.jpg', '防寒ケープ 抱っこ紐・ベビーカー兼用'],
  ['baby-17', 'b17-02.jpg', 'ガーゼ 授乳ケープ'],
  ['baby-20', 'b20-06.jpg', '6重ガーゼ バスタオル'],
];

const pages = {
  bb01: [1100, 760, `
  <div class="ph" style="left:560px;top:40px;width:500px;height:500px;overflow:hidden"><img src="${P('b21-02.jpg')}" style="position:absolute;left:-150px;top:-142px;width:800px;height:800px"></div>
  <img class="ph" src="${P('b04-01.jpg')}" style="left:600px;top:470px;width:250px;height:250px;border:8px solid #fff">
  <img class="ph" src="${P('b17-01.jpg')}" style="left:830px;top:470px;width:250px;height:250px;border:8px solid #fff">
  <div style="position:absolute;left:60px;top:70px;width:480px">
    <div style="font-size:28px;letter-spacing:.14em;color:#c98b72">BABY &amp; MATERNITY</div>
    <div style="font-weight:900;font-size:66px;line-height:1.3;margin-top:22px">ベビー・<br>マタニティ<br>はじめました</div>
    <div style="font-size:30px;line-height:1.7;margin-top:26px;color:#6d5a50">ガーゼのスリーパー・おくるみ、<br>授乳ケープ、ベビーカー小物など<br>毎日つかうものを集めました。</div>
    <div style="display:inline-block;margin-top:34px;background:#c98b72;color:#fff;border-radius:999px;padding:16px 40px;font-size:32px">一覧を見る ›</div>
  </div>`],
};
TILES.forEach(([mn, f, name], i) => {
  pages['bb' + String(i + 2).padStart(2, '0')] = [600, 600, `
  ${f === 'b21-02.jpg' ? `<div style="position:absolute;left:0;top:0;width:600px;height:600px;overflow:hidden"><img src="${P(f)}" style="position:absolute;left:-180px;top:-170px;width:960px;height:960px"></div>` : `<img src="${P(f)}" style="position:absolute;left:0;top:0;width:600px;height:600px;object-fit:cover">`}
  <div style="position:absolute;left:0;right:0;bottom:0;height:120px;background:rgba(255,255,255,.92);padding:18px 26px">
    <div style="font-size:30px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
    <div style="font-size:34px;color:#c0563d;margin-top:6px">${minPrice(mn).toLocaleString()}円〜 <span style="font-size:22px;color:#8a7a72">送料無料</span></div>
  </div>`];
});

const br = await chromium.launch();
for (const [name, [w, h, body]] of Object.entries(pages)) {
  const pg = await br.newPage({ viewport: { width: w, height: h } });
  await pg.setContent(head(w, h) + body + '</body></html>', { waitUntil: 'networkidle' });
  await pg.evaluate(() => document.fonts.ready);
  await pg.screenshot({ path: path.join(OUT, name + '.jpg'), type: 'jpeg', quality: 88 });
  await pg.close(); console.log(name);
}
await br.close();
