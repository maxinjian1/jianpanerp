#!/usr/bin/env node
/**
 * ブラウザ（斑馬にログイン済みの Chrome）から POST されたデータをファイルに保存するだけの受け口。
 *   node tools/rakuten/recv.mjs [--port 47124]
 * 保存先：tools/rakuten/out/<?f=相対パス>（.. は拒否）。127.0.0.1 のみ listen。終了は Ctrl+C。
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = path.join(ROOT, 'tools/rakuten/out');
const port = Number(process.argv[process.argv.indexOf('--port') + 1] || 47124);
http.createServer((req, res) => {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const f = new URL(req.url, 'http://x').searchParams.get('f') || '';
  if (req.method !== 'POST' || !f || f.includes('..') || path.isAbsolute(f)) { res.writeHead(400, cors); return res.end('bad'); }
  const chunks = []; req.on('data', (c) => chunks.push(c)); req.on('end', () => {
    const dst = path.join(OUT, f); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.writeFileSync(dst, Buffer.concat(chunks));
    console.log(new Date().toISOString().slice(11, 19), 'saved', f, Buffer.concat(chunks).length); res.writeHead(200, cors); res.end('ok');
  });
}).listen(port, '127.0.0.1', () => console.log(`recv on http://127.0.0.1:${port}/?f=<path>  → ${OUT}`));
