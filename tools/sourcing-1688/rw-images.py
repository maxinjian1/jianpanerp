"""rw-spec.json の imgs を加工して楽天用画像を作る（1688 原図 → 中国語ラベル・ロゴを切り落とし、白余白で 1000px 正方形）。
AI 生成・塗りつぶしはしない（切り落としのみ）。最後に日本語の「商品情報」画像を 1 枚作る（Windows のメイリオ）。
  apps/image-service/venv/Scripts/python.exe tools/sourcing-1688/rw-images.py
出力 tools/sourcing-1688/out/rakuten-pj/rw/<mn>-NN.jpg と <mn>-info.jpg
"""
import json, glob, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(ROOT, 'out', 'rakuten-pj')
OUT = os.path.join(BASE, 'rw'); os.makedirs(OUT, exist_ok=True)
spec = json.load(open(os.path.join(ROOT, 'rw-spec.json'), encoding='utf-8'))
FONT = 'C:/Windows/Fonts/meiryo.ttc'; FONTB = 'C:/Windows/Fonts/meiryob.ttc'

def square(im, size=1000):
    im = im.convert('RGB'); w, h = im.size; s = max(w, h)
    c = Image.new('RGB', (s, s), 'white'); c.paste(im, ((s - w) // 2, (s - h) // 2))
    return c.resize((size, size), Image.LANCZOS)

def op(im, how):
    w, h = im.size
    if how == 'full': return im
    k, r = how.split(':') if ':' in how else (how, '0')
    r = float(r)
    if k == 'left': return im.crop((0, 0, int(w * r), h))
    if k == 'top': return im.crop((0, int(h * r), w, h))
    if k == 'wm': return im.crop((0, int(h * 0.18), w, h))
    if k == 'leftwm': return im.crop((0, int(h * 0.18), int(w * r), h))
    raise ValueError(how)

def info(p):
    W = 1000; im = Image.new('RGB', (W, W), (250, 247, 244)); d = ImageDraw.Draw(im)
    ft = ImageFont.truetype(FONTB, 46); fh = ImageFont.truetype(FONTB, 30); fb = ImageFont.truetype(FONT, 27)
    d.text((60, 55), '商品情報', font=ft, fill=(90, 60, 60)); d.line((60, 125, 940, 125), fill=(200, 170, 160), width=3)
    y = 160
    def wrap(t, n=31):
        out, line = [], ''
        for ch in t:
            line += ch
            if len(line) >= n: out.append(line); line = ''
        if line: out.append(line)
        return out
    for label, val in [('素材', p['material']), ('セット内容', p['set']), ('サイズ', p['sizeNote']), ('お手入れ', '洗濯ネットに入れて手洗い、または弱水流での洗濯をおすすめします。陰干ししてください。'), ('ご注意', 'モニターの環境により、実物と色味が異なって見える場合があります。')]:
        d.text((60, y), '■ ' + label, font=fh, fill=(150, 90, 90)); y += 46
        for ln in wrap(val):
            d.text((90, y), ln, font=fb, fill=(60, 60, 60)); y += 40
        y += 22
    return im

for p in spec['products']:
    src = sorted(glob.glob(os.path.join(BASE, 'img', 'p%02d' % p['no'], '*.jpg')))
    for i, (idx, how) in enumerate(p['imgs']):
        square(op(Image.open(src[idx]), how)).save(os.path.join(OUT, '%s-%02d.jpg' % (p['mn'], i + 1)), quality=88)
    # バリエーション画像（色見本）：spec の img 番号を left/full で
    info(p).save(os.path.join(OUT, '%s-info.jpg' % p['mn']), quality=90)
    print(p['mn'], len(p['imgs']) + 1)
