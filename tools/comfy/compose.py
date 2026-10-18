#!/usr/bin/env python
"""ComfyUI 改图用的像素工具（Node 的 run.mjs 调用；商品本体的像素由这里保护）。
  python compose.py mask      jobs.json  # [{src,out}]            BiRefNet 商品遮罩（白=商品）
  python compose.py textmask  jobs.json  # [{src,mask,out}]       RapidOCR 找字 → 去掉商品区域 → 膨胀 → 文字遮罩（白=要擦）
  python compose.py pad       jobs.json  # [{src,out,maskout,size}] 不裁剪：补成正方形；背景是纯色就用边缘色补（maskout 为空），否则输出待补画区域遮罩
  python compose.py prep_bg   jobs.json  # [{src,mask,out,maskout,size}] 商品居中放到正方形中性灰底上 + 背景区域遮罩（白=要生成）
  python compose.py composite jobs.json  # [{bg,orig,mask,out,feather}] 把原图商品像素贴回生成图（商品绝不被 AI 改动）
  python compose.py sheet     jobs.json  # [{rows:[[before,after],...], out, labels}] 前后对比联络表
"""
import json, sys
from PIL import Image, ImageFilter, ImageOps, ImageDraw, ImageStat

def load(p): im = Image.open(p); im.load(); return im

def mask(jobs):
    try:
        import onnxruntime as ort; ort.preload_dlls()
    except Exception as e: print('preload_dlls:', e, file=sys.stderr)
    from rembg import remove, new_session
    try: s = new_session('birefnet-general')
    except Exception: s = new_session('isnet-general-use')
    for j in jobs:
        im = load(j['src']).convert('RGB')
        m = remove(im, session=s, only_mask=True, post_process_mask=True)
        m.convert('L').save(j['out'])

def textmask(jobs):
    from rapidocr_onnxruntime import RapidOCR
    ocr = RapidOCR()
    for j in jobs:
        im = load(j['src']).convert('RGB'); W, H = im.size
        prod = load(j['mask']).convert('L').resize((W, H)) if j.get('mask') else None
        res, _ = ocr(j['src'])
        m = Image.new('L', (W, H), 0); d = ImageDraw.Draw(m); n = 0
        for box, txt, score in (res or []):
            if score < 0.5: continue
            xs = [p[0] for p in box]; ys = [p[1] for p in box]; pad = max(4, int(0.15 * (max(ys) - min(ys))))
            d.rectangle([min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad], fill=255); n += 1
        if prod is not None:  # 商品上印的字（logo/型号）不擦：从文字遮罩里减去商品区域
            core = prod.point(lambda v: 255 if v > 200 else 0).filter(ImageFilter.MinFilter(9))
            m = Image.composite(Image.new('L', (W, H), 0), m, core)
        m = m.filter(ImageFilter.MaxFilter(7))
        m.save(j['out']); print(json.dumps({'textmask': j['out'], 'boxes': n, 'area': sum(1 for v in m.getdata() if v > 0) / (W * H)}))

def _uniform_edge(im):
    W, H = im.size; strip = 6
    edges = [im.crop((0, 0, W, strip)), im.crop((0, H - strip, W, H)), im.crop((0, 0, strip, H)), im.crop((W - strip, 0, W, H))]
    stats = [ImageStat.Stat(e) for e in edges]
    mean = [sum(s.mean[c] for s in stats) / 4 for c in range(3)]
    dev = max(max(s.stddev) for s in stats)
    return tuple(int(v) for v in mean), dev

def pad(jobs):
    for j in jobs:
        im = load(j['src']).convert('RGB'); W, H = im.size; S = max(W, H, j.get('size', 1600)) if j.get('upto') else max(W, H)
        color, dev = _uniform_edge(im)
        canvas = Image.new('RGB', (S, S), color); ox, oy = (S - W) // 2, (S - H) // 2; canvas.paste(im, (ox, oy))
        out = canvas.resize((j.get('size', 1600),) * 2, Image.LANCZOS) if j.get('size') else canvas
        out.save(j['out'], quality=95)
        if dev < 12 or W == H:  # 纯色背景或本来就是正方形：不需要 AI
            print(json.dumps({'pad': j['out'], 'needs_outpaint': False, 'edge_dev': dev})); continue
        m = Image.new('L', (S, S), 255); m.paste(Image.new('L', (W, H), 0), (ox, oy))
        m = m.filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(6))
        if j.get('size'): m = m.resize((j['size'],) * 2)
        m.save(j['maskout']); print(json.dumps({'pad': j['out'], 'needs_outpaint': True, 'edge_dev': dev}))

def prep_bg(jobs):
    for j in jobs:
        im = load(j['src']).convert('RGB'); m = load(j['mask']).convert('L').resize(im.size)
        bb = m.point(lambda v: 255 if v > 30 else 0).getbbox() or (0, 0, *im.size)
        prod = im.crop(bb); pm = m.crop(bb); S = j.get('size', 1024); scale = j.get('scale', 0.72)
        r = min(S * scale / prod.width, S * scale / prod.height); nw, nh = max(1, int(prod.width * r)), max(1, int(prod.height * r))
        prod = prod.resize((nw, nh), Image.LANCZOS); pm = pm.resize((nw, nh), Image.LANCZOS)
        ox, oy = (S - nw) // 2, int((S - nh) * j.get('vpos', 0.55))
        canvas = Image.new('RGB', (S, S), (128, 128, 128)); canvas.paste(prod, (ox, oy), pm)
        full = Image.new('L', (S, S), 0); full.paste(pm, (ox, oy))
        canvas.save(j['out'], quality=95); full.save(j['prodmask'])
        ImageOps.invert(full.filter(ImageFilter.MaxFilter(5))).save(j['maskout'])  # 白=背景要生成

def composite(jobs):
    for j in jobs:
        orig = load(j['orig']).convert('RGB')
        bg = load(j['bg']).convert('RGB').resize(orig.size) if j.get('bg') else Image.new('RGB', orig.size, tuple(j.get('bgcolor', [255, 255, 255])))
        m = load(j['mask']).convert('L').resize(orig.size)
        if j.get('shadow'):  # 白底主图：在商品下方加一层很淡的接地阴影，避免「抠图贴纸感」
            sh = m.filter(ImageFilter.GaussianBlur(18)).point(lambda v: int(v * 0.22))
            off = Image.new('L', orig.size, 0); off.paste(sh, (0, int(orig.size[1] * 0.012)))
            bg = Image.composite(Image.new('RGB', orig.size, (90, 90, 90)), bg, off)
        Image.composite(orig, bg, m.filter(ImageFilter.GaussianBlur(j.get('feather', 1.5)))).save(j['out'], quality=95)

def sheet(jobs):
    for j in jobs:
        T = 520; rows = j['rows']; im = Image.new('RGB', (T * 2 + 30, len(rows) * (T + 34) + 10), 'white'); d = ImageDraw.Draw(im)
        for i, (a, b) in enumerate(rows):
            y = 10 + i * (T + 34)
            for k, p in enumerate((a, b)):
                t = ImageOps.contain(load(p).convert('RGB'), (T, T)); x = 10 + k * (T + 10)
                im.paste(t, (x + (T - t.width) // 2, y + (T - t.height) // 2))
            lab = (j.get('labels') or [''] * len(rows))[i]
            d.text((12, y + T + 6), f'BEFORE  |  AFTER   {lab}'[:120], fill=(60, 60, 60))
        im.save(j['out'], quality=85)

if __name__ == '__main__':
    cmd, f = sys.argv[1], sys.argv[2]
    jobs = json.load(open(f, encoding='utf-8'))
    {'mask': mask, 'textmask': textmask, 'pad': pad, 'prep_bg': prep_bg, 'composite': composite, 'sheet': sheet}[cmd](jobs)
