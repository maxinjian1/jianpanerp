"""楽天 img-audit：画像の一覧シートを作る。
  python img-sheet.py main  → out/img-audit/main-1..N.jpg（全商品の 1 枚目、番号付き）
  python img-sheet.py item <mn> → out/img-audit/sheets/<mn>.jpg（その商品の全画像）
"""
import json, sys, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
O = Path(__file__).resolve().parent / 'out/img-audit'
items = json.loads((O / 'items.json').read_text(encoding='utf-8'))
try: F = ImageFont.truetype('C:/Windows/Fonts/meiryo.ttc', 16)
except Exception: F = ImageFont.load_default()
def sheet(cells, out, W=260, cols=6):
    rows = (len(cells) + cols - 1) // cols
    sh = Image.new('RGB', (cols * W, rows * (W + 22)), (200, 200, 200)); d = ImageDraw.Draw(sh)
    for i, (f, lab) in enumerate(cells):
        x, y = (i % cols) * W, (i // cols) * (W + 22)
        try:
            im = Image.open(f).convert('RGB'); im.thumbnail((W - 4, W - 4)); sh.paste(im, (x + 2, y + 2))
        except Exception: d.text((x + 10, y + 100), 'ERR', fill='red', font=F)
        d.text((x + 3, y + W), lab[:28], fill='black', font=F)
    sh.save(out, quality=82)
safe = lambda mn: ''.join('_' if c in r'/:*?"<>|' else c for c in mn)
if sys.argv[1] == 'main':
    cells = [(O / 'img' / safe(it['mn']) / '01.jpg', f"{i+1} {it['mn']}") for i, it in enumerate(items)]
    for k in range(0, len(cells), 36): sheet(cells[k:k + 36], O / f'main-{k // 36 + 1}.jpg')
elif sys.argv[1] == 'item':
    mn = sys.argv[2]; (O / 'sheets').mkdir(exist_ok=True)
    fs = sorted((O / 'img' / safe(mn)).glob('*.jpg'))
    sheet([(f, f.stem) for f in fs], O / 'sheets' / f'{safe(mn)}.jpg', W=300, cols=5)
if sys.argv[1] == 'rows':
    # python img-sheet.py rows 2,3,8 ...（main シートの番号）→ out/img-audit/rows-N.jpg（1 行 1 商品、全画像）
    idx = [int(x) for x in sys.argv[2].split(',')]
    TW, per = 140, 7
    for k in range(0, len(idx), per):
        part = idx[k:k + per]; mx = 20
        sh = Image.new('RGB', (130 + mx * TW, len(part) * (TW + 4)), (210, 210, 210)); d = ImageDraw.Draw(sh)
        for r, n in enumerate(part):
            it = items[n - 1]; y = r * (TW + 4)
            d.text((4, y + 4), f"{n}\n{it['mn']}", fill='black', font=F)
            for j, f in enumerate(sorted((O / 'img' / safe(it['mn'])).glob('*.jpg'))[:mx]):
                try:
                    im = Image.open(f).convert('RGB'); im.thumbnail((TW - 4, TW - 4)); sh.paste(im, (130 + j * TW, y + 2))
                    d.text((130 + j * TW + 2, y + 2), str(j + 1), fill='red', font=F)
                except Exception: pass
        sh.save(O / f'rows-{k // per + 1}.jpg', quality=80)
