"""楽天ベビー売れ筋 30 選 + 1688 仕入れ候補 → docs/rakuten/baby-30-1688.xlsx
python tools/sourcing-1688/baby/make-xlsx.py"""
import json, re, urllib.parse
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
D = Path(__file__).parent
why = json.loads((D / 'why.json').read_text(encoding='utf8'))
stats = json.loads((D / 'stats.json').read_text(encoding='utf8'))
picks = json.loads((D / 'picks.json').read_text(encoding='utf8'))
rank = json.loads((D.parent / 'out/baby/rank.json').read_text(encoding='utf8'))
# 楽天の参考品：各商品のキーワードを全部含むものでレビュー最多
MATCH = {1:['防水シーツ'],2:['授乳ブラ'],3:['ベビーゲート','突っ張り'],4:['スリーパー','ガーゼ'],5:['おくるみ','ガーゼ'],6:['スワドル'],7:['プレイマット','折りたたみ'],8:['レッグウォーマー'],9:['ヒップシート'],10:['よだれカバー'],11:['ケープ'],12:['チャイルドロック'],13:['コーナーガード'],14:['ヘルメット'],15:['ベッドガード'],16:['スタイ','360'],17:['授乳ケープ'],18:['マタニティ','レギンス'],19:['マタニティ','ショーツ'],20:['ガーゼ','バスタオル'],21:['バスローブ'],22:['ベビーカーフック'],23:['ドリンクホルダー'],24:['アンダー'],25:['レインカバー'],26:['抱き枕'],27:['マタニティパジャマ'],28:['レギンス','ベビー'],29:['トレーニングパンツ'],30:['チェアベルト']}
offers = {}
for line in (D / 'raw.txt').read_text(encoding='utf8').splitlines():
    m = re.match(r'(\d+) (\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)', line)
    if m: offers.setdefault(int(m[1]), []).append(dict(id=m[2], price=m[3], sold=m[4], rep=m[5], title=m[6].strip()))
wb = Workbook(); ws = wb.active; ws.title = '30款'
H = ['No','类目','商品（日文）','为什么好卖','榜单数据（同类上榜链接数／最好名次／评价合计／售价中位）','乐天参考商品（周榜内评价最多）','参考商品评价数','参考售价(円)','1688 候选①','①单价(元)','①成交量','①回头率','1688 候选②','②单价(元)','②成交量','1688 搜索词','1688 搜索链接','注意事项']
ws.append(H)
for c in ws[1]: c.font = Font(bold=True, color='FFFFFF'); c.fill = PatternFill('solid', fgColor='BF0000'); c.alignment = Alignment(wrap_text=True, vertical='center')
for p in picks:
    kws = MATCH[p['no']]
    cand = sorted([r for r in rank if all(k in r['name'] for k in kws)], key=lambda r: -r['rev'])
    ref = cand[0] if cand else None
    o = offers.get(p['no'], [])
    def cell(i, k):
        return o[i][k] if len(o) > i else ''
    surl = 'https://s.1688.com/selloffer/offer_search.htm?charset=utf8&keywords=' + urllib.parse.quote(p['kw'])
    st = stats.get(str(p['no']), {})
    data = f"{st.get('cnt','?')} 个链接上榜／最好第 {st.get('best','?')} 名（{st.get('genre','')}）／评价合计 {st.get('revSum',0):,} 条／售价中位 {st.get('pmed') or '-'} 円"
    ws.append([p['no'], p['cat'], p['jp'], why[str(p['no'])], data, ref['url'] if ref else '', ref['rev'] if ref else p['rev'], (ref['price'] if ref and ref['price']>=300 else ''),
               f"https://detail.1688.com/offer/{o[0]['id']}.html" if o else '（1688 滑块验证中断，见搜索链接）', cell(0,'price'), cell(0,'sold'), cell(0,'rep'),
               f"https://detail.1688.com/offer/{o[1]['id']}.html" if len(o) > 1 else '', cell(1,'price'), cell(1,'sold'),
               p['kw'], surl, p['note']])
    r = ws.max_row
    for col in (6, 9, 13, 17):
        c = ws.cell(r, col)
        if str(c.value).startswith('http'): c.hyperlink = c.value; c.font = Font(color='0563C1', underline='single')
W = [5,14,28,60,40,44,10,10,44,9,9,9,44,9,9,24,36,30]
for i, w in enumerate(W): ws.column_dimensions[chr(65+i)].width = w
for row in ws.iter_rows(min_row=2):
    for c in row: c.alignment = Alignment(wrap_text=True, vertical='top')
ws.freeze_panes = 'E2'
n = wb.create_sheet('说明')
for t in ['数据来源：乐天市场周榜（集计 2026-11-02〜11-08），婴儿相关 12 个子类目 × 前 160 名 = 1,920 件',
          '「榜单数据」= 该商品关键词在上述 1,920 件中出现的链接数、最好名次、这些链接的评价总数、售价中位数（评价数≈累计销量的参考指标）',
          '排除：纸尿裤、奶粉、营养品、化妆品/沐浴露、食品、药品、目录礼品、知名品牌（ergo/cybex/日本育児等）、动漫角色、电器（需 PSE）、儿童安全座椅/婴儿车本体',
          '1688：在用户 Chrome 里关键词搜索，按成交量与回头率选 2 个候选；单价是搜索页显示值（可能是最便宜规格），同款与否请看图确认',
          '1688 搜索中途两次触发滑块验证，未取到链接的行请用「1688 搜索链接」或等验证解除后补',
          '入口商品（围嘴、口水巾）需食品卫生法婴幼儿用品检测；安全门栏、防摔帽、床围需写安全注意事项，不得宣传医疗效果']:
    n.append([t])
n.column_dimensions['A'].width = 140
out = D.parents[2] / 'docs/rakuten/baby-30-1688.xlsx'
wb.save(out); print(out)
