#!/usr/bin/env node
/**
 * 課程ダイジェスト：買った動画教程を Windows のローカルモデルに「見せて」学ばせ、検索できる知識庫（SQLite + Markdown）と Claude skill に変える。
 * 用户 2026-10-25：「用 Windows 大模型自己看视频、自己学习、做成数据库、做成 skill」。社内学習用途のみ（講座の再配布はしない）。
 *
 *   node tools/course-digest/digest.mjs scan       --dir "D:\BaiduNetdiskDownload\2026漫剧短剧全新教程（10月）"   # 目録 → out/inventory.json
 *   node tools/course-digest/digest.mjs transcribe [--limit N]     # faster-whisper（RTX 4080、中国語）→ out/transcripts/<id>.json
 *   node tools/course-digest/digest.mjs frames     [--limit N]     # ffmpeg 場面転換で抽出（≤40 枚/本）→ out/frames/<id>/
 *   node tools/course-digest/digest.mjs docs                       # PDF/DOCX/TXT/MD/JSON を文字に → out/docs/<id>.txt
 *   node tools/course-digest/digest.mjs notes      [--limit N]     # ローカル VL モデルが画面を読み、テキストモデルが「手順・ツール・提示詞・パラメータ・落とし穴」に整理 → out/notes/<id>.json + .md
 *   node tools/course-digest/digest.mjs db                         # out/course.db（SQLite + FTS5）＋ docs/course-digest/README.md（目次）
 *   node tools/course-digest/digest.mjs skills     [--install]     # テーマ別 SKILL.md 草稿 → out/skills/；--install で .claude/skills/ai-drama-<topic>/ に配置
 *   node tools/course-digest/digest.mjs ask "可灵で人物を一致させるには"  # FTS 検索 → ローカルモデルが根拠付きで回答
 *   node tools/course-digest/digest.mjs all --dir ...              # scan→transcribe→frames→docs→notes→db→skills
 *
 * 依存（Windows）：ffmpeg/ffprobe、Python 3.13 + `pip install faster-whisper pypdf python-docx`、Ollama（LOCAL_VL_MODEL=qwen2.5vl:7b、LOCAL_TEXT_MODEL=qwen3:30b-a3b）、Node ≥ 22.13（node:sqlite）。
 * .env：COURSE_DIR（--dir の既定）、LOCAL_LLM_BASE_URL（Ollama、既定 http://localhost:11434）、LOCAL_VL_MODEL、LOCAL_TEXT_MODEL、WHISPER_MODEL（既定 large-v3）
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'out'); fs.mkdirSync(OUT, { recursive: true });
const argv = process.argv.slice(2); const cmd = argv[0];
const args = Object.fromEntries(argv.slice(1).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const OLLAMA = (env.LOCAL_LLM_BASE_URL || 'http://localhost:11434').replace(/\/v1\/?$/, '').replace(/\/$/, '');
const VL = env.LOCAL_VL_MODEL || 'qwen2.5vl:7b', TXT = env.LOCAL_TEXT_MODEL || 'qwen3:30b-a3b', WHISPER = env.WHISPER_MODEL || 'large-v3';
const DIR = args.dir || env.COURSE_DIR;
const PY = process.platform === 'win32' ? 'python' : 'python3';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const J = (f) => JSON.parse(fs.readFileSync(f, 'utf8')); const W = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, typeof o === 'string' ? o : JSON.stringify(o, null, 1) + '\n'); };
const INV = path.join(OUT, 'inventory.json');
const inv = () => { if (!fs.existsSync(INV)) throw new Error('先に scan'); return J(INV); };
const limit = (xs) => (args.limit ? xs.slice(0, Number(args.limit)) : xs);
const run = (bin, a, opts = {}) => { const r = spawnSync(bin, a, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts }); if (r.status !== 0) throw new Error(`${bin} ${a[0]}: ${(r.stderr || r.stdout || '').slice(-500)}`); return r.stdout; };

// ───────── scan ─────────
const VIDEO = /\.(mp4|mov|mkv|avi|webm|m4v)$/i, DOC = /\.(pdf|docx?|txt|md|json|csv|xlsx?|pptx?)$/i, IMG = /\.(jpe?g|png|webp|gif)$/i, ARCH = /\.(zip|rar|7z)$/i;
function walk(d, acc = []) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p, acc); else acc.push(p); } return acc; }
function scan() {
  if (!DIR || !fs.existsSync(DIR)) throw new Error(`--dir が無い: ${DIR}`);
  const files = walk(DIR); const items = [];
  for (const f of files) {
    const rel = path.relative(DIR, f); const st = fs.statSync(f); const id = crypto.createHash('md5').update(rel).digest('hex').slice(0, 10);
    const kind = VIDEO.test(f) ? 'video' : DOC.test(f) ? 'doc' : IMG.test(f) ? 'image' : ARCH.test(f) ? 'archive' : 'other';
    const chapter = rel.split(path.sep)[0]; const skillLike = /skill/i.test(rel) && /\.md$/i.test(f);
    items.push({ id, rel, abs: f, kind, chapter, size: st.size, skillLike });
  }
  const summary = Object.fromEntries(['video', 'doc', 'image', 'archive', 'other'].map((k) => [k, items.filter((x) => x.kind === k).length]));
  W(INV, { dir: DIR, scannedAt: new Date().toISOString(), summary, chapters: [...new Set(items.map((x) => x.chapter))], items });
  log('scan', summary, 'chapters', [...new Set(items.map((x) => x.chapter))].length, 'skill-like md', items.filter((x) => x.skillLike).length);
  if (summary.archive) log('!! 圧縮ファイルあり。中身を見るには先に展開（Windows 側で手動、または 7z x）');
}

// ───────── transcribe（faster-whisper） ─────────
const WHISPER_PY = `
import sys, json, os, glob
# Windows：pip の nvidia-cublas-cu12 / nvidia-cudnn-cu12 の DLL を ctranslate2 から見えるように
for d in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
    os.add_dll_directory(d); os.environ["PATH"] = d + os.pathsep + os.environ["PATH"]
from faster_whisper import WhisperModel
src, dst, model_name = sys.argv[1], sys.argv[2], sys.argv[3]
model = WhisperModel(model_name, device="cuda", compute_type="float16")
segments, info = model.transcribe(src, language="zh", vad_filter=True, beam_size=5, initial_prompt="AI漫剧、短剧、可灵、即梦、豆包、Seedance、剪映、提示词、分镜、三视图、Libtv")
segs = [{"s": round(s.start, 2), "e": round(s.end, 2), "t": s.text.strip()} for s in segments]
json.dump({"lang": info.language, "dur": info.duration, "segments": segs, "text": "".join(x["t"] for x in segs)}, open(dst, "w", encoding="utf-8"), ensure_ascii=False)
print(len(segs))
`;
function transcribe() {
  const py = path.join(OUT, '_whisper.py'); fs.writeFileSync(py, WHISPER_PY);
  const vids = limit(inv().items.filter((x) => x.kind === 'video'));
  for (const [i, v] of vids.entries()) {
    const dst = path.join(OUT, 'transcripts', `${v.id}.json`); if (fs.existsSync(dst)) continue; fs.mkdirSync(path.dirname(dst), { recursive: true });
    try {
      const hasAudio = run('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', v.abs]).trim();
      if (!hasAudio) { W(dst, { lang: null, dur: Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v.abs]).trim()) || 0, segments: [], text: '（无音轨）', noAudio: true }); log(`${i + 1}/${vids.length} transcribe`, v.rel, 'no audio'); continue; }
      const wav = path.join(OUT, '_tmp.wav'); run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-i', v.abs, '-vn', '-ac', '1', '-ar', '16000', wav]);
      const n = run(PY, [py, wav, dst, WHISPER]).trim(); log(`${i + 1}/${vids.length} transcribe`, v.rel, n, 'segments');
    } catch (e) { log(`${i + 1}/${vids.length} transcribe ERR`, v.rel, e.message.slice(0, 160)); }
  }
}

// ───────── frames（場面転換 + 30 秒ごと、≤40 枚） ─────────
function frames() {
  const vids = limit(inv().items.filter((x) => x.kind === 'video'));
  for (const [i, v] of vids.entries()) {
    const d = path.join(OUT, 'frames', v.id); if (fs.existsSync(d) && fs.readdirSync(d).length) continue; fs.mkdirSync(d, { recursive: true });
    const dur = Number(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', v.abs]).trim()) || 600;
    const every = Math.max(20, Math.ceil(dur / 30));
    try { run('ffmpeg',['-y', '-hide_banner', '-loglevel', 'error', '-i', v.abs, '-vf', `select='gt(scene,0.35)+not(mod(t\\,${every}))',scale=1280:-2`, '-vsync', 'vfr', '-frame_pts', '1', '-q:v', '4', path.join(d, '%06d.jpg')]); } catch (e) { log(`${i + 1}/${vids.length} frames ERR`, v.rel, e.message.slice(0, 160)); continue; }
    const fs_ = fs.readdirSync(d).sort(); if (fs_.length > 40) { const keep = new Set(fs_.filter((_, k) => k % Math.ceil(fs_.length / 40) === 0)); for (const f of fs_) if (!keep.has(f)) fs.unlinkSync(path.join(d, f)); }
    log(`${i + 1}/${vids.length} frames`, v.rel, fs.readdirSync(d).length);
  }
}

// ───────── docs ─────────
const DOC_PY = `
import sys, json, os
src, dst = sys.argv[1], sys.argv[2]; ext = os.path.splitext(src)[1].lower(); text = ""
try:
  if ext == ".pdf":
    from pypdf import PdfReader; text = "\\n".join((p.extract_text() or "") for p in PdfReader(src).pages)
  elif ext in (".docx",):
    import docx; text = "\\n".join(p.text for p in docx.Document(src).paragraphs)
  elif ext in (".xlsx", ".xls"):
    import openpyxl; wb = openpyxl.load_workbook(src, read_only=True, data_only=True); text = "\\n".join("\\t".join("" if c is None else str(c) for c in row) for ws in wb.worksheets for row in ws.iter_rows(values_only=True))
  else:
    text = open(src, "r", encoding="utf-8", errors="ignore").read()
except Exception as e:
  text = "[extract failed] " + str(e)
open(dst, "w", encoding="utf-8").write(text); print(len(text))
`;
function docs() {
  const py = path.join(OUT, '_doc.py'); fs.writeFileSync(py, DOC_PY);
  const ds = inv().items.filter((x) => x.kind === 'doc');
  for (const d of ds) { const dst = path.join(OUT, 'docs', `${d.id}.txt`); if (fs.existsSync(dst)) continue; fs.mkdirSync(path.dirname(dst), { recursive: true }); try { log('doc', d.rel, run(PY, [py, d.abs, dst]).trim(), 'chars'); } catch (e) { log('doc ERR', d.rel, e.message.slice(0, 120)); } }
}

// ───────── Ollama ─────────
async function ollama(model, messages, { json = false, images } = {}) {
  if (images) messages = messages.map((m, i) => (i === messages.length - 1 ? { ...m, images } : m));
  const r = await fetch(`${OLLAMA}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, messages, stream: true, format: json ? 'json' : undefined, options: { temperature: 0.2, num_ctx: 32768 }, think: false }) });
  if (!r.ok) throw new Error(`ollama ${r.status} ${(await r.text()).slice(0, 200)}`);
  // stream：長文書で 30b が 5 分超かかっても Node fetch のヘッダ待ちタイムアウト（300s）に掛からない
  let out = '', buf = ''; const dec = new TextDecoder();
  for await (const chunk of r.body) { buf += dec.decode(chunk, { stream: true }); let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) { const j = JSON.parse(line); if (j.error) throw new Error('ollama ' + j.error); out += j.message?.content ?? ''; } } }
  return out;
}
const parseJson = (s) => { try { return JSON.parse(s); } catch { const i = s.indexOf('{'), k = s.lastIndexOf('}'); return JSON.parse(s.slice(i, k + 1)); } };

// ───────── notes ─────────
const NOTE_SYS = `你是课程整理员。根据一段教学视频的「语音转写」和「画面描述」，提炼成可执行的笔记。只写视频里真正讲到的内容，不要补充你自己的知识；听不清或没讲到的写"未提及"。
输出 JSON：{"title":"一句话主题","summary":"3-5 句概要","tools":[{"name":"软件/网站/模型名","purpose":"用来做什么","where":"画面里看到的入口或菜单（没有则空）"}],"steps":[{"n":1,"do":"具体操作","why":"目的","params":"参数/设置原文"}],"prompts":[{"use":"用途","text":"提示词原文（尽量逐字）"}],"pitfalls":["讲师提醒的坑或注意事项"],"assets":["提到的素材/文件/模板名"],"topics":["从这些里选：漫剧流程,剧本改编,分镜,人物一致性,场景生成,豆包/即梦,可灵,Seedance,剪映,配音,平台规则,变现,工具清单,Libtv,其他"],"quotes":["值得原样保留的讲师原话 ≤3 条"]}`;
async function notes() {
  const items = inv().items; const vids = limit(items.filter((x) => x.kind === 'video' && fs.existsSync(path.join(OUT, 'transcripts', `${x.id}.json`))));
  for (const [i, v] of vids.entries()) {
    const dst = path.join(OUT, 'notes', `${v.id}.json`); if (fs.existsSync(dst) && !args.force) continue;
    const tr = J(path.join(OUT, 'transcripts', `${v.id}.json`)); const fd = path.join(OUT, 'frames', v.id);
    const frameFiles = fs.existsSync(fd) ? fs.readdirSync(fd).sort() : []; const screen = [];
    for (let k = 0; k < frameFiles.length; k += 4) { // VL：4 枚ずつ画面を読む（UI の場所・設定値・画面上の文字）
      const imgs = frameFiles.slice(k, k + 4).map((f) => fs.readFileSync(path.join(fd, f)).toString('base64'));
      try { const d = await ollama(VL, [{ role: 'user', content: '这是教学视频的几张截图（按时间顺序）。请逐张用中文简述：是什么软件/网页、在哪个菜单或按钮、画面上的关键文字和参数（原样抄写）。每张 1-2 行，不要猜测看不清的内容。' }], { images: imgs }); screen.push(`[帧 ${k + 1}-${k + imgs.length}] ${d.trim()}`); } catch (e) { screen.push(`[帧 ${k + 1}] VL 失败: ${e.message.slice(0, 80)}`); }
    }
    const text = tr.text.length > 24000 ? tr.text.slice(0, 24000) + '…[后略]' : tr.text;
    const user = `文件：${v.rel}\n时长：${Math.round(tr.dur)} 秒\n\n【语音转写】\n${text}\n\n【画面描述】\n${screen.join('\n')}`;
    let note; try { note = parseJson(await ollama(TXT, [{ role: 'system', content: NOTE_SYS }, { role: 'user', content: user }], { json: true })); } catch (e) { log('notes ERR', v.rel, e.message.slice(0, 120)); continue; }
    note = { id: v.id, file: v.rel, chapter: v.chapter, dur: tr.dur, screen, models: { vl: VL, text: TXT, whisper: WHISPER }, at: new Date().toISOString(), ...note };
    W(dst, note);
    const md = [`# ${note.title ?? v.rel}`, '', `文件：\`${v.rel}\`｜时长 ${Math.round(tr.dur / 60)} 分｜主题：${(note.topics ?? []).join('、')}`, '', note.summary ?? '', '', '## 工具', ...(note.tools ?? []).map((t) => `- **${t.name}**：${t.purpose}${t.where ? `（${t.where}）` : ''}`), '', '## 步骤', ...(note.steps ?? []).map((s) => `${s.n}. ${s.do}${s.why ? ` —— ${s.why}` : ''}${s.params ? `\n   - 参数：${s.params}` : ''}`), '', '## 提示词', ...(note.prompts ?? []).map((p) => `- ${p.use}：\n  \`\`\`\n  ${String(p.text).replace(/\n/g, '\n  ')}\n  \`\`\``), '', '## 注意事项', ...(note.pitfalls ?? []).map((p) => `- ${p}`), '', '## 素材', ...(note.assets ?? []).map((a) => `- ${a}`), '', '## 讲师原话', ...(note.quotes ?? []).map((q) => `> ${q}`), ''].join('\n');
    W(path.join(OUT, 'notes', `${v.id}.md`), md); log(`${i + 1}/${vids.length} notes`, v.rel, '→', note.title);
  }
  // 文書（PDF/DOCX/MD）も同じ型に
  for (const d of items.filter((x) => x.kind === 'doc' && fs.existsSync(path.join(OUT, 'docs', `${x.id}.txt`)))) {
    const dst = path.join(OUT, 'notes', `${d.id}.json`); if (fs.existsSync(dst) && !args.force) continue;
    const text = fs.readFileSync(path.join(OUT, 'docs', `${d.id}.txt`), 'utf8'); if (text.length < 80) continue;
    try { const note = parseJson(await ollama(TXT, [{ role: 'system', content: NOTE_SYS.replace('教学视频的「语音转写」和「画面描述」', '课程资料文档') }, { role: 'user', content: `文件：${d.rel}\n\n${text.slice(0, 24000)}` }], { json: true })); W(dst, { id: d.id, file: d.rel, chapter: d.chapter, kind: 'doc', at: new Date().toISOString(), ...note }); log('notes(doc)', d.rel, '→', note.title); } catch (e) { log('notes(doc) ERR', d.rel, e.message.slice(0, 100)); }
  }
}

// ───────── db（SQLite + FTS5） ─────────
async function db() {
  const { DatabaseSync } = await import('node:sqlite');
  const f = path.join(OUT, 'course.db'); if (fs.existsSync(f)) fs.unlinkSync(f); const d = new DatabaseSync(f);
  d.exec(`CREATE TABLE item(id TEXT PRIMARY KEY, file TEXT, chapter TEXT, kind TEXT, title TEXT, summary TEXT, topics TEXT, dur REAL);
          CREATE TABLE step(item TEXT, n INT, do_ TEXT, why TEXT, params TEXT); CREATE TABLE tool(item TEXT, name TEXT, purpose TEXT, where_ TEXT);
          CREATE TABLE prompt(item TEXT, use TEXT, text TEXT); CREATE TABLE pitfall(item TEXT, text TEXT); CREATE TABLE asset(item TEXT, name TEXT); CREATE TABLE transcript(item TEXT, s REAL, e REAL, t TEXT);
          CREATE VIRTUAL TABLE fts USING fts5(item, kind, text);`);
  // モデルが文字列欄に配列・オブジェクトを返すことがある（node:sqlite は bind 不可）→ 数値/null 以外は文字列化
  const v = (x) => (x == null || typeof x === 'number' || typeof x === 'string' ? x ?? null : typeof x === 'object' ? JSON.stringify(x) : String(x));
  const ins = (sql) => { const st = d.prepare(sql); return { run: (...a) => st.run(...a.map(v)) }; }; const I = ins('INSERT INTO item VALUES(?,?,?,?,?,?,?,?)'), S = ins('INSERT INTO step VALUES(?,?,?,?,?)'), T = ins('INSERT INTO tool VALUES(?,?,?,?)'), P = ins('INSERT INTO prompt VALUES(?,?,?)'), PF = ins('INSERT INTO pitfall VALUES(?,?)'), A = ins('INSERT INTO asset VALUES(?,?)'), TR = ins('INSERT INTO transcript VALUES(?,?,?,?)'), F = ins('INSERT INTO fts VALUES(?,?,?)');
  const nd = path.join(OUT, 'notes'); const notesList = fs.existsSync(nd) ? fs.readdirSync(nd).filter((x) => x.endsWith('.json')).map((x) => J(path.join(nd, x))) : [];
  for (const n of notesList) {
    I.run(n.id, n.file, n.chapter, n.kind ?? 'video', n.title ?? '', n.summary ?? '', (n.topics ?? []).join(','), n.dur ?? null);
    for (const s of n.steps ?? []) { S.run(n.id, s.n, s.do, s.why ?? '', s.params ?? ''); F.run(n.id, 'step', `${s.do} ${s.why ?? ''} ${s.params ?? ''}`); }
    for (const t of n.tools ?? []) { T.run(n.id, t.name, t.purpose ?? '', t.where ?? ''); F.run(n.id, 'tool', `${t.name} ${t.purpose ?? ''} ${t.where ?? ''}`); }
    for (const p of n.prompts ?? []) { P.run(n.id, p.use ?? '', p.text ?? ''); F.run(n.id, 'prompt', `${p.use ?? ''} ${p.text ?? ''}`); }
    for (const p of n.pitfalls ?? []) { PF.run(n.id, p); F.run(n.id, 'pitfall', p); }
    for (const a of n.assets ?? []) A.run(n.id, a);
    F.run(n.id, 'summary', `${n.title ?? ''} ${n.summary ?? ''}`);
    const tf = path.join(OUT, 'transcripts', `${n.id}.json`); if (fs.existsSync(tf)) for (const s of J(tf).segments) { TR.run(n.id, s.s, s.e, s.t); F.run(n.id, 'transcript', s.t); }
  }
  d.close();
  const byCh = {}; for (const n of notesList) (byCh[n.chapter] ??= []).push(n);
  const md = [`# 课程知识库目录（${new Date().toISOString().slice(0, 10)}）`, '', `来源：\`${inv().dir}\`（社内学习用，不再分发）。数据库 \`tools/course-digest/out/course.db\`（SQLite，FTS5 全文检索，表：item/step/tool/prompt/pitfall/asset/transcript）。查询：\`node tools/course-digest/digest.mjs ask "问题"\`。`, '', `| 章节 | 条目 | 主题 |`, `|---|---|---|`, ...Object.entries(byCh).map(([c, xs]) => `| ${c} | ${xs.length} | ${[...new Set(xs.flatMap((x) => x.topics ?? []))].join('、')} |`), ''];
  for (const [c, xs] of Object.entries(byCh)) { md.push(`## ${c}`, ''); for (const n of xs) md.push(`- **${n.title ?? n.file}**（\`${n.file}\`）：${String(n.summary ?? '').slice(0, 120)}`); md.push(''); }
  W(path.join(ROOT, 'docs/course-digest/README.md'), md.join('\n')); log('db', notesList.length, 'items →', f, '+ docs/course-digest/README.md');
}

// ───────── skills ─────────
const TOPICS = { '漫剧流程': 'workflow', '剧本改编': 'script', '分镜': 'storyboard', '人物一致性': 'character-consistency', '场景生成': 'scene', '豆包/即梦': 'doubao-jimeng', '可灵': 'kling', 'Seedance': 'seedance', '剪映': 'jianying', '配音': 'voice', '平台规则': 'platform-rules', '工具清单': 'tools', 'Libtv': 'libtv' };
const SKILL_SYS = `你在为 Claude Code 写一个 SKILL.md（给 AI 助手照着执行的操作手册）。只用提供的课程笔记里的内容；没讲到的不要编。中文为主，软件按钮名保留原文。
格式：先 YAML frontmatter（name、description：一句话说明何时用这个 skill，含触发词），然后：## 适用场景 / ## 前置（账号、软件、素材）/ ## 步骤（编号，每步含参数）/ ## 提示词模板（代码块，原文）/ ## 常见坑 / ## 质量检查清单 / ## 来源（列出笔记文件名）。
我们的用途是日本电商（Amazon/乐天）商品短视频与店铺素材，不是国内漫剧变现；涉及国内平台分账、番茄小说改编版权的内容只记为"参考"，并标注日本市场需自行确认。`;
async function skills() {
  const nd = path.join(OUT, 'notes'); const ns = fs.readdirSync(nd).filter((x) => x.endsWith('.json')).map((x) => J(path.join(nd, x)));
  const sd = path.join(OUT, 'skills'); fs.mkdirSync(sd, { recursive: true });
  for (const [topic, slug] of Object.entries(TOPICS)) {
    const rel = ns.filter((n) => (n.topics ?? []).includes(topic)); if (rel.length < 1) continue;
    const material = rel.map((n) => `### ${n.file}\n${fs.existsSync(path.join(nd, `${n.id}.md`)) ? fs.readFileSync(path.join(nd, `${n.id}.md`), 'utf8') : JSON.stringify(n)}`).join('\n\n').slice(0, 60000);
    try {
      let body = await ollama(TXT, [{ role: 'system', content: SKILL_SYS }, { role: 'user', content: `skill 名：ai-drama-${slug}（主题「${topic}」）。课程笔记如下：\n\n${material}` }]);
      body = body.replace(/^```(?:markdown|md)?\s*/i, '').replace(/```\s*$/, '').trim();
      if (!/^---/.test(body)) body = `---\nname: ai-drama-${slug}\ndescription: ${topic}（来自课程笔记）。提到「${topic}」时使用。\n---\n\n` + body;
      W(path.join(sd, `ai-drama-${slug}`, 'SKILL.md'), body + '\n'); log('skill', slug, rel.length, 'notes');
      if (args.install) { const dst = path.join(ROOT, '.claude/skills', `ai-drama-${slug}`, 'SKILL.md'); W(dst, body + '\n'); }
    } catch (e) { log('skill ERR', slug, e.message.slice(0, 120)); }
  }
  // 講座に同梱された skill（AI漫剧skill フォルダ）はそのままコピー（出所を記す）
  for (const it of inv().items.filter((x) => x.skillLike)) { const dst = path.join(sd, '_bundled', it.rel.replace(/[\\/]/g, '__')); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(it.abs, dst); log('bundled skill copied', it.rel); }
  log('skills →', sd, args.install ? '(installed to .claude/skills)' : '(review first; add --install to place into .claude/skills)');
}

// ───────── ask ─────────
async function ask() {
  const q = argv.slice(1).filter((a) => !a.startsWith('--')).join(' '); if (!q) throw new Error('質問を書く');
  const { DatabaseSync } = await import('node:sqlite'); const d = new DatabaseSync(path.join(OUT, 'course.db'), { readOnly: true });
  const terms = q.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length >= 2).map((w) => `"${w}"`).join(' OR ');
  const rows = d.prepare(`SELECT f.item, f.kind, f.text, i.file FROM fts f JOIN item i ON i.id=f.item WHERE fts MATCH ? LIMIT 40`).all(terms || `"${q}"`); d.close();
  if (!rows.length) { console.log('知识库里没找到相关内容'); return; }
  const ctx = rows.map((r) => `[${r.file} / ${r.kind}] ${r.text}`).join('\n').slice(0, 20000);
  const a = await ollama(TXT, [{ role: 'system', content: '只根据提供的课程片段回答，每条结论后面用 [文件名] 标出处；片段里没有的就说"课程没讲"。' }, { role: 'user', content: `问题：${q}\n\n课程片段：\n${ctx}` }]);
  console.log(a);
}

const stages = { scan, transcribe, frames, docs, notes, db, skills, ask };
const order = cmd === 'all' ? ['scan', 'transcribe', 'frames', 'docs', 'notes', 'db', 'skills'] : [cmd];
if (!order.every((s) => stages[s])) { console.log('usage: digest.mjs <scan|transcribe|frames|docs|notes|db|skills|ask|all> [--dir D] [--limit N] [--install]'); process.exit(1); }
for (const s of order) { try { await stages[s](); } catch (e) { log('ERR', s, e.message); fs.appendFileSync(path.join(OUT, 'errors.log'), `${new Date().toISOString()} ${s} ${e.message}\n`); if (cmd === 'all') break; } }
