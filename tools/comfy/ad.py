# 广告图一条龙：本机 ComfyUI 出背景（Z-Image Turbo）→ 4x 放大 → 实拍图裁切/放大/抠图 → 合成 → 代码加字。
#   apps/image-service/venv/Scripts/python.exe -I tools/comfy/ad.py tools/comfy/ads/<id>.json [--redo bg|product|all]
# 输出（spec.dir 下，相对仓库根）：<id>-ad-2560x1440.jpg、<id>-ad-1280x720.jpg、<id>-ad-sq-1200.jpg、chk-*.jpg
# spec:
#   id, dir                         输出目录
#   bg: {prompt, seed?, mirror?}    背景提示词（英文；必须写 no people, no text, no logos, no products；前景要有放商品的台面）
#   product: {src, crop?, h?, h_sq?} 实拍图路径（相对仓库根）与裁切框 [x0,y0,x1,y1]；h / h_sq = 商品高度占画面高度的比例
#                                   （横版默认 0.68、正方形默认 0.45；横长的商品要调小）
#   brand, tag                      左上品牌块与品类名
#   head: [第1行, 第2行], sub        主标题两行、副标题
#   chips: [[大字, 小字], …]         事实标签（最多 3 个）
#   foot: [..]                      底部事实（最多 2 条）
#   foot_light?: true|"wide"|"sq"   底部文字用白字带阴影（文字不落在浅色台面上时；可只指定横版或正方形）
#   table?: 0.715                   台面上沿在背景高度的比例；sq_x?: 0.34 正方形版从背景横向哪里开始裁
# 中间文件（bg.png / bg-4x.png / prod-4x.png / prod-cut.png）已存在就跳过，要重做加 --redo。
import json, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
HERE = os.path.dirname(os.path.abspath(__file__))
S = json.load(open(sys.argv[1], encoding='utf-8'))
redo = sys.argv[sys.argv.index('--redo') + 1] if '--redo' in sys.argv else ''
D = os.path.join(ROOT, S['dir']); os.makedirs(D, exist_ok=True)
P = lambda n: os.path.join(D, n)
need = lambda n, k: redo in (k, 'all') or not os.path.exists(P(n))
run = lambda *a: subprocess.run([sys.executable, '-I', *a], check=True)
F = lambda s, b=True: ImageFont.truetype('C:/Windows/Fonts/YuGothB.ttc' if b else 'C:/Windows/Fonts/YuGothM.ttc', s)

if need('bg.png', 'bg'):
    run(os.path.join(HERE, 'zimage.py'), S['bg']['prompt'], P('bg.png'), '1920', '1088', str(S['bg'].get('seed', 1)))
    run(os.path.join(HERE, 'upscale.py'), P('bg.png'), P('bg-4x.png'))
if need('prod-cut.png', 'product'):
    im = Image.open(os.path.join(ROOT, S['product']['src'])).convert('RGB')
    if S['product'].get('crop'): im = im.crop(tuple(S['product']['crop']))
    im.save(P('prod-crop.png'))
    if max(im.size) < 1600: run(os.path.join(HERE, 'upscale.py'), P('prod-crop.png'), P('prod-4x.png'))
    else: im.save(P('prod-4x.png'))
    from rembg import remove, new_session
    cut = remove(Image.open(P('prod-4x.png')).convert('RGB'), session=new_session('birefnet-general'))
    cut.crop(cut.getbbox()).save(P('prod-cut.png'))

src = Image.open(P('bg-4x.png')).convert('RGB')
if S['bg'].get('mirror', True): src = ImageOps.mirror(src)     # 默认把主体光源移到右边，左边留给文字
CUT = Image.open(P('prod-cut.png')).convert('RGBA')
TB = S.get('table', 0.715)
chips, foot = S.get('chips', [])[:3], S.get('foot', [])[:2]


def compose(W, H, bg, k, square):
    """k = 字号倍率。横版：文字左、商品右。正方形：标题上、标签左、商品右下。"""
    bg = bg.convert('RGBA'); table = round(H * TB)
    a = Image.new('L', (W // 8, H // 8), 0); pa = a.load()      # 压暗层（低分辨率算再放大）
    for y in range(a.height):
        for x in range(a.width):
            fx, fy = x / a.width, y / a.height
            v = (200 * max(0, 1 - fy / 0.6) + 110 * max(0, 1 - fx / 0.55) * (fy < TB)) if square else 150 * max(0, 1 - fx / 0.62) ** 1.2
            pa[x, y] = int(min(215, v))
    bg.alpha_composite(Image.merge('RGBA', [Image.new('L', (W, H), 0)] * 3 + [a.resize((W, H), Image.BILINEAR)]))
    ph = round(H * (S['product'].get('h_sq', 0.45) if square else S['product'].get('h', 0.68))); cut = CUT.resize((round(CUT.width * ph / CUT.height), ph), Image.LANCZOS)
    base = table + round(H * (0.1375 if square else 0.128)); px, py = W - cut.width - round(W * 0.0625), base - ph
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((px + 40, base - 82, px + cut.width - 20, base + 13), fill=(0, 0, 0, 150))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(29))); bg.alpha_composite(cut, (px, py))
    d = ImageDraw.Draw(bg); x0 = round(130 * k) if square else 150
    def text(xy, s, f, fill=(255, 255, 255)):
        sd = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sd).text((xy[0], xy[1] + 6), s, font=f, fill=(0, 0, 0, 185))
        bg.alpha_composite(sd.filter(ImageFilter.GaussianBlur(11))); d.text(xy, s, font=f, fill=fill)
    ftext = text if S.get('foot_light') in (True, 'sq' if square else 'wide') else (lambda xy, s, f: d.text(xy, s, font=f, fill=(48, 32, 20)))   # 底部文字：落在深色/杂色背景上时用白字
    def fit(s, size, maxw):
        while d.textlength(s, font=F(size)) > maxw and size > 40: size -= 4
        return F(size)
    y = round(H * (0.054 if square else 0.118)); bs = round(72 * k) if square else 58
    bw = d.textlength(S['brand'], font=F(bs)) + bs * 1.3
    d.rounded_rectangle((x0, y, x0 + bw, y + bs * 1.4), 16, fill=(255, 255, 255))
    d.text((x0 + bw / 2, y + bs * 0.7), S['brand'], font=F(bs), fill=(20, 24, 40), anchor='mm')
    text((x0 + bw + 36, y + bs * 0.17), S.get('tag', ''), F(round(bs * 0.94)))
    hs = round(200 * k) if square else 150; maxw = (W - 2 * x0) if square else px - x0 + 120
    y += round(bs * 1.4) + round(hs * 0.42)
    for i, line in enumerate(S['head'][:2]):
        text((x0, y), line, fit(line, hs, maxw), fill=(255, 226, 150) if i else (255, 255, 255)); y += round(hs * 1.26)
    if S.get('sub'): text((x0, y + round(hs * 0.1)), S['sub'], fit(S['sub'], round(hs * 0.4), maxw), ); y += round(hs * 0.4) + round(hs * 0.1)
    y += round(hs * 0.45)
    if square:
        ch = min(200, max(120, (table - 60 - y) // max(1, len(chips)) - 26)); cw = px - x0 - 60
        for big, small in chips:
            d.rounded_rectangle((x0, y, x0 + cw, y + ch), 34, fill=(255, 255, 255, 240))
            d.text((x0 + 40, y + ch / 2), small, font=F(38), fill=(90, 96, 120), anchor='lm')
            d.text((x0 + cw - 40, y + ch / 2), big, font=fit(big, round(ch * 0.46), cw - 120 - d.textlength(small, font=F(38))), fill=(191, 0, 0), anchor='rm')
            y += ch + 26
        for i, s in enumerate(foot): ftext((x0, table + 150 + i * 100), '● ' + s, F(66))
    else:
        y = min(y, table - 215); x = x0
        for big, small in chips:
            w = max(d.textlength(big, font=F(76)), d.textlength(small, font=F(34))) + 80
            d.rounded_rectangle((x, y, x + w, y + 180), 30, fill=(255, 255, 255, 240))
            d.text((x + w / 2, y + 45), small, font=F(34), fill=(90, 96, 120), anchor='mm')
            d.text((x + w / 2, y + 120), big, font=F(76), fill=(191, 0, 0), anchor='mm'); x += w + 28
        if foot: ftext((x0, table + 75), ' ・ '.join(foot), F(48))
    return bg.convert('RGB')


wide = compose(2560, 1440, ImageOps.fit(src, (2560, 1440), Image.LANCZOS), 1, False)
wide.save(P(f"{S['id']}-ad-2560x1440.jpg"), quality=95, subsampling=0)
wide.resize((1280, 720), Image.LANCZOS).save(P(f"{S['id']}-ad-1280x720.jpg"), quality=93, subsampling=0)
x1 = min(round(src.width * S.get('sq_x', 0.34)), src.width - src.height)
sq = compose(2400, 2400, src.crop((x1, 0, x1 + src.height, src.height)).resize((2400, 2400), Image.LANCZOS), 1, True)
sq.resize((1200, 1200), Image.LANCZOS).save(P(f"{S['id']}-ad-sq-1200.jpg"), quality=93, subsampling=0)
t = wide.copy(); t.thumbnail((1280, 1280)); t.save(P('chk-wide.jpg'), quality=85)
t = sq.copy(); t.thumbnail((1000, 1000)); t.save(P('chk-sq.jpg'), quality=85)
c = Image.new('RGB', CUT.size, (40, 60, 120)); c.paste(CUT, (0, 0), CUT); c.thumbnail((900, 900)); c.save(P('chk-cut.jpg'))
print('ok', D)
