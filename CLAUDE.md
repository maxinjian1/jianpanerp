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
| **展示层** | AWS Lightsail 东京 `13.158.114.4`，域名 **japanerp.com** | **只做公网入口（2026-10-15 已上线）**：haproxy→nginx 容器 `proxy_pass` 到 Windows（Tailscale `100.120.180.90`）:3000/:4000，Windows 不在线时回退 `web-static/` 静态页。配置源在 `deploy/lightsail/`。**Lightsail 上不跑 Node、不编译**（2026-10-14 用户决定：412MiB 内存不升级） | 无数据落在 Lightsail |
| **产品层（交付给客户）** | **ANET V64**（Ubuntu 24.04 + CUDA 12.x，4×Tesla V100 16GB NVLink，64GB HBM2，600W） | 真正的运行主机：ERP Hub + AI Gateway + 本地模型（Qwen3.5-35B-A3B Q8，约 90–130 tok/s）+ Whisper + Open WebUI。**客户从 Mac 远程使用** | 全部客户数据、订单、客服、聊天都在这台机器上 |
| **开发/模拟层** | 用户的 Windows 电脑 | **模拟 V64** 做开发测试；没有 V100 时本地模型用 Ollama 小模型或假名化+中国 API 代替 | 测试数据 |

V64 产品规格与商业计划见用户上传的《ANET V64 16GB 深度分析》；仓库里的部署脚本以 **Ubuntu 为目标**，Windows 脚本只是开发便利。

## 核心架构决定（已定，不要重新讨论）
1. **AI 两条路**：不重要/非敏感的批量任务（文案、竞品分析、日报、视频脚本、图片重制）→ **中国模型 = 6kpro 服务器**（用户决定不用阿里云/百炼/DeepSeek 等公有云，缺模型找 6kpro 加）；**客服信息、客户聊天、订单明细等不能出海的业务 → V64 本地模型**（vLLM/llama.cpp Volta 构建，Qwen3.5-35B-A3B）。路由在统一 AI Gateway（`apps/api-core/src/modules/llm-gateway`，**已实现**）内按 `dataClass` 决定：`public/internal` → `LLM_DEFAULT_PROVIDER`（cn），`pii` → `LLM_PII_PROVIDER`（local；或 `masked-cn` 假名化后出境）。每次调用写 `LlmRequestLog` 审计表。
2. 开发机（Windows，无 V100）跑同一套代码：`LLM_PII_PROVIDER` 切到 `ollama`（小模型）或 `masked-dashscope`（假名化后出境，仅限测试数据）。
3. 客服消息 **只能 AI 起草、人工点击发送**（Amazon/楽天规则）。
4. 通知用 LINE Messaging API / Slack，**不用 LINE Notify**（已停服）。
5. 调度用 BullMQ（Redis），不上 n8n。
6. **远程网络统一用 Tailscale**（2026-10-14 用户决定）：Windows / Lightsail / V64 / 用户 Mac / 客户 Mac 都加入同一 tailnet，不开公网端口；V64 镜像目标：客户不敲命令——全部服务 Docker Compose + Web 管理面板 + 一键更新/恢复；Mac 远程通过 Tailscale 访问 `http://v64:3000`（ERP）与 `:8080`（Open WebUI）。

## 环境地图
| 环境 | 怎么连 |
|---|---|
| 云端 Claude 会话（本仓库容器） | 写代码、提交、推送到 `claude/*` 分支。出站**只有 HTTPS 且走域名白名单**：到 `13.158.114.4` 的 22/80/443/7000/7001 全部被拦（`host_not_allowed`），**不能直连 Lightsail**，需用户把该 IP / japanerp.com 加入云环境 Allowed domains |
| Windows 电脑（`C:\Users\maxinjian\source\jianpanerp`，Win11 Enterprise，**RTX 4080 16GB**，64GB RAM，Node 24，Python 3.13，Tailscale IP **100.120.180.90**） | 用户以**管理员 PowerShell** 运行 `claude --dangerously-skip-permissions` 再 `/remote-control`（当前会话 `session_01KwH6arVif5hWUWgB6CEiyA`（2026-10-15 重启）；旧会话 `session_01CBES…`、`session_0168qw…` 已弃用），云端会话用 `send_message` 发任务，分阶段、措辞平实（一次派太多系统级操作会被云端分类器拦）。**也是到 Lightsail / V64 的 SSH 跳板**（Windows 内置 OpenSSH） |
| AWS Lightsail 东京 `13.158.114.4` | **登录用户 `ubuntu`**，`ssh -i C:\Users\maxinjian\.ssh\lightsail-tokyo.pem ubuntu@13.158.114.4`（pem 已放好）。**规格极小：Ubuntu 24.04，2 vCPU，412 MiB 内存（swap 4G），19 GB 盘已用 63%**——跑不了 Next.js build，部署前需升级套餐或改静态导出。已有服务：**haproxy 占 80/443**、**frps 在 7000**（frp 服务端）、7001 空。Tailscale 已装（2026-10-14，待授权）。密钥**不入 git** |
| **中国 LLM 服务器 `6kpro`**（**第三方**，Tailscale 主人 leosma@gmail.com，Debian 12，OpenAI 兼容）| `http://100.82.2.101:8199/v1`，模型 `GLM-5.3-Flash`（1M 上下文、32K 输出、视觉、JSON、`reasoning_effort`）。**2026-10-14 实测：Mac / Windows / 云端全部不可达**——地址是对方 tailnet 的内网 IP，用户的设备不在那个网络里。2026-10-15 对方已 Share 给 maxinjian@gmail.com（管理台「Shared with me」可见，Expiry disabled），**只开放 8199 端口**（ping/其他端口不通属正常）。**2026-10-15 已打通**：之前不通的根因是机主禁用了官方东京 DERP 中继、自建中继不支持跨 tailnet 共享，机主恢复官方中继后 Mac `curl /v1/models` 返回 200。健康检查 `GET /health`。Windows 测通后 `LLM_DEFAULT_PROVIDER=cn`；`LLM_PII_PROVIDER` 保持 `local`。Key 放 `.env` 的 `CN_LLM_API_KEY` |
| AWS API | 需要 `AWS_ACCESS_KEY_ID/SECRET/DEFAULT_REGION=ap-northeast-1` 放在云环境 Network secrets；容器自带的 AWS 变量是内部用的，无效 |
| 用户 MacBook Air | Tailscale IP 100.82.52.75（同一 tailnet） |
| V64 实机 | **暂无，用 Windows 电脑代替**（2026-10-14 用户确认）：本地模型 = Windows 原生 Ollama（RTX 4080，`qwen3:14b`），`LOCAL_LLM_BASE_URL=http://localhost:11434/v1`。真机到手后：Ubuntu 24.04 上 `curl … deploy/v64/install-v64.sh \| sudo bash`（驱动/Docker/toolkit/Tailscale/代码/`docker-compose.v64.yml` 全套 + Ollama `qwen3:30b-a3b` + Open WebUI）。说明见 `deploy/v64/README.md` |

## Windows remote-control 会话的限制（实测）
- 它**不能**给云端会话回消息（没有 send_message 工具）→ 云端会话用 `list_events` 读它的 assistant 文本来获取结果。
- 它的权限分类器会拦：`git clone`（需用户在其提示符前加 `!` 自己跑）、搜索密钥文件、安装需管理员权限的软件（Docker Desktop/WSL 需用户口头批准）。
- 给它下任务时：一次一件、附带用户需要自己做的命令。

## 工作流约定
- 开发分支由会话指定（当前 `claude/brave-dirac-s6orrc`），不直接推 main。
- 新建环境相关文件（脚本/compose/部署文档）放仓库根或 `docs/`，Windows 侧执行。
- 密钥只放 `.env` / Windows 凭据管理器 / 云环境 secrets，聊天里不贴。
- 每次会话结束前：把新的决定与进度写进本文件「进度日志」。

## 新业务线：批发商 → Shopify 代发闭环（2026-10-15 立项，需求见 `docs/需求-Shopify代发闭环.md`）
- Shopify 店：LECOCO ITALY = **`0scqav-e7.myshopify.com`**（anetmc.com，47 商品；完整备份在 `backups/shopify-lecoco-products-2026-10-15.json`，归档操作待用户确认）。
- **Shopify API 接入方式（2026 起）**：后台已不能建旧式自定义应用。走 **Dev Dashboard** 建 App → scopes `read_products, write_products, read_orders, write_orders, write_fulfillments` → 发布版本 → 安装到店 → 得 Client ID / Client secret（无固定 token）。运行时用 client_credentials 换 token（约 24h 有效）：`POST https://0scqav-e7.myshopify.com/admin/oauth/access_token`，body `grant_type=client_credentials&client_id=…&client_secret=…`。`.env`：`SHOPIFY_STORE_DOMAIN` / `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`（secret 由用户亲手填，不经聊天）。
- 批发商 kuajingyifan.com（用户有账号，已授权采集）；云端白名单不含该域，采集/下单都在 Windows 用 Playwright。
- 图片重制需图像模型（GLM-5.3-Flash 不能生图）。**用户决定：不用阿里云/百炼；缺模型让 6kpro（leosma）加**，首选 Qwen-Image-Edit-2509（OpenAI 兼容 `/v1/images/edits`），备选 FLUX.1 Kontext。所有中国侧 AI 只走 6kpro。
- 订单闭环第一阶段：人工一键确认后再去批发商下单付款。

## 进度日志
- 2026-10-15：**中国 LLM（6kpro GLM-5.3-Flash）从 Mac 测通**（200）；Windows 切换 `.env` 到 cn 进行中。
- 2026-10-15：Lightsail 清理与重启**暂缓**（用户要求不搞复杂；Windows 会话也拒绝凭转述在生产机删东西）。
- 2026-10-15：V64 一键部署就绪：`docker-compose.v64.yml` + `deploy/v64/`（Dockerfile ×3、install-v64.sh、backup.sh、README）；web-client 改 standalone 输出、API 地址走 `API_INTERNAL_URL`；本地验证 next/nest 构建通过（容器内无 docker，镜像构建待 V64/Windows 实测）。
- 2026-10-15：**japanerp.com 已切到反代 Windows**（nginx app.conf 替换，SNAT 打通，公网 200 且 x-powered-by Next.js）；证书续期成功至 **2027-01-12**，cron 改为 docker run 形式（`/usr/local/sbin/japanerp-cert-renew.sh`，日志 `/var/log/japanerp-cert-renew.log`）；旧 app.conf 备份为 `conf.d/app.conf.bak.1792023038`（含已移除的 VLESS 路径）。清理脚本 `deploy/lightsail/scripts/cleanup-lightsail.sh` 待用户在 Windows 会话下达执行。
- 2026-10-14：Lightsail 加入 tailnet（100.73.55.42）；用户确认 Cloudflare 账号是自己的；下一步 nginx 反代 Windows + 防火墙放行 Tailscale 网段。
- 2026-10-14：Lightsail 调查完成：旧版 japanerp.com 静态站已在线（nginx 容器 + acme.sh 证书 10/24 到期，DNS Cloudflare 代理）；机器兼作 VPN 跳板。
- 2026-10-14：用户决定官网也在 Windows 跑，Lightsail 仅做反代入口（不升级套餐）。
- 2026-10-14：Windows 三服务全部 200（4000/3000/8000）；WSL Ubuntu 已装；Ollama 0.40.4，qwen3:14b 实测 813 tok/58s（含 thinking，生产应关 thinking）；Lightsail 探明：ubuntu 用户、412MiB 内存、haproxy+frps 已在跑。
- 2026-10-14：Windows Docker Desktop 4.95 装好（需先 takeown 残留目录）；web-client 已在 :3000 跑通；共享包 tsconfig 修复；用户改用管理员 + skip-permissions 的 remote-control 会话，已派发阶段 A/B 任务。
- 2026-10-14：确认 100.82.2.101 是别人的服务器，所有设备不可达；AI 暂全走本地 Ollama，等对方共享/公网地址。
- 2026-10-14：Windows Ollama 0.35 已就绪，`qwen3:14b`(9.3GB) + `qwen2.5:7b` 已拉取，`localhost:11434/v1` 可用；**GLM 网关 100.82.2.101:8199 从 Windows 不通**（不在 tailnet）。
- 2026-10-14：实现 llm-gateway 模块（Provider 路由 + PII 假名化 + 审计表 LlmRequestLog + 迁移）；接入用户的中国 GLM 网关；`scripts/test-llm-gateway.mjs` 可在 tailnet 内直接测连通。
- 2026-10-14：Windows 已装 Tailscale 并登录（100.120.180.90）；Windows 无 Docker、WSL 无发行版、有 RTX 4080 → 模拟 V64 可用 Ollama 跑 Qwen3-14B。
- 2026-10-14：决定用 Tailscale；已下发 Windows + Lightsail 安装任务给 Windows 会话。
- 2026-10-14：确认三层拓扑（Lightsail=japanerp.com 展示，V64=产品实机，Windows=模拟）；收到 V64 规格书。
- 2026-10-13：完成架构分析；新增 docker-compose.yml、start-windows.ps1、env.example 中国模型配置、docs/Windows部署指南.md；Windows remote-control 会话已建立并下发环境搭建任务；收到 Lightsail 东京密钥（待 IP 与用途）。
