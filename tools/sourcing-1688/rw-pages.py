"""楽天の商品画像・説明画像を「全部正方形 1000px・同じデザイン」で作る（用户 11-12：tetelab の画像を参考、説明画像 15 枚以上、
商品がはっきり見えること、簡単な言葉だけ・余計な宣伝なし）。参考店の画像は使わない（デザインの方向性だけ）。
  apps/image-service/venv/Scripts/python.exe tools/sourcing-1688/rw-pages.py [rw1688-01 …]
出力：out/c/x/xNN-MM.jpg（MM=01 が主画像）。素材は img/pXX の 1688 原図（切り落としのみ、塗りつぶし・生成なし）。
"""
import json, os, sys, glob
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(ROOT, 'out', 'rakuten-pj', 'img'); OUT = os.path.join(ROOT, 'out', 'c', 'x'); os.makedirs(OUT, exist_ok=True)
spec = {p['mn']: p for p in json.load(open(os.path.join(ROOT, 'rw-spec.json'), encoding='utf-8'))['products']}
FD = 'C:/Windows/Fonts/'
def F(n, s): return ImageFont.truetype(FD + n, s)
JM, JML, JG, JGB, EN = 'yumin.ttf', 'yuminl.ttf', 'YuGothM.ttc', 'YuGothB.ttc', 'georgia.ttf'
BG = (244, 238, 230); BG2 = (232, 222, 208); INK = (78, 66, 58); SUB = (140, 120, 100); LINE = (200, 185, 165)
S = 1000

EN_NAME = {'ブラック': 'Black', 'ワインレッド': 'Wine Red', 'パープル': 'Purple', 'ピンク': 'Pink', 'ベージュ': 'Beige', 'シャンパン': 'Champagne', 'ホワイト': 'White',
           'ライトピンク': 'Light Pink', 'ラベンダー': 'Lavender', 'クリーム': 'Cream', 'ブルー': 'Blue', 'ライトブルー': 'Light Blue', 'グレー': 'Gray', 'ブラウン': 'Brown'}
SW = {'ブラック': (30, 30, 32), 'ワインレッド': (128, 22, 36), 'パープル': (98, 40, 120), 'ピンク': (232, 196, 196), 'ベージュ': (232, 218, 196), 'シャンパン': (226, 206, 178),
      'ホワイト': (246, 244, 240), 'ライトピンク': (240, 210, 210), 'ラベンダー': (196, 186, 220), 'クリーム': (244, 232, 200), 'ブルー': (150, 178, 206), 'ライトブルー': (196, 214, 228),
      'グレー': (130, 134, 146), 'ブラウン': (150, 96, 80)}

def trim(im, th=244):
    g = im.convert('L').point(lambda v: 0 if v >= th else 255); b = g.getbbox()
    return im.crop(b) if b and (b[2] - b[0]) * (b[3] - b[1]) > 0.3 * im.width * im.height else im

def white_bg(im):
    w, h = im.size; px = [im.getpixel((x, y)) for x in range(0, w, max(1, w // 40)) for y in (2, h - 3)] + [im.getpixel((x, y)) for y in range(0, h, max(1, h // 40)) for x in (2, w - 3)]
    return sum(sum(p) / 3 for p in px) / len(px) > 238

def raw(no, idx):
    fs = sorted(glob.glob(os.path.join(IMG, 'p%02d' % no, '*.jpg'))); im = Image.open(fs[idx]).convert('RGB')
    return im if white_bg(im) else trim(im)

def crop(im, how):
    w, h = im.size
    if not how or how == 'full': return im
    k, _, r = how.partition(':'); r = float(r) if r and ',' not in r else 0
    if k == 'left': return im.crop((0, 0, int(w * r), h))
    if k == 'top': return im.crop((0, int(h * r), w, h))
    if k == 'wm': return im.crop((0, int(h * 0.18), w, h))
    if k == 'leftwm': return im.crop((0, int(h * 0.18), int(w * r), h))
    if k == 'box':  # box:x0,y0,x1,y1（割合）
        x0, y0, x1, y1 = [float(v) for v in how[4:].split(',')]; return im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))
    raise ValueError(how)

def cover(im, W, H):
    if white_bg(im): return _wb(im, W, H)  # 白背景の切り抜き写真は切らずに全体を入れる
    w, h = im.size; s = max(W / w, H / h); im = im.resize((int(w * s + .5), int(h * s + .5)), Image.LANCZOS)
    x = (im.width - W) // 2; y = max(0, min(im.height - H, int((im.height - H) * 0.3)))
    return im.crop((x, y, x + W, y + H))

def _wb(im, W, H):
    t = trim(im, 250); c = Image.new('RGB', (W, H), (255, 255, 255)); s = min(W * 0.94 / t.width, H * 0.94 / t.height); t = t.resize((int(t.width * s), int(t.height * s)), Image.LANCZOS)
    c.paste(t, ((W - t.width) // 2, (H - t.height) // 2)); return c

def contain(im, W, H, bg):
    w, h = im.size; s = min(W / w, H / h); im = im.resize((int(w * s), int(h * s)), Image.LANCZOS)
    c = Image.new('RGB', (W, H), bg); c.paste(im, ((W - im.width) // 2, (H - im.height) // 2)); return c

def ename(n, size):
    return (EN_NAME[n], F(EN, size)) if n in EN_NAME else (n, F(JM, int(size * 0.8)))

def label(d, x, y, color, anchor='la'):
    t, f = ename(color, 44); d.text((x, y), t, font=f, fill=INK, anchor=anchor)
    d.text((x + (0 if anchor[0] == 'l' else 0), y + 58), '― ' + color + ' ―', font=F(JM, 24), fill=SUB, anchor=anchor)

def vtext(d, x, y, lines, size=30, gap=50):
    for i, ln in enumerate(lines): d.text((x, y + i * gap), ln, font=F(JML, size), fill=INK)

def page_photo(no, src, how, color, lines):
    im = crop(raw(no, src), how); w, h = im.size
    if w / h >= 0.8:  # ほぼ正方形 → 全面写真、左下に小さな色名プレート
        c = cover(im, S, S); ov = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
        bw = 360 if not lines else 470; d.rectangle((0, S - 200, bw, S), fill=(244, 238, 230, 225))
        c = Image.alpha_composite(c.convert('RGBA'), ov).convert('RGB'); d = ImageDraw.Draw(c)
        if color: label(d, 40, S - 175, color)
        if lines: d.text((40, S - 60), lines[0], font=F(JML, 24), fill=INK)
        return c
    c = Image.new('RGB', (S, S), BG); ph = cover(im, 560, S); c.paste(ph, (S - 560, 0)); d = ImageDraw.Draw(c)
    vtext(d, 50, 90, lines or [])
    if color: label(d, 50, S - 200, color)
    return c

def page_main(no, src, how, colors, sizes):
    c = cover(crop(raw(no, src), how), S, S); d = ImageDraw.Draw(c)
    ov = Image.new('RGBA', (S, S), (0, 0, 0, 0)); o = ImageDraw.Draw(ov)
    o.rounded_rectangle((S - 210, 30, S - 30, 120 + 66 * len(colors)), radius=20, fill=(255, 255, 255, 200))
    c = Image.alpha_composite(c.convert('RGBA'), ov).convert('RGB'); d = ImageDraw.Draw(c)
    d.text((S - 120, 75), ' / '.join(sizes), font=F(EN, 32 if len(sizes) <= 3 else 24), fill=INK, anchor='mm')
    for i, col in enumerate(colors):
        cy = 150 + 66 * i; d.ellipse((S - 145, cy - 22, S - 101, cy + 22), fill=SW.get(col, (200, 200, 200)), outline=LINE, width=2)
    return c

def page_colors(no, items, title='Color Variation'):
    c = Image.new('RGB', (S, S), BG); d = ImageDraw.Draw(c)
    d.rectangle((0, 0, S, 90), fill=BG2); d.text((S // 2, 45), title, font=F(EN, 40), fill=INK, anchor='mm')
    n = len(items); cols = 2 if n <= 4 else 3; rows = (n + cols - 1) // cols
    cw = S // cols; ch = (S - 110) // rows; ih = ch - 90
    for i, (src, how, name, sub) in enumerate(items):
        x = (i % cols) * cw; y = 110 + (i // cols) * ch
        c.paste(cover(crop(raw(no, src), how), cw - 30, ih), (x + 15, y))
        t, f = ename(name, 30 if cols <= 3 else 24); d.text((x + cw // 2, y + ih + 22), t, font=f, fill=INK, anchor='mm')
        d.text((x + cw // 2, y + ih + 58), sub or name, font=F(JM, 20), fill=SUB, anchor='mm')
    return c

def page_detail(no, items, title='Detail'):
    c = Image.new('RGB', (S, S), BG); d = ImageDraw.Draw(c)
    d.rectangle((0, 0, S, 90), fill=BG2); d.text((S // 2, 45), title, font=F(EN, 40), fill=INK, anchor='mm')
    n = len(items); cols = 2 if n >= 2 else 1; rows = (n + cols - 1) // cols; cw = S // cols; ch = (S - 110) // rows
    for i, (src, how, cap) in enumerate(items):
        x = (i % cols) * cw; y = 110 + (i // cols) * ch
        c.paste(cover(crop(raw(no, src), how), cw - 30, ch - 70), (x + 15, y))
        d.text((x + cw // 2, y + ch - 38), cap, font=F(JM, 26), fill=INK, anchor='mm')
    return c

def wrap(t, font, width, d):
    out, line = [], ''
    for ch in t:
        if d.textlength(line + ch, font=font) > width: out.append(line); line = ch
        else: line += ch
    if line: out.append(line)
    return out

def band(c, y, photo):
    if photo is None or S - y < 240: return c
    c.paste(cover(photo, S - 160, S - y - 60), (80, y + 20)); return c

def page_table(title, rows, note=None, photo=None):
    c = Image.new('RGB', (S, S), BG); d = ImageDraw.Draw(c)
    d.rectangle((0, 0, S, 90), fill=BG2); d.text((S // 2, 45), title, font=F(EN, 40), fill=INK, anchor='mm')
    y = 150
    for k, v in rows:
        d.text((80, y), k, font=F(JGB, 28), fill=SUB)
        ls = wrap(v, F(JG, 28), 560, d)
        for i, ln in enumerate(ls): d.text((330, y + i * 44), ln, font=F(JG, 28), fill=INK)
        y += max(1, len(ls)) * 44 + 34; d.line((80, y - 17, 920, y - 17), fill=LINE, width=1)
    if note:
        for i, ln in enumerate(wrap(note, F(JG, 22), 840, d)): d.text((80, y + 10 + i * 34), ln, font=F(JG, 22), fill=SUB)
        y += 10 + 34 * len(wrap(note, F(JG, 22), 840, d))
    return band(c, y + 10, photo)

def page_feel(thick, stretch, gloss=2, photo=None):
    c = Image.new('RGB', (S, S), BG); d = ImageDraw.Draw(c)
    d.rectangle((0, 0, S, 90), fill=BG2); d.text((S // 2, 45), 'Fabric', font=F(EN, 40), fill=INK, anchor='mm')
    for i, (name, lo, hi, v) in enumerate([('生地の厚み', '薄い', '厚い', thick), ('伸縮性', 'なし', 'あり', stretch), ('光沢', 'ひかえめ', 'あり', gloss)]):
        y = 220 + i * 230; d.text((120, y), name, font=F(JGB, 32), fill=INK)
        d.line((140, y + 100, 860, y + 100), fill=LINE, width=6)
        for k in range(5): x = 140 + k * 180; d.ellipse((x - 9, y + 91, x + 9, y + 109), fill=LINE)
        x = 140 + v * 180; d.ellipse((x - 22, y + 78, x + 22, y + 122), fill=(176, 120, 110))
        d.text((140, y + 150), lo, font=F(JG, 24), fill=SUB, anchor='mm'); d.text((860, y + 150), hi, font=F(JG, 24), fill=SUB, anchor='mm')
    return c

def build(mn, cfg):
    p = spec[mn]; no = p['no']; pages = []
    pages.append(page_main(no, *cfg['main'], cfg['colors'], cfg['sizes']))
    pages.append(page_colors(no, cfg['variation'], cfg.get('vtitle', 'Color Variation')))
    phr = cfg['phrases']; k = 0
    for src, how, color in cfg['photos']:
        lines = [phr[k % len(phr)], phr[(k + 1) % len(phr)]]; k += 2
        pages.append(page_photo(no, src, how, color, lines))
    for i in range(0, len(cfg['details']), 2): pages.append(page_detail(no, cfg['details'][i:i + 2]))
    ph = lambda i: crop(raw(no, cfg['photos'][i % len(cfg['photos'])][0]), cfg['photos'][i % len(cfg['photos'])][1])
    pages.append(page_table('Size', cfg['size'], cfg.get('sizenote'), ph(1)))
    pages.append(page_feel(*cfg['feel']))
    pages.append(page_table('Information', [('素材', p['material']), ('セット内容', p['set']), ('生産国', '中国'),
                                            ('お手入れ', '洗濯ネットに入れて手洗い、または弱水流で洗ってください。陰干ししてください。')],
                            'モニター環境により、実物と色味が異なって見える場合があります。海外製品のため、縫製やサイズに多少の個体差があります。', ph(2)))
    for i, im in enumerate(pages, 1): im.save(os.path.join(OUT, 'x%s-%02d.jpg' % (mn[-2:], i)), quality=90)
    return len(pages)

CFG = json.load(open(os.path.join(ROOT, 'rw-pages.json'), encoding='utf-8'))
for mn in (sys.argv[1:] or CFG.keys()):
    print(mn, build(mn, CFG[mn]))
