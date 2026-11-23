# 乐天表示中商品 → Qoo10 一括登録フォーム（Qoo10_EditItemList.xlsx）
# 用法: python tools/qoo10/build.py [--only mn1,mn2] [--out 名称]
#   输入: tools/qoo10/out/rakuten-items.json / rakuten-stock.json（export-rakuten.mjs / export-stock.mjs）
#         tools/qoo10/category-map.tsv（管理番号 → Qoo10 小分類コード）
#         tools/qoo10/out/bad-images.json（check-images.mjs 查出的 404 图，可无）
#   输出: tools/qoo10/out/<名称>.xlsx + <名称>.report.txt
import json, re, sys, io, os, shutil
import openpyxl

ROOT = 'tools/qoo10'
SHIP_CODE = '839554'          # QSM 送料コード「無料」
IMG_HOST = 'https://image.rakuten.co.jp/anet-fashion/cabinet'
SKIP = {'zsz': '小型エアコン：PSE 未確認、他社ロゴ（乐天侧也待处理）'}
SEL_NAME = {'Color': 'カラー', 'Size': 'サイズ', 'color': 'カラー', 'size': 'サイズ'}
TITLE_DROP = ['新生活応援！', 'バストアップ', '腰痛改善', '2025 ']

args = sys.argv[1:]
only = None; out_name = 'qoo10-items'; edit = '--edit' in args
for i, a in enumerate(args):
    if a == '--only': only = set(args[i + 1].split(','))
    if a == '--out': out_name = args[i + 1]

items = json.load(io.open(f'{ROOT}/out/rakuten-items.json', encoding='utf-8'))
stock = json.load(io.open(f'{ROOT}/out/rakuten-stock.json', encoding='utf-8'))
cmap = dict(l.split('\t')[:2] for l in io.open(f'{ROOT}/category-map.tsv', encoding='utf-8').read().splitlines() if l and not l.startswith('#'))
bad = set(json.load(io.open(f'{ROOT}/out/bad-images.json', encoding='utf-8'))) if os.path.exists(f'{ROOT}/out/bad-images.json') else set()

def clean_title(t):
    for d in TITLE_DROP: t = t.replace(d, '')
    t = re.sub(r'[　\s]+', ' ', t).strip()
    if len(t) <= 100: return t
    out = ''
    for tok in t.split(' '):
        if len(out) + len(tok) + 1 > 100: break
        out = (out + ' ' + tok).strip()
    return out or t[:100]

def keywords(t):
    seen = []
    for tok in re.split(r'[\s　｜|、,/・]+', re.sub(r'[\[\]【】『』（）()]', ' ', t)):
        if 2 <= len(tok) <= 30 and tok not in seen: seen.append(tok)
    return '$$'.join(seen[:10])

def origin(it):
    for v in it['variants'].values():
        for a in v.get('attributes') or []:
            if re.search('原産|製造国', a['name']):
                s = '/'.join(a['values'])
                if '日本' in s or 'JAPAN' in s.upper(): return ('1', '')
                if '台湾' in s or 'TAIWAN' in s.upper(): return ('2', 'TW')
                if '中国' in s or 'CHINA' in s.upper(): return ('2', 'CN')
    return ('2', 'CN')   # 批发商（中国跨境）货源，乐天未填产地的按中国

def description(it, imgs):
    d = (it.get('productDescription') or {})
    html = d.get('pc') or d.get('sp') or it.get('salesDescription') or ''
    html = re.sub(r'</?a\b[^>]*>', '', html, flags=re.I)
    html = re.sub(r'<(script|iframe|style)\b.*?</\1>', '', html, flags=re.I | re.S)
    html = re.sub(r'[^<>。\n]*(楽天|あす楽)[^<>。\n]*[。]?', '', html)
    pics = ''.join(f'<img src="{u}" style="max-width:100%"><br>' for u in imgs)
    return f'<div style="text-align:center">{pics}</div><div>{html}</div>'

# --edit：既存商品の修正用（item_number を入れる）。白底主图：out/white-ok.json + out/white-urls.json
itemno = {}
if os.path.exists(f'{ROOT}/item-numbers.txt'):
    for tok in io.open(f'{ROOT}/item-numbers.txt', encoding='utf-8').read().split():
        n, c = tok.split(':', 1); itemno[c] = n
white = {}
if os.path.exists(f'{ROOT}/out/white-ok.json') and os.path.exists(f'{ROOT}/out/white-urls.json'):
    ok = json.load(io.open(f'{ROOT}/out/white-ok.json', encoding='utf-8'))
    byname = {os.path.basename(u['src']).split('.')[0]: u['url'] for u in json.load(io.open(f'{ROOT}/out/white-urls.json', encoding='utf-8')) if u.get('url')}
    white = {m: byname[h] for m, h in ok.items() if h in byname}
# overrides.json：main = 指定主图 URL（现成的白底商品图）；drop = 不带到 Qoo10 的图（乐天评价活动图等）
ov = json.load(io.open(f'{ROOT}/overrides.json', encoding='utf-8')) if os.path.exists(f'{ROOT}/overrides.json') else {}
white.update(ov.get('main', {})); bad |= set(ov.get('drop', []))
rows = []; report = []
for it in items:
    mn = it['manageNumber']
    if only and mn not in only: continue
    if mn in SKIP: report.append(f'SKIP {mn}: {SKIP[mn]}'); continue
    if mn not in cmap: report.append(f'NOCAT {mn}'); continue
    vs = [(vid, v) for vid, v in it['variants'].items() if not v.get('hidden')]
    if not vs: report.append(f'NOVAR {mn}'); continue
    all_vs = vs
    all_prices = [int(float(v['standardPrice'])) for _, v in all_vs]
    # Qoo10 规则：选项价必须在销售价的 -50%〜+50% 内，且要有 0 円的选项
    cands = [b for b in sorted(set(all_prices)) if min(all_prices) >= b * 0.5 and max(all_prices) <= b * 1.5]
    if cands:
        groups = [(cands[0], list(range(len(all_vs))))]
    else:   # 一个基准价放不下 → 按价格带拆成多个 Qoo10 商品
        groups = []; order = sorted(range(len(all_vs)), key=lambda i: all_prices[i])
        for i in order:
            if groups and all_prices[i] <= groups[-1][0] * 1.5: groups[-1][1].append(i)
            else: groups.append((all_prices[i], [i]))
        report.append(f'SPLIT {mn}: 价格 {min(all_prices)}〜{max(all_prices)} 超出 ±50%，拆成 {len(groups)} 个商品')
    for gi, (base, idxs) in enumerate(groups):
      vs = [all_vs[i] for i in sorted(idxs)]
      prices = [all_prices[i] for i in sorted(idxs)]
      code = mn if gi == 0 else f'{mn}-g{gi + 1}'
      qtys = [int(stock.get(f'{mn}|{vid}', 0)) for vid, _ in vs]
      total = sum(qtys)
      sels = it.get('variantSelectors') or []
      opt = ''
      if len(vs) > 1 and sels:
        names = [SEL_NAME.get(s['displayName'], s['displayName']) for s in sels]
        keys = [s['key'] for s in sels]
        parts = []
        for (vid, v), p, q in zip(vs, prices, qtys):
            vals = [str(v['selectorValues'].get(k, '')) for k in keys]
            if len(keys) >= 3:   # Qoo10 最多 2 种选项名 → 前两轴合并
                n = [names[0] + '・' + names[1], names[2]]; va = [vals[0] + ' / ' + vals[1], vals[2]]
            else:
                n = names; va = vals
            va = [x[:50] for x in va]
            if len(n) == 1: parts.append(f'{n[0]}||*{va[0]}||*{p - base}||*{q}||*{vid[:50]}')
            else: parts.append(f'{n[0]}||*{va[0]}||*{n[1]}||*{va[1]}||*{p - base}||*{q}||*{vid[:50]}')
        opt = '$$'.join(parts)
      imgs = [IMG_HOST + m['location'] for m in it.get('images') or [] if '/award/' not in m['location']]
      imgs = [u for u in imgs if u not in bad]
      if not imgs: report.append(f'NOIMG {mn}'); break
      if mn in white: imgs = [white[mn]] + imgs   # 白底主图放第 1 张，原主图退到第 2 张
      others = []
      for u in imgs[1:50]:
          if len('$$'.join(others + [u])) > 5000: break
          others.append(u)
      o_type, o_cty = origin(it)
      jan = ''
      if len(vs) == 1:
          jan = ((vs[0][1].get('articleNumber') or {}).get('value') or '')
      title = clean_title(it['title'])
      r = {
          'seller_unique_item_id': code, 'category_number': cmap[mn], 'item_name': title,
          'item_status_Y/N/D': 'Y' if total > 0 else 'N', 'end_date': '2050-12-31',
          'price_yen': base, 'quantity': total, 'option_info': opt,
          'image_main_url': imgs[0], 'image_other_url': '$$'.join(others),
          'item_description': description(it, imgs), 'Shipping_number': SHIP_CODE,
          'available_shipping_date': 3, 'search_keyword': keywords(title),
          'item_condition_type': 1, 'origin_type': o_type, 'origin_country_id': o_cty,
          'external_product_type': 'JAN' if re.fullmatch(r'\d{13}', jan) else '',
          'external_product_id': jan if re.fullmatch(r'\d{13}', jan) else '',
      }
      if edit:
          if code not in itemno: report.append(f'NOITEMNO {code}'); continue
          r['item_number'] = itemno[code]
      rows.append(r)
      report.append(f'OK {code} | {r["item_status_Y/N/D"]} | ¥{base} | 库存{total} | 规格{len(vs)} | 图{len(imgs)} | {cmap[mn]} | {title[:40]}')

dst = f'{ROOT}/out/{out_name}.xlsx'
shutil.copy(f'{ROOT}/template/item-ja.xlsx', dst)
wb = openpyxl.load_workbook(dst); ws = wb.worksheets[0]
col = {ws.cell(1, c).value: c for c in range(1, ws.max_column + 1)}
for c in range(1, ws.max_column + 1): ws.cell(5, c).value = None   # 清掉示例行
for i, r in enumerate(rows):
    for k, v in r.items():
        ws.cell(5 + i, col[k]).value = v
wb.save(dst)
io.open(f'{ROOT}/out/{out_name}.report.txt', 'w', encoding='utf-8').write('\n'.join(report) + '\n')
n_y = sum(1 for r in rows if r['item_status_Y/N/D'] == 'Y')
sys.stdout.buffer.write(f'rows {len(rows)} (Y {n_y} / N {len(rows) - n_y}) -> {dst}\n'.encode('utf-8'))
sys.stdout.buffer.write(('\n'.join(l for l in report if not l.startswith('OK')) + '\n').encode('utf-8'))
