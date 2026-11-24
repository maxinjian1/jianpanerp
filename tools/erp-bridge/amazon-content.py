# Amazon 商品页资料 + 图片清单 → ANET ERP 导入文件 ⑨ listing_content.csv、⑩ listing_images.csv
#   python tools/erp-bridge/amazon-content.py
# 来源：tools/amazon-listing/out/opt/<ASIN>/current.json（2026-10-18 抓的公开商品页）与同目录 images/NN.jpg（本机原图）。
# 只整理已有的存档，不访问 Amazon。没有的值留空。fetched_at 是 UTC（存档里写的是 …Z）。
# 图片包 listing_image_files_NN.zip：每个不同文件一份，文件名 = sha256 + 按内容判断的扩展名，每包 ≤ 28 MB。
import csv, glob, hashlib, io, json, os, re, zipfile
from collections import Counter, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OPT = os.path.join(ROOT, 'tools', 'amazon-listing', 'out', 'opt')
O = os.path.join(ROOT, 'tools', 'erp-bridge', 'out')
CH = 'amazon-main'

# ASIN → 出品者SKU（2026-10-18 出品レポート）
skus = defaultdict(list)
p = os.path.join(ROOT, 'tools', 'amazon-listing', 'in', 'active-listings.txt')
if os.path.exists(p):
    rd = csv.reader(io.open(p, encoding='utf-8-sig'), delimiter='\t', quoting=csv.QUOTE_NONE)
    h = next(rd); si, ai = h.index('出品者SKU'), h.index('商品ID')
    for r in rd:
        if len(r) > max(si, ai) and r[ai] and r[si] not in skus[r[ai]]: skus[r[ai]].append(r[si])

HC = ['channel_code', 'parent_key', 'seller_skus', 'title', 'bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5', 'bullet_6', 'description',
      'price_shown', 'rating_text', 'review_count_text', 'first_available', 'rank_text', 'package_size', 'sizes', 'colors', 'image_count', 'fetched_at', 'source']
HI = ['channel_code', 'parent_key', 'fetched_at', 'position', 'source_url', 'file', 'bytes', 'sha256']
one = lambda s: re.sub(r'\s+', ' ', re.sub('[‎‏]', '', str(s or ''))).strip()
val = lambda s: re.sub(r'^[^:：]{0,40}[:：]\s*', '', one(s))
def visible(t):
    """说明是整块 textContent，A+ 的 <style>/<script> 源码混在里面：去掉 function{…}、@规则、CSS 规则，只留看得见的文字。"""
    t = t or ''
    def balanced(t, pat):
        while True:
            m = re.search(pat, t)
            if not m: return t
            i, depth = m.end(), 1
            while i < len(t) and depth:
                depth += (t[i] == '{') - (t[i] == '}'); i += 1
            t = t[:m.start()] + ' ' + t[i:]
    t = re.sub(r'/\*.*?\*/', ' ', t, flags=re.S)
    t = re.sub(r'<(?:img|a|br|div|span|p|/)[^<>]*>', ' ', t)      # noscript 里的标签原文
    t = balanced(t, r'\{"')                                        # 视频播放器的 JSON 配置
    t = balanced(t, r'function\s*[\w$]*\s*\([^)]*\)\s*\{')
    t = balanced(t, r'@(?:media|supports|font-face|keyframes)[^{}]*\{')
    sel = r"""(?:(?<=\s)|^)(?:[.#*\[]|(?:html|body|table|div|span|img|ul|ol|li|td|th|tr|p|a|h[1-6])(?=[\s.#:\[,>{]))[\w\-.#:,>+~*\[\]="'()\s%]*\{[^{}]*\}"""
    for _ in range(5):
        n = re.sub(sel, ' ', t)
        if n == t: break
        t = n
    return re.sub(r'[ \t\u3000]{2,}', ' ', t).strip()
def kind(raw):
    return ('jpg' if raw[:3] == bytes([255, 216, 255]) else 'png' if raw[:8] == bytes([137, 80, 78, 71, 13, 10, 26, 10]) else 'gif' if raw[:6] in (b'GIF87a', b'GIF89a')
            else 'webp' if raw[:4] == b'RIFF' and raw[8:12] == b'WEBP' else '')
NOT_PRODUCT = re.compile(r'/01MKUOLsA5L\.gif|play-button-overlay')   # 无图占位图、视频缩略图（38×50）
rc, ri, st, blobs = [], [], Counter(), {}
for d in sorted(glob.glob(os.path.join(OPT, '*'))):
    f = os.path.join(d, 'current.json')
    if not os.path.exists(f): continue
    asin = os.path.basename(d); j = json.load(open(f, encoding='utf-8'))
    if not j.get('title'): st['没有页面资料（跳过）'] += 1; continue
    b = [one(x) for x in (j.get('bullets') or [])][:6]; b += [''] * (6 - len(b))
    m = re.sub(r'[^\d]', '', j.get('price') or '')
    det = j.get('detail') or {}
    names = lambda xs: ' / '.join(one(x.get('name') if isinstance(x, dict) else x) for x in (xs or []))
    imgs = j.get('images') or []
    desc = visible(j.get('description')); st['说明里去掉了代码'] += desc != (j.get('description') or '').strip(); st['说明里仍有花括号'] += '{' in desc
    fa = (j.get('fetchedAt') or '')[:19] + '+00:00'
    keep = [(n, u) for n, u in enumerate(imgs, 1) if not NOT_PRODUCT.search(u)]; st['去掉的占位图/视频缩略图'] += len(imgs) - len(keep); st['没有主图的页面'] += not any(n == 1 for n, _ in keep)
    rc.append([CH, asin, ';'.join(skus.get(asin, [])), one(j['title']), *b, desc, m, one(j.get('rating')), one(j.get('reviews')),
               val(det.get('Amazon.co.jp での取り扱い開始日')), val(det.get('Amazon 売れ筋ランキング'))[:300], val(det.get('梱包サイズ')),
               names(j.get('sizes')), names(j.get('colors')), len(keep), fa, '公开商品页（存档）'])
    st['页面'] += 1; st['没有 SKU 对应'] += 0 if skus.get(asin) else 1; st['没有价格'] += 0 if m else 1
    for n, u in keep:
        lf = os.path.join(d, 'images', f'{n:02d}.jpg')
        if os.path.exists(lf):
            raw = open(lf, 'rb').read()
            hx = hashlib.sha256(raw).hexdigest(); blobs.setdefault(hx, (lf, len(raw), kind(raw))); st['不是图片的文件'] += not kind(raw)
            ri.append([CH, asin, fa, n, u, os.path.relpath(lf, ROOT).replace('\\', '/'), len(raw), hx]); st['图片'] += 1; st['图片字节'] += len(raw)
        else:
            ri.append([CH, asin, fa, n, u, '', '', '']); st['图片（本机无文件）'] += 1
for name, H, rows in (('listing_content.csv', HC, rc), ('listing_images.csv', HI, ri)):
    with io.open(os.path.join(O, name), 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f); w.writerow(H); w.writerows(rows)
    print(name, len(rows), 'rows', hashlib.sha256(open(os.path.join(O, name), 'rb').read()).hexdigest()[:16])
print(dict(st), '不同图片文件', len(blobs), sum(v[1] for v in blobs.values()), '字节')
for old in glob.glob(os.path.join(O, 'listing_image_files_*.zip')): os.remove(old)
packs, cur, size = [], [], 0
for hx in sorted(blobs):
    lf, n, ext = blobs[hx]
    if not ext or n > 5 * 1024 * 1024: print('跳过', lf, n, ext); continue
    if cur and size + n > 28 * 1024 * 1024: packs.append(cur); cur, size = [], 0
    cur.append((hx, lf, ext)); size += n
if cur: packs.append(cur)
for i, pk in enumerate(packs, 1):
    zp = os.path.join(O, f'listing_image_files_{i:02d}.zip')
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_STORED) as z:
        for hx, lf, ext in pk:
            zi = zipfile.ZipInfo(f'{hx}.{ext}', (2026, 11, 25, 0, 0, 0)); z.writestr(zi, open(lf, 'rb').read())
    print(os.path.basename(zp), len(pk), '个文件', os.path.getsize(zp), '字节', hashlib.sha256(open(zp, 'rb').read()).hexdigest()[:16])
print('取得日', Counter(r[-2][:10] for r in rc).most_common(5))
