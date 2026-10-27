#!/usr/bin/env node
/**
 * 批発商 新着スキャン（2026-10-27 用户「新品抢先 24 小时」）
 *   node tools/kjyf-scraper/new-items.mjs            # 日文站 sitemap の goodId − 既知（b2b-full.json + out/known-ids.json）= 新着 → out/new-items-<date>.json + docs/kjyf-new-items.md
 * その後 Windows の daily-sync.ps1 が `sync.mjs fetch → plan → apply --only create` で Shopify に当日上架、楽天は候補表を斑馬草稿箱へ（人手）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/kjyf-scraper/out'); fs.mkdirSync(OUT, { recursive: true });
const BASE = 'https://www.kuajingyifan.com', LOCALE = 'ja-JP';
const J = (f) => fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
const xml = await (await fetch(`${BASE}/sitemap/${LOCALE}.xml`, { headers: { 'user-agent': 'Mozilla/5.0' } })).text();
const ids = [...new Set([...xml.matchAll(/\/p\/(\d+)/g)].map((m) => m[1]))];
const b2b = J(path.join(ROOT, 'tools/kjyf-b2b/out/b2b-full.json')); const knownF = path.join(OUT, 'known-ids.json');
const known = new Set([...(b2b?.list || []).map((g) => String(g.good_id)), ...(J(knownF) || [])]);
const fresh = ids.filter((id) => !known.has(id)); const date = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(OUT, `new-items-${date}.json`), JSON.stringify({ at: new Date().toISOString(), sitemap: ids.length, known: known.size, fresh }, null, 1));
fs.writeFileSync(knownF, JSON.stringify([...known, ...fresh]));
const md = path.join(ROOT, 'docs/kjyf-new-items.md'); const prev = fs.existsSync(md) ? fs.readFileSync(md, 'utf8') : '# 批発商 新着ログ（毎日）\n\n| 日付 | sitemap | 新着 | goodId |\n|---|---|---|---|\n';
fs.writeFileSync(md, prev + `| ${date} | ${ids.length} | ${fresh.length} | ${fresh.map((id) => `[${id}](${BASE}/${LOCALE}/p/${id}/-)`).join(' ') || '-'} |\n`);
console.log(`sitemap ${ids.length} / known ${known.size} / 新着 ${fresh.length}`, fresh.slice(0, 20).join(','));
