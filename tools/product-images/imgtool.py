#!/usr/bin/env python
"""画像のピクセル処理（Node のパイプラインから呼ばれる）。
  python imgtool.py thumbs  jobs.json   # [{src,out,max}] 縮小 JPEG（ビジョンモデル用）
  python imgtool.py crop    jobs.json   # [{src,out,box:[x0,y0,x1,y1] (0-1 の割合)}]
  python imgtool.py cutout  jobs.json   # [{src,out,box?}] 背景除去 → 透過 PNG（bbox で自動トリミング）
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

def cutout(jobs):
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
    {'thumbs': thumbs, 'crop': crop, 'cutout': cutout, 'sheet': sheet}[cmd](jobs)
    print(json.dumps({'done': len(jobs)}))
