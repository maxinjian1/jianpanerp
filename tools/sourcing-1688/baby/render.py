"""ベビー 30 選の楽天画像を作る（1688 原図を切り落としのみ・白余白で 1000px 正方形、AI 生成・塗りつぶしなし）＋ 日本語「商品情報」画像。
  apps/image-service/venv/Scripts/python.exe tools/sourcing-1688/baby/render.py
出力 out/baby/b/r/bNN-MM.jpg（MM=01 が主画像）・bNN-info.jpg → R-Cabinet 名 b-bNN-MM.jpg（cabinet.mjs は祖父ディレクトリ名-ファイル名）
確認用 out/baby/sheet/check-NN.jpg
"""
import json, os
from PIL import Image, ImageDraw, ImageFont

B = os.path.dirname(os.path.abspath(__file__)); O = os.path.join(B, '..', 'out', 'baby')
IMG = os.path.join(O, 'img'); OUT = os.path.join(O, 'b', 'r'); os.makedirs(OUT, exist_ok=True)
spec = json.load(open(os.path.join(B, 'spec.json'), encoding='utf-8'))['products']
ids = json.load(open(os.path.join(O, 'sheet', 'ids.json')))
sel = json.load(open(os.path.join(B, 'imgs.json'), encoding='utf-8'))
FD = 'C:/Windows/Fonts/'
def F(n, s): return ImageFont.truetype(FD + n, s)
BG = (250, 246, 240); INK = (88, 72, 62); ACC = (196, 140, 120); LINE = (226, 210, 196)

def trim(im, th=246):
    g = im.convert('L').point(lambda v: 0 if v >= th else 255); b = g.getbbox()
    return im.crop(b) if b else im

def crop(im, how):
    w, h = im.size
    if how == 'full': return im
    k, _, r = how.partition(':')
    if k == 'top': return im.crop((0, int(h * float(r)), w, h))
    if k == 'bot': return im.crop((0, 0, w, int(h * (1 - float(r)))))
    if k == 'box':
        x0, y0, x1, y1 = [float(v) for v in r.split(',')]; return im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
    raise ValueError(how)

def square(im, S=1000, white=False):
    im = im.convert('RGB')
    if white: im = trim(im)
    w, h = im.size; s = max(w, h); m = int(s * (0.06 if white else 0))
    c = Image.new('RGB', (s + 2 * m, s + 2 * m), 'white'); c.paste(im, ((s + 2 * m - w) // 2, (s + 2 * m - h) // 2))
    return c.resize((S, S), Image.LANCZOS)

def is_white(im):
    w, h = im.size; px = [im.getpixel((x, y)) for x in range(0, w, max(1, w // 30)) for y in (1, h - 2)]
    return sum(sum(p) / 3 for p in px) / len(px) > 240

def wrap(t, n):
    out, line = [], ''
    for ch in t:
        line += ch
        if len(line) >= n and ch not in '、。）・／': out.append(line); line = ''
    if line: out.append(line)
    return out

def info(p):
    S = 1000; im = Image.new('RGB', (S, S), BG); d = ImageDraw.Draw(im)
    d.text((70, 60), '商品情報', font=F('YuGothB.ttc', 50), fill=INK); d.line((70, 140, 930, 140), fill=ACC, width=3)
    y = 172
    rows = [('素材', p['material']), ('セット内容', p['set']), ('サイズ', p['size'])]
    if p.get('caution'): rows.append(('ご注意', p['caution']))
    rows.append(('その他', '海外製品のため、縫製や寸法に多少の個体差があります。モニターにより実物と色味が異なって見える場合があります。'))
    for lab, val in rows:
        d.text((70, y), '■ ' + lab, font=F('YuGothB.ttc', 32), fill=ACC); y += 50
        for ln in wrap(val, 27):
            d.text((100, y), ln, font=F('YuGothM.ttc', 29), fill=INK); y += 44
        y += 20
    if y > S - 20: print('!! info overflow', p['mn'], y)
    return im

def points(p, photo):
    """ポイント画像：上に写真、下に 3 つのポイント（短文のみ）"""
    S = 1000; im = Image.new('RGB', (S, S), BG); d = ImageDraw.Draw(im)
    ph = square(photo, 560, white=is_white(photo)); im.paste(ph, ((S - 560) // 2, 40))
    y = 630
    for k, t in enumerate(p['points'][:3]):
        d.ellipse((70, y + 2, 112, y + 44), fill=ACC); d.text((83, y + 4), str(k + 1), font=F('YuGothB.ttc', 30), fill='white')
        ls = wrap(t, 24)
        for j, ln in enumerate(ls):
            d.text((130, y + j * 40), ln, font=F('YuGothM.ttc', 30), fill=INK)
        y += max(1, len(ls)) * 40 + 30
    if y > S: print('!! points overflow', p['mn'], y)
    return im

made = {}
for p in spec:
    n = p['mn'][-2:]; idl = ids[p['mn']]; out = []
    for k, (ix, how) in enumerate(sel[p['mn']]):
        src = Image.open(os.path.join(IMG, p['mn'], idl[ix] + '.jpg')).convert('RGB')
        c = crop(src, how)
        sq = square(c, white=is_white(c))
        f = 'b%s-%02d.jpg' % (n, k + 1); sq.save(os.path.join(OUT, f), quality=88); out.append({'file': f, 'src': idl[ix]})
    # ポイント画像（2 枚目の写真を使う）＋ 商品情報
    first = Image.open(os.path.join(OUT, out[min(1, len(out) - 1)]['file']))
    points(p, first).save(os.path.join(OUT, 'b%s-pt.jpg' % n), quality=90)
    info(p).save(os.path.join(OUT, 'b%s-info.jpg' % n), quality=90)
    made[p['mn']] = out
    # 確認シート
    fs = [o['file'] for o in out] + ['b%s-pt.jpg' % n, 'b%s-info.jpg' % n]
    T = 250; sh = Image.new('RGB', (T * len(fs), T), 'white')
    for i, f in enumerate(fs):
        t = Image.open(os.path.join(OUT, f)); t.thumbnail((T - 4, T - 4)); sh.paste(t, (i * T + 2, 2))
    sh.save(os.path.join(O, 'sheet', 'check-%s.jpg' % n), quality=80)
json.dump(made, open(os.path.join(O, 'made.json'), 'w'), indent=1)
print('done', sum(len(v) for v in made.values()), 'photos +', 2 * len(made), 'text images')
