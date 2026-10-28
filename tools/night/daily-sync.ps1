# 毎日 1 回（Windows タスク anet-daily-sync、推奨 06:30 JST = 北京 05:30、6kpro 夜間窓口内）
# ① 批発商新着 → Shopify 当日上架 ② 楽天 比価 → 動的価格 ③ IG 商品リスト更新。各ステップ失敗しても次へ進む。ログ tools/night/logs/daily-<date>.log
$ErrorActionPreference = 'Continue'
Set-Location "$PSScriptRoot\..\.."
$d = Get-Date -Format 'yyyy-MM-dd'; New-Item -ItemType Directory -Force "tools\night\logs" | Out-Null; $log = "tools\night\logs\daily-$d.log"
function Step($name, $cmd) { "== $name $(Get-Date -Format HH:mm) ==" | Tee-Object -FilePath $log -Append; try { Invoke-Expression $cmd 2>&1 | Tee-Object -FilePath $log -Append } catch { "ERR $name $_" | Tee-Object -FilePath $log -Append } }
Step 'git pull'          'git pull -q origin claude/brave-dirac-s6orrc'
Step 'new-items'         'node tools/kjyf-scraper/new-items.mjs'
Step 'b2b fetch'         'node tools/kjyf-b2b/sync.mjs fetch'
Step 'b2b backup'        'node tools/kjyf-b2b/sync.mjs backup'
Step 'b2b plan'          'node tools/kjyf-b2b/sync.mjs plan'
Step 'b2b create'        'node tools/kjyf-b2b/sync.mjs apply --only create'      # 新着を Shopify に当日上架（draft は断貨表ルールで別途）
Step 'price-tier'        'node tools/rakuten/price-tier.mjs --refresh'            # 楽天 同款比価（1 日 1 回、--refresh で全件再取得）
Step 'reprice plan'      'node tools/rakuten/reprice.mjs plan'
Step 'reprice apply'     'node tools/rakuten/reprice.mjs apply --only price'      # 価格のみ。非表示は比価の誤マッチが多く用户判断待ち（2026-10-28）。2% 失敗・5 連続失敗で自動停止
Step 'ig products'       'node tools/instagram/ig.mjs products'
Step 'git push'          'git add docs/kjyf-new-items.md docs/rakuten/price-tier.md docs/rakuten/reprice-plan.md docs/rakuten/reprice-log.csv docs/kjyf-b2b-同步计划.md; git commit -qm "daily-sync $d" ; git push -q origin claude/brave-dirac-s6orrc'
"== done $(Get-Date -Format HH:mm) ==" | Tee-Object -FilePath $log -Append
