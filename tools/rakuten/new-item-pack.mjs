#!/usr/bin/env node
/**
 * 批発商新着 1 件 → 楽天用 資料包（2026-10-28 用户指示）。登録はしない（斑馬草稿箱へは人手）。
 *
 *   node tools/rakuten/new-item-pack.mjs <goodId> [--skip-images 2,5] [--genre 211492] [--window 20-10]
 *
 * 入力：tools/kjyf-scraper/out/products.json（先に scrape.mjs --ids <goodId>）。--src <json> で別ファイル、--facts "…" で文案への追加指示
 * 出力：tools/rakuten/out/new/<goodId>/
 *   images/NN.jpg（卸の順。--skip-images の番号は除外して 01〜 に振り直し）、pack.json、title.txt、description.html、attributes.json
 * 文案：6kpro は夜間窓口（北京 20:00〜10:00）内だけ呼ぶ。窓口外・6kpro 停止中は卸の文から草稿を作り status=pending（次の夜に再実行で上書き）。
 * ルール（docs/rakuten/TASK-publish.md）：商品名 ≤127 字・型番なし・機種依存文字なし、価格/送料/No.1/最強/他社名/効能断定を書かない、facts に無い機能を書かない。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inWindow, waitLLM } from '../night/window.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [goodId, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(rest.map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1'] : null).filter(Boolean));
if (!/^\d+$/.test(goodId || '')) { console.error('usage: new-item-pack.mjs <goodId> [--skip-images 2,5] [--genre id]'); process.exit(2); }
const env = Object.fromEntries((fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && l.includes('=')).map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]; }));
const LLM = (env.CN_LLM_BASE_URL || 'http://100.82.2.101:8199/v1').replace(/\/$/, ''), MODEL = env.CN_LLM_MODEL || 'GLM-5.3-Flash', WIN = args.window ?? env.LLM_WINDOW ?? '20-10';
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const g = JSON.parse(fs.readFileSync(path.resolve(ROOT, args.src || 'tools/kjyf-scraper/out/products.json'), 'utf8')).find((p) => String(p.externalId) === goodId);   // --src で別の scrape 結果も可
if (!g) { console.error(`products.json に ${goodId} が無い → node tools/kjyf-scraper/scrape.mjs --ids ${goodId}`); process.exit(2); }
const OUT = path.join(ROOT, 'tools/rakuten/out/new', goodId), IMG = path.join(OUT, 'images'); fs.mkdirSync(IMG, { recursive: true });

// 機種依存文字・絵文字 → 普通の文字（①→(1)、■→・、★ 等は削除）
const KISHU = (s) => String(s).replace(/[①-⑳]/g, (c) => `(${c.charCodeAt(0) - 0x245f})`).replace(/[■□◆◇●○▲△▼▽]/g, '・').replace(/[★☆♪♡❤✨※]/g, '').replace(/\p{Extended_Pictographic}/gu, '').replace(/[️‍]/g, '');
const skus = g.variants.map((v) => v.sku).filter(Boolean);
const STRIP_MODEL = (s) => skus.reduce((t, k) => t.split(k).join(''), String(s)).replace(/\s+/g, ' ').trim();
const plain = (h) => String(h).replace(/<img[^>]*>/g, '').replace(/<br[^>]*>/g, '\n').replace(/<\/p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/\n{2,}/g, '\n').trim();
const cut127 = (s) => { const w = s.split(' '); let t = ''; for (const x of w) { if ((t ? t + ' ' + x : x).length > 127) break; t = t ? t + ' ' + x : x; } return t; };

// 画像：卸の順に番号、除外指定は飛ばして詰める
const skip = new Set(String(args['skip-images'] || '').split(',').filter(Boolean).map(Number));
for (const f of fs.readdirSync(IMG)) fs.unlinkSync(path.join(IMG, f));
const images = []; let n = 0;
for (const [i, u] of g.images.entries()) {
  if (skip.has(i + 1)) { images.push({ src: i + 1, url: u, skipped: true }); continue; }
  const r = await fetch(u); if (!r.ok) { images.push({ src: i + 1, url: u, error: r.status }); continue; }
  const name = `${String(++n).padStart(2, '0')}.jpg`; fs.writeFileSync(path.join(IMG, name), Buffer.from(await r.arrayBuffer())); images.push({ src: i + 1, url: u, file: `images/${name}` });
}
log('images', n, 'skipped', skip.size);

const facts = { title: g.titleZh, category: g.category, options: g.optionNames, variants: g.variants.map((v) => ({ name: v.name, stock: v.stock })), description: KISHU(plain(g.descriptionZh)), extra: args.facts || '' };
let copy = null, status = 'pending', note = '';
if (inWindow(WIN) && await waitLLM(LLM, WIN, log)) {
  const SYS = `あなたは楽天市場の商品ページ担当。与えられた facts だけを使って日本語の商品名と説明文を書く。
ルール：①商品名は 127 文字以内、検索されそうな語を自然に並べる、型番・SKU 記号は入れない ②機種依存文字（丸数字・■・★・絵文字）禁止 ③価格・送料・ポイント・No.1・最強・最安・他社名・「防水」等の性能断定（数値根拠が facts に無いもの）は書かない ④facts に無い機能・数値を足さない ⑤説明文は HTML（<p>・<br>・<b> のみ）、見出し【】で 4〜6 段落＋「仕様」段落（サイズは facts にある数値だけ）＋「ご注意」段落（画像と実物の色味差・手作業測定の誤差）。
出力 JSON：{"title":"…","catchcopy":"…（60 字以内）","description_html":"…"}`;
  for (let k = 0; k < 3 && !copy?.title; k++) {
    try {
      const r = await fetch(`${LLM}/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json', ...(env.CN_LLM_API_KEY ? { authorization: `Bearer ${env.CN_LLM_API_KEY}` } : {}) }, body: JSON.stringify({ model: MODEL, messages: [{ role: 'system', content: SYS }, { role: 'user', content: JSON.stringify(facts) }], temperature: 0.4, max_tokens: 6000, response_format: { type: 'json_object' } }) });
      const t = (await r.json()).choices?.[0]?.message?.content || ''; copy = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1));
    } catch (e) { log('6kpro 応答解析失敗', e.message.slice(0, 80)); copy = null; }
  }
  if (copy?.title) status = 'ready';
}
if (status === 'pending') { note = '6kpro 窓口外/停止のため卸文の草稿。夜間に再実行して上書きすること'; copy = { title: g.titleZh, catchcopy: '', description_html: `<p>${plain(g.descriptionZh).replace(/\n/g, '<br>')}</p>` }; }

const title = cut127(KISHU(STRIP_MODEL(copy.title)));
const description = KISHU(STRIP_MODEL(copy.description_html));
const price = (w) => Math.ceil(w * 1.39 / 10) * 10; // 楽天の現行水準（仕入 ×1.39）。底線 ×1.25 は reprice.mjs 側
const attributes = {
  genreId: args.genre || '', genreNote: args.genre ? '' : '斑馬のジャンル樹から選ぶこと',
  variantAxes: g.optionNames,
  skus: g.variants.map((v) => ({ sku: v.sku, options: v.options, wholesale: v.wholesalePrice, suggestedPrice: price(v.wholesalePrice), floor: Math.ceil(v.wholesalePrice * 1.25 / 10) * 10, stock: v.stock })),
  shopCategory: g.category, leadTime: '2日以内（代発出荷 1 日）', pointRate: '1 倍（A 档になったら 3 倍）',
};
const checks = { titleLen: title.length, titleOk: title.length <= 127, modelNumberInTitle: skus.filter((k) => title.includes(k)), kishuLeft: /[①-⑳■★☆]/.test(title + description) };
const pack = { goodId, sourceUrl: g.sourceUrl, status, note, generatedAt: new Date().toISOString(), title, catchcopy: KISHU(copy.catchcopy || ''), images, attributes, checks };
fs.writeFileSync(path.join(OUT, 'pack.json'), JSON.stringify(pack, null, 1));
fs.writeFileSync(path.join(OUT, 'title.txt'), title + '\n');
fs.writeFileSync(path.join(OUT, 'description.html'), description + '\n');
fs.writeFileSync(path.join(OUT, 'attributes.json'), JSON.stringify(attributes, null, 1));
log('status', status, 'title', title.length, '字', JSON.stringify(checks), '→', path.relative(ROOT, OUT));
