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

## 全商品カバー（2026-10-27 用户「anetmc.com の商品を全部 IG に」）
- `plan --catalog --per-day 6 --from 2026-11-02` → カテゴリ別 5 商品 × 2 枚 = 10 枚カルーセル、1 日 6 本（08/12/15/18/20/21:30）、カテゴリを交互に。1,200 商品 ≈ 240 本 ≈ 40 日。`caption --file catalog`（夜間）→ 用户承認 → `approve --file catalog` → `publish --due` が毎時 1 回、1 回最大 10 本、24 時間 40 本で自動停止（API 上限 50/日）。
- 並行して **Instagram ショッピング**：Shopify 管理画面 → 販売チャネル「Facebook & Instagram」を追加 → Meta と接続 → 商品カタログ自動同期 → IG プロフィールに「ショップ」タブ、投稿に商品タグ。これが「全商品を IG に置く」最短経路（用户本人が Shopify で接続）。

## 一次性準備（用户本人、密钥不经聊天）
1. Instagram アカウント（maxinjian@gmail.com）→ 設定で「プロアカウント（ビジネス）」に切替、カテゴリ「ショッピング・小売」。
2. Facebook ページ（アネット）を作り、Instagram アカウントをリンク（Meta Business Suite → 設定 → Instagram）。
3. Meta for Developers のアプリ（2026-10-27 作成済み）：「アプリの設定 → ベーシック」の アプリ ID / app secret を `.env` の `META_APP_ID` / `META_APP_SECRET` に。
4. 「ツール → グラフ API エクスプローラ」でそのアプリを選び、権限 `instagram_basic, instagram_content_publish, instagram_manage_comments, instagram_manage_insights, pages_show_list, pages_read_engagement, pages_manage_posts, business_management`（`pages_manage_posts` は Facebook ページ同時投稿用） にチェック → 「Generate Access Token」→ Facebook ログインで ページと Instagram を許可 → 表示された短期トークンを `.env` の `IG_ACCESS_TOKEN` に貼る。
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

## 店舗リンクと Facebook 同時投稿（2026-10-28）
- Instagram の本文中の URL はリンクにならない。だから **bio に anetmc.com を入れるのが必須**（docs/instagram/profile.md A 案）。publish は本文末尾に「🛒 公式オンラインショップ「アネット」 anetmc.com（プロフィールのリンクからどうぞ）」を機械的に付ける（6kpro の文案には含めない）。
- IG API で出した投稿はページに自動共有されない。`.env` に `FB_PAGE_ID / FB_PAGE_TOKEN`（`setup` が保存、権限 `pages_manage_posts` が必要）があれば、publish が同じ画像・本文＋ **クリックできる anetmc.com リンク** を Facebook ページにも投稿する。FB 側の失敗は IG の成功を取り消さず、plan に `fbError` として残る。`--no-fb` で IG のみ。
- すでに IG に出ていて FB に無い投稿は `fb-backfill` で追加。
- `caption --force`（作り直し）は approved を false に戻す → 用户が見てから `approve`。

## Threads 同時投稿（2026-11-01）
- publish が Instagram 公開に成功した直後、同じ画像（最大 10 枚カルーセル）を Threads にも投稿する。Facebook と同じく Threads 側の失敗は IG を取り消さず、plan に `thError`、計画表の状態に「TH失敗」。`--no-th` で Threads を止める。
- Threads の制約：本文 500 字まで、話題タグ 1 個まで。→ IG キャプションを 500 字に収め（句点で切る）、末尾に「🛒 公式オンラインショップ「アネット」＋ anetmc.com（utm_source=threads、本文のリンクは押せる）＋ 話題タグ 1 個」。
- トークンは Facebook と別物（graph.threads.net）。手順は docs/instagram/threads-setup.md。`th-setup` で長期（60 日）に交換、daily-sync の `th-refresh` が毎日延長。
- 既存の公開済み投稿は `th-backfill --max 2`（既定 2 件）で少しずつ。新しいアカウントで一度に大量投稿しない。
- AI は Threads でも返信・いいね・フォローをしない（IG と同じルール）。

## 1 投稿 = 1 商品（2026-11-01 用户決定）
- `plan --single [--per-day 10] [--from YYYY-MM-DD]` → `plan-single.json`。A 档を先頭、残りはカテゴリ交互。画像はその商品の最大 10 枚、Facebook / Threads のリンクは**その商品ページ**。
- 旧 `catalog`（5 商品まとめ）は `retire --file catalog` で未公開分を止める（公開済みはそのまま）。
- `caption --file single`（6kpro・夜間）：1 回で 2 種類を作る。`caption` = Instagram と Facebook 用（場面 1 行 → ✔ここがうれしい 3〜5 行 → サイズ等の事実 → こんな方に → 締め、250〜450 字）、`threads` = Threads 用（話し言葉 2〜3 行・60〜140 字、一番いいところと何が楽になるかだけ）。
- **「お客様の声」から始めるのは実レビューがある商品だけ**：`tools/instagram/in/reviews.json`（雛形 reviews.example.json）に自店の実レビューを人が転記 → システムが 1 行目に原文と出典を付ける。AI にはレビュー・好評・人気などを書かせない（禁止チェックあり）。日本の景品表示法（2023-10 施行のステマ規制）で、作ったレビュー風広告は違法。
