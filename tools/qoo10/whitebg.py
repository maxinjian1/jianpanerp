# Qoo10 主图：抠出主体（rembg BiRefNet，商品像素不改）放到纯白 800×800 上
# 用法: python tools/qoo10/whitebg.py            → 对 out/need.json 里每个商品的 01.jpg 生成 out/white/<mn>.jpg + 前后对比 out/white-sheet-N.jpg
#       SRC 覆盖: out/white-src.json {"mn":"03.jpg"} 指定用哪张图
import json, os, sys, io
from PIL import Image, ImageDraw
from rembg import remove, new_session
need=json.load(open('tools/qoo10/out/need.json'))
src=json.load(open('tools/qoo10/out/white-src.json')) if os.path.exists('tools/qoo10/out/white-src.json') else {}
only=set(sys.argv[1].split(',')) if len(sys.argv)>1 else None
os.makedirs('tools/qoo10/out/white',exist_ok=True)
try: s=new_session('birefnet-general')
except Exception: s=new_session('isnet-general-use')
done=[]
for mn in need:
    if only and mn not in only: continue
    f=src.get(mn,'01.jpg')
    if f=='skip': continue
    im=Image.open(f'tools/qoo10/out/img/{mn}/{f}').convert('RGB')
    cut=remove(im,session=s)
    a=cut.split()[3].point(lambda v:255 if v>24 else 0); bb=a.getbbox()
    if not bb: continue
    cut=cut.crop(bb); w,h=cut.size; k=min(720/w,720/h); cut=cut.resize((max(1,int(w*k)),max(1,int(h*k))),Image.LANCZOS)
    bg=Image.new('RGB',(800,800),'white'); bg.paste(cut,((800-cut.size[0])//2,(800-cut.size[1])//2),cut)
    bg.save(f'tools/qoo10/out/white/{mn}.jpg',quality=92); done.append((mn,f))
T=150; per=24
for si in range(0,len(done),per):
    ch=done[si:si+per]; cols=4; rows=(len(ch)+cols-1)//cols
    sh=Image.new('RGB',(cols*(2*T+10),rows*(T+16)),'#888'); d=ImageDraw.Draw(sh)
    for i,(mn,f) in enumerate(ch):
        x=(i%cols)*(2*T+10); y=(i//cols)*(T+16)
        a=Image.open(f'tools/qoo10/out/img/{mn}/{f}').convert('RGB'); a.thumbnail((T,T)); sh.paste(a,(x,y))
        b=Image.open(f'tools/qoo10/out/white/{mn}.jpg'); b.thumbnail((T,T)); sh.paste(b,(x+T+2,y))
        d.text((x+2,y+T+2),f'{mn} {f[:2]}',fill='white')
    sh.save(f'tools/qoo10/out/white-sheet-{si//per+1}.jpg',quality=80)
print('done',len(done))
