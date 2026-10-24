// 斑馬 ERP「乐天V2」草稿箱の全商品を編集ページから取り出し、ローカルの recv.mjs に保存する（ブラウザのコンソール／javascript_tool で実行）。
// 前提：斑馬にログイン済みのタブで実行。recv.mjs が http://127.0.0.1:47124 で待っていること。
// 使い方：IDS に [{id, spu}] を入れてから実行（id = 編集ページ URL の GUID、spu = 管理編号）。
//   DraftListData の各行から id/spu を作る例は下の listDrafts() 参照（列名が違えば直す）。
// 出力：tools/rakuten/out/drafts/<spu>.json（編集ページの product オブジェクトそのまま＋取得時刻）
// 速度：1 件あたり 1.2〜2 秒待つ（斑馬は第三者システム。並列にしない）。

(async () => {
  const RECV = 'http://127.0.0.1:47124';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = () => sleep(1200 + Math.random() * 800);

  // 草稿一覧（必要なら列名を直す）。すでに drafts_full.json があるならそれから IDS を作ってもよい。
  async function listDrafts() {
    const rows = [];
    for (let page = 1; page < 200; page++) {
      const r = await fetch('/Rakuten/ProductV2/DraftListData', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ page: String(page), limit: '100', rows: '100' }) });
      const j = await r.json(); const list = j.rows ?? j.Data ?? j.data ?? [];
      if (!list.length) break; rows.push(...list); if (list.length < 100) break; await jitter();
    }
    return rows;
  }

  // 編集ページ HTML から `product = {...}` を取り出す（括弧の対応で切り出し）
  function extractProduct(html) {
    const m = html.match(/\bproduct\s*=\s*\{/); if (!m) return null;
    let i = m.index + m[0].length - 1, depth = 0, inStr = false, esc = false, q = '';
    for (; i < html.length; i++) {
      const c = html[i];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === q) inStr = false; continue; }
      if (c === '"' || c === "'") { inStr = true; q = c; continue; }
      if (c === '{') depth++; else if (c === '}') { depth--; if (depth === 0) { const txt = html.slice(m.index + m[0].length - 1, i + 1); try { return JSON.parse(txt); } catch { try { return (0, eval)('(' + txt + ')'); } catch { return { _raw: txt.slice(0, 200000) }; } } } }
    }
    return null;
  }

  const IDS = window.IDS ?? (await listDrafts()).map((r) => ({ id: r.ID ?? r.Id ?? r.id ?? r.GUID, spu: r.SPU ?? r.Spu ?? r.spu ?? r.ManageNumber ?? r.manageNumber })).filter((x) => x.id && x.spu);
  console.log('drafts', IDS.length);
  let ok = 0, fail = 0;
  for (const [n, { id, spu }] of IDS.entries()) {
    try {
      const html = await (await fetch(`/Rakuten/ProductV2/Edit/${id}`)).text();
      if (/login|登录|ログイン/i.test(html.slice(0, 3000)) && !/product\s*=/.test(html)) throw new Error('LOGIN_REQUIRED');
      const product = extractProduct(html); if (!product) throw new Error('product object not found');
      const r = await fetch(`${RECV}/?f=drafts/${encodeURIComponent(String(spu).replace(/[\\/:*?"<>|]/g, '_'))}.json`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, spu, fetchedAt: new Date().toISOString(), product }) });
      if (!r.ok) throw new Error('recv ' + r.status); ok++;
    } catch (e) { fail++; console.warn('ERR', spu, e.message); if (/LOGIN_REQUIRED/.test(e.message)) break; if (fail > 20 && fail / (n + 1) > 0.05) { console.error('too many failures, stop'); break; } }
    if (n % 25 === 0) console.log(n, '/', IDS.length, 'ok', ok, 'fail', fail);
    await jitter();
  }
  console.log('done ok', ok, 'fail', fail);
})();
