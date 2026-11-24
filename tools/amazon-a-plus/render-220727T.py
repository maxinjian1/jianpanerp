# SALONCARE 220727T サテンスリップ A+ 画像（参考：260903 の A+ と同じ構成）
# 底図 = Gemini（base/*.png）、文字・サイズ表はコードで描く。
#   apps/image-service/venv/Scripts/python.exe tools/amazon-a-plus/render-220727T.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

D = Path(__file__).parent / 'out' / '220727T'
B = D / 'base'
SANS = 'C:/Windows/Fonts/NotoSansJP-VF.ttf'
SERIF = 'C:/Windows/Fonts/yumindb.ttf'
ROSE, INK, GREY = (176, 62, 96), (40, 36, 38), (95, 88, 90)


def font(p, size, wght=None):
    f = ImageFont.truetype(p, size)
    if wght:
        try: f.set_variation_by_axes([wght])
        except Exception: pass
    return f


def fit(name, w, h, anchor=0.0):
    """比率を合わせて切り抜き（anchor: 縦方向 0=上 / 0.5=中央、横は中央）"""
    im = Image.open(B / name).convert('RGB')
    r, R = im.width / im.height, w / h
    if r > R:
        nw = int(im.height * R); x = (im.width - nw) // 2
        im = im.crop((x, 0, x + nw, im.height))
    else:
        nh = int(im.width / R); y = int((im.height - nh) * anchor)
        im = im.crop((0, y, im.width, y + nh))
    return im.resize((w, h), Image.LANCZOS)


def save(im, name):
    im.save(D / name, quality=92)
    print(name, im.size)


def leaf(d, x, y, s=1.0, flip=False):
    """参考 A+ にある細い葉の飾り"""
    k = -1 if flip else 1
    d.line([(x, y), (x + k * 70 * s, y - 50 * s)], fill=(214, 150, 170), width=2)
    for i in range(1, 5):
        cx, cy = x + k * 15 * i * s, y - 11 * i * s
        d.ellipse([cx - 9 * s, cy - 16 * s, cx + 3 * s, cy - 4 * s], outline=(214, 150, 170), width=2)


def text_card(name, out, l1, l2, sub):
    """左に明朝の 2 行コピー（参考 A+ の「なめらかな肌ざわり」形式）"""
    im = fit(name, 1300, 700, 0.5)
    d = ImageDraw.Draw(im, 'RGBA')
    d.rectangle([0, 0, 560, 700], fill=(255, 244, 246, 150))
    f1, f2, f3 = font(SERIF, 92), font(SERIF, 92), font(SERIF, 36)
    d.text((90, 190), l1, font=f1, fill=ROSE)
    d.text((90, 310), l2, font=f2, fill=INK)
    d.line([(95, 440), (430, 440)], fill=(200, 150, 165), width=2)
    for i, s in enumerate(sub):
        d.text((95, 465 + i * 52), s, font=f3, fill=GREY)
    save(im.resize((650, 350), Image.LANCZOS), out)
    return im


# M1 / M3：テキストはモジュール側（画像は文字なし）
save(fit('hero.png', 1464, 600, 0.0), 'A01-pc.jpg')
save(fit('cardigan.png', 1464, 600, 0.0), 'A03-pc.jpg')
# M2：細部 2 枚（文字なし）
save(fit('strap.png', 650, 350, 0.3), 'A02a.jpg')
save(fit('hem.png', 650, 350, 0.6), 'A02b.jpg')
# M4：生地 2 枚（明朝コピー入り）
text_card('fabric.png', 'A04a.jpg', 'なめらかな', '肌ざわり', ['さらりと、', '心地よいサテン生地。'])
text_card('drape.png', 'A04b.jpg', '上品な光沢と', 'ドレープ感', ['美しく流れる', 'シルエット。'])

# M5：サイズ & カラー
im = fit('two.png', 1464, 600, 0.0)
d = ImageDraw.Draw(im, 'RGBA')
d.rectangle([0, 0, 800, 600], fill=(255, 244, 246, 190))
ft = font(SERIF, 50)
t1, t2 = 'サイズ&', 'カラーバリエーション'
w1 = d.textlength(t1, font=ft); w2 = d.textlength(t2, font=ft)
x0 = (800 - w1 - w2) / 2
d.text((x0, 26), t1, font=ft, fill=ROSE); d.text((x0 + w1, 26), t2, font=ft, fill=INK)
fs = font(SANS, 21, 500)
s = 'お好みに合わせて選べる 5 カラー'
d.text(((800 - d.textlength(s, font=fs)) / 2, 92), s, font=fs, fill=GREY)

rows = [('サイズ', 'S', 'M', 'L', 'XL'), ('フロント丈', '74', '76', '78', '80'), ('バック丈', '62', '63', '64', '65'),
        ('バスト', '90', '94', '100', '106'), ('ウエスト', '88', '92', '98', '104'),
        ('適応身長', '150〜155', '155〜160', '160〜165', '165〜170')]
tx, ty, cw0, cw, rh = 60, 140, 170, 128, 46
d.rounded_rectangle([tx - 12, ty - 12, tx + cw0 + cw * 4 + 12, ty + rh * len(rows) + 12], 14, fill=(255, 255, 255, 235))
fb, fn = font(SANS, 22, 700), font(SANS, 22, 400)
for r, row in enumerate(rows):
    y = ty + r * rh
    if r == 0: d.rectangle([tx, y, tx + cw0 + cw * 4, y + rh], fill=(250, 222, 230))
    d.line([(tx, y + rh), (tx + cw0 + cw * 4, y + rh)], fill=(240, 205, 215), width=1)
    for c, v in enumerate(row):
        x = tx if c == 0 else tx + cw0 + (c - 1) * cw
        w = cw0 if c == 0 else cw
        f = fb if (r == 0 or c == 0) else fn
        d.text((x + (w - d.textlength(v, font=f)) / 2, y + 9), v, font=f, fill=INK)
for c in range(5):
    x = tx + (0 if c == 0 else cw0 + (c - 1) * cw)
    d.line([(x, ty), (x, ty + rh * len(rows))], fill=(240, 205, 215), width=1)
d.rectangle([tx, ty, tx + cw0 + cw * 4, ty + rh * len(rows)], outline=(240, 205, 215), width=1)
fx = font(SANS, 16, 400)
d.text((tx, ty + rh * len(rows) + 20), '単位：cm　※平置き採寸のため、1〜3cm 程度の誤差が生じる場合がございます。', font=fx, fill=GREY)

chips = [('ホワイト', (255, 255, 255)), ('ブラック', (34, 34, 34)), ('ブルー', (31, 42, 92)), ('ピンク', (246, 207, 214)), ('パープル', (106, 30, 90))]
cy = 500
for i, (n, col) in enumerate(chips):
    cx = 110 + i * 150
    d.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], fill=col, outline=(205, 170, 180), width=2)
    d.text((cx - d.textlength(n, font=fx) / 2, cy + 34), n, font=fx, fill=INK)
d.text((tx, 566), '※カラーによりサイズ展開が異なります。', font=fx, fill=GREY)
save(im, 'A05-pc.jpg')

# プレビュー（参考 A+ のデスクトップ表示と同じ並び）
TXT = [
    ('なめらかサテンのスリップ', '前も後ろもすっきり、\n上品なシルエット',
     '光沢のあるサテン生地を使った V ネックのスリップ。細い肩ひもと裾の\nピコレースで、シンプルながら女性らしい印象に。ルームウェアにも、\nワンピースのインナーにも。'),
    ('インナーとしても活躍', '羽織りものやワンピースの\n下に、一枚で',
     'すべりのよいサテン生地で、トップスやワンピースのインナーとしても\nおすすめ。カーディガンを羽織れば、おうち時間のリラックススタイルに。'),
    ('サイズとカラーをチェック', 'お好みに合わせて選べる\nサイズ & 5 カラー',
     'S・M・L・XL の 4 サイズ。カラーはホワイト、ブラック、ブルー、ピンク、\nパープルの 5 色。ご購入前にサイズ表をご確認ください。'),
]
CAP = [('長さを調節できる肩ひも', 'アジャスター付きで、お好みの長さに調節できます。'),
       ('裾のピコレース', '裾に繊細なレースをあしらい、シンプルなデザインに上品なアクセントを。'),
       ('なめらかな肌ざわり', '軽くてさらりとしたサテン生地。リラックスタイムを心地よく過ごせます。'),
       ('上品な光沢と美しいドレープ感', '光沢のある生地が自然に流れ、エレガントな印象に。')]
W = 1464
pv = Image.new('RGB', (W, 3000), 'white'); p = ImageDraw.Draw(pv)
fS, fT, fB, fC = font(SANS, 20, 700), font(SANS, 38, 800), font(SANS, 19, 400), font(SANS, 24, 700)


def half(y, img, t):
    im2 = Image.open(D / img).resize((760, 311), Image.LANCZOS) if img != 'A05-pc.jpg' else Image.open(D / img).resize((760, 311), Image.LANCZOS)
    pv.paste(im2, (W - 760 - 20, y))
    p.text((70, y + 60), t[0], font=fS, fill=INK)
    p.multiline_text((70, y + 92), t[1], font=fT, fill=INK, spacing=6)
    p.multiline_text((70, y + 205), t[2], font=fB, fill=INK, spacing=8)
    return y + 311 + 70


def pair(y, a, b, ca, cb):
    for i, (img, c) in enumerate(((a, ca), (b, cb))):
        x = 40 + i * 722
        pv.paste(Image.open(D / img), (x, y))
        p.text((x, y + 365), c[0], font=fC, fill=INK)
        p.text((x, y + 402), c[1], font=fB, fill=INK)
    return y + 350 + 150


y = 30
y = half(y, 'A01-pc.jpg', TXT[0])
y = pair(y, 'A02a.jpg', 'A02b.jpg', CAP[0], CAP[1])
y = half(y, 'A03-pc.jpg', TXT[1])
y = pair(y, 'A04a.jpg', 'A04b.jpg', CAP[2], CAP[3])
y = half(y, 'A05-pc.jpg', TXT[2])
save(pv.crop((0, 0, W, y)), 'preview-pc.jpg')
