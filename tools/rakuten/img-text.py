"""楽天の追加画像（シーン・訴求）に日本語を「コードで」載せる。AI には文字を描かせない（2026-11-20）。

  python img-text.py spec.json
spec.json = [
  {"src": "g1.png", "out": "x-01.jpg", "layout": "caption", "text": "プール・海・水遊びに"},
  {"src": "g3.png", "out": "x-03.jpg", "layout": "points", "title": "やさしくフィット", "sub": "...", "points": ["UVカット", ...]},
  ...
]
layout:
  caption … 下部に半透明の帯＋1 行（シーン画像用、文字は画面の 1 割程度）
  points  … 上部の空きに見出し＋サブ＋丸角チップ（最大 4 個、訴求画像用）
文言は商品説明に書いてある事実だけを使うこと（数字・効果を足さない）。
"""
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

FONT = 'C:/Windows/Fonts/NotoSansJP-VF.ttf'
def font(size, weight=700):
    f = ImageFont.truetype(FONT, size)
    try: f.set_variation_by_axes([weight])
    except Exception: pass
    return f

def square(im, S=1000):
    w, h = im.size; s = min(w, h)
    return im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s)).resize((S, S), Image.LANCZOS)

def fit(d, text, maxw, size, weight=800):
    while size > 20:
        f = font(size, weight)
        if d.textlength(text, font=f) <= maxw: return f
        size -= 2
    return font(size, weight)

def caption(im, text, color=(255, 255, 255), band=(20, 40, 70, 150)):
    S = im.size[0]; ov = Image.new('RGBA', im.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    h = int(S * 0.11); d.rectangle((0, S - h, S, S), fill=band)
    f = fit(d, text, S * 0.88, int(h * 0.5))
    tw = d.textlength(text, font=f)
    d.text(((S - tw) / 2, S - h / 2), text, font=f, fill=color, anchor='lm')
    return Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')

def points(im, title, sub, pts, ink=(18, 42, 82), accent=(0, 120, 200)):
    S = im.size[0]; d = ImageDraw.Draw(im)
    ft = fit(d, title, S * 0.86, 78, 900)
    d.text((S / 2, S * 0.085), title, font=ft, fill=ink, anchor='mm')
    if sub:
        fs = fit(d, sub, S * 0.86, 36, 500)
        d.text((S / 2, S * 0.155), sub, font=fs, fill=ink, anchor='mm')
    # チップ 2×2
    fc = font(34, 800); cw, ch = S * 0.42, 66; gx, gy = S * 0.04, 18
    x0 = (S - (2 * cw + gx)) / 2; y0 = S * 0.205
    for i, p in enumerate(pts[:4]):
        x = x0 + (i % 2) * (cw + gx); y = y0 + (i // 2) * (ch + gy)
        d.rounded_rectangle((x, y, x + cw, y + ch), radius=ch / 2, fill=(255, 255, 255), outline=accent, width=4)
        f = fit(d, p, cw - 40, 34, 800)
        d.text((x + cw / 2, y + ch / 2), p, font=f, fill=accent, anchor='mm')
    return im

spec = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
base = Path(sys.argv[1]).parent
for s in spec:
    im = square(Image.open(base / s['src']).convert('RGB'))
    if s['layout'] == 'caption': im = caption(im, s['text'])
    elif s['layout'] == 'points': im = points(im, s['title'], s.get('sub', ''), s['points'])
    out = base / 'up' / s['out']; out.parent.mkdir(exist_ok=True)
    im.save(out, quality=92); print('→', out)
