/** 楽天 anet-fashion 店舗トップ（R-Storefront）用バナーを HTML → JPG で描画。
 *   node tools/rakuten/top-banners/render.mjs   → tools/rakuten/top-banners/out/*.jpg
 * 素材は自店の商品画像（assets/、R-Cabinet から取得）だけ。文字は代码で描く（AI 生成なし）。
 * 数字は 2026-11-13 に商品ページ・RMS API で確認した値だけを使う：
 *   banz-0001 4,950円・送料無料・レビュー 4.68（19件）・生後0ヶ月〜2歳頃・NRR 31dB・4デザイン
 *   saloncare-2set 1,780円 / 3set 2,390円 / bodywash 1,580円 / スカルプ 900円〜
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'out'); fs.mkdirSync(OUT, { recursive: true });
const FS = pathToFileURL(path.resolve(DIR, '../../../node_modules/@fontsource')).href;
const A = (f) => pathToFileURL(path.join(DIR, 'assets', f)).href;
const RC = 'https://tshop.r10s.jp/anet-fashion/cabinet';

const head = (w, h) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="${FS}/zen-kaku-gothic-new/700.css"><link rel="stylesheet" href="${FS}/zen-kaku-gothic-new/900.css">
<link rel="stylesheet" href="${FS}/noto-sans-jp/700.css"><link rel="stylesheet" href="${FS}/noto-sans-jp/900.css">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden}
body{font-family:"Zen Kaku Gothic New","Noto Sans JP",sans-serif;font-weight:700;color:#3a2e2a}
.chip{display:inline-block;border-radius:999px;padding:8px 22px;font-size:27px;background:#fff;border:3px solid #f1b8a6;color:#c0563d;margin:0 10px 12px 0}
.btn{display:inline-flex;align-items:center;gap:14px;background:#d9534f;color:#fff;border-radius:999px;padding:18px 44px;font-size:36px;box-shadow:0 6px 0 #a83b37}
</style></head><body>`;

const banners = {
  // 1. BANZ イヤーマフ（主力・売上の約 9 割）
  '01-banz-hero': [1100, 1100, `
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,#fff7f0 0%,#fdeee4 100%)"></div>
  <img src="${A('banz-baby.jpg')}" style="position:absolute;right:0;top:0;width:480px;height:660px;object-fit:cover">
  <div style="position:absolute;right:0;top:0;width:480px;height:660px;background:linear-gradient(90deg,#fff7f0 0%,rgba(255,247,240,0) 28%)"></div>
  <div style="position:absolute;left:56px;top:60px;width:640px">
    <div style="font-size:30px;letter-spacing:.12em;color:#c0563d">BANZ ／ オーストラリア発</div>
    <div style="font-family:'Zen Kaku Gothic New';font-weight:900;font-size:72px;line-height:1.25;margin-top:18px;white-space:nowrap">赤ちゃんの耳を、<br>やさしく守る。</div>
    <div style="font-size:38px;margin-top:20px">ベビー用 防音イヤーマフ</div>
    <div style="margin-top:24px;width:600px"><span class="chip">生後0ヶ月〜2歳頃</span><span class="chip">NRR 31dB</span><br><span class="chip">4デザイン</span><span class="chip" style="background:#d9534f;border-color:#d9534f;color:#fff">送料無料</span></div>
    <div style="margin-top:14px;font-size:34px;color:#e0952b">★★★★★ <span style="color:#3a2e2a">4.68</span> <span style="font-size:26px;color:#8a7a72">（レビュー19件・11/13時点）</span></div>
  </div>
  <div style="position:absolute;left:0;right:0;top:690px;text-align:center;font-size:32px;color:#8a5a4a;letter-spacing:.06em">花火大会 ・ 飛行機 ・ お祭り ・ 帰省 ・ 出産祝いにも</div>
  <img src="${A('banz-colors.jpg')}" style="position:absolute;left:30px;top:740px;width:1040px;height:250px;object-fit:cover;object-position:top">
  <div style="position:absolute;left:0;right:0;bottom:30px;text-align:center"><span class="btn">4,950円（税込）　商品ページへ ▶</span></div>`],

  // 2. SALON CARE ヘアケア
  '03-saloncare': [1100, 1100, `
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,#f3f6ef 0%,#e6eedf 100%)"></div>
  <div style="position:absolute;left:0;right:0;top:70px;text-align:center">
    <div style="font-size:30px;letter-spacing:.3em;color:#4f6b45">SALON CARE</div>
    <div style="font-family:'Zen Kaku Gothic New';font-weight:900;font-size:76px;line-height:1.25;margin-top:18px;color:#2f3d2b">毎日のバスタイムに、<br>たっぷり使える大容量。</div>
    <div style="font-size:34px;margin-top:22px;color:#4f6b45">ノンシリコン シャンプー＆コンディショナー 700ml×2</div>
  </div>
  <img src="${A('s-2set.jpg')}" style="position:absolute;left:330px;top:400px;width:440px;height:520px;object-fit:contain;mix-blend-mode:multiply">
  <div style="position:absolute;left:60px;top:480px;width:300px;white-space:nowrap;font-size:28px;line-height:1.9;color:#2f3d2b">
    <div>✔ 2本セット　1,780円</div><div>✔ 3本セット　2,390円</div></div>
  <div style="position:absolute;right:60px;top:480px;width:300px;white-space:nowrap;font-size:28px;line-height:1.9;color:#2f3d2b;text-align:right">
    <div>ボディウォッシュ 1,580円</div><div>スカルプ 900円〜</div></div>
  <div style="position:absolute;left:0;right:0;bottom:44px;text-align:center"><span class="btn" style="background:#4f7a46;box-shadow:0 6px 0 #355730">SALON CARE の商品を見る ▶</span></div>`],
};

// 2×2 のカテゴリ入口（小画像 600×600）
const tile = (img, label, sub, color, fit = 'cover') => [600, 600, `
  <img src="${img}" style="position:absolute;inset:0;width:600px;height:470px;object-fit:${fit};background:#fff">
  <div style="position:absolute;left:0;right:0;bottom:0;height:130px;background:${color};color:#fff;text-align:center;padding-top:16px">
    <div style="font-family:'Zen Kaku Gothic New';font-weight:900;font-size:46px;line-height:1.1">${label}</div>
    <div style="font-size:26px;margin-top:8px;opacity:.95">${sub} ▶</div></div>`];
Object.assign(banners, {
  '11-tile-earmuff': tile(A('banz-baby.jpg'), 'ベビー イヤーマフ', '0〜2歳頃・送料無料', '#d9534f'),
  '12-tile-sunglass': tile(A('p-009.jpg'), 'キッズ サングラス', 'BANZ・UVカット', '#e0882b'),
  '13-tile-goggle-cap': tile(A('p-005.jpg'), 'ゴーグル・帽子', 'BANZ キッズ', '#3d7cc9', 'contain'),
  '14-tile-haircare': tile(A('s-2set.jpg'), 'ヘアケア', 'SALON CARE', '#4f7a46', 'contain'),
});

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, [w, h, body]] of Object.entries(banners)) {
  const f = path.join(OUT, `${name}.html`);
  fs.writeFileSync(f, head(w, h) + `<div style="position:relative;width:${w}px;height:${h}px;overflow:hidden">${body}</div></body></html>`);
  await page.setViewportSize({ width: w, height: h });
  await page.goto(pathToFileURL(f).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(OUT, `${name}.jpg`), type: 'jpeg', quality: 88 });
  console.log('ok', name);
}
await browser.close();
