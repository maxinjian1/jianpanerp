# Instagram 予約投稿（用户 2026-10-27 承認：全商品カタログ計画）
# Windows タスク スケジューラ「anet-ig-publish」が毎時 00 分に起動。承認済みかつ予定時刻を過ぎた投稿だけを公開する。
# 上限：1 回 10 件・24 時間 40 件。連続 3 件失敗で ig.mjs が out/publish-STOPPED.txt を作りタスクを無効化する。
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$log = Join-Path $root 'tools\instagram\out\publish.log'
"=== $(Get-Date -Format s) publish --due" | Add-Content $log
cmd /c "node tools/instagram/ig.mjs publish --due >> `"$log`" 2>&1"
"=== $(Get-Date -Format s) exit=$LASTEXITCODE" | Add-Content $log
