#!/usr/bin/env node
/**
 * 商品販売ショート動画（15〜30 秒、9:16 ＋ 16:9）を半自動で作る。商品本体は実写真のまま、AI は「動き」と「ナレーション」だけ。
 *
 *   node tools/product-video/video.mjs pick    --spu stqi-ctbl-001,TB-04,gd011     # 素材：草稿箱の画像（out/drafts/<spu>.json）か Shopify → work/<spu>/src/NN.jpg
 *   node tools/product-video/video.mjs script  --spu ... [--window 20-10]          # 6kpro：3〜4 カットの絵コンテ（どの写真・字幕≤12字・ナレ≤30字、facts だけ）→ storyboard.json
 *   node tools/product-video/video.mjs animate --spu ...                           # 可灵 image→video 5 秒/カット（カメラワークだけ指示、商品は変えない）→ clips/NN.mp4
 *   node tools/product-video/video.mjs voice   --spu ...                           # VOICEVOX（ローカル 50021）で日本語ナレーション → vo/NN.wav
 *   node tools/product-video/video.mjs render  --spu ...                           # ffmpeg：1080×1920 と 1920×1080、字幕はコード描画（Noto/游ゴシック）、BGM 任意 → final/<spu>-9x16.mp4, -16x9.mp4
 *   node tools/product-video/video.mjs check   --spu ...                           # 規約チェック（価格/送料/No.1/最強/他社名/医療効能、尺、解像度）→ check.json
 *   node tools/product-video/video.mjs all     --spu ...                           # pick→script→animate→voice→render→check
 *
 * .env（Windows、git に入れない）：
 *   KLING_BASE_URL=https://api.klingai.com      KLING_ACCESS_KEY= / KLING_SECRET_KEY=（公式：JWT）  または  KLING_API_KEY=（中継サービス：Bearer）
 *   KLING_MODEL=kling-v2-6  KLING_MODE=std      VOICEVOX_URL=http://127.0.0.1:50021  VOICEVOX_SPEAKER=2
 *   VIDEO_MOTION=real|kling（既定 real：写真を ffmpeg で動かす、可灵不使用） VIDEO_VO=off|on（既定 real なら off） VIDEO_BGM=BGM ファイル
 *   VIDEO_FONT=C:/Windows/Fonts/YuGothB.ttc     VIDEO_BGM=（任意、ロイヤリティフリー mp3 のパス）
 * 鉄則：商品の形・色・ロゴを AI に触らせない（可灵は image2video のみ、prompt はカメラと光だけ）。数字と効能は brief.json / 草稿の facts にあるものだけ。
 *       価格・送料・セール・No.1・最強・他社名・医療効能は禁止（Amazon 主図動画規約）。生成物は用户承認後にだけ公開する。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { waitLLM } from '../night/window.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/product-video/out'); fs.mkdirSync(OUT, { recursive: true });
const DRAFTS = path.join(ROOT, 'tools/rakuten/out/drafts');
const argv = process.argv.slice(2); const cmd = argv[0];
const args = Object.fromEntries(argv.slice(1).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash';
const WIN = args.window ?? env.LLM_WINDOW ?? '';
const KL = { base: (env.KLING_BASE_URL || 'https://api.klingai.com').replace(/\/$/, ''), ak: env.KLING_ACCESS_KEY, sk: env.KLING_SECRET_KEY, key: env.KLING_API_KEY, model: env.KLING_MODEL || 'kling-v2-6', mode: env.KLING_MODE || 'std' };
const VV = { url: (env.VOICEVOX_URL || 'http://127.0.0.1:50021').replace(/\/$/, ''), speaker: Number(env.VOICEVOX_SPEAKER || 2) };
const FONT = env.VIDEO_FONT || 'C:/Windows/Fonts/YuGothB.ttc', BGM = env.VIDEO_BGM || '';
// 2026-10-26 用户反馈「AI 味太重」→ 既定を real に：商品写真は一切 AI に通さず ffmpeg のズーム/パンだけで動かす。ナレーションも既定オフ（字幕＋BGM）。
//   --motion kling で従来の可灵 image2video、--vo on で VOICEVOX ナレーションを戻せる。
const MOTION = args.motion ?? env.VIDEO_MOTION ?? 'real';
const VO_ON = (args.vo ?? env.VIDEO_VO ?? (MOTION === 'real' ? 'off' : 'on')) === 'on';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8')); const W = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n'); };
const spus = String(args.spu ?? '').split(',').map((s) => s.trim()).filter(Boolean);
if (!cmd || !spus.length) { console.log('usage: video.mjs <pick|script|animate|voice|render|check|all> --spu A,B,C'); process.exit(1); }
const dir = (spu) => path.join(OUT, spu.replace(/[\\/:*?"<>|]/g, '_'));
const ffmpeg = (a) => { const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('ffmpeg: ' + (r.stderr || '').slice(-400)); };
const ffprobe = (f) => { const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,duration', '-of', 'json', f], { encoding: 'utf8' }); return JSON.parse(r.stdout || '{}').streams?.[0] ?? {}; };

// ───────── 素材 ─────────
const pick = (o, ks) => { for (const k of ks) if (o?.[k]) return o[k]; };
const isImg = (s) => typeof s === 'string' && /^https?:\/\/\S+\.(jpe?g|png|webp)(\?\S*)?$/i.test(s);
function draftOf(spu) {
  const f = path.join(DRAFTS, `${spu}.json`); if (!fs.existsSync(f)) return null;
  const d = J(f); const p0 = d.product ?? d; const p = { ...p0, ...(p0.SPU ?? {}), Images: p0.Images, SKUs: p0.SKUs }; // 斑馬：名前・説明は product.SPU の下
  let imgs = pick(p, ['Images', 'ImageList', 'ImgList', 'Pictures', 'images']) ?? [];
  const urls = (Array.isArray(imgs) ? imgs : []).map((x) => typeof x === 'string' ? x : pick(x, ['Url', 'ImageUrl', 'Src', 'url', 'src'])).filter(isImg);
  const name = pick(p, ['Title', 'ItemName', 'ProductName', 'Name', 'title']) ?? spu;
  const desc = String(pick(p, ['DescriptionForPC', 'PcDescription', 'Description', 'SalesDescription', 'description']) ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const skus = pick(p, ['SKUs', 'Skus', 'SkuList', 'skus']) ?? []; const price = Math.min(...(Array.isArray(skus) ? skus : []).map((s) => Number(pick(s, ['StandardPrice', 'Price', 'SalePrice', 'price'])) || Infinity));
  return { spu, name, desc, urls, price: Number.isFinite(price) ? price : null };
}
async function download(url, dst) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); fs.writeFileSync(dst, Buffer.from(await r.arrayBuffer())); return; } catch (e) { if (i === 2) throw e; await sleep(1500); } } }
async function pickStage(spu) {
  const d = draftOf(spu); if (!d) throw new Error(`草稿が無い: tools/rakuten/out/drafts/${spu}.json（先に banma-export）`);
  const src = path.join(dir(spu), 'src'); fs.mkdirSync(src, { recursive: true });
  const files = [];
  for (const [i, u] of d.urls.slice(0, 12).entries()) { const f = path.join(src, `${String(i + 1).padStart(2, '0')}.jpg`); if (!fs.existsSync(f)) await download(u, f); files.push(path.basename(f)); }
  W(path.join(dir(spu), 'product.json'), { ...d, files, pickedAt: new Date().toISOString() });
  log('pick', spu, files.length, 'images');
}

// ───────── 絵コンテ（6kpro） ─────────
const BANNED = /価格|円|¥|送料|セール|SALE|割引|クーポン|No\.?\s?1|ナンバーワン|最強|最高級|日本一|業界初|世界一|絶対|完全|永久|治る|治療|効く|痩せる|バストアップ|美白|抗菌率|殺菌|医療|iPhone|Apple|ダイソン|Dyson|ニトリ|無印|IKEA|Amazon|楽天/i;
const SYS = `あなたは日本の EC 向け商品ショート動画のディレクター。与えられた商品写真の一覧と事実テキストから、15〜25 秒の縦動画の絵コンテを作る。
ルール：①カットは 3〜4、各 5 秒 ②各カットは写真番号 1 枚を指定（商品本体はその写真のまま、AI は動かすだけ）③字幕は全角 12 字以内、ナレーションは 30 字以内、やさしい丁寧語 ④数字・素材・サイズは事実テキストにあるものだけ。無いものは書かない ⑤禁止：価格・送料・セール・No.1・最強・日本一・絶対・医療効能・他社ブランド名 ⑥カメラ指示（camera）は英語で短く：slow push-in / orbit left 15° / tilt up / gentle zoom out のいずれか系統。商品の形を変える指示は禁止
出力 JSON のみ：{"hook":"最初の字幕（悩み or 一番の価値）","shots":[{"n":1,"img":3,"caption":"字幕","vo":"ナレーション","camera":"slow push-in on the product, soft daylight, nothing else changes"}],"cta":"最後の字幕（例：詳しくは商品ページへ）"}`;
async function chatJson(messages) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model: MODEL, temperature: 0.4, max_tokens: 2000, response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false }, messages }) });
    const j = await r.json(); const c = j.choices?.[0]?.message?.content; if (c) { try { return JSON.parse(c); } catch { return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); } }
    await sleep(3000);
  }
  throw new Error('6kpro: no content');
}
async function scriptStage(spu) {
  const p = J(path.join(dir(spu), 'product.json'));
  if (!(await waitLLM(LLM, WIN, log))) throw new Error('WINDOW_CLOSED');
  const user = `商品名: ${p.name}\n写真: ${p.files.map((f, i) => `${i + 1}=${f}`).join(', ')}（番号順は商品ページの掲載順。1 が主図）\n事実テキスト（ここに無い数字は使わない）:\n${p.desc.slice(0, 3000)}`;
  let sb; for (let k = 0; k < 3; k++) { sb = await chatJson([{ role: 'system', content: SYS }, { role: 'user', content: user }]); const bad = [sb.hook, sb.cta, ...(sb.shots ?? []).flatMap((s) => [s.caption, s.vo])].filter((t) => BANNED.test(String(t ?? ''))); if (!bad.length && (sb.shots ?? []).length >= 3) break; log('storyboard retry', spu, bad.slice(0, 3)); }
  sb.shots = (sb.shots ?? []).slice(0, 4).map((s, i) => ({ ...s, n: i + 1, img: Math.min(Math.max(1, Number(s.img) || 1), p.files.length) }));
  W(path.join(dir(spu), 'storyboard.json'), { ...sb, model: MODEL, at: new Date().toISOString() });
  log('script', spu, sb.shots.map((s) => `#${s.n} img${s.img} ${s.caption}`).join(' | '));
}

// ───────── 可灵 image→video ─────────
function klingAuth() {
  if (KL.ak && KL.sk) { const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); const now = Math.floor(Date.now() / 1000); const h = b64({ alg: 'HS256', typ: 'JWT' }), pl = b64({ iss: KL.ak, exp: now + 1800, nbf: now - 5 }); const sig = crypto.createHmac('sha256', KL.sk).update(`${h}.${pl}`).digest('base64url'); return `Bearer ${h}.${pl}.${sig}`; }
  if (KL.key) return `Bearer ${KL.key}`;
  throw new Error('.env に KLING_ACCESS_KEY/KLING_SECRET_KEY（公式）か KLING_API_KEY（中継）を設定');
}
async function kling(pathname, body) { const r = await fetch(`${KL.base}${pathname}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: klingAuth() }, body: body ? JSON.stringify(body) : undefined }); const j = await r.json().catch(() => ({})); if (!r.ok || (j.code && j.code !== 0)) throw new Error(`kling ${r.status} ${j.code ?? ''} ${j.message ?? ''}`.trim()); return j.data ?? j; }
async function animateStage(spu) {
  if (MOTION === 'real') { log('animate', spu, 'skip（real: ffmpeg zoom/pan は render で実行、可灵は使わない）'); return; }
  const sb = J(path.join(dir(spu), 'storyboard.json')); const p = J(path.join(dir(spu), 'product.json'));
  const clips = path.join(dir(spu), 'clips'); fs.mkdirSync(clips, { recursive: true });
  for (const s of sb.shots) {
    const out = path.join(clips, `${String(s.n).padStart(2, '0')}.mp4`); if (fs.existsSync(out) && !args.force) continue;
    const img = fs.readFileSync(path.join(dir(spu), 'src', p.files[s.img - 1])).toString('base64');
    const prompt = `${s.camera}. Keep the product exactly as in the photo: same shape, color, logo and text. Photorealistic, clean, no people, no added objects, no text.`;
    const t = await kling('/v1/videos/image2video', { model_name: KL.model, image: img, prompt, negative_prompt: 'deformed product, extra objects, text, watermark, people, morphing, changed color', cfg_scale: 0.5, mode: KL.mode, duration: '5' });
    const id = t.task_id; log('kling task', spu, s.n, id);
    let url; for (let i = 0; i < 60; i++) { await sleep(10000); const q = await kling(`/v1/videos/image2video/${id}`); if (q.task_status === 'succeed') { url = q.task_result?.videos?.[0]?.url; break; } if (q.task_status === 'failed') throw new Error(`kling failed: ${q.task_status_msg}`); }
    if (!url) throw new Error('kling timeout'); await download(url, out); log('clip', spu, s.n, 'ok');
    fs.appendFileSync(path.join(OUT, 'kling-usage.jsonl'), JSON.stringify({ at: new Date().toISOString(), spu, shot: s.n, task: id, model: KL.model, mode: KL.mode, sec: 5 }) + '\n');
  }
}

// ───────── VOICEVOX ─────────
async function voiceStage(spu) {
  if (!VO_ON) { log('voice', spu, 'skip（ナレーションなし：字幕＋BGM）'); return; }
  const sb = J(path.join(dir(spu), 'storyboard.json')); const vo = path.join(dir(spu), 'vo'); fs.mkdirSync(vo, { recursive: true });
  for (const s of sb.shots) {
    const out = path.join(vo, `${String(s.n).padStart(2, '0')}.wav`); if (fs.existsSync(out) && !args.force) continue;
    const q = await (await fetch(`${VV.url}/audio_query?speaker=${VV.speaker}&text=${encodeURIComponent(s.vo)}`, { method: 'POST' })).json();
    q.speedScale = 1.05; q.outputSamplingRate = 48000;
    const r = await fetch(`${VV.url}/synthesis?speaker=${VV.speaker}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) }); if (!r.ok) throw new Error('voicevox ' + r.status);
    fs.writeFileSync(out, Buffer.from(await r.arrayBuffer())); log('vo', spu, s.n);
  }
}

// ───────── ffmpeg 合成 ─────────
const esc = (t) => String(t).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'").replace(/%/g, '\\%');
function renderStage(spu) {
  const sb = J(path.join(dir(spu), 'storyboard.json')); const d = dir(spu); const p = J(path.join(d, 'product.json')); const fin = path.join(d, 'final'); fs.mkdirSync(fin, { recursive: true });
  for (const [W_, H_, tag] of [[1080, 1920, '9x16'], [1920, 1080, '16x9']]) {
    const parts = [];
    for (const s of sb.shots) {
      const clip = path.join(d, 'clips', `${String(s.n).padStart(2, '0')}.mp4`), wav = path.join(d, 'vo', `${String(s.n).padStart(2, '0')}.wav`), seg = path.join(d, 'clips', `${String(s.n).padStart(2, '0')}-${tag}.mp4`);
      const fsz = tag === '9x16' ? 52 : 44, y = tag === '9x16' ? 'h*0.80' : 'h*0.86';
      // 日本の EC 商品動画の定番：小さめの白文字＋半透明の黒帯。叫ばない。
      const draw = [`drawtext=fontfile='${esc(FONT)}':text='${esc(s.caption)}':fontsize=${fsz}:fontcolor=white:box=1:boxcolor=black@0.45:boxborderw=16:x=(w-text_w)/2:y=${y}`];
      if (s.n === 1 && sb.hook) draw.unshift(`drawtext=fontfile='${esc(FONT)}':text='${esc(sb.hook)}':fontsize=${fsz + 8}:fontcolor=white:box=1:boxcolor=#BF0000@0.85:boxborderw=16:x=(w-text_w)/2:y=h*0.10:enable='lt(t,3)'`);
      if (s.n === sb.shots.length && sb.cta) draw.push(`drawtext=fontfile='${esc(FONT)}':text='${esc(sb.cta)}':fontsize=${fsz - 6}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=14:x=(w-text_w)/2:y=h*0.91:enable='gt(t,2)'`);
      const a = (VO_ON && fs.existsSync(wav)) ? ['-i', wav, '-map', '0:v', '-map', '1:a', '-shortest'] : ['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-shortest'];
      const fade = 'fade=t=in:st=0:d=0.35,fade=t=out:st=4.65:d=0.35';
      if (MOTION === 'real') {
        // 実写静止画を ffmpeg zoompan で動かす（Ken Burns）。AI は一切通さないので商品が変形しない。ショット番号で動きを変える。
        const img = path.join(d, 'src', p.files[s.img - 1]); const F = 150; // 5 秒 × 30fps
        const mv = [
          `z='1+0.10*on/${F}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,                       // ゆっくり寄る
          `z='1.12':x='(iw-iw/zoom)*on/${F}':y='ih/2-(ih/zoom/2)'`,                              // 左→右にパン
          `z='1.12-0.10*on/${F}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'`,                    // ゆっくり引く
          `z='1.12':x='iw/2-(iw/zoom/2)':y='(ih-ih/zoom)*(1-on/${F})'`,                          // 下→上にパン
        ][(s.n - 1) % 4];
        const bw = W_ * 2, bh = H_ * 2; // 先に大きく拡大してから zoompan（ガタつき防止）
        const vf = `scale=${bw}:${bh}:force_original_aspect_ratio=increase:flags=lanczos,crop=${bw}:${bh},zoompan=${mv}:d=${F}:s=${W_}x${H_}:fps=30,${fade},${draw.join(',')},format=yuv420p`;
        ffmpeg(['-i', img, ...a, '-vf', vf, '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-t', '5', seg]); parts.push(seg); continue;
      }
      const vf = `scale=${W_}:${H_}:force_original_aspect_ratio=increase,crop=${W_}:${H_},${fade},${draw.join(',')},format=yuv420p`;
      ffmpeg(['-i', clip, ...a, '-vf', vf, '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-t', '5', seg]); parts.push(seg);
    }
    const list = path.join(d, `concat-${tag}.txt`); fs.writeFileSync(list, parts.map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    const out = path.join(fin, `${spu}-${tag}.mp4`);
    if (BGM && fs.existsSync(BGM)) ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-stream_loop', '-1', '-i', BGM, '-filter_complex', '[1:a]volume=0.12[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]', '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-shortest', out]);
    else ffmpeg(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', out]);
    log('render', spu, tag, out);
  }
}

// ───────── 規約チェック ─────────
function checkStage(spu) {
  const d = dir(spu); const sb = J(path.join(d, 'storyboard.json')); const issues = [];
  for (const t of [sb.hook, sb.cta, ...sb.shots.flatMap((s) => [s.caption, s.vo])]) { const m = String(t ?? '').match(BANNED); if (m) issues.push(`禁止語「${m[0]}」: ${t}`); }
  for (const s of sb.shots) if ([...String(s.caption)].length > 12) issues.push(`字幕 12 字超: ${s.caption}`);
  for (const tag of ['9x16', '16x9']) { const f = path.join(d, 'final', `${spu}-${tag}.mp4`); if (!fs.existsSync(f)) { issues.push(`${tag} 未生成`); continue; } const st = ffprobe(f); const dur = Number(st.duration); if (dur < 10 || dur > 30) issues.push(`${tag} 尺 ${dur.toFixed(1)}s（10〜30 外）`); if (tag === '9x16' && !(st.width === 1080 && st.height === 1920)) issues.push(`${tag} 解像度 ${st.width}x${st.height}`); }
  W(path.join(d, 'check.json'), { pass: !issues.length, issues, at: new Date().toISOString() }); log('check', spu, issues.length ? issues : 'pass');
}

const stages = { pick: pickStage, script: scriptStage, animate: animateStage, voice: voiceStage, render: renderStage, check: checkStage };
const order = cmd === 'all' ? Object.keys(stages) : [cmd]; if (!order.every((s) => stages[s])) { console.log('unknown stage', cmd); process.exit(1); }
for (const spu of spus) for (const s of order) { try { await stages[s](spu); } catch (e) { log('ERR', s, spu, e.message); fs.appendFileSync(path.join(OUT, 'errors.log'), `${new Date().toISOString()} ${s} ${spu} ${e.message}\n`); break; } }
