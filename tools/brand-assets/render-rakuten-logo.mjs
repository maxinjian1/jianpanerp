// 楽天店舗（anet-fashion）の店舗名・ロゴ案を HTML → PNG で描画（Chromium、画像モデル不要）。
//   node tools/brand-assets/render-rakuten-logo.mjs  → tools/brand-assets/out/rakuten-logo/*.png
// 3 案 × 3 サイズ：横長 600×160（店舗ロゴ・ヘッダー）、正方 400×400（SNS/アイコン）、小 240×60（サイドナビ/メール）。
// 色：楽天赤 #BF0000（Shopify v6 と同じ）、黒 #222、アクセント黄 #FFD400。フォントは環境の太ゴシック。
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, 'out/rakuten-logo');
mkdirSync(OUT, { recursive: true });
const RED = '#BF0000', YEL = '#FFD400', INK = '#222', FONT = `"Noto Sans JP","Noto Sans CJK JP","IPAPGothic","IPAGothic",sans-serif`;
const page_ = (w, h, body, bg = '#fff') => `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden;background:${bg}}body{font-family:${FONT};font-weight:900}</style></head><body>${body}</body></html>`;

// 案 A「アネット」：赤い正方マーク「安」＋黒ワードマーク。Shopify / アプリ「安い」と同じ血統
const A = {
  wide: (w, h) => page_(w, h, `<div style="width:${w}px;height:${h}px;display:flex;align-items:center;gap:${h * .16}px;padding:0 ${h * .18}px">
    <div style="width:${h * .72}px;height:${h * .72}px;background:${RED};border-radius:${h * .12}px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:${h * .46}px;line-height:1">安</div>
    <div><div style="color:${INK};font-size:${h * .42}px;letter-spacing:.02em;line-height:1.05">アネット</div>
    <div style="color:${RED};font-size:${h * .14}px;letter-spacing:.08em;margin-top:${h * .07}px">日本一の安さを、目指して。<span style="color:#888;margin-left:1em;letter-spacing:.3em">ANET</span></div></div></div>`),
  square: (w) => page_(w, w, `<div style="width:${w}px;height:${w}px;background:${RED};display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff">
    <div style="font-size:${w * .44}px;line-height:1">安</div><div style="font-size:${w * .13}px;letter-spacing:.1em;margin-top:${w * .05}px">アネット</div><div style="font-size:${w * .06}px;letter-spacing:.35em;opacity:.85;margin-top:${w * .03}px">ANET</div></div>`),
};
// 案 B「安いモール アネット」：赤帯に白抜き、左に黄色の値札タグ「安い」
const B = {
  wide: (w, h) => page_(w, h, `<div style="width:${w}px;height:${h}px;background:${RED};display:flex;align-items:center;gap:${h * .14}px;padding:0 ${h * .2}px;color:#fff">
    <div style="background:${YEL};color:${RED};font-size:${h * .3}px;padding:${h * .06}px ${h * .14}px;border-radius:${h * .06}px;transform:rotate(-6deg);line-height:1;box-shadow:0 ${h * .03}px 0 rgba(0,0,0,.25)">安い</div>
    <div><div style="font-size:${h * .40}px;letter-spacing:.02em;line-height:1.05">アネット</div>
    <div style="font-size:${h * .15}px;letter-spacing:.12em;opacity:.95;margin-top:${h * .06}px">安いモール ・ 全国送料無料</div></div></div>`, RED),
  square: (w) => page_(w, w, `<div style="width:${w}px;height:${w}px;background:${RED};display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;gap:${w * .04}px">
    <div style="background:${YEL};color:${RED};font-size:${w * .26}px;padding:${w * .04}px ${w * .1}px;border-radius:${w * .04}px;transform:rotate(-6deg);line-height:1">安い</div>
    <div style="font-size:${w * .14}px;letter-spacing:.08em;margin-top:${w * .04}px">アネット</div><div style="font-size:${w * .06}px;letter-spacing:.2em;opacity:.9">安いモール</div></div>`, RED),
};
// 案 C「ANET 暮らしの百貨」：白地、黒 ANET ＋ 赤い下線、総合店らしい落ち着き
const C = {
  wide: (w, h) => page_(w, h, `<div style="width:${w}px;height:${h}px;display:flex;align-items:center;gap:${h * .18}px;padding:0 ${h * .2}px">
    <div style="position:relative;color:${INK};font-size:${h * .52}px;letter-spacing:.06em;line-height:1">ANET<div style="position:absolute;left:0;right:0;bottom:-${h * .08}px;height:${h * .07}px;background:${RED};border-radius:${h * .04}px"></div></div>
    <div style="border-left:${h * .02}px solid #ddd;padding-left:${h * .16}px"><div style="color:${INK};font-size:${h * .26}px;letter-spacing:.04em;line-height:1.1">アネット</div>
    <div style="color:${RED};font-size:${h * .14}px;letter-spacing:.14em;margin-top:${h * .06}px">暮らしの百貨 ・ 全国送料無料</div></div></div>`),
  square: (w) => page_(w, w, `<div style="width:${w}px;height:${w}px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#fff">
    <div style="position:relative;color:${INK};font-size:${w * .3}px;letter-spacing:.06em;line-height:1">ANET<div style="position:absolute;left:0;right:0;bottom:-${w * .05}px;height:${w * .045}px;background:${RED};border-radius:${w * .02}px"></div></div>
    <div style="color:${INK};font-size:${w * .11}px;letter-spacing:.1em;margin-top:${w * .12}px">アネット</div><div style="color:${RED};font-size:${w * .055}px;letter-spacing:.2em;margin-top:${w * .03}px">暮らしの百貨</div></div>`),
};
const browser = await chromium.launch();
const jobs = [];
for (const [k, v] of Object.entries({ A, B, C })) {
  jobs.push([`${k}-wide-600x160.png`, 600, 160, v.wide(600, 160)], [`${k}-small-240x60.png`, 240, 60, v.wide(240, 60)], [`${k}-square-400.png`, 400, 400, v.square(400)]);
}
// 一覧（ユーザー確認用）
const sheet = page_(1300, 1400, `<div style="padding:40px;font-weight:400;color:#333"><h1 style="font-size:28px;margin-bottom:8px">楽天店舗 名前・ロゴ 3 案（anet-fashion）</h1><p style="font-size:14px;color:#777;margin-bottom:24px">横長 600×160 ／ 正方 400 ／ 小 240×60。色は楽天赤 #BF0000。</p>
  ${['A', 'B', 'C'].map((k, i) => `<div style="display:flex;gap:24px;align-items:center;margin-bottom:36px;padding:20px;border:1px solid #e5e5e5;border-radius:12px">
    <div style="width:46px;height:46px;border-radius:50%;background:${RED};color:#fff;font-weight:900;font-size:24px;display:flex;align-items:center;justify-content:center">${k}</div>
    <div style="width:600px;height:160px;border:1px solid #eee;overflow:hidden">${[A, B, C][i].wide(600, 160).replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, '')}</div>
    <div style="width:200px;height:200px;border:1px solid #eee;overflow:hidden;transform-origin:top left">${[A, B, C][i].square(200).replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, '')}</div>
    <div style="width:240px;height:60px;border:1px solid #eee;overflow:hidden">${[A, B, C][i].wide(240, 60).replace(/^[\s\S]*<body>|<\/body>[\s\S]*$/g, '')}</div></div>`).join('')}
  <p style="font-size:13px;color:#777">A：アネット（Shopify・アプリと同じ系統）／ B：安いモール アネット（量販・激安を前面に）／ C：ANET 暮らしの百貨（総合店の落ち着き）</p></div>`);
jobs.push(['_sheet.png', 1300, 1400, sheet]);
for (const [name, w, h, html] of jobs) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: resolve(OUT, name), omitBackground: false });
  await page.close();
  console.log('wrote', name);
}
await browser.close();
