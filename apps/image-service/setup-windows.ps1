# ANET image service — Windows 初回セットアップ + 起動（管理者不要）
#   .\apps\image-service\setup-windows.ps1          # venv 作成 + 依存 + モデルDL + 起動
#   .\apps\image-service\setup-windows.ps1 -Start   # 起動のみ
param([switch]$Start)
$ErrorActionPreference = "Stop"
$Here = $PSScriptRoot
Set-Location $Here

if (-not $Start) {
  # Python 3.12 を優先（3.13 は GPU wheel が未整備）
  $py = (Get-Command py -ErrorAction SilentlyContinue)
  if ($py) { $pyCmd = "py -3.12" } else { $pyCmd = "python" }
  if (-not (Test-Path "venv")) { Invoke-Expression "$pyCmd -m venv venv" }
  & ".\venv\Scripts\python.exe" -m pip install --upgrade pip
  & ".\venv\Scripts\pip.exe" install torch torchvision --index-url https://download.pytorch.org/whl/cu124
  & ".\venv\Scripts\pip.exe" install -r requirements.txt
  # モデルを先に落としておく（初回リクエストの待ちを無くす）
  & ".\venv\Scripts\python.exe" -c "from rembg import new_session; new_session('isnet-general-use'); print('rembg ok')"
  & ".\venv\Scripts\python.exe" -c "from iopaint.model_manager import ModelManager; ModelManager(name='lama', device='cuda'); print('lama ok')"
  & ".\venv\Scripts\python.exe" -c "from rapidocr_onnxruntime import RapidOCR; RapidOCR(); print('ocr ok')"
}

$env:IMAGE_PORT = "8010"
Write-Host "==> image service http://127.0.0.1:8010  (health: /health)" -ForegroundColor Cyan
& ".\venv\Scripts\python.exe" main.py
