#!/usr/bin/env node
/**
 * ビジネスレポート（子 ASIN・90 日 CSV）→ 前 30 件に 売価・販売点数・売上 を付け、FBA 数量を「点数」で再計算
 *   node tools/amazon-fba/br.mjs <business-report.csv>   → tools/amazon-fba/out/top30.json（+ 前 30 に無い新しい上位 ASIN）
 * FBA 首批 = ceil(90 日点数 ÷ 90 × 45 日 × 1.5)、最少 6（docs/amazon-fba/top30-fba-plan.md と同じ式、注文数→点数に変更）
 */
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const csv = fs.readFileSync(process.argv[2], 'utf8').replace(/^﻿/, '');
const rows = []; { let row = [], cell = '', q = false; for (let i = 0; i < csv.length; i++) { const c = csv[i]; if (q) { if (c === '"' && csv[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; } else cell += c; } if (cell || row.length) { row.push(cell); rows.push(row); } }
const [head, ...body] = rows; const ix = (n) => head.indexOf(n);
const num = (s) => Number(String(s ?? '').replace(/[￥¥,%\s]/g, '')) || 0;
const data = body.filter((r) => r.length > 30).map((r) => ({ asin: r[ix('（子）ASIN')], parent: r[ix('（親）ASIN')], title: r[ix('タイトル')], sessions: num(r[ix('セッション数 - 合計')]), units: num(r[ix('注文された商品点数')]), sales: num(r[ix('注文商品の売上額')]), orders: num(r[ix('注文品目総数')]), refunds: num(r[ix('商品が返金されました')]) }));
const by = new Map(data.map((d) => [d.asin, d]));
const plan = fs.readFileSync(path.join(ROOT, 'docs/amazon-fba/top30-fba-plan.md'), 'utf8');
const top30 = [...plan.matchAll(/^\| (\d+) \| (B0[0-9A-Z]{8}) \| (F\d) \|/gm)].map((m) => ({ n: +m[1], asin: m[2], fam: m[3] }));
const fba = (u) => Math.max(6, Math.ceil(u / 90 * 45 * 1.5));
const out = top30.map((t) => { const d = by.get(t.asin) || {}; return { ...t, units: d.units ?? 0, orders: d.orders ?? 0, sales: d.sales ?? 0, price: d.units ? Math.round(d.sales / d.units) : null, sessions: d.sessions ?? 0, cvr: d.sessions ? +(100 * (d.units || 0) / d.sessions).toFixed(2) : 0, refunds: d.refunds ?? 0, fbaQty: fba(d.units ?? 0), inReport: by.has(t.asin) }; });
const set = new Set(top30.map((t) => t.asin));
const newcomers = [...data].sort((a, b) => b.units - a.units).slice(0, 30).filter((d) => !set.has(d.asin)).map((d) => ({ asin: d.asin, units: d.units, price: d.units ? Math.round(d.sales / d.units) : null, sessions: d.sessions, title: d.title.slice(0, 50) }));
fs.mkdirSync(path.join(ROOT, 'tools/amazon-fba/out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools/amazon-fba/out/top30.json'), JSON.stringify({ source: path.basename(process.argv[2]), top30: out, newcomers }, null, 1));
console.log('units', out.reduce((s, x) => s + x.units, 0), 'fba', out.reduce((s, x) => s + x.fbaQty, 0), 'missing', out.filter((x) => !x.inReport).map((x) => x.asin).join(','), 'newcomers', newcomers.length);
for (const x of out) console.log(x.n, x.asin, x.fam, 'units', x.units, 'orders', x.orders, '¥', x.price, 'fba', x.fbaQty);
console.log('newcomers'); for (const x of newcomers) console.log(x.asin, x.units, x.price, x.title);
