// RMS ナビゲーション API でジャンル配下を表示：node tools/rakuten/genre.mjs <genreId> [depth]
import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split(/\r?\n/).map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^"|"$/g, '')]));
const AUTH = 'ESA ' + Buffer.from(`${env.RAKUTEN_SERVICE_SECRET}:${env.RAKUTEN_LICENSE_KEY}`).toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(id) { for (let t = 0; t < 5; t++) { const r = await fetch(`https://api.rms.rakuten.co.jp/es/2.0/navigation/genres/${id}?showChildren=true`, { headers: { Authorization: AUTH } }); if (r.ok) return r.json(); if (r.status === 429 || r.status === 503) { await sleep(2000); continue; } throw new Error(r.status + ' ' + (await r.text()).slice(0, 200)); } }
async function walk(id, d, max, ind) { const g = (await get(id)).genre; await sleep(400); console.log(ind + g.genreId + ' ' + g.nameJa + (g.lowest ? " *" : "")); if (d < max) for (const c of g.children || []) await walk(c.genreId, d + 1, max, ind + '  '); }
await walk(process.argv[2], 0, Number(process.argv[3] ?? 1), '');
