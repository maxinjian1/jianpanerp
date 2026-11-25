# 乐天表示中商品 → TikTok Shop 批量上传模板（每个大类一个 xlsx）
# 用法（在仓库根目录）: python tools/tiktok-shop/build.py [--only mn1,mn2] [--out 名称]
#   输入: tools/qoo10/out/rakuten-items.json / rakuten-stock.json（先跑 tools/qoo10/export-rakuten.mjs、export-stock.mjs）
#         tools/tiktok-shop/items.json（管理番号 → 模板、类目、包裹重量尺寸）
#         tools/tiktok-shop/template/<tpl>.xlsx（后台「批量上传」勾选类目后下载的模板；类目名必须在模板的 Category 表里）
#   输出: tools/tiktok-shop/out/<名称>-<tpl>.xlsx + <名称>.report.txt
# 规则: 一个 SKU 一行，商品字段每行重复；图片用乐天缩略图地址（?_ex=1200x1200，TikTok 上限 1200px）；价格 = 乐天价格；数量 = 乐天库存。
import json, re, sys, io, os, shutil
import openpyxl

ROOT = 'tools/tiktok-shop'
IMG = 'https://thumbnail.image.rakuten.co.jp/@0_mall/anet-fashion/cabinet'
SEL_NAME = {'Color': 'カラー', 'Size': 'サイズ', 'color': 'カラー', 'size': 'サイズ'}
TITLE_DROP = ['新生活応援！', 'バストアップ', '腰痛改善', '2025 ']
COLS = ['category', 'brand', 'product_name', 'product_description', 'main_image', 'image_2', 'image_3', 'image_4', 'image_5', 'image_6', 'image_7', 'image_8', 'image_9',
        'gtin_type', 'gtin_code', 'property_name_1', 'property_value_1', 'property_1_image', 'property_name_2', 'property_value_2',
        'parcel_weight', 'parcel_length', 'parcel_width', 'parcel_height', 'delivery', 'price', 'quantity', 'seller_sku', 'size_chart']

args = sys.argv[1:]; only = None; out_name = 'tiktok'
for i, a in enumerate(args):
    if a == '--only': only = set(args[i + 1].split(','))
    if a == '--out': out_name = args[i + 1]
items = json.load(io.open('tools/qoo10/out/rakuten-items.json', encoding='utf-8'))
stock = json.load(io.open('tools/qoo10/out/rakuten-stock.json', encoding='utf-8'))
conf = {k: v for k, v in json.load(io.open(f'{ROOT}/items.json', encoding='utf-8')).items() if not k.startswith('_')}
ov = json.load(io.open('tools/qoo10/overrides.json', encoding='utf-8')) if os.path.exists('tools/qoo10/overrides.json') else {}
drop = {x.split('/cabinet', 1)[1] for x in ov.get('drop', [])}


def u(loc):
    return f'{IMG}{loc}?_ex=1200x1200'


def title(t, mn):
    for d in TITLE_DROP: t = t.replace(d, '')
    t = re.sub(r'\s*' + re.escape(mn) + r'\s*$', '', t, flags=re.I)   # 末尾的管理番号
    t = re.sub(r'[　\s]+', ' ', t).strip()
    return t[:250]


def description(it, imgs):
    d = it.get('productDescription') or {}
    html = d.get('pc') or d.get('sp') or it.get('salesDescription') or ''
    html = re.sub(r'</?a\b[^>]*>', '', html, flags=re.I)
    html = re.sub(r'<(script|iframe|style|table)\b.*?</\1>', '', html, flags=re.I | re.S)
    html = re.sub(r'<img\b[^>]*>', '', html, flags=re.I)
    html = re.sub(r'[^<>。\n]*(楽天|あす楽|レビュー|クーポン|ポイント)[^<>。\n]*[。]?', '', html)
    text = re.sub(r'<br\s*/?>|</p>|</div>|</li>|</h\d>', '\n', html, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    paras = [p.strip() for p in text.split('\n') if p.strip()]
    body = ''.join(f'<p>{p}</p>' for p in paras) or f'<p>{it["title"]}</p>'
    return body + ''.join(f'<img src="{x}">' for x in imgs)


rows = {}; report = []
for it in items:
    mn = it['manageNumber']
    if only and mn not in only: continue
    if mn not in conf:
        if only: report.append(f'NOCONF {mn}')
        continue
    c = conf[mn]
    vs = [(vid, v) for vid, v in it['variants'].items() if not v.get('hidden')]
    locs = [m['location'] for m in it.get('images') or [] if '/award/' not in m['location'] and m['location'] not in drop]
    if not vs or not locs: report.append(f'SKIP {mn}: 无规格或无图'); continue
    imgs = [u(x) for x in locs]
    sels = it.get('variantSelectors') or []
    keys = [s['key'] for s in sels][:2]; names = [SEL_NAME.get(s['displayName'], s['displayName'])[:20] for s in sels][:2]
    if len(sels) > 2: report.append(f'WARN {mn}: 规格轴 {len(sels)} 个，只带前 2 个')
    base = {'category': c['cat'], 'product_name': title(it['title'], mn), 'product_description': description(it, imgs[:20]),
            'parcel_weight': c['g'], 'parcel_length': c['l'], 'parcel_width': c['w'], 'parcel_height': c['h']}
    for i, x in enumerate(imgs[:9]): base[COLS[4 + i]] = x
    if c.get('size_chart'): base['size_chart'] = u(c['size_chart'])
    total = 0
    for vid, v in vs:
        r = dict(base); q = int(stock.get(f'{mn}|{vid}', 0)); total += q
        r.update(price=int(float(v['standardPrice'])), quantity=q, seller_sku=vid[:50])
        if len(vs) > 1 and keys:
            r['property_name_1'] = names[0]; r['property_value_1'] = str(v['selectorValues'].get(keys[0], ''))[:50]
            vi = [m['location'] for m in v.get('images') or []]
            if vi: r['property_1_image'] = u(vi[0])
            if len(keys) > 1: r['property_name_2'] = names[1]; r['property_value_2'] = str(v['selectorValues'].get(keys[1], ''))[:50]
        jan = (v.get('articleNumber') or {}).get('value') or ''
        if re.fullmatch(r'\d{13}', jan): r['gtin_type'] = 'JAN'; r['gtin_code'] = jan
        rows.setdefault(c['tpl'], []).append(r)
    est = '（估算）' if c.get('est') else ''
    report.append(f'OK {mn} | {c["tpl"]} | {c["cat"]} | ¥{int(float(vs[0][1]["standardPrice"]))} | 库存{total} | 规格{len(vs)} | 图{len(imgs)} | 包裹 {c["g"]}g {c["l"]}x{c["w"]}x{c["h"]}cm{est} | {base["product_name"][:40]}')

os.makedirs(f'{ROOT}/out', exist_ok=True)
for tpl, rs in rows.items():
    dst = f'{ROOT}/out/{out_name}-{tpl}.xlsx'
    shutil.copy(f'{ROOT}/template/{tpl}.xlsx', dst)
    wb = openpyxl.load_workbook(dst); ws = wb['Template']
    cats = {r[0].value for r in wb['Category'].iter_rows() if r[0].value}
    col = {ws.cell(1, i).value: i for i in range(1, ws.max_column + 1)}
    for i in range(1, ws.max_column + 1): ws.cell(7, i).value = None
    for n, r in enumerate(rs):
        if r['category'] not in cats: report.append(f'BADCAT {r["seller_sku"]}: {r["category"]} 不在模板 {tpl} 里')
        for k, v in r.items(): ws.cell(7 + n, col[k]).value = v
    wb.save(dst)
    report.append(f'FILE {dst} rows {len(rs)}')
io.open(f'{ROOT}/out/{out_name}.report.txt', 'w', encoding='utf-8').write('\n'.join(report) + '\n')
sys.stdout.buffer.write(('\n'.join(report) + '\n').encode('utf-8'))
