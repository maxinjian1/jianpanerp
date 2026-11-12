"""楽天ページ用の画像を作る（用户 11-12：説明文は画像で、主画像に簡単な文字を）。
  apps/image-service/venv/Scripts/python.exe tools/sourcing-1688/rw-desc.py
入力：rw-spec.json、out/rakuten-pj/rw/<mn>-NN.jpg（rw-images.py の出力）
出力：out/c/u/wNN-m.jpg（主画像＝写真＋下部の帯に2行の文字、帯は画像の約16%＝楽天の文字20%以内・枠線なし）
      out/c/u/wNN-p.jpg（POINT 画像）/ wNN-c.jpg（カラー・タイプ一覧）/ wNN-s.jpg（商品情報）
"""
import json, os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
RW = os.path.join(ROOT, 'out', 'rakuten-pj', 'rw'); OUT = os.path.join(ROOT, 'out', 'c', 'u')
spec = json.load(open(os.path.join(ROOT, 'rw-spec.json'), encoding='utf-8'))
F = lambda name, size: ImageFont.truetype('C:/Windows/Fonts/' + name, size)
GB, GM, MB = 'YuGothB.ttc', 'YuGothM.ttc', 'yumindb.ttf'
INK = (70, 52, 52); ROSE = (176, 112, 112); BG = (250, 246, 242)

# 主画像の文字（2行）と元写真、カラー/タイプ一覧（表示名 → rw の画像番号）
CFG = {
    'rw1688-01': (['とろみサテン', '胸パッド付き'], '01', [('ピンク', '03'), ('ベージュ', '06')]),
    'rw1688-02': (['光沢サテン', '単品 / ガウンセット'], '01', [('ブラック', '02'), ('ワインレッド', '03'), ('パープル', '04'), ('ピンク', '05'), ('ガウン ブラック', '06'), ('ガウン ワインレッド', '07')]),
    'rw1688-04': (['ドット柄', '単品 / ガウンセット'], '02', [('キャミワンピース単品', '05'), ('ガウンセット', '06')]),
    'rw1688-09': (['胸パッド付き', 'バックオープン'], '01', [('シャンパン', '03'), ('ワインレッド', '02')]),
    'rw1688-11': (['レース × サテン', '単品 / ガウンセット'], '01', [('ホワイト', '06'), ('ブラック', '07'), ('ガウンセット', '02')]),
    'rw1688-12': (['背中クロス', 'ワンピース / ガウン'], '01', [('ワンピース ピンク', '05'), ('ワンピース ブラック', '03'), ('ワンピース ワインレッド', '04'), ('ガウン ブラック', '06'), ('ガウン ワインレッド', '07'), ('ガウン グレー', '08')]),
    'rw1688-13': (['立体リボン', '単品 / ガウンセット'], '01', [('ライトピンク', '02'), ('ブラック', '03'), ('ラベンダー', '04'), ('クリーム', '05')]),
    'rw1688-14': (['ちょうちょプリント', '単品 / ガウンセット'], '01', [('キャミワンピース単品', '02'), ('ガウンセット', '03')]),
    'rw1688-16': (['襟付き 前開き', '長袖サテン上下'], '01', [('ピンク', '08'), ('ブラック', '06'), ('ブルー', '07'), ('ホワイト', '09')]),
}

def ctext(d, xy, t, font, fill, anchor='mm'): d.text(xy, t, font=font, fill=fill, anchor=anchor)

def main_img(mn, lines, src):
    im = Image.open(os.path.join(RW, f'{mn}-{src}.jpg')).convert('RGB').resize((1000, 1000))
    ov = Image.new('RGBA', (1000, 1000), (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    d.rectangle((0, 840, 1000, 1000), fill=(255, 255, 255, 215))  # 帯 16%
    im = Image.alpha_composite(im.convert('RGBA'), ov); d = ImageDraw.Draw(im)
    ctext(d, (500, 893), lines[0], F(MB, 58), INK); ctext(d, (500, 960), lines[1], F(GM, 36), ROSE)
    return im.convert('RGB')

def wrap(t, font, width, d):
    out, line = [], ''
    for ch in t:
        if d.textlength(line + ch, font=font) > width: out.append(line); line = ch
        else: line += ch
    if line: out.append(line)
    return out

def point_img(p, photo):
    W, H = 1000, 1560; im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
    ph = Image.open(os.path.join(RW, f"{p['mn']}-{photo}.jpg")).convert('RGB').resize((1000, 1000)); im.paste(ph, (0, 0))
    y = 1050
    for ln in wrap(p['tagline'], F(MB, 40), 880, d): ctext(d, (500, y), ln, F(MB, 40), INK); y += 56
    y += 20
    for i, pt in enumerate(p['points'], 1):
        d.rounded_rectangle((60, y - 4, 210, 44 + y), radius=22, fill=ROSE); ctext(d, (135, y + 20), f'POINT {i}', F(GB, 24), 'white')
        ls = wrap(pt, F(GM, 30), 700, d)
        for k, ln in enumerate(ls): d.text((235, y + 2 + k * 44), ln, font=F(GM, 30), fill=INK)
        y += max(1, len(ls)) * 44 + 34
    return im.crop((0, 0, W, min(H, y + 30)))

def color_img(mn, items):
    n = len(items); cols = 2 if n <= 4 else 3; rows = (n + cols - 1) // cols; cw = 1000 // cols
    W, H = 1000, 130 + rows * (cw + 70); im = Image.new('RGB', (W, H), 'white'); d = ImageDraw.Draw(im)
    ctext(d, (500, 65), 'COLOR / TYPE', F(MB, 44), INK)
    for i, (label, nn) in enumerate(items):
        x = (i % cols) * cw; y = 130 + (i // cols) * (cw + 70)
        t = Image.open(os.path.join(RW, f'{mn}-{nn}.jpg')).convert('RGB').resize((cw - 20, cw - 20)); im.paste(t, (x + 10, y))
        ctext(d, (x + cw // 2, y + cw + 18), label, F(GM, 30 if cols == 2 else 26), INK)
    return im

def spec_img(p):
    W = 1000; im = Image.new('RGB', (W, 1200), BG); d = ImageDraw.Draw(im)
    ctext(d, (500, 80), '商品情報', F(MB, 50), INK); d.line((80, 140, 920, 140), fill=ROSE, width=2)
    y = 180
    rows = [('素材', p['material']), ('セット内容', p['set']), ('サイズ', p['sizeNote']), ('お手入れ', '洗濯ネットに入れて手洗い、または弱水流での洗濯をおすすめします。陰干ししてください。'), ('生産国', '中国'), ('ご注意', 'モニター環境により実物と色味が異なって見える場合があります。海外製品のため縫製・サイズに多少の個体差がございます。')]
    for label, val in rows:
        d.text((80, y), label, font=F(GB, 30), fill=ROSE)
        ls = wrap(val, F(GM, 28), 620, d)
        for k, ln in enumerate(ls): d.text((300, y + k * 42), ln, font=F(GM, 28), fill=INK)
        y += max(1, len(ls)) * 42 + 30; d.line((80, y - 14, 920, y - 14), fill=(225, 210, 205), width=1)
    return im.crop((0, 0, W, y + 30))

for p in spec['products']:
    mn = p['mn']; nn = mn[-2:]; lines, src, items = CFG[mn]
    main_img(mn, lines, src).save(os.path.join(OUT, f'w{nn}-m.jpg'), quality=90)
    point_img(p, '02' if src == '01' else '01').save(os.path.join(OUT, f'w{nn}-p.jpg'), quality=88)
    color_img(mn, items).save(os.path.join(OUT, f'w{nn}-c.jpg'), quality=88)
    spec_img(p).save(os.path.join(OUT, f'w{nn}-s.jpg'), quality=90)
    print(mn)
