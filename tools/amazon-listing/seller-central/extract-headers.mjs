/** ダウンロードした在庫ファイルテンプレート(.xlsm/.xlsx) から 3 行ヘッダ TSV と feed_product_type / ブラウズノード候補を抜く
 *   node tools/amazon-listing/seller-central/extract-headers.mjs tools/amazon-listing/templates/raw/Home.xlsm Home
 *  依存: npm i -D xlsx（リポジトリ直下） */
import fs from 'node:fs'; import path from 'node:path';
const mod = await import('xlsx'); const XLSX = mod.default ?? mod;
const [,, file, nameArg] = process.argv; if (!file) { console.error('usage: extract-headers.mjs <template.xlsm> [TypeName]'); process.exit(2); }
const wb = XLSX.readFile(file);
const tplName = wb.SheetNames.find((n) => /^(テンプレート|Template)$/i.test(n)) ?? wb.SheetNames.find((n) => /テンプレート|Template/i.test(n) && !/変更|change/i.test(n)) ?? wb.SheetNames[0]; // 新テンプレートには「テンプレート内の変更」シートもあるので完全一致を優先
const rows = XLSX.utils.sheet_to_json(wb.Sheets[tplName], { header: 1, raw: false, defval: '' });
const name = nameArg ?? path.basename(file).replace(/\.[^.]+$/, '');
const outDir = path.resolve(import.meta.dirname, '../templates'); fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${name}.headers.tsv`);
fs.writeFileSync(out, rows.slice(0, 3).map((r) => r.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\r\n') + '\r\n');
console.log('headers →', out, '| sheet:', tplName, '| fields:', rows[2]?.length);
const vals = wb.SheetNames.find((n) => /有効な値|Valid Values|推奨値|Dropdown Lists/i.test(n));
if (vals) {
  const v = XLSX.utils.sheet_to_json(wb.Sheets[vals], { header: 1, raw: false, defval: '' });
  const hdr = v[0] ?? []; const col = (re) => hdr.findIndex((h) => re.test(String(h)));
  const fpt = col(/feed_product_type|商品タイプ/), bn = col(/browse|ブラウズ/);
  if (fpt >= 0) console.log('feed_product_type 候補:', [...new Set(v.slice(1).map((r) => r[fpt]).filter(Boolean))].join(', '));
  if (bn >= 0) console.log('ブラウズノード列（有効な値シート 列', bn + 1, '）先頭 20:', v.slice(1, 21).map((r) => r[bn]).filter(Boolean).join(' | '));
} else console.log('有効な値シートなし。シート一覧:', wb.SheetNames.join(', '));
