/**
 * Amazon メイン画像の点検（6kpro 視覚モデル）— 文字・中国語・ロゴ・透かしが入っていないか
 *   node tools/amazon-listing/check-main-images.mjs --type Home [--limit 20] [--sample]
 *   node tools/amazon-listing/check-main-images.mjs --type Home --all [--concurrency 4]   … 各商品の原図を順に判定し、最初の合格画像（白背景優先）を out/main-image-pick.json に記録（build がメイン画像に使う。合格なし＝null → build で除外）
 * 入力：out/products-live.json（refresh）＋ out/mapping.json（classify）。結果は out/main-image-check.json に追記（再実行時は判定済みを飛ばす）
 * 判定：hasText / hasChinese / hasLogo のどれかが true → NG（Amazon 100581「テキスト、ロゴ、グラフィック、ウォーターマーク」の対象）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..'); const OUT = path.join(__dirname, 'out');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_VISION_MODEL || env.CN_LLM_MODEL || 'GLM-5.3-Flash';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const SYS = `你是 Amazon.co.jp 商品主图审核员。只看图片本身，判断：
- hasText：图上是否有任何文字、数字、尺寸标注、卖点字样、价格、标签贴纸上的可读字（商品本体上印的极小品牌字也算，写在 textSeen 里）
- hasChinese：文字里是否有中文（简体/繁体汉字句子，而不是日文）
- hasLogo：是否有水印、店铺 logo、角标、边框、拼图/多宫格、图标徽章
- whiteBg：背景是否为纯白（或接近纯白）
- productClear：商品主体是否完整、清楚地出现（不是局部特写、尺寸图、材质图、多张拼图或只有场景看不清商品）
- textSeen：看到的文字原样抄写（最多 40 字），没有就空字符串
只输出 JSON：{"hasText":bool,"hasChinese":bool,"hasLogo":bool,"whiteBg":bool,"productClear":bool,"textSeen":"..."}`;

async function judge(url) {
  const img = await fetch(url + (url.includes('?') ? '&' : '?') + 'width=900'); if (!img.ok) throw new Error(`image ${img.status}`);
  const b64 = `data:${img.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`;
  const headers = { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) };
  for (let t = 0; t < 3; t++) {
    const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 2000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYS }, { role: 'user', content: [{ type: 'image_url', image_url: { url: b64 } }, { type: 'text', text: '审核这张主图，只输出 JSON。' }] }] }) });
    if (!r.ok) { log('llm', r.status); continue; }
    const c = (await r.json()).choices?.[0]?.message?.content ?? ''; const m = c.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
  }
  throw new Error('no json');
}

const products = JSON.parse(fs.readFileSync(path.join(OUT, 'products-live.json'), 'utf8'));
const mapping = new Map(JSON.parse(fs.readFileSync(path.join(OUT, 'mapping.json'), 'utf8')).map((m) => [m.handle, m.feed_product_type]));
let list = products.filter((p) => !args.type || mapping.get(p.handle) === args.type);
if (args.sample) { const n = Number(args.limit ?? 20), step = list.length / n; list = Array.from({ length: n }, (_, i) => list[Math.floor(i * step)]); }
else if (args.limit) list = list.slice(0, Number(args.limit));
const f = path.join(OUT, 'main-image-check.json'); const res = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
for (const p of list) {
  if (res[p.handle]) continue;
  const url = p.media?.nodes?.find((m) => m.image?.url)?.image.url; if (!url) { res[p.handle] = { ok: false, reason: '画像なし' }; continue; }
  try { const j = await judge(url); res[p.handle] = { ok: !(j.hasText || j.hasChinese || j.hasLogo), ...j, url, variants: p.variants?.nodes?.length ?? 0 }; }
  catch (e) { log('err', p.handle, e.message); continue; }
  fs.writeFileSync(f, JSON.stringify(res, null, 1)); log(res[p.handle].ok ? 'OK ' : 'NG ', p.handle.slice(0, 40), res[p.handle].textSeen ?? '');
}
if (args.all) {
  // 原図の並べ替えのみ（編集しない）：順に判定 → 白背景の合格を見つけた時点で終了、無ければ最初の合格（背景問わず）
  const imgF = path.join(OUT, 'image-check.json'), pickF = path.join(OUT, 'main-image-pick.json');
  const ic = fs.existsSync(imgF) ? JSON.parse(fs.readFileSync(imgF, 'utf8')) : {}, pick = fs.existsSync(pickF) ? JSON.parse(fs.readFileSync(pickF, 'utf8')) : {};
  const pass = (j) => j && !(j.hasText || j.hasChinese || j.hasLogo) && j.productClear !== false;
  const queue = list.filter((p) => !(p.handle in pick));
  const one = async (p) => {
    const urls = (p.media?.nodes ?? []).filter((m) => m.image?.url).map((m) => m.image.url);
    let first = null, white = null;
    for (const u of urls) {
      if (!ic[u]) { try { ic[u] = await judge(u); fs.writeFileSync(imgF, JSON.stringify(ic, null, 1)); } catch (e) { log('err', p.handle, e.message); continue; } }
      if (pass(ic[u])) { first ??= u; if (ic[u].whiteBg) { white = u; break; } }
    }
    pick[p.handle] = white ?? first; fs.writeFileSync(pickF, JSON.stringify(pick, null, 1));
    log(pick[p.handle] ? (pick[p.handle] === urls[0] ? 'MAIN' : 'SWAP') + (white ? ' white' : ' bg  ') : 'NONE      ', 'img' + (pick[p.handle] ? urls.indexOf(pick[p.handle]) + 1 : '-') + '/' + urls.length, p.handle.slice(0, 40));
  };
  await Promise.all(Array.from({ length: Number(args.concurrency ?? 4) }, async () => { while (queue.length) await one(queue.shift()); }));
  const firstUrl = (p) => p.media?.nodes?.find((m) => m.image?.url)?.image.url; const has = list.filter((p) => pick[p.handle]);
  log('products', list.length, 'main ok', has.filter((p) => pick[p.handle] === firstUrl(p)).length, 'swapped', has.filter((p) => pick[p.handle] !== firstUrl(p)).length, 'white', has.filter((p) => ic[pick[p.handle]]?.whiteBg).length, 'none', list.length - has.length, '→', path.relative(ROOT, pickF));
} else {
  const done = list.map((p) => res[p.handle]).filter(Boolean);
  log('checked', done.length, 'ok', done.filter((r) => r.ok).length, 'ng', done.filter((r) => !r.ok).length, '→', path.relative(ROOT, f));
}
