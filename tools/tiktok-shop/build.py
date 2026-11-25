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
# 类目全表（后台 preload_all_categories 导出）：id → 模板里用的名字「父类/叶类」。模板的 Category / HiddenStyle 隐藏表由本脚本补行，
# 所以不用在后台逐个勾选类目，任意一个模板文件都能当底版（BASE）。
CATS = {}
for line in io.open(f'{ROOT}/template/tiktok-cats.txt', encoding='utf-8').read().splitlines():
    f = line.split('	')
    if len(f) >= 2: CATS[int(f[0])] = ('/'.join(f[1].split('/')[-2:]), len(f) > 2 and f[2] == '受限')
BASE = 'sports'
ov = json.load(io.open('tools/qoo10/overrides.json', encoding='utf-8')) if os.path.exists('tools/qoo10/overrides.json') else {}
drop = {x.split('/cabinet', 1)[1] for x in ov.get('drop', [])}


_ok_path = f'{ROOT}/out/img-ok.json'
_ok = json.load(io.open(_ok_path, encoding='utf-8')) if os.path.exists(_ok_path) else {}


def u(loc):
    return f'{IMG}{loc}?_ex=1200x1200'


def alive(loc):
    """图片链接是否能打开（乐天里有已删除的规格图，TikTok 遇到 404 会报错或卡住）。结果缓存在 out/img-ok.json。"""
    if loc not in _ok:
        import urllib.request
        try:
            urllib.request.urlopen(urllib.request.Request(u(loc), headers={'User-Agent': 'Mozilla/5.0'}), timeout=30).read(64); _ok[loc] = True
        except Exception:
            _ok[loc] = False
    return _ok[loc]


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
    body = ''.join(f'<p>{p}</p>' for p in paras) or f'<p>{title(it["title"], it["manageNumber"])}</p>'
    return body + ''.join(f'<img src="{x}">' for x in imgs)


rows = {}; report = []
for it in items:
    mn = it['manageNumber']
    if only and mn not in only: continue
    if mn not in conf:
        if only: report.append(f'NOCONF {mn}')
        continue
    c = conf[mn]
    if c.get('done') and not only: continue
    cname, limited = CATS[c['cid']]
    if limited: report.append(f'LIMITED {mn}: {cname} 类目受限'); continue
    vs = [(vid, v) for vid, v in it['variants'].items() if not v.get('hidden')]
    locs = [m['location'] for m in it.get('images') or [] if '/award/' not in m['location'] and m['location'] not in drop and alive(m['location'])]
    locs = [x for x in locs if x not in (c.get('drop') or [])]
    if c.get('main'): locs = [c['main']] + [x for x in locs if x != c['main']]   # main = 指定首图；drop = 不用的图（比例超出 3:4〜4:3 等）
    if not vs or not locs: report.append(f'SKIP {mn}: 无规格或无图'); continue
    imgs = [u(x) for x in locs]
    sels = it.get('variantSelectors') or []
    keys = [s['key'] for s in sels][:2]; names = [SEL_NAME.get(s['displayName'], s['displayName'])[:20] for s in sels][:2]
    if len(sels) > 2: report.append(f'WARN {mn}: 规格轴 {len(sels)} 个，只带前 2 个')
    base = {'category': cname, 'product_name': title(it['title'], mn), 'product_description': description(it, imgs[:20]),
            'parcel_weight': c['g'], 'parcel_length': c['l'], 'parcel_width': c['w'], 'parcel_height': c['h']}
    for i, x in enumerate(imgs[:9]): base[COLS[4 + i]] = x
    if c.get('size_chart'): base['size_chart'] = u(c['size_chart'])
    total = 0
    for vid, v in vs:
        r = dict(base); q = int(stock.get(f'{mn}|{vid}', 0)); total += q
        r.update(price=int(float(v['standardPrice'])), quantity=q, seller_sku=vid[:50])
        if len(vs) > 1 and keys:
            r['property_name_1'] = names[0]; r['property_value_1'] = str(v['selectorValues'].get(keys[0], ''))[:50]
            vi = [m['location'] for m in v.get('images') or [] if alive(m['location'])]
            if vi: r['property_1_image'] = u(vi[0])
            if len(keys) > 1: r['property_name_2'] = names[1]; r['property_value_2'] = str(v['selectorValues'].get(keys[1], ''))[:50]
        jan = (v.get('articleNumber') or {}).get('value') or ''
        if re.fullmatch(r'\d{13}', jan): r['gtin_type'] = 'JAN'; r['gtin_code'] = jan
        r['_cid'] = c['cid']; rows.setdefault(out_name, []).append(r)
    est = '（估算）' if c.get('est') else ''
    report.append(f'OK {mn} | {cname} | ¥{int(float(vs[0][1]["standardPrice"]))} | 库存{total} | 规格{len(vs)} | 图{len(imgs)} | 包裹 {c["g"]}g {c["l"]}x{c["w"]}x{c["h"]}cm{est} | {base["product_name"][:40]}')

os.makedirs(f'{ROOT}/out', exist_ok=True)
io.open(_ok_path, 'w', encoding='utf-8').write(json.dumps(_ok))
for tpl, rs in rows.items():
    dst = f'{ROOT}/out/{out_name}.xlsx'
    shutil.copy(f'{ROOT}/template/{BASE}.xlsx', dst)
    wb = openpyxl.load_workbook(dst); ws = wb['Template']
    wc = wb['Category']; wh = wb['HiddenStyle']
    style = [c.value for c in wh[1]]
    have = {r[0].value for r in wc.iter_rows() if r[0].value}
    n_cat = len(have)
    for r in rs:
        if r['category'] not in have:
            n_cat += 1; have.add(r['category'])
            wc.cell(n_cat, 1).value = r['category']; wc.cell(n_cat, 2).value = r['_cid']
            for i, v in enumerate(style): wh.cell(n_cat, i + 1).value = r['category'] if i == 0 else v
    for dv in ws.data_validations.dataValidation:
        if str(dv.formula1).startswith('Category!'): dv.formula1 = f'Category!$A$1:$A${n_cat}'
    col = {ws.cell(1, i).value: i for i in range(1, ws.max_column + 1)}
    for i in range(1, ws.max_column + 1): ws.cell(7, i).value = None
    for n, r in enumerate(rs):
        for k, v in r.items():
            if not k.startswith('_'): ws.cell(7 + n, col[k]).value = v
    wb.save(dst)
    report.append(f'FILE {dst} rows {len(rs)} 类目 {n_cat}')
io.open(f'{ROOT}/out/{out_name}.report.txt', 'w', encoding='utf-8').write('\n'.join(report) + '\n')
sys.stdout.buffer.write(('\n'.join(report) + '\n').encode('utf-8'))
