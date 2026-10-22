#!/usr/bin/env node
/**
 * 乐天草稿箱 商品名の合規チェック＋修正案（6kpro、夜間ジョブ）。出力は提案だけで、斑馬/RMS には何も書かない。
 *   node tools/rakuten/title-check.mjs [--limit N] [--window 20-10]
 * 入力：docs/rakuten/banma-draft-list.csv（全文の商品名）＋ docs/rakuten/category-plan.csv（動作・類目・review）
 * 出力：tools/rakuten/out/title-check.jsonl（1 商品 1 行、途中から再開可）→ docs/rakuten/title-check.md / .csv（まとめ）
 * ルール：型番（SPU・管理編号）を商品名から外す／他社ブランド名（イデアコ 等）・IP 名は外す／薬機法・景表法（バストアップ・痩せる・
 *   治る・医療・最強・No.1・日本一 等）は外す／体温計など医療機器表記は警告／事実にない数字・効能は足さない／全角 120 字以内。
 *   review 行は 類目パスがその商品に合うかも判定（合わなければ理由と検索語のみ。ID は決めない）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { waitLLM } from '../night/window.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash';
const WIN = args.window ?? env.LLM_WINDOW ?? process.env.LLM_WINDOW ?? '';
const OUT = path.join(ROOT, 'tools/rakuten/out'); fs.mkdirSync(OUT, { recursive: true });
const JL = path.join(OUT, 'title-check.jsonl');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function csv(f) {
  const txt = fs.readFileSync(f, 'utf8').replace(/^﻿/, ''); const rows = []; let row = [], v = '', q = false;
  for (let i = 0; i < txt.length; i++) { const c = txt[i]; if (q) { if (c === '"') { if (txt[i + 1] === '"') { v += '"'; i++; } else q = false; } else v += c; } else if (c === '"') q = true; else if (c === ',') { row.push(v); v = ''; } else if (c === '\n') { row.push(v.replace(/\r$/, '')); rows.push(row); row = []; v = ''; } else v += c; }
  if (v || row.length) { row.push(v); rows.push(row); }
  const h = rows.shift(); return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
async function chatJson(messages, maxTokens = 6000) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model: MODEL, temperature: 0.1, max_tokens: maxTokens, response_format: { type: 'json_object' }, chat_template_kwargs: { enable_thinking: false, thinking: false }, messages }) });
      const j = await r.json(); const c = j.choices?.[0]?.message?.content; if (!c) throw new Error(`empty ${JSON.stringify(j).slice(0, 150)}`);
      const m = c.match(/\{[\s\S]*\}/); return JSON.parse(m ? m[0] : c);
    } catch (e) { if (i === 2) throw e; await sleep(3000 * (i + 1)); }
  }
}
const SYS = `あなたは楽天市場の商品ページ審査担当です。商品名（楽天の「商品名」）を 1 件ずつ点検し、修正案を出します。JSON のみ:
{"r":[{"i":番号,"issues":["問題（短く日本語）"],"severity":"none|low|high","fixed":"修正後の商品名","categoryOk":true|false|null,"categoryNote":"類目が合わない理由と探すべき語（合う/対象外なら空）"}]}
ルール：
- 型番・管理番号（与えた SPU/管理編号、英数字の品番）は商品名から外す。
- 他社ブランド名（イデアコ/ideaco 等）・キャラクター/W杯/FIFA など IP 名は外し issues に書く（IP 商品は severity high）。
- 薬機法・景表法：バストアップ・痩せる・治る・効く・医療・殺菌率・小顔・最強・No.1・日本一・最安・激安 等の断言は外す。「体温計」等の医療機器表記は severity high で警告（自分で別名に言い換えない）。
- 事実にない数字・効能・素材を足さない。語順を整え、同じ語の重複を削る。全角 120 字以内。
- 容量・数値が非現実的（例：格安の 2TB USB メモリ）なら severity high で指摘。
- categoryOk は「類目」が与えられた行だけ判定（与えられていなければ null）。`;

const draft = csv(path.join(ROOT, 'docs/rakuten/banma-draft-list.csv'));
const plan = new Map(csv(path.join(ROOT, 'docs/rakuten/category-plan.csv')).map((r) => [r.SPU, r]));
const items = []; const seen = new Set();
for (const r of draft) { if (!r.SPU || seen.has(r.SPU)) continue; seen.add(r.SPU); const p = plan.get(r.SPU); if (!p || p['动作'] === 'skip') continue; items.push({ spu: r.SPU, mn: r['管理编号'], name: r['商品名'], action: p['动作'], genre: p['乐天平台类目'], review: p.review === 'review' || p['动作'] === 'hold', note: p['备注'] }); }
const done = new Set(fs.existsSync(JL) ? fs.readFileSync(JL, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).spu) : []);
let todo = items.filter((x) => !done.has(x.spu)); if (args.limit) todo = todo.slice(0, Number(args.limit));
log('title-check', items.length, '件中 残り', todo.length);

for (let k = 0; k < todo.length; k += 15) {
  if (!(await waitLLM(LLM, WIN, log))) { log('6kpro 利用時間外 → 停止（続きは次の夜）'); break; }
  const batch = todo.slice(k, k + 15);
  const user = batch.map((x, i) => `#${i} SPU=${x.spu} 管理編号=${x.mn}${x.review ? ` 類目=${x.genre}` : ''}\n商品名: ${x.name}`).join('\n\n');
  try {
    const j = await chatJson([{ role: 'system', content: SYS }, { role: 'user', content: user }]);
    for (const r of j.r ?? []) { const x = batch[r.i]; if (!x) continue; fs.appendFileSync(JL, JSON.stringify({ spu: x.spu, mn: x.mn, action: x.action, before: x.name, after: String(r.fixed ?? '').slice(0, 120), issues: r.issues ?? [], severity: r.severity ?? 'none', genre: x.genre, categoryOk: r.categoryOk ?? null, categoryNote: r.categoryNote ?? '', at: new Date().toISOString() }) + '\n'); }
    log('batch', k / 15 + 1, 'ok', (j.r ?? []).length);
  } catch (e) { log('ERR batch', k / 15 + 1, e.message.slice(0, 200)); await sleep(60000); }
}

// まとめ（毎回作り直す）
const all = fs.existsSync(JL) ? fs.readFileSync(JL, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
fs.writeFileSync(path.join(ROOT, 'docs/rakuten/title-check.csv'), '﻿' + [['SPU', '管理编号', '动作', '严重度', '问题', '原商品名', '修正案', '类目OK', '类目备注'].join(','), ...all.map((x) => [q(x.spu), q(x.mn), x.action, x.severity, q(x.issues.join(' / ')), q(x.before), q(x.after), x.categoryOk ?? '', q(x.categoryNote)].join(','))].join('\r\n') + '\r\n');
const hi = all.filter((x) => x.severity === 'high'); const badCat = all.filter((x) => x.categoryOk === false);
fs.writeFileSync(path.join(ROOT, 'docs/rakuten/title-check.md'), [`# 乐天商品名合规检查（6kpro，提案，未写入斑马）`, '', `更新 ${new Date().toISOString()}｜已检查 ${all.length} / ${items.length}`, '',
  `| 严重度 | 件数 |`, `|---|---|`, ...['high', 'low', 'none'].map((s) => `| ${s} | ${all.filter((x) => x.severity === s).length} |`), '', `类目不合适（review 行）：${badCat.length} 件`, '',
  '## 严重（high）', '', ...hi.map((x) => `- ${x.spu}：${x.issues.join(' / ')}｜${x.before.slice(0, 50)}`), '', '## 类目不合适', '', ...badCat.map((x) => `- ${x.spu}：${x.genre} → ${x.categoryNote}`), '',
  '全部修正案见 `title-check.csv`。'].join('\n') + '\n');
log('summary', all.length, 'high', hi.length, 'badCat', badCat.length);
