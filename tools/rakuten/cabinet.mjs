#!/usr/bin/env node
/**
 * 楽天 R-Cabinet 画像の棚卸しと圧縮（URL を変えずに同じファイルを差し替える）
 *
 *   node tools/rakuten/cabinet.mjs check                 # .env のキーを伏せ字で表示し cabinet.usage.get を 1 回呼ぶ（AuthError の切り分け用）
 *   node tools/rakuten/cabinet.mjs usage                 # 容量・フォルダ数（RMS API cabinet.usage.get）
 *   node tools/rakuten/cabinet.mjs scan                  # 全フォルダ・全ファイルを列挙 → out/cabinet/files.json + docs/rakuten/cabinet-report.md
 *   node tools/rakuten/cabinet.mjs plan   [--target 180] [--max 1200] [--min-save 15]
 *                                                         # 画像をダウンロード → Pillow で圧縮 → 削減見込み一覧（out/cabinet/plan.json, docs/rakuten/cabinet-plan.md）。アップロードはしない
 *   node tools/rakuten/cabinet.mjs apply  [--limit N] [--folder ID]
 *                                                         # cabinet.file.update で同じ fileId に圧縮画像を上書き（URL 不変）。元画像は out/cabinet/backup/ に保存
 *   node tools/rakuten/cabinet.mjs rollback [--limit N]   # backup から元画像を書き戻す
 *
 * .env（Windows、git に入れない。値は用户本人が RMS「WEB APIサービス」で発行して記入）：
 *   RAKUTEN_SERVICE_SECRET=   RAKUTEN_LICENSE_KEY=
 *
 * ルール（CLAUDE.md）：書き込みの前に必ずバックアップ、失敗率 2% 超または 5 連続失敗で停止、1 req/秒以下、
 *   ファイル名・拡張子・フォルダは変えない（商品ページの画像 URL を壊さない）。PNG は拡張子を変えられないので再圧縮のみ、GIF は触らない。
 * Pillow は tools/product-images/imgtool.py と同じ Windows の python を使う。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out/cabinet');
const DOCS = path.join(ROOT, 'docs/rakuten');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DOCS, { recursive: true });

const [cmd = 'usage', ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true] : null).filter(Boolean));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const PY = env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const API = 'https://api.rms.rakuten.co.jp/es/1.0/cabinet';
const TARGET_KB = Number(args.target || 180), MAX_SIDE = Number(args.max || 1200), MIN_SAVE = Number(args['min-save'] || 15);

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (f, d) => d === undefined ? (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null) : fs.writeFileSync(f, JSON.stringify(d, null, 1));

function auth() {
  if (!env.RAKUTEN_SERVICE_SECRET || !env.RAKUTEN_LICENSE_KEY) { console.error('.env に RAKUTEN_SERVICE_SECRET / RAKUTEN_LICENSE_KEY が必要です（RMS → 拡張サービス → WEB APIサービス で発行）'); process.exit(2); }
  return 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
}
const tag = (xml, t) => { const m = xml.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? m[1].trim() : null; };
const tags = (xml, t) => [...xml.matchAll(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`, 'g'))].map((m) => m[1]);

let lastCall = 0;
async function rms(p, init = {}) {
  const wait = 1100 - (Date.now() - lastCall); if (wait > 0) await sleep(wait); lastCall = Date.now();
  const r = await fetch(`${API}/${p}`, { ...init, headers: { Authorization: auth(), ...(init.headers || {}) } });
  const xml = await r.text();
  const code = tag(xml, 'resultCode'), sys = tag(xml, 'systemStatus');
  if (!r.ok || sys !== 'OK' || (code && code !== '0')) {
    const msg = `${p} http ${r.status} system=${sys} resultCode=${code} ${tag(xml, 'message') || ''}`.trim();
    if (/AuthError|401|WRONG_PARAMETER|ACCESS_DENIED/i.test(xml + r.status)) throw new Error(msg + `\n  → 認証失敗。.env の RAKUTEN_LICENSE_KEY が「最新」のライセンスキー（RMS WEB APIサービス → 利用設定 で 利用中・R-Cabinet API が付いている方）か確認。古いキーには後から追加した機能の権限が無い。現在のキー: ${mask(env.RAKUTEN_LICENSE_KEY)} / secret: ${mask(env.RAKUTEN_SERVICE_SECRET)}`);
    throw new Error(msg);
  }
  return xml;
}

const mask = (k) => k ? `${k.slice(0, 12)}…(${k.length} 文字)` : '(未設定)';
async function check() {
  console.log('RAKUTEN_SERVICE_SECRET =', mask(env.RAKUTEN_SERVICE_SECRET));
  console.log('RAKUTEN_LICENSE_KEY    =', mask(env.RAKUTEN_LICENSE_KEY));
  for (const k of ['RAKUTEN_SERVICE_SECRET', 'RAKUTEN_LICENSE_KEY']) if (env[k] && /\s|#/.test(env[k])) console.log(`!! ${k} に空白または # が含まれています（行内コメント/引用符の外の空白を消す）`);
  const r = await fetch(`${API}/usage/get`, { headers: { Authorization: auth() } });
  const xml = await r.text();
  console.log('http', r.status, 'systemStatus', tag(xml, 'systemStatus'), 'resultCode', tag(xml, 'resultCode'), tag(xml, 'message') || '');
  if (tag(xml, 'resultCode') === '0') console.log(`OK  容量 ${tag(xml, 'UseSpace')} / ${tag(xml, 'MaxSpace')} MB`); else console.log('NG → 上の mask 表示で、RMS 利用設定の「最新」キーの先頭と一致するか確認');
}

// ---------- usage ----------
async function usage() {
  const xml = await rms('usage/get');
  const u = Object.fromEntries(['MaxSpace', 'FolderMax', 'FileMax', 'UseSpace', 'AvailSpace', 'UseFolderCount', 'AvailFolderCount'].map((k) => [k, tag(xml, k)]));
  console.log(u);
  console.log(`容量 ${u.UseSpace} / ${u.MaxSpace} MB  (${(Number(u.UseSpace) / Number(u.MaxSpace) * 100).toFixed(1)}%)  フォルダ ${u.UseFolderCount}/${u.FolderMax}`);
  J(path.join(OUT, 'usage.json'), { ...u, at: new Date().toISOString() });
  return u;
}

// ---------- scan ----------
async function scan() {
  const u = await usage();
  const folders = [{ FolderId: '0', FolderName: '基本フォルダ', FolderPath: '/' }];
  for (let off = 1; ; off += 100) {
    const xml = await rms(`folders/get?offset=${off}&limit=100`);
    const list = tags(xml, 'folder').map((f) => Object.fromEntries(['FolderId', 'FolderName', 'FolderNode', 'FolderPath', 'FileCount', 'FileSize'].map((k) => [k, tag(f, k)])));
    folders.push(...list); log('folders', folders.length);
    if (list.length < 100) break;
  }
  const files = [];
  for (const fo of folders) {
    for (let off = 1; ; off += 100) {
      const xml = await rms(`folder/files/get?folderId=${fo.FolderId}&offset=${off}&limit=100`);
      const list = tags(xml, 'file').map((f) => ({ ...Object.fromEntries(['FolderId', 'FolderPath', 'FileId', 'FileName', 'FilePath', 'FileUrl', 'FileType', 'FileSize', 'FileWidth', 'FileHeight', 'TimeStamp'].map((k) => [k, tag(f, k)])), folderName: fo.FolderName }));
      files.push(...list);
      if (list.length < 100) break;
    }
    log(`${fo.FolderName}(${fo.FolderId}) files so far ${files.length}`);
  }
  // FileSize は MB 表記（小数）。KB に直す
  for (const f of files) { f.kb = Math.round(Number(f.FileSize || 0) * 1024); f.ext = (f.FilePath || f.FileName || '').split('.').pop().toLowerCase(); }
  J(path.join(OUT, 'folders.json'), folders); J(path.join(OUT, 'files.json'), files);
  report(u, folders, files);
}

function report(u, folders, files) {
  const total = files.reduce((s, f) => s + f.kb, 0);
  const buckets = [[0, 100], [100, 200], [200, 400], [400, 800], [800, 2048], [2048, 1e9]];
  const byExt = {}; for (const f of files) { byExt[f.ext] = byExt[f.ext] || { n: 0, kb: 0 }; byExt[f.ext].n++; byExt[f.ext].kb += f.kb; }
  const big = files.filter((f) => f.kb > TARGET_KB);
  const bigKb = big.reduce((s, f) => s + f.kb, 0);
  const est = big.filter((f) => f.ext === 'jpg' || f.ext === 'jpeg').reduce((s, f) => s + Math.max(0, f.kb - TARGET_KB * 0.8), 0); // JPEG を 180KB 前後に落とした場合の削減見込み（粗い）
  const md = [`# R-Cabinet 棚卸し（${new Date().toISOString().slice(0, 16)}Z）`, '',
    `- 容量：**${u.UseSpace} / ${u.MaxSpace} MB（${(Number(u.UseSpace) / Number(u.MaxSpace) * 100).toFixed(1)}%）**、フォルダ ${u.UseFolderCount}/${u.FolderMax}`,
    `- ファイル数：${files.length}、合計 ${(total / 1024).toFixed(0)} MB、平均 ${(total / Math.max(1, files.length)).toFixed(0)} KB`,
    `- ${TARGET_KB}KB 超：${big.length} 件、${(bigKb / 1024).toFixed(0)} MB → JPEG を ${TARGET_KB}KB 目安に圧縮した場合の削減見込み **約 ${(est / 1024).toFixed(0)} MB**（plan で実測）`, '',
    '## サイズ分布', '| 範囲 | 件数 | 合計 MB |', '|---|---|---|',
    ...buckets.map(([a, b]) => { const s = files.filter((f) => f.kb >= a && f.kb < b); return `| ${a}〜${b >= 1e9 ? '' : b} KB | ${s.length} | ${(s.reduce((x, f) => x + f.kb, 0) / 1024).toFixed(0)} |`; }), '',
    '## 拡張子', '| 拡張子 | 件数 | 合計 MB |', '|---|---|---|', ...Object.entries(byExt).map(([e, v]) => `| ${e} | ${v.n} | ${(v.kb / 1024).toFixed(0)} |`), '',
    '## フォルダ', '| フォルダ | ID | 件数 | 合計 MB | 180KB超 |', '|---|---|---|---|---|',
    ...folders.map((fo) => { const s = files.filter((f) => f.FolderId === fo.FolderId); return `| ${fo.FolderName} | ${fo.FolderId} | ${s.length} | ${(s.reduce((x, f) => x + f.kb, 0) / 1024).toFixed(0)} | ${s.filter((f) => f.kb > TARGET_KB).length} |`; }), '',
    '## 最大 30 件', '| KB | 幅×高 | パス |', '|---|---|---|', ...[...files].sort((a, b) => b.kb - a.kb).slice(0, 30).map((f) => `| ${f.kb} | ${f.FileWidth}×${f.FileHeight} | ${f.FilePath} |`), '',
    '> 注意：R-Cabinet は削除・差し替え後の容量表示が翌日まで更新されないことがある。PNG は拡張子を変えると URL が変わるため再圧縮のみ、GIF は対象外。'];
  fs.writeFileSync(path.join(DOCS, 'cabinet-report.md'), md.join('\n'));
  log('→ docs/rakuten/cabinet-report.md');
}

// ---------- plan（ダウンロード + 圧縮、アップロードなし） ----------
const PYCODE = `
import sys, json, io
from PIL import Image, ImageOps
jobs = json.load(open(sys.argv[1], encoding='utf-8')); target = int(sys.argv[2]) * 1024; max_side = int(sys.argv[3])
out = []
for j in jobs:
    try:
        im = Image.open(j['src']); im = ImageOps.exif_transpose(im); ext = j['ext']
        w, h = im.size; scale = min(1.0, max_side / max(w, h))
        if scale < 1.0: im = im.resize((round(w*scale), round(h*scale)), Image.LANCZOS)
        best = None
        if ext in ('jpg', 'jpeg'):
            if im.mode not in ('RGB', 'L'): im = im.convert('RGB')
            for q in (85, 80, 75, 70, 65, 60):
                b = io.BytesIO(); im.save(b, 'JPEG', quality=q, optimize=True, progressive=True); best = (q, b.getvalue())
                if len(best[1]) <= target: break
        elif ext == 'png':
            b = io.BytesIO(); im.save(b, 'PNG', optimize=True); best = ('png', b.getvalue())
        else:
            out.append({**j, 'skip': 'ext'}); continue
        open(j['dst'], 'wb').write(best[1])
        out.append({**j, 'q': best[0], 'w': im.size[0], 'h': im.size[1], 'newKb': round(len(best[1]) / 1024)})
    except Exception as e:
        out.append({**j, 'error': str(e)})
json.dump(out, open(sys.argv[4], 'w', encoding='utf-8'), ensure_ascii=False)
`;

async function plan() {
  const files = J(path.join(OUT, 'files.json')); if (!files) { console.error('先に scan'); process.exit(2); }
  const cand = files.filter((f) => f.kb > TARGET_KB && ['jpg', 'jpeg', 'png'].includes(f.ext) && (!args.folder || f.FolderId === String(args.folder)));
  const lim = args.limit ? Number(args.limit) : cand.length;
  const src = path.join(OUT, 'src'), dst = path.join(OUT, 'compressed'); fs.mkdirSync(src, { recursive: true }); fs.mkdirSync(dst, { recursive: true });
  const jobs = [];
  for (const [i, f] of cand.slice(0, lim).entries()) {
    const s = path.join(src, `${f.FileId}.${f.ext}`), d = path.join(dst, `${f.FileId}.${f.ext}`);
    if (!fs.existsSync(s)) {
      try { const r = await fetch(f.FileUrl); if (!r.ok) throw new Error('http ' + r.status); fs.writeFileSync(s, Buffer.from(await r.arrayBuffer())); await sleep(200); }
      catch (e) { log('download fail', f.FilePath, e.message); continue; }
    }
    jobs.push({ fileId: f.FileId, path: f.FilePath, url: f.FileUrl, folderId: f.FolderId, fileName: f.FileName, ext: f.ext === 'jpeg' ? 'jpg' : f.ext, src: s, dst: d, kb: Math.round(fs.statSync(s).size / 1024) });
    if (i % 50 === 0) log('downloaded', i + 1, '/', lim);
  }
  const jf = path.join(OUT, 'jobs.json'), rf = path.join(OUT, 'py-result.json'), pyf = path.join(OUT, 'compress.py');
  J(jf, jobs); fs.writeFileSync(pyf, PYCODE);
  log('compress', jobs.length, 'files with Pillow …');
  execFileSync(PY, [pyf, jf, String(TARGET_KB), String(MAX_SIDE), rf], { stdio: 'inherit' });
  const res = J(rf);
  const plan = res.map((r) => ({ ...r, save: r.newKb ? r.kb - r.newKb : 0, savePct: r.newKb ? Math.round((1 - r.newKb / r.kb) * 100) : 0 }))
    .map((r) => ({ ...r, action: r.error ? 'error' : r.skip ? 'skip' : r.savePct >= MIN_SAVE ? 'replace' : 'keep' }));
  J(path.join(OUT, 'plan.json'), plan);
  const rep = plan.filter((p) => p.action === 'replace'), tot = rep.reduce((s, p) => s + p.save, 0);
  const md = [`# R-Cabinet 圧縮計画（target ${TARGET_KB}KB / 最大辺 ${MAX_SIDE}px / 削減 ${MIN_SAVE}% 未満は据え置き）`, '',
    `- 対象 ${plan.length} 件 → **差し替え ${rep.length} 件、削減 約 ${(tot / 1024).toFixed(0)} MB**（据え置き ${plan.filter((p) => p.action === 'keep').length}、PNG で目標未達 ${plan.filter((p) => p.ext === 'png' && p.newKb > TARGET_KB).length}、エラー ${plan.filter((p) => p.action === 'error').length}）`,
    `- 圧縮後サンプル：\`tools/rakuten/out/cabinet/compressed/\`（元は \`src/\`）。apply 前に数枚を目で比較してください。`, '',
    '| 操作 | 元KB | 後KB | 削減% | q | 幅×高 | パス |', '|---|---|---|---|---|---|---|',
    ...plan.sort((a, b) => b.save - a.save).slice(0, 200).map((p) => `| ${p.action} | ${p.kb} | ${p.newKb ?? ''} | ${p.savePct} | ${p.q ?? ''} | ${p.w ?? ''}×${p.h ?? ''} | ${p.path} |`)];
  fs.writeFileSync(path.join(DOCS, 'cabinet-plan.md'), md.join('\n'));
  log(`→ docs/rakuten/cabinet-plan.md  replace ${rep.length}  save ${(tot / 1024).toFixed(0)} MB`);
}

// ---------- apply / rollback（cabinet.file.update：fileId 据え置きで画像だけ差し替え → URL 不変） ----------
async function updateFile(fileId, fileName, buf, ext) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><request><fileUpdateRequest><file><fileId>${fileId}</fileId><fileName>${fileName.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</fileName></file></fileUpdateRequest></request>`;
  const fd = new FormData();
  fd.append('xml', new Blob([xml], { type: 'text/xml' }), 'request.xml');
  fd.append('file', new Blob([buf], { type: ext === 'png' ? 'image/png' : 'image/jpeg' }), `image.${ext}`);
  return rms('file/update', { method: 'POST', body: fd });
}

async function applyOrRollback(mode) {
  const plan = J(path.join(OUT, 'plan.json')); if (!plan) { console.error('先に plan'); process.exit(2); }
  const logF = path.join(OUT, `${mode}-log.jsonl`);
  const done = new Set(fs.existsSync(logF) ? fs.readFileSync(logF, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((l) => l.ok).map((l) => l.fileId) : []);
  const bk = path.join(OUT, 'backup'); fs.mkdirSync(bk, { recursive: true });
  let todo = plan.filter((p) => p.action === 'replace' && (!args.folder || p.folderId === String(args.folder)));
  if (mode === 'rollback') todo = todo.filter((p) => fs.existsSync(path.join(bk, `${p.fileId}.${p.ext}`)));
  todo = todo.filter((p) => !done.has(p.fileId)).slice(0, args.limit ? Number(args.limit) : undefined);
  log(`${mode}: ${todo.length} files`);
  let ok = 0, fail = 0, streak = 0;
  for (const p of todo) {
    try {
      const bfile = path.join(bk, `${p.fileId}.${p.ext}`);
      let buf;
      if (mode === 'apply') { if (!fs.existsSync(bfile)) fs.copyFileSync(p.src, bfile); buf = fs.readFileSync(p.dst); }
      else buf = fs.readFileSync(bfile);
      if (buf.length > 2 * 1024 * 1024) throw new Error('2MB 超');
      await updateFile(p.fileId, p.fileName, buf, p.ext);
      ok++; streak = 0; fs.appendFileSync(logF, JSON.stringify({ t: new Date().toISOString(), fileId: p.fileId, path: p.path, ok: true, kb: p.kb, newKb: p.newKb }) + '\n');
    } catch (e) {
      fail++; streak++; fs.appendFileSync(logF, JSON.stringify({ t: new Date().toISOString(), fileId: p.fileId, path: p.path, ok: false, error: e.message }) + '\n'); log('FAIL', p.path, e.message);
      if (streak >= 5 || (ok + fail >= 50 && fail / (ok + fail) > 0.02)) { log('停止：失敗率 2% 超または 5 連続失敗'); break; }
    }
    if ((ok + fail) % 25 === 0) log(`${ok + fail}/${todo.length} ok ${ok} fail ${fail}`);
  }
  log(`${mode} done ok ${ok} fail ${fail} → ${path.relative(ROOT, logF)}`);
}

const run = { check, usage, scan, plan, apply: () => applyOrRollback('apply'), rollback: () => applyOrRollback('rollback') }[cmd];
if (!run) { console.error('usage: cabinet.mjs check|usage|scan|plan|apply|rollback'); process.exit(2); }
run().catch((e) => { console.error(e); process.exit(1); });
