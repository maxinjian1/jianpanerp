#!/usr/bin/env node
/**
 * 楽天 動的価格（2026-10-27 用户「全部按建议做」：A 档 = 競合最安 −3%、B 档 = 競合最安、底線 = 仕入 ×1.25、C 档で 15% 以上高い → 非表示）
 *
 *   node tools/rakuten/reprice.mjs plan   [--raise-cap 1.25] [--floor 1.25] [--hide-ratio 1.15]   # price-tier.json × 仕入値 → out/reprice-plan.json + docs/rakuten/reprice-plan.md
 *   node tools/rakuten/reprice.mjs apply  [--limit N] [--only price|hide] [--dry]                   # RMS 商品 API 2.0：variants.standardPrice を比率で更新 / hideItem=true。2% 失敗・5 連続失敗で停止
 *   node tools/rakuten/reprice.mjs rollback [--limit N]                                              # out/reprice-backup/<mn>.json から元の価格・表示状態に戻す
 *
 * 前提：`price-tier.mjs` の out/price-tier.json（毎日 1 回更新）、`tools/kjyf-b2b/out/b2b-full.json`（仕入値、SKU=out_id）、.env の RAKUTEN_SERVICE_SECRET / RAKUTEN_LICENSE_KEY（商品 API 2.0 利用中）。
 * ルール：価格は 10 円単位に切り下げ、全 SKU を同じ比率で動かす（SKU 間の価格差を維持）、値上げは現行の raise-cap 倍まで、値下げは底線まで。
 *   仕入値が取れない商品は値下げ幅を現行の −10% までに制限（底線不明のため）。価格変更・非表示は必ずバックアップしてから。
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
const RAISE_CAP = Number(args['raise-cap'] || 1.25), FLOOR_MULT = Number(args.floor || 1.25), HIDE_RATIO = Number(args['hide-ratio'] || 1.15), A_DISCOUNT = 0.97;
const API = 'https://api.rms.rakuten.co.jp/es/2.0/items/manage-numbers';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const J = (f, d) => d === undefined ? (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null) : fs.writeFileSync(f, JSON.stringify(d, null, 1));
const r10 = (x) => Math.floor(x / 10) * 10, c10 = (x) => Math.ceil(x / 10) * 10;
const K = (s) => String(s || '').toLowerCase().replace(/[\s_]/g, '-');

function auth() { if (!env.RAKUTEN_SERVICE_SECRET || !env.RAKUTEN_LICENSE_KEY) { console.error('.env に RAKUTEN_SERVICE_SECRET / RAKUTEN_LICENSE_KEY が必要'); process.exit(2); } return 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64'); }
let last = 0;
async function rms(mn, body) {
  const wait = 1100 - (Date.now() - last); if (wait > 0) await sleep(wait); last = Date.now();
  const r = await fetch(`${API}/${encodeURIComponent(mn)}`, { method: body ? 'PATCH' : 'GET', headers: { Authorization: auth(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text(); let j = {}; try { j = txt ? JSON.parse(txt) : {}; } catch {}
  if (!r.ok) throw new Error(`${body ? 'PATCH' : 'GET'} ${mn} http ${r.status} ${(j.errors || []).map((e) => e.code + ':' + e.message).join(';') || txt.slice(0, 200)}`);
  return j;
}

// 仕入値：b2b-full.json の skus[].out_id（= 当社 SKU）→ price。SPU（管理番号）に前方一致する SKU の最小仕入値
function wholesaleIndex() {
  const f = path.join(ROOT, 'tools/kjyf-b2b/out/b2b-full.json'); const d = J(f); if (!d) { log('b2b-full.json なし → 仕入値不明として扱う'); return () => null; }
  const bySku = new Map(); for (const g of d.list || []) for (const s of g.skus || []) if (s.out_id && Number(s.price) > 0) bySku.set(K(s.out_id), Number(s.price));
  const keys = [...bySku.keys()];
  return (spu) => { const k = K(spu); const exact = bySku.get(k); if (exact) return exact; const c = keys.filter((x) => x === k || x.startsWith(k + '-') || k.startsWith(x + '-')); return c.length ? Math.min(...c.map((x) => bySku.get(x))) : null; };
}

function plan() {
  const rows = J(path.join(OUT, 'price-tier.json')); if (!rows) { console.error('先に price-tier.mjs'); process.exit(2); }
  const W = wholesaleIndex();
  const plan = [];
  for (const r of rows) {
    const w = W(r.spu); const floor = w ? c10(w * FLOOR_MULT) : r10(r.our * 0.9);
    let action = 'keep', target = r.our, why = '';
    if (r.tier === 'A' || r.tier === 'B') {
      const ideal = r.tier === 'A' ? r10(r.compMin * A_DISCOUNT) : r10(r.compMin);
      target = Math.max(floor, Math.min(ideal, r10(r.our * RAISE_CAP)));
      if (target !== r.our) { action = target > r.our ? 'raise' : 'lower'; why = `${r.tier}: 競合最安 ¥${r.compMin} → 目標 ¥${ideal}${target !== ideal ? `（${target === floor ? '底線' : '値上げ上限'} ¥${target}）` : ''}`; }
      else why = `${r.tier}: 現行維持`;
    } else if (r.ratio != null && r.ratio > HIDE_RATIO) {
      const ideal = r10(r.compMin); // 底線まで下げれば B 档に入れるなら値下げ、入らなければ非表示
      if (ideal >= floor) { action = 'lower'; target = ideal; why = `C→B: 競合最安 ¥${r.compMin} まで値下げ（底線 ¥${floor}）`; }
      else { action = 'hide'; why = `C: 競合最安 ¥${r.compMin} < 底線 ¥${floor}（${r.ratio.toFixed(2)} 倍）→ 非表示`; }
    } else why = 'C: 競合不明 → 維持';
    plan.push({ spu: r.spu, mn: r.mn, name: r.name, tier: r.tier, our: r.our, compMin: r.compMin, ratio: r.ratio, wholesale: w, floor, target, action, why, stock: r.stock });
  }
  J(path.join(OUT, 'reprice-plan.json'), plan);
  const cnt = (a) => plan.filter((p) => p.action === a).length;
  const md = [`# 楽天 動的価格 計画（${new Date().toISOString().slice(0, 16)}Z）`, '', `ルール：A = 競合最安 −3%、B = 競合最安、底線 = 仕入 ×${FLOOR_MULT}（仕入不明は現行 −10% まで）、値上げ上限 ×${RAISE_CAP}、C で ${HIDE_RATIO} 倍超は底線まで下げられなければ非表示。10 円単位、全 SKU 同比率。`, '',
    `| 操作 | 件数 |`, `|---|---|`, `| 値下げ | ${cnt('lower')} |`, `| 値上げ | ${cnt('raise')} |`, `| 非表示 | ${cnt('hide')} |`, `| 維持 | ${cnt('keep')} |`, '',
    ...['lower', 'raise', 'hide'].flatMap((a) => [`## ${{ lower: '値下げ', raise: '値上げ', hide: '非表示' }[a]}（${cnt(a)} 件）`, '', '| SPU | 商品名 | 档 | 現行 | 競合最安 | 仕入 | 底線 | 新価格 | 理由 |', '|---|---|---|---|---|---|---|---|---|', ...plan.filter((p) => p.action === a).sort((x, y) => (x.ratio ?? 9) - (y.ratio ?? 9)).map((p) => `| ${p.spu} | ${String(p.name).slice(0, 36)} | ${p.tier} | ¥${p.our} | ${p.compMin ? '¥' + p.compMin : '-'} | ${p.wholesale ? '¥' + p.wholesale : '不明'} | ¥${p.floor} | ${a === 'hide' ? '—' : '¥' + p.target} | ${p.why} |`), ''])];
  fs.writeFileSync(path.join(DOCS, 'reprice-plan.md'), md.join('\n'));
  log(`plan: lower ${cnt('lower')} raise ${cnt('raise')} hide ${cnt('hide')} keep ${cnt('keep')} → docs/rakuten/reprice-plan.md`);
}

async function apply() {
  const plan = J(path.join(OUT, 'reprice-plan.json')); if (!plan) { console.error('先に plan'); process.exit(2); }
  const only = args.only; const dry = !!args.dry;
  let todo = plan.filter((p) => p.action !== 'keep' && (!only || (only === 'hide' ? p.action === 'hide' : p.action !== 'hide'))).slice(0, args.limit ? Number(args.limit) : undefined);
  const logF = path.join(DOCS, 'reprice-log.csv'); if (!fs.existsSync(logF)) fs.writeFileSync(logF, 'time,spu,mn,action,old_min,new_min,result,error\n');
  const done = new Set(fs.readFileSync(logF, 'utf8').split('\n').slice(1).filter(Boolean).map((l) => l.split(',')).filter((c) => c[6] === 'ok' && c[7] !== 'dry').map((c) => c[1] + '|' + c[3]));
  todo = todo.filter((p) => !done.has(p.spu + '|' + p.action));
  log(`apply ${todo.length} items${dry ? ' (dry)' : ''}`);
  let ok = 0, fail = 0, streak = 0;
  for (const p of todo) {
    try {
      const item = await rms(p.mn);
      const bf = path.join(BAK, `${p.mn}.json`); if (!fs.existsSync(bf)) J(bf, { at: new Date().toISOString(), mn: p.mn, hideItem: item.hideItem, variants: Object.fromEntries(Object.entries(item.variants || {}).map(([id, v]) => [id, { standardPrice: v.standardPrice }])) });
      let body;
      if (p.action === 'hide') body = { hideItem: true };
      else {
        const prices = Object.values(item.variants || {}).map((v) => Number(v.standardPrice)).filter((x) => x > 0); const curMin = Math.min(...prices);
        const k = p.target / curMin; body = { variants: Object.fromEntries(Object.entries(item.variants || {}).map(([id, v]) => [id, { standardPrice: Math.max(p.floor, r10(Number(v.standardPrice) * k)) }])) };
        p.oldMin = curMin;
      }
      if (!dry) await rms(p.mn, body);
      ok++; streak = 0; fs.appendFileSync(logF, `${new Date().toISOString()},${p.spu},${p.mn},${p.action},${p.oldMin ?? p.our},${p.action === 'hide' ? '' : p.target},ok,${dry ? 'dry' : ''}\n`); log('ok', p.action, p.spu, p.action === 'hide' ? '' : `¥${p.oldMin} → ¥${p.target}`);
    } catch (e) {
      fail++; streak++; fs.appendFileSync(logF, `${new Date().toISOString()},${p.spu},${p.mn},${p.action},${p.our},,fail,"${e.message.replace(/"/g, "'").slice(0, 160)}"\n`); log('FAIL', p.spu, e.message.slice(0, 160));
      if (streak >= 5 || (ok + fail >= 50 && fail / (ok + fail) > 0.02)) { log('停止：失敗率 2% 超または 5 連続失敗'); break; }
    }
  }
  log(`done ok ${ok} fail ${fail} → docs/rakuten/reprice-log.csv`);
}

async function rollback() {
  const files = fs.readdirSync(BAK).slice(0, args.limit ? Number(args.limit) : undefined); let ok = 0, fail = 0;
  for (const f of files) { const b = J(path.join(BAK, f)); try { await rms(b.mn, { hideItem: !!b.hideItem, variants: b.variants }); ok++; log('restored', b.mn); } catch (e) { fail++; log('FAIL', b.mn, e.message.slice(0, 160)); } }
  log(`rollback ok ${ok} fail ${fail}`);
}

const run = { plan, apply, rollback }[cmd]; if (!run) { console.error('usage: reprice.mjs plan|apply|rollback'); process.exit(2); }
Promise.resolve().then(run).catch((e) => { console.error(e); process.exit(1); });
