#!/usr/bin/env python
"""画像のピクセル処理（Node のパイプラインから呼ばれる）。
  python imgtool.py thumbs  jobs.json   # [{src,out,max}] 縮小 JPEG（ビジョンモデル用）
  python imgtool.py crop    jobs.json   # [{src,out,box:[x0,y0,x1,y1] (0-1 の割合)}]
  python imgtool.py cutout  jobs.json   # [{src,out,box?}] 背景除去 → 透過 PNG（bbox で自動トリミング）
  python imgtool.py whitecheck jobs.json # [{src,out}] Amazon 主图の点検（サイズ・形式・外周の純白率・商品の占有率）→ out に JSON
"""
import json, sys, time
from PIL import Image

def load(p):
    im = Image.open(p); im.load(); return im

def thumbs(jobs):
    for j in jobs:
        im = load(j['src']).convert('RGB'); im.thumbnail((j.get('max', 768), j.get('max', 768)))
        im.save(j['out'], quality=85)

def crop(jobs):
    for j in jobs:
        im = load(j['src']).convert('RGB'); W, H = im.size; x0, y0, x1, y1 = j['box']
        im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H))).save(j['out'], quality=92)

def sheet(jobs):
    # [{files:[8 枚], out}] → 4×2 のコンタクトシート（プレビュー用、各 500px）
    for j in jobs:
        tiles = [load(f).convert('RGB').resize((500, 500)) for f in j['files']]
        cols = 4; rows = (len(tiles) + cols - 1) // cols
        im = Image.new('RGB', (cols * 500, rows * 500), '#888')
        for i, t in enumerate(tiles): im.paste(t, ((i % cols) * 500, (i // cols) * 500))
        im.save(j['out'], quality=85)

def whitecheck(jobs):
    for j in jobs:
        im = Image.open(j['src']); fmt = im.format; mode = im.mode; icc = bool(im.info.get('icc_profile')); W, H = im.size
        px = im.convert('RGB').load(); b = max(4, W // 100)
        border = [px[x, y] for x in range(W) for y in list(range(b)) + list(range(H - b, H))] + [px[x, y] for y in range(H) for x in list(range(b)) + list(range(W - b, W))]
        pure = sum(1 for c in border if c == (255, 255, 255)) / len(border)
        g = im.convert('L').point(lambda v: 255 if v < 245 else 0); bb = g.getbbox()
        ratio = max((bb[2] - bb[0]) / W, (bb[3] - bb[1]) / H) if bb else 0
        json.dump({'format': fmt, 'mode': mode, 'icc': icc, 'w': W, 'h': H, 'borderPureWhite': round(pure, 4), 'bbox': bb, 'longSideRatio': round(ratio, 3)}, open(j['out'], 'w'))

def cutout(jobs):
    try:  # onnxruntime-gpu 1.31 需要 CUDA 13 运行库（pip 的 onnxruntime-gpu[cuda,cudnn]），必须先 preload 否则静默回退 CPU（7s/张 vs GPU 约 0.5s）
        import onnxruntime as ort; ort.preload_dlls()
    except Exception as e:
        print('onnxruntime preload_dlls failed, CPU fallback:', e, file=sys.stderr)
    from rembg import remove, new_session
    try:
        s = new_session('birefnet-general')
    except Exception as e:  # モデル DL 失敗時のフォールバック
        print('birefnet unavailable, fallback isnet:', e, file=sys.stderr); s = new_session('isnet-general-use')
    for j in jobs:
        t = time.time(); im = load(j['src']).convert('RGB')
        if j.get('box'):
            W, H = im.size; x0, y0, x1, y1 = j['box']; im = im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
        out = remove(im, session=s, post_process_mask=True)
        bb = out.getbbox()
        if bb: out = out.crop(bb)
        out.save(j['out'])
        print(f"cutout {j['out']} {out.size} {time.time()-t:.1f}s", file=sys.stderr)

if __name__ == '__main__':
    cmd, jobfile = sys.argv[1], sys.argv[2]
    jobs = json.load(open(jobfile, encoding='utf-8'))
    {'thumbs': thumbs, 'crop': crop, 'cutout': cutout, 'sheet': sheet, 'whitecheck': whitecheck}[cmd](jobs)
    print(json.dumps({'done': len(jobs)}))
