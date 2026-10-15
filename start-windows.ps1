# ============================================
# Japan Omni-EC ERP - Windows 本地启动脚本
# 用法（PowerShell，项目根目录）：
#   .\start-windows.ps1            # 启动基础设施 + 三个应用窗口
#   .\start-windows.ps1 -Setup     # 首次：安装依赖 + 生成 Prisma + 迁移数据库
#   .\start-windows.ps1 -InfraOnly # 只启动 Postgres / Redis
# ============================================
param(
    [switch]$Setup,
    [switch]$InfraOnly
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Ok($msg)   { Write-Host "  OK  $msg" -ForegroundColor Green }
function Warn($msg) { Write-Host "  !!  $msg" -ForegroundColor Yellow }

# ---------- 0. 前置检查 ----------
Step "检查前置工具"
foreach ($tool in @("node", "npm", "docker", "python")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "未找到 $tool，请先安装（node 20+、Docker Desktop、Python 3.11+）"
    }
}
$nodeMajor = [int]((node -v).TrimStart("v").Split(".")[0])
if ($nodeMajor -lt 20) { throw "Node 版本需 >= 20，当前 $(node -v)" }
Ok "node $(node -v) / npm $(npm -v) / $(python --version)"

# ---------- 1. .env ----------
if (-not (Test-Path "$Root\.env")) {
    Copy-Item "$Root\env.example.txt" "$Root\.env"
    Warn ".env 不存在，已从 env.example.txt 复制。请填入各平台 / 中国模型 API 的 Key 后重新运行。"
}
# 把根目录 .env 载入当前进程环境变量（Prisma / 子窗口都要用）
Get-Content "$Root\.env" | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq "" -or $line.StartsWith("#")) { return }
    $i = $line.IndexOf("=")
    if ($i -lt 1) { return }
    $k = $line.Substring(0, $i).Trim()
    $v = $line.Substring($i + 1).Trim()
    if ($v.Length -ge 2 -and $v.StartsWith('"') -and $v.EndsWith('"')) { $v = $v.Substring(1, $v.Length - 2) }
    [Environment]::SetEnvironmentVariable($k, $v, "Process")
}
Ok ".env 已载入（DATABASE_URL=$($env:DATABASE_URL -replace ':[^:@]+@', ':***@'))"

# ---------- 2. 基础设施（Docker） ----------
Step "启动 PostgreSQL / Redis（Docker Compose）"
# 开机自启时 Docker Desktop 可能还没起来：没运行就拉起，并最多等 5 分钟
docker info 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    $dd = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dd) { Warn "Docker Desktop 未运行，正在启动…"; Start-Process $dd | Out-Null }
    $ok = $false
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 5
        docker info 2>$null | Out-Null
        if ($LASTEXITCODE -eq 0) { $ok = $true; break }
    }
    if (-not $ok) { throw "Docker Desktop 5 分钟内未就绪" }
}
docker compose -f "$Root\docker-compose.yml" up -d
if ($LASTEXITCODE -ne 0) { throw "docker compose 启动失败" }

# 等待 Postgres 就绪
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    $status = docker inspect -f "{{.State.Health.Status}}" jianpanerp-postgres 2>$null
    if ($status -eq "healthy") { $ready = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $ready) { throw "PostgreSQL 30 秒内未就绪，查看：docker logs jianpanerp-postgres" }
Ok "PostgreSQL :5432 / Redis :6379 已就绪"

if ($InfraOnly) { exit 0 }

# ---------- 3. 首次安装 ----------
if ($Setup) {
    Step "安装 Node 依赖（monorepo）"
    Push-Location $Root
    npm install
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "npm install 失败" }
    Pop-Location

    Step "生成 Prisma Client 并迁移数据库"
    Push-Location "$Root\packages\database"
    npx prisma generate
    npx prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "prisma migrate 失败，请检查 .env 中 DATABASE_URL" }
    Pop-Location

    Step "编译共享包（database / shared-types）"
    Push-Location $Root
    npm run build -w @japan-erp/shared-types -w @japan-erp/database
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "共享包编译失败" }
    Pop-Location

    Step "创建 Python 虚拟环境（ai-service）"
    Push-Location "$Root\apps\ai-service"
    if (-not (Test-Path "venv")) { python -m venv venv }
    & ".\venv\Scripts\pip.exe" install --only-binary=:all: -r requirements.txt
    Pop-Location
    Ok "首次安装完成"
}

# ---------- 4. 启动三个应用窗口 ----------
Step "启动应用（各自独立 PowerShell 窗口）"

$apps = @(
    @{ Name = "api-core (NestJS :4000)";  Dir = "apps\api-core";   Cmd = "npm run dev" },
    @{ Name = "web-client (Next :3000)";  Dir = "apps\web-client"; Cmd = "npm run dev" },
    @{ Name = "ai-service (FastAPI :8000)"; Dir = "apps\ai-service"; Cmd = ".\venv\Scripts\Activate.ps1; python main.py" }
)

foreach ($app in $apps) {
    $dir = Join-Path $Root $app.Dir
    Start-Process powershell -ArgumentList @(
        "-NoExit",
        "-Command",
        "`$host.UI.RawUI.WindowTitle = '$($app.Name)'; Set-Location '$dir'; $($app.Cmd)"
    )
    Ok "已启动 $($app.Name)"
}

Write-Host ""
Write-Host "  前端:    http://localhost:3000" -ForegroundColor Yellow
Write-Host "  API 文档: http://localhost:4000/docs" -ForegroundColor Yellow
Write-Host "  AI 服务: http://localhost:8000/docs" -ForegroundColor Yellow
Write-Host ""
