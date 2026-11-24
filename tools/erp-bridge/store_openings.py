# 开店记录 → ANET ERP 导入文件 ⑧ store_openings.csv（一行 = 一个平台的开店/入驻申请）
#   python tools/erp-bridge/store_openings.py
# 依据：用户的《日本电商平台入驻进度-2026-11-23.pdf》+ 11-23〜11-24 本会话实际操作与页面所见。
# 不写密码、验证码、信用卡、银行账号、个人电话。状态只写看到的；没核实的标 unverified / user_reported。
import csv, hashlib, io, os

O = os.path.join(os.path.dirname(__file__), 'out', 'store_openings.csv')
H = ['platform_code', 'platform_name', 'shop_name', 'shop_url', 'admin_url', 'store_account', 'status', 'status_date', 'verified',
     'basis', 'next_action', 'next_owner', 'documents_needed', 'linked_channel', 'note']
# status: open 营业中 / review 审核中 / submitted 已提交等联系 / returned 被退回需补件 / drafting 填写中未提交 /
#         rejected 被驳回 / not_accepting 平台暂不受理 / not_started 未开始
# verified: confirmed 本会话在页面上看到 / user_reported 用户口头告知 / unverified 取自进度表、未核实
# next_owner: user / ai / platform / none
R = [
    ['rakuten', '楽天市場', 'アネットショップ2025', 'https://www.rakuten.co.jp/anet-fashion/', 'https://glogin.rms.rakuten.co.jp/', 'anet-fashion',
     'open', '2026-11-24', 'confirmed', '11-24 用 RMS 接口取到订单（9 月以来 257 单）', '', 'none', '', 'rakuten-main', '开店日未记录'],
    ['amazon', 'Amazon.co.jp', 'アネット', 'https://www.amazon.co.jp/s?k=SALONCARE&rh=p_6%3AA3MRDVND261O1V', 'https://sellercentral.amazon.co.jp/', '',
     'open', '2026-11-24', 'confirmed', '11-24 在 Seller Central 上传商品成功', '', 'none', '', '',
     '品牌 SALONCARE；品牌旗舰店 11-20 提交审核，结果未复查。ERP 里还没有 Amazon 渠道'],
    ['shopify', 'Shopify（anetmc.com）', 'アネット', 'https://anetmc.com/', 'https://admin.shopify.com/store/0scqav-e7', '0scqav-e7',
     'open', '2026-11-21', 'confirmed', '11-21 发帖时店铺页面可访问', '', 'none', '', '', 'ERP 里还没有 Shopify 渠道'],
    ['qoo10', 'Qoo10', 'アネット', 'https://www.qoo10.jp/shop/anet', 'https://qsm.qoo10.jp/', '',
     'open', '2026-11-23', 'user_reported', '用户告知「可以了」；11-23 店铺页可访问、已登记商品 101 行',
     '在 QSM 后台确认出店审查结果和商品能否购买', 'user', '', 'qoo10-main', '11-23 登记商品时页面提示审查期间不能销售；审查是否已通过未核实'],
    ['tiktok', 'TikTok Shop 日本', '', '', '', '',
     'review', '2026-11-24', 'confirmed', '11-24 晚用户补交登记证明后，后台显示「审核中，1〜3 个工作日」',
     '审核通过后：填发货/退货地址、登记至少 1 件商品、填银行信息', 'user', '', '', '11-23 曾被退回（登记文件无法验证）；银行信息由用户本人填'],
    ['yahoo-shopping', 'Yahoo!ショッピング', 'アネット', '', 'https://shopping-apply.yahoo.co.jp/', 'anetmc',
     'drafting', '2026-11-24', 'confirmed', '11-24 申请表前 3 页已填，停在第 4 页信用卡，未提交',
     '填信用卡、收款账户，做电话认证和邮件认证，最后确认提交', 'user', '', '', '只申请购物店；プロモーションパッケージ不加入；申请了 LINE 公式アカウント。页面刷新会清空已填内容'],
    ['yahoo-auction', 'Yahoo!オークション ストア', '', '', '', '',
     'not_started', '2026-11-24', 'confirmed', '11-24 申请表拒绝了个人 Yahoo ID，要求店铺专用 ID',
     '另注册店铺专用 Yahoo! JAPAN ID 后再申请', 'user', '', '', '11-24 用户决定先只申请购物店'],
    ['superdelivery', 'SUPER DELIVERY', '', '', '', '',
     'submitted', '2026-11-23', 'unverified', '进度表：申请已提交，平台称 3 个营业日内邮件或电话联系',
     '等平台联系', 'platform', '', '', '申请成功不代表审核通过'],
    ['aupay', 'au PAY マーケット', '', '', '', '',
     'drafting', '2026-11-23', 'unverified', '进度表：预申请成功，正式申请未提交',
     '办印鑑証明書后提交正式申请', 'user', '印鑑証明書（2 个月内签发）；登记证明（已有，2026-11-18 签发）；仓库、商品、经营数据', '', ''],
    ['mercari-shops', 'メルカリShops', '', '', '', '',
     'rejected', '2026-11-23', 'unverified', '进度表：历史申请曾被驳回，原因待查',
     '登录原商家账号查看驳回理由', 'user', '', '', '尚未重新申请'],
    ['temu', 'Temu 日本本土卖家', '', '', '', '',
     'drafting', '2026-11-23', 'unverified', '进度表：停在日本卖家注册页',
     '设置密码并继续填写资料', 'user', '', '', ''],
    ['zozotown', 'ZOZOTOWN', '', '', '', '',
     'drafting', '2026-11-23', 'unverified', '进度表：公司联系人资料已填，草稿未提交',
     '补经营数据、品牌、社交账号信息', 'user', '', '', ''],
    ['makuake', 'Makuake', '', '', '', '',
     'drafting', '2026-11-23', 'unverified', '进度表：公司资料已填，草稿未提交',
     '定具体新品/项目内容、目标、发货计划', 'user', '', '', ''],
    ['netsea', 'NETSEA', '', '', '', '',
     'not_accepting', '2026-11-23', 'unverified', '进度表：申请页显示当前不接受供应商出展', '', 'none', '', '', ''],
    ['rakuma', '楽天ラクマ 公式ショップ', '', '', '', '',
     'not_accepting', '2026-11-23', 'unverified', '进度表：申请表显示停止受理，未公布重开时间', '', 'none', '', '', ''],
]
assert all(len(r) == len(H) for r in R)
assert len({r[0] for r in R}) == len(R)
os.makedirs(os.path.dirname(O), exist_ok=True)
with io.open(O, 'w', encoding='utf-8-sig', newline='') as f:
    w = csv.writer(f); w.writerow(H); w.writerows(R)
from collections import Counter
print(len(R), 'rows', hashlib.sha256(open(O, 'rb').read()).hexdigest()[:16], dict(Counter(r[6] for r in R)))
