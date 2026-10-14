# jianpanerp — 项目记忆（每个 Claude 会话自动加载）

> 这是跨会话的持久记忆。做出新的架构决定、接入新环境、改变工作方式时，**更新本文件**并提交。
> 不要在这里写任何密钥、密码、Token、IP 以外的敏感信息。

## 项目是什么
ANET（アネット株式会社）四店铺 AI 运营系统：Amazon JP / 楽天 / Yahoo!ショッピング / Shopify 统一 Hub。
Monorepo：`apps/api-core`(NestJS :4000) · `apps/web-client`(Next :3000) · `apps/web-admin`(Next :3001) · `apps/ai-service`(FastAPI :8000) · `packages/database`(Prisma/PostgreSQL)。

设计稿与分析：`docs/架构分析-单机Windows+中国AI.md`（缺口清单 + 6 周计划，优先级 P0→P3）。

## 三层拓扑（2026-10-14 确认，以此为准）
| 层 | 机器 | 角色 | 数据级别 |
|---|---|---|---|
| **展示层** | AWS Lightsail 东京 `13.158.114.4`，域名 **japanerp.com** | 对外官网 + 演示（web-client 的营销页：features/pricing/case-studies/company/register…） | 无客户数据，只有演示租户 |
| **产品层（交付给客户）** | **ANET V64**（Ubuntu 24.04 + CUDA 12.x，4×Tesla V100 16GB NVLink，64GB HBM2，600W） | 真正的运行主机：ERP Hub + AI Gateway + 本地模型（Qwen3.5-35B-A3B Q8，约 90–130 tok/s）+ Whisper + Open WebUI。**客户从 Mac 远程使用** | 全部客户数据、订单、客服、聊天都在这台机器上 |
| **开发/模拟层** | 用户的 Windows 电脑 | **模拟 V64** 做开发测试；没有 V100 时本地模型用 Ollama 小模型或假名化+中国 API 代替 | 测试数据 |

V64 产品规格与商业计划见用户上传的《ANET V64 16GB 深度分析》；仓库里的部署脚本以 **Ubuntu 为目标**，Windows 脚本只是开发便利。

## 核心架构决定（已定，不要重新讨论）
1. **AI 两条路**：不重要/非敏感的批量任务（文案、竞品分析、日报、视频脚本）→ **中国模型 API**（百炼国际站优先，备用 DeepSeek/Kimi）；**客服信息、客户聊天、订单明细等不能出海的业务 → V64 本地模型**（vLLM/llama.cpp Volta 构建，Qwen3.5-35B-A3B）。路由在统一 AI Gateway（`apps/api-core/src/modules/llm-gateway`，**已实现**）内按 `dataClass` 决定：`public/internal` → `LLM_DEFAULT_PROVIDER`（cn），`pii` → `LLM_PII_PROVIDER`（local；或 `masked-cn` 假名化后出境）。每次调用写 `LlmRequestLog` 审计表。
2. 开发机（Windows，无 V100）跑同一套代码：`LLM_PII_PROVIDER` 切到 `ollama`（小模型）或 `masked-dashscope`（假名化后出境，仅限测试数据）。
3. 客服消息 **只能 AI 起草、人工点击发送**（Amazon/楽天规则）。
4. 通知用 LINE Messaging API / Slack，**不用 LINE Notify**（已停服）。
5. 调度用 BullMQ（Redis），不上 n8n。
6. **远程网络统一用 Tailscale**（2026-10-14 用户决定）：Windows / Lightsail / V64 / 用户 Mac / 客户 Mac 都加入同一 tailnet，不开公网端口；V64 镜像目标：客户不敲命令——全部服务 Docker Compose + Web 管理面板 + 一键更新/恢复；Mac 远程通过 Tailscale 访问 `http://v64:3000`（ERP）与 `:8080`（Open WebUI）。

## 环境地图
| 环境 | 怎么连 |
|---|---|
| 云端 Claude 会话（本仓库容器） | 写代码、提交、推送到 `claude/*` 分支。出站**只有 HTTPS 且走域名白名单**：到 `13.158.114.4` 的 22/80/443/7000/7001 全部被拦（`host_not_allowed`），**不能直连 Lightsail**，需用户把该 IP / japanerp.com 加入云环境 Allowed domains |
| Windows 电脑（`C:\Users\maxinjian\source\jianpanerp`，Win11 Enterprise，**RTX 4080 16GB**，64GB RAM，Node 24，Python 3.13，Tailscale IP **100.120.180.90**） | 用户在该目录运行 `claude remote-control`（会话 `session_0168qwpzHxHPGXq82mzARLLm`），云端会话用 `send_message` 发任务。**也是到 Lightsail / V64 的 SSH 跳板**（Windows 内置 OpenSSH） |
| AWS Lightsail 东京 `13.158.114.4` | 从 Windows：`ssh -i C:\Users\maxinjian\.ssh\lightsail-tokyo.pem <user>@13.158.114.4`；防火墙已开 22、7000–7001（对全网）。密钥**不入 git**（`.gitignore` 含 `*.pem`） |
| **中国 AI 网关**（用户自建，OpenAI 兼容）| `http://100.82.2.101:8199/v1`，模型 `GLM-5.3-Flash`（1M 上下文、32K 输出、视觉、JSON、`reasoning_effort` low/high/max）。**在 tailnet 内**（100.82.x），云端容器到不了，只能从 Windows/Mac/V64 调。Key 放 `.env` 的 `CN_LLM_API_KEY` |
| AWS API | 需要 `AWS_ACCESS_KEY_ID/SECRET/DEFAULT_REGION=ap-northeast-1` 放在云环境 Network secrets；容器自带的 AWS 变量是内部用的，无效 |
| 用户 MacBook Air | Tailscale IP 100.82.52.75（同一 tailnet） |
| V64 实机 | 待到手；镜像基于 Ubuntu 24.04，用 `docker-compose.v64.yml`（待建） |

## Windows remote-control 会话的限制（实测）
- 它**不能**给云端会话回消息（没有 send_message 工具）→ 云端会话用 `list_events` 读它的 assistant 文本来获取结果。
- 它的权限分类器会拦：`git clone`（需用户在其提示符前加 `!` 自己跑）、搜索密钥文件、安装需管理员权限的软件（Docker Desktop/WSL 需用户口头批准）。
- 给它下任务时：一次一件、附带用户需要自己做的命令。

## 工作流约定
- 开发分支由会话指定（当前 `claude/brave-dirac-s6orrc`），不直接推 main。
- 新建环境相关文件（脚本/compose/部署文档）放仓库根或 `docs/`，Windows 侧执行。
- 密钥只放 `.env` / Windows 凭据管理器 / 云环境 secrets，聊天里不贴。
- 每次会话结束前：把新的决定与进度写进本文件「进度日志」。

## 进度日志
- 2026-10-14：实现 llm-gateway 模块（Provider 路由 + PII 假名化 + 审计表 LlmRequestLog + 迁移）；接入用户的中国 GLM 网关；`scripts/test-llm-gateway.mjs` 可在 tailnet 内直接测连通。
- 2026-10-14：Windows 已装 Tailscale 并登录（100.120.180.90）；Windows 无 Docker、WSL 无发行版、有 RTX 4080 → 模拟 V64 可用 Ollama 跑 Qwen3-14B。
- 2026-10-14：决定用 Tailscale；已下发 Windows + Lightsail 安装任务给 Windows 会话。
- 2026-10-14：确认三层拓扑（Lightsail=japanerp.com 展示，V64=产品实机，Windows=模拟）；收到 V64 规格书。
- 2026-10-13：完成架构分析；新增 docker-compose.yml、start-windows.ps1、env.example 中国模型配置、docs/Windows部署指南.md；Windows remote-control 会话已建立并下发环境搭建任务；收到 Lightsail 东京密钥（待 IP 与用途）。
