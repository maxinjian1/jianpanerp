/** 旧ブランド字を直した画像（out/rebrand/fixed/<ASIN>/NN.jpg）を Shopify Files に上げ、公開 CDN URL を得る。
 *   node tools/amazon-listing/rebrand/host-images.mjs
 * 出力 out/rebrand/saloncare/hosted.json  { "<ASIN>/NN.jpg": "https://cdn.shopify.com/..." }（済みはスキップ）
 * Amazon は画像 URL を取りに来るので、japanerp.com（Cloudflare 静的サイト）ではなく Shopify CDN を使う。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const SHOP = env.SHOPIFY_STORE_DOMAIN;
const FIXED = path.join(ROOT, 'tools/amazon-listing/out/rebrand/fixed');
const OUTF = path.join(ROOT, 'tools/amazon-listing/out/rebrand/saloncare/hosted.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let tok; async function token() { if (tok) return tok; const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.SHOPIFY_CLIENT_ID, client_secret: env.SHOPIFY_CLIENT_SECRET }) }); if (!r.ok) throw new Error(`shopify token ${r.status}`); tok = (await r.json()).access_token; return tok; }
async function gql(query, variables = {}) { const r = await fetch(`https://${SHOP}/admin/api/${env.SHOPIFY_API_VERSION || '2026-10'}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'X-Shopify-Access-Token': await token() }, body: JSON.stringify({ query, variables }) }); const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.data; }

// 画像置き場：非公開 DRAFT 商品（販売チャネル未公開）。ID は hosted.json の _holder に保存
async function holder() { if (done._holder) return done._holder; const r = await gql(`mutation{ productCreate(product:{ title:"SALONCARE 画像ホスト（非公開・削除禁止）", status:DRAFT, tags:["internal-image-host"] }){ product{ id } userErrors{message} } }`); done._holder = r.productCreate.product.id; fs.writeFileSync(OUTF, JSON.stringify(done, null, 1)); return done._holder; }
const done = fs.existsSync(OUTF) ? JSON.parse(fs.readFileSync(OUTF, 'utf8')) : {};
const files = fs.readdirSync(FIXED).flatMap((a) => fs.readdirSync(path.join(FIXED, a)).map((f) => `${a}/${f}`));
for (const rel of files.filter((r) => !done[r])) {
  const buf = fs.readFileSync(path.join(FIXED, rel)); const name = `saloncare-${rel.replace('/', '-')}`;
  const su = await gql(`mutation($i:[StagedUploadInput!]!){ stagedUploadsCreate(input:$i){ stagedTargets{ url resourceUrl parameters{name value} } userErrors{message} } }`, { i: [{ filename: name, mimeType: 'image/jpeg', resource: 'IMAGE', fileSize: String(buf.length), httpMethod: 'POST' }] });
  const t = su.stagedUploadsCreate.stagedTargets[0]; const fd = new FormData(); for (const q of t.parameters) fd.append(q.name, q.value); fd.append('file', new Blob([buf], { type: 'image/jpeg' }), name);
  const up = await fetch(t.url, { method: 'POST', body: fd }); if (!up.ok) throw new Error('staged upload ' + up.status);
  const m = await gql(`mutation($id:ID!,$m:[CreateMediaInput!]!){ productCreateMedia(productId:$id, media:$m){ media{ id } mediaUserErrors{message} } }`, { id: await holder(), m: [{ originalSource: t.resourceUrl, mediaContentType: 'IMAGE', alt: 'SALONCARE ' + rel }] });
  if (m.productCreateMedia.mediaUserErrors.length) throw new Error(JSON.stringify(m.productCreateMedia.mediaUserErrors));
  const id = m.productCreateMedia.media[0].id; let url;
  for (let i = 0; i < 30 && !url; i++) { await sleep(2000); const q = await gql(`query($id:ID!){ node(id:$id){ ... on MediaImage { status image{ url } } } }`, { id }); if (q.node?.status === 'READY') url = q.node.image.url.split('?')[0]; if (q.node?.status === 'FAILED') throw new Error('failed ' + rel); }
  if (!url) throw new Error('not ready ' + rel);
  done[rel] = url; fs.writeFileSync(OUTF, JSON.stringify(done, null, 1)); console.log(rel, url);
}
console.log('hosted', Object.keys(done).length);
