"""rows.json（build-saloncare.mjs の出力）を 11-11 カテゴリー別出品レポートの xlsm に書き込み、アップロード用ファイルを作る。

  python tools/amazon-listing/rebrand/write_xlsm.py <out.xlsm> [--rows rows.json] [--prefix 2238,HM220831] [--skip-prefix ...] [--skus skus.json（新SKUのリスト）]

テンプレート行（1〜6 行目）とマクロ・入力規則はそのまま、7 行目以降の既存データを消して新 SKU を書く。
"""
import json, sys, re
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'tools/amazon-listing/in/category-report-2026-11-11/0_APPAREL-VEST.xlsm'
ROWS = ROOT / 'tools/amazon-listing/out/rebrand/saloncare/rows.json'
if '--rows' in sys.argv: ROWS = Path(sys.argv[sys.argv.index('--rows') + 1])

out = Path(sys.argv[1])
def opt(k):
    return sys.argv[sys.argv.index(k) + 1].split(',') if k in sys.argv else None
only, skip = opt('--prefix'), opt('--skip-prefix')

rows = json.loads(ROWS.read_text(encoding='utf-8'))
def prefix(r):
    sku = r['2']
    return sku.split('-')[1] if sku.startswith('SC-') else sku.split('-')[0]
if only: rows = [r for r in rows if prefix(r) in only]
if skip: rows = [r for r in rows if prefix(r) not in skip]
if '--skus' in sys.argv:
    want = set(json.loads(Path(sys.argv[sys.argv.index('--skus') + 1]).read_text(encoding='utf-8')))
    rows = [r for r in rows if r['2'] in want]

wb = openpyxl.load_workbook(SRC, keep_vba=True)
ws = wb['テンプレート']
if ws.max_row >= 7:
    ws.delete_rows(7, ws.max_row - 6)
for i, r in enumerate(rows):
    for c, v in r.items():
        cell = ws.cell(row=7 + i, column=int(c) + 1)
        if isinstance(v, str) and re.fullmatch(r'-?\d+(\.\d+)?', v) and int(c) >= 500:
            cell.value = float(v)
        else:
            cell.value = v
wb.save(out)
print(f'{out}  rows={len(rows)}')
