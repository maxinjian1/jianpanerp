# Qoo10 メインページ用バナー 686×686（代码渲染；文字只用商品页已有事实）
from PIL import Image, ImageDraw, ImageFont
F='C:/Windows/Fonts/NotoSansJP-VF.ttf'
def font(sz,w=700):
    f=ImageFont.truetype(F,sz)
    try: f.set_variation_by_axes([w])
    except Exception: pass
    return f
RED=(191,0,0); INK=(40,40,40)
def banner(name,bg,kicker,title,sub,imgs):
    k=2; S=686*k; im=Image.new('RGB',(S,S),bg); d=ImageDraw.Draw(im)
    d.text((48*k,44*k),kicker,font=font(22*k,700),fill=RED)
    d.text((48*k,78*k),title,font=font(40*k,900),fill=INK)
    d.text((48*k,136*k),sub,font=font(20*k,500),fill=(90,90,90))
    n=len(imgs); ts=(686-48*2-16*(n-1))//n
    for i,p in enumerate(imgs):
        a=Image.open(p).convert('RGB'); a.thumbnail((ts*k,ts*k),Image.LANCZOS)
        c=Image.new('RGB',(ts*k,ts*k),'white'); c.paste(a,((ts*k-a.size[0])//2,(ts*k-a.size[1])//2))
        m=Image.new('L',(ts*k,ts*k),0); ImageDraw.Draw(m).rounded_rectangle([0,0,ts*k-1,ts*k-1],radius=18*k,fill=255)
        im.paste(c,((48+i*(ts+16))*k,(230+(390-ts)//2)*k),m)
    d.rounded_rectangle([48*k,620*k,250*k,662*k],radius=21*k,fill=RED)
    t='全品 送料無料'; f=font(19*k,700); w=d.textlength(t,font=f); d.text(((48+101)*k-w/2,628*k),t,font=f,fill='white')
    im.resize((686,686),Image.LANCZOS).save('tools/qoo10/shop/'+name,quality=92)
I='tools/qoo10/out/img/'
banner('main-1.jpg',(250,243,236),'BANZ（バンズ）','ベビー用 防音イヤーマフ','対象年齢 0〜2歳頃　／　選べるデザイン',[I+'banz-0001/sku-1.jpg',I+'banz-0001/sku-2.jpg',I+'banz-0001/sku-4.jpg'])
banner('main-2.jpg',(238,246,250),'BANZ（バンズ）','キッズのおでかけに','サングラス　／　サンハット　／　キャップ',['tools/qoo10/out/white/banz-007.jpg',I+'banz-sunhat/01.jpg',I+'banz-003/01.jpg'])
banner('main-3.jpg',(240,246,238),'SALON CARE','ヘアケア・ボディケア','シャンプー　／　コンディショナー　／　ボディウォッシュ',[I+'saloncare-2set/01.jpg',I+'saloncare-otc/01.jpg',I+'saloncare-bodywash/01.jpg'])
s=Image.new('RGB',(686*3+20,686),'#666')
for i in range(3): s.paste(Image.open(f'tools/qoo10/shop/main-{i+1}.jpg'),(i*696,0))
s.resize((1039,343)).save('tools/qoo10/shop/preview-main.jpg',quality=85)
