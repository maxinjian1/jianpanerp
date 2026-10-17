// SARADEMUNT（レディースインナー）用サブ画像 4 枚レンダラー：HTML → PNG（Chromium）。人物は描かない。メイン画像は作らない。
//   node tools/amazon-listing/optimize/lingerie-cards.mjs --targets tools/amazon-listing/out/opt/targets.json --out tools/amazon-listing/out/opt [--limit N] [--asin B0XXXX] [--force]
//   入力：<out>/<asin>/listing.json（image_brief）、<out>/<asin>/images/*.jpg（自社ページの既存画像。02 以降の商品本体写真を素材に使う）
//   出力：<out>/<asin>/cards/{05-size,06-material,07-privacy,08-why}.png（1600×1600）
//   スタイル L：生成り×モーヴ、見出し Shippori Mincho、本文 Noto Sans JP。上品・清潔・安心。
const { chromium } = await import('playwright').catch(() => import('/opt/node22/lib/node_modules/playwright/index.mjs'));
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const OUT = resolve(args.out); const SIZE = Number(args.size ?? 1600);
let targets = JSON.parse(readFileSync(resolve(args.targets), 'utf8')); if (args.asin) targets = targets.filter((t) => t.asin === args.asin); if (args.limit) targets = targets.slice(0, Number(args.limit));

function fontCss(pkg) {
  const cands = [resolve('node_modules/@fontsource', pkg), process.env.FONT_DIR && resolve(process.env.FONT_DIR, pkg), process.env.FONT_DIR && resolve(process.env.FONT_DIR, `fontsource-${pkg}-5.3.1/package`), process.env.FONT_DIR && resolve(process.env.FONT_DIR, `fontsource-${pkg}-5.3.0/package`)].filter(Boolean);
  for (const c of cands) if (existsSync(resolve(c, 'index.css'))) return ['400', '500', '700', '900'].filter((w) => existsSync(resolve(c, `${w}.css`))).map((w) => `<link rel="stylesheet" href="${pathToFileURL(resolve(c, `${w}.css`)).href}">`).join('');
  console.warn(`font package not found: ${pkg}`); return '';
}
const FONT_LINKS = fontCss('noto-sans-jp') + fontCss('shippori-mincho');
const T = { bg: '#F6F1EA', panel: '#FFFFFF', ink: '#3A3230', sub: '#7A6E6A', accent: '#8E5A6B', accent2: '#C9A27E', line: '#E6DCD2' };
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const page = (body, extra = '') => `<!doctype html><html lang="ja"><head><meta charset="utf-8">${FONT_LINKS}<style>
*{box-sizing:border-box;margin:0;padding:0} html,body{width:${SIZE}px;height:${SIZE}px;overflow:hidden}
body{font-family:"Noto Sans JP",sans-serif;color:${T.ink};background:${T.bg};font-feature-settings:"palt";letter-spacing:.03em}
.wrap{position:relative;width:${SIZE}px;height:${SIZE}px;padding:${SIZE * 0.06}px}
h1{font-family:"Shippori Mincho","Noto Sans JP",serif;font-weight:700;font-size:${SIZE * 0.055}px;line-height:1.3;letter-spacing:.06em;color:${T.ink}}
.eyebrow{font-size:${SIZE * 0.02}px;letter-spacing:.35em;color:${T.accent};font-weight:700;margin-bottom:${SIZE * 0.012}px}
.rule{width:${SIZE * 0.06}px;height:3px;background:${T.accent2};margin:${SIZE * 0.025}px 0 ${SIZE * 0.035}px}
.panel{background:${T.panel};border-radius:${SIZE * 0.02}px;box-shadow:0 20px 50px rgba(58,50,48,.08)}
.pt{display:flex;gap:${SIZE * 0.022}px;align-items:flex-start;margin-bottom:${SIZE * 0.03}px}
.pt .n{flex:none;width:${SIZE * 0.05}px;height:${SIZE * 0.05}px;border-radius:50%;background:${T.accent};color:#fff;display:flex;align-items:center;justify-content:center;font-family:"Shippori Mincho",serif;font-size:${SIZE * 0.024}px;font-weight:700}
.pt .t{font-size:${SIZE * 0.03}px;font-weight:700;line-height:1.35}
.pt .d{font-size:${SIZE * 0.021}px;color:${T.sub};line-height:1.6;margin-top:.25em}
.brand{position:absolute;left:0;right:0;bottom:${SIZE * 0.035}px;text-align:center;font-family:"Shippori Mincho",serif;font-size:${SIZE * 0.02}px;letter-spacing:.45em;color:${T.accent}}
.note{font-size:${SIZE * 0.017}px;color:${T.sub};line-height:1.6}
table{border-collapse:collapse;width:100%} th,td{padding:${SIZE * 0.014}px ${SIZE * 0.01}px;text-align:center;font-size:${SIZE * 0.024}px;border-bottom:1px solid ${T.line}} th{background:${T.bg};color:${T.accent};font-weight:700;font-size:${SIZE * 0.02}px;letter-spacing:.1em}
${extra}</style></head><body><div class="wrap">${body}<div class="brand">SARADEMUNT</div></div></body></html>`;

const photo = (dir, prefer) => { // 商品本体写真：02 以降から選ぶ（01 はメイン=モデル着用の可能性が高いので使わない）
  if (!existsSync(dir)) return null; const fs = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort(); const pick = fs[prefer] ?? fs[1] ?? fs[0]; return pick ? pathToFileURL(resolve(dir, pick)).href : null; };
const points = (arr, max = 4) => (arr ?? []).slice(0, max).map((p, i) => `<div class="pt"><div class="n">${i + 1}</div><div><div class="t">${esc(p.t)}</div><div class="d">${esc(p.d)}</div></div></div>`).join('');
const photoBox = (src, w, h) => src ? `<div class="panel" style="width:${w}px;height:${h}px;overflow:hidden;display:flex;align-items:center;justify-content:center;background:#fff"><img src="${src}" style="width:100%;height:100%;object-fit:cover"></div>` : `<div class="panel" style="width:${w}px;height:${h}px;background:${T.line}"></div>`;

function cards(asin, L, imgDir) {
  const b = L.image_brief ?? {}; const W = SIZE * 0.88; const half = (W - SIZE * 0.04) / 2; const H = SIZE * 0.62;
  const out = {};
  const sz = b.size ?? {}; const rows = Array.isArray(sz.rows) && sz.rows.length > 1 ? sz.rows : null;
  out['05-size'] = page(`<div class="eyebrow">SIZE GUIDE</div><h1>${esc(sz.headline || 'サイズの選び方')}</h1><div class="rule"></div>
    <div style="display:flex;gap:${SIZE * 0.04}px"><div class="panel" style="flex:1;padding:${SIZE * 0.035}px">${rows ? `<table><thead><tr>${rows[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1, 9).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>` : `<div class="note" style="font-size:${SIZE * 0.026}px">サイズ表は商品説明欄をご確認ください。</div>`}<div class="note" style="margin-top:${SIZE * 0.03}px">${esc(sz.note || '※平置き実寸のため、多少の誤差がある場合があります。迷ったときは大きめのサイズをおすすめします。')}</div></div>${photoBox(photo(imgDir, 2), half * 0.8, H)}</div>`);
  const m = b.material ?? {};
  out['06-material'] = page(`<div class="eyebrow">MATERIAL &amp; COMFORT</div><h1>${esc(m.headline || '肌にやさしい、やわらか素材')}</h1><div class="rule"></div>
    <div style="display:flex;gap:${SIZE * 0.04}px;align-items:stretch">${photoBox(photo(imgDir, 1), half, H)}<div class="panel" style="flex:1;padding:${SIZE * 0.04}px ${SIZE * 0.035}px">${points(m.points)}</div></div>`);
  const p = b.privacy ?? {};
  out['07-privacy'] = page(`<div class="eyebrow">PRIVACY &amp; DELIVERY</div><h1>${esc(p.headline || '中身がわからない梱包で、安心。')}</h1><div class="rule"></div>
    <div style="display:flex;gap:${SIZE * 0.04}px;align-items:stretch"><div class="panel" style="flex:1;padding:${SIZE * 0.04}px ${SIZE * 0.035}px">${points(p.points?.length ? p.points : [{ t: '無地の梱包でお届け', d: '外から商品名や中身がわかりません' }, { t: '国内倉庫から発送', d: '配送状況はご注文履歴から確認できます' }, { t: 'サイズ交換のご相談', d: '未使用・タグ付きの場合はご相談ください' }])}</div>
    <div class="panel" style="width:${half}px;height:${H}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${SIZE * 0.03}px;background:#fff"><div style="width:${SIZE * 0.26}px;height:${SIZE * 0.18}px;border:4px solid ${T.accent2};border-radius:${SIZE * 0.01}px;position:relative;background:${T.bg}"><div style="position:absolute;left:50%;top:0;bottom:0;width:4px;background:${T.accent2};transform:translateX(-50%)"></div><div style="position:absolute;left:0;right:0;top:${SIZE * 0.055}px;height:${SIZE * 0.018}px;background:${T.accent2};opacity:.35"></div></div><div style="font-family:'Shippori Mincho',serif;font-size:${SIZE * 0.026}px;letter-spacing:.2em;color:${T.accent}">無地ダンボール・無記名</div></div></div>`);
  const w = b.why ?? {};
  out['08-why'] = page(`<div class="eyebrow">WHY SARADEMUNT</div><h1>${esc(w.headline || '選ばれている理由')}</h1><div class="rule"></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:${SIZE * 0.03}px">${(w.points?.length ? w.points : [{ t: '毎日の快適さを優先', d: '締めつけにくく、長時間でもラクな設計' }, { t: '豊富なサイズ展開', d: '体型に合わせて選べるサイズ・カラー' }, { t: 'プライバシー梱包', d: '中身がわからない無地の梱包' }, { t: '国内発送・丁寧な対応', d: 'ご不明点はメッセージでお気軽に' }]).slice(0, 4).map((x, i) => `<div class="panel" style="padding:${SIZE * 0.035}px;min-height:${SIZE * 0.26}px"><div style="font-family:'Shippori Mincho',serif;font-size:${SIZE * 0.05}px;color:${T.accent2};line-height:1">0${i + 1}</div><div class="t" style="font-size:${SIZE * 0.03}px;font-weight:700;margin:${SIZE * 0.012}px 0">${esc(x.t)}</div><div class="d" style="font-size:${SIZE * 0.021}px;color:${T.sub};line-height:1.6">${esc(x.d)}</div></div>`).join('')}</div>`);
  return out;
}

const browser = await chromium.launch(); let n = 0;
for (const t of targets) {
  const d = resolve(OUT, t.asin); const lf = resolve(d, 'listing.json'); if (!existsSync(lf)) continue;
  const cdir = resolve(d, 'cards'); if (existsSync(resolve(cdir, '08-why.png')) && !args.force) continue; mkdirSync(cdir, { recursive: true });
  const L = JSON.parse(readFileSync(lf, 'utf8'));
  for (const [name, html] of Object.entries(cards(t.asin, L, resolve(d, 'images')))) {
    const f = resolve(cdir, `${name}.html`); writeFileSync(f, html);
    const p = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
    await p.goto(pathToFileURL(f).href, { waitUntil: 'networkidle' }); await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: resolve(cdir, `${name}.png`), type: 'png' }); await p.close();
  }
  n++; console.log('cards', t.asin);
}
await browser.close(); console.log('rendered', n, 'ASIN');
