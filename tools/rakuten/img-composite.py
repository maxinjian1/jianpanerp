"""実物の商品写真を切り抜いて、Gemini が作った「商品なし背景」に置く（商品本体は AI を通さない）。2026-11-20

  apps/image-service/venv/Scripts/python.exe tools/rakuten/img-composite.py <商品写真> <背景> <出力.png> [--box x0,y0,x1,y1] [--cx 0.5] [--base 0.80] [--h 0.55] [--shadow 1]
    --box   商品写真の中で使う範囲（文字・バッジを避けて切り出す。0〜1 の比率）
    --cx    置く位置の中心 x（背景幅に対する比率）
    --base  商品の底辺 y（背景高さに対する比率）
    --h     商品の高さ（背景高さに対する比率）
ラベル文字のある商品（化粧品・パッケージ・液晶付き家電など）は Gemini で描き直すと文字が崩れるので、必ずこちらで合成する。
"""
import sys, argparse
from PIL import Image, ImageFilter
from rembg import remove, new_session

ap = argparse.ArgumentParser()
ap.add_argument('prod'); ap.add_argument('bg'); ap.add_argument('out')
ap.add_argument('--box', default='0,0,1,1'); ap.add_argument('--cx', type=float, default=0.5)
ap.add_argument('--base', type=float, default=0.80); ap.add_argument('--h', type=float, default=0.55)
ap.add_argument('--shadow', type=float, default=1.0)
a = ap.parse_args()

p = Image.open(a.prod).convert('RGB'); W, H = p.size
x0, y0, x1, y1 = [float(v) for v in a.box.split(',')]
p = p.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
try: s = new_session('birefnet-general')
except Exception: s = new_session('isnet-general-use')
cut = remove(p, session=s)
cut = cut.crop(cut.getbbox())

bg = Image.open(a.bg).convert('RGB'); S = min(bg.size)
bg = bg.crop((0, 0, S, S)).resize((1000, 1000), Image.LANCZOS).convert('RGBA'); S = 1000
th = int(S * a.h); tw = int(cut.width * th / cut.height)
if tw > S * 0.92: tw = int(S * 0.92); th = int(cut.height * tw / cut.width)
cut = cut.resize((tw, th), Image.LANCZOS)
x = int(S * a.cx - tw / 2); y = int(S * a.base - th)
if a.shadow:
    from PIL import ImageDraw
    shadow = Image.new('RGBA', bg.size, (0, 0, 0, 0)); d = ImageDraw.Draw(shadow)
    eh = max(10, th // 16)
    d.ellipse((x + tw * 0.04, y + th - eh * 0.6, x + tw * 0.96, y + th + eh * 0.6), fill=(40, 30, 20, int(110 * a.shadow)))
    bg = Image.alpha_composite(bg, shadow.filter(ImageFilter.GaussianBlur(14)))
bg.alpha_composite(cut, (x, y))
bg.convert('RGB').save(a.out)
print('→', a.out, (x, y, tw, th))
