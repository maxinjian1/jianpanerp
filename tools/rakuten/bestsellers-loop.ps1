# 楽天畅销扫描の常駐ループ（2026-10-29）：scan を回し、CAPTCHA で止まったら 30 分待って続きから。対象を全部扫完したら report まで実行。
#   Start-Process powershell -ArgumentList '-ExecutionPolicy','Bypass','-File','tools\rakuten\bestsellers-loop.ps1' -WindowStyle Minimized
$Root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $Root
$log = Join-Path $Root 'logs\bestsellers.log'
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
while ($true) {
  Add-Content -Encoding UTF8 $log "== scan $(Get-Date -Format s) =="
  cmd /c "node tools/rakuten/bestsellers.mjs scan >> `"$log`" 2>&1"
  $tail = Get-Content $log -Tail 5 -Encoding UTF8 | Out-String
  if ($tail -match 'CAPTCHA') { Add-Content -Encoding UTF8 $log "== CAPTCHA → 30 分待機 $(Get-Date -Format s) =="; Start-Sleep -Seconds 1800; continue }
  break
}
Add-Content -Encoding UTF8 $log "== report $(Get-Date -Format s) =="
cmd /c "node tools/rakuten/bestsellers.mjs report >> `"$log`" 2>&1"
Add-Content -Encoding UTF8 $log "== done $(Get-Date -Format s) =="
