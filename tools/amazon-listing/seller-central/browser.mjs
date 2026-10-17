/**
 * Seller Central 用の「ユーザー本人がログインしたブラウザ」を立ち上げる（Windows）
 *
 *   node tools/amazon-listing/seller-central/browser.mjs            # 起動：ウィンドウが開くのでユーザー本人がログインする（このスクリプトは何も入力しない）
 *   node tools/amazon-listing/seller-central/browser.mjs status     # 起動済みか・ログイン済みかを確認（CDP 9222 経由）
 *
 * 方針：
 *  - 専用プロファイル %LOCALAPPDATA%\anet-seller-central\ に保存（次回からログイン不要。認証情報はファイルにもログにも書かない）
 *  - CDP を :9222 で開く。以降の操作は Windows の Claude セッションが playwright.chromium.connectOverCDP('http://127.0.0.1:9222') で
 *    同じウィンドウを操作し、各ステップで tools/amazon-listing/out/sc-shots/ にスクリーンショットを残す
 *  - 認証系の画面（ワンタイムコード、CAPTCHA、本人確認）が出たら操作を止めてユーザーに引き継ぐ
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const PROFILE = path.join(process.env.LOCALAPPDATA || os.homedir(), 'anet-seller-central');
const SHOTS = path.resolve(import.meta.dirname, '../out/sc-shots'); fs.mkdirSync(SHOTS, { recursive: true });
const HOME = 'https://sellercentral-japan.amazon.com/home';
const cmd = process.argv[2] ?? 'start';

if (cmd === 'status') {
  try {
    const b = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const ctx = b.contexts()[0]; const pg = ctx?.pages()[0];
    const url = pg?.url() ?? '(no page)';
    const loggedIn = !!pg && !/\/ap\/signin|\/ap\/mfa|\/ap\/cvf/.test(url) && /sellercentral/.test(url);
    console.log(JSON.stringify({ running: true, url, loggedIn }));
    if (pg) await pg.screenshot({ path: path.join(SHOTS, `status-${Date.now()}.png`) });
    await b.close();
  } catch { console.log(JSON.stringify({ running: false })); }
  process.exit(0);
}

const ctx = await chromium.launchPersistentContext(PROFILE, {
  headless: false, channel: 'chrome', viewport: null, locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
  args: ['--remote-debugging-port=9222', '--start-maximized'],
});
const page = ctx.pages()[0] ?? (await ctx.newPage());
await page.goto(HOME, { waitUntil: 'domcontentloaded' });
console.log(`ブラウザを開きました。ログイン画面が出たらユーザー本人がログインしてください。\nプロファイル: ${PROFILE}\nCDP: http://127.0.0.1:9222\nこのウィンドウは閉じないでください。終了は Ctrl+C。`);
await new Promise((r) => ctx.on('close', r));
