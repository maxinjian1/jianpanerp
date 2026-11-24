# 乐天全店（+Qoo10）→ ANET ERP 导入文件，列定义 v1.1（japan-erp/ECOMMERCE_INTEGRATION.md 2026-11-24）
# 用法: python tools/erp-bridge/build.py
# 输出: tools/erp-bridge/out/{products.csv,listings.csv,own_stock.csv,external_stock.csv,review.txt}
import json, io, csv, re, os, collections, sys
O = 'tools/erp-bridge/out/'; os.makedirs(O, exist_ok=True)
IMG = 'https://image.rakuten.co.jp/anet-fashion/cabinet'
CODE = re.compile(r'[A-Za-z0-9._-]{1,40}')
it = json.load(io.open('tools/qoo10/out/rakuten-items.json', encoding='utf-8'))
st = json.load(io.open('tools/qoo10/out/rakuten-stock.json', encoding='utf-8'))
b = json.load(io.open('tools/kjyf-b2b/out/b2b-full.json', encoding='utf-8'))
cnt = collections.Counter(s['out_id'] for g in b['list'] for s in g.get('skus') or [])
cost = {s['out_id']: s['price'] for g in b['list'] for s in g.get('skus') or [] if cnt[s['out_id']] == 1}   # 货号唯一的才自动对
# 批发商：按商品编号（品名末尾的货号）对到款；规格按货号完全一致才对。同款各规格批发价相同的，进价可以整款使用
bycode = collections.defaultdict(list)
for g in b['list']: bycode[g['title_zh'].strip().split()[-1].lower()].append(g)
wsku = {}
for g in b['list']:
    for x in g.get('skus') or []: wsku.setdefault(x['out_id'].lower(), x)
qno = dict(reversed(t.split(':', 1)) for t in io.open('tools/qoo10/item-numbers.txt', encoding='utf-8').read().split())
OWN = re.compile(r'^(banz|saloncare|rw1688|baby-|a0\d-)', re.I)   # 自家仓：BANZ、洗护（用户 11-24 确认）；1688 进货品到日本后入自家仓
DROPW = ['送料無料', '新生活応援！', '2025', '即納', '当日発送', 'あす楽', '楽天1位', 'ランキング1位']
def short(t, brand):
    t = re.sub(r'[【\[（(][^】\]）)]*[】\]）)]', ' ', t)
    for d in DROPW: t = t.replace(d, ' ')
    out = ''
    for tok in re.split(r'[\s　｜|/]+', t.strip()):
        if tok and len(out) + len(tok) + 1 <= 36: out = (out + ' ' + tok).strip()
        elif out: break
    out = out or t.strip()[:36]
    return (brand + ' ' + out).strip() if brand and brand.upper() not in out.upper() else out
def groups(prices):   # 与 tools/qoo10/build.py 相同的价格带拆分
    if [x for x in sorted(set(prices)) if min(prices) >= x * 0.5 and max(prices) <= x * 1.5]: return [list(range(len(prices)))]
    g = []
    for i in sorted(range(len(prices)), key=lambda i: prices[i]):
        if g and prices[i] <= prices[g[-1][0]] * 1.5: g[-1].append(i)
        else: g.append([i])
    return g
P = []; L = []; S = []; X = []; R = []; seen = {}
for i in it:
    mn = i['manageNumber']; sels = (i.get('variantSelectors') or [])
    if not CODE.fullmatch(mn): R.append(f'款号含特殊字符，未登记: {mn}'); continue
    brand = 'BANZ' if mn.lower().startswith('banz') else 'SALON CARE' if re.match(r'(saloncare|a0\d-)', mn, re.I) else ''   # 统一写成商标登记的写法（带空格）
    names = [{'color': 'カラー', 'size': 'サイズ'}.get(s.get('displayName', '').strip().lower(), s.get('displayName', ''))[:40] for s in sels]
    n1 = names[0] if names else ''; n2 = '・'.join(names[1:])[:40] if len(names) > 1 else ''
    sname = short(i['title'], brand); simg = IMG + i['images'][0]['location'] if i.get('images') else ''
    order = [{x['displayValue']: n for n, x in enumerate(s_.get('values') or [])} for s_ in sels]   # 按店铺页面上的规格顺序排（白→黑、M→L→XL），不按字母
    vs = sorted(i['variants'].items(), key=lambda kv: [order[n].get(str(kv[1].get('selectorValues', {}).get(s_['key'], '')), 999) for n, s_ in enumerate(sels)])
    prices = [int(float(v['standardPrice'])) for _, v in vs]
    qcode = {}
    for gi, idxs in enumerate(groups(prices)):
        for k in idxs: qcode[vs[k][0]] = mn if gi == 0 else f'{mn}-g{gi + 1}'
    own = bool(OWN.match(mn))
    for (vid, v), price in zip(vs, prices):
        if not CODE.fullmatch(vid): R.append(f'SKU 编号含特殊字符或超长，未登记: {mn} | {vid}'); continue
        if vid.lower() in seen: R.append(f'SKU 编号只有大小写不同，未登记: {vid} 与 {seen[vid.lower()]}'); continue
        seen[vid.lower()] = vid
        vals = [str(v.get('selectorValues', {}).get(s['key'], '')) for s in sels]
        o1 = vals[0][:80] if vals else ''; o2 = ' / '.join(vals[1:])[:80] if len(vals) > 1 else ''
        wx = wsku.get((v.get('merchantDefinedSkuId') or '').lower()) or wsku.get(vid.lower())   # 规格一级对上
        gs = bycode.get(mn.lower(), [])
        gp = {x['price'] for g in gs for x in g.get('skus') or []}
        c = wx['price'] if wx else (gp.pop() if len(gp) == 1 else None)                              # 款一级：全款同价才用
        if wx and not own: X.append(['dropship', vid, wx['stock_num'], b['fetchedAt'].replace('Z', '+00:00')])
        if not own and gs and not wx: R.append(f'批发商对到款、规格没对上（无可售数）: {mn} | {vid}')
        if not own and not gs and not wx: R.append(f'批发商里没找到，发货方式未确认（暂按代发）: {mn} | {vid}')
        elif own and c is None: R.append(f'自家仓商品缺进价: {mn} | {vid}')
        jan = (v.get('articleNumber') or {}).get('value') or ''
        vimg = (v.get('images') or [{}])[0].get('location', '')
        if len(f'{sname} {o1} {o2}') > 160: R.append(f'SKU 名称会超 160: {vid}')
        P.append([vid, mn, sname, '', o1, o2, n1, n2, brand, jan if re.fullmatch(r'\d{8}|\d{13}', jan) else '', '個', 10, price, c or '',
                  '批发商 kuajingyifan' if c else '', simg, IMG + vimg if vimg else ''])
        status = 'active' if not i.get('hideItem') and not v.get('hidden') else 'stopped'
        ff = 'own' if own else 'dropship'
        L.append(['rakuten-main', vid, mn, vid, '', 1, ff, price, status])
        qc = qcode[vid]
        if qc in qno: L.append(['qoo10-main', vid, qc, vid[:50] if len(vs) > 1 else qc, qno[qc], 1, ff, price, status])
        if own: S.append([vid, int(st.get(f'{mn}|{vid}', 0)), '乐天后台显示库存 2026-11-23，未经盘点'])
jd = [j for j, n in collections.Counter(p[9] for p in P if p[9]).items() if n > 1]
for p in P:
    if p[9] in jd: R.append(f'JAN 重复，已清空: {p[0]} {p[9]}'); p[9] = ''
def w(n, h, rows):
    with io.open(O + n, 'w', encoding='utf-8-sig', newline='') as f: c = csv.writer(f); c.writerow(h.split(',')); c.writerows(rows)
w('products.csv', 'sku_code,style_code,style_name,sku_name,option1,option2,option1_name,option2_name,brand,jan,unit,tax_rate,price_tax_included,cost_tax_included,cost_source,style_image_url,sku_image_url', P)
w('listings.csv', 'channel_code,sku_code,parent_key,listing_key,extra_key,units,fulfillment,price_tax_included,status', L)
w('own_stock.csv', 'sku_code,quantity,note', S)
w('external_stock.csv', 'source,sku_code,quantity,as_of', X)
io.open(O + 'review.txt', 'w', encoding='utf-8').write('\n'.join(R) + '\n')
lk = collections.Counter((l[0], l[2], l[3]) for l in L)
s = (f"products {len(P)} 行 / 款式 {len({p[1] for p in P})}；有进价 {sum(1 for p in P if p[13])}；有 JAN {sum(1 for p in P if p[9])}\n"
     f"listings {len(L)} 行：乐天 {sum(1 for l in L if l[0]=='rakuten-main')}、Qoo10 {sum(1 for l in L if l[0]=='qoo10-main')}；販売中 {sum(1 for l in L if l[8]=='active')}；键重复 {sum(1 for n in lk.values() if n > 1)}\n"
     f"external_stock {len(X)} 行（代发，批发商库存）
"
     f"own_stock {len(S)} 行，合计 {sum(x[1] for x in S)} 件；代发 SKU {sum(1 for l in L if l[0]=='rakuten-main' and l[6]=='dropship')}\n"
     f"待确认 {dict(collections.Counter(r.split(':')[0].split('（')[0] for r in R))}\n"
     f"style_name 例: {[p[2] for p in P if p[1] in ('banz-0001','a01-240208','rw1688-02','yjc-073')][::40][:6]}")
sys.stdout.buffer.write((s + '\n').encode('utf-8'))
