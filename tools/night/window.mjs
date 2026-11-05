// 6kpro の利用時間帯（用户 2026-10-22：北京時間 20:00〜翌 10:00 は自由、昼は機主側 約 10 人が使用）。
// LLM_WINDOW=20-10 / LLM_WINDOW_TZ=Asia/Shanghai（.env か環境変数、または --window）。未設定なら常時 OK。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function inWindow(win = process.env.LLM_WINDOW ?? '', tz = process.env.LLM_WINDOW_TZ || 'Asia/Shanghai') {
  const m = String(win).match(/^(\d{1,2})-(\d{1,2})$/); if (!m) return true;
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(new Date()));
  const [a, b] = [Number(m[1]), Number(m[2])]; return a <= b ? h >= a && h < b : h >= a || h < b;
}

// ───────── 6kpro 停止時は自前モデルで代行（2026-11-01 用户「6kpro 停机时候用我自己模型」。10-21 の「本地模型で代替しない」を上書き） ─────────
// 自前モデル = Windows の Ollama（OpenAI 互換）。.env：LOCAL_LLM_BASE_URL（既定 http://localhost:11434/v1）、LOCAL_LLM_MODEL（既定 qwen3:30b-a3b）、
// 画像入りの依頼は LOCAL_LLM_VISION_MODEL（既定 qwen2.5vl:7b）。LLM_LOCAL_FALLBACK=0 で無効（6kpro 復旧を待つ従来動作）。
// 仕組み：waitLLM が 6kpro 停止を見つけたら、6kpro 宛ての /chat/completions を自前モデルへ振り替える（各スクリプトは変更不要）。
// 振り替え中に作った文章かどうかは currentLLM() で分かる（ig.mjs は投稿ごとに記録）。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENV = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const cfg = (k, d) => process.env[k] ?? ENV[k] ?? d;
const LOCAL = { base: String(cfg('LOCAL_LLM_BASE_URL', 'http://localhost:11434/v1')).replace(/\/$/, ''), model: cfg('LOCAL_LLM_MODEL', 'qwen3:30b-a3b'), vision: cfg('LOCAL_LLM_VISION_MODEL', 'qwen2.5vl:7b'), on: cfg('LLM_LOCAL_FALLBACK', '1') !== '0' };
let route = { remote: '', local: false };
export const currentLLM = () => route.local ? `local:${LOCAL.model}` : 'cn:6kpro';

const realFetch = globalThis.fetch;
let patched = false;
function patchFetch() {
  if (patched) return; patched = true;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    if (!route.local || !route.remote || !url.startsWith(route.remote) || !/\/chat\/completions$/.test(url) || !init.body) return realFetch(input, init);
    let body; try { body = JSON.parse(init.body); } catch { return realFetch(input, init); }
    const hasImage = JSON.stringify(body.messages || []).includes('"image_url"');
    body.model = hasImage ? LOCAL.vision : LOCAL.model;
    delete body.reasoning_effort;
    const headers = { ...(init.headers || {}) }; delete headers.authorization; delete headers.Authorization;
    if (!hasImage && /:11434/.test(LOCAL.base)) {   // Ollama の場合のみ（2026-11-05 から自前モデルは Strata :8080 = OpenAI 互換で思考は reasoning_content に分離されるのでそのまま /v1 へ）。qwen3 の思考を止める：Ollama 0.40 の /v1 は /no_think・think・reasoning_effort をどれも効かせず content が空になる（実測）→ ネイティブ /api/chat の think:false を使う
      const r = await realFetch(`${LOCAL.base.replace(/\/v1$/, '')}/api/chat`, { method: 'POST', headers, body: JSON.stringify({ model: body.model, messages: body.messages, stream: false, think: false, ...(body.response_format?.type === 'json_object' ? { format: 'json' } : {}), options: { num_ctx: 8192, num_predict: body.max_tokens ?? 4000, temperature: body.temperature ?? 0.7 } }) });
      const n = await r.json().catch(() => ({}));
      return new Response(JSON.stringify({ model: body.model, choices: [{ index: 0, finish_reason: n.done_reason || 'stop', message: { role: 'assistant', content: String(n.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim() } }], usage: { prompt_tokens: n.prompt_eval_count, completion_tokens: n.eval_count } }), { status: r.status, headers: { 'content-type': 'application/json' } });
    }
    const r = await realFetch(`${LOCAL.base}/chat/completions`, { ...init, headers, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    for (const c of j.choices || []) if (typeof c.message?.content === 'string') c.message.content = c.message.content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return new Response(JSON.stringify(j), { status: r.status, headers: { 'content-type': 'application/json' } });
  };
}
async function localUp() { try { const r = await realFetch(`${LOCAL.base}/models`, { signal: AbortSignal.timeout(5e3) }); return r.ok; } catch { return false; } }

// 6kpro が落ちている間：自前モデルが使えればそちらに振り替えて true。使えなければ従来どおり 5 分ごとに復旧待ち。時間外になったら false。
export async function waitLLM(base, win, log = console.log) {
  const root = String(base).replace(/\/v1\/?$/, '');
  const up = async () => { try { const r = await realFetch(`${root}/health`, { signal: AbortSignal.timeout(10e3) }); return r.ok; } catch { return false; } };
  let said = false;
  for (;;) {
    if (!inWindow(win)) return false;
    if (await up()) { if (route.local) log('6kpro 復旧 → 6kpro に戻す'); else if (said) log('6kpro 復旧'); route = { remote: String(base).replace(/\/$/, ''), local: false }; return true; }
    if (LOCAL.on && await localUp()) { if (!route.local) log(`6kpro 停止中 → 自前モデル ${LOCAL.model} で代行（${LOCAL.base}）`); route = { remote: String(base).replace(/\/$/, ''), local: true }; patchFetch(); return true; }
    if (!said) { log(`6kpro 停止中${LOCAL.on ? '、自前モデルも応答なし' : ''} → 5 分ごとに復旧待ち`); said = true; }
    await new Promise((r) => setTimeout(r, 300e3));
  }
}
