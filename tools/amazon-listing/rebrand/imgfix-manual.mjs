#!/usr/bin/env node
/**
 * 手工登録の SALONCARE 商品（A06/A07/A08/A09 ニット/261028-001-Khaki）で主画像が無いものに、同款同色の画像を当てる（2026-11-20）。
 *   node tools/amazon-listing/rebrand/imgfix-manual.mjs   → out/rebrand/saloncare/rows-imgfix-manual.json と imgfix-manual-plan.csv
 * 画像の出所（優先順）：①rows.json（SC 新リンクで使って検証済みの画像セット）②SARADEMUNT 保存ページ out/opt/<ASIN>/current.json
 *   （image-plan.json に従い旧ブランド入りの画像は hosted.json の修正版に差し替え／除外）。出所が無い SKU は skip に記録。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const R = path.join(ROOT, 'tools/amazon-listing/out/rebrand');
const rows = JSON.parse(fs.readFileSync(path.join(R, 'saloncare/rows.json'), 'utf8'));
const plan = JSON.parse(fs.readFileSync(path.join(R, 'image-plan.json'), 'utf8'));
const hosted = JSON.parse(fs.readFileSync(path.join(R, 'saloncare/hosted.json'), 'utf8'));
const archive = fs.readFileSync(path.join(R, 'sarademunt-archive.csv'), 'utf8').replace(/^﻿/, '').split(/\r?\n/).slice(1).filter(Boolean).map((l) => { const c = l.split(','); return { sku: c[0], asin: c[1] }; });

const TARGETS = fs.readFileSync(path.join(R, 'saloncare/imgfix-manual-skus.txt'), 'utf8').split(/\s+/).filter(Boolean);
const TYPE = { A06: 'NIGHTGOWN_NIGHTSHIRT', A07: 'NIGHTGOWN_NIGHTSHIRT', A08: 'UNDERGARMENT_SLIP', A09: 'SWEATER', '261028': 'SWEATER' };
const lc = (s) => s.toLowerCase();

// 対象 SKU → { family 正規表現（旧 SKU）, color }
function spec(sku) {
  let m;
  if (sku === 'A06-191120') return { fam: 'plain', color: 'black', type: TYPE.A06 };
  if (sku === 'A07-191120-bra') return { fam: 'bra', color: 'black', type: TYPE.A07 };
  if (sku === 'A08-220727') return { fam: 'slip', color: 'black', type: TYPE.A08 };
  if ((m = sku.match(/^A06-([a-z]+)-/i))) return { fam: 'plain', color: lc(m[1]), type: TYPE.A06 };
  if ((m = sku.match(/^A07-([a-z]+)-bra-/i))) return { fam: 'bra', color: lc(m[1]), type: TYPE.A07 };
  if ((m = sku.match(/^A08-([a-z]+)-/i))) return { fam: 'slip', color: lc(m[1]), type: TYPE.A08 };
  if ((m = sku.match(/^A09-(white|black|gray|khaki)$/i))) return { fam: 'knit', color: lc(m[1]), type: TYPE.A09 };
  if (sku === '261028-001-Khaki') return { fam: 'knit', color: 'khaki', type: TYPE['261028'] };
  return null;
}
// 旧 SKU が該当 family/color か
function match(old, s) {
  const o = lc(old).replace(/-sc$/, '');
  if (s.fam === 'plain') return o.startsWith('191120-') && !/bra|shorts/.test(o) && o.split('-')[1] === s.color;
  if (s.fam === 'bra') return o.startsWith('191120-') && /bra/.test(o) && !/shorts/.test(o) && o.split('-').includes(s.color);
  if (s.fam === 'slip') return o.startsWith('220727t-') && o.split('-')[1] === s.color;
  if (s.fam === 'knit') return o.startsWith('261028-') && o.split('-').includes(s.color);
  return false;
}
function fromRows(s) {
  const r = rows.find((x) => match(x['2'], s) && x['43']);
  return r ? { src: r['2'], urls: [43, 44, 45, 46, 47, 48, 49, 50, 51].map((c) => r[c]).filter(Boolean) } : null;
}
function fromArchive(s) {
  for (const a of archive.filter((x) => match(x.sku, s))) {
    const f = path.join(ROOT, 'tools/amazon-listing/out/opt', a.asin, 'current.json');
    if (!fs.existsSync(f)) continue;
    const imgs = (JSON.parse(fs.readFileSync(f, 'utf8')).images || []).map((u) => u.replace(/\._[^.]+_\./, '.'));
    const urls = [];
    for (const u of imgs) {
      const p = plan[u];
      if (!p) urls.push(u);
      else if (p.action === 'replace') { const k = p.file.split('/fixed/')[1]; if (hosted[k]) urls.push(hosted[k]); }
    }
    if (urls.length) return { src: a.sku + ' (archive ' + a.asin + ')', urls: urls.slice(0, 9) };
  }
  return null;
}

const out = [], csv = ['sku,product_type,source,images'], skip = [];
for (const sku of TARGETS) {
  const s = spec(sku);
  if (!s) { skip.push(sku + ' 対応表なし'); continue; }
  const got = fromRows(s) || fromArchive(s);
  if (!got) { skip.push(`${sku} ${s.fam}/${s.color} の画像が無い`); continue; }
  const row = { 2: sku, 3: s.type, 4: '編集（部分更新）' };
  got.urls.forEach((u, i) => { row[43 + i] = u; });
  out.push(row); csv.push(`${sku},${s.type},${got.src},${got.urls.length}`);
}
fs.writeFileSync(path.join(R, 'saloncare/rows-imgfix-manual.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(R, 'saloncare/imgfix-manual-plan.csv'), '﻿' + csv.join('\n'));
console.log('rows', out.length, '/ skip', skip.length); skip.forEach((x) => console.log('  skip', x));
