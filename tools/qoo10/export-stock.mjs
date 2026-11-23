// 乐天库存批量读取 → tools/qoo10/out/rakuten-stock.json  { "mn|variantId": quantity }
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^"|"$/g,'')]));
const AUTH='ESA '+Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const items=JSON.parse(fs.readFileSync('tools/qoo10/out/rakuten-items.json','utf8'));
const keys=items.flatMap(i=>Object.keys(i.variants||{}).map(v=>({manageNumber:i.manageNumber,variantId:v})));
const out={};
for(let i=0;i<keys.length;i+=400){
  const r=await fetch('https://api.rms.rakuten.co.jp/es/2.1/inventories/bulk-get',{method:'POST',headers:{Authorization:AUTH,'Content-Type':'application/json'},body:JSON.stringify({inventories:keys.slice(i,i+400)})});
  const t=await r.text(); if(!r.ok){console.log('err',r.status,t.slice(0,300));break}
  for(const x of JSON.parse(t).inventories||[]) out[x.manageNumber+'|'+x.variantId]=x.quantity;
  await new Promise(r=>setTimeout(r,1200));
}
fs.writeFileSync('tools/qoo10/out/rakuten-stock.json',JSON.stringify(out));
const byItem={}; for(const [k,q] of Object.entries(out)){const m=k.split('|')[0];byItem[m]=(byItem[m]||0)+q}
console.log('variants',Object.keys(out).length,'/',keys.length,'| 有库存商品',Object.values(byItem).filter(q=>q>0).length,'| 库存0商品',items.length-Object.values(byItem).filter(q=>q>0).length);
