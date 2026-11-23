# Qoo10 店铺素材：ロゴ 220×220、カバー PC 980×150、カバー Mobile 750×180（代码渲染，商品图用自店白底图）
from PIL import Image, ImageDraw, ImageFont
F='C:/Windows/Fonts/NotoSansJP-VF.ttf'
def font(sz, w=700):
    f=ImageFont.truetype(F, sz)
    try: f.set_variation_by_axes([w])
    except Exception: pass
    return f
RED=(191,0,0); INK=(40,40,40); BG=(250,246,240)
O='tools/qoo10/shop/'
# ロゴ
im=Image.new('RGB',(440,440),RED); d=ImageDraw.Draw(im)
t='アネット'; f=font(92,900); w=d.textlength(t,font=f); d.text(((440-w)/2,118),t,font=f,fill='white')
t='ANET'; f=font(54,700); w=d.textlength(t,font=f); d.text(((440-w)/2,274),t,font=f,fill='white')
d.line([150,256,290,256],fill='white',width=3)
im.resize((220,220),Image.LANCZOS).save(O+'logo.png')
P=['tools/qoo10/out/img/banz-0001/sku-1.jpg','tools/qoo10/out/white/banz-007.jpg','tools/qoo10/out/img/banz-sunhat/01.jpg','tools/qoo10/out/img/saloncare-2set/01.jpg','tools/qoo10/out/img/saloncare-bodywash/01.jpg','tools/qoo10/out/white/yb-02.jpg','tools/qoo10/out/white/kb-03.jpg','tools/qoo10/out/img/banz-003/01.jpg']
def tile(p, s):
    a=Image.open(p).convert('RGB'); a.thumbnail((s,s),Image.LANCZOS)
    c=Image.new('RGB',(s,s),'white'); c.paste(a,((s-a.size[0])//2,(s-a.size[1])//2)); return c
def cover(W,H,n,ts,tx,title_sz,sub_sz,name):
    k=2; im=Image.new('RGB',(W*k,H*k),BG); d=ImageDraw.Draw(im)
    d.rectangle([0,0,12*k,H*k],fill=RED)
    d.text((tx*k,(H*0.20)*k),'アネット 公式ショップ',font=font(title_sz*k,900),fill=INK)
    d.text((tx*k,(H*0.20+title_sz*1.45)*k),'ベビー・キッズ ／ ヘアケア ／ インナー',font=font(sub_sz*k,500),fill=(90,90,90))
    d.text((tx*k,(H*0.20+title_sz*1.45+sub_sz*1.9)*k),'全品 送料無料',font=font(sub_sz*k,700),fill=RED)
    x=W-n*(ts+10)-8
    for i in range(n):
        c=tile(P[i],ts*k); m=Image.new('L',(ts*k,ts*k),0); ImageDraw.Draw(m).rounded_rectangle([0,0,ts*k-1,ts*k-1],radius=14*k,fill=255)
        im.paste(c,((x+i*(ts+10))*k,((H-ts)//2)*k),m)
    im.resize((W,H),Image.LANCZOS).save(O+name,quality=92)
cover(980,150,5,118,34,26,13,'cover-pc.jpg')
cover(750,180,3,128,30,24,12,'cover-mobile.jpg')
s=Image.new('RGB',(980,150+180+230+20),'#666'); s.paste(Image.open(O+'cover-pc.jpg'),(0,0)); s.paste(Image.open(O+'cover-mobile.jpg'),(0,160)); s.paste(Image.open(O+'logo.png'),(0,350)); s.save(O+'preview.jpg',quality=88)
