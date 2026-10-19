/**
 * 重量・寸法を批発商の原図（Shopify の商品画像＝批発商の画像）から読む — 6kpro 視覚モデル
 *   node tools/amazon-listing/read-specs.mjs [--type Home] [--all-open] [--limit N] [--concurrency 6]
 *   --all-open：出品許可の要らないカテゴリ全部（mapping.json の approval=false）
 * 画像に明記された数字だけを採用（推測・換算の推定はしない）。商品ごとに画像を順に読み、重量と W/D/H が揃った時点で終了。
 * 結果 out/spec-values.json：{ handle: { items:[{ label, w, d, h, weight_kg }], src:{ w|d|h|weight: 画像URL }, evidence } }
 *   label はサイズ・型番などの区別（画像にサイズ別の表がある場合）。単一なら ''。
 * 画像に文字が無いと判定済み（out/image-check.json の hasText=false）の画像は読まない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..'); const OUT = path.join(__dirname, 'out');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : []).filter(Boolean));
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_VISION_MODEL || env.CN_LLM_MODEL || 'GLM-5.3-Flash';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const SYS = `你是商品规格读取员。只读取图片上【明确印出】的商品本体数值，不要推测、不要估算、不要根据比例换算。
- 尺寸：宽(W/幅)、深(D/奥行)、高(H/高さ)，统一成 cm（图上是 mm 就除以 10；只有“长さ/全長/長辺”时放进 d）。只有一个直径/长度就只填那一个。
- 重量：商品本体重量（重量/重さ/本体重量/Weight/净重），统一成 kg（g 除以 1000）。不要用耐荷重、承重、最大荷重、容量、包装重量。
- 如果图上是按尺码/型号分别列的表，每一行一个 item，label 写尺码或型号（原文）。只有一组就 label 为空字符串。
- evidence：原样抄写你依据的那段文字（最多 60 字）。
- 图上没有这些数字就返回 {"items":[],"evidence":""}。
只输出 JSON：{"items":[{"label":"","w":数字或null,"d":数字或null,"h":数字或null,"weight_kg":数字或null}],"evidence":"..."}`;

async function read(url) {
  const img = await fetch(url + (url.includes('?') ? '&' : '?') + 'width=1200'); if (!img.ok) throw new Error(`image ${img.status}`);
  const b64 = `data:${img.headers.get('content-type') || 'image/jpeg'};base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`;
  const headers = { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) };
  for (let t = 0; t < 3; t++) {
    const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers, body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 2000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYS }, { role: 'user', content: [{ type: 'image_url', image_url: { url: b64 } }, { type: 'text', text: '读取这张图上明确印出的商品尺寸和重量，只输出 JSON。' }] }] }) });
    if (!r.ok) { log('llm', r.status); continue; }
    const c = (await r.json()).choices?.[0]?.message?.content ?? ''; const m = c.match(/\{[\s\S]*\}/);
    if (m) try { return JSON.parse(m[0]); } catch {}
  }
  throw new Error('no json');
}
const num = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n < 10000 ? Math.round(n * 100) / 100 : null; };

const products = JSON.parse(fs.readFileSync(path.join(OUT, 'products-live.json'), 'utf8'));
const mapping = new Map(JSON.parse(fs.readFileSync(path.join(OUT, 'mapping.json'), 'utf8')).map((m) => [m.handle, m]));
let list = products.filter((p) => { const m = mapping.get(p.handle); if (!m) return false; if (args.type) return m.feed_product_type === args.type; if (args['all-open']) return !m.approval; return true; });
if (args.limit) list = list.slice(0, Number(args.limit));
const icF = path.join(OUT, 'image-check.json'); const ic = fs.existsSync(icF) ? JSON.parse(fs.readFileSync(icF, 'utf8')) : {};
const f = path.join(OUT, 'spec-values.json'); const res = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
const cacheF = path.join(OUT, 'spec-image-read.json'); const cache = fs.existsSync(cacheF) ? JSON.parse(fs.readFileSync(cacheF, 'utf8')) : {};
const queue = list.filter((p) => !(p.handle in res));
const one = async (p) => {
  const urls = (p.media?.nodes ?? []).filter((m) => m.image?.url).map((m) => m.image.url);
  const items = new Map(); const src = {}; const ev = [];
  for (const u of urls) {
    if (ic[u] && ic[u].hasText === false) continue;
    if (!cache[u]) { try { cache[u] = await read(u); } catch (e) { log('err', p.handle.slice(0, 30), e.message); continue; } }
    const j = cache[u];
    for (const it of j.items ?? []) {
      const label = String(it.label ?? '').trim(); const cur = items.get(label) ?? { label, w: null, d: null, h: null, weight_kg: null };
      let used = false; for (const k of ['w', 'd', 'h', 'weight_kg']) if (cur[k] == null && num(it[k]) != null) { cur[k] = num(it[k]); src[k === 'weight_kg' ? 'weight' : k] ??= u; used = true; }
      items.set(label, cur); if (used && j.evidence) ev.push(j.evidence);
    }
    const all = [...items.values()]; if (all.length && all.every((x) => x.weight_kg != null && x.w != null && x.d != null && x.h != null)) break;
  }
  res[p.handle] = { items: [...items.values()], src, evidence: [...new Set(ev)].join(' / ').slice(0, 300) };
  fs.writeFileSync(f, JSON.stringify(res, null, 1)); fs.writeFileSync(cacheF, JSON.stringify(cache));
  const it = res[p.handle].items; log(it.length ? it.map((x) => `${x.label || '-'}:${x.w ?? '?'}x${x.d ?? '?'}x${x.h ?? '?'}cm ${x.weight_kg ?? '?'}kg`).join(' ').slice(0, 90) : 'none', '|', p.handle.slice(0, 36));
};
await Promise.all(Array.from({ length: Number(args.concurrency ?? 6) }, async () => { while (queue.length) await one(queue.shift()); }));
const done = list.map((p) => res[p.handle]).filter(Boolean); const full = (r) => r.items.length && r.items.every((x) => x.weight_kg != null && x.w != null && x.d != null && x.h != null);
log('products', done.length, 'weight', done.filter((r) => r.items.some((x) => x.weight_kg != null)).length, 'dims', done.filter((r) => r.items.some((x) => x.w != null && x.d != null && x.h != null)).length, 'both', done.filter(full).length, '→', path.relative(ROOT, f));
