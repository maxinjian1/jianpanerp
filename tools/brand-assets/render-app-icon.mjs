// 「安い」アプリのアイコン/スプラッシュ生成（HTML → PNG、Chromium）。
//   node tools/brand-assets/render-app-icon.mjs   → apps/mobile-yasui/assets/*.png
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../apps/mobile-yasui/assets');
mkdirSync(OUT, { recursive: true });
const RED = '#BF0000', FONT = `"IPAPGothic","IPAGothic","Noto Sans CJK JP",sans-serif`;
const page_ = (w, h, body) => `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:${w}px;height:${h}px;overflow:hidden}body{font-family:${FONT}}</style></head><body>${body}</body></html>`;
// 1024 正方形图标：红底、白字「安い」、右下角小字 ANET
const icon = (w, round) => page_(w, w, `<div style="width:${w}px;height:${w}px;background:${RED};${round ? `border-radius:${w * 0.22}px;` : ''}position:relative;display:flex;align-items:center;justify-content:center">
  <div style="color:#fff;font-weight:700;font-size:${w * 0.46}px;letter-spacing:-.04em;line-height:1;margin-top:-${w * 0.03}px">安い</div>
  <div style="position:absolute;right:${w * 0.1}px;bottom:${w * 0.09}px;color:#fff;opacity:.9;font-weight:700;letter-spacing:.3em;font-size:${w * 0.075}px">ANET</div></div>`);
// adaptive-icon 前景：安全区在中央 66%，所以字缩小、无背景（背景色在 app.json 指定）
const adaptive = (w) => page_(w, w, `<div style="width:${w}px;height:${w}px;background:${RED};display:flex;align-items:center;justify-content:center"><div style="color:#fff;font-weight:700;font-size:${w * 0.34}px;letter-spacing:-.04em">安い</div></div>`);
const splash = (w, h) => page_(w, h, `<div style="width:${w}px;height:${h}px;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${h * 0.02}px">
  <div style="width:${w * 0.3}px;height:${w * 0.3}px;border-radius:${w * 0.066}px;background:${RED};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${w * 0.14}px">安い</div>
  <div style="color:#333;font-size:${w * 0.045}px;letter-spacing:.1em;margin-top:${h * 0.01}px">日本一の安さを、目指して。</div>
  <div style="color:#999;font-size:${w * 0.03}px;letter-spacing:.3em">ANET</div></div>`);
const browser = await chromium.launch();
const shots = [['icon.png', 1024, 1024, icon(1024, false)], ['adaptive-icon.png', 1024, 1024, adaptive(1024)], ['splash-icon.png', 1024, 1024, icon(1024, true)], ['splash.png', 1284, 2778, splash(1284, 2778)], ['store-icon-512.png', 512, 512, icon(512, false)], ['feature-graphic.png', 1024, 500, page_(1024, 500, `<div style="width:1024px;height:500px;background:${RED};display:flex;align-items:center;justify-content:center;gap:60px;color:#fff"><div style="font-weight:700;font-size:220px;letter-spacing:-.04em">安い</div><div><div style="font-size:44px;font-weight:700;letter-spacing:.06em">日本一の安さを、目指して。</div><div style="font-size:30px;opacity:.9;margin-top:18px">全国送料無料 ・ 表示価格は税込 ・ 国内倉庫から直送</div></div></div>`)]];
for (const [name, w, h, html] of shots) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: resolve(OUT, name), omitBackground: false });
  await page.close();
  console.log('wrote', name);
}
await browser.close();
