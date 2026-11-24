// 让 6kpro（OpenAI 兼容接口）在一个代码副本里自己读代码、改代码、跑测试的小循环。
//   node tools/night/coder/agent.mjs --root <代码副本> --task <任务书.md> --log <记录文件夹> [--max-steps 200] [--until 09:30]
// 安全边界：
//   - 只能读写 --root 里面的文件；.env / .git / node_modules / runtime / bootstrap-account 一律拒绝；
//     只能写 backend/app、backend/migrations、backend/tests、frontend/src、frontend/tests 和 TRIAL_NOTES.md。
//   - 只能执行两条固定命令：副本自己的测试容器（compose.trial.yaml，独立项目名）和前端类型检查。
//   - 不接触 8090、不接触原 ERP 目录。时间到（默认本机时间 09:30）或步数用完就停。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const ROOT = fs.realpathSync(arg('root'));
const TASK = fs.readFileSync(arg('task'), 'utf8');
const LOG = arg('log'); fs.mkdirSync(LOG, { recursive: true });
const MAX_STEPS = +arg('max-steps', 200);
const UNTIL = arg('until', '09:30');
const BASE = (process.env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, '');
const MODEL = process.env.CODER_MODEL || 'GLM-5.3-Flash';
const DENY = /(^|[\\/])(\.env[^\\/]*|\.git|node_modules|runtime|\.venv|dist|__pycache__|bootstrap-account[^\\/]*)([\\/]|$)/i;
const WRITABLE = /^(backend\/(app|migrations|tests)\/|frontend\/(src|tests)\/|TRIAL_NOTES\.md$)/;
const TEXT = /\.(py|sql|ts|tsx|mjs|js|json|md|css|html|yaml|yml|txt|ini|csv|toml)$/i;

const log = (s) => { const line = `[${new Date().toLocaleTimeString('en-GB')}] ${s}`; console.log(line); fs.appendFileSync(path.join(LOG, 'run.log'), line + '\n'); };
const jl = (o) => fs.appendFileSync(path.join(LOG, 'steps.jsonl'), JSON.stringify(o) + '\n');

function safe(rel, forWrite) {
  if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || rel.includes('..')) throw new Error('path must be relative to the project root');
  const norm = rel.replace(/\\/g, '/').replace(/^\.\//, '');
  if (DENY.test(norm)) throw new Error('this path is not accessible');
  if (forWrite && !WRITABLE.test(norm)) throw new Error('writes are allowed only under backend/app, backend/migrations, backend/tests, frontend/src, frontend/tests, or TRIAL_NOTES.md');
  const abs = path.join(ROOT, norm);
  const probe = fs.existsSync(abs) ? abs : path.dirname(abs);
  if (fs.existsSync(probe) && !fs.realpathSync(probe).startsWith(ROOT)) throw new Error('path escapes the project root');
  return [abs, norm];
}
const clip = (s, n = 40000) => s.length > n ? s.slice(0, n) + `\n...[truncated, ${s.length} chars in total; read a line range to see more]` : s;
const tail = (s, n = 14000) => s.length > n ? `...[first ${s.length - n} chars omitted]\n` + s.slice(-n) : s;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name); const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    if (DENY.test(rel)) continue;
    if (e.isDirectory()) walk(p, out); else if (e.isFile()) out.push(rel);
  }
  return out;
}
const dirOf = (dir) => (!dir || dir === '.' || dir === './') ? ROOT : safe(dir.replace(/[\\/]+$/, ''))[0];
const written = new Set();
const TOOLS = {
  list_files: { d: 'List files under a directory (recursive), relative to the project root.', p: { dir: { type: 'string' } }, r: [],
    f: ({ dir = '.' }) => walk(dirOf(dir)).join('\n') },
  read_file: { d: 'Read a text file. Optional 1-based start_line / end_line.', p: { path: { type: 'string' }, start_line: { type: 'integer' }, end_line: { type: 'integer' } }, r: ['path'],
    f: ({ path: p, start_line, end_line }) => { const [abs] = safe(p); const lines = fs.readFileSync(abs, 'utf8').split('\n'); const a = Math.max(1, start_line || 1), b = Math.min(lines.length, end_line || lines.length);
      return clip(`(${lines.length} lines; showing ${a}-${b})\n` + lines.slice(a - 1, b).map((l, i) => `${a + i}\t${l}`).join('\n')); } },
  search: { d: 'Regex search over text files. Returns file:line:text.', p: { pattern: { type: 'string' }, dir: { type: 'string' } }, r: ['pattern'],
    f: ({ pattern, dir = '.' }) => { const re = new RegExp(pattern); const out = [];
      for (const rel of walk(dirOf(dir))) { if (!TEXT.test(rel)) continue;
        fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n').forEach((l, i) => { if (out.length < 200 && re.test(l)) out.push(`${rel}:${i + 1}:${l.slice(0, 240)}`); }); }
      return out.join('\n') || '(no match)'; } },
  write_file: { d: 'Create or overwrite a whole file.', p: { path: { type: 'string' }, content: { type: 'string' } }, r: ['path', 'content'],
    f: ({ path: p, content }) => { const [abs, norm] = safe(p, true); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, content); written.add(norm); return `wrote ${norm} (${content.length} chars)`; } },
  edit_file: { d: 'Replace one exact occurrence of old_text with new_text in a file. old_text must match exactly once.', p: { path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' } }, r: ['path', 'old_text', 'new_text'],
    f: ({ path: p, old_text, new_text }) => { const [abs, norm] = safe(p, true); const s = fs.readFileSync(abs, 'utf8'); const n = s.split(old_text).length - 1;
      if (n !== 1) throw new Error(`old_text matches ${n} times; it must match exactly once (include more surrounding lines)`);
      fs.writeFileSync(abs, s.replace(old_text, () => new_text)); written.add(norm); return `edited ${norm}`; } },
  run_backend_tests: { d: 'Run the PostgreSQL integration tests in the trial container. Optional test_file (e.g. test_sourcing.py) and keyword (-k). Without arguments runs everything (about 2 minutes).', p: { test_file: { type: 'string' }, keyword: { type: 'string' } }, r: [],
    f: ({ test_file, keyword }) => runTests(test_file, keyword).text },
  check_frontend: { d: 'Type-check the frontend (tsc -b). Empty output with exit 0 means no errors.', p: {}, r: [], f: () => runTsc().text },
  finish: { d: 'Call when the task is complete and all checks pass, or when you cannot go further. Give an honest summary: files changed, what passes, what is not done or not verified.', p: { summary: { type: 'string' } }, r: ['summary'], f: () => 'ok' },
};
function runTests(test_file, keyword) {
  const a = ['compose', '-f', 'compose.trial.yaml', 'run', '--rm', 'tests', 'python', '-m', 'pytest'];
  if (test_file) { if (!/^test_\w+\.py$/.test(test_file)) throw new Error('test_file must look like test_name.py'); a.push('/tests/' + test_file); } else a.push('/tests');
  if (keyword) { if (!/^[\w ]{1,80}$/.test(keyword)) throw new Error('keyword: letters, digits, underscore and spaces only'); a.push('-k', keyword); }
  a.push('-q', '--tb=short', '-p', 'no:cacheprovider');
  const r = spawnSync('docker', a, { cwd: ROOT, encoding: 'utf8', timeout: 20 * 60e3, maxBuffer: 64e6 });
  const out = (r.stdout || '') + (r.status === 0 ? '' : '\n' + (r.stderr || '').split('\n').filter((l) => !/Container|Network|Volume|Running|Created|Started|Healthy|Waiting/.test(l)).join('\n'));
  return { code: r.status, text: `exit ${r.status}\n` + tail(out) };
}
function runTsc() {
  const r = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-b'], { cwd: path.join(ROOT, 'frontend'), encoding: 'utf8', timeout: 10 * 60e3, maxBuffer: 64e6 });
  return { code: r.status, text: `exit ${r.status}\n` + tail((r.stdout || '') + (r.stderr || ''), 12000) };
}
const toolDefs = Object.entries(TOOLS).map(([name, t]) => ({ type: 'function', function: { name, description: t.d, parameters: { type: 'object', properties: t.p, required: t.r } } }));

const pastDeadline = () => { const [h, m] = UNTIL.split(':').map(Number); const n = new Date(); const cur = n.getHours() * 60 + n.getMinutes(), end = h * 60 + m;
  return end < 20 * 60 ? (cur >= end && cur < 20 * 60) : cur >= end; };   // 夜间窗口 20:00 → 次日 UNTIL
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function chat(messages) {
  for (let fail = 0; ; fail++) {
    if (pastDeadline()) throw new Error('deadline');
    try {
      const res = await fetch(BASE + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (process.env.CN_LLM_API_KEY || 'none') },
        body: JSON.stringify({ model: MODEL, messages, tools: toolDefs, max_tokens: 24000, temperature: 0.2 }), signal: AbortSignal.timeout(30 * 60e3) });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 300));
      return await res.json();
    } catch (e) { log(`LLM 调用失败（第 ${fail + 1} 次）：${String(e.message).slice(0, 200)}；5 分钟后重试`); await sleep(5 * 60e3); }
  }
}
function shrink(messages) {   // 上下文过大时，把最早的工具输出换成占位
  let total = messages.reduce((n, m) => n + (m.content || '').length + JSON.stringify(m.tool_calls || '').length, 0);
  for (let i = 2; i < messages.length - 12 && total > 900000; i++) {
    const m = messages[i];
    if (m.role === 'tool' && m.content.length > 400) { total -= m.content.length - 60; m.content = '[older tool output removed to save context; call the tool again if needed]'; }
    if (m.role === 'assistant' && m.tool_calls) for (const c of m.tool_calls) if (c.function.arguments.length > 2000) { total -= c.function.arguments.length - 80; c.function.arguments = JSON.stringify({ note: 'arguments removed to save context' }); }
  }
}

const SYSTEM = `You are a careful senior engineer working alone, at night, in a copy of a production ERP codebase (FastAPI + SQLAlchemy + PostgreSQL + Alembic backend, React + UI5 Web Components frontend).
Work only through the tools. Read the existing code before writing: follow its structure, naming, tenant isolation, permission checks, audit logging, migration style and test style exactly.
Do not modify existing migrations or weaken existing tests. Keep changes minimal and complete. Run the backend tests and the frontend type check; fix what fails; the whole existing suite must still pass.
Never invent results: only say a check passes if you ran it and saw it pass. When done, call finish with an honest summary.`;
const messages = [{ role: 'system', content: SYSTEM }, { role: 'user', content: TASK }];
const usage = { prompt: 0, completion: 0, calls: 0 };
const t0 = Date.now(); let summary = null, stop = 'max-steps', idle = 0;
log(`开始：model=${MODEL} root=${ROOT} max=${MAX_STEPS} until=${UNTIL}`);
try {
  for (let step = 1; step <= MAX_STEPS && !summary; step++) {
    shrink(messages);
    const j = await chat(messages); usage.calls++; usage.prompt += j.usage?.prompt_tokens || 0; usage.completion += j.usage?.completion_tokens || 0;
    const m = j.choices[0].message; const calls = m.tool_calls || [];
    messages.push({ role: 'assistant', content: m.content || '', ...(calls.length ? { tool_calls: calls } : {}) });
    if (m.content) log(`#${step} 说：${m.content.replace(/\s+/g, ' ').slice(0, 300)}`);
    if (!calls.length) {
      if (++idle >= 3) { stop = 'no-tool-calls'; break; }
      messages.push({ role: 'user', content: 'Continue with the tools. If everything is implemented and all checks pass, call finish.' }); continue;
    }
    idle = 0;
    for (const c of calls) {
      let out, args = {};
      try { args = JSON.parse(c.function.arguments || '{}'); const t = TOOLS[c.function.name]; if (!t) throw new Error('unknown tool'); out = t.f(args); }
      catch (e) { out = 'ERROR: ' + e.message; }
      const brief = c.function.name + ' ' + JSON.stringify(Object.fromEntries(Object.entries(args).map(([k, v]) => [k, typeof v === 'string' && v.length > 80 ? v.length + ' chars' : v])));
      log(`#${step} ${brief} → ${String(out).split('\n')[0].slice(0, 120)}`);
      jl({ step, tool: c.function.name, args, out: String(out).slice(0, 20000), t: Date.now() - t0 });
      messages.push({ role: 'tool', tool_call_id: c.id, content: String(out) });
      if (c.function.name === 'finish') { summary = args.summary || ''; stop = 'finish'; }
    }
  }
} catch (e) { stop = e.message === 'deadline' ? 'deadline' : 'error: ' + e.message; }

// 无论模型怎么说，最后由脚本自己再跑一遍全部测试和类型检查，以这个结果为准。
log(`结束循环（${stop}）。独立复查中…`);
const tests = runTests(), tsc = runTsc();
const git = (a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
git(['add', '-A']); git(['-c', 'user.name=6kpro-trial', '-c', 'user.email=trial@local', 'commit', '-q', '-m', `6kpro trial result (${stop})`]);
const stat = git(['diff', '--stat', 'HEAD~1', 'HEAD']).stdout;
const result = { model: MODEL, stop, minutes: Math.round((Date.now() - t0) / 60e3), usage, files_written: [...written].sort(), model_summary: summary,
  verify: { backend_tests_exit: tests.code, backend_tests_tail: tests.text.split('\n').slice(-4).join('\n'), tsc_exit: tsc.code, tsc_tail: tsc.text.slice(-1500) }, diffstat: stat };
fs.writeFileSync(path.join(LOG, 'result.json'), JSON.stringify(result, null, 2));
log(`完成：stop=${stop} 用时 ${result.minutes} 分；调用 ${usage.calls} 次；tokens 入 ${usage.prompt} / 出 ${usage.completion}；后端测试 exit ${tests.code}；类型检查 exit ${tsc.code}`);
