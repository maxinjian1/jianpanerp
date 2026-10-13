# Windows 本地部署指南

## 1. 安装前置软件（一次性）
| 软件 | 版本 | 说明 |
|---|---|---|
| Docker Desktop | 最新 | 启用 WSL2 后端；设置 → General → "Start Docker Desktop when you sign in" |
| Node.js | 20 LTS | https://nodejs.org |
| Python | 3.11+ | 安装时勾选 "Add to PATH" |
| Git | 最新 | |
| （可选）NVIDIA 驱动 + CUDA | | 仅当要跑本地 Ollama 模型 |

## 2. 首次启动
```powershell
cd C:\Users\<你>\source\jianpanerp
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned   # 仅第一次
.\start-windows.ps1 -Setup
```
脚本会：复制 `.env` → 启动 Postgres/Redis（Docker）→ `npm install` → Prisma 迁移 → 建 Python venv → 开 3 个应用窗口。

第一次运行后 **编辑 `.env`**，填入：
- 四平台 API Key（Amazon / 楽天 / Yahoo / Shopify）
- `DASHSCOPE_API_KEY`（阿里云百炼，建议国际站）
- `LINE_CHANNEL_ACCESS_TOKEN` 或 `SLACK_WEBHOOK_URL`

## 3. 日常启动
```powershell
.\start-windows.ps1
```

## 4. 开机自启（可选）
任务计划程序 → 创建任务 → 触发器"登录时" → 操作：
`powershell -ExecutionPolicy Bypass -File C:\...\jianpanerp\start-windows.ps1`
Docker 容器已设 `restart: always`，Postgres/Redis 会随 Docker Desktop 自动恢复。

## 5. 本地模型兜底（可选，需 ≥12GB 显存）
```powershell
docker compose --profile local-llm up -d
docker exec jianpanerp-ollama ollama pull qwen3:8b
```
然后把 `.env` 的 `LLM_PII_PROVIDER` 改为 `ollama`。

## 6. 备份
```powershell
docker exec jianpanerp-postgres pg_dump -U erp japan_erp > backup\japan_erp_$(Get-Date -Format yyyyMMdd).sql
```
建议任务计划每晚执行并同步到 NAS / OneDrive / S3。

## 7. 远程访问
安装 Tailscale（Windows + 手机），不开公网端口即可从外面访问 `http://<tailscale-ip>:3000`。
