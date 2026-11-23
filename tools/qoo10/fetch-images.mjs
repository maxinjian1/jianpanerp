// 下载乐天各商品全部图片到 tools/qoo10/out/img/<管理番号>/NN.jpg（已有的跳过）
import fs from 'node:fs';
const items=JSON.parse(fs.readFileSync('tools/qoo10/out/rakuten-items.json','utf8'));
const jobs=[];
for(const i of items){const imgs=(i.images||[]).filter(m=>!m.location.includes('/award/'));fs.mkdirSync(`tools/qoo10/out/img/${i.manageNumber}`,{recursive:true});imgs.forEach((m,k)=>jobs.push([`https://image.rakuten.co.jp/anet-fashion/cabinet${m.location}`,`tools/qoo10/out/img/${i.manageNumber}/${String(k+1).padStart(2,'0')}.jpg`]))}
let k=0,n=0,f=0;
await Promise.all(Array.from({length:8},async()=>{while(k<jobs.length){const [u,p]=jobs[k++];if(fs.existsSync(p))continue;try{const r=await fetch(u);if(!r.ok)throw 0;fs.writeFileSync(p,Buffer.from(await r.arrayBuffer()));n++}catch{f++}}}));
console.log('jobs',jobs.length,'downloaded',n,'failed',f);
