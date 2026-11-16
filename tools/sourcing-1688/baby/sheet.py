"""確認用コンタクトシート：各商品 1 行、画像に番号。out/baby/sheet/sNN.jpg"""
import json, os, glob
from PIL import Image, ImageDraw, ImageFont
B = os.path.dirname(os.path.abspath(__file__)); IMG = os.path.join(B, '..', 'out', 'baby', 'img'); OUT = os.path.join(B, '..', 'out', 'baby', 'sheet'); os.makedirs(OUT, exist_ok=True)
spec = json.load(open(os.path.join(B, 'spec.json'), encoding='utf-8'))['products']
T = 170; F = ImageFont.truetype('C:/Windows/Fonts/arialbd.ttf', 22)
def order(p): return list(dict.fromkeys(p['gal'] + [v[-3] for v in p['v'] if v[-3]] + p.get('col', [])))
rows = []
for p in spec:
    ids = order(p); p['_ids'] = ids
    W = 90 + T * len(ids); r = Image.new('RGB', (W, T + 6), 'white'); d = ImageDraw.Draw(r); d.text((6, 70), p['mn'][-2:], font=F, fill='red')
    for k, i in enumerate(ids):
        im = Image.open(os.path.join(IMG, p['mn'], i + '.jpg')).convert('RGB'); im.thumbnail((T - 4, T - 4))
        x = 90 + k * T; r.paste(im, (x, 3)); d.text((x + 3, 3), str(k), font=F, fill='red')
    rows.append(r)
json.dump({p['mn']: p['_ids'] for p in spec}, open(os.path.join(OUT, 'ids.json'), 'w'), indent=0)
per = 5
for s in range(0, len(rows), per):
    g = rows[s:s + per]; W = max(r.width for r in g); H = sum(r.height for r in g)
    c = Image.new('RGB', (W, H), (220, 220, 220)); y = 0
    for r in g: c.paste(r, (0, y)); y += r.height
    c.save(os.path.join(OUT, 's%02d.jpg' % (s // per)), quality=80)
print(len(rows), 'rows', [r.width for r in rows])
