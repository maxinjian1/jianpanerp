# 需要换主图的商品：把自己图片里「白底程度高」的候选排成一行，供人工挑选
import json, sys
from PIL import Image, ImageDraw
sc=json.load(open('tools/qoo10/out/img-score.json'))
TEXT='a-01-2 ad189 banz-005 c-60 dsld-7 e-06 e-08 e-08-1 hoop-2set lecoco260902 ny591 sg075 xb-03 yjc-073 djdgh-05 cdl-01 rw1688-01 rw1688-13 rw1688-14 tanjm-ghc tanjm-ghf'.split()
need=[m for m in sc if m!='zsz' and (sc[m][0]['white']<0.9 or m in TEXT)]
T=120; N=9; per=24
json.dump(need,open('tools/qoo10/out/need.json','w'))
for si in range(0,len(need),per):
    chunk=need[si:si+per]
    sheet=Image.new('RGB',(90+N*T,len(chunk)*(T+4)),'white'); d=ImageDraw.Draw(sheet)
    for r,mn in enumerate(chunk):
        y=r*(T+4); d.text((2,y+4),mn[:14],fill='black')
        c=[x for x in sc[mn][1:] if x['white']>=0.93]
        c=sorted(c,key=lambda x:-x['white'])[:N]
        c=sorted(c,key=lambda x:x['f'])
        d.text((2,y+20),f'{len(c)}/{len(sc[mn])}',fill='gray')
        for i,x in enumerate(c):
            im=Image.open(f'tools/qoo10/out/img/{mn}/{x["f"]}').convert('RGB'); im.thumbnail((T-2,T-14)); sheet.paste(im,(90+i*T,y))
            d.text((90+i*T+2,y+T-12),x['f'][:2],fill='red')
        d.line([0,y+T+2,90+N*T,y+T+2],fill='#ccc')
    sheet.save(f'tools/qoo10/out/cand-{si//per+1}.jpg',quality=78)
print(len(need),'none:',[m for m in need if not [x for x in sc[m][1:] if x['white']>=0.93]])
