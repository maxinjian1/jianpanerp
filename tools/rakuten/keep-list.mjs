#!/usr/bin/env node
/**
 * 楽天「残す商品リスト」運用（2026-10-29 用户：批发商畅销表「表上有的上架，没有的全部下架」）。
 *
 *   node tools/rakuten/keep-list.mjs plan  [--keep tools/rakuten/in/keep-skus.txt]   # SKU → 斑馬草稿の SPU/管理番号に対応付け → out/keep-plan.json + docs/rakuten/keep-plan.md
 *   node tools/rakuten/keep-list.mjs apply [--only hide|show] [--limit N] [--dry]     # RMS 商品 API 2.0：リスト外 = hideItem=true、リスト内で非表示中 = hideItem=false。備份 out/reprice-backup/（reprice.mjs rollback と共通）
 *
 * 対応付け：SKU（正規化：小文字・_→-）が草稿の「SKU編号」「SKU管理ID」「SPU」のいずれかと完全一致、または SKU編号 が「<keep>-…」で始まる → その SPU を残す。
 * 楽天に出品済みか = docs/rakuten/publish-log.csv の result=ok。リスト内で未出品のものは「斑馬草稿から発行」リストに出す（本ツールは発行しない）。
 * 非表示は削除ではない。rollback は reprice.mjs rollback（備份から hideItem を戻す）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out'), DOCS = path.join(ROOT, 'docs/rakuten'), BAK = path.join(OUT, 'reprice-backup');
fs.mkdirSync(BAK, { recursive: true });
const [cmd = 'plan', ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : null).filter(Boolean));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const J = (f, d) => d === undefined ? (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null) : fs.writeFileSync(f, JSON.stringify(d, null, 1));
const K = (s) => String(s || '').toLowerCase().replace(/[\s_]/g, '-').replace(/\/+/g, '-');
function csv(file) { const txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); const rows = []; let row = [], v = '', q = false; for (let i = 0; i < txt.length; i++) { const c = txt[i]; if (q) { if (c === '"') { if (txt[i + 1] === '"') { v += '"'; i++; } else q = false; } else v += c; } else if (c === '"') q = true; else if (c === ',') { row.push(v); v = ''; } else if (c === '\n') { row.push(v.replace(/\r$/, '')); rows.push(row); row = []; v = ''; } else v += c; } if (v || row.length) { row.push(v); rows.push(row); } const h = rows.shift(); return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))); }
const STORAGE = /^(\d+(tb|gb)|nck|up-|\d+-up|512|128)/i;   // 記憶媒体（2026-10-29 用户「不卖」決定と衝突 → 計画で警告）

function plan() {
  const keepF = args.keep || path.join(ROOT, 'tools/rakuten/in/keep-skus.txt');
  const keep = fs.readFileSync(keepF, 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => { const [sku, qty] = l.split(','); return { sku: sku.trim(), qty: Number(qty) || 0 }; });
  const drafts = csv(path.join(DOCS, 'banma-draft-list.csv'));
  const okSpu = new Set(csv(path.join(DOCS, 'publish-log.csv')).filter((r) => /^ok$/i.test(r.result ?? '')).map((r) => r.spu));
  const bySpu = new Map(); for (const r of drafts) { if (!r.SPU) continue; const o = bySpu.get(r.SPU) ?? { spu: r.SPU, mn: r['管理编号'] || r.SPU, name: r['商品名'], skus: [], ids: [] }; o.skus.push(K(r['SKU编号'])); o.ids.push(K(r['SKU管理ID'])); bySpu.set(r.SPU, o); }
  const keepSpu = new Map(); const unmatched = [];
  for (const k of keep) {
    const kk = K(k.sku), flat = kk.replace(/-/g, ''), kt = kk.split('-');
    // 表の SKU「E-05-A」は草稿では「E-05-4-A」「E-11-B-3」「D-34-A-1」のように SPU 番号が間に入る → トークンの部分列一致（先頭トークン一致）。「NCK-1T」↔「NCK-1TB」は末尾トークン前方一致。「X001BLOJJP-1」↔「X001BLOJJP1」はハイフン無視一致
    const sub = (t) => { const dt = t.split('-'); if (dt[0] !== kt[0] || (kt.length > 1 && dt.length > 1 && dt[1] !== kt[1])) return false;   // 先頭 2 トークン（E-11）は一致必須：E-11-F が E-01-11-F に当たるのを防ぐ let i = 0; for (const x of dt) { if (i < kt.length && (x === kt[i] || (kt[i].length >= 2 && x.startsWith(kt[i])))) i++; } return i === kt.length; };
    const hits = [...bySpu.values()].filter((o) => K(o.spu) === kk || K(o.spu).replace(/-/g, '') === flat || o.skus.includes(kk) || o.ids.includes(kk) || o.skus.some((x) => x.replace(/-/g, '') === flat || sub(x)) || kk.startsWith(K(o.spu) + '-'));
    if (!hits.length) { unmatched.push(k); continue; }
    for (const o of hits) { const e = keepSpu.get(o.spu) ?? { ...o, keepSkus: [], qty: 0 }; e.keepSkus.push(k.sku); e.qty += k.qty; keepSpu.set(o.spu, e); }
  }
  const show = [...keepSpu.values()].filter((o) => okSpu.has(o.spu)).map((o) => ({ spu: o.spu, mn: o.mn, name: o.name.slice(0, 60), keepSkus: o.keepSkus, qty: o.qty, storage: STORAGE.test(o.spu) || o.keepSkus.some((s) => STORAGE.test(s)) }));
  const publish = [...keepSpu.values()].filter((o) => !okSpu.has(o.spu)).map((o) => ({ spu: o.spu, mn: o.mn, name: o.name.slice(0, 60), keepSkus: o.keepSkus, qty: o.qty, storage: STORAGE.test(o.spu) || o.keepSkus.some((s) => STORAGE.test(s)) }));
  const hide = [...okSpu].filter((s) => !keepSpu.has(s)).map((s) => { const o = bySpu.get(s); return { spu: s, mn: o?.mn || s, name: (o?.name || '').slice(0, 60) }; });
  const out = { at: new Date().toISOString(), keepFile: path.relative(ROOT, keepF), keep: keep.length, show, publish, hide, unmatched };
  J(path.join(OUT, 'keep-plan.json'), out);
  const st = (x) => x.storage ? ' ⚠記憶媒体' : '';
  const md = [`# 楽天 残す商品リスト 計画（${out.at.slice(0, 16)}Z）`, '', `用户の表 ${keep.length} SKU → 草稿 SPU に対応。**楽天は SPU（管理番号）単位**なので、表の SKU を含む SPU を丸ごと残す。`, '',
    '| 区分 | 件数 |', '|---|---|', `| 残す（出品済み、表示を確認） | ${show.length} |`, `| 表にあるが楽天未出品 → 斑馬草稿から発行 | ${publish.length} |`, `| **非表示にする**（出品済みで表に無い） | **${hide.length}** |`, `| 表の SKU が草稿に見つからない | ${unmatched.length} |`, '',
    `⚠ 記憶媒体（HDD/USB/SD）は 2026-10-29 朝に「容量偽装の疑いで売らない」と決めた商品。表にあるので一覧には載せるが、**用户が改めて OK と言うまで apply --only show / 発行の対象から外す**（--storage 1 で含める）。`, '',
    `## 残す（出品済み ${show.length} 件）`, '', '| SPU | 管理番号 | 表の SKU | 表の数量 | 商品名 |', '|---|---|---|---|---|', ...show.sort((a, b) => b.qty - a.qty).map((x) => `| ${x.spu} | ${x.mn} | ${x.keepSkus.join(' ')}${st(x)} | ${x.qty} | ${x.name} |`), '',
    `## 発行が必要（表にあるが楽天未出品 ${publish.length} 件）`, '', '| SPU | 表の SKU | 表の数量 | 商品名 |', '|---|---|---|---|', ...publish.sort((a, b) => b.qty - a.qty).map((x) => `| ${x.spu} | ${x.keepSkus.join(' ')}${st(x)} | ${x.qty} | ${x.name} |`), '',
    `## 草稿に見つからない（${unmatched.length} 件、用户に SKU の意味を確認）`, '', ...unmatched.map((k) => `- ${k.sku}（${k.qty}）`), '',
    `## 非表示にする（${hide.length} 件）`, '', '| SPU | 管理番号 | 商品名 |', '|---|---|---|', ...hide.map((x) => `| ${x.spu} | ${x.mn} | ${x.name} |`), ''];
  fs.writeFileSync(path.join(DOCS, 'keep-plan.md'), md.join('\n'));
  log(`plan: show ${show.length} / publish ${publish.length} / hide ${hide.length} / unmatched ${unmatched.length} → docs/rakuten/keep-plan.md`);
}

function auth() { if (!env.RAKUTEN_SERVICE_SECRET || !env.RAKUTEN_LICENSE_KEY) { console.error('.env に RAKUTEN_SERVICE_SECRET / RAKUTEN_LICENSE_KEY が必要'); process.exit(2); } return 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64'); }
const API = 'https://api.rms.rakuten.co.jp/es/2.0/items/manage-numbers'; let last = 0; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function rms(mn, body) {
  const wait = 1100 - (Date.now() - last); if (wait > 0) await sleep(wait); last = Date.now();
  const r = await fetch(`${API}/${encodeURIComponent(String(mn).trim().replace(/[\s\/]+/g, '-'))}`, { method: body ? 'PATCH' : 'GET', headers: { Authorization: auth(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch {}
  if (!r.ok) throw new Error(`${body ? 'PATCH' : 'GET'} ${mn} http ${r.status} ${(j.errors || []).map((e) => e.code + ':' + e.message).join(';') || txt.slice(0, 200)}`);
  return j;
}
async function apply() {
  const p = J(path.join(OUT, 'keep-plan.json')); if (!p) { console.error('先に plan'); process.exit(2); }
  const only = args.only, dry = !!args.dry, withStorage = !!args.storage;
  let todo = [...(only === 'show' ? [] : p.hide.map((x) => ({ ...x, action: 'hide' }))), ...(only === 'hide' ? [] : p.show.filter((x) => withStorage || !x.storage).map((x) => ({ ...x, action: 'show' })))];
  if (args.limit) todo = todo.slice(0, Number(args.limit));
  const logF = path.join(DOCS, 'reprice-log.csv'); let ok = 0, fail = 0, skip = 0, streak = 0;
  log('todo', todo.length, 'hide', todo.filter((t) => t.action === 'hide').length, 'show', todo.filter((t) => t.action === 'show').length, dry ? '(dry)' : '');
  for (const t of todo) {
    try {
      let item; try { item = await rms(t.mn); } catch (e) { if (/404|GE0014/.test(e.message)) { skip++; log('skip（RMS に無し）', t.mn); continue; } throw e; }
      const want = t.action === 'hide';
      if (!!item.hideItem === want) { skip++; continue; }   // すでに希望の状態
      const bf = path.join(BAK, `${t.mn.replace(/[\/:*?"<>|]/g, '_')}.json`); if (!fs.existsSync(bf)) J(bf, { at: new Date().toISOString(), mn: t.mn, hideItem: item.hideItem, variants: Object.fromEntries(Object.entries(item.variants || {}).map(([id, v]) => [id, { standardPrice: v.standardPrice }])) });
      if (!dry) await rms(t.mn, { hideItem: want });
      ok++; streak = 0; fs.appendFileSync(logF, `${new Date().toISOString()},${t.spu},${t.mn},keep-${t.action},,,ok,${dry ? 'dry' : ''}\n`); log('ok', t.action, t.mn);
    } catch (e) { fail++; streak++; fs.appendFileSync(logF, `${new Date().toISOString()},${t.spu},${t.mn},keep-${t.action},,,fail,"${e.message.replace(/"/g, "'").slice(0, 160)}"\n`); log('FAIL', t.mn, e.message.slice(0, 160)); if (streak >= 5 || fail > Math.max(5, (ok + fail) * 0.02)) { log('失敗が多いので停止'); break; } }
  }
  log(`apply done ok ${ok} fail ${fail} skip ${skip}`);
}
const run = { plan, apply }[cmd]; if (!run) { console.error('usage: keep-list.mjs plan|apply'); process.exit(2); }
Promise.resolve().then(run).catch((e) => { console.error(e); process.exit(1); });
