# Amazon.co.jp 出品（在庫ファイル）— Shopify ANET → Amazon 出品者出荷

目的：Shopify に載っている 1,181 点を、画像リメイク済みの 8 枚画像と spec.json の日本語文案を使って Amazon.co.jp に **出品者出荷・GTIN 免除・ブランド ANET** で登録する。第一段階は在庫ファイル（フラットファイル）を Seller Central に手動アップロード、第二段階で SP-API に移行する。

## 前提（Seller Central で先に済ませる — ユーザー操作）
1. 配送設定 → 配送パターン「**全国送料無料**」（出荷リードタイム 1 日、平日12時までの注文は当日出荷）。名前がスクリプトの `--shipping` と一致していること。
2. ブランド登録なしの **GTIN 免除申請**：ブランド名 `SARADEMUNT`（ANET は不可）、カテゴリごとに申請（商品名＋商品画像で可）。承認後に `external_product_id` 空欄で登録できる。
3. **出品許可申請**：`classify` が出す `out/category-report.md` の「要申請」カテゴリ（Beauty / Grocery / Watch / Jewelry / HealthAndPersonalCare / Baby）を申請。
4. 各カテゴリの在庫ファイルテンプレート（在庫 → アップロードによる一括商品登録 → 在庫ファイルのダウンロード）を取り、`テンプレート` シートの先頭 3 行を TSV でコピーして `tools/amazon-listing/templates/<feed_product_type>.headers.tsv` に保存（例 `Home.headers.tsv`）。`データ定義`／`有効な値` シートから `feed_product_type` の正式値と推奨ブラウズノード ID を `category-map.json` の `browseNodes` に反映。

## 使い方（Windows。`.env` の SHOPIFY_* が要るのは refresh だけ）
```
node tools/amazon-listing/build-inventory-file.mjs classify                      # 振り分け＋要申請一覧
node tools/amazon-listing/build-inventory-file.mjs refresh                       # 公開後の画像 URL / 価格を Shopify から取り直す
node tools/amazon-listing/build-inventory-file.mjs check                         # 禁止語・画像枚数・タイトル長の点検
node tools/amazon-listing/build-inventory-file.mjs build --type Home --limit 10  # 最初の 10 件（手動アップロードで様子見）
node tools/amazon-listing/build-inventory-file.mjs build                         # 全カテゴリ分を out/inventory-<type>.tsv に
```
出力は `tools/amazon-listing/out/`（git 管理外）。TSV は UTF-8 BOM 付き・CRLF・3 行ヘッダなので、そのまま Seller Central にアップロードできる（Excel で開いて .xlsm 保存しても可）。

## 変換ルール
| 項目 | 値 |
|---|---|
| item_sku | 単品 `ANET-V<ShopifyVariantId>`、親 `ANET-P<ProductId>`（SP-API 移行後も同じ SKU を使う） |
| brand / manufacturer | SARADEMUNT（ANET は Amazon 上で既存ブランドと衝突、2026-10-17 に SARADEMUNT へ決定） |
| external_product_id | 空（GTIN 免除） |
| item_name | Shopify タイトルから「送料無料・最安・【】・記号」を除去し 65 字に切る |
| bullet_point1-5 | spec.json の features 4 本＋寸法／セット内容 |
| product_description | catch + sceneCopy + features + 説明文（1,900 字） |
| 画像 | main = 01-main-amazon（白背景）、other 1-7 = 02〜08（refresh 後の Shopify CDN URL） |
| バリエーション | オプション名が 色/カラー → Color、それ以外 → Size、両方 → SizeColor。親行は価格・在庫なし |
| 価格 | Shopify 税込価格そのまま（JPY） |
| 在庫 | `--qty`（既定 50、代発の見込み値） |
| コンディション | New、原産国 CN（`--origin`） |

`check` の「要確認ワード」（治る・効く・美白 など薬機法／景表法）は手で直す。Amazon 用に 6kpro で文案を再生成しない：すでに楽天／Amazon 向けに書いた spec.json を再利用する。顧客情報は一切扱わない。

## 既存出品（SARADEMUNT レディースインナー）の最適化 — `optimize/`
売上上位 10 ASIN は凍結し、残り全部のタイトル／箇条書き／説明／検索キーワード／サブ画像を直す。メイン画像（実人着用）は触らない。
入力は Seller Central から落とす 2 本のレポート（`in/active-listings.txt`、`in/business-report-90d.csv`、git 管理外）。
```
node tools/amazon-listing/optimize/optimize.mjs rank      # 凍結 10 件・対象・セグメント → out/opt/plan.md
node tools/amazon-listing/optimize/optimize.mjs fetch     # 自社商品ページから現状を取得（Windows、CDP 9222 のブラウザ）
node tools/amazon-listing/optimize/optimize.mjs write     # 6kpro で新文案（skill sarademunt-jp-ad-video のルール内蔵）
node tools/amazon-listing/optimize/optimize.mjs cards     # サブ画像 4 枚（サイズ表／素材／プライバシー梱包／選ばれる理由）
node tools/amazon-listing/optimize/optimize.mjs build     # PartialUpdate TSV（テキスト・画像）+ review.md
```
画像は `apps/web-client/public/brand/amazon/<asin>/` に置き japanerp.com 経由の URL を出品ファイルに書く。
