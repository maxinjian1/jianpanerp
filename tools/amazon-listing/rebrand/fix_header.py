"""SARADEMUNT → SALONCARE：商品画像の「検索バー」テンプレート内の旧ブランド文字を、コードで白塗り→「SALONCARE」に書き換える（AI 不使用）。
  apps/image-service/venv/Scripts/python.exe tools/amazon-listing/rebrand/fix_header.py
入力：out/rebrand/image-hits.txt（旧ブランド表記のある画像）  出力：out/rebrand/fixed/<ASIN>/NN.jpg と fix-result.json。元画像は触らない。
検索バーの黄色い虫眼鏡ボタンを上端/下端の帯から探し、その左の文字欄を書き換える。見つからない画像は none（個別対応）。"""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../..'))
R = os.path.join(ROOT, 'tools/amazon-listing/out/rebrand')
FONT = 'C:/Windows/Fonts/YuGothB.ttc'

def find_button(a, y0, y1, k=1.0):
    band = a[y0:y1].astype(int)
    m = (band[:, :, 0] > 215) & (band[:, :, 1] > 150) & (band[:, :, 1] < 215) & (band[:, :, 2] < 110)
    cols = m.sum(0) >= 22 * k
    best = None; x = 0; W = len(cols)
    while x < W:
        if cols[x]:
            s = x
            while x < W and cols[x]: x += 1
            if 40 * k <= x - s <= 80 * k and (best is None or x - s > best[1] - best[0]): best = (s, x)
        else: x += 1
    if not best: return None
    rows = np.where(m[:, best[0]:best[1]].sum(1) >= 20 * k)[0]
    if len(rows) < 30 * k: return None
    return best[0], y0 + rows.min(), best[1], y0 + rows.max()

def fix(src, dst):
    im = Image.open(src).convert('RGB'); W, H = im.size
    k = W / 800
    a = np.asarray(im)
    b = find_button(a, 0, int(110 * k), k) or find_button(a, H - int(120 * k), H, k)
    if not b: return 'none'
    bx0, by0, bx1, by1 = b
    x0, x1, y0, y1 = bx0 - int(286 * k), bx0 - int(6 * k), by0 + int(6 * k), by1 - int(5 * k)
    if x0 < 0: return 'none'
    # 文字欄は白地のはず：四隅付近が白でなければテンプレート違い
    box = a[y0:y1, x0:x1].astype(int)
    if (box.min(2) > 235).mean() < 0.55: return 'none'
    d = ImageDraw.Draw(im); d.rectangle([x0, y0, x1, y1], fill='white')
    f = ImageFont.truetype(FONT, int((y1 - y0) * 0.78))
    d.text(((x0 + x1) // 2, (y0 + y1) // 2), 'SALONCARE', fill=(17, 17, 17), font=f, anchor='mm')
    os.makedirs(os.path.dirname(dst), exist_ok=True); im.save(dst, quality=95, subsampling=0)
    return 'fixed'

res = {}
for rel in [l.strip() for l in open(os.path.join(R, 'image-hits.txt'), encoding='utf8') if l.strip()]:
    p = rel.split('/'); dst = os.path.join(R, 'fixed', p[-3], p[-1])
    res[rel] = fix(os.path.join(ROOT, rel), dst)
json.dump(res, open(os.path.join(R, 'fix-result.json'), 'w'), indent=1)
from collections import Counter; print(Counter(res.values()))
print('\n'.join(f'{i+1} {k} {v}' for i, (k, v) in enumerate(res.items()) if v != 'fixed'))
