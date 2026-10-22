# 6kpro 夜間ジョブ（用户 2026-10-22：北京時間 20:00〜翌 10:00 = 日本時間 21:00〜翌 11:00 は 6kpro を自由に使ってよい）
# Windows タスク スケジューラ「anet-night-6kpro」が毎日 21:00（日本時間）に起動。jobs.txt を上から順に実行する。
# 各ジョブは LLM_WINDOW で時間帯を守り、11:00（日本時間）を過ぎたら自分で止まる（続きは翌晩、完了済みはスキップ）。
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $root
$env:LLM_WINDOW = '20-10'; $env:LLM_WINDOW_TZ = 'Asia/Shanghai'
$logDir = Join-Path $root 'tools\night\logs'; New-Item -ItemType Directory -Force $logDir | Out-Null
$log = Join-Path $logDir ("night-" + (Get-Date -Format 'yyyyMMdd') + ".log")
"=== $(Get-Date -Format s) night start" | Add-Content $log
git pull -q origin claude/brave-dirac-s6orrc 2>&1 | Add-Content $log
foreach ($line in Get-Content (Join-Path $PSScriptRoot 'jobs.txt')) {
  $job = $line.Trim(); if (-not $job -or $job.StartsWith('#')) { continue }
  $h = [int](Get-Date ([System.TimeZoneInfo]::ConvertTimeBySystemTimeZoneId((Get-Date), 'China Standard Time')) -Format 'HH')
  if ($h -ge 10 -and $h -lt 20) { "=== $(Get-Date -Format s) window closed, stop before: $job" | Add-Content $log; break }
  "=== $(Get-Date -Format s) start: $job" | Add-Content $log
  cmd /c "node $job --window 20-10 >> `"$log`" 2>&1"
  "=== $(Get-Date -Format s) exit=$LASTEXITCODE : $job" | Add-Content $log
}
# 結果（進捗・一覧図）を push（ログ本体は git に入れない）
git add docs/amazon-visual/all-status.md docs/amazon-visual/all tools/product-images/approved.txt docs/rakuten/title-check.md docs/rakuten/title-check.csv 2>$null
if (Test-Path tools/amazon-listing/out/opt/review.md) { New-Item -ItemType Directory -Force docs/amazon-listing | Out-Null; Copy-Item tools/amazon-listing/out/opt/review.md docs/amazon-listing/optimize-review.md -Force; git add docs/amazon-listing/optimize-review.md 2>$null }
git commit -q -m "night: 6kpro 夜間ジョブ結果 $(Get-Date -Format yyyy-MM-dd)" 2>$null
git push -q origin claude/brave-dirac-s6orrc 2>&1 | Add-Content $log
"=== $(Get-Date -Format s) night end" | Add-Content $log
