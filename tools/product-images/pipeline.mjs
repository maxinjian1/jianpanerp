#!/usr/bin/env node
/**
 * 商品画像を全部作り直すパイプライン（Windows で実行。Shopify / 6kpro / GPU が必要）。
 *   出力：tools/product-images/out/<handle>/{src,thumbs,work,final}/ + products.json
 *
 *   node tools/product-images/pipeline.mjs fetch     [--only-hero] [--limit 20] [--handles file.txt]
 *   node tools/product-images/pipeline.mjs classify  [--limit 20]      # 6kpro ビジョンで原図を分類・クリーン領域検出
 *   node tools/product-images/pipeline.mjs cutout    [--limit 20]      # rembg（GPU）で主画像を切り抜き
 *   node tools/product-images/pipeline.mjs spec      [--limit 20]      # 6kpro で日本語コピー/仕様 JSON
 *   node tools/product-images/pipeline.mjs render    [--limit 20]      # 8 枚レンダリング（MIX: B 主体 + A シーン）
 *   node tools/product-images/pipeline.mjs all       [--limit 20]      # 上記を順に
 *   node tools/product-images/pipeline.mjs publish   [--limit 20] [--dry]  # Shopify の商品画像を置き換え（旧画像はバックアップ、--rollback 可）
 *   node tools/product-images/pipeline.mjs rollback  --handle <handle>
 * すべてファイル存在で再開可能（冪等）。
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.resolve(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const PREVIEW = path.resolve(__dirname, 'out-preview');
const args = Object.fromEntries(process.argv.slice(3).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const stage = process.argv[2];
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const SHOP = env.SHOPIFY_STORE_DOMAIN, CID = env.SHOPIFY_CLIENT_ID, SECRET = env.SHOPIFY_CLIENT_SECRET, VER = env.SHOPIFY_API_VERSION || '2026-10';
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash';
const PY = env.IMAGE_PY || (process.platform === 'win32' ? path.join(ROOT, 'apps/image-service/venv/Scripts/python.exe') : 'python3');
const CONC = Number(args.concurrency ?? 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ---------- Shopify ----------
let token;
async function getToken() { if (token) return token; const r = await fetch(`https://${SHOP}/admin/oauth/access_token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'client_credentials', client_id: CID, client_secret: SECRET }) }); if (!r.ok) throw new Error(`token ${r.status}`); token = (await r.json()).access_token; return token; }
async function gql(query, variables = {}) { const r = await fetch(`https://${SHOP}/admin/api/${VER}/graphql.json`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-shopify-access-token': await getToken() }, body: JSON.stringify({ query, variables }) }); const j = await r.json(); if (j.errors) throw new Error(JSON.stringify(j.errors)); return j.data; }

// ---------- 6kpro（OpenAI 互換）----------
async function chatJson(messages, { maxTokens = 4000, retries = 3 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model: MODEL, temperature: 0.2, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages }) });
      const j = await r.json(); const c = j.choices?.[0]?.message?.content;
      if (!c) throw new Error(`empty content: ${JSON.stringify(j).slice(0, 300)}`);
      const m = c.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : c);
    } catch (e) { if (i === retries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}
const b64 = (p) => `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;
function py(cmd, jobs) { const f = path.join(OUT, `_jobs-${cmd}-${process.pid}.json`); fs.writeFileSync(f, JSON.stringify(jobs)); const r = spawnSync(PY, [path.join(__dirname, 'imgtool.py'), cmd, f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], maxBuffer: 1 << 26 }); fs.unlinkSync(f); if (r.status !== 0) throw new Error(`imgtool ${cmd} failed`); return r.stdout; }

// ---------- 商品リスト ----------
const PRODUCTS = path.join(OUT, 'products.json');
function loadProducts() {
  let all = JSON.parse(fs.readFileSync(PRODUCTS, 'utf8'));
  if (args.handles) { const set = new Set(fs.readFileSync(args.handles, 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)); all = all.filter((p) => set.has(p.handle)); }
  if (args.handle) all = all.filter((p) => p.handle === args.handle);
  if (args['only-hero']) { const hero = new Set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/market-research/out/hero-top50.json'), 'utf8')).map((h) => h.handle)); all = all.filter((p) => hero.has(p.handle)); }
  if (args.offset) all = all.slice(Number(args.offset));
  if (args.limit) all = all.slice(0, Number(args.limit));
  return all;
}
const dir = (p, sub) => { const d = path.join(OUT, p.handle, sub); fs.mkdirSync(d, { recursive: true }); return d; };
async function pool(items, n, fn) { let i = 0; const w = Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; try { await fn(it); } catch (e) { log('ERR', it.handle ?? it, e.message); fs.appendFileSync(path.join(OUT, 'errors.log'), `${new Date().toISOString()} ${stage} ${it.handle ?? it} ${e.message}\n`); } } }); await Promise.all(w); }

// ========== fetch ==========
async function fetchStage() {
  const all = []; let cursor = null;
  for (;;) {
    const d = await gql(`query($c:String){ products(first:100, after:$c, query:"vendor:ANET status:active"){ pageInfo{hasNextPage endCursor} nodes{ id handle title descriptionHtml description productType tags options{ name values } variants(first:20){ nodes{ id title price compareAtPrice selectedOptions{ name value } } } media(first:20){ nodes{ id mediaContentType ... on MediaImage { image{ url width height } } } } } } }`, { c: cursor });
    for (const p of d.products.nodes) all.push({ ...p, media: p.media.nodes.filter((m) => m.mediaContentType === 'IMAGE' && m.image?.url).map((m) => ({ id: m.id, url: m.image.url, w: m.image.width, h: m.image.height })) });
    log(`fetched ${all.length}`); if (!d.products.pageInfo.hasNextPage) break; cursor = d.products.pageInfo.endCursor;
  }
  fs.writeFileSync(PRODUCTS, JSON.stringify(all, null, 1)); log(`products.json ${all.length}`);
}

// ========== download（classify の前に自動実行）==========
async function download(p) {
  const src = dir(p, 'src'); const th = dir(p, 'thumbs'); const jobs = [];
  for (const [i, m] of p.media.entries()) {
    const f = path.join(src, `${String(i + 1).padStart(2, '0')}.jpg`);
    if (!fs.existsSync(f)) { const r = await fetch(m.url); if (!r.ok) throw new Error(`img ${r.status}`); fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); }
    const t = path.join(th, path.basename(f)); if (!fs.existsSync(t)) jobs.push({ src: f, out: t, max: 768 });
  }
  if (jobs.length) py('thumbs', jobs);
  return p.media.map((_, i) => `${String(i + 1).padStart(2, '0')}.jpg`);
}

// ========== classify ==========
const CLASSIFY_SYS = `あなたは EC 商品画像の検品担当です。与えられた各画像について JSON で判定してください。日本の楽天・Amazon の画像規約に沿って判断します。
出力: {"images":[{"n":1,"kind":"main|scene|detail|infographic|size|package|other","hasText":bool,"hasPerson":bool,"hasBrandLogo":bool,"hasWatermark":bool,"background":"white|plain|room|other","mainBox":[x0,y0,x1,y1],"cleanBox":[x0,y0,x1,y1],"caption":"写っている内容を日本語で15字以内"}]}
- kind: main=商品単体（白/無地背景）, scene=部屋など使用シーン, detail=部分アップ, infographic=文字説明中心, size=寸法図, package=梱包/セット内容
- mainBox: 画像中の「主要な商品1個」だけを囲む枠（0〜1 の割合）。装飾小物・重複した同商品・ブランド品・はめ込み小画像（拡大インセット、別カット）・文字ステッカーは含めない。無ければ null
- cleanBox: 文字・吹き出し・キャラクター・ロゴ・はめ込み小画像を含まない、実写部分だけの最大の矩形（0〜1）。全面に文字が重なっていれば null
- hasBrandLogo: 他社ブランド（GUCCI, Nike 等）のロゴや商品が写っていれば true`;
async function classify(p) {
  const f = path.join(OUT, p.handle, 'classify.json'); if (fs.existsSync(f)) return;
  const files = await download(p); const th = path.join(OUT, p.handle, 'thumbs');
  const content = [{ type: 'text', text: `商品名: ${p.title}\n画像は ${files.length} 枚、番号順です。` }];
  files.forEach((n, i) => { content.push({ type: 'text', text: `画像 ${i + 1}:` }); content.push({ type: 'image_url', image_url: { url: b64(path.join(th, n)) } }); });
  const j = await chatJson([{ role: 'system', content: CLASSIFY_SYS }, { role: 'user', content }], { maxTokens: 3000 });
  if (!Array.isArray(j.images) || !j.images.length) throw new Error(`classify: images not array: ${JSON.stringify(j).slice(0, 120)}`); // 模型偶尔输出错位引号的坏 JSON，不落盘，留给下一轮重分类
  fs.writeFileSync(f, JSON.stringify(j, null, 1)); log('classified', p.handle, j.images?.length);
}

// ========== cutout ==========
// 主画像の選択：文字入り・人物入り・他社ロゴ入りを避け、文字が残る場合は mainBox ∩ cleanBox で切る（ステッカー/拡大インセットの混入対策）
function pickMain(cls) {
  const imgs = Array.isArray(cls.images) ? cls.images : [];
  // 文字入り main は cleanBox で切った後に商品がどれだけ残るかで評価：7割未満しか残らないなら、文字なしの scene/package を優先する
  const keep = (x) => { if (!x.hasText || !okBox(x.cleanBox)) return 1; const b = okBox(x.mainBox) ? x.mainBox : [0, 0, 1, 1]; const c = x.cleanBox; const w = Math.max(0, Math.min(b[2], c[2]) - Math.max(b[0], c[0])), h = Math.max(0, Math.min(b[3], c[3]) - Math.max(b[1], c[1])); return (w * h) / ((b[2] - b[0]) * (b[3] - b[1])); };
  const rank = (x) => ({ main: 0, package: 10, scene: 20, detail: 30 }[x.kind] ?? 40) + (x.hasText ? (keep(x) >= 0.7 ? 5 : 35) : 0) + (x.mainBox ? 0 : 1);
  const cands = imgs.filter((x) => !x.hasBrandLogo && !x.hasPerson && (x.kind === 'main' || x.mainBox)).sort((a, b) => rank(a) - rank(b) || a.n - b.n);
  return cands[0] ?? imgs.find((x) => x.kind === 'main' && !x.hasBrandLogo) ?? imgs.find((x) => x.mainBox) ?? { n: 1, mainBox: null };
}
const okBox = (b) => Array.isArray(b) && b.length === 4 && b.every((v) => typeof v === 'number') && b[2] > b[0] && b[3] > b[1];
function mainBox(m) {
  let b = okBox(m.mainBox) ? [...m.mainBox] : null;
  if (m.hasText && okBox(m.cleanBox)) { const c = m.cleanBox; const i = b ? [Math.max(b[0], c[0]), Math.max(b[1], c[1]), Math.min(b[2], c[2]), Math.min(b[3], c[3])] : c; if (i[2] - i[0] > 0.3 && i[3] - i[1] > 0.3) b = i; }
  if (!b || (b[2] - b[0] >= 0.97 && b[3] - b[1] >= 0.97)) return null;
  return b;
}
// 旧ロジック（2026-10-17 以前に作った cutout がどの画像から出来たか推定するためだけに残す）
function legacyPick(cls) { const imgs = Array.isArray(cls.images) ? cls.images : []; const c = imgs.filter((x) => x.kind === 'main' && !x.hasBrandLogo).sort((a, b) => Number(a.hasText) - Number(b.hasText) || a.n - b.n)[0] ?? imgs.find((x) => x.mainBox) ?? { n: 1, mainBox: null }; return JSON.stringify({ n: c.n, box: c.mainBox && c.mainBox[2] - c.mainBox[0] < 0.95 ? c.mainBox : null }); }
// Node 24.13 (Windows) の fs.rmSync({recursive:true}) は非 ASCII パスでネイティブクラッシュ（0xC0000409、JS 例外なし）するので JS 実装で消す
function rmrf(t) { if (!fs.existsSync(t)) return; if (fs.statSync(t).isDirectory()) { for (const e of fs.readdirSync(t)) rmrf(path.join(t, e)); fs.rmdirSync(t); } else fs.unlinkSync(t); }
function cutoutJobs(p) {
  const cls = JSON.parse(fs.readFileSync(path.join(OUT, p.handle, 'classify.json'), 'utf8')); const m = pickMain(cls); const box = mainBox(m);
  const work = dir(p, 'work'); const out = path.join(work, 'cutout.png'); const metaF = path.join(work, 'cutout.json'); const sig = JSON.stringify({ n: m.n, box });
  if (fs.existsSync(out) && !args.force) {
    const prev = fs.existsSync(metaF) ? fs.readFileSync(metaF, 'utf8') : legacyPick(cls);
    if (prev === sig) { if (!fs.existsSync(metaF)) fs.writeFileSync(metaF, sig); return null; }
    // 選択が変わった → 切り抜き直し。成品とプレビューを消して render/preview に再生成させる
    rmrf(path.join(OUT, p.handle, 'final')); rmrf(path.join(PREVIEW, `${p.handle}.jpg`)); log('recut', p.handle, `${prev} -> ${sig}`);
  }
  fs.writeFileSync(metaF, sig);
  return { src: path.join(OUT, p.handle, 'src', `${String(m.n).padStart(2, '0')}.jpg`), out, box };
}

// ========== spec ==========
const SPEC_SYS = `あなたは日本の EC（楽天市場・Amazon.co.jp）専門のコピーライター兼商品企画です。与えられた商品データから、商品画像 8 枚用の JSON を日本語で作ります。
厳守:
- 事実のみ。寸法・容量・重量・素材は入力テキストに書かれている値だけを使う。無い項目は "—" にする。推測で数字を作らない。
- 景品表示法・薬機法: 「最安」「No.1」「業界初」「痩せる」「治る」「改善」などの断定・効果表現は使わない。「サポート」「〜しやすい」等に言い換える。
- 他社ブランド名・キャラクター名は書かない。
- 文体: ですます調を避け、名詞止め中心。読点は少なく。全角英数は使わない。
出力 JSON:
{"shortTitle":"商品名を20字以内で（カテゴリ語を含む）","catch":"楽天主画像の一行キャッチ 22字以内","badge":"特長を表す短い帯 8字以内","headline":"特長画像の見出し。<br>で2行、各行12字以内",
 "features":[{"t":"特長 14字以内","d":"補足 24字以内"} ×4],
 "sceneTag":"使用シーン 12字以内","sceneCopy":"シーン画像の見出し <br> で2行、各行14字以内","sceneSub":"補足 30字以内",
 "dimensions":{"title":"サイズ","w":"幅 例: 約26cm か —","h":"高さ か —","d":"奥行 か —","note":"計測の注意・素材など 40字以内"},
 "detailsTitle":"ディテール","details":[{"n":画像番号,"tag":"2〜3字","cap":"14字以内"} ×最大4（kind が detail/scene/package の画像から選ぶ。infographic は不可）],
 "specs":[{"k":"項目 6字以内","v":"値 16字以内"} ×3〜6（内容量・素材・サイズ展開・重量・対応機種・原産国など、本文にあるものだけ）],
 "variantsTitle":"カラー/セットの見出し 12字以内","colors":[{"name":"色名","hex":"#RRGGBB の推定色"}]（色のバリエーションがある場合のみ。サイズ・容量・型番など色ではない選択肢は colors に入れず "variants":["5kg","10kg"] として別に出す）,"setContents":["セット内容（不明なら 商品本体 ×1）"],"variantsNote":"注意書き 40字以内",
 "trustTitle":"安心してお買い物いただくために"}`;
async function spec(p) {
  const f = path.join(OUT, p.handle, 'spec.json'); if (fs.existsSync(f)) return;
  const cf = path.join(OUT, p.handle, 'classify.json');
  if (!fs.existsSync(cf)) { if (args['ready-only']) return; throw new Error('classify.json missing'); }
  const cls = JSON.parse(fs.readFileSync(cf, 'utf8'));
  const usable = (cls.images ?? []).filter((x) => ['detail', 'scene', 'package', 'main'].includes(x.kind) && !x.hasBrandLogo && !x.hasPerson).map((x) => ({ n: x.n, kind: x.kind, caption: x.caption, hasText: x.hasText }));
  const price = Math.min(...p.variants.nodes.map((v) => Number(v.price)));
  const user = `商品名: ${p.title}\nカテゴリ: ${p.productType}\n価格(税込): ¥${price}\nオプション: ${JSON.stringify(p.options)}\nバリエーション: ${p.variants.nodes.map((v) => v.title).join(' / ')}\n説明文:\n${p.description.slice(0, 3000)}\n\n利用可能な画像（番号・種類・内容）:\n${JSON.stringify(usable)}`;
  const j = await chatJson([{ role: 'system', content: SPEC_SYS }, { role: 'user', content: user }]);
  // 画像の実ファイル割り当て：scene/detail は cleanBox でトリミングしたものを使う
  const work = dir(p, 'work'); const crops = []; const byN = Object.fromEntries((cls.images ?? []).map((x) => [x.n, x]));
  const cropFor = (n) => { const x = byN[n]; const src = path.join(OUT, p.handle, 'src', `${String(n).padStart(2, '0')}.jpg`); if (!x?.cleanBox || (x.cleanBox[2] - x.cleanBox[0] > 0.97 && x.cleanBox[3] - x.cleanBox[1] > 0.97)) return src; const out = path.join(work, `crop-${n}.jpg`); if (!fs.existsSync(out)) crops.push({ src, out, box: x.cleanBox }); return out; };
  // シーン画像：実写の scene があればそれ、無ければ null（レンダラーが切り抜き+背景のカードに切り替える）
  const sceneImg = (cls.images ?? []).filter((x) => x.kind === 'scene' && !x.hasPerson && !x.hasBrandLogo).sort((a, b) => Number(a.hasText) - Number(b.hasText))[0] ?? null;
  const details = (j.details ?? []).filter((d) => byN[d.n]).slice(0, 4).map((d) => ({ img: path.relative(path.join(OUT, p.handle), cropFor(d.n)), tag: d.tag, cap: d.cap }));
  while (details.length < 4 && usable.length) { const u = usable.find((x) => !details.some((d) => d.img.includes(`-${x.n}.jpg`) || d.img.endsWith(`${String(x.n).padStart(2, '0')}.jpg`))); if (!u) break; details.push({ img: path.relative(path.join(OUT, p.handle), cropFor(u.n)), tag: 'POINT', cap: u.caption ?? '' }); }
  if (crops.length) py('crop', crops);
  const COLORISH = /色|カラー|colou?r/i;
  const colorOpt = p.options.find((o) => COLORISH.test(o.name));
  let colors = (j.colors ?? []).filter((c) => c && c.name && String(c.name).trim().length >= 2 && /^#[0-9a-fA-F]{6}$/.test(c.hex ?? ''));
  if (!colorOpt && !colors.length) colors = [];
  const variants = (j.variants ?? []).filter((v) => typeof v === 'string' && v.trim() && v !== 'Default Title').map((v) => ({ name: v, hex: null }));
  if (!colors.length && !variants.length) { const nonColor = p.options.filter((o) => !COLORISH.test(o.name) && !(o.values.length === 1 && o.values[0] === 'Default Title')); for (const o of nonColor) for (const v of o.values.slice(0, 6)) variants.push({ name: v, hex: null }); }
  const full = { handle: p.handle, title: p.title, price: `¥${price.toLocaleString('ja-JP')}`, cutout: 'work/cutout.png', scene: sceneImg ? path.relative(path.join(OUT, p.handle), cropFor(sceneImg.n)) : null, ...j, details,
    colors: [...colors, ...(colors.length ? [] : variants)].slice(0, 6),
    trust: [{ icon: '¥0', t: '全国送料無料', d: '追加料金はかかりません' }, { icon: '12:00', t: '平日12時まで当日出荷', d: '12時までのご注文・土日祝を除く' }, { icon: '7日', t: '到着後7日以内 交換・返金', d: '初期不良・誤配送の場合' }, { icon: 'JP', t: '日本国内の倉庫から直送', d: '海外発送ではありません' }] };
  fs.writeFileSync(f, JSON.stringify(full, null, 1)); log('spec', p.handle);
}

// ========== render ==========
function render(p) {
  const final = path.join(OUT, p.handle, 'final'); if (fs.existsSync(path.join(final, '08-trust.png')) && !args.force) return;
  if (!fs.existsSync(path.join(OUT, p.handle, 'spec.json')) || !fs.existsSync(path.join(OUT, p.handle, 'work', 'cutout.png'))) { if (args['ready-only']) return; throw new Error('spec/cutout missing'); }
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools/brand-assets/product-cards.mjs'), '--spec', path.join(OUT, p.handle, 'spec.json'), '--style', args.style ?? 'MIX', '--out', final], { encoding: 'utf8', cwd: ROOT, env: process.env });
  if (r.status !== 0) throw new Error(`render failed: ${r.stderr.slice(-400)}`);
  for (const f of fs.readdirSync(final)) if (f.endsWith('.html')) fs.unlinkSync(path.join(final, f));
  log('rendered', p.handle);
}

// ========== preview（git に入れる軽量コンタクトシート）==========
function previewJobs(ps) { fs.mkdirSync(PREVIEW, { recursive: true }); return ps.map((p) => { const final = path.join(OUT, p.handle, 'final'); const files = fs.existsSync(final) ? fs.readdirSync(final).filter((f) => f.endsWith('.png')).sort().map((f) => path.join(final, f)) : []; const out = path.join(PREVIEW, `${p.handle}.jpg`); return files.length === 8 && (!fs.existsSync(out) || args.force) ? { files, out } : null; }).filter(Boolean); }

// ========== publish（Shopify の画像を置き換え）==========
async function publish(p) {
  const final = path.join(OUT, p.handle, 'final'); const files = ['01-main-amazon', '02-main-rakuten', '03-features', '04-scene', '05-dimensions', '06-details', '07-variants', '08-trust'].map((n) => path.join(final, `${n}.png`));
  if (!files.every((f) => fs.existsSync(f))) throw new Error('final images missing');
  const bak = path.join(OUT, p.handle, 'media-backup.json');
  if (fs.existsSync(bak) && !args.force) { log('already published', p.handle); return; }
  if (args.dry) { log('[dry] would replace', p.media.length, 'images of', p.handle); return; }
  // 1) staged upload
  const st = await gql(`mutation($i:[StagedUploadInput!]!){ stagedUploadsCreate(input:$i){ stagedTargets{ url resourceUrl parameters{ name value } } userErrors{ message } } }`, { i: files.map((f) => ({ filename: path.basename(f), mimeType: 'image/png', resource: 'IMAGE', httpMethod: 'POST', fileSize: String(fs.statSync(f).size) })) });
  if (st.stagedUploadsCreate.userErrors.length) throw new Error(st.stagedUploadsCreate.userErrors[0].message);
  const resourceUrls = [];
  for (const [i, t] of st.stagedUploadsCreate.stagedTargets.entries()) {
    const fd = new FormData(); for (const q of t.parameters) fd.append(q.name, q.value); fd.append('file', new Blob([fs.readFileSync(files[i])], { type: 'image/png' }), path.basename(files[i]));
    const r = await fetch(t.url, { method: 'POST', body: fd }); if (!r.ok) throw new Error(`upload ${r.status}`); resourceUrls.push(t.resourceUrl);
  }
  // 2) 新メディア追加
  const alt = (i) => [`${p.title}`, `${p.title} 商品画像`, `${p.title} 特長`, `${p.title} 使用シーン`, `${p.title} サイズ`, `${p.title} ディテール`, `${p.title} カラー・セット内容`, 'ご購入にあたって'][i];
  const cm = await gql(`mutation($id:ID!,$m:[CreateMediaInput!]!){ productCreateMedia(productId:$id, media:$m){ media{ id } mediaUserErrors{ message } } }`, { id: p.id, m: resourceUrls.map((u, i) => ({ originalSource: u, mediaContentType: 'IMAGE', alt: alt(i) })) });
  if (cm.productCreateMedia.mediaUserErrors.length) throw new Error(cm.productCreateMedia.mediaUserErrors[0].message);
  const newIds = cm.productCreateMedia.media.map((m) => m.id);
  // 3) 処理完了待ち → 並べ替え → 旧画像削除
  for (let i = 0; i < 20; i++) { await sleep(1500); const d = await gql(`query($id:ID!){ product(id:$id){ media(first:40){ nodes{ id status } } } }`, { id: p.id }); const mine = d.product.media.nodes.filter((m) => newIds.includes(m.id)); if (mine.every((m) => m.status === 'READY')) break; if (mine.some((m) => m.status === 'FAILED')) throw new Error('media processing failed'); }
  fs.writeFileSync(bak, JSON.stringify({ productId: p.id, old: p.media, new: newIds, at: new Date().toISOString() }, null, 1));
  await gql(`mutation($id:ID!,$m:[MoveInput!]!){ productReorderMedia(id:$id, moves:$m){ userErrors{ message } } }`, { id: p.id, m: newIds.map((id, i) => ({ id, newPosition: String(i) })) });
  if (!args['keep-old']) { const del = await gql(`mutation($id:ID!,$m:[ID!]!){ productDeleteMedia(productId:$id, mediaIds:$m){ deletedMediaIds mediaUserErrors{ message } } }`, { id: p.id, m: p.media.map((m) => m.id) }); if (del.productDeleteMedia.mediaUserErrors.length) log('warn delete', p.handle, del.productDeleteMedia.mediaUserErrors[0].message); }
  log('published', p.handle, newIds.length, 'images');
}
async function rollback(p) {
  const bak = JSON.parse(fs.readFileSync(path.join(OUT, p.handle, 'media-backup.json'), 'utf8'));
  // 旧画像は CDN URL から再登録（削除済みのため）、新画像は削除
  const cm = await gql(`mutation($id:ID!,$m:[CreateMediaInput!]!){ productCreateMedia(productId:$id, media:$m){ media{ id } mediaUserErrors{ message } } }`, { id: p.id, m: bak.old.map((o) => ({ originalSource: o.url, mediaContentType: 'IMAGE' })) });
  if (cm.productCreateMedia.mediaUserErrors.length) throw new Error(cm.productCreateMedia.mediaUserErrors[0].message);
  await sleep(4000);
  await gql(`mutation($id:ID!,$m:[ID!]!){ productDeleteMedia(productId:$id, mediaIds:$m){ deletedMediaIds mediaUserErrors{ message } } }`, { id: p.id, m: bak.new });
  fs.renameSync(path.join(OUT, p.handle, 'media-backup.json'), path.join(OUT, p.handle, 'media-backup.rolledback.json')); log('rolled back', p.handle);
}

// ========== main ==========
const run = {
  fetch: fetchStage,
  classify: async () => pool(loadProducts(), CONC, classify),
  cutout: async () => { let ps = loadProducts(); if (args['ready-only']) ps = ps.filter((p) => fs.existsSync(path.join(OUT, p.handle, 'classify.json'))); else for (const p of ps) if (!fs.existsSync(path.join(OUT, p.handle, 'classify.json'))) await classify(p); const jobs = ps.map(cutoutJobs).filter(Boolean); log('cutout jobs', jobs.length); if (jobs.length) py('cutout', jobs); },
  // follow：主进程 classify 跑着的时候，并行把已分类的商品推进到成品（cutout→spec→render→preview），循环直到全部完成
  follow: async () => { for (;;) { await run.cutout(); await run.spec(); await run.render(); await run.preview(); const ps = loadProducts(); const done = ps.filter((p) => fs.existsSync(path.join(OUT, p.handle, 'final', '08-trust.png'))).length; log(`follow: final ${done}/${ps.length}`); if (done >= ps.length) break; await sleep(Number(args.interval ?? 600) * 1000); } },
  spec: async () => pool(loadProducts(), CONC, spec),
  render: async () => { for (const p of loadProducts()) { try { render(p); } catch (e) { log('ERR render', p.handle, e.message); fs.appendFileSync(path.join(OUT, 'errors.log'), `${new Date().toISOString()} render ${p.handle} ${e.message}\n`); } } },
  preview: async () => { const jobs = previewJobs(loadProducts()); log('preview jobs', jobs.length); if (jobs.length) py('sheet', jobs); },
  publish: async () => pool(loadProducts(), 2, publish),
  rollback: async () => { for (const p of loadProducts()) await rollback(p); },
  all: async () => { await run.classify(); await run.cutout(); await run.spec(); await run.render(); await run.preview(); },
};
if (!run[stage]) { console.error('stage?', Object.keys(run).join('|')); process.exit(1); }
run[stage]().then(() => log('done', stage)).catch((e) => { console.error(e); process.exit(1); });
