// 每晚订单导出（给 ANET ERP 的「每晚自动读入」用）。Windows 计划任务 anet-erp-orders-export 每天 23:10（电脑时间＝日本 0:10）运行：
//   node tools/erp-bridge/nightly-orders.mjs
// 约定（japan-erp/ECOMMERCE_INTEGRATION.md「每晚自动读入」）：
//   - 每个平台先写到临时目录，成功并通过检查后才改名进 out/；失败时不动 out/ 里的旧文件。
//   - 成功的晚上即使没有新订单也重写文件（ERP 用文件的修改时间判断「这个平台的订单取到什么时候」）。
//   - 文件里是下单日在最近 N 天内的全部订单（滚动全量）。
//   - 新平台的第一份文件放 out/pending/，ERP 会话在 trial 检查并向用户报告后，把下面 PLATFORMS 里的 dest 改成 'out'。
// 结果写 out/orders-export-status.json（每个平台：成功/失败、时间、订单数、行数），日志追加到 out/orders-export.log。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const O = path.join(ROOT, 'tools/erp-bridge/out');
const TMP = path.join(ROOT, 'tools/erp-bridge/tmp-export');
const PLATFORMS = [
  { channel: 'rakuten-main', script: 'tools/erp-bridge/rakuten-orders.mjs', args: ['--days', '90'], file: 'orders.csv', review: 'orders-review.txt', dest: 'out', minRows: 1 },
  { channel: 'shopify-main', script: 'tools/erp-bridge/shopify-orders.mjs', args: ['--days', '60'], file: 'orders-shopify-main.csv', review: 'orders-shopify-review.txt', dest: 'pending', minRows: 0 },
];
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const HEADER = 'channel_code,order_no,line_id,line_no,order_date,status,shipped_date,parent_key,listing_key,item_name,quantity,line_amount_tax_included,tax_rate,shipping_charged_tax_included,shop_discount_tax_included,platform_discount_tax_included,fulfillment,prefecture,returned_quantity,refund_tax_included,return_date';
const log = (s) => { const line = `${new Date().toLocaleString('sv-SE')} ${s}`; console.log(line); fs.appendFileSync(path.join(O, 'orders-export.log'), line + '\n'); };

const statusPath = path.join(O, 'orders-export-status.json');
const status = fs.existsSync(statusPath) ? JSON.parse(fs.readFileSync(statusPath, 'utf8')) : {};
let failed = 0;
for (const p of PLATFORMS) {
  if (only && !only.includes(p.channel)) continue;
  const dir = path.join(TMP, p.channel);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const started = new Date();
  const r = spawnSync(process.execPath, [p.script, ...p.args, '--out-dir', dir], { cwd: ROOT, encoding: 'utf8', timeout: 20 * 60e3 });
  const src = path.join(dir, p.file);
  let err = '';
  if (r.status !== 0) err = `导出脚本退出码 ${r.status}: ${(r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' | ').slice(0, 400)}`;
  else if (!fs.existsSync(src)) err = '导出脚本没有写出文件';
  let rows = 0, orders = 0, sha = '';
  if (!err) {
    const txt = fs.readFileSync(src, 'utf8').replace(/^﻿/, '');
    const lines = txt.split(/\r?\n/).filter(Boolean);
    if (lines[0] !== HEADER) err = '表头与文件 ⑤ 的列定义不一致';
    else {
      rows = lines.length - 1;
      orders = new Set(lines.slice(1).map((l) => l.split(',')[1])).size;
      if (lines.slice(1).some((l) => !l.startsWith(p.channel + ','))) err = '有不是本渠道的行';
      else if (rows < p.minRows) err = `只有 ${rows} 行（下限 ${p.minRows}），按失败处理`;
      else if (rows > 20000 || Buffer.byteLength(txt) > 5 * 1024 * 1024) err = '超过 ERP 的上限（20,000 行 / 5MB）';
      sha = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex').slice(0, 16);
    }
  }
  const prev = status[p.channel] || {};
  if (err) {
    failed++;
    status[p.channel] = { ...prev, last_attempt_utc: started.toISOString(), last_result: 'failed', last_error: err };
    log(`${p.channel} 失败：${err}（out/ 里的旧文件没有动）`);
    continue;
  }
  const destDir = p.dest === 'out' ? O : path.join(O, 'pending');
  fs.mkdirSync(destDir, { recursive: true });
  fs.renameSync(src, path.join(destDir, p.file));          // 同一磁盘内改名，ERP 不会读到写了一半的文件
  if (p.review && fs.existsSync(path.join(dir, p.review))) fs.renameSync(path.join(dir, p.review), path.join(destDir, p.review));
  status[p.channel] = { file: (p.dest === 'out' ? '' : 'pending/') + p.file, last_attempt_utc: started.toISOString(), last_result: 'ok', exported_at_utc: new Date().toISOString(),
    window_days: Number(p.args[1]), orders, rows, sha256_16: sha, last_error: '' };
  log(`${p.channel} 成功：${orders} 单 ${rows} 行 → ${status[p.channel].file}（sha ${sha}）`);
}
fs.writeFileSync(statusPath + '.tmp', JSON.stringify(status, null, 1)); fs.renameSync(statusPath + '.tmp', statusPath);
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
