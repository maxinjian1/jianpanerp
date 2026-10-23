# amazon-sourcing — Amazon.co.jp 選品（13 步 SOP の作業場）

- 手順：`.claude/skills/amazon-sourcing-jp/SKILL.md`（原文 `docs/amazon-sourcing/选品全流程-AI执行版.md`）
- `in/`：用户がダウンロードした Search Query Performance / Product Opportunity Explorer / Keepa の CSV（git に入れない）
- `out/<slug>/`：1 商品候補 1 フォルダ（scope / top20 / metrics / reviews / economics / keepa / report）
- 中文报告は `docs/amazon-sourcing/<slug>.md` に置く

## 環境メモ（確認したら書き換える）

| 項目 | 状態 |
|---|---|
| Keepa 購読 | **未確認**（用户に一度だけ聞く） |
| Search Query Performance | SARADEMUNT ブランド登録済み → Seller Central で取得可（自ブランド関連の検索語のみ） |
| Product Opportunity Explorer | Seller Central で閲覧可、CSV は用户が転記 |
| FBA 料金シミュレーター | 估算のみ。全費用は含まない |
