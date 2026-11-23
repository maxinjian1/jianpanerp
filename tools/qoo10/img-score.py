# 每张图算「白底程度」（四边 4% 边框内近白像素比例）和尺寸，输出 tools/qoo10/out/img-score.json
# 并生成主图总览 tools/qoo10/out/main-sheet-N.jpg（红框 = 边框非白）
import os, json, sys
from PIL import Image, ImageDraw
R='tools/qoo10/out/img'
def score(p):
    im=Image.open(p).convert('RGB'); w,h=im.size; s=im.resize((200,200)); px=s.load(); b=8; n=0; wh=0
    for y in range(200):
        for x in range(200):
            if x<b or y<b or x>=200-b or y>=200-b:
                n+=1; r,g,bl=px[x,y]
                if r>242 and g>242 and bl>242: wh+=1
    return round(wh/n,3), w, h
out={}
for mn in sorted(os.listdir(R)):
    out[mn]=[]
    for f in sorted(os.listdir(f'{R}/{mn}')):
        try: sc,w,h=score(f'{R}/{mn}/{f}')
        except Exception: sc,w,h=-1,0,0
        out[mn].append({'f':f,'white':sc,'w':w,'h':h})
json.dump(out,open('tools/qoo10/out/img-score.json','w'),indent=0)
mns=list(out); T=150; per=35; cols=7
for si in range(0,len(mns),per):
    chunk=mns[si:si+per]; rows=(len(chunk)+cols-1)//cols
    sheet=Image.new('RGB',(cols*T,rows*(T+14)),'white'); d=ImageDraw.Draw(sheet)
    for i,mn in enumerate(chunk):
        x=(i%cols)*T; y=(i//cols)*(T+14)
        im=Image.open(f'{R}/{mn}/01.jpg').convert('RGB'); im.thumbnail((T-4,T-4)); sheet.paste(im,(x+2,y+2))
        sc=out[mn][0]['white']
        if sc<0.9: d.rectangle([x,y,x+T-1,y+T-1],outline='red',width=2)
        d.text((x+3,y+T),f'{si+i+1} {mn[:14]} {sc}',fill='black')
    sheet.save(f'tools/qoo10/out/main-sheet-{si//per+1}.jpg',quality=80)
print(len(mns),'white>=0.9 main:',sum(1 for m in mns if out[m][0]['white']>=0.9),'small:',[m for m in mns if min(out[m][0]['w'],out[m][0]['h'])<600])
