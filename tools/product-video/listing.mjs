#!/usr/bin/env node
/**
 * 商品ページの写真から、real モード（実写＋ffmpeg 推拉平移、AI 生成なし）の販売動画を、6kpro の最大活用で作る。
 *   node tools/product-video/listing.mjs <spec.json> crops    # 写真から文字なしの安全な範囲を切り出す → out/<id>/src/NN.jpg ＋ product.json
 *   node tools/product-video/listing.mjs <spec.json> vision   # 6kpro（視覚）が各切り出しを検品：文字残り・露骨さ・解像度
 *   node tools/product-video/listing.mjs <spec.json> board    # 6kpro が絵コンテ 3 案 → 審査役の 6kpro が 1 本に統合 → 禁止語チェック
 *   node tools/product-video/listing.mjs <spec.json> render   # video.mjs render（real）＋ check
 *   node tools/product-video/listing.mjs <spec.json> qa       # 完成動画から各カットのフレームを抜き、6kpro（視覚）が最終検品
 * 面向客户的文字は 6kpro のみ。画面は実写の切り出しだけ（2026-10-26 用户「AI 味太重」）。ローカルモデルは 6kpro 停止時の予備のみ（--local）。
 * spec: { id, name, facts:[...], banned?:[...], crops:[{from,x,y,w,h,note}] }  元写真は out/<id>/orig/<from>
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/product-video/out');
const [specFile, stage] = process.argv.slice(2);
const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
const D = path.join(OUT, spec.id);
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, '');
const MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash', VMODEL = env.CN_LLM_VISION_MODEL || MODEL;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8')); const W = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1) + '\n'); };
const ff = (a) => { const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...a], { encoding: 'utf8' }); if (r.status !== 0) throw new Error('ffmpeg: ' + (r.stderr || '').slice(-300)); };

// 禁止語：video.mjs の BANNED ＋ 商品固有（広告審査・景表法・Amazon 動画規約）
const BANNED = new RegExp('価格|円|¥|送料|セール|SALE|割引|クーポン|No\\.?\\s?1|ナンバーワン|最強|最高級|日本一|業界初|世界一|絶対|完全|永久|治る|効く|痩せる|バストアップ|美白|医療|セクシー|誘惑|色気|エロ|挑発|魅惑|レビュー|口コミ|人気|売れ筋|Amazon|楽天' + (spec.banned?.length ? '|' + spec.banned.join('|') : ''), 'i');

async function chat(messages, { vision = false, json = true, effort = 'high', max = 8000, temp = 0.5 } = {}) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model: vision ? VMODEL : MODEL, temperature: temp, max_tokens: max, reasoning_effort: effort, ...(json ? { response_format: { type: 'json_object' } } : {}), messages }) });
      const j = await r.json(); const c = j.choices?.[0]?.message?.content;
      if (c) { if (!json) return c; try { return JSON.parse(c); } catch { return JSON.parse(c.slice(c.indexOf('{'), c.lastIndexOf('}') + 1)); } }
      log('6kpro: 空応答、再試行', i + 1, JSON.stringify(j).slice(0, 160));
    } catch (e) { log('6kpro error', e.message); }
    await sleep(8000);   // 昼間（北京 10〜20 時）は共有 → 連打しない
  }
  throw new Error('6kpro: no content');
}
const imgPart = (f) => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64') } });

// ───────── crops ─────────
function crops() {
  const src = path.join(D, 'src'); fs.rmSync(src, { recursive: true, force: true }); fs.mkdirSync(src, { recursive: true });
  const files = [];
  spec.crops.forEach((c, i) => {
    const f = `${String(i + 1).padStart(2, '0')}.jpg`;
    const crop = c.w ? `crop=${c.w}:${c.h}:${c.x}:${c.y}` : 'null';
    ff(['-i', path.join(D, 'orig', c.from), '-vf', crop, '-q:v', '2', path.join(src, f)]); files.push(f);
  });
  W(path.join(D, 'product.json'), { spu: spec.id, name: spec.name, desc: spec.facts.join(' / '), files, price: null, pickedAt: new Date().toISOString() });
  log('crops', files.length);
}

// ───────── vision（切り出しの検品） ─────────
async function vision() {
  const p = J(path.join(D, 'product.json')); const res = [];
  for (const [i, f] of p.files.entries()) {
    const note = spec.crops[i].note;
    const r = await chat([{ role: 'user', content: [imgPart(path.join(D, 'src', f)), { type: 'text', text: `これは日本の EC 商品動画に使う写真の切り出し（意図：${note}）。厳しく検品し JSON のみ返す：{"hasText":画像内に文字・ロゴ・透かし・吹き出しが残っているか(true/false),"textSeen":"見えた文字（無ければ空）","cutOff":被写体が不自然に切れているか,"sharp":動画で拡大しても使える鮮明さか,"exposure":"none|low|high"（下着として露骨・性的に見えるリスク。Amazon 商品動画の規約基準）,"describe":"何が写っているか 1 文","caption_hint":"この絵に合う事実だけの字幕案（全角12字以内）"}` }] }], { vision: true, effort: 'high', max: 4000 });
    res.push({ file: f, note, ...r }); log('vision', f, `text=${r.hasText} cut=${r.cutOff} sharp=${r.sharp} risk=${r.exposure} | ${r.describe}`);
    await sleep(1500);
  }
  W(path.join(D, 'vision.json'), res);
}

// ───────── board（3 案 → 審査役が統合） ─────────
const SYS = `あなたは日本の EC 向けランジェリー・ナイトウェア商品の販売動画ディレクター（Amazon 商品動画・Instagram 向け、実写写真をゆっくり動かすだけの動画。AI 生成映像・ナレーションなし、字幕とカット割りで見せる）。
調性：上品・清潔感・安心感・心地よさ。叫ばない。性的な含みを持たせない。
ルール：①カットは 5 つ（各 5 秒、合計 25 秒）②各カットは写真番号 1 つを指定（番号は下の一覧）③字幕は全角 12 字以内、ひとつの事実だけ ④事実テキストにある内容だけ。数字・素材名・サイズ・色は事実テキストにあるものだけ ⑤禁止：価格・送料・セール・No.1・人気・レビュー・「セクシー」「誘惑」「色気」・効能断言・他社名 ⑥写真に写っていないことは字幕にしない（字幕は写真と一致）⑦ hook（最初の 3 秒の見出し）は全角 14 字以内、cta は全角 14 字以内で「詳しくは商品ページへ」系
camera：1=slow push-in 2=pan left→right 3=slow pull-out 4=pan bottom→top を n に応じて使う（動きは自動、camera 欄は短い英語メモのみでよい）。
出力 JSON のみ：{"hook":"","shots":[{"n":1,"img":1,"caption":"","why":"この写真とこの順にした理由"}],"cta":""}`;
const factText = () => `商品名: ${spec.name}\n事実テキスト:\n- ${spec.facts.join('\n- ')}`;
async function board() {
  const v = fs.existsSync(path.join(D, 'vision.json')) ? J(path.join(D, 'vision.json')) : [];
  const list = v.length ? v.map((x, i) => `${i + 1}=${x.describe}（検品:文字${x.hasText ? 'あり' : 'なし'}・字幕案「${x.caption_hint}」）`).join('\n') : spec.crops.map((c, i) => `${i + 1}=${c.note}`).join('\n');
  const user = `${factText()}\n\n使える写真（番号）:\n${list}`;
  const cands = [];
  for (const [k, t] of [[0, 0.5], [1, 0.8], [2, 1.0]]) { const c = await chat([{ role: 'system', content: SYS }, { role: 'user', content: user }], { temp: t }); cands.push(c); log('案', k + 1, c.hook, '|', (c.shots || []).map((s) => `img${s.img}:${s.caption}`).join(' / ')); await sleep(2000); }
  const judge = await chat([{ role: 'system', content: SYS + '\nあなたは今、審査役。3 案を比べ、各案の良い点を取り込んだ最終案を 1 つ作る。字幕は写真と事実に厳密に一致させ、全角文字数（12/14）を数えて守る。同じ写真を 2 回使わない。出力は同じ JSON に "review":"3 案の比較と最終案にした理由（中国語 3〜5 行）" を足す。' }, { role: 'user', content: `${user}\n\n案1: ${JSON.stringify(cands[0])}\n案2: ${JSON.stringify(cands[1])}\n案3: ${JSON.stringify(cands[2])}` }], { temp: 0.3 });
  for (const s of judge.shots) s.img = Math.min(Math.max(1, Number(s.img) || 1), spec.crops.length);
  judge.shots = judge.shots.slice(0, 5).map((s, i) => ({ ...s, n: i + 1, vo: '' }));
  const bad = [judge.hook, judge.cta, ...judge.shots.map((s) => s.caption)].filter((t) => BANNED.test(String(t ?? '')) || [...String(t ?? '')].length > 14);
  if (bad.length) { log('★ 規約/字数 NG、再審査に回す:', bad); judge._issues = bad; }
  W(path.join(D, 'storyboard.json'), { ...judge, model: MODEL, candidates: cands, at: new Date().toISOString() });
  log('最終案', judge.hook, '|', judge.shots.map((s) => `#${s.n} img${s.img} ${s.caption}`).join(' | '), '| cta', judge.cta);
  console.log(judge.review);
}

// ───────── render / qa ─────────
function render() {
  fs.mkdirSync(path.join(D, 'clips'), { recursive: true });
  for (const st of ['render', 'check']) { const r = spawnSync('node', [path.join(ROOT, 'tools/product-video/video.mjs'), st, '--spu', spec.id], { encoding: 'utf8', env: { ...process.env, VIDEO_MOTION: 'real', VIDEO_VO: 'off' } }); console.log(r.stdout + r.stderr); }
}
async function qa() {
  const sb = J(path.join(D, 'storyboard.json')); const out = []; const fr = path.join(D, 'qa-frames'); fs.mkdirSync(fr, { recursive: true });
  for (const tag of ['9x16', '16x9']) {
    const mp4 = path.join(D, 'final', `${spec.id}-${tag}.mp4`);
    for (const s of sb.shots) {
      const t = (s.n - 1) * 5 + 2.0, f = path.join(fr, `${tag}-${s.n}.jpg`);
      ff(['-ss', String(t), '-i', mp4, '-frames:v', '1', '-vf', tag === '9x16' ? 'scale=540:-1' : 'scale=960:-1', '-q:v', '3', f]);
      const r = await chat([{ role: 'user', content: [imgPart(f), { type: 'text', text: `これは日本の EC 商品動画（${tag}）の一場面。字幕は「${s.caption}」${s.n === 1 ? `、冒頭見出し「${sb.hook}」` : ''}${s.n === sb.shots.length ? `、最後の字幕「${sb.cta}」` : ''}。厳しく検品して JSON のみ：{"subtitleReadable":字幕が読みやすく画面から切れていないか,"subtitleMatchesPicture":字幕の内容が写真に写っているものと一致しているか,"bgDistracting":ぼかし背景や余白が見苦しくないか,"productCutOff":商品が不自然に切れていないか,"exposure":"none|low|high（下着として露骨に見えるリスク）","textInPhoto":写真内に他の文字が残っているか,"score":1-10（このまま Amazon/Instagram に出せる品質か）,"fix":"直すべき点（無ければ空）"}` }] }], { vision: true, effort: 'high', max: 4000 });
      out.push({ tag, shot: s.n, caption: s.caption, ...r }); log('qa', tag, '#' + s.n, `score=${r.score} readable=${r.subtitleReadable} match=${r.subtitleMatchesPicture} cut=${r.productCutOff} risk=${r.exposure} ${r.fix || ''}`); await sleep(1500);
    }
  }
  W(path.join(D, 'qa.json'), out);
  const avg = out.reduce((a, x) => a + (Number(x.score) || 0), 0) / out.length; log('QA 平均', avg.toFixed(1), '最低', Math.min(...out.map((x) => Number(x.score) || 0)));
}

// ───────── revise：QA の指摘を 6kpro に返して絵コンテを直す。合格（全カット 8 点以上・字幕一致）まで最大 3 周 ─────────
async function revise() {
  const sb = J(path.join(D, 'storyboard.json')); const qaR = J(path.join(D, 'qa.json')); const v = J(path.join(D, 'vision.json'));
  const notes = sb.shots.map((s) => { const q = qaR.filter((x) => x.shot === s.n); return `#${s.n} img${s.img}「${s.caption}」: ` + q.map((x) => `[${x.tag} ${x.score}点 一致=${x.subtitleMatchesPicture} 切れ=${x.productCutOff}] ${x.fix || ''}`).join(' '); }).join('\n');
  const list = v.map((x, i) => `${i + 1}=${x.describe}${x.hasText ? `（写真内に既に文字あり：${x.textSeen}）` : ''}`).join('\n');
  const r = await chat([{ role: 'system', content: SYS + '\n追加ルール：①写真内に既に同じ内容の文字がある写真（上の「既に文字あり」）は caption を空文字 "" にしてよい（二重にしない）②hook はどのカットの caption とも違う文言にする③字幕は各写真の説明（下の一覧）に写っているものと完全に一致させる。例：ストラップの字幕は金具のアップの写真に付ける④同じ写真は 2 回使わない⑤質検の指摘を全部反映する。出力は同じ JSON ＋ "review":"何をどう直したか（中国語 3 行以内）"。' }, { role: 'user', content: `${factText()}\n\n写真:\n${list}\n\n現在の絵コンテ: ${JSON.stringify({ hook: sb.hook, shots: sb.shots.map(({ n, img, caption }) => ({ n, img, caption })), cta: sb.cta })}\n\n成片の質検（6kpro 視覚）の指摘:\n${notes}` }], { temp: 0.3 });
  for (const s of r.shots) { s.img = Math.min(Math.max(1, Number(s.img) || 1), spec.crops.length); s.caption = String(s.caption ?? ''); }
  r.shots = r.shots.slice(0, 5).map((s, i) => ({ ...s, n: i + 1, vo: '' }));
  const bad = [r.hook, r.cta, ...r.shots.map((s) => s.caption)].filter((t) => t && (BANNED.test(t) || [...t].length > 14));
  if (bad.length) throw new Error('規約/字数 NG: ' + bad.join(' | '));
  W(path.join(D, 'storyboard.json'), { ...r, model: MODEL, history: [...(sb.history || []), { hook: sb.hook, shots: sb.shots.map(({ n, img, caption }) => ({ n, img, caption })), cta: sb.cta }], at: new Date().toISOString() });
  log('改訂案', r.hook, '|', r.shots.map((s) => `#${s.n} img${s.img} 「${s.caption}」`).join(' | '), '| cta', r.cta); console.log(r.review);
}
async function loop() {
  for (let k = 0; k < 3; k++) {
    await revise(); render(); await qa();
    const q = J(path.join(D, 'qa.json')); const min = Math.min(...q.map((x) => Number(x.score) || 0)); const mism = q.filter((x) => x.subtitleMatchesPicture === false || x.productCutOff === true);
    log(`周 ${k + 1}: 最低 ${min}、不一致/切れ ${mism.length}`); if (min >= 8 && !mism.length) return log('合格');
  }
  log('3 周で基準に届かず：qa.json を人が確認');
}

const stages = { crops, vision, board, render, qa, revise, loop };
if (!stages[stage]) { console.log('usage: listing.mjs <spec.json> <crops|vision|board|render|qa>'); process.exit(1); }
await stages[stage]();
