# 商品画像フルリニューアル・パイプライン

原則：**AI は画像、文字はコード**。6kpro（GLM-5.3-Flash ビジョン）が原図を分類し、Windows RTX 4080 の rembg が切り抜き、6kpro がコピーを書き、Chromium が 8 枚をレンダリングする。スタイルは MIX（主画像・特長・寸法・ディテール・カラー・安心 = B 量販店風、シーン = A 生活雑貨風）。

## 準備（Windows、初回のみ）
```powershell
cd C:\Users\maxinjian\source\jianpanerp
npm i -D @fontsource/noto-sans-jp @fontsource/zen-kaku-gothic-new @fontsource/shippori-mincho   # 日本語フォント（約170MB、node_modules のみ）
apps\image-service\venv\Scripts\python.exe -m pip install rembg onnxruntime-gpu pillow            # 済みなら不要
```
`.env` に SHOPIFY_* と CN_LLM_BASE_URL があること。

## 実行
```powershell
node tools/product-images/pipeline.mjs fetch                 # 全商品メタ + 画像 URL → out/products.json
node tools/product-images/pipeline.mjs all --only-hero --limit 20   # まず TOP20 を最後まで
node tools/product-images/pipeline.mjs all                   # 全件（classify/spec は 6kpro 3 並列、cutout は GPU 1 プロセス）
node tools/product-images/pipeline.mjs publish --only-hero --limit 20 --dry   # 置き換え内容の確認
node tools/product-images/pipeline.mjs publish --only-hero --limit 20         # Shopify 画像を置き換え（旧画像 URL は media-backup.json に保存）
node tools/product-images/pipeline.mjs rollback --handle <handle>             # 戻す
```
- 各段階はファイル存在でスキップ（再開可能）。失敗は `out/errors.log`。
- 出力：`out/<handle>/final/01-main-amazon.png … 08-trust.png`（1600×1600）。01 は Amazon 主画像規約（純白・文字なし）、02 は楽天主画像規約（文字 20% 未満・枠線なし）。
- 所要時間の目安：classify 約 20〜30 秒/品（画像 8〜10 枚を 1 リクエスト）、cutout 約 1〜2 秒/品、spec 約 20〜30 秒/品、render 約 6 秒/品 → 1184 件で 6kpro 3 並列なら約 6〜8 時間。
- 楽天・Amazon への出品時は `final/` をそのまま使う（Amazon は 01 を主画像、08 は送料無料の文言を含むため使わない or `--amazon 1` で再レンダリング）。

## 並行モード（全量実行中に成品を先に出す）
主プロセス `all` が classify を回している間に、別プロセスで
```powershell
node tools/product-images/pipeline.mjs follow --ready-only --concurrency 2 --interval 600
```
を常駐させると、classify 済みの商品から順に cutout → spec → render → preview を 10 分ごとに進める（未分類はスキップ、全件 final が揃うと自動終了）。6kpro への負荷は spec の 2 並列分だけ増える。
