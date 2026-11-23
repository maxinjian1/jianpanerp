// 乐天表示中商品全量导出（商品 API 2.0 search）→ tools/qoo10/out/rakuten-items.json
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).map(l=>l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m=>[m[1],m[2].replace(/^"|"$/g,'')]));
const AUTH='ESA '+Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const items=[];
for(let off=0;;off+=100){
  const r=await fetch(`https://api.rms.rakuten.co.jp/es/2.0/items/search?isHiddenItem=false&hits=100&offset=${off}`,{headers:{Authorization:AUTH}});
  if(!r.ok){console.log('err',r.status,(await r.text()).slice(0,200));break}
  const j=await r.json(); const rs=j.results||[];
  for(const x of rs) items.push(x.item);
  console.log(off,rs.length,'/',j.numFound);
  if(off+100>=j.numFound) break; await sleep(1200);
}
fs.writeFileSync('tools/qoo10/out/rakuten-items.json',JSON.stringify(items));
const g={}; for(const it of items) g[it.genreId]=(g[it.genreId]||0)+1;
console.log('items',items.length,'variants',items.reduce((a,i)=>a+Object.keys(i.variants||{}).length,0),'genres',Object.keys(g).length);
console.log(Object.keys(items[0]).join(','));
