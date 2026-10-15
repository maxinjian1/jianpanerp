# ANET V64 部署（Ubuntu 24.04，4×V100 16GB）

目标：客户不敲命令。一条安装命令 → Tailscale 授权 → 全部服务起来 → 从 Mac 打开 `http://<v64-tailscale-ip>:3000`。

## 一键安装
```bash
curl -fsSL https://raw.githubusercontent.com/maxinjian1/jianpanerp/main/deploy/v64/install-v64.sh | sudo bash
```
首次会装 NVIDIA 驱动并提示重启；重启后**再跑一次同样命令**即可继续。脚本会打印 Tailscale 授权链接，用 ANET 的账号（或客户自己的账号）授权。

## 组成（`docker-compose.v64.yml`）
| 服务 | 端口 | 说明 |
|---|---|---|
| web-client | 3000 | ERP 前端（Next standalone） |
| api-core | 4000 | NestJS API + AI Gateway；启动时自动跑数据库迁移 |
| ai-service | 8000 | Prophet 预测 |
| ollama | 11434 | 本地模型，4 卡全部挂载；默认 `qwen3:30b-a3b`（MoE，Q4 约 19 GB，速度快） |
| open-webui | 8080 | 客户直接聊天 / 文档问答 |
| postgres / redis | 内部 | 数据只在本机 |

AI 路由（`.env`）：V64 上 `LLM_DEFAULT_PROVIDER=local`、`LLM_PII_PROVIDER=local`——**客户数据不出机器**。要用中国模型做非敏感批量任务时，填 `CN_LLM_*` 并把 `LLM_DEFAULT_PROVIDER` 改为 `cn`。

## 日常
- 升级：`cd /opt/jianpanerp && git pull && docker compose -f docker-compose.v64.yml up -d --build`
- 换模型：`.env` 的 `LOCAL_LLM_MODEL`，然后 `docker compose -f docker-compose.v64.yml exec ollama ollama pull <model>` 并重启 api-core
- 备份：`deploy/v64/backup.sh`（建议 cron 每天 3:00），恢复 `gunzip -c db-日期.sql.gz | docker compose exec -T postgres psql -U erp japan_erp`
- 日志：`docker compose -f docker-compose.v64.yml logs -f api-core`

## 把 japanerp.com 从 Windows 切到 V64
Lightsail 上 `deploy/lightsail/nginx/app.conf` 两个 upstream 的 IP 改成 V64 的 Tailscale IP，`nginx -t && nginx -s reload`。

## 模型选择（64 GB HBM2）
| 模型 | 显存 | 用途 |
|---|---|---|
| `qwen3:30b-a3b`（默认） | ~19 GB Q4 / ~33 GB Q8 | 客服草稿、翻译、日报，速度快，多人并发 |
| `qwen3:32b` | ~20 GB Q4 | 质量更高、慢 |
| `qwen2.5vl:32b` | ~22 GB | 图片理解（商品图 / 发票 OCR） |
Volta 不支持 FP8，只用 GGUF 量化。
