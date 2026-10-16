# 安い — ANET 公式ショッピングアプリ（iOS / Android）

Expo（React Native + TypeScript）製。Shopify Storefront API で商品・カートを扱い、購入手続きは Shopify Checkout を WebView で表示する。

- 画面：ホーム（ジャンルバー／バナー／リアルタイムランキング／おすすめ／特集／新着）・ジャンル・検索・カート・マイページ・商品詳細・コレクション一覧・チェックアウト
- 設定：`.env`（`.env.example` をコピー）。`EXPO_PUBLIC_STOREFRONT_TOKEN` は Shopify 管理画面の Headless チャネルで発行
- 開発：`npm install && npx expo start`（Expo Go で実機確認）
- 型チェック：`npm run typecheck`
- ビルド/提出：`eas build` / `eas submit`（詳細は `docs/mobile-app/上架指南-安い.md`）
- アイコン・スプラッシュ再生成：`node tools/brand-assets/render-app-icon.mjs`（リポジトリ直下で）
