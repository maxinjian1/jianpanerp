# instagram — アネット Instagram 運用（主目的：anetmc.com への送客）

2026-10-27 用户決定「做」。IG 小编技能包の日本版。**AI は計画・文案・返信草稿まで。投稿は用户承認後に Meta Graph API、コメント返信・他人への絡みは AI が送らない。**

## 流れ（毎週 1 回、Windows）
| 步 | 命令 | 产出 |
|---|---|---|
| 1 | `node tools/instagram/ig.mjs products` | Shopify ANET 在售商品 + 楽天 A 档フラグ → out/products.json |
| 2 | `plan --week 2026-11-03` | 週 7 投稿：A 档 3（1 本は Reel）/ 新着 2 / 季節・生活場面 2、日本の閲覧ピーク時刻、UTM 付きリンク → `docs/instagram/plan-<week>.md` |
| 3 | `caption --week …`（夜間窓口） | 6kpro 日本語キャプション + ハッシュタグ 12〜15、禁止語チェック |
| 4 | `assets --week …` | Reel は real モード動画（`tools/product-video`）を Shopify Files に上げて公開 URL；画像は Shopify CDN |
| 5 | **用户が plan-<week>.md を見て「承認」** → `approve --week …`（`--only 1,3` で一部） | approved=true |
| 6 | `publish --due`（Windows タスク 1 時間ごと） | 予定時刻を過ぎた承認済みだけ公開 → out/publish-log.jsonl |
| 7 | `replies`（毎日） | コメント返信草稿 → `docs/instagram/replies-<date>.md`、**用户が手で送る** |
| 8 | `insights`（週 1） | リーチ/保存/いいね → `docs/instagram/insights.md` |

## 一次性準備（用户本人、密钥不经聊天）
1. Instagram アカウント（maxinjian@gmail.com）→ 設定で「プロアカウント（ビジネス）」に切替、カテゴリ「ショッピング・小売」。
2. Facebook ページ（アネット）を作り、Instagram アカウントをリンク（Meta Business Suite → 設定 → Instagram）。
3. Meta for Developers のアプリ（2026-10-27 作成済み）：「アプリの設定 → ベーシック」の アプリ ID / app secret を `.env` の `META_APP_ID` / `META_APP_SECRET` に。
4. 「ツール → グラフ API エクスプローラ」でそのアプリを選び、権限 `instagram_basic, instagram_content_publish, instagram_manage_comments, instagram_manage_insights, pages_show_list, pages_read_engagement, business_management` にチェック → 「Generate Access Token」→ Facebook ログインで ページと Instagram を許可 → 表示された短期トークンを `.env` の `IG_ACCESS_TOKEN` に貼る。
5. `node tools/instagram/ig.mjs setup` → 長期トークン（60 日）に交換し、IG ユーザー ID・ユーザー名を `.env` に書き戻す。アプリは開発モードのままで OK（管理者本人のアカウントには公開審査不要）。期限前に setup を再実行。
   ```
   META_APP_ID=  META_APP_SECRET=  IG_ACCESS_TOKEN=  → setup 後に IG_USER_ID / IG_HANDLE が自動追記
   ANET_SITE=https://anetmc.com
   ```
5. プロフィール：`node tools/instagram/ig.mjs profile` の案から選んで用户が設定。リンクは UTM 付き anetmc.com。

## 规则
- キャプションに価格・送料・セール・No.1・最強・日本一（断定）・医療効能・他社名を書かない（景表法・薬機法・変動する情報）。
- 数字・素材は商品説明にあるものだけ。
- 投稿は承認制、返信・DM・他アカウントへのコメントは人が送る。フォロー/いいね自動化はしない（Instagram 規約）。
- 週 7 投稿が多ければ `--n 4`。画像は批発商原図（商品本体）、Reel は real モード（AI 生成なし）。
