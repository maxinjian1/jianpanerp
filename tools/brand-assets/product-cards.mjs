// 商品画像セット（8 枚）レンダラー：AI は画像、文字はコード。HTML → PNG（Chromium）。
//   node tools/brand-assets/product-cards.mjs --spec tools/brand-assets/samples/shoe-rack/spec.json --style A --out tools/brand-assets/samples/shoe-rack/out-A
//   --style A = 生活雑貨風（米白・角丸・オレンジ） / B = 量販専門店風（白・赤・硬質）
// フォント：node_modules/@fontsource/{noto-sans-jp,zen-kaku-gothic-new,shippori-mincho}（npm i -D @fontsource/noto-sans-jp @fontsource/zen-kaku-gothic-new @fontsource/shippori-mincho）
//           無ければ FONT_DIR 環境変数でディレクトリ指定（中に各パッケージの package/ がある構成でも可）
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const specPath = resolve(args.spec); const spec = JSON.parse(readFileSync(specPath, 'utf8'));
const base = dirname(specPath); const STYLE = (args.style ?? 'MIX').toUpperCase(); const OUT = resolve(args.out ?? `${base}/out-${STYLE}`); mkdirSync(OUT, { recursive: true });
const SIZE = Number(args.size ?? 1600);

// ---- フォント CSS を探す ----
function fontCss(pkg) {
  const cands = [resolve('node_modules/@fontsource', pkg), process.env.FONT_DIR && resolve(process.env.FONT_DIR, pkg), process.env.FONT_DIR && resolve(process.env.FONT_DIR, `fontsource-${pkg}-5.3.1/package`), process.env.FONT_DIR && resolve(process.env.FONT_DIR, `fontsource-${pkg}-5.3.0/package`)].filter(Boolean);
  for (const c of cands) { if (existsSync(resolve(c, 'index.css'))) return ['400', '500', '700', '900'].filter((w) => existsSync(resolve(c, `${w}.css`))).map((w) => `<link rel="stylesheet" href="${pathToFileURL(resolve(c, `${w}.css`)).href}">`).join(''); }
  console.warn(`font package not found: ${pkg} (fallback to system font)`); return '';
}
const FONT_LINKS = fontCss('noto-sans-jp') + fontCss('zen-kaku-gothic-new') + fontCss('shippori-mincho');
const img = (p) => pathToFileURL(resolve(base, p)).href;

// ---- スタイル定義 ----
const THEMES = {
  B: { name: 'B 量販専門店風', bg: '#FFFFFF', panel: '#F4F4F4', ink: '#111111', sub: '#555555', accent: '#BF0000', accent2: '#111111', radius: 4, font: `"Noto Sans JP","IPAPGothic",sans-serif`, head: `"Noto Sans JP","IPAPGothic",sans-serif`, headWeight: 900, rule: 6, shadow: 'none', chip: 'square' },
  A: { name: 'A 生活雑貨風', bg: '#F7F3EC', panel: '#FFFFFF', ink: '#2B2B2B', sub: '#6B6B6B', accent: '#F28C28', accent2: '#0F2A44', radius: 28, font: `"Noto Sans JP","IPAPGothic",sans-serif`, head: `"Zen Kaku Gothic New","Noto Sans JP",sans-serif`, headWeight: 700, rule: 3, shadow: '0 18px 40px rgba(43,43,43,.10)', chip: 'round' },
};
// MIX：主画像・特長・寸法・ディテール・カラー・安心 = B（量販店風）、シーン = A（生活雑貨風）
const themeFor = (shot) => STYLE === 'MIX' ? (shot === '04-scene' ? THEMES.A : THEMES.B) : (THEMES[STYLE] ?? THEMES.B);
let T = themeFor('01-main-amazon');

const page = (body, extra = '') => `<!doctype html><html lang="ja"><head><meta charset="utf-8">${FONT_LINKS}<style>
*{box-sizing:border-box;margin:0;padding:0} html,body{width:${SIZE}px;height:${SIZE}px;overflow:hidden}
body{font-family:${T.font};color:${T.ink};background:${T.bg};font-feature-settings:"palt";letter-spacing:.02em}
.wrap{position:relative;width:${SIZE}px;height:${SIZE}px}
h1,h2,.h{font-family:${T.head};font-weight:${T.headWeight};line-height:1.25;letter-spacing:.03em}
.accent{color:${T.accent}} .panel{background:${T.panel};border-radius:${T.radius}px;box-shadow:${T.shadow}}
.chip{display:inline-block;background:${T.accent};color:#fff;font-weight:700;padding:.3em 1em;border-radius:${T.chip === 'round' ? 999 : 4}px}
.chip.o{background:transparent;color:${T.accent};border:3px solid ${T.accent}}
.rule{height:${T.rule}px;background:${T.accent};width:120px}
.num{font-family:${T.head};font-weight:900;color:${T.accent}}
.small{font-size:26px;color:${T.sub};line-height:1.7}
${extra}</style></head><body><div class="wrap">${body}</div></body></html>`;

const cutout = spec.cutout && existsSync(resolve(base, spec.cutout)) ? img(spec.cutout) : null;
// PNG IHDR から実寸を読む（寸法線を商品の実際の描画範囲に合わせるため）
function pngSize(p) { const b = readFileSync(p); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }
const cut = cutout ? pngSize(resolve(base, spec.cutout)) : { w: 1, h: 1 };
/** 枠 (bw×bh) に contain で収めたときの実描画サイズ */
const fit = (bw, bh) => { const r = Math.min(bw / cut.w, bh / cut.h); return { w: cut.w * r, h: cut.h * r }; };
const productImg = (w, h = w, extraStyle = '') => cutout
  ? `<img src="${cutout}" style="width:${w}px;height:${h}px;object-fit:contain;${extraStyle}">`
  : `<div style="width:${w}px;height:${h}px;border-radius:24px;background:repeating-linear-gradient(45deg,#ddd 0 20px,#eee 20px 40px);display:flex;align-items:center;justify-content:center;color:#888;font-size:40px;${extraStyle}">商品切り抜き（準備中）</div>`;

// ---- 8 枚のテンプレート ----
const shots = {}; const useTheme = (shot) => { T = themeFor(shot); };
// 1. Amazon 主画像：純白・文字なし・商品 85%
useTheme('01-main-amazon'); shots['01-main-amazon'] = page(`<div style="width:${SIZE}px;height:${SIZE}px;background:#fff;display:flex;align-items:center;justify-content:center">${productImg(Math.round(SIZE * 0.86), Math.round(SIZE * 0.86))}</div>`, 'body{background:#fff}');
// 2. 楽天主画像：文字面積 20% 未満（下帯 14%）・枠線なし
useTheme('02-main-rakuten'); shots['02-main-rakuten'] = page(`
  <div style="position:absolute;inset:0;display:flex;align-items:flex-start;justify-content:center;padding-top:${SIZE * 0.05}px">${productImg(Math.round(SIZE * 0.9), Math.round(SIZE * 0.76))}</div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:${SIZE * 0.14}px;padding:0 ${SIZE * 0.05}px;display:flex;align-items:center;justify-content:space-between;background:${STYLE === 'B' ? '#fff' : 'transparent'}">
    <div><div class="h" style="font-size:56px">${spec.shortTitle}</div><div class="small" style="font-size:30px;margin-top:6px">${spec.catch}</div></div>
    <div style="text-align:right"><div class="num" style="font-size:72px;line-height:1">${spec.price}</div><div class="small" style="font-size:24px">税込・送料無料</div></div>
  </div>`);
// 3. 特長 4 点
useTheme('03-features'); shots['03-features'] = page(`
  <div style="padding:${SIZE * 0.06}px ${SIZE * 0.06}px 0">
    <div class="chip" style="font-size:30px">${spec.badge ?? 'POINT'}</div>
    <h1 style="font-size:70px;margin-top:22px">${spec.headline}</h1>
    <div class="rule" style="margin-top:22px"></div>
  </div>
  <div style="position:absolute;left:${SIZE * 0.06}px;top:${SIZE * 0.34}px;width:${SIZE * 0.4}px;height:${SIZE * 0.6}px;display:flex;align-items:center;justify-content:center">${productImg(Math.round(SIZE * 0.4), Math.round(SIZE * 0.6))}</div>
  <div style="position:absolute;right:${SIZE * 0.06}px;top:${SIZE * 0.32}px;width:${SIZE * 0.46}px;display:grid;gap:22px">
    ${spec.features.map((f, i) => `<div class="panel" style="padding:30px 34px;display:flex;gap:26px;align-items:center"><div class="num" style="font-size:64px;min-width:70px;line-height:1">${String(i + 1).padStart(2, '0')}</div><div><div class="h" style="font-size:38px">${f.t}</div><div class="small" style="font-size:25px;margin-top:4px">${f.d}</div></div></div>`).join('')}
  </div>`);
// 4. シーン（原図 + キャプション）
useTheme('04-scene'); shots['04-scene'] = page(`
  <img src="${img(spec.scene)}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:${spec.scenePos ?? '50% 50%'};transform:scale(${spec.sceneZoom ?? 1.2});transform-origin:50% 100%">
  <div style="position:absolute;left:0;right:0;bottom:0;padding:${SIZE * 0.05}px;background:linear-gradient(transparent,rgba(${STYLE === 'B' ? '0,0,0,.72' : '43,43,43,.66'}))">
    <div class="chip" style="font-size:28px">${spec.sceneTag}</div>
    <div class="h" style="font-size:66px;color:#fff;margin-top:18px;text-shadow:0 2px 12px rgba(0,0,0,.3)">${spec.sceneCopy}</div>
    <div style="font-size:28px;color:#fff;opacity:.9;margin-top:10px">${spec.sceneSub}</div>
  </div>`);
// 5. 寸法図（寸法線は商品の実描画範囲に自動で合わせる）
const d = spec.dimensions;
{ useTheme('05-dimensions');
  const boxW = SIZE * 0.56, boxH = SIZE * 0.56, boxL = SIZE * 0.22, boxT = SIZE * 0.26;
  const f = fit(boxW, boxH); const L = boxL + (boxW - f.w) / 2, Tt = boxT + (boxH - f.h) / 2, R = L + f.w, B = Tt + f.h;
  const gap = 28, tick = 28, lw = 3;
  shots['05-dimensions'] = page(`
  <div style="padding:${SIZE * 0.06}px"><div class="chip o" style="font-size:30px">SIZE</div><h1 style="font-size:64px;margin-top:20px">${d.title}</h1></div>
  <div style="position:absolute;left:${boxL}px;top:${boxT}px;width:${boxW}px;height:${boxH}px;display:flex;align-items:center;justify-content:center">${productImg(Math.round(boxW), Math.round(boxH))}</div>
  <div style="position:absolute;left:${L}px;width:${f.w}px;top:${B + gap}px;height:${lw}px;background:${T.ink}"></div>
  <div style="position:absolute;left:${L}px;top:${B + gap - tick / 2}px;width:${lw}px;height:${tick}px;background:${T.ink}"></div><div style="position:absolute;left:${R - lw}px;top:${B + gap - tick / 2}px;width:${lw}px;height:${tick}px;background:${T.ink}"></div>
  <div style="position:absolute;left:${L - 200}px;width:${f.w + 400}px;top:${B + gap + 24}px;text-align:center;font-size:40px;font-weight:700">幅 <span class="num" style="font-size:56px">${d.w}</span></div>
  <div style="position:absolute;left:${L - gap}px;top:${Tt}px;height:${f.h}px;width:${lw}px;background:${T.ink}"></div>
  <div style="position:absolute;left:${L - gap - tick / 2}px;top:${Tt}px;width:${tick}px;height:${lw}px;background:${T.ink}"></div><div style="position:absolute;left:${L - gap - tick / 2}px;top:${B - lw}px;width:${tick}px;height:${lw}px;background:${T.ink}"></div>
  <div style="position:absolute;right:${SIZE - L + gap + 30}px;top:${(Tt + B) / 2}px;transform:translateY(-50%);text-align:right;font-size:36px;font-weight:700;line-height:1.3">高さ<br><span class="num" style="font-size:52px">${d.h}</span></div>
  <div style="position:absolute;left:${R + gap + 30}px;top:${(Tt + B) / 2}px;transform:translateY(-50%);font-size:36px;font-weight:700;line-height:1.3">奥行<br><span class="num" style="font-size:52px">${d.d}</span></div>
  <div style="position:absolute;left:0;right:0;bottom:${SIZE * 0.04}px;text-align:center" class="small">${d.note}</div>`);
}
// 6. ディテール 2×2
useTheme('06-details'); shots['06-details'] = page(`
  <div style="padding:${SIZE * 0.05}px ${SIZE * 0.05}px 0;display:flex;align-items:center;gap:26px"><div class="rule" style="width:16px;height:60px"></div><h1 style="font-size:60px">${spec.detailsTitle}</h1></div>
  <div style="position:absolute;left:${SIZE * 0.05}px;right:${SIZE * 0.05}px;top:${SIZE * 0.17}px;bottom:${SIZE * 0.05}px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:26px">
    ${spec.details.map((x) => `<div class="panel" style="overflow:hidden;position:relative;border-radius:${T.radius}px"><img src="${img(x.img)}" style="width:100%;height:100%;object-fit:cover;object-position:${x.pos ?? '50% 50%'};transform:scale(${x.zoom ?? 1.15})"><div style="position:absolute;left:0;right:0;bottom:0;padding:18px 24px;background:rgba(255,255,255,.92);display:flex;align-items:center;gap:14px"><span class="chip" style="font-size:22px;padding:.2em .7em">${x.tag}</span><span style="font-size:28px;font-weight:700">${x.cap}</span></div></div>`).join('')}
  </div>`);
// 7. カラー / セット内容
useTheme('07-variants'); shots['07-variants'] = page(`
  <div style="padding:${SIZE * 0.06}px"><div class="chip o" style="font-size:30px">COLOR / SET</div><h1 style="font-size:64px;margin-top:20px">${spec.variantsTitle}</h1></div>
  <div style="position:absolute;left:${SIZE * 0.06}px;top:${SIZE * 0.28}px;width:${SIZE * 0.46}px;height:${SIZE * 0.5}px;display:flex;align-items:center;justify-content:center">${productImg(Math.round(SIZE * 0.46), Math.round(SIZE * 0.5))}</div>
  <div style="position:absolute;right:${SIZE * 0.06}px;top:${SIZE * 0.3}px;width:${SIZE * 0.38}px;display:grid;gap:20px">
    ${spec.colors.map((c) => `<div class="panel" style="padding:24px 28px;display:flex;align-items:center;gap:22px"><div style="width:64px;height:64px;border-radius:${T.chip === 'round' ? 999 : 6}px;background:${c.hex};border:3px solid #fff;box-shadow:0 0 0 2px #ddd"></div><div class="h" style="font-size:40px">${c.name}</div></div>`).join('')}
    <div class="panel" style="padding:24px 28px;margin-top:10px"><div class="small" style="font-size:24px;font-weight:700;color:${T.ink}">セット内容</div>${spec.setContents.map((s) => `<div style="font-size:30px;margin-top:8px">・${s}</div>`).join('')}</div>
  </div>
  <div style="position:absolute;left:${SIZE * 0.06}px;right:${SIZE * 0.06}px;bottom:${SIZE * 0.05}px" class="small">${spec.variantsNote ?? ''}</div>`);
// 8. 安心（Amazon 用は送料無料を外す：--amazon 1）
const trust = (args.amazon ? spec.trust.filter((t) => !/送料/.test(t.t)) : spec.trust);
useTheme('08-trust'); shots['08-trust'] = page(`
  <div style="padding:${SIZE * 0.07}px ${SIZE * 0.06}px 0;text-align:center"><h1 style="font-size:68px">${spec.trustTitle}</h1><div class="rule" style="margin:24px auto 0"></div></div>
  <div style="position:absolute;left:${SIZE * 0.08}px;right:${SIZE * 0.08}px;top:${SIZE * 0.27}px;bottom:${SIZE * 0.15}px;display:grid;grid-template-columns:1fr 1fr;gap:30px">
    ${trust.map((t) => `<div class="panel" style="padding:44px 36px;text-align:center;display:flex;flex-direction:column;justify-content:center"><div class="num" style="font-size:84px;line-height:1">${t.icon}</div><div class="h" style="font-size:40px;margin-top:18px">${t.t}</div><div class="small" style="font-size:25px;margin-top:8px">${t.d}</div></div>`).join('')}
  </div>
  <div style="position:absolute;left:0;right:0;bottom:${SIZE * 0.05}px;text-align:center;font-size:30px;letter-spacing:.3em;font-weight:700;color:${T.accent2}">アネット株式会社</div>`);

const browser = await chromium.launch();
for (const [name, html] of Object.entries(shots)) {
  const f = resolve(OUT, `${name}.html`); writeFileSync(f, html);
  const p = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await p.goto(pathToFileURL(f).href, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: resolve(OUT, `${name}.png`), type: 'png' });
  await p.close(); console.log('wrote', `${name}.png`);
}
await browser.close();
console.log(`style ${STYLE} → ${OUT}`);
