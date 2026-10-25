#!/usr/bin/env node
/**
 * 楽天に出した全商品を「同款竞品」と比価して A/B/C に分ける（広告は A 档だけに投じる）。
 *   node tools/rakuten/price-tier.mjs [--limit N] [--from N] [--min-price 2000]
 * 入力：docs/rakuten/publish-log.csv（result=ok の SPU）＋ docs/rakuten/banma-draft-list.csv（商品名・売価・在庫）
 * 検索：search.rakuten.co.jp（Playwright、ログインなし、1 件 4〜6 秒、途中再開可）。当店（anet-fashion）は除外して競合だけ見る。
 * 出力：tools/rakuten/out/price-tier.jsonl（1 件 1 行、再開用）→ tools/rakuten/out/price-tier.json / docs/rakuten/price-tier.md
 * 分档（用户 2026-10-25 承認）：
 *   A = 当店価格 ≤ 競合最安 ×1.05 かつ 売価 ≥ MIN_PRICE かつ 在庫 ≥ 10 → RPP 投放・ポイント 3 倍
 *   B = 競合最安より 5〜15% 高い、または A の価格条件は満たすが売価 < MIN_PRICE → セール・ポイント 2 倍のみ
 *   C = それ以外（15% 超高い／在庫薄／競合が取れない）→ 何もしない
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out'); fs.mkdirSync(OUT, { recursive: true });
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const MIN_PRICE = Number(args['min-price'] ?? 2000), SHOP = 'anet-fashion';
const JL = path.join(OUT, 'price-tier.jsonl');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function csv(file) { const txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); const rows = []; let row = [], v = '', q = false; for (let i = 0; i < txt.length; i++) { const c = txt[i]; if (q) { if (c === '"') { if (txt[i + 1] === '"') { v += '"'; i++; } else q = false; } else v += c; } else if (c === '"') q = true; else if (c === ',') { row.push(v); v = ''; } else if (c === '\n') { row.push(v.replace(/\r$/, '')); rows.push(row); row = []; v = ''; } else v += c; } if (v || row.length) { row.push(v); rows.push(row); } const h = rows.shift(); return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))); }
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
// 検索語：商品名の先頭から型番・記号・送料無料などを除いた最初の 3〜4 語
const STOP = /【.*?】|『.*?』|［.*?］|\[.*?\]|送料無料|即納|あす楽|新品|セール|SALE|公式|\b[A-Z]{1,6}-?\d{2,}[A-Z0-9-]*\b/g;
const query = (name) => String(name).replace(STOP, ' ').replace(/[、。・,/／|｜]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter((w) => w.length >= 2).slice(0, 4).join(' ');

// 対象：publish-log で ok の SPU（試発＋批量）。価格・在庫・商品名は草稿一覧の SKU 行から集約（最安 SKU の価格、在庫合計）
const okSpu = new Set(csv(path.join(ROOT, 'docs/rakuten/publish-log.csv')).filter((r) => /^ok$/i.test(r.result ?? '')).map((r) => r.spu).filter((s) => s && s !== '*'));
const drafts = csv(path.join(ROOT, 'docs/rakuten/banma-draft-list.csv'));
const bySpu = new Map();
for (const r of drafts) { if (!r.SPU) continue; const o = bySpu.get(r.SPU) ?? { spu: r.SPU, mn: r['管理编号'], name: r['商品名'], price: Infinity, stock: 0, skus: 0 }; o.price = Math.min(o.price, Number(r['价格(售价)']) || Infinity); o.stock += Number(r['库存']) || 0; o.skus++; bySpu.set(r.SPU, o); }
let items = [...bySpu.values()].filter((o) => okSpu.has(o.spu) && Number.isFinite(o.price));
if (!items.length) { items = [...bySpu.values()].filter((o) => Number.isFinite(o.price)); log('publish-log に ok が無いので草稿全件を対象にする'); }
const done = new Set(fs.existsSync(JL) ? fs.readFileSync(JL, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).spu) : []);
let todo = items.filter((o) => !done.has(o.spu)); if (args.from) todo = todo.slice(Number(args.from)); if (args.limit) todo = todo.slice(0, Number(args.limit));
log('対象', items.length, '残り', todo.length);

if (todo.length) {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ locale: 'ja-JP', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', viewport: { width: 1280, height: 900 } })).newPage();
  async function search(q) {
    await page.goto(`https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/?s=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000 + Math.random() * 1500);
    return page.$$eval('div[class*="searchresultitem"], div[data-testid*="searchresultitem"], .searchresultitem', (els) => els.slice(0, 20).map((e) => {
      const text = e.innerText ?? ''; const a = e.querySelector('a[href*="item.rakuten.co.jp/"]'); const href = a?.getAttribute('href') ?? '';
      const shop = (href.match(/item\.rakuten\.co\.jp\/([^/]+)\//) ?? [])[1] ?? '';
      const sponsored = /^\s*(PR|\[PR\]|広告)/m.test(text) || !!e.querySelector('[class*="advertise"], [class*="Advertise"], [aria-label*="広告"]');
      const m = text.match(/([\d,]{3,})\s*円/); const img = e.querySelector('img')?.getAttribute('src') ?? '';
      const title = (e.querySelector('h2, a[title], [class*="title"]')?.textContent ?? text.split('\n').find((l) => l.length > 10) ?? '').trim();
      return { sponsored, shop, price: m ? Number(m[1].replace(/,/g, '')) : null, title: title.slice(0, 60), img };
    }));
  }
  for (const [i, o] of todo.entries()) {
    const q = query(o.name);
    try {
      const all = await search(q);
      const comp = all.filter((x) => !x.sponsored && x.price && x.shop && x.shop !== SHOP).slice(0, 10);
      const ours = all.find((x) => x.shop === SHOP);
      const row = { spu: o.spu, mn: o.mn, name: o.name.slice(0, 80), query: q, our: o.price, stock: o.stock, skus: o.skus, competitors: comp.length, compMin: comp.length ? Math.min(...comp.map((x) => x.price)) : null, compMedian: median(comp.map((x) => x.price)), ourRank: ours ? all.indexOf(ours) + 1 : null, top3: comp.slice(0, 3).map((x) => ({ shop: x.shop, price: x.price, title: x.title })), at: new Date().toISOString() };
      fs.appendFileSync(JL, JSON.stringify(row) + '\n');
      log(`${i + 1}/${todo.length}`, o.spu, `¥${o.price}`, 'comp', comp.length, 'min', row.compMin ?? '-', 'rank', row.ourRank ?? '-');
    } catch (e) { log('ERR', o.spu, e.message.slice(0, 120)); }
    await page.waitForTimeout(2500 + Math.random() * 2500);
  }
  await browser.close();
}

// ───────── 分档 ─────────
const rows = fs.existsSync(JL) ? fs.readFileSync(JL, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
for (const r of rows) {
  const ratio = r.compMin ? r.our / r.compMin : null; r.ratio = ratio;
  if (ratio == null) r.tier = 'C';
  else if (ratio <= 1.05 && r.our >= MIN_PRICE && r.stock >= 10) r.tier = 'A';
  else if (ratio <= 1.15 || (ratio <= 1.05 && r.our < MIN_PRICE)) r.tier = 'B';
  else r.tier = 'C';
  r.why = ratio == null ? '競合が取れない' : `当店/競合最安 ${ratio.toFixed(2)}` + (r.our < MIN_PRICE ? `、売価 < ${MIN_PRICE}` : '') + (r.stock < 10 ? '、在庫薄' : '');
}
const cnt = (t) => rows.filter((r) => r.tier === t).length;
fs.writeFileSync(path.join(OUT, 'price-tier.json'), JSON.stringify(rows, null, 1));
const t = (s, n = 50) => String(s ?? '').replace(/\|/g, '｜').slice(0, n);
const sec = (tier, title) => [`## ${tier} 档：${title}（${cnt(tier)} 件）`, '', '| SPU | 商品名 | 当店 | 競合最安 | 競合中央 | 競合数 | 当店順位 | 在庫 | 理由 |', '|---|---|---|---|---|---|---|---|---|', ...rows.filter((r) => r.tier === tier).sort((a, b) => (a.ratio ?? 9) - (b.ratio ?? 9)).map((r) => `| ${r.spu} | ${t(r.name)} | ¥${r.our} | ${r.compMin ? '¥' + r.compMin : '-'} | ${r.compMedian ? '¥' + Math.round(r.compMedian) : '-'} | ${r.competitors} | ${r.ourRank ?? '-'} | ${r.stock} | ${t(r.why, 40)} |`), ''];
fs.writeFileSync(path.join(ROOT, 'docs/rakuten/price-tier.md'), [`# 楽天 同款比価と A/B/C 分档（${new Date().toISOString().slice(0, 16)}Z）`, '', `対象 ${items.length} 件 / 取得 ${rows.length} 件。A = 当店 ≤ 競合最安×1.05 かつ 売価 ≥ ¥${MIN_PRICE} かつ 在庫 ≥ 10 → RPP＋ポイント 3 倍。B = 5〜15% 高い（または安いが低単価）→ セール・ポイント 2 倍のみ。C = それ以外 → 何もしない。`, '', `| A | B | C |`, `|---|---|---|`, `| ${cnt('A')} | ${cnt('B')} | ${cnt('C')} |`, '', ...sec('A', 'RPP 投放'), ...sec('B', 'セール・ポイントのみ'), ...sec('C', '何もしない')].join('\n'));
log('A', cnt('A'), 'B', cnt('B'), 'C', cnt('C'), '→ docs/rakuten/price-tier.md');
