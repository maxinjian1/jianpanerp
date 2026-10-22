// 6kpro の利用時間帯（用户 2026-10-22：北京時間 20:00〜翌 10:00 は自由、昼は機主側 約 10 人が使用）。
// LLM_WINDOW=20-10 / LLM_WINDOW_TZ=Asia/Shanghai（.env か環境変数、または --window）。未設定なら常時 OK。
export function inWindow(win = process.env.LLM_WINDOW ?? '', tz = process.env.LLM_WINDOW_TZ || 'Asia/Shanghai') {
  const m = String(win).match(/^(\d{1,2})-(\d{1,2})$/); if (!m) return true;
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(new Date()));
  const [a, b] = [Number(m[1]), Number(m[2])]; return a <= b ? h >= a && h < b : h >= a || h < b;
}

// 6kpro が落ちている間は 5 分ごとに /health を見て待つ。復旧したら true、時間外になったら false（エラーで空回りして件数を消費しないため）。
export async function waitLLM(base, win, log = console.log) {
  const root = String(base).replace(/\/v1\/?$/, '');
  const up = async () => { try { const r = await fetch(`${root}/health`, { signal: AbortSignal.timeout(10e3) }); return r.ok; } catch { return false; } };
  let said = false;
  for (;;) {
    if (!inWindow(win)) return false;
    if (await up()) { if (said) log('6kpro 復旧'); return true; }
    if (!said) { log('6kpro 停止中 → 5 分ごとに復旧待ち'); said = true; }
    await new Promise((r) => setTimeout(r, 300e3));
  }
}
