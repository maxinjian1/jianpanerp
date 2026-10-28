#!/usr/bin/env node
/**
 * Seller Central（CDP 9222、ユーザー本人ログイン済みブラウザ）で手順スクリプトを 1 本実行する小道具
 *   node tools/amazon-fba/cdp-run.mjs <steps.mjs> [args…]
 * steps.mjs は `export default async ({ page, ctx, args, shot }) => {…}`。shot(name) は tools/amazon-listing/out/sc-shots/ に保存。
 * --keep でタブを残し、次の実行で --reuse すると同じタブを続けて操作する。
 * お金が動く画面（配送料の支払い・広告予算・Vine 費用）は確認ページで止めること（手順側で押さない）。
 */
import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const [stepsFile, ...args] = process.argv.slice(2);
const SHOTS = path.resolve(import.meta.dirname, '../amazon-listing/out/sc-shots'); fs.mkdirSync(SHOTS, { recursive: true });
const b = await chromium.connectOverCDP('http://127.0.0.1:9222'); const ctx = b.contexts()[0];
const keep = args.includes('--keep') || args.includes('--reuse');
// --reuse：--keep で残したタブ（最後に開いたもの）を続けて使う（複数ステップのフォーム入力用）
const ri = args.indexOf('--reuse'), rk = ri >= 0 && args[ri + 1] && !args[ri + 1].startsWith('--') ? args[ri + 1] : null;   // --reuse <URL の一部> で対象タブを指定
const page = ri >= 0 ? (rk ? ctx.pages().filter((p) => p.url().includes(rk)).at(-1) : ctx.pages().at(-1)) : await ctx.newPage();
if (!page) throw new Error('--reuse 対象のタブが無い: ' + rk);
const shot = async (name) => { const f = path.join(SHOTS, `${name}.png`); await page.screenshot({ path: f }); console.log('shot', f); return f; };
try { await (await import(pathToFileURL(path.resolve(stepsFile)).href)).default({ page, ctx, args, shot }); }
catch (e) { console.error('ERR', e.message); await shot('error-' + Date.now()).catch(() => {}); process.exitCode = 1; }
finally { if (!keep) await page.close().catch(() => {}); await b.close(); }
