#!/usr/bin/env node
/**
 * 220826T サテンスリップ（SALONCARE 版）の画像を「丈×色」どおりに直す（2026-11-20）。
 *   node tools/amazon-listing/rebrand/imgfix-220826.mjs → out/rebrand/saloncare/rows-imgfix-220826.json と imgfix-220826-plan.csv
 *
 * 背景：SARADEMUNT 旧リンクの多くの子 ASIN がシャンパン（ベージュ）の画像 41tVNMO+CEL を主画像にしていた
 *       （例：ロング ブラック M なのにベージュ）。SC 版もそれを継承。
 * 画像の出所：旧 SARADEMUNT 親（まだ販売中の子）の各バリエーションの自前画像（2026-11-20 に商品ページから取得）。
 *   short=ミニ丈 / half=ひざ丈 / long=マキシ丈。同じ丈×色の実写真が無いもの（ブルー・グリーン全部、ロングのピンク/ホワイト/シャンパン、セミ）は触らない。
 * 「商品情報 ブランドネーム：SARADEMUNT」カードと 404 の画像は除外し、空いた枠は家族共通の画像（サイズ表・カラー一覧）で埋める
 *   （部分更新で空欄にしても Amazon 上の旧画像は消えないため）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const R = path.join(ROOT, 'tools/amazon-listing/out/rebrand/saloncare');
const rows = JSON.parse(fs.readFileSync(path.join(R, 'rows.json'), 'utf8'));

const SETS = {
  'half-champagne': '41tVNMO+CEL 41AlLTfQLtL 41yzAc2xbYL 51w238rZDhL 41oJFE4sQxL 41kxT2akK2L 519Q6cx2EuL 518O-2aVqfL',
  'half-purple': '41IjSPcakmL 41r-j1r0puL 51jW-30mSrL 51hc2TFxecL 51ycQbwmk4L 41XtiSFS02L 41jVH752H4L 51NjY2AIpyL 41ihhGyZ4zL',
  'half-black': '41UELCOXQzL 412GzGQ696L 51fChu+L4lL 51oQPz-hhXL 51ycQbwmk4L 41XtiSFS02L 41jVH752H4L 51NjY2AIpyL 41ihhGyZ4zL',
  'half-pink': '41cTBNTh2JL 41pNGRrBIzL 51aemqWx3lL 418K3X1ec2L 51ycQbwmk4L 41XtiSFS02L 41jVH752H4L 51NjY2AIpyL 41ihhGyZ4zL',
  'half-white': '41x3pxp3tRL 41qkSGrz7TL 51fsK2iyQHL 51JM4kOZ3zL 51ycQbwmk4L 41XtiSFS02L 41jVH752H4L 51NjY2AIpyL 41ihhGyZ4zL',
  'long-black': '41yJmVLKxWL 4158ik4+12L 41oZUix5zML 41yzdXm6CxL 51ycQbwmk4L 41RMvTRgi6L 41aQSj2wcBL 51GiNxBh9SL 419ZPHPzo7L',
  'long-purple': '41pANMJSBfL 41a-r6SZRJL 519XSSryqhL 41CgSfhMy9L 51ycQbwmk4L 41RMvTRgi6L 41aQSj2wcBL 51GiNxBh9SL 419ZPHPzo7L',
  'short-champagne': '41boGWnhvDL 519VXV5GC-L 41r0PB+17RL 51frVhMh4RL 51w238rZDhL 41FRzJX3XrL 41UwwAI9-DL 61SAm0wCXkL 41IYYQajIwL',
  'short-purple': '41Q7fEHFZqL 411R13Lm1wL 419Hacjno8L 41Hn2val2sL 51ycQbwmk4L 410eRsQcDmL 41I-9fAiLOL 51dG6YdK0ML 41QmHYoTL9L',
  'short-pink': '41yvMM81dqL 410+Nuz4MHL 41KLgJC1ovL 41ASaJjxaZL 51ycQbwmk4L 410eRsQcDmL 41I-9fAiLOL 51dG6YdK0ML 41QmHYoTL9L',
  'short-black': '41fJYj+KnuL 41m0QvcjaUL 41-UWaO6nxL 41Rhi30ZN8L 51ycQbwmk4L 410eRsQcDmL 41I-9fAiLOL 51dG6YdK0ML 41QmHYoTL9L',
  'short-winered': '41nLrCqrJML 51Qt+xZLvFL 41r0PB+17RL 51frVhMh4RL 51w238rZDhL 41FRzJX3XrL 41UwwAI9-DL 61SAm0wCXkL 41IYYQajIwL',
  'short-white': '41Vxs3N2h4L 41pwU-if53L 419btGzdPFL 41Sb+1mt03L 51ycQbwmk4L 410eRsQcDmL 41I-9fAiLOL',
};
// 旧ブランド名入りカード / 404
const DROP = new Set(['519Q6cx2EuL', '51NjY2AIpyL', '51dG6YdK0ML', '61SAm0wCXkL', '51GiNxBh9SL', '419ZPHPzo7L']);
// 空き枠の埋め草（家族共通：サイズ表・カラー一覧・着用モデル表）
const FILL = ['51w238rZDhL', '41XtiSFS02L', '51ycQbwmk4L', '410eRsQcDmL', '41I-9fAiLOL', '41jVH752H4L'];
const U = (id) => `https://m.media-amazon.com/images/I/${id}.jpg`;

const out = [], csv = ['sku,key,old_main,new_main,images'], skip = [];
for (const r of rows.filter((x) => /^220826T-/i.test(x['2']))) {
  const m = r['2'].toLowerCase().match(/^220826t-(short|half|long|semi)-([a-z]+)-/);
  const key = m && `${m[1]}-${m[2]}`;
  if (!key || !SETS[key]) { skip.push(`${r['2']} (${key}) 同じ丈×色の実写真なし`); continue; }
  const ids = SETS[key].split(' ').filter((i) => !DROP.has(i));
  for (const f of FILL) { if (ids.length >= 9) break; if (!ids.includes(f)) ids.push(f); }
  const row = { 2: r['2'], 3: r['3'], 4: '編集（部分更新）' };
  ids.slice(0, 9).forEach((id, i) => { row[43 + i] = U(id); });
  out.push(row);
  csv.push(`${r['2']},${key},${String(r['43'] || '').split('/').pop()},${ids[0]}.jpg,${ids.length}`);
}
fs.writeFileSync(path.join(R, 'rows-imgfix-220826.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(R, 'imgfix-220826-plan.csv'), '﻿' + csv.join('\n'));
console.log('rows', out.length, '/ skip', skip.length);
skip.forEach((s) => console.log('  skip', s));
