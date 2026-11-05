// 楽天 RPP 対象の選定（読み取りのみ。RMS には何も書かない）。2026-11-05 用户「策划乐天广告」
// node tools/rakuten/ads-plan.mjs → tools/rakuten/out/ads-plan.json と docs/rakuten/ads-plan-<日付>.md
// 入力：out/price-tier.json（毎朝 daily-sync）＋ out/reprice-plan.json（仕入値）＋ RMS 商品 API（表示/非表示・現在価格）
// 除外ルール：非表示・在庫 <10・仕入不明・広告余地 <¥150・商品名に効能/開運など広告審査で落ちやすい語・同一商品の色違い別出品は代表 1 件だけ
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const auth = 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const FEE = 0.13;            // 楽天費用（がんばれプラン上限側の見積り 13%：システム利用料・決済・ポイント 1%・アフィリエイト等）
const POINT_EXTRA = 0.02;    // A 档 ポイント 3 倍の追加 2%
const PROFIT = 0.10;         // 守る利益 10%
const CPC = 40;              // RPP クリック単価の想定（最低 ¥10、実勢 ¥25〜50 の中間。RMS の実績で置き換える）
const CVR = 0.03;            // 楽天の想定転換率 3%（新店・無評価なので保守的）
const RISKY = /開運|金運|仕事運|蓄財|お守り|姿勢矯正|猫背|腰痛|改善|予防|治|透明感|ニキビ|美白|睡眠の質|安眠|快眠|疲労|血行|痩|脂肪|コスプレ/;

const tier = JSON.parse(fs.readFileSync(path.join(OUT, 'price-tier.json'), 'utf8'));
const rp = JSON.parse(fs.readFileSync(path.join(OUT, 'reprice-plan.json'), 'utf8'));
const cost = Object.fromEntries((Array.isArray(rp) ? rp : []).map((r) => [r.spu, r]));
// 仕入値（送料込み卸価）：kjyf B2B の SKU 単位。keep-list の SKU → RMS の variant ID → 管理番号の前方一致 の順に探す
const K = (s) => String(s || '').toLowerCase().replace(/[\s_\/]/g, '-');
const bySku = new Map(); for (const g of (JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/kjyf-b2b/out/b2b-full.json'), 'utf8')).list || [])) for (const s of g.skus || []) if (s.out_id && Number(s.price) > 0) bySku.set(K(s.out_id), Number(s.price));
const skuKeys = [...bySku.keys()];
function wholesale(spu, skus) {
  const hit = skus.map((s) => bySku.get(K(s))).filter(Boolean); if (hit.length) return Math.max(...hit);   // 色違いで卸価が違う時は高い方（安全側）
  const k = K(spu); const c = skuKeys.filter((x) => x === k || x.startsWith(k + '-') || k.startsWith(x + '-')); return c.length ? Math.max(...c.map((x) => bySku.get(x))) : null;
}
async function rms(mn) {
  await sleep(1100);
  const r = await fetch(`https://api.rms.rakuten.co.jp/es/2.0/items/manage-numbers/${encodeURIComponent(String(mn).trim().replace(/[\s\/]+/g, '-'))}`, { headers: { Authorization: auth } });
  return r.ok ? r.json() : { _err: r.status };
}
// 対象：いま表示中の商品 = keep-list（10-29 卸の売れ筋表 → 残す 45 + 発行 6）＋その後の新着。A 档でも非表示（694 件側）は広告できない
const keep = JSON.parse(fs.readFileSync(path.join(OUT, 'keep-plan.json'), 'utf8'));
const tierBy = Object.fromEntries(tier.map((t) => [t.spu, t]));
const extra = String(process.argv.includes('--extra') ? process.argv[process.argv.indexOf('--extra') + 1] : 'HOOP-2SET,YKOGH-08').split(',').filter(Boolean);
const A = [...keep.show, ...keep.publish, ...extra.map((mn) => ({ spu: mn, mn, name: mn, qty: null }))].map((k) => ({ ...(tierBy[k.spu] || { spu: k.spu, mn: k.mn, name: k.name, our: null, compMin: null, stock: 99, tier: '-' }), qty: k.qty, keepSkus: k.keepSkus || [] }));
const rows = [];
for (const t of A) {
  const item = await rms(t.mn);
  const prices = Object.values(item.variants || {}).map((v) => Number(v.standardPrice)).filter(Boolean);
  const price = prices.length ? Math.min(...prices) : t.our;
  const w = wholesale(t.spu, [...(t.keepSkus || []), ...Object.keys(item.variants || {})]) ?? cost[t.spu]?.wholesale ?? null;
  const room = w ? Math.floor(price * (1 - FEE - POINT_EXTRA - PROFIT) - w) : null;   // 1 注文あたり広告に使える上限
  const why = [];
  if (item._err) why.push(`RMS 取得失敗 ${item._err}`);
  if (item.hideItem) why.push('非表示中');
  if (t.stock < 10) why.push('在庫 <10');
  if (w == null) why.push('仕入不明（利益計算できない）');
  else if (room < 150) why.push(`広告余地 ¥${room}（<¥150）`);
  const risky = (item.title || t.name).match(RISKY); if (risky) why.push(`商品名に「${risky[0]}」→ 先に商品名修正`);
  if (t.compMin && price > t.compMin * 2) t.compMin = null;   // 2 倍超は比価の誤マッチ（別商品・パーツ単品）とみなし比較しない
  if (t.compMin && price > t.compMin * 1.15) why.push(`競合最安 ¥${t.compMin} より ${Math.round((price / t.compMin - 1) * 100)}% 高い`);
  rows.push({ spu: t.spu, mn: t.mn, tier: t.tier, qty: t.qty, name: (item.title || t.name).slice(0, 40), price, compMin: t.compMin, wholesale: w, room, maxCpc: room != null ? Math.floor(room * CVR) : null, hidden: !!item.hideItem, why });
  process.stdout.write('.');
}
// 色違い別出品（D-47 / D-47-1 …）は 1 件に：同じ先頭名 30 字の中で広告余地が最大のもの
const groups = {};
for (const r of rows.filter((r) => !r.why.length)) { const k = r.name.slice(0, 30); (groups[k] ||= []).push(r); }
for (const g of Object.values(groups)) { g.sort((a, b) => b.room - a.room); g.slice(1).forEach((r) => r.why.push(`同一商品の別出品（代表 ${g[0].mn}）`)); }
const pick = rows.filter((r) => !r.why.length).sort((a, b) => b.room - a.room);
for (const r of pick) r.bid = Math.max(25, Math.min(r.maxCpc, 60));   // 初期入札：最低 ¥25、上限は利益から逆算した CPC と ¥60 の小さい方
fs.writeFileSync(path.join(OUT, 'ads-plan.json'), JSON.stringify({ at: new Date().toISOString(), assumptions: { FEE, POINT_EXTRA, PROFIT, CPC, CVR }, pick, rows }, null, 1));
const date = new Date().toISOString().slice(0, 10);
const md = [`# 楽天 RPP 対象（${date}、読み取りのみで作成）`, '',
  `前提（見積り）：楽天費用 ${FEE * 100}%、A 档ポイント 3 倍の追加 ${POINT_EXTRA * 100}%、利益 ${PROFIT * 100}% を確保。仕入値は送料込みの卸価（kjyf B2B）。広告余地 = 売価 ×(1−${FEE}−${POINT_EXTRA}−${PROFIT}) − 仕入。上限 CPC = 余地 × 転換率 ${CVR * 100}%。`, '',
  `A 档 ${A.length} 件 → **投放 ${pick.length} 件**、除外 ${rows.length - pick.length} 件`, '',
  '## 投放', '', '| 管理番号 | 商品 | 卸売れ筋数 | 档 | 売価 | 競合最安 | 仕入 | 広告余地/注文 | 上限 CPC | 初期入札 |', '|---|---|---|---|---|---|---|---|---|---|',
  ...pick.map((r) => `| ${r.mn} | ${r.name} | ${r.qty ?? "-"} | ${r.tier} | ¥${r.price} | ¥${r.compMin} | ¥${r.wholesale} | ¥${r.room} | ¥${r.maxCpc} | ¥${r.bid} |`), '',
  '## 除外', '', '| 管理番号 | 商品 | 卸売れ筋数 | 理由 |', '|---|---|---|---|', ...rows.filter((r) => r.why.length).map((r) => `| ${r.mn} | ${r.name} | ${r.qty ?? '-'} | ${r.why.join(' / ')} |`)];
fs.writeFileSync(path.join(ROOT, 'docs/rakuten', `ads-plan-${date}.md`), md.join('\n') + '\n');
console.log(`\nA ${A.length} → 投放 ${pick.length}, hidden ${rows.filter((r) => r.hidden).length}, 仕入不明 ${rows.filter((r) => r.wholesale == null).length}`);
