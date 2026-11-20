#!/usr/bin/env node
/** groups.json + scene-config.json → out/rebrand/scene/plan.json（各組の参照画像・Gemini 指示文・文字）2026-11-20 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const S = path.join(ROOT, 'tools/amazon-listing/out/rebrand/scene');
const groups = JSON.parse(fs.readFileSync(path.join(S, 'groups.json'), 'utf8'));
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/amazon-listing/rebrand/scene-config.json'), 'utf8'));
const EN = { white: 'ivory white', black: 'black', purple: 'purple', pink: 'pink', champagne: 'champagne beige', winered: 'wine red', usubeni: 'pale pink', murasaki: 'deep purple', burgundy: 'burgundy', lotus: 'lotus pink', lightpurple: 'light lavender', lightpink: 'light pink', peach: 'peach', red: 'red', lavender: 'lavender', beige: 'beige', nude: 'nude beige', apricot: 'apricot', charcoalblue: 'charcoal blue', indigoblue: 'indigo blue', brown: 'brown', mustard: 'mustard yellow', green: 'green', blue: 'blue', tan: 'tan', olive: 'olive', blau: 'blue', camel: 'camel', yellow: 'yellow', lightgrey: 'light grey', navy: 'navy', lightblue: 'light blue', salmonpink: 'salmon pink' };
const TAIL = ' Background softly blurred. Absolutely no text, letters, signs or logos anywhere in the image. Square 1:1.';
const plan = [];
for (const g of groups) {
  let fam = g.key.replace(/-[^-]+$/, ''); let color = g.key.split('-').pop();
  if (!cfg.families[fam]) { fam = g.key; color = /2087black/.test(fam) ? 'black' : /salmonpink/.test(fam) ? 'salmonpink' : 'white'; }
  if (g.key.startsWith('191120-bra-')) { fam = '191120-bra'; color = g.key.split('-').pop(); }
  const f = cfg.families[fam]; if (!f) { console.log('no config', g.key); continue; }
  const t = cfg.templates[f.t]; const c = EN[color] || color;
  const ref = g.sc[0]?.imgs?.[0] || null;
  const fill = (s) => s.replaceAll('{item}', f.item).replaceAll('{color}', c) + TAIL;
  plan.push({ key: g.key, qty: g.qty, fam, color, type: f.t, ref, p1: fill(t.p1), p2: fill(t.p2), cap1: f.cap1, cap2: f.cap2, skus: [...g.sc.map((x) => x.sku), ...g.manual] });
}
fs.writeFileSync(path.join(S, 'plan.json'), JSON.stringify(plan, null, 1));
console.log('plan', plan.length, 'no-ref', plan.filter((p) => !p.ref).map((p) => p.key).join(' '));
