# jianpanerp — 项目记忆（每个 Claude 会话自动加载）

> 这是跨会话的持久记忆。做出新的架构决定、接入新环境、改变工作方式时，**更新本文件**并提交。
> 不要在这里写任何密钥、密码、Token、IP 以外的敏感信息。

## 项目是什么
ANET（アネット株式会社）四店铺 AI 运营系统：Amazon JP / 楽天 / Yahoo!ショッピング / Shopify 统一 Hub。
Monorepo：`apps/api-core`(NestJS :4000) · `apps/web-client`(Next :3000) · `apps/web-admin`(Next :3001) · `apps/ai-service`(FastAPI :8000) · `packages/database`(Prisma/PostgreSQL)。

设计稿与分析：`docs/架构分析-单机Windows+中国AI.md`（缺口清单 + 6 周计划，优先级 P0→P3）。

## 核心架构决定（已定，不要重新讨论）
1. **本地数据在 Windows 电脑**，PostgreSQL/Redis 用 Docker（`docker-compose.yml`），应用原生运行（`start-windows.ps1`）。
2. **AI 走中国模型 API**（阿里云百炼国际站优先，备用 DeepSeek/Kimi），通过统一 AI Gateway（`modules/llm-gateway`，待实现）。
3. **顾客个人信息不出境**：Gateway 内假名化（姓名→`<P1>` 等，映射存本地 Redis）→ API → 本地还原。有 GPU 时可选 Ollama+Qwen3-8B 纯本地。
4. 客服消息 **只能 AI 起草、人工点击发送**（Amazon/楽天规则）。
5. 通知用 LINE Messaging API / Slack，**不用 LINE Notify**（已停服）。
6. 单机不上 n8n，调度用 BullMQ。

## 环境地图
| 环境 | 角色 | 怎么连 |
|---|---|---|
| 云端 Claude 会话（本仓库容器） | 写代码、提交、推送到 `claude/*` 分支 | 出站只有 HTTPS，**SSH 22 端口被封**，不能直连服务器 |
| Windows 电脑（`C:\Users\maxinjian\source\...`） | 跑本地数据与应用；也是 **SSH 跳板** | 用户在该目录运行 `claude remote-control`，云端会话用 `send_message` 发任务 |
| AWS Lightsail（ap-northeast-1 东京） | 云端节点（角色待定：备份/公网入口/部署） | 从 Windows 用内置 OpenSSH：`ssh -i <LightsailDefaultKey-ap-northeast-1.pem> <user>@<IP>`；密钥**不入 git**（`.gitignore` 已含 `*.pem`） |
| AWS API | 需要 `AWS_ACCESS_KEY_ID/SECRET/DEFAULT_REGION` 放在云环境 Network secrets | 容器自带的 AWS 变量是内部用的，无效 |

## 工作流约定
- 开发分支由会话指定（当前 `claude/brave-dirac-s6orrc`），不直接推 main。
- 新建环境相关文件（脚本/compose/部署文档）放仓库根或 `docs/`，Windows 侧执行。
- 密钥只放 `.env` / Windows 凭据管理器 / 云环境 secrets，聊天里不贴。
- 每次会话结束前：把新的决定与进度写进本文件「进度日志」。

## 进度日志
- 2026-10-13：完成架构分析；新增 docker-compose.yml、start-windows.ps1、env.example 中国模型配置、docs/Windows部署指南.md；Windows remote-control 会话已建立并下发环境搭建任务；收到 Lightsail 东京密钥（待 IP 与用途）。
