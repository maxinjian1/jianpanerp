#!/usr/bin/env node
// out/top30.json（ビジネスレポート）+ out/inventory.json（商品の管理：FBA 在庫・手数料）→ docs/amazon-fba/top30-fba-plan.md の「最新データ」節を書き換える
//   node tools/amazon-fba/plan-md.mjs
// 仕入値は手元に無い（SARADEMUNT 衣類は批発商データ外）→「未知」。代わりに 利益率 15% を守れる仕入上限 = 売価×0.85 − 手数料合計 を出す。
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/amazon-fba/out/top30.json'), 'utf8'));
const INV = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/amazon-fba/out/inventory.json'), 'utf8'));
const famFee = {}; for (const x of T.top30) { const f = INV.items[x.asin]?.feeTotal; if (f) (famFee[x.fam] ??= []).push(f); }
const row = (x) => {
  const v = INV.items[x.asin] || {}; const price = v.price || x.price; const fee = v.feeTotal || (famFee[x.fam] ? Math.max(...famFee[x.fam]) : null);
  const need = Math.max(0, x.fbaQty - (v.available || 0));
  return { ...x, price, fee, feeEst: !v.feeTotal, fbaFee: v.fbaFee, status: v.status, avail: v.available ?? 0, need, net: price && fee ? price - fee : null, maxCost: price && fee ? Math.floor(price * 0.85 - fee) : null };
};
const R = T.top30.map(row);
const md = fs.readFileSync(path.join(ROOT, 'docs/amazon-fba/top30-fba-plan.md'), 'utf8').split('\n## 最新データ')[0].trimEnd();
const lines = [md, '', `## 最新データ（${INV.at.slice(0, 10)} Windows 更新）`, '',
  `ソース：ビジネスレポート 子 ASIN 90 日（${T.source}）＋ Seller Central「商品の管理」（FBA 在庫・手数料の合計 = 販売手数料 + FBA 配送代行手数料、FBA 料金シミュレーターと同じ値）。`, '',
  '**前提の訂正**：前 30 件は「出品者出荷」ではなく、**全件すでに FBA 出品（AMAZON_JP）**。多くが **在庫切れ** で売れていない状態。したがって首批は「新規 FBA 化」ではなく **補充納品**。補充数 = 首批数 −「在庫あり」。',
  '', '- 小型軽量プログラム：全件 売価 1,673〜2,680 円 で対象外（対象は 1,000 円以下）→ 通常 FBA。FBA 手数料 288〜430 円（衣類 小型〜標準サイズ相当）。危険物：衣類のため該当なし。',
  '- 仕入値：手元のデータ（tools/amazon-listing・批発商データ・ダウンロードの采购表）に SARADEMUNT 衣類は無い →「未知」。利益率 15% を守れる **仕入上限**（売価×0.85 − 手数料合計）を出したので、実際の仕入値（運賃・関税込み）がこれ以下なら合格。',
  `- 首批（点数ベース）合計 **${R.reduce((s, x) => s + x.fbaQty, 0)} 点**、うち FBA 在庫で足りる分を除いた **補充 ${R.reduce((s, x) => s + x.need, 0)} 点**。`, '',
  '| # | ASIN | 系列 | 売価 | 90日点数 | 90日注文 | 返金 | 状態 | 在庫あり | 首批 | 補充 | 手数料合計 | 仕入前粗利 | 仕入上限(15%) | 仕入 | 判定 |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...R.map((x) => `| ${x.n} | ${x.asin} | ${x.fam} | ¥${x.price ?? '?'} | ${x.units} | ${x.orders} | ${x.refunds} | ${x.status || '-'} | ${x.avail} | ${x.fbaQty} | **${x.need}** | ¥${x.fee ?? '?'}${x.feeEst ? '（同系列）' : ''} | ¥${x.net ?? '?'} | ¥${x.maxCost ?? '?'} | 未知 | 仕入 ≤ ¥${x.maxCost ?? '?'} なら可 |`),
  '', '### 前 30 に入っていない売れ筋（同じ 90 日で点数上位 30 位以内）', '',
  '審計時（10-18）の前 30 は FBA 在庫が十分あった ASIN を含めずに選ばれていた可能性がある。下表はすでに FBA 在庫が十分あり、補充不要。',
  '', '| ASIN | 90日点数 | 売価 | 在庫あり | 手数料合計 | 商品名 |', '|---|---|---|---|---|---|',
  ...T.newcomers.map((x) => { const v = INV.items[x.asin] || {}; return `| ${x.asin} | ${x.units} | ¥${x.price} | ${v.available ?? '?'} | ¥${v.feeTotal ?? '?'} | ${x.title} |`; }), ''];
fs.writeFileSync(path.join(ROOT, 'docs/amazon-fba/top30-fba-plan.md'), lines.join('\n'));
console.log('need', R.reduce((s, x) => s + x.need, 0), 'fba', R.reduce((s, x) => s + x.fbaQty, 0));
for (const x of R) console.log(x.asin, x.status, 'avail', x.avail, 'need', x.need, 'net', x.net, 'max', x.maxCost);
