#!/usr/bin/env node
/** 計画外の 1 投稿（カルーセル）を IG と FB ページに出す。node tools/instagram/adhoc-post.mjs <dir>  （dir に urls.json と caption.txt）2026-11-21 */
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const env = Object.fromEntries(fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const dir = path.resolve(process.argv[2]); const G = 'https://graph.facebook.com/v21.0'; const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const urls = JSON.parse(fs.readFileSync(path.join(dir, 'urls.json'), 'utf8')).map((x) => x.url); const caption = fs.readFileSync(path.join(dir, 'caption.txt'), 'utf8').trim();
const call = async (p, body, token, method = 'POST') => { const u = new URL(`${G}/${p}`); let init = { method }; if (method === 'GET') { for (const [k, v] of Object.entries({ ...body, access_token: token })) u.searchParams.set(k, v); } else init = { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, access_token: token }) }; const j = await (await fetch(u, init)).json(); if (j.error) throw new Error(`${p}: ${JSON.stringify(j.error).slice(0, 300)}`); return j; };
const out = {}; const F = path.join(dir, 'result.json'); if (fs.existsSync(F)) Object.assign(out, JSON.parse(fs.readFileSync(F, 'utf8')));
if (!out.ig) {
  const kids = []; for (const u of urls) { for (let k = 0; ; k++) { try { kids.push((await call(`${env.IG_USER_ID}/media`, { image_url: u, is_carousel_item: true }, env.IG_ACCESS_TOKEN)).id); break; } catch (e) { if (k >= 2) throw e; await sleep(8000); } } }
  const c = (await call(`${env.IG_USER_ID}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption }, env.IG_ACCESS_TOKEN)).id;
  for (let i = 0; i < 30; i++) { const s = await call(c, { fields: 'status_code' }, env.IG_ACCESS_TOKEN, 'GET'); if (s.status_code === 'FINISHED') break; if (s.status_code === 'ERROR') throw new Error('container error'); await sleep(4000); }
  const pub = await call(`${env.IG_USER_ID}/media_publish`, { creation_id: c }, env.IG_ACCESS_TOKEN);
  out.ig = { id: pub.id, permalink: (await call(pub.id, { fields: 'permalink' }, env.IG_ACCESS_TOKEN, 'GET')).permalink }; fs.writeFileSync(F, JSON.stringify(out, null, 1)); console.log('IG', out.ig.permalink);
}
if (!out.fb && env.FB_PAGE_ID) {
  const ids = []; for (const u of urls) ids.push((await call(`${env.FB_PAGE_ID}/photos`, { url: u, published: false }, env.FB_PAGE_TOKEN)).id);
  const post = await call(`${env.FB_PAGE_ID}/feed`, { message: caption, attached_media: ids.map((id) => ({ media_fbid: id })) }, env.FB_PAGE_TOKEN);
  out.fb = { id: post.id, url: `https://www.facebook.com/${post.id}` }; fs.writeFileSync(F, JSON.stringify(out, null, 1)); console.log('FB', out.fb.url);
}
