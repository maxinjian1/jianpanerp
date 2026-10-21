---
name: amazon-a-plus-jp
description: SARADEMUNT（アネット株式会社）の Amazon.co.jp 商品紹介コンテンツ（A+ / ベーシック A+）を作る SOP。amazon-visual-sop で作った画像・brief.json・amazon-listing.json を素材に、モジュール構成 → 日本語文案 → 画像書き出し → 規約チェック → 用户承認後に Seller Central へ登録。「A+」「A-plus」「商品紹介コンテンツ」「A+ページ」「ブランドコンテンツ」と言われたら必ずこの skill を使う。
---

# Amazon A+（商品紹介コンテンツ）SOP — 日本站・SARADEMUNT 専用

目的：商品ページ下部で **「買う理由」を画像中心で 30 秒で伝え、転換率を上げる**。
前提：A+ はブランド登録（SARADEMUNT）済みの出品でだけ使える。審査は Amazon 側で最長 7 営業日。

## 鉄則（amazon-visual-sop と共通 + A+ 固有）

1. **事実だけ**：寸法・素材・容量・枚数などは `tools/amazon-visual/out/<handle>/brief.json` の `facts[]`（出典付き）にあるものだけ。無い数字は書かない。
2. **A+ で禁止（審査落ちの主因）**：
   - 価格・値引き・セール・「送料無料」・配送日数・ギフト券など**時期や取引条件**に関わる表現
   - 「保証」「返金」「満足保証」などの**保証表現**（Amazon の返品ポリシーと矛盾）
   - 最強/No.1/日本一/業界初/ベストセラー/ランキング表記、**他社名・他社商品との比較**（自社商品同士の比較表は可）
   - レビュー・星評価の引用、第三者の推薦（「〇〇おすすめ」）
   - 薬機法・景表法に触れる効能（治る/痩せる/美白/UV カット率の断言/抗菌率 等）。`build-inventory-file.mjs` の `STRIP_RE`/`WARN_RE` と同じ語は使わない
   - URL・メール・電話・QR・「Amazon で検索」などの誘導、Amazon ロゴ
   - 画像に**読めないほど小さい文字**、ぼやけた画像、ウォーターマーク
3. **AI は絵だけ、文字はコード**：画像内の日本語は `tools/brand-assets/product-cards.mjs` と同じ Chromium テンプレート（Noto Sans JP）で描く。生成 AI は商用ライセンスのモデルのみ、商品の形・色・ロゴは変えない。
4. **登録は承認制**：作ったものは preview として用户に見せ、承認（`tools/amazon-a-plus/approved.txt` に ASIN/SKU を追記）されたものだけ Seller Central に入れる。Seller Central のログイン・OTP・CAPTCHA・規約同意画面は触らない（止めて用户に渡す）。

## 素材の取り方

| 欲しいもの | 出所 |
|---|---|
| 最大の需求・顧慮、答え方 | `brief.json` の `needs[]` / `concerns[]` / `plan.slides`（lite 商品は facts だけ） |
| 使える数字・仕様 | `brief.json.facts[]` |
| 商品単体の切り抜き・シーン原図 | `tools/amazon-visual/out/<handle>/work/`・`src/` |
| 商品名・箇条書き | `amazon-listing.json`（同じ言い回しを繰り返さない。A+ は「見せる」担当） |

## モジュール構成（ベーシック A+、最大 5 モジュール）

画像サイズは Seller Central の各モジュールの指定に従う（代表例：ヘッダー画像 970×600、画像＋テキスト 970×300 / 300×300、4 画像 220×220、比較表 150×300）。文字数上限も**エディターの表示を正**とし、超えたら短くする。

標準構成（カテゴリで入れ替え可）：
1. **ブランド＋最大の価値**（ヘッダー画像付き）— 需求 1 位を一言で。SARADEMUNT のロゴは自社のものだけ。
2. **悩み → 解決**（画像左・テキスト右）— 顧慮 1 位に facts で答える。答えられない顧慮は書かない。
3. **特長 3〜4 点**（4 画像＋テキスト）— 素材・構造・細部アップ。各 1 行の見出し＋2 行以内の説明。
4. **使用シーン**（大きな画像 1 枚）— 客群に合うシーン。人物入りは商品カテゴリの規約内で。
5. **自社商品の比較表 または サイズ・セット内容** — 色・サイズ違いの自社 ASIN 同士で比較（他社比較は禁止）。比較対象が無ければ寸法図＋セット内容。

**モバイル優先**：日本の Amazon はスマホ閲覧が大半。画像内の文字は縮小しても読める大きさ（本文 28px 相当以上 @970 幅）にし、重要な文はテキスト欄にも入れる（画像内文字は検索に効かない）。

## 手順

1. 対象選び：`check.pass` 済み・在庫あり・SARADEMUNT 名義の ASIN。売上・セッションのある商品を優先（`tools/amazon-listing/optimize` の rank 結果）。
2. `brief.json` から 5 モジュールの文案 JSON を作る（各テキストに根拠 `factIds`）。6kpro で下書き → 禁止語・数字の出典をコードで再検査（visual.mjs `validatePlan` と同じロジック）。
3. 画像を Chromium テンプレートで書き出し（JPEG sRGB、各モジュールの指定サイズ）→ `out/<handle>/a-plus/` ＋ 全体 preview（スマホ幅 375px で縦に並べた見え方も作る）。
4. 自己点検：禁止語 0、数字は全て facts 由来、画像内最小文字サイズ、他社名なし、価格・配送なし。
5. 用户承認 → Seller Central「A+ コンテンツ管理」で作成・ASIN 適用・審査提出。審査結果（承認/差し戻し理由）を `out/<handle>/a-plus/status.json` に記録し、差し戻しは理由を直して再提出。
6. 効果測定：適用前後 4 週間のビジネスレポート（セッション・ユニットセッション率）を比べて記録。

## 出力

```
tools/amazon-a-plus/out/<handle>/
  a-plus.json      # modules[]（type, headline, body, image, factIds）, asins[], checks
  m1.jpg … m5.jpg  # モジュール画像
  preview-pc.jpg / preview-sp.jpg
  status.json      # 提出日・審査結果・差し戻し理由
```
