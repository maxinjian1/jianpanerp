# Qoo10 PC メインページ用：ヒーロー 980×360、カテゴリ 3 枚 320×320、ピックアップ 8 枚 232×232、メニューバー 2 枚 485×100
# 代码渲染；文字只用商品页已有事实；商品图用自店图
from PIL import Image, ImageDraw, ImageFont
F='C:/Windows/Fonts/NotoSansJP-VF.ttf'
def font(sz,w=700):
    f=ImageFont.truetype(F,sz)
    try: f.set_variation_by_axes([w])
    except Exception: pass
    return f
RED=(191,0,0); INK=(40,40,40); GREY=(90,90,90)
O='tools/qoo10/shop/pc/'; I='tools/qoo10/out/img/'; Wh='tools/qoo10/out/white/'
import os; os.makedirs(O,exist_ok=True)
def tile(p,s,r,k):
    a=Image.open(p).convert('RGB'); a.thumbnail((s*k,s*k),Image.LANCZOS)
    c=Image.new('RGB',(s*k,s*k),'white'); c.paste(a,((s*k-a.size[0])//2,(s*k-a.size[1])//2))
    m=Image.new('L',(s*k,s*k),0); ImageDraw.Draw(m).rounded_rectangle([0,0,s*k-1,s*k-1],radius=r*k,fill=255)
    return c,m
def pill(d,x,y,t,k,sz=17):
    f=font(sz*k,700); w=d.textlength(t,font=f)
    d.rounded_rectangle([x*k,y*k,x*k+w+36*k,(y+sz*2)*k],radius=sz*k,fill=RED)
    d.text((x*k+18*k,(y+sz*0.28)*k),t,font=f,fill='white')

# ヒーロー
k=2; W,H=980,360; im=Image.new('RGB',(W*k,H*k),(250,243,236)); d=ImageDraw.Draw(im)
d.text((48*k,56*k),'BANZ（バンズ）',font=font(22*k,700),fill=RED)
d.text((48*k,92*k),'ベビー用 防音イヤーマフ',font=font(42*k,900),fill=INK)
d.text((48*k,160*k),'対象年齢 0〜2歳頃　／　選べるデザイン',font=font(19*k,500),fill=GREY)
pill(d,48,250,'全品 送料無料',k)
for i,p in enumerate([I+'banz-0001/sku-1.jpg',I+'banz-0001/sku-2.jpg',I+'banz-0001/sku-4.jpg']):
    c,m=tile(p,128,16,k); im.paste(c,((560+i*136)*k,116*k),m)
im.resize((W,H),Image.LANCZOS).save(O+'hero.jpg',quality=92)

# カテゴリ 3 枚
def cat(name,bg,kicker,title,imgs):
    S=320; im=Image.new('RGB',(S*k,S*k),bg); d=ImageDraw.Draw(im)
    d.text((24*k,22*k),kicker,font=font(15*k,700),fill=RED)
    d.text((24*k,46*k),title,font=font(25*k,900),fill=INK)
    for i,p in enumerate(imgs):
        c,m=tile(p,130,14,k); im.paste(c,((24+i*142)*k,112*k),m)
    d.text((24*k,268*k),'商品を見る  ›',font=font(15*k,700),fill=RED)
    im.resize((S,S),Image.LANCZOS).save(O+name,quality=92)
cat('cat-1.jpg',(238,246,250),'BANZ（バンズ）','キッズのおでかけに',[Wh+'banz-007.jpg',I+'banz-sunhat/01.jpg'])
cat('cat-2.jpg',(240,246,238),'SALON CARE','ヘアケア・ボディケア',[I+'saloncare-2set/01.jpg',I+'saloncare-bodywash/01.jpg'])
cat('cat-3.jpg',(248,240,244),'SALONCARE','インナー・ルームウェア',[Wh+'a01-240208.jpg',I+'a01-240208/02.jpg'])

# ピックアップ 8 枚
PICK=[('banz-0001',Wh+'banz-0001.jpg'),('banz-sunhat',I+'banz-sunhat/01.jpg'),('banz-003',I+'banz-003/01.jpg'),('banz-007',Wh+'banz-007.jpg'),
      ('saloncare-2set',I+'saloncare-2set/01.jpg'),('saloncare-otc',I+'saloncare-otc/01.jpg'),('saloncare-bodywash',I+'saloncare-bodywash/01.jpg'),('a01-240208',Wh+'a01-240208.jpg')]
for mn,p in PICK:
    c,_=tile(p,232,0,k); c.resize((232,232),Image.LANCZOS).save(O+f'pick-{mn}.jpg',quality=90)

# メニューバー 2 枚
def menu(name,bg,title,sub,p):
    W,H=485,100; im=Image.new('RGB',(W*k,H*k),bg); d=ImageDraw.Draw(im)
    d.rectangle([0,0,8*k,H*k],fill=RED)
    d.text((28*k,20*k),title,font=font(26*k,900),fill=INK)
    d.text((28*k,62*k),sub,font=font(14*k,500),fill=GREY)
    c,m=tile(p,80,10,k); im.paste(c,((W-80-18)*k,10*k),m)
    im.resize((W,H),Image.LANCZOS).save(O+name,quality=92)
menu('menu-1.jpg',(250,243,236),'BANZ ベビー・キッズ','イヤーマフ ／ サングラス ／ 帽子',I+'banz-0001/sku-1.jpg')
menu('menu-2.jpg',(240,246,238),'SALON CARE','ヘアケア ／ ボディケア ／ インナー',I+'saloncare-2set/01.jpg')

# プレビュー
s=Image.new('RGB',(980,360+10+320+10+232*2+10+100+10),'#888'); s.paste(Image.open(O+'hero.jpg'),(0,0))
for i in range(3): s.paste(Image.open(O+f'cat-{i+1}.jpg'),(i*330,370))
for i,(mn,_) in enumerate(PICK): s.paste(Image.open(O+f'pick-{mn}.jpg'),(8+(i%4)*244,700+(i//4)*232))
s.paste(Image.open(O+'menu-1.jpg'),(0,1174)); s.paste(Image.open(O+'menu-2.jpg'),(495,1174))
s.save('tools/qoo10/shop/preview-pc.jpg',quality=85)
