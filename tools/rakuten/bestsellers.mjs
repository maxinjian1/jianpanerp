#!/usr/bin/env node
/**
 * 批発商カタログの中で「楽天で実際に売れている」商品を見つける（2026-10-29 用户「批发商的产品大多数都在乐天卖，找出好卖的前 50 件，有评价的」）。
 * 同じ批発商の商品は楽天で多店舗が売っている → 競合出品の レビュー件数 を「売れている証拠」として集計する。
 *
 *   node tools/rakuten/bestsellers.mjs scan   [--limit N] [--from N] [--refresh]   # Windows・Playwright。全 SPU（斑馬草稿 990 + Shopify 在售）を楽天検索 → out/bestsellers.jsonl（再開可）
 *   node tools/rakuten/bestsellers.mjs report [--top 50]                            # 集計 → docs/rakuten/bestsellers-top50.md + out/bestsellers-top50.json
 *
 * 同一商品の判定（report 時）：検索語（商品名先頭 4 語）の 75% 以上（4 語なら 3 語）がタイトルに含まれ、価格が当店楽天価格（無ければ Shopify ×1.2）の 0.6〜1.6 倍。scan は緩く全候補を保存するので、閾値は report だけ直せばよい。
 * スコア = 同一商品と判定した競合出品のレビュー件数合計（最大 15 出品）。順位はスコア順、同点は最大レビュー件数順。
 * CAPTCHA/ロボット確認ページが出たら即停止（再実行で続きから）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out'), DOCS = path.join(ROOT, 'docs/rakuten');
fs.mkdirSync(OUT, { recursive: true });
const [cmd = 'report', ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : null).filter(Boolean));
const SHOP = 'anet-fashion', JL = path.join(OUT, 'bestsellers.jsonl');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const J = (f) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
function csv(file) { const txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, ''); const rows = []; let row = [], v = '', q = false; for (let i = 0; i < txt.length; i++) { const c = txt[i]; if (q) { if (c === '"') { if (txt[i + 1] === '"') { v += '"'; i++; } else q = false; } else v += c; } else if (c === '"') q = true; else if (c === ',') { row.push(v); v = ''; } else if (c === '\n') { row.push(v.replace(/\r$/, '')); rows.push(row); row = []; v = ''; } else v += c; } if (v || row.length) { row.push(v); rows.push(row); } const h = rows.shift(); return rows.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))); }
const STOP = /【.*?】|『.*?』|［.*?］|\[.*?\]|送料無料|即納|あす楽|新品|セール|SALE|公式|\b[A-Z]{1,6}-?\d{2,}[A-Z0-9-]*\b/g;
const words = (name) => String(name).replace(STOP, ' ').replace(/[、。・,/／|｜()（）]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter((w) => w.length >= 2);
const K = (s) => String(s || '').toLowerCase().replace(/[\s_]/g, '-');

// 対象：斑馬草稿（日本語名・楽天価格）∪ Shopify 在售（tools/instagram/out/products.json：handle/title/price/sku）。SPU/SKU 前方一致で統合
function targets() {
  const bySpu = new Map();
  const dl = path.join(DOCS, 'banma-draft-list.csv');
  if (fs.existsSync(dl)) for (const r of csv(dl)) { if (!r.SPU) continue; const o = bySpu.get(r.SPU) ?? { spu: r.SPU, name: r['商品名'], rakutenPrice: Infinity, stock: 0, onRakuten: false }; o.rakutenPrice = Math.min(o.rakutenPrice, Number(r['价格(售价)']) || Infinity); o.stock += Number(r['库存']) || 0; bySpu.set(r.SPU, o); }
  const pl = path.join(DOCS, 'publish-log.csv'); if (fs.existsSync(pl)) for (const r of csv(pl)) if (/^ok$/i.test(r.result ?? '') && bySpu.has(r.spu)) bySpu.get(r.spu).onRakuten = true;
  const keys = [...bySpu.keys()].map(K);
  const prods = J(path.join(ROOT, 'tools/instagram/out/products.json')) || [];
  for (const p of prods) { const sku = K(p.sku || p.handle); const hit = [...bySpu.values()].find((o) => K(o.spu) === sku || sku.startsWith(K(o.spu) + '-') || K(o.spu).startsWith(sku + '-')); if (hit) { hit.handle = p.handle; hit.shopifyPrice = Number(p.price) || null; } else bySpu.set(p.handle, { spu: p.sku || p.handle, handle: p.handle, name: p.title, rakutenPrice: Infinity, shopifyPrice: Number(p.price) || null, stock: p.stock ?? null, onRakuten: false }); }
  return [...bySpu.values()].map((o) => ({ ...o, rakutenPrice: Number.isFinite(o.rakutenPrice) ? o.rakutenPrice : null, ref: Number.isFinite(o.rakutenPrice) ? o.rakutenPrice : (o.shopifyPrice ? Math.round(o.shopifyPrice * 1.2) : null) })).filter((o) => o.name);
}

async function scan() {
  const { chromium } = await import('playwright');
  const items = targets();
  if (args.refresh && fs.existsSync(JL)) fs.renameSync(JL, JL.replace(/\.jsonl$/, `-${new Date().toISOString().slice(0, 10)}.jsonl`));
  const done = new Set(fs.existsSync(JL) ? fs.readFileSync(JL, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).spu) : []);
  let todo = items.filter((o) => !done.has(o.spu)); if (args.from) todo = todo.slice(Number(args.from)); if (args.limit) todo = todo.slice(0, Number(args.limit));
  log('対象', items.length, '残り', todo.length);
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ locale: 'ja-JP', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36', viewport: { width: 1280, height: 900 } })).newPage();
  for (const [i, o] of todo.entries()) {
    const ws = words(o.name).slice(0, 4), q = ws.join(' ');
    if (!q) { fs.appendFileSync(JL, JSON.stringify({ spu: o.spu, query: '', listings: [], at: new Date().toISOString() }) + '\n'); continue; }
    try {
      await page.goto(`https://search.rakuten.co.jp/search/mall/${encodeURIComponent(q)}/?s=1`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForTimeout(2000 + Math.random() * 1500);
      if (/ロボット|robot|アクセスが集中|captcha/i.test(await page.title()) || await page.$('iframe[src*="captcha"], #captcha')) { log('CAPTCHA/ロボット確認 → 停止（後で再実行すると続きから）'); break; }
      const all = await page.$$eval('div[class*="searchresultitem"], div[data-testid*="searchresultitem"], .searchresultitem', (els) => els.slice(0, 30).map((e) => {
        const text = e.innerText ?? ''; const a = e.querySelector('a[href*="item.rakuten.co.jp/"]'); const href = a?.getAttribute('href') ?? '';
        const shop = (href.match(/item\.rakuten\.co\.jp\/([^/]+)\//) ?? [])[1] ?? '';
        const sponsored = /^\s*(PR|\[PR\]|広告)/m.test(text) || !!e.querySelector('[class*="advertise"], [class*="Advertise"], [aria-label*="広告"]');
        const pm = text.match(/([\d,]{3,})\s*円/); const rv = text.match(/([0-5]\.\d{1,2})\s*[（(]\s*([\d,]+)\s*件?\s*[)）]/) || text.match(/レビュー\s*[（(]?\s*([\d,]+)\s*件/);
        const rating = rv && rv.length === 3 ? Number(rv[1]) : null, reviews = rv ? Number((rv.length === 3 ? rv[2] : rv[1]).replace(/,/g, '')) : 0;
        const title = (e.querySelector('h2, a[title], [class*="title"]')?.textContent ?? text.split('\n').find((l) => l.length > 10) ?? '').trim();
        return { sponsored, shop, href: href.split('?')[0], price: pm ? Number(pm[1].replace(/,/g, '')) : null, rating, reviews, title: title.slice(0, 80) };
      }));
      const listings = all.filter((x) => x.shop && x.shop !== SHOP && x.price).map((x) => ({ ...x, same: ws.filter((w) => x.title.includes(w)).length >= Math.min(2, ws.length) && (!o.ref || (x.price >= o.ref * 0.5 && x.price <= o.ref * 1.8)) }));
      fs.appendFileSync(JL, JSON.stringify({ spu: o.spu, query: q, listings, at: new Date().toISOString() }) + '\n');
      const same = listings.filter((x) => x.same); log(`${i + 1}/${todo.length}`, o.spu, 'same', same.length, 'reviews', same.reduce((a, x) => a + x.reviews, 0));
    } catch (e) { log('ERR', o.spu, e.message.slice(0, 120)); }
    await page.waitForTimeout(2500 + Math.random() * 2500);
  }
  await browser.close();
}

function report() {
  const items = new Map(targets().map((o) => [o.spu, o]));
  const rows = fs.existsSync(JL) ? fs.readFileSync(JL, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  if (!rows.length) { console.error('先に scan'); process.exit(2); }
  const top = Number(args.top || 50);
  const scored = rows.map((r) => { const o = items.get(r.spu) || { spu: r.spu, name: '' }; const ws = String(r.query || '').split(' ').filter(Boolean), need = Math.max(2, Math.ceil(ws.length * 0.75)), ref = o.ref || null;   // report 時に厳しめに再判定：4 語中 3 語一致・価格 0.6〜1.6 倍（scan 時の same は緩すぎた：1 検索 22〜28 件）
    const same = (r.listings || []).filter((x) => ws.filter((w) => (x.title || '').includes(w)).length >= need && (!ref || (x.price >= ref * 0.6 && x.price <= ref * 1.6))).sort((a, b) => b.reviews - a.reviews).slice(0, 15); const total = same.reduce((a, x) => a + x.reviews, 0); const best = same[0];
    const rated = same.filter((x) => x.rating); const avg = rated.length ? rated.reduce((a, x) => a + x.rating * x.reviews, 0) / rated.reduce((a, x) => a + x.reviews, 0) : null;
    return { spu: r.spu, handle: o.handle, name: (o.name || '').slice(0, 60), onRakuten: !!o.onRakuten, rakutenPrice: o.rakutenPrice, shopifyPrice: o.shopifyPrice, shops: same.length, totalReviews: total, maxReviews: best?.reviews || 0, bestShop: best?.shop, bestPrice: best?.price, bestHref: best?.href, avgRating: avg ? Number(avg.toFixed(2)) : null, minSamePrice: same.length ? Math.min(...same.map((x) => x.price)) : null, query: r.query }; })
    .filter((x) => x.totalReviews > 0).sort((a, b) => b.totalReviews - a.totalReviews || b.maxReviews - a.maxReviews);
  const sel = scored.slice(0, top);
  fs.writeFileSync(path.join(OUT, 'bestsellers-top50.json'), JSON.stringify(sel, null, 1));
  const yen = (v) => v == null ? '-' : `¥${Number(v).toLocaleString()}`;
  const md = [`# 楽天で売れている批発商商品 TOP ${top}（${new Date().toISOString().slice(0, 10)}）`, '',
    `検索 ${rows.length} SPU のうちレビュー付き同一商品が見つかった ${scored.length} 件。スコア = 他店の同一商品出品のレビュー件数合計（最大 15 出品）。**レビューが多い = 実際に売れている**。当店が未出品のものは乐天上架候補、出品済みのものは RPP・ポイント・価格の優先対象。`, '',
    '| # | SPU | 商品名 | 当店楽天 | anetmc | 他店数 | レビュー合計 | 最多店（件数・価格・評価） | 他店最安 | 検索語 |', '|---|---|---|---|---|---|---|---|---|---|',
    ...sel.map((x, i) => `| ${i + 1} | ${x.spu} | ${x.name} | ${x.onRakuten ? yen(x.rakutenPrice) : '未出品'} | ${yen(x.shopifyPrice)} | ${x.shops} | **${x.totalReviews.toLocaleString()}** | [${x.bestShop}](${x.bestHref}) ${x.maxReviews.toLocaleString()}件 ${yen(x.bestPrice)} ★${x.avgRating ?? '-'} | ${yen(x.minSamePrice)} | ${x.query} |`),
    '', `## 内訳`, '', `- 当店楽天 出品済み：${sel.filter((x) => x.onRakuten).length} 件 / 未出品：${sel.filter((x) => !x.onRakuten).length} 件`, `- 次の一手：未出品 → 斑馬草稿から優先発行；出品済みで他店最安より高い → reprice の A 档扱いで値下げ；レビュー 0 の当店出品にはレビュー施策（次回クーポン）。`, ''];
  fs.writeFileSync(path.join(DOCS, 'bestsellers-top50.md'), md.join('\n'));
  log('→ docs/rakuten/bestsellers-top50.md', sel.length, 'of', scored.length);
}
const run = { scan, report, targets: () => { const t = targets(); log('targets', t.length, 'onRakuten', t.filter((o) => o.onRakuten).length, 'withRef', t.filter((o) => o.ref).length); console.log(t.slice(0, 3)); } }[cmd]; if (!run) { console.error('usage: bestsellers.mjs scan|report|targets'); process.exit(2); }
Promise.resolve().then(run).catch((e) => { console.error(e); process.exit(1); });
