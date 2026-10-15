// ANET 店面用バナー生成（HTML → PNG、Chromium）。画像生成モデル不要。
//   node tools/brand-assets/render.mjs   → apps/web-client/public/brand/*.png
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../apps/web-client/public/brand');
mkdirSync(OUT, { recursive: true });

const NAVY = '#0F2A44', ORANGE = '#F28C28', CREAM = '#F7F3EC', INK = '#1A1A1A', SAGE = '#D9E4DD';
const FONT = `"IPAPGothic","IPAGothic","Noto Sans CJK JP",sans-serif`;

const base = (w, h, body, extra = '') => `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0} html,body{width:${w}px;height:${h}px;overflow:hidden}
body{font-family:${FONT};color:${INK};background:${CREAM}}
.wrap{position:relative;width:${w}px;height:${h}px}
.brand{font-weight:700;letter-spacing:.28em;font-size:${Math.round(h * 0.045)}px;color:${NAVY}}
.h1{font-weight:700;line-height:1.15;color:${NAVY}}
.sub{line-height:1.6;color:#3a3a3a}
.badge{display:inline-block;background:${ORANGE};color:#fff;font-weight:700;border-radius:999px;padding:.35em 1.1em}
.pill{display:inline-block;border:2px solid ${NAVY};color:${NAVY};border-radius:999px;padding:.3em .9em;font-weight:700;margin-right:.5em}
.blob{position:absolute;border-radius:50%;filter:blur(2px)}
${extra}</style></head><body><div class="wrap">${body}</div></body></html>`;

// ───────── ヒーロー（PC 1920×800 / スマホ 1080×1350） ─────────
function hero(w, h, mobile) {
  const fs = mobile ? 92 : 104;
  return base(w, h, `
  <div class="blob" style="width:${h * 1.1}px;height:${h * 1.1}px;right:${mobile ? -h * 0.35 : -h * 0.25}px;top:${mobile ? h * 0.42 : -h * 0.3}px;background:${SAGE}"></div>
  <div class="blob" style="width:${h * 0.55}px;height:${h * 0.55}px;right:${mobile ? w * 0.08 : w * 0.22}px;top:${mobile ? h * 0.58 : h * 0.45}px;background:${ORANGE};opacity:.9"></div>
  <div class="blob" style="width:${h * 0.28}px;height:${h * 0.28}px;right:${mobile ? w * 0.55 : w * 0.12}px;top:${mobile ? h * 0.78 : h * 0.12}px;background:${NAVY};opacity:.9"></div>
  <div style="position:absolute;left:${mobile ? 72 : 140}px;top:${mobile ? 120 : 150}px;width:${mobile ? w - 144 : w * 0.55}px">
    <div class="brand">ANET</div>
    <div class="h1" style="font-size:${fs}px;margin-top:28px">暮らしを、<br>ちょっと便利に。</div>
    <div class="sub" style="font-size:${mobile ? 40 : 36}px;margin-top:34px">日用品・健康グッズ・スマホ周辺機器・ペット用品まで<br>毎日使える便利アイテムを、日本国内の倉庫から直送。</div>
    <div style="margin-top:40px;font-size:${mobile ? 34 : 30}px"><span class="badge">国内発送</span>&nbsp;&nbsp;<span class="pill">平日12時までのご注文は当日出荷</span></div>
  </div>`);
}

// ───────── カテゴリータイル（1200×1200） ─────────
const ICONS = {
  daily: `<rect x="20" y="40" width="60" height="50" rx="6" fill="none" stroke="${NAVY}" stroke-width="6"/><path d="M10 40 L50 12 L90 40" fill="none" stroke="${NAVY}" stroke-width="6" stroke-linejoin="round"/><rect x="42" y="62" width="16" height="28" fill="${ORANGE}"/>`,
  health: `<path d="M50 88 C20 66 8 50 12 34 C16 18 38 14 50 30 C62 14 84 18 88 34 C92 50 80 66 50 88Z" fill="none" stroke="${NAVY}" stroke-width="6"/><path d="M26 52 H40 L46 40 L54 64 L60 52 H74" fill="none" stroke="${ORANGE}" stroke-width="6" stroke-linejoin="round"/>`,
  phone: `<rect x="28" y="8" width="44" height="84" rx="8" fill="none" stroke="${NAVY}" stroke-width="6"/><rect x="34" y="18" width="32" height="56" fill="${SAGE}"/><circle cx="50" cy="83" r="3.5" fill="${ORANGE}"/>`,
  furniture: `<rect x="14" y="44" width="72" height="26" rx="8" fill="none" stroke="${NAVY}" stroke-width="6"/><path d="M22 70 V86 M78 70 V86 M26 44 V26 a8 8 0 0 1 8 -8 h32 a8 8 0 0 1 8 8 V44" fill="none" stroke="${NAVY}" stroke-width="6"/><rect x="30" y="50" width="40" height="8" fill="${ORANGE}"/>`,
  camp: `<path d="M50 14 L10 86 H90 Z" fill="none" stroke="${NAVY}" stroke-width="6" stroke-linejoin="round"/><path d="M50 14 L62 86 M50 14 L38 86" stroke="${NAVY}" stroke-width="5"/><circle cx="80" cy="22" r="8" fill="${ORANGE}"/>`,
  pet: `<circle cx="30" cy="34" r="9" fill="${NAVY}"/><circle cx="50" cy="26" r="9" fill="${NAVY}"/><circle cx="70" cy="34" r="9" fill="${NAVY}"/><path d="M50 50 C70 50 84 66 78 80 C72 92 60 84 50 84 C40 84 28 92 22 80 C16 66 30 50 50 50Z" fill="${ORANGE}"/>`,
  baby: `<path d="M40 10 H60 V24 A22 22 0 0 1 72 44 V78 a12 12 0 0 1 -12 12 H40 a12 12 0 0 1 -12 -12 V44 A22 22 0 0 1 40 24 Z" fill="none" stroke="${NAVY}" stroke-width="6" stroke-linejoin="round"/><rect x="36" y="52" width="28" height="10" fill="${ORANGE}"/>`,
  fashion: `<path d="M34 12 L50 22 L66 12 L88 24 L80 42 L68 38 V88 H32 V38 L20 42 L12 24 Z" fill="none" stroke="${NAVY}" stroke-width="6" stroke-linejoin="round"/><circle cx="50" cy="60" r="7" fill="${ORANGE}"/>`,
};
function tile(title, sub, icon, hue) {
  const w = 1200, h = 1200;
  return base(w, h, `
  <div style="position:absolute;inset:0;background:${hue}"></div>
  <div class="blob" style="width:900px;height:900px;left:520px;top:-300px;background:#fff;opacity:.55"></div>
  <div style="position:absolute;left:100px;top:110px;width:1000px">
    <div class="brand" style="font-size:40px">ANET</div>
    <svg viewBox="0 0 100 100" width="360" height="360" style="margin-top:70px;display:block">${icon}</svg>
    <div class="h1" style="font-size:112px;margin-top:70px">${title}</div>
    <div class="sub" style="font-size:44px;margin-top:26px">${sub}</div>
  </div>`);
}

// ───────── ブランド／サービス（1600×900） ─────────
function story() {
  const w = 1600, h = 900;
  return base(w, h, `
  <div style="position:absolute;inset:0;background:${NAVY}"></div>
  <div class="blob" style="width:1100px;height:1100px;left:900px;top:100px;background:#1C3D5E"></div>
  <div class="blob" style="width:260px;height:260px;left:1180px;top:120px;background:${ORANGE}"></div>
  <div style="position:absolute;left:120px;top:150px;width:900px;color:${CREAM}">
    <div class="brand" style="color:${ORANGE}">ABOUT ANET</div>
    <div class="h1" style="color:${CREAM};font-size:84px;margin-top:30px">選ぶ時間を、<br>短く。使う時間を、長く。</div>
    <div class="sub" style="color:${CREAM};opacity:.9;font-size:32px;margin-top:34px">ANETは、暮らしの「あったら便利」を国内倉庫から直送する<br>日本のセレクトストアです。</div>
  </div>`);
}

const jobs = [
  ['hero-desktop.png', 1920, 800, hero(1920, 800, false)],
  ['hero-mobile.png', 1080, 1350, hero(1080, 1350, true)],
  ['story.png', 1600, 900, story()],
  ['cat-daily.png', 1200, 1200, tile('日用品雑貨', '毎日のちょっとした不便を、スッと解決。', ICONS.daily, '#EEF3F7')],
  ['cat-health.png', 1200, 1200, tile('健康・ダイエット', 'おうち時間で、からだを整える。', ICONS.health, '#FDF0E6')],
  ['cat-phone.png', 1200, 1200, tile('スマホ・PC周辺機器', 'つなぐ・充電する・映す。手軽に。', ICONS.phone, '#EAF1EE')],
  ['cat-furniture.png', 1200, 1200, tile('家具・インテリア', '収納も、くつろぎも、ひと工夫。', ICONS.furniture, '#F3EFE6')],
  ['cat-camp.png', 1200, 1200, tile('旅行・キャンプ', '外へ出る日が、もっと楽しみに。', ICONS.camp, '#E9F1F4')],
  ['cat-pet.png', 1200, 1200, tile('ペット用品', '大切な家族に、やさしい毎日を。', ICONS.pet, '#FBEFE9')],
  ['cat-baby.png', 1200, 1200, tile('ベビー・マタニティ', '育児の「あったら助かる」を。', ICONS.baby, '#F1EEF6')],
  ['cat-fashion.png', 1200, 1200, tile('衣類・アクセサリー', '気分を上げる、日常の小物。', ICONS.fashion, '#F6F1E8')],
];

const browser = await chromium.launch();
for (const [name, w, h, html] of jobs) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: `${OUT}/${name}`, type: 'png' });
  await page.close();
  console.log('wrote', name);
}
await browser.close();
