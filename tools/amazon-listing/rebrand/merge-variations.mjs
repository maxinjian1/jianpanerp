/** SALONCARE 新リンクの「同じ型番なのに親が分かれている」バリエーションを 1 つの親にまとめる。
 *   node tools/amazon-listing/rebrand/merge-variations.mjs
 * 入力 out/rebrand/saloncare/rows.json（build-saloncare.mjs が作った完全行）。
 * 出力 out/rebrand/saloncare/rows-merge.json（write_xlsm.py --rows で xlsm 化）と merge-plan.csv。
 *
 * 分かれた原因：旧リンクのサイズ属性が空・「Free Size」のまま（サイズは SKU と商品名にだけある）→ 色×サイズが重なったと判定され親を分けていた。
 * ここでは SKU の末尾トークン（S/M/L/XL/2XL…）を優先してサイズを決め直し、
 *   家族キー = 型番（2087black → 2087、B0CSY… → B0CSY）+ 商品タイプ
 * でまとめる。色×サイズが本当に重なる SKU（旧店の -R/-F 重複出品）は動かさず、元の親に残す。
 * 子・既存親は「編集（部分更新）」、新しい親は「完全更新」、空になった親は「[削除]」。
 */
import fs from 'node:fs';
import path from 'node:path';

const D = path.resolve('tools/amazon-listing/out/rebrand/saloncare');
const rows = JSON.parse(fs.readFileSync(path.join(D, 'rows.json'), 'utf8'));
const C = { sku: '2', pt: '3', act: '4', lvl: '5', par: '6', theme: '7', title: '8', color: '86' };
const SIZE_COLS = ['66', '72', '198', '347']; // apparel / shirt / skirt / shapewear の size 値
const SIZE_GROUP = [...range(64, 78), ...range(196, 202), ...range(345, 354)].map(String); // 部分更新ではサイズ属性ごと送る
function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }

const THEMES = { // テンプレートの商品タイプ別 有効値（償却済みを除く）から選ぶ
  both: (pt) => (['NIGHTGOWN_NIGHTSHIRT'].includes(pt) ? 'カラー/サイズ' : 'サイズ/色'),
  color: () => '色', size: () => 'サイズ',
};
const SZ = /^(xxs|xs|s|m|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl|ll|3l|4l)$/i;
const skuSize = (sku) => { const t = sku.replace(/-SC$/, '').split('-').slice(1).find((x) => SZ.test(x)); return t ? t.toUpperCase().replace(/^XXL$/, '2XL').replace(/^XXXL$/, '3XL') : null; };
const model = (sku) => { const p = sku.replace(/^SC-/, '').split('-')[0]; if (/^B0[A-Z0-9]{8}$/.test(p)) return p.slice(0, 5); const m = p.match(/^(\d{3,})([a-z]{3,})$/); return m ? m[1] : p; };

const parents = new Map(rows.filter((r) => r[C.lvl] === '親').map((r) => [r[C.sku], r]));
const kids = rows.filter((r) => r[C.lvl] !== '親');
const fam = new Map();
for (const r of kids) { const k = `${model(r[C.sku])}|${r[C.pt]}`; (fam.get(k) ?? fam.set(k, []).get(k)).push(r); }

const out = [], plan = [['家族', '処理', 'SKU', '旧親', '新親', 'テーマ', 'サイズ旧→新', '色']], dupLog = [];
const parentKeys = new Set(); for (const p of parents.values()) Object.keys(p).forEach((k) => parentKeys.add(k));
let merged = 0, movedKids = 0, deleted = 0, created = 0;

for (const [k, list] of fam) {
  const curParents = new Set(list.map((r) => r[C.par] || null));
  if (list.length < 2 || (curParents.size === 1 && !curParents.has(null))) continue; // もともと 1 親
  // サイズを決め直す
  const items = list.map((r) => { const old = r['66'] || ''; const s = skuSize(r[C.sku]); const size = s && (!old || old === 'Free Size' || old.toUpperCase() !== s) ? s : old || 'Free Size'; return { r, old, size, color: r[C.color] || '' }; });
  // 色×サイズの重複は 2 件目以降を外す
  const seen = new Map(), keep = [];
  for (const it of items) { const key = `${it.color}/${it.size}`; if (seen.has(key)) { dupLog.push([k, it.r[C.sku], seen.get(key)]); continue; } seen.set(key, it.r[C.sku]); keep.push(it); }
  if (keep.length < 2) continue;
  const nC = new Set(keep.map((x) => x.color)).size, nS = new Set(keep.map((x) => x.size)).size;
  const [mdl, pt] = k.split('|');
  const theme = nC > 1 && nS > 1 ? THEMES.both(pt) : nC > 1 ? THEMES.color() : nS > 1 ? THEMES.size() : null;
  if (!theme) continue;
  // 残す親：子が一番多い既存親。無ければ新規作成
  const cnt = {}; keep.forEach((x) => { if (x.r[C.par]) cnt[x.r[C.par]] = (cnt[x.r[C.par]] || 0) + 1; });
  let target = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (target) {
    const p = parents.get(target);
    if (p[C.theme] !== theme) { out.push({ [C.sku]: target, [C.pt]: pt, [C.act]: '編集（部分更新）', [C.lvl]: '親', [C.theme]: theme }); plan.push([k, '親テーマ変更', target, '', target, theme, '', '']); }
  } else {
    target = `SC-${mdl}-${pt}`;
    const base = keep[0].r, p = {};
    for (const key of Object.keys(base)) if (parentKeys.has(key) && !SIZE_GROUP.includes(key)) p[key] = base[key];
    Object.assign(p, { [C.sku]: target, [C.pt]: pt, [C.act]: '作成または置換 (完全更新)', [C.lvl]: '親', [C.theme]: theme, [C.title]: String(base[C.title]).replace(/\s?(XXS|XS|S|M|L|XL|2XL|3XL|フリー)サイズ/g, '').replace(/\s{2,}/g, ' ') });
    delete p[C.par]; delete p[C.color]; delete p['85'];
    out.push(p); created++; plan.push([k, '親新規', target, '', target, theme, '', '']);
  }
  merged++;
  for (const it of keep) {
    const r = it.r; const sizeChanged = it.size !== it.old;
    if (r[C.par] === target && r[C.theme] === theme && !sizeChanged) continue;
    const u = { [C.sku]: r[C.sku], [C.pt]: pt, [C.act]: '編集（部分更新）', [C.lvl]: '子供', [C.par]: target, [C.theme]: theme };
    for (const c of SIZE_GROUP) if (r[c] != null) u[c] = SIZE_COLS.includes(c) && sizeChanged && r[c] === it.old ? it.size : r[c];
    if (sizeChanged) for (const c of ['66', '72', '347']) u[c] = it.size;
    if (!u['64']) Object.assign(u, { '64': 'JP', '65': 'アルファベット' });
    out.push(u); movedKids++;
    plan.push([k, r[C.par] ? '親付け替え' : '単品→子', r[C.sku], r[C.par] || '', target, theme, sizeChanged ? `${it.old || '空'}→${it.size}` : '', it.color]);
  }
  // 空になる親を削除
  const stay = new Set(list.filter((r) => !keep.includes(items.find((x) => x.r === r))).map((r) => r[C.par]));
  for (const p of curParents) if (p && p !== target && !stay.has(p)) { out.push({ [C.sku]: p, [C.pt]: pt, [C.act]: '[削除]' }); deleted++; plan.push([k, '親削除', p, '', '', '', '', '']); }
}

fs.writeFileSync(path.join(D, 'rows-merge.json'), JSON.stringify(out));
const csv = (a) => a.map((r) => r.map((x) => /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x).join(',')).join('\n');
fs.writeFileSync(path.join(D, 'merge-plan.csv'), '﻿' + csv(plan));
fs.writeFileSync(path.join(D, 'merge-dups.csv'), '﻿' + csv([['家族', '外した SKU（色×サイズ重複）', '同じ色×サイズの SKU'], ...dupLog]));
console.log({ families: merged, newParents: created, kidRows: movedKids, deleteParents: deleted, dupsLeft: dupLog.length, rows: out.length });
