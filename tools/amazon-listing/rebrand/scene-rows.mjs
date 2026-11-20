#!/usr/bin/env node
/**
 * 完成した組（scene/<key>/up/s1.jpg, s2.jpg）を R-Cabinet に上げ、Amazon 部分更新の行を作る（2026-11-20）
 *   node tools/amazon-listing/rebrand/scene-rows.mjs host <key...>   → scene/hosted.json に URL
 *   node tools/amazon-listing/rebrand/scene-rows.mjs rows <key...>   → scene/rows-<tag>.json（write_xlsm.py --rows 用）
 * 並び：[現在の主画像, s1, s2, 現在の 2 枚目以降…]（9 枚まで、溢れた末尾は落ちる → plan csv に記録）
 * 現在の並びは代表 SKU の店頭（front-imgs.json）。同じ組の全 SKU（サイズ違い・手工 A 系列）に同じ並びを入れる。
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const S = path.join(ROOT, 'tools/amazon-listing/out/rebrand/scene');
const J = (f, d) => (fs.existsSync(path.join(S, f)) ? JSON.parse(fs.readFileSync(path.join(S, f), 'utf8')) : d);
const [cmd, ...keys] = process.argv.slice(2);
const hosted = J('hosted.json', {});
if (cmd === 'host') {
  const stage = path.join(S, 'stage', 'x', 'up'); fs.mkdirSync(stage, { recursive: true });
  const files = [];
  for (const k of keys) for (const s of ['s1', 's2']) {
    const f = path.join(S, k, 'up', s + '.jpg'); if (!fs.existsSync(f) || hosted[`${k}/${s}`]) continue;
    const short = 'sc' + crypto.createHash('sha1').update(k).digest('hex').slice(0, 10) + s; // ≤ 20 字、組ごとに一意
    const d = path.join(stage, short + '.jpg'); fs.copyFileSync(f, d); files.push([`${k}/${s}`, d]);
  }
  if (!files.length) { console.log('nothing to host'); process.exit(0); }
  const res = path.join(S, 'stage', 'cab.json');
  execFileSync('node', [path.join(ROOT, 'tools/rakuten/cabinet.mjs'), 'upload', '--folder', 'anet2025-02', '--out', res, ...files.map((x) => x[1])], { stdio: 'inherit' });
  const out = JSON.parse(fs.readFileSync(res, 'utf8'));
  for (const [id, d] of files) { const o = out.find((x) => x.src === d); if (o?.url) hosted[id] = o.url; }
  fs.writeFileSync(path.join(S, 'hosted.json'), JSON.stringify(hosted, null, 1));
  console.log('hosted', Object.keys(hosted).length);
}
if (cmd === 'rows') {
  const groups = J('groups.json', []); const reps = J('reps-asin.json', {}); const front = J('front-imgs.json', {});
  const types = J('types.json', {});
  const tag = process.argv.find((a) => a.startsWith('--tag='))?.slice(6) || 'batch';
  const rows = [], csv = ['key,sku,new_count,dropped'];
  for (const k of keys.filter((x) => !x.startsWith('--'))) {
    const g = groups.find((x) => x.key === k); if (!g) { console.log('no group', k); continue; }
    const news = ['s1', 's2'].map((s) => hosted[`${k}/${s}`]).filter(Boolean);
    if (!news.length) { console.log('not hosted', k); continue; }
    const repSku = g.sc[0]?.sku; const fr = front[reps[repSku]] || (g.manual[0] && front[reps[g.manual[1] || g.manual[0]]]);
    if (!fr || fr[0].endsWith('.gif') || fr[0] === 'NONE') { console.log('no current images', k); continue; }
    const cur = fr.map((id) => `https://m.media-amazon.com/images/I/${id}.jpg`);
    const all = [cur[0], ...news, ...cur.slice(1)];
    const keep = all.slice(0, 9), dropped = all.slice(9);
    for (const sc of g.sc) { const r = { 2: sc.sku, 3: sc.type, 4: '編集（部分更新）' }; keep.forEach((u, i) => { r[43 + i] = u; }); rows.push(r); csv.push(`${k},${sc.sku},${keep.length},${dropped.map((u) => u.split('/').pop()).join(' ')}`); }
    const mfr = g.manual.length && front[reps[g.manual[1] || g.manual[0]]];
    const mkeep = mfr && !mfr[0].endsWith('.gif') ? (() => { const c = mfr.map((id) => `https://m.media-amazon.com/images/I/${id}.jpg`); return [c[0], ...news, ...c.slice(1)]; })() : all;
    if (mfr && mfr.length >= 8) { console.log('skip manual (already', mfr.length, 'images)', k); g.manual = []; }
    for (const m of g.manual) {
      const t = types[m.slice(0, 3)]; if (!t) { console.log('no type for', m); continue; }
      const keep = mkeep.slice(0, 9), dropped = mkeep.slice(9);
      const r = { 2: m, 3: t, 4: '編集（部分更新）' }; keep.forEach((u, i) => { r[43 + i] = u; }); rows.push(r); csv.push(`${k},${m},${keep.length},${dropped.map((u) => u.split('/').pop()).join(' ')}`);
    }
  }
  fs.writeFileSync(path.join(S, `rows-${tag}.json`), JSON.stringify(rows, null, 1));
  fs.writeFileSync(path.join(S, `plan-${tag}.csv`), '﻿' + csv.join('\n'));
  console.log('rows', rows.length);
}
