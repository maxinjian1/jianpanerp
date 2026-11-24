# Amazon 商品页资料 + 图片清单 → ANET ERP 导入文件 ⑨ listing_content.csv、⑩ listing_images.csv
#   python tools/erp-bridge/amazon-content.py
# 来源：tools/amazon-listing/out/opt/<ASIN>/current.json（2026-10-18 抓的公开商品页）与同目录 images/NN.jpg（本机原图）。
# 只整理已有的存档，不访问 Amazon。没有的值留空。
import csv, glob, hashlib, io, json, os, re
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
HI = ['channel_code', 'parent_key', 'position', 'source_url', 'file', 'bytes', 'sha256']
one = lambda s: re.sub(r'\s+', ' ', re.sub('[‎‏]', '', str(s or ''))).strip()
val = lambda s: re.sub(r'^[^:：]{0,40}[:：]\s*', '', one(s))
rc, ri, st = [], [], Counter()
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
    rc.append([CH, asin, ';'.join(skus.get(asin, [])), one(j['title']), *b, (j.get('description') or '').strip(), m, one(j.get('rating')), one(j.get('reviews')),
               val(det.get('Amazon.co.jp での取り扱い開始日')), val(det.get('Amazon 売れ筋ランキング'))[:300], val(det.get('梱包サイズ')),
               names(j.get('sizes')), names(j.get('colors')), len(imgs), (j.get('fetchedAt') or '')[:19], '公开商品页（存档）'])
    st['页面'] += 1; st['没有 SKU 对应'] += 0 if skus.get(asin) else 1; st['没有价格'] += 0 if m else 1
    for n, u in enumerate(imgs, 1):
        lf = os.path.join(d, 'images', f'{n:02d}.jpg')
        if os.path.exists(lf):
            raw = open(lf, 'rb').read()
            ri.append([CH, asin, n, u, os.path.relpath(lf, ROOT).replace('\\', '/'), len(raw), hashlib.sha256(raw).hexdigest()]); st['图片'] += 1; st['图片字节'] += len(raw)
        else:
            ri.append([CH, asin, n, u, '', '', '']); st['图片（本机无文件）'] += 1
for name, H, rows in (('listing_content.csv', HC, rc), ('listing_images.csv', HI, ri)):
    with io.open(os.path.join(O, name), 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f); w.writerow(H); w.writerows(rows)
    print(name, len(rows), 'rows', hashlib.sha256(open(os.path.join(O, name), 'rb').read()).hexdigest()[:16])
print(dict(st), '不同图片文件', len({r[6] for r in ri if r[6]}))
print('取得日', Counter(r[-2][:10] for r in rc).most_common(5))
