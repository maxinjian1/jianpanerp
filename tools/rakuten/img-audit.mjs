#!/usr/bin/env node
/**
 * 楽天 店頭（表示中）商品の画像点検の材料を集める（2026-11-20）。
 *   node tools/rakuten/img-audit.mjs fetch   → out/img-audit/items.json（表示中の全商品：管理番号・商品名・ジャンル・画像 URL・価格）
 *   node tools/rakuten/img-audit.mjs thumbs  → out/img-audit/img/<mn>/NN.jpg（全画像を取得）＋ sheets/<mn>.jpg（1 商品 1 枚の一覧）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out/img-audit');
fs.mkdirSync(OUT, { recursive: true });
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const AUTH = 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(url) {
  for (let t = 1; ; t++) {
    const r = await fetch('https://api.rms.rakuten.co.jp/es' + url, { headers: { Authorization: AUTH } });
    if ((r.status === 429 || r.status === 503) && t < 8) { await sleep(3000 * t); continue; }
    const txt = await r.text(); if (!r.ok) throw new Error(url + ' ' + r.status + ' ' + txt.slice(0, 300)); return JSON.parse(txt);
  }
}
const cmd = process.argv[2];
if (cmd === 'fetch') {
  const items = [];
  for (let off = 0; ; off += 100) {
    const j = await api(`/2.0/items/search?isHiddenItem=false&hits=100&offset=${off}`);
    const res = j.results || [];
    for (const x of res) {
      const it = x.item || x;
      const v = Object.values(it.variants || {});
      items.push({ mn: it.manageNumber, title: it.title, genre: it.genreId, hide: it.hideItem, images: (it.images || []).map((i) => i.location), price: Math.min(...v.map((y) => +y.standardPrice || 1e9)), variants: v.length, updated: it.updated });
    }
    console.log('offset', off, res.length, 'total', j.numFound);
    if (res.length < 100 || off + 100 >= (j.numFound || 0)) break;
    await sleep(1100);
  }
  fs.writeFileSync(path.join(OUT, 'items.json'), JSON.stringify(items, null, 1));
  console.log('items', items.length, 'images', items.reduce((a, b) => a + b.images.length, 0));
}
if (cmd === 'thumbs') {
  const items = JSON.parse(fs.readFileSync(path.join(OUT, 'items.json'), 'utf8'));
  let n = 0;
  for (const it of items) {
    const d = path.join(OUT, 'img', it.mn.replace(/[\/:*?"<>|]/g, '_')); fs.mkdirSync(d, { recursive: true });
    for (const [i, loc] of it.images.entries()) {
      const f = path.join(d, String(i + 1).padStart(2, '0') + '.jpg'); if (fs.existsSync(f)) continue;
      const u = 'https://image.rakuten.co.jp/anet-fashion/cabinet' + loc;
      for (let t = 0; t < 3; t++) { try { const r = await fetch(u); if (r.ok) { fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); n++; break; } } catch {} await sleep(800); }
    }
  }
  console.log('downloaded', n);
}
