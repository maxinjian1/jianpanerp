// 乐天图片 URL 逐个 HEAD，404 的写入 tools/qoo10/out/bad-images.json（build.py 会剔除）
import fs from 'node:fs';
const items=JSON.parse(fs.readFileSync('tools/qoo10/out/rakuten-items.json','utf8'));
const urls=[...new Set(items.flatMap(i=>(i.images||[]).map(m=>'https://image.rakuten.co.jp/anet-fashion/cabinet'+m.location)))];
const bad=[];let k=0;
await Promise.all(Array.from({length:8},async()=>{while(k<urls.length){const u=urls[k++];let ok=false;for(let t=0;t<2&&!ok;t++){try{const r=await fetch(u,{method:'HEAD'});ok=r.ok&&/image/.test(r.headers.get('content-type')||'')}catch{}}if(!ok)bad.push(u)}}));
fs.writeFileSync('tools/qoo10/out/bad-images.json',JSON.stringify(bad,null,1));
console.log('urls',urls.length,'bad',bad.length);
