# 场景背景 + 实拍卡片 + 大字幕 的竖屏商品视频（1080×1920，30fps）。商品本体只用实拍图，背景是生成的场景图（无商品、无人、无字）。
#   apps/image-service/venv/Scripts/python.exe -I tools/product-video/scene_video.py tools/product-video/specs/<id>.scene.json
# spec: { id, out, sec, hook, cta, shots:[{bg, fg | grid:[{img,label}], caption}] }  路径相对 tools/product-video/out/<id>/
# 文字全部由代码渲染（游ゴシック Bold）。无音轨时加静音轨。BGM 另行合成。
import json, math, os, subprocess, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

spec = json.load(open(sys.argv[1], encoding='utf-8'))
W, H = spec.get('size', [1080, 1920]); FPS = 30
LAND = W > H
# 版式：卡片区（左上角 y、最大宽高）、字幕 y、标题 y。竖屏与横屏各一套。
L = dict(cy=150, cw=1560, ch=700, cap=905, hook=40, capsize=60, hooksize=50) if LAND else dict(cy=300, cw=960, ch=1130, cap=1610, hook=150, capsize=70, hooksize=58)
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), 'out', spec['id']))
SEC, XF = spec.get('sec', 3), 0.35            # 每镜秒数、转场秒数
FONT = 'C:/Windows/Fonts/YuGothB.ttc'
font = lambda s: ImageFont.truetype(FONT, s)
P = lambda p: os.path.join(ROOT, p)
ease = lambda x: 1 - (1 - min(1, max(0, x))) ** 3


def rounded(im, r):
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, im.size[0] - 1, im.size[1] - 1), r, fill=255)
    out = im.convert('RGBA'); out.putalpha(m); return out


def card(img, maxw, maxh, border=12, radius=40):
    """实拍图 → 白边圆角卡片 + 阴影。只缩放，不改内容。"""
    im = Image.open(P(img)).convert('RGB')
    k = min((maxw - 2 * border) / im.width, (maxh - 2 * border) / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    base = Image.new('RGB', (im.width + 2 * border, im.height + 2 * border), 'white'); base.paste(im, (border, border))
    c = rounded(base, radius)
    pad = 60
    sh = Image.new('RGBA', (c.width + 2 * pad, c.height + 2 * pad), (0, 0, 0, 0))
    a = Image.new('L', sh.size, 0); ImageDraw.Draw(a).rounded_rectangle((pad, pad + 14, pad + c.width, pad + c.height + 14), radius, fill=150)
    sh.putalpha(a.filter(ImageFilter.GaussianBlur(26)))
    sh.alpha_composite(c, (pad, pad)); return sh


def pill(text, size, fg=(255, 255, 255), bg=(20, 20, 24, 205), padx=44, pady=24, maxw=W - 80):
    f = font(size)
    while f.getlength(text) + 2 * padx > maxw and size > 30: size -= 2; f = font(size)
    l, t, r, b = f.getbbox(text)
    im = Image.new('RGBA', (round(f.getlength(text)) + 2 * padx, (b - t) + 2 * pady), (0, 0, 0, 0))
    d = ImageDraw.Draw(im); d.rounded_rectangle((0, 0, im.width - 1, im.height - 1), im.height // 2, fill=bg); d.text((padx, pady - t), text, font=f, fill=fg)
    return im


def fade(im, a):
    if a >= 0.999: return im
    out = im.copy(); out.putalpha(out.getchannel('A').point(lambda v: int(v * a))); return out


class Shot:
    def __init__(self, s, n, total):
        self.n, self.last = n, n == total - 1
        own = 'bg' not in s                                 # 没给背景：用画面自己放大虚化做底
        bg = Image.open(P(s.get('bg') or s['fg'])).convert('RGB')
        k = max(W * 1.12 / bg.width, H * 1.12 / bg.height)
        bg = bg.resize((round(bg.width * k), round(bg.height * k)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(s.get('blur', 28 if own else 5)))
        self.bg = Image.blend(bg, Image.new('RGB', bg.size, (0, 0, 0)), s.get('dim', 0.28 if own else 0.18))
        self.cards = []
        if 'grid' in s:                                     # 2×2：四个花色逐个出现
            cw, ch = 470, 520
            for i, g in enumerate(s['grid']):
                c = card(g['img'], cw, ch, border=10, radius=32)
                x = W // 2 + (-1 if i % 2 == 0 else 1) * (cw // 2 + 18) - c.width // 2
                y = 330 + (i // 2) * (ch + 90) + (ch - c.height + 120) // 2 - 60
                self.cards.append((c, x, y, 0.15 + i * 0.45))
                lb = pill(g['label'], 44, bg=(255, 255, 255, 235), fg=(40, 40, 46), padx=30, pady=14)
                self.cards.append((lb, W // 2 + (-1 if i % 2 == 0 else 1) * (cw // 2 + 18) - lb.width // 2, y + c.height - 70, 0.3 + i * 0.45))
        else:
            c = card(s['fg'], L['cw'], L['ch'])
            self.cards.append((c, (W - c.width) // 2, L['cy'] + (L['ch'] + 120 - c.height) // 2 - 60, 0.0))
        self.cap = pill(s['caption'], L['capsize']) if s.get('caption') else None
        self.hook = pill(spec['hook'], L['hooksize'], bg=(191, 0, 0, 235)) if n == 0 and spec.get('hook') else None
        self.cta = pill(spec['cta'], 54, bg=(255, 255, 255, 240), fg=(30, 30, 36)) if self.last and spec.get('cta') else None

    def frame(self, t):
        z = 1.12 - 0.07 * (t / SEC) if self.n % 2 else 1.05 + 0.07 * (t / SEC)       # 背景缓慢推/拉
        cw, ch = W * 1.12 / z, H * 1.12 / z
        cx, cy = self.bg.width / 2, self.bg.height / 2
        fr = self.bg.resize((W, H), Image.BILINEAR, box=(cx - cw / 2, cy - ch / 2, cx + cw / 2, cy + ch / 2)).convert('RGBA')
        for c, x, y, t0 in self.cards:
            a = ease((t - t0) / 0.45)
            if a <= 0: continue
            fr.alpha_composite(fade(c, a), (x, round(y + 40 * (1 - a))))
        if self.hook: fr.alpha_composite(fade(self.hook, ease(t / 0.4)), ((W - self.hook.width) // 2, L['hook']))
        cap_y = L['cap']
        if self.cap:
            a = ease((t - 0.25) / 0.4)
            if a > 0: fr.alpha_composite(fade(self.cap, a), ((W - self.cap.width) // 2, round(cap_y + 30 * (1 - a))))
        if self.cta:
            a = ease((t - 1.2) / 0.4)
            if a > 0: fr.alpha_composite(fade(self.cta, a), ((W - self.cta.width) // 2, cap_y + (95 if LAND else 150)))
        return fr.convert('RGB')


shots = [Shot(s, i, len(spec['shots'])) for i, s in enumerate(spec['shots'])]
total = len(shots) * SEC
out = P(spec.get('out', f"final/{spec['id']}-scene-9x16.mp4")); os.makedirs(os.path.dirname(out), exist_ok=True)
ff = subprocess.Popen(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                       '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p',
                       '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
for fi in range(round(total * FPS)):
    T = fi / FPS; i = min(int(T // SEC), len(shots) - 1); t = T - i * SEC
    fr = shots[i].frame(t)
    if i + 1 < len(shots) and t > SEC - XF:                # 转场：叠化到下一镜的第一帧
        fr = Image.blend(fr, shots[i + 1].frame(0), (t - (SEC - XF)) / XF)
    if T < 0.3: fr = Image.blend(Image.new('RGB', (W, H), 'black'), fr, T / 0.3)
    if T > total - 0.4: fr = Image.blend(fr, Image.new('RGB', (W, H), 'black'), (T - (total - 0.4)) / 0.4)
    ff.stdin.write(fr.tobytes())
ff.stdin.close(); ff.wait()
print('ok', out, round(total, 1), '秒', os.path.getsize(out), '字节')
