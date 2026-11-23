# 给 ANET ERP 会话的各渠道真实样例（各约 20 行，渠道原生字段）+ 全量统计
# 用法: python tools/erp-bridge/samples.py   输出: tools/erp-bridge/samples/*.csv + stats.txt
import json, io, glob, csv, collections
O = 'tools/erp-bridge/samples/'
def w(name, head, rows):
    with io.open(O + name, 'w', encoding='utf-8-sig', newline='') as f:
        c = csv.writer(f); c.writerow(head); c.writerows(rows)
S = []
def stat(s): S.append(s)
def dup(keys): return sum(1 for k, n in collections.Counter(keys).items() if n > 1)

# 乐天
it = json.load(io.open('tools/qoo10/out/rakuten-items.json', encoding='utf-8'))
st = json.load(io.open('tools/qoo10/out/rakuten-stock.json', encoding='utf-8'))
rk = []
for i in it:
    sel = [s['key'] for s in i.get('variantSelectors') or []]
    for vid, v in i['variants'].items():
        rk.append([i['manageNumber'], vid, v.get('merchantDefinedSkuId', ''), i['title'][:60],
                   ' / '.join(str(v.get('selectorValues', {}).get(k, '')) for k in sel),
                   v.get('standardPrice'), st.get(f"{i['manageNumber']}|{vid}", ''), (v.get('articleNumber') or {}).get('value', ''), v.get('hidden')])
pick = [r for r in rk if r[0] in ('banz-0001', 'rw1688-02', 'saloncare-2set', 'HOOP-2SET', 'a01-240208')][:20] or rk[:20]
w('rakuten.csv', ['商品管理番号', 'SKU管理番号', 'システム連携用SKU番号', '商品名(前60字)', '規格', '販売価格(税込)', '在庫', 'JAN', '非表示'], pick)
stat(f"乐天: 商品 {len(it)} / SKU {len(rk)}；(管理番号,SKU管理番号) 重复 {dup([(r[0], r[1]) for r in rk])}；SKU管理番号 全店重复 {dup([r[1] for r in rk])}；"
     f"システム連携用SKU番号 为空 {sum(1 for r in rk if not r[2])}、重复 {dup([r[2] for r in rk if r[2]])}；最长 管理番号 {max(len(r[0]) for r in rk)} / SKU管理番号 {max(len(r[1]) for r in rk)} / 連携用 {max(len(r[2]) for r in rk)}；"
     f"有 JAN 的 {sum(1 for r in rk if r[7])}；商品名最长 {max(len(i['title']) for i in it)}")

# Amazon（出品レポート）
rows = list(csv.reader(io.open('tools/amazon-listing/in/active-listings.txt', encoding='utf-8-sig'), delimiter='\t'))
h = rows[0]; ix = {k: h.index(k) for k in ['商品名', '出品者SKU', '価格', '数量', '商品ID', 'フルフィルメント・チャンネル', 'ステータス']}
am = [[r[ix['出品者SKU']], r[ix['商品ID']], r[ix['商品名']][:60], r[ix['価格']], r[ix['数量']], r[ix['フルフィルメント・チャンネル']], r[ix['ステータス']]] for r in rows[1:] if len(r) > ix['ステータス']]
w('amazon.csv', ['出品者SKU', 'ASIN', '商品名(前60字)', '価格(税込)', '数量', 'フルフィルメント', 'ステータス'], am[:10] + [r for r in am if r[5] == 'DEFAULT'][:5] + [r for r in am if not r[0].isascii()][:5])
byasin = collections.Counter(r[1] for r in am)
stat(f"Amazon(出品レポート，文件较旧): 行 {len(am)}；出品者SKU 重复 {dup([r[0] for r in am])}；一个 ASIN 对多个 SKU 的 ASIN 数 {sum(1 for n in byasin.values() if n > 1)}；"
     f"SKU 最长 {max(len(r[0]) for r in am)} 字符 / {max(len(r[0].encode('utf-8')) for r in am)} 字节；含非 ASCII 的 SKU {sum(1 for r in am if not r[0].isascii())}；"
     f"フルフィルメント {dict(collections.Counter(r[5] for r in am))}")

# Shopify
d = json.load(io.open(sorted(glob.glob('tools/kjyf-b2b/out/shopify-backup-*.json'))[-1], encoding='utf-8'))
sh = []
for p in d['products']:
    vs = p.get('variants') or []
    vs = vs.get('nodes', vs) if isinstance(vs, dict) else vs
    for v in vs:
        sh.append([p['handle'], v.get('id', ''), v.get('sku', ''), p['title'][:60], v.get('title', ''), v.get('price', ''), p['status']])
w('shopify.csv', ['handle', 'variant id', 'SKU', '商品名(前60字)', '規格', '価格(税込)', 'status'], sh[:20])
if sh:
    stat(f"Shopify: 商品 {len(d['products'])} / variant {len(sh)}；variant id 重复 {dup([r[1] for r in sh])}；SKU 为空 {sum(1 for r in sh if not r[2])}、重复 {dup([r[2] for r in sh if r[2]])}；"
         f"handle 最长 {max(len(r[0]) for r in sh)}；SKU 最长 {max(len(r[2] or '') for r in sh)}")
else:
    stat(f"Shopify: 备份里商品 {len(d['products'])}，variant 字段名未识别: {list(d['products'][0].keys())}")

# Qoo10
q = [t.split(':', 1) for t in io.open('tools/qoo10/item-numbers.txt', encoding='utf-8').read().split()]
w('qoo10.csv', ['商品番号', '販売者商品コード(=乐天商品管理番号)'], q[:20])
stat(f"Qoo10: 商品 {len(q)}；販売者商品コード 重复 {dup([c for _, c in q])}。规格在 Qoo10 是商品内的「オプション」，选项的販売者オプションコード = 乐天 SKU管理番号（截到 50 字）")

# 批发商
b = json.load(io.open('tools/kjyf-b2b/out/b2b-full.json', encoding='utf-8'))
ks = [[g['good_id'], s['sku_id'], s['out_id'], s['price'], s['stock_num'], g['title_zh'][:50]] for g in b['list'] for s in g.get('skus') or []]
w('wholesaler.csv', ['good_id', 'sku_id', '货号(out_id)', '批发价(含税)', '批发商库存', '品名(前50字)'], ks[:20])
stat(f"批发商: 商品 {len(b['list'])} / SKU {len(ks)}；货号 为空 {sum(1 for r in ks if not r[2])}、重复 {dup([r[2] for r in ks if r[2]])}；货号最长 {max(len(r[2] or '') for r in ks)}；一品多 SKU 的商品 {sum(1 for g in b['list'] if len(g.get('skus') or []) > 1)}")
shsku = {r[2] for r in sh if r[2]}; kj = {r[2] for r in ks if r[2]}
rksku = {r[2] for r in rk if r[2]} | {r[1] for r in rk}
stat(f"交叉: Shopify SKU 与批发商货号相同 {len(shsku & kj)} / {len(shsku)}；乐天 連携用SKU或SKU管理番号 与批发商货号相同 {len(rksku & kj)}；乐天 連携用SKU 与 Shopify SKU 相同 {len({r[2] for r in rk if r[2]} & shsku)}；Amazon SKU 与批发商货号相同 {len({r[0] for r in am} & kj)}")
io.open(O + 'stats.txt', 'w', encoding='utf-8').write('\n'.join(S) + '\n')
import sys; sys.stdout.buffer.write(('\n'.join(S) + '\n').encode('utf-8'))
