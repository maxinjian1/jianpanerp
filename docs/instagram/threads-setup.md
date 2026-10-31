# Threads 同時投稿の開通手順（用户が一度だけやる）

所要 10〜15 分。トークンとシークレットはチャットに貼らない。

## 0. 前提
- スマホの Threads アプリで、Instagram アカウント（@maxinjian）でログインして Threads プロフィールを作っておく。公開アカウントにする。

## 1. Meta アプリに Threads を追加
1. developers.facebook.com →「マイアプリ」→ 既存のアプリ（ID 1863670448337524）を開く。
2. 左メニュー「ユースケース」→「ユースケースを追加」→「Threads API にアクセス」を選ぶ。
   - 既存アプリに追加できない表示が出たら、「アプリを作成」で新しいアプリを作り、ユースケースは「Threads API にアクセス」だけを選ぶ（名前は「ANET Threads」など）。
3. 「Threads API にアクセス」→「カスタマイズ」→ 権限で `threads_basic` と `threads_content_publish` を追加。

## 2. 自分を Threads テスターにする
1. アプリの「アプリの役割」→「役割」→「Threads テスターを追加」→ Threads のユーザー名（maxinjian）を入力。
2. スマホの Threads アプリ →「設定」→「アカウント」→「ウェブサイトのアクセス許可」→「招待」→ 承認。

## 3. トークンとシークレットを取得
1. 「Threads API にアクセス」→「設定」に表示される **Threads アプリシークレット** をコピー（「表示」を押す）。
2. 同じページの「ユーザートークン生成ツール」で、テスターの自分のアカウントの「アクセストークンを生成」→ 許可 → 表示されたトークンをコピー。

## 4. Windows の .env に貼る
`Win + R` → `notepad C:\Users\maxinjian\source\jianpanerp\.env` → 末尾に 2 行追加（既にあれば値を置き換え）：

```
THREADS_APP_SECRET=（3-1 でコピーしたシークレット）
THREADS_ACCESS_TOKEN=（3-2 でコピーしたトークン）
```

保存して、10 分以内に Windows に「Threads 開通」の指示を貼る（短期トークンは約 1 時間で切れる）。
