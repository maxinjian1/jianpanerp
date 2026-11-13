"""楽天ベビー売れ筋 30 選 + 1688 仕入れ候補 → docs/rakuten/baby-30-1688.xlsx
python tools/sourcing-1688/baby/make-xlsx.py"""
import json, re, urllib.parse
from pathlib import Path
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
D = Path(__file__).parent
picks = json.loads((D / 'picks.json').read_text(encoding='utf8'))
rank = json.loads((D.parent / 'out/baby/rank.json').read_text(encoding='utf8'))
# 楽天の参考品：各商品のキーワードを全部含むものでレビュー最多
MATCH = {1:['防水シーツ'],2:['授乳ブラ'],3:['ベビーゲート','突っ張り'],4:['スリーパー','ガーゼ'],5:['おくるみ','ガーゼ'],6:['スワドル'],7:['プレイマット','折りたたみ'],8:['レッグウォーマー'],9:['ヒップシート'],10:['よだれカバー'],11:['ケープ'],12:['チャイルドロック'],13:['コーナーガード'],14:['ヘルメット'],15:['ベッドガード'],16:['スタイ','360'],17:['授乳ケープ'],18:['マタニティ','レギンス'],19:['マタニティ','ショーツ'],20:['ガーゼ','バスタオル'],21:['バスローブ'],22:['ベビーカーフック'],23:['ドリンクホルダー'],24:['アンダー'],25:['レインカバー'],26:['抱き枕'],27:['マタニティパジャマ'],28:['ヘアバンド'],29:['トレーニングパンツ'],30:['チェアベルト']}
offers = {}
for line in (D / 'raw.txt').read_text(encoding='utf8').splitlines():
    m = re.match(r'(\d+) (\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)', line)
    if m: offers.setdefault(int(m[1]), []).append(dict(id=m[2], price=m[3], sold=m[4], rep=m[5], title=m[6].strip()))
wb = Workbook(); ws = wb.active; ws.title = '30選'
H = ['No','カテゴリ','商品（日本語）','楽天 参考商品（週間ランキング内・レビュー最多）','楽天 レビュー数','楽天 参考価格(円)','1688 候補①','①単価(元)','①成約数','①リピート率','1688 候補②','②単価(元)','②成約数','1688 検索ワード','1688 検索リンク','注意点']
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
    ws.append([p['no'], p['cat'], p['jp'], ref['url'] if ref else '', ref['rev'] if ref else p['rev'], (ref['price'] if ref and ref['price']>=300 else ''),
               f"https://detail.1688.com/offer/{o[0]['id']}.html" if o else '（未取得：検索リンク参照）', cell(0,'price'), cell(0,'sold'), cell(0,'rep'),
               f"https://detail.1688.com/offer/{o[1]['id']}.html" if len(o) > 1 else '', cell(1,'price'), cell(1,'sold'),
               p['kw'], surl, p['note']])
    r = ws.max_row
    for col in (4, 7, 11, 15):
        c = ws.cell(r, col)
        if str(c.value).startswith('http'): c.hyperlink = c.value; c.font = Font(color='0563C1', underline='single')
W = [5,14,30,48,10,10,44,9,9,9,44,9,9,26,40,30]
for i, w in enumerate(W): ws.column_dimensions[chr(65+i)].width = w
ws.freeze_panes = 'D2'
n = wb.create_sheet('説明')
for t in ['データ：楽天市場 週間ランキング（2026-11-02〜11-08 集計）ベビー系 12 サブジャンル×上位160位＝1,920件から選定',
          '除外：おむつ・ミルク・サプリ・化粧品/ソープ・食品・医薬品・カタログギフト・有名ブランド品（エルゴ/サイベックス/日本育児等）・キャラクター品・電気製品（PSE）・チャイルドシート/ベビーカー本体',
          '1688：アカウントでキーワード検索した上位（成約数・リピート率で 2 件）。11 番以降は 1688 の滑块验证で中断 → 検索リンクのみ',
          '成約数・単価は検索結果ページ表示値（バリエーション最安の場合あり）。同款かどうかは画像で要確認',
          '口に触れる商品（スタイ・よだれカバー等）は食品衛生法の乳幼児用品検査、ベビーゲート・ヘルメット・ベッドガードは安全表示の確認が必要']:
    n.append([t])
n.column_dimensions['A'].width = 140
out = D.parents[2] / 'docs/rakuten/baby-30-1688.xlsx'
wb.save(out); print(out)
