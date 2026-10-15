#!/usr/bin/env node
/**
 * 上架循环：读 .env 的 ERP_API_URL / ERP_EMAIL / ERP_PASSWORD → 登录 → 循环 POST /dropship/publish-batch?limit=50
 * 直到返回空数组。每轮打印 ok/failed；单条失败由服务端标记 status=error，不会重复拾取。
 * 用法：node tools/dropship/publish-loop.mjs [--limit 50] [--status ACTIVE]
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const LIMIT = Number(opt('limit', 50));
const STATUS = opt('status', 'ACTIVE');

(function loadEnv() {
  const p = join(ROOT, '.env');
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
})();

const API = (process.env.ERP_API_URL || 'http://127.0.0.1:4000/api/v1').replace(/\/$/, '');
const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
const log = (...a) => console.log(ts(), ...a);

async function login() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ERP_EMAIL, password: process.env.ERP_PASSWORD }),
  });
  if (!res.ok) throw new Error(`login HTTP ${res.status} ${await res.text()}`);
  const j = await res.json();
  const token = j.accessToken ?? j.access_token ?? j.data?.accessToken;
  const tenantId = j.user?.tenantId ?? j.tenantId ?? j.data?.user?.tenantId;
  if (!token || !tenantId) throw new Error(`login 响应缺少 accessToken/tenantId: ${JSON.stringify(j).slice(0, 200)}`);
  return { token, tenantId };
}

function postNoTimeout(url, headers) {
  const u = new URL(url);
  const mod = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(u, { method: 'POST', headers: { ...headers, 'Content-Length': 0 }, timeout: 0 }, (r) => {
      let text = '';
      r.setEncoding('utf8');
      r.on('data', (c) => (text += c));
      r.on('end', () => resolve({ status: r.statusCode, ok: r.statusCode >= 200 && r.statusCode < 300, text }));
    });
    req.setTimeout(0);
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  let auth = await login();
  log(`登录成功 tenant=${auth.tenantId} api=${API} limit=${LIMIT} status=${STATUS}`);
  let round = 0, totalOk = 0, totalFail = 0;
  for (;;) {
    round++;
    // Node 内建 fetch 有 5 分钟 headers 超时，50 件一批约 20 分钟 → 用 node:http 无超时请求
    let res;
    try {
      res = await postNoTimeout(`${API}/dropship/publish-batch?limit=${LIMIT}&status=${STATUS}`, {
        Authorization: `Bearer ${auth.token}`, 'x-tenant-id': auth.tenantId,
      });
    } catch (e) {
      log(`第 ${round} 轮请求异常：${String(e).slice(0, 200)}，60s 后重试`);
      await new Promise((r) => setTimeout(r, 60000));
      continue;
    }
    if (res.status === 401) { log('token 过期，重新登录'); auth = await login(); continue; }
    if (!res.ok) {
      log(`第 ${round} 轮 HTTP ${res.status} ${res.text.slice(0, 200)}，60s 后重试`);
      await new Promise((r) => setTimeout(r, 60000));
      continue;
    }
    const out = JSON.parse(res.text);
    if (!Array.isArray(out) || out.length === 0) { log('publish-batch 返回空，全部处理完毕'); break; }
    const ok = out.filter((x) => x.ok).length, failed = out.length - ok;
    totalOk += ok; totalFail += failed;
    log(`第 ${round} 轮：ok=${ok} failed=${failed}  累计 ok=${totalOk} failed=${totalFail}`);
    for (const x of out.filter((x) => !x.ok)) log(`  失败 ${x.id}: ${x.error}`);
  }
  log(`结束：累计 published=${totalOk} error=${totalFail}`);
}

main().catch((e) => { log('致命错误', e); process.exit(1); });
