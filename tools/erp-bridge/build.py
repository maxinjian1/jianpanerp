# 乐天全店（+Qoo10）→ ANET ERP 导入文件草案（products.csv / listings.csv），列按 ERP 会话 2026-11-24 的草案
# 用法: python tools/erp-bridge/build.py   输出: tools/erp-bridge/out/{products.csv,listings.csv,review.txt}
import json, io, csv, re, os, collections
O = 'tools/erp-bridge/out/'; os.makedirs(O, exist_ok=True)
IMG = 'https://image.rakuten.co.jp/anet-fashion/cabinet'
it = json.load(io.open('tools/qoo10/out/rakuten-items.json', encoding='utf-8'))
b = json.load(io.open('tools/kjyf-b2b/out/b2b-full.json', encoding='utf-8'))
cnt = collections.Counter(s['out_id'] for g in b['list'] for s in g.get('skus') or [])
cost = {s['out_id']: s['price'] for g in b['list'] for s in g.get('skus') or [] if cnt[s['out_id']] == 1}   # 货号唯一的才自动对
qno = dict(reversed(t.split(':', 1)) for t in io.open('tools/qoo10/item-numbers.txt', encoding='utf-8').read().split())
OWN = re.compile(r'^(banz|saloncare|rw1688|baby-|a0\d-)', re.I)   # 自家仓：BANZ、洗护（用户 11-24 确认）；1688 进货品到日本后也入自家仓
def ex(p): return round(int(float(p)) / 1.1)
P = []; L = []; R = []; seen = set()
for i in it:
    mn = i['manageNumber']; sels = i.get('variantSelectors') or []
    brand = 'BANZ' if mn.lower().startswith('banz') else 'SALON CARE' if mn.lower().startswith('saloncare') else 'SALONCARE' if re.match(r'a0\d-', mn, re.I) else ''
    for vid, v in i['variants'].items():
        if not re.fullmatch(r'[A-Za-z0-9._-]{1,40}', vid): R.append(f'SKU 编号含特殊字符或超长，未登记: {mn} | {vid}'); continue
        if vid.lower() in seen: R.append(f'SKU 编号大小写重复: {vid}'); continue
        seen.add(vid.lower())
        vals = [(s.get('displayName', ''), str(v.get('selectorValues', {}).get(s['key'], ''))) for s in sels]
        color = next((x for n, x in vals if re.search('カラー|色|color|柄|デザイン|種類|タイプ', n, re.I)), '')
        size = next((x for n, x in vals if re.search('サイズ|size|容量|丈', n, re.I)), '')
        rest = [x for n, x in vals if x and x not in (color, size)]
        if rest and not color: color = ' / '.join(rest)
        elif rest: size = ' / '.join([size] + rest) if size else ' / '.join(rest)
        key = v.get('merchantDefinedSkuId') or ''
        c = cost.get(key) or cost.get(vid.upper()) or cost.get(vid)
        own = bool(OWN.match(mn))
        if not own and c is None: R.append(f'发货方式未确认（按代发登记，进价 0）: {mn} | {vid}')
        jan = (v.get('articleNumber') or {}).get('value') or ''
        img = (v.get('images') or i.get('images') or [{}])[0].get('location', '')
        name = (i['title'][:120] + ' ' + ' '.join(x for x in (color, size) if x)).strip()[:160]
        P.append([vid, mn, i['title'][:160], name, color, size, jan if re.fullmatch(r'\d{8}|\d{13}', jan) else '', '個', ex(v['standardPrice']), 10,
                  ex(c) if c else 0, '批发商 kuajingyifan' if c else '', brand, IMG + img if img else ''])
        active = 'active' if not i.get('hideItem') and not v.get('hidden') else 'stopped'
        ff = 'own' if own else 'dropship'
        L.append(['rakuten-main', vid, mn, vid, '', 1, ff, int(float(v['standardPrice'])), active])
        if mn in qno: L.append(['qoo10-main', vid, qno[mn], vid if len(i['variants']) > 1 else mn, '', 1, ff, int(float(v['standardPrice'])), active])
def w(n, h, rows):
    with io.open(O + n, 'w', encoding='utf-8-sig', newline='') as f: c = csv.writer(f); c.writerow(h); c.writerows(rows)
w('products.csv', 'sku_code,style_code,style_name,name,color,size,jan,unit,price_tax_excluded,tax_rate,standard_cost_tax_excluded,cost_source,brand,image_url'.split(','), P)
w('listings.csv', 'channel_code,sku_code,parent_key,listing_key,extra_key,units,fulfillment,channel_price_tax_included,status'.split(','), L)
io.open(O + 'review.txt', 'w', encoding='utf-8').write('\n'.join(R) + '\n')
s = f"products {len(P)} 行（款式 {len({p[1] for p in P})}）；有进价 {sum(1 for p in P if p[10])}；自家仓 {sum(1 for l in L if l[0]=='rakuten-main' and l[6]=='own')} / 代发 {sum(1 for l in L if l[0]=='rakuten-main' and l[6]=='dropship')}；listings {len(L)} 行（乐天 {sum(1 for l in L if l[0]=='rakuten-main')}、Qoo10 {sum(1 for l in L if l[0]=='qoo10-main')}）；待确认 {len(R)} 行；name 最长 {max(len(p[3]) for p in P)}"
import sys; sys.stdout.buffer.write((s + '\n').encode('utf-8'))
