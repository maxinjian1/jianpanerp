# -*- coding: utf-8 -*-
from PIL import Image,ImageDraw,ImageFont
F='C:/Windows/Fonts/NotoSansJP-VF.ttf'; D='tools/rakuten/out/xmas/'
def font(sz,w=700):
    f=ImageFont.truetype(F,sz)
    try: f.set_variation_by_axes([w])
    except Exception: pass
    return f
RED=(170,30,30); INK=(40,40,40); W=1200
im=Image.new('RGB',(W,W),(251,246,236)); d=ImageDraw.Draw(im)
t='選べる組み合わせ'; f=font(64); d.text(((W-d.textlength(t,font=f))/2,30),t,font=f,fill=RED)
def head(y,t): d.rounded_rectangle((40,y,W-40,y+56),radius=10,fill=RED); d.text((60,y+6),t,font=font(32),fill='white')
def chips(y,items,x=60):
    f=font(30,500)
    for t in items:
        w=d.textlength(t,font=f)+40
        if x+w>W-50: x=60; y+=64
        d.rounded_rectangle((x,y,x+w,y+52),radius=26,fill='white',outline=(190,170,150),width=2); d.text((x+20,y+5),t,font=f,fill=INK); x+=w+14
    return y+64
head(125,'① 防音イヤーマフ（3柄から選択）')
x=110
for fn,nm in [('e-colorful','カラフル'),('e-butterfly','バタフライ'),('e-purple','パープル')]:
    p=Image.open(D+'img/%s.jpg'%fn).convert('RGB'); p.thumbnail((250,250)); im.paste(p,(x+(250-p.width)//2,195)); f=font(30,600); d.text((x+(250-d.textlength(nm,font=f))/2,450),nm,font=f,fill=INK); x+=345
head(515,'② 偏光サングラス（0〜3歳）'); y=chips(585,['ブルー','ピンク'])
head(y+6,'③ スイムゴーグル'); 
y=chips(y+76,['ブルー','ブラック'])+6
head(y,'④ リバーシブル サンハット（サイズ × 柄）'); y=chips(y+70,['S（0〜2歳・45-50cm）','M（2〜5歳・49-56cm）']); y=chips(y,['恐竜パーク','のりもの','ペンギン','海のなかま','虹のらくがき','パイナップル','ピンクユニコーン','ホリデーモンキー'])
t='※ 商品画像はブルー系の組み合わせ例です'; f=font(26,500); d.text(((W-d.textlength(t,font=f))/2,W-50),t,font=f,fill=(110,100,90))
im.save(D+'img/options.jpg',quality=92); print(y)
