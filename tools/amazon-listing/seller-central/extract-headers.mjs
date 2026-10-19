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
fs.writeFileSync(out, rows.slice(0, 5).map((r) => r.map((c) => String(c ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\r\n') + '\r\n');
console.log("headers →", out, "| sheet:", tplName, "| fields:", (rows[4] ?? rows[2])?.filter(Boolean).length, "| 行1=settings 行3=グループ 行4=表示名 行5=フィールドID");
// 新形式（複数商品タイプ）：Dropdown Lists 行2=商品タイプ・行3=属性パス・行4〜=値 → 商品タイプごとの推奨ブラウズノードを <name>.nodes.json に
const dd = wb.Sheets['Dropdown Lists'];
if (dd) {
  const a = XLSX.utils.sheet_to_json(dd, { header: 1, raw: false, defval: '' }); const nodes = {};
  (a[2] ?? []).forEach((attr, i) => { if (!String(attr).startsWith('recommended_browse_nodes') || !a[1][i]) return; nodes[a[1][i]] ??= [...new Set(a.slice(3).map((r) => r[i]).filter(Boolean))]; });
  if (Object.keys(nodes).length) { fs.writeFileSync(path.join(outDir, `${name}.nodes.json`), JSON.stringify(nodes, null, 1) + '\n'); console.log('product types:', Object.entries(nodes).map(([k, v]) => `${k}(${v.length})`).join(', '), '→', `${name}.nodes.json`); }
  // build が自動で埋める選択式属性の有効値（商品タイプごと）→ <name>.values.json { 属性パス(#n 以降を除く): { 商品タイプ: [値] } }
  const FILLED = /^(size|specific_uses_for_product|unit_count|distribution_designation|is_fragile|is_assembly_required|item_weight|item_length_width_height|item_dimensions|color|included_components|batteries_required|batteries_included|is_exclusive_product|condition_type|country_of_origin)\[/;
  const values = {};
  (a[2] ?? []).forEach((attr, i) => { const pt = a[1][i]; if (!pt || !FILLED.test(attr)) return; const key = String(attr).replace(/#\d+(?=\.)/, '#1'); const v = [...new Set(a.slice(3).map((r) => r[i]).filter(Boolean))]; ((values[key] ??= {})[pt] ??= []).push(...v.filter((x) => !values[key][pt].includes(x))); });
  if (Object.keys(values).length) { fs.writeFileSync(path.join(outDir, `${name}.values.json`), JSON.stringify(values) + '\n'); console.log('dropdown values:', Object.keys(values).length, 'attributes →', `${name}.values.json`); }
}
const vals = wb.SheetNames.find((n) => /有効な値|Valid Values|推奨値|Dropdown Lists/i.test(n));
if (vals) {
  const v = XLSX.utils.sheet_to_json(wb.Sheets[vals], { header: 1, raw: false, defval: '' });
  const hdr = v[0] ?? []; const col = (re) => hdr.findIndex((h) => re.test(String(h)));
  const fpt = col(/feed_product_type|商品タイプ/), bn = col(/browse|ブラウズ/);
  if (fpt >= 0) console.log('feed_product_type 候補:', [...new Set(v.slice(1).map((r) => r[fpt]).filter(Boolean))].join(', '));
  if (bn >= 0) console.log('ブラウズノード列（有効な値シート 列', bn + 1, '）先頭 20:', v.slice(1, 21).map((r) => r[bn]).filter(Boolean).join(' | '));
} else console.log('有効な値シートなし。シート一覧:', wb.SheetNames.join(', '));
