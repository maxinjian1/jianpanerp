/**
 * 国内 AI（6kpro）指挥 ComfyUI 改商品图 —— 商品像素不动，只改背景/补边/去字/清晰度
 *
 *   node tools/comfy/run.mjs check                                   # ComfyUI 是否在线、workflows/ 是否齐全、6kpro 是否通
 *   node tools/comfy/run.mjs plan   --handles <file|h1,h2>           # 6kpro 看原图 → 每张图要做哪些操作 → out/<h>/plan.json
 *   node tools/comfy/run.mjs edit   --handles ...                    # 按计划执行（compose.py 保护商品 + ComfyUI 生成）→ out/<h>/edit/NN.png
 *   node tools/comfy/run.mjs qc     --handles ...                    # 6kpro 对比前后：同一商品？变形？新增文字？→ 不合格自动换 seed 重做（最多 2 次）
 *   node tools/comfy/run.mjs sheet  --handles ...                    # 前后对比联络表 → tools/comfy/out-preview/<h>.jpg（入库给用户审核）
 *   node tools/comfy/run.mjs all    --handles ...                    # plan → edit → qc → sheet
 *
 * 输入：tools/product-images/out/<handle>/src/NN.jpg（批发商原图，已在 Windows 本地）
 * ComfyUI：COMFY_URL（默认 http://127.0.0.1:8188）。workflows/<op>.json 是 ComfyUI「Export (API)」导出的图，
 *   字符串里放占位符：{{IMAGE}} {{MASK}} {{PROMPT}} {{NEG}} {{SEED}} {{SIZE}}（数值占位符写成 "{{SEED}}" 字符串，替换后自动转数字）
 *   需要的 op：outpaint（补边）、background（换背景）、inpaint（去字）、upscale（放大）。缺哪个就跳过那类操作。
 * 发布：不在这里。用户审核通过的 handle 写进 tools/product-images/approved.txt，再由发布脚本上传（approved 以外一律不发）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, 'tools/product-images/out');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const PREVIEW = path.join(__dirname, 'out-preview'); fs.mkdirSync(PREVIEW, { recursive: true });
const WF = path.join(__dirname, 'workflows');
const stage = process.argv[2];
const args = Object.fromEntries(process.argv.slice(3).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_VISION_MODEL || env.CN_LLM_MODEL || 'GLM-5.3-Flash';
const COMFY = (env.COMFY_URL || args.comfy || 'http://127.0.0.1:8188').replace(/\/$/, '');
const PY = env.IMAGE_PY || (process.platform === 'win32' ? path.join(ROOT, 'apps/image-service/venv/Scripts/python.exe') : 'python3');
const SIZE = Number(args.size ?? 1600);

const handles = () => { const h = args.handles ?? args.handle; if (!h) throw new Error('--handles <file|h1,h2>'); return (fs.existsSync(h) ? fs.readFileSync(h, 'utf8').split(/\r?\n/) : h.split(',')).map((s) => s.trim()).filter(Boolean); };
const dirOf = (h, sub = '') => { const d = path.join(OUT, h, sub); fs.mkdirSync(d, { recursive: true }); return d; };
const srcList = (h) => { const d = path.join(SRC, h, 'src'); return fs.existsSync(d) ? fs.readdirSync(d).filter((f) => /^\d+\.(jpe?g|png|webp)$/i.test(f)).sort().map((f) => path.join(d, f)) : []; };
function py(cmd, jobs) { const f = path.join(OUT, `_jobs-${cmd}-${process.pid}.json`); fs.writeFileSync(f, JSON.stringify(jobs)); const r = spawnSync(PY, [path.join(__dirname, 'compose.py'), cmd, f], { encoding: 'utf8', maxBuffer: 1 << 26 }); fs.unlinkSync(f); if (r.status !== 0) throw new Error(`compose ${cmd}: ${r.stderr.slice(-400)}`); return r.stdout.trim().split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)); }
const b64 = (p) => `data:image/${p.endsWith('.png') ? 'png' : 'jpeg'};base64,${fs.readFileSync(p).toString('base64')}`;

async function chatJson(messages, { maxTokens = 3000, retries = 3 } = {}) {
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model: MODEL, temperature: 0.2, max_tokens: maxTokens, response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false }, reasoning_effort: 'low', messages }) });
      const j = await r.json(); const c = j.choices?.[0]?.message?.content; if (!c) throw new Error(`empty ${JSON.stringify(j).slice(0, 200)}`);
      const m = c.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : c);
    } catch (e) { if (i === retries - 1) throw e; await sleep(1500 * (i + 1)); }
  }
}

// ---------- ComfyUI API ----------
const haveWf = (op) => fs.existsSync(path.join(WF, `${op}.json`));
async function upload(file) {
  const fd = new FormData(); fd.append('image', new Blob([fs.readFileSync(file)]), path.basename(file)); fd.append('overwrite', 'true');
  const r = await fetch(`${COMFY}/upload/image`, { method: 'POST', body: fd }); if (!r.ok) throw new Error(`upload ${r.status}`); return (await r.json()).name;
}
async function runWf(op, vars, outFile) {
  let txt = fs.readFileSync(path.join(WF, `${op}.json`), 'utf8');
  for (const [k, v] of Object.entries(vars)) txt = txt.split(`"{{${k}}}"`).join(typeof v === 'number' ? String(v) : JSON.stringify(String(v))).split(`{{${k}}}`).join(String(v).replace(/"/g, '\\"'));
  const wf = JSON.parse(txt);
  const r = await fetch(`${COMFY}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: wf, client_id: 'anet-comfy' }) });
  const j = await r.json(); if (!j.prompt_id) throw new Error(`prompt rejected: ${JSON.stringify(j).slice(0, 400)}`);
  for (let i = 0; i < 600; i++) {
    await sleep(2000); const h = await (await fetch(`${COMFY}/history/${j.prompt_id}`)).json(); const it = h[j.prompt_id];
    if (!it) continue; if (it.status?.status_str === 'error') throw new Error(`comfy error ${JSON.stringify(it.status.messages ?? '').slice(0, 400)}`);
    const imgs = Object.values(it.outputs ?? {}).flatMap((o) => o.images ?? []); if (!imgs.length) continue;
    const im = imgs[imgs.length - 1]; const v = await fetch(`${COMFY}/view?filename=${encodeURIComponent(im.filename)}&subfolder=${encodeURIComponent(im.subfolder ?? '')}&type=${im.type ?? 'output'}`);
    fs.writeFileSync(outFile, Buffer.from(await v.arrayBuffer())); return outFile;
  }
  throw new Error('comfy timeout');
}

// ---------- prompts ----------
const PLAN_SYS = `你是日本电商（楽天/Amazon/Shopify）的商品图美工主管。给你一件商品的所有原图（编号 n=1..N），请决定每张图怎么改，让它在日本电商更专业、更好卖，同时**绝对不能改变商品本身**（形状、颜色、文字印刷、配件数量都不能变）。
可用操作（只能从这里选，可组合，按顺序执行）：
- "keep"：已经很好，不改
- "remove_text"：擦掉图上叠加的中文/促销字/水印/对话框（商品本身印的字不擦）
- "pad_square"：补成正方形，不裁剪商品（原图太窄/太扁或商品贴边时用）
- "bg_white"：换成纯白背景（适合主图，Amazon 主图必须纯白）
- "bg_scene"：换成日本家庭/生活场景背景，商品原样放入（只用于 1-2 张，给出英文场景描述 scene_prompt，不能出现人、文字、其他品牌）
- "upscale"：图片模糊或分辨率低于 1000px 时放大增强
- "drop"：图很差（拼图、广告海报、全是文字、其他品牌）不建议使用
输出 JSON：{"category":"品类","main_n":主图编号,"images":[{"n":1,"ops":["remove_text","pad_square","bg_white"],"scene_prompt":"(bg_scene 时必填，英文)","why":"一句中文理由"}],"notes":"整体建议一句"}`;
const QC_SYS = `你是商品图质检。第一张是原图，第二张是改后的图。请严格判断：
1 same_product：是不是同一件商品（形状、颜色、印刷、配件一致）
2 deformed：商品有没有变形、缺失、多出部件、边缘被切掉
3 new_text：有没有新出现的文字/乱码/水印/logo
4 artifacts：背景有没有明显 AI 痕迹（扭曲、重复物体、怪异光影、有人物）
5 better：整体是否比原图更适合日本电商
输出 JSON：{"same_product":true,"deformed":false,"new_text":false,"artifacts":false,"better":true,"ok":true,"reason":"一句中文"}。ok = same_product && !deformed && !new_text && !artifacts && better。`;

// ---------- stages ----------
const run = {
  async check() {
    try { const s = await (await fetch(`${COMFY}/system_stats`)).json(); log('ComfyUI OK', JSON.stringify(s.devices?.map((d) => ({ name: d.name, vram_total: Math.round(d.vram_total / 2 ** 30) + 'GB' })))); } catch (e) { log('ComfyUI NG', COMFY, e.message); }
    for (const op of ['outpaint', 'background', 'inpaint', 'upscale']) log(`workflow ${op}:`, haveWf(op) ? 'OK' : 'missing（该类操作会跳过）');
    try { const r = await fetch(`${LLM}/models`); log('6kpro', r.status); } catch (e) { log('6kpro NG', e.message); }
  },
  async plan() {
    for (const h of handles()) {
      const f = path.join(dirOf(h), 'plan.json'); if (fs.existsSync(f) && !args.force) { log('plan exists', h); continue; }
      const imgs = srcList(h); if (!imgs.length) { log('no src', h); continue; }
      const thumbs = imgs.map((p) => { const t = path.join(SRC, h, 'thumbs', path.basename(p)); return fs.existsSync(t) ? t : p; }).slice(0, 12);
      const content = [{ type: 'text', text: `商品 handle: ${h}\n原图 ${imgs.length} 张，按顺序 n=1..${thumbs.length}` }, ...thumbs.flatMap((t, i) => [{ type: 'text', text: `n=${i + 1}` }, { type: 'image_url', image_url: { url: b64(t) } }])];
      const j = await chatJson([{ role: 'system', content: PLAN_SYS }, { role: 'user', content }]);
      fs.writeFileSync(f, JSON.stringify({ handle: h, ...j }, null, 1)); log('plan', h, (j.images ?? []).map((x) => `${x.n}:${(x.ops ?? []).join('+')}`).join(' '));
    }
  },
  async edit() {
    for (const h of handles()) {
      const pf = path.join(OUT, h, 'plan.json'); if (!fs.existsSync(pf)) { log('no plan', h); continue; }
      const P = JSON.parse(fs.readFileSync(pf, 'utf8')); const imgs = srcList(h); const ed = dirOf(h, 'edit'); const wk = dirOf(h, 'work');
      for (const it of P.images ?? []) {
        const src = imgs[it.n - 1]; if (!src) continue; const ops = it.ops ?? []; const out = path.join(ed, `${String(it.n).padStart(2, '0')}.png`);
        if (ops.includes('drop') || ops.includes('keep') || !ops.length) { continue; }
        if (fs.existsSync(out) && !args.force) continue;
        const seed = Number(it.seed ?? args.seed ?? 1000 + it.n); let cur = src; const tag = String(it.n).padStart(2, '0');
        try {
          const pm = path.join(wk, `${tag}-prodmask.png`); py('mask', [{ src: cur, out: pm }]);
          if (ops.includes('remove_text')) {
            const tm = path.join(wk, `${tag}-textmask.png`); const [r] = py('textmask', [{ src: cur, mask: pm, out: tm }]);
            if (r?.boxes && haveWf('inpaint')) { const o = path.join(wk, `${tag}-notext.png`); await runWf('inpaint', { IMAGE: await upload(cur), MASK: await upload(tm), PROMPT: 'clean background, no text', NEG: 'text, letters, watermark', SEED: seed, SIZE }, o); cur = o; py('mask', [{ src: cur, out: pm }]); }
          }
          if (ops.includes('bg_white') || ops.includes('bg_scene')) {
            const base = path.join(wk, `${tag}-base.jpg`), bm = path.join(wk, `${tag}-bgmask.png`), fm = path.join(wk, `${tag}-fgmask.png`);
            py('prep_bg', [{ src: cur, mask: pm, out: base, maskout: bm, prodmask: fm, size: 1024, scale: ops.includes('bg_scene') ? 0.62 : 0.8 }]);
            const comp = path.join(wk, `${tag}-comp.png`);
            if (ops.includes('bg_scene') && haveWf('background')) {
              const scene = path.join(wk, `${tag}-scene.png`);
              await runWf('background', { IMAGE: await upload(base), MASK: await upload(bm), PROMPT: `${it.scene_prompt || 'bright clean Japanese home interior, soft natural light'}, product photography, realistic, high detail, no people, no text`, NEG: 'people, hands, text, letters, watermark, logo, distorted, extra objects on product', SEED: seed, SIZE: 1024 }, scene);
              py('composite', [{ bg: scene, orig: base, mask: fm, out: comp, feather: 1.2 }]);
            } else {
              py('composite', [{ bgcolor: [255, 255, 255], orig: base, mask: fm, out: comp, feather: 1.0, shadow: true }]);
            }
            cur = comp;
          }
          if (ops.includes('pad_square')) {
            const p = path.join(wk, `${tag}-pad.jpg`), pmk = path.join(wk, `${tag}-padmask.png`); const [r] = py('pad', [{ src: cur, out: p, maskout: pmk, size: SIZE }]);
            if (r?.needs_outpaint && haveWf('outpaint')) { const o = path.join(wk, `${tag}-outpaint.png`); await runWf('outpaint', { IMAGE: await upload(p), MASK: await upload(pmk), PROMPT: 'seamless continuation of the background, product photography', NEG: 'text, watermark, new objects, people', SEED: seed, SIZE }, o); const keep = path.join(wk, `${tag}-padprod.png`); py('mask', [{ src: p, out: keep }]); const c = path.join(wk, `${tag}-padcomp.png`); py('composite', [{ bg: o, orig: p, mask: keep, out: c }]); cur = c; } else cur = p;
          }
          if (ops.includes('upscale') && haveWf('upscale')) { const o = path.join(wk, `${tag}-up.png`); await runWf('upscale', { IMAGE: await upload(cur), SEED: seed, SIZE }, o); cur = o; }
          fs.copyFileSync(cur, out); log('edited', h, it.n, ops.join('+'));
        } catch (e) { log('ERR edit', h, it.n, e.message); fs.appendFileSync(path.join(OUT, 'errors.log'), `${new Date().toISOString()} edit ${h} ${it.n} ${e.message}\n`); }
      }
    }
  },
  async qc() {
    for (const h of handles()) {
      const pf = path.join(OUT, h, 'plan.json'); if (!fs.existsSync(pf)) continue; const P = JSON.parse(fs.readFileSync(pf, 'utf8')); const imgs = srcList(h); const res = {};
      for (const it of P.images ?? []) {
        const out = path.join(OUT, h, 'edit', `${String(it.n).padStart(2, '0')}.png`); if (!fs.existsSync(out)) continue;
        for (let attempt = 0; attempt < 3; attempt++) {
          const q = await chatJson([{ role: 'system', content: QC_SYS }, { role: 'user', content: [{ type: 'text', text: '原图：' }, { type: 'image_url', image_url: { url: b64(imgs[it.n - 1]) } }, { type: 'text', text: '改后：' }, { type: 'image_url', image_url: { url: b64(out) } }] }]);
          res[it.n] = { ...q, attempt }; log('qc', h, it.n, q.ok ? 'OK' : 'NG', q.reason);
          if (q.ok || attempt === 2 || args['no-retry']) break;
          it.seed = 7000 + it.n * 13 + attempt; fs.writeFileSync(pf, JSON.stringify(P, null, 1)); fs.unlinkSync(out); args.force = undefined;
          await run.edit.call(null); if (!fs.existsSync(out)) break;
        }
      }
      fs.writeFileSync(path.join(OUT, h, 'qc.json'), JSON.stringify(res, null, 1));
    }
  },
  sheet() {
    for (const h of handles()) {
      const pf = path.join(OUT, h, 'plan.json'); if (!fs.existsSync(pf)) continue; const P = JSON.parse(fs.readFileSync(pf, 'utf8')); const imgs = srcList(h);
      const qc = fs.existsSync(path.join(OUT, h, 'qc.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, h, 'qc.json'), 'utf8')) : {};
      const rows = [], labels = [];
      for (const it of P.images ?? []) { const out = path.join(OUT, h, 'edit', `${String(it.n).padStart(2, '0')}.png`); const before = imgs[it.n - 1]; if (!before) continue; rows.push([before, fs.existsSync(out) ? out : before]); labels.push(`#${it.n} ${(it.ops ?? []).join('+')} ${qc[it.n] ? (qc[it.n].ok ? 'QC OK' : 'QC NG: ' + qc[it.n].reason) : ''}`); }
      if (!rows.length) continue; const o = path.join(PREVIEW, `${h}.jpg`); py('sheet', [{ rows, labels, out: o }]); log('sheet', o);
    }
  },
  async all() { await run.plan(); await run.edit(); await run.qc(); run.sheet(); },
};
if (!run[stage]) { console.error('usage: check | plan | edit | qc | sheet | all  --handles <file|h1,h2>'); process.exit(2); }
Promise.resolve(run[stage]()).then(() => log('done', stage)).catch((e) => { console.error(e); process.exit(1); });
