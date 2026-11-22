import fs from 'node:fs';
const D='tools/rakuten/out/xmas/'; const MN='banz-xmas-set';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^"|"$/g,'')]));
const AUTH='ESA '+Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const api=async(m,u,b)=>{const r=await fetch('https://api.rms.rakuten.co.jp/es'+u,{method:m,headers:{Authorization:AUTH,'content-type':'application/json'},body:b?JSON.stringify(b):undefined});const t=await r.text();return {s:r.status,t}};
const ex=await api('GET','/2.0/items/manage-numbers/'+MN); if(ex.s===200&&!process.argv.includes('--force')){console.log('exists');process.exit(1)}
const src=JSON.parse(fs.readFileSync(D+'banz-0001.json','utf8')); const v0=src.variants['banz-0001'];
const title='【クリスマスギフト】BANZ ベビー おでかけ4点セット 防音イヤーマフ 偏光サングラス サンハット スイムゴーグル ギフトボックス入り 出産祝い 誕生日 プレゼント 男の子 女の子';
const cab=JSON.parse(fs.readFileSync(D+'cabinet-urls.json','utf8'));
const images=cab.map(o=>({type:'CABINET',location:o.url.replace(/^.*\/cabinet/,''),alt:'BANZ クリスマスギフト おでかけ4点セット'}));
const html=`<h2>BANZ おでかけ4点セット｜ギフトボックス入り</h2>
<p>赤ちゃん・お子さまのおでかけに使える BANZ の4アイテムを、ギフトボックスに入れてお届けします。クリスマス、お誕生日、出産祝いの贈りものに。</p>
<h3>■ セット内容</h3>
<p>1. ベビー用防音イヤーマフ（対象年齢 0〜2歳頃／約140g）<br>2. 偏光キッズサングラス（対象年齢 0〜3歳／偏光レンズ・UV400カット／ストラップ・収納ケース付き）<br>3. キッズ スイムゴーグル（くもり止め・UVカット）<br>4. リバーシブル キッズ サンハット（あご紐付き／S：0〜2歳 頭囲45-50cm、M：2〜5歳 頭囲49-56cm）<br>5. ギフトボックス</p>
<h3>■ 組み合わせを選べます</h3>
<p>イヤーマフの柄は商品のバリエーションから、サングラス・ゴーグルのカラー、サンハットのサイズと柄は購入時の選択肢からお選びください。<br>イヤーマフ：カラフル／バタフライ／パープル<br>サングラス：ブルー／ピンク<br>スイムゴーグル：ブルー／ブラック<br>サンハット：恐竜パーク／のりもの／ペンギン／海のなかま／虹のらくがき／パイナップル／ピンクユニコーン／ホリデーモンキー</p>
<h3>■ ご注意</h3>
<p>※ 商品画像はブルー系の組み合わせ例です。お届けする柄・カラーはお選びいただいた内容になります。<br>※ アイテムごとに対象年齢が異なります。お子さまの年齢に合わせてご使用ください。<br>※ モニター環境により、実際の商品と色味が異なる場合がございます。</p>`;
const sp=html.replace(/<h[23]>/g,'<br><b>').replace(/<\/h[23]>/g,'</b><br>').replace(/<\/?p>/g,'<br>');
const designs=[['banz-xmas-set-01','カラフル','9330696016087'],['banz-xmas-set-02','バタフライ','9330696047074'],['banz-xmas-set-03','パープル','9330696046749']];
const PRICE=process.env.PRICE||'9800';
const variants={};
for(const [id,c,jan] of designs){ variants[id]={selectorValues:{'key-1':c},merchantDefinedSkuId:id,restockOnCancel:false,backOrderFlag:false,normalDeliveryDateId:v0.normalDeliveryDateId,standardPrice:PRICE,articleNumber:{exemptionReason:1},articleNumberForSet:[jan],referencePrice:{displayType:'OPEN_PRICE'},shipping:v0.shipping,hidden:false,features:{restockNotification:false,noshi:false},
  attributes:v0.attributes.map(a=>a.name==='代表カラー'?{name:a.name,values:[c==='パープル'?'パープル':'マルチカラー']}:a.name==='メーカー型番'?{name:a.name,values:[MN]}:a),specs:v0.specs}; }
const sel=(n,vals)=>({displayName:n,inputType:'SINGLE_SELECTION',required:true,selections:vals.map(v=>({displayValue:v}))});
const body={itemType:'NORMAL',title,tagline:'クリスマス・お誕生日・出産祝いに。BANZ のおでかけアイテム4点をギフトボックスで',productDescription:{pc:html,sp},salesDescription:html,images,genreId:src.genreId,hideItem:true,unlimitedInventoryFlag:false,features:src.features,payment:src.payment,layout:src.layout,
 customizationOptions:[sel('サングラスのカラー',['ブルー','ピンク']),sel('スイムゴーグルのカラー',['ブルー','ブラック']),sel('サンハットのサイズ',['S（0〜2歳・頭囲45-50cm）','M（2〜5歳・頭囲49-56cm）']),sel('サンハットの柄',['恐竜パーク','のりもの','ペンギン','海のなかま','虹のらくがき','パイナップル','ピンクユニコーン','ホリデーモンキー'])],
 variantSelectors:[{key:'key-1',displayName:'イヤーマフの柄',values:designs.map(d=>({displayValue:d[1]}))}],variants};
fs.writeFileSync(D+'body.json',JSON.stringify(body,null,1));
if(process.argv.includes('--dry')){console.log('dry',title.length);process.exit(0)}
const r=await api('PUT','/2.0/items/manage-numbers/'+MN,body); console.log('PUT',r.s,r.t.slice(0,1200));
if(r.s<300){ for(const [id] of designs){const q=await api('PUT',`/2.1/inventories/manage-numbers/${MN}/variants/${id}`,{mode:'ABSOLUTE',quantity:0});console.log('inv',id,q.s,q.t.slice(0,150));await new Promise(r=>setTimeout(r,800))}
 const g=await api('GET','/2.0/items/manage-numbers/'+MN); const j=JSON.parse(g.t); console.log('check hide',j.hideItem,'variants',Object.keys(j.variants).length,'images',j.images.length,'opts',(j.customizationOptions||[]).map(o=>o.displayName+':'+o.selections.length).join(', ')); fs.writeFileSync(D+'result.json',JSON.stringify(j,null,1)); }
