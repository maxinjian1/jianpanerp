#!/usr/bin/env node
/**
 * SARADEMUNT 在庫あり（款式×色）→ 同じ商品の SALONCARE SKU 一覧（2026-11-20）
 *   node tools/amazon-listing/rebrand/scene-groups.mjs → out/rebrand/scene/groups.json
 * 入力：out/rebrand/scene/sarademunt-instock-2026-11-20.txt（key:数量）、saloncare/rows.json（-SC）、手工 A 系列の SKU 一覧（下の MANUAL）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const R = path.join(ROOT, 'tools/amazon-listing/out/rebrand');
const rows = JSON.parse(fs.readFileSync(path.join(R, 'saloncare/rows.json'), 'utf8'));
const txt = fs.readFileSync(path.join(R, 'scene/sarademunt-instock-2026-11-20.txt'), 'utf8');
const stock = Object.fromEntries([...txt.matchAll(/([a-z0-9-]+):(\d+)/g)].map((m) => [m[1], +m[2]]));
const norm = (s) => s.toLowerCase().replace(/-sc$/, '').replace(/-(r|f)$/, '').replace(/-(r|f)$/, '').replace(/-(s|m|l|xl|2xl|3xl|free|f)$/, '').replace(/-(r|f)$/, '').replace(/-+$/, '');
// 色の別名・bra 表記ゆれ
const alias = (k) => k.replace(/^191120-(\w+)-bra$/, '191120-bra-$1').replace(/^220718t-blau$/, '220718t-blue').replace(/^240208-black-m-rr$/, '240208-black');
const MANUAL = `A08-purple A08-pink A08-blue A08-white A08-black A07-burgundy-bra A07-lotus-bra A07-peach-bra A07-red-bra A07-purple-bra A07-lightpink-bra A07-white-bra A07-black-bra A06-burgundy A06-lotus A06-usubeni A06-red A06-murasaki A06-lightpurple A06-lightpink A06-white A06-black A01-white A01-black A01-lavender A01-royalblue`.split(' ');
const SIZES = { A08: ['S', 'M', 'L', 'XL'], A07: ['S', 'M', 'L', 'XL'], A06: ['S', 'M', 'L', 'XL'], A01: ['M', 'L', 'XL', '2XL'] };
const manualKey = (m) => { const [p, c, b] = m.split('-'); return p === 'A01' ? `240208-${c}` : p === 'A06' ? `191120-${c}` : p === 'A07' ? `191120-bra-${c}` : `220727t-${c}`; };
const groups = {};
for (const [k0, q] of Object.entries(stock)) { const k = alias(k0); (groups[k] ||= { key: k, qty: 0, sc: [], manual: [] }).qty += q; }
for (const r of rows) { const k = alias(norm(r['2'])); if (groups[k] && !r['2'].startsWith('SC-')) groups[k].sc.push({ sku: r['2'], type: r['3'], imgs: [43, 44, 45, 46, 47, 48, 49, 50, 51].map((c) => r[c]).filter(Boolean), title: r['8'] }); }
for (const m of MANUAL) { const k = manualKey(m); if (groups[k]) for (const s of SIZES[m.slice(0, 3)]) groups[k].manual.push(`${m}-${s}`); }
const list = Object.values(groups).filter((g) => g.sc.length || g.manual.length).sort((a, b) => b.qty - a.qty);
fs.writeFileSync(path.join(R, 'scene/groups.json'), JSON.stringify(list, null, 1));
const none = Object.values(groups).filter((g) => !g.sc.length && !g.manual.length).map((g) => g.key);
console.log('groups', list.length, 'skus', list.reduce((a, g) => a + g.sc.length + g.manual.length, 0), '/ no SALONCARE match', none.length, none.join(' '));
console.log(list.slice(0, 12).map((g) => `${g.key}:${g.qty} sc${g.sc.length}+m${g.manual.length}`).join('  '));
