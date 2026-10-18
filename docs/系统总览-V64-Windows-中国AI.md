# ANET 系统总览：V64 / Windows / 中国 AI（2026-10-18）

> 一句话：**V64 实机还没到，目前什么都没装在 V64 上**。V64 要跑的整套软件已经写好、打包成「一条命令安装」，现在全部由你的 **Windows 电脑代替 V64 运行**。中国 AI 用的是朋友的 **6kpro 服务器**。公网入口是 **Lightsail 东京（japanerp.com）**。

---

## 1. 四台机器各干什么

| 机器 | 现状 | 角色 |
|---|---|---|
| **V64**（4×Tesla V100 16GB，64GB 显存，Ubuntu 24.04） | **未到货，未安装** | 将来的正式主机：ERP、AI 网关、本地大模型、聊天界面全在这台 |
| **Windows 电脑**（RTX 4080 16GB，64GB 内存） | **运行中，代替 V64** | 现在所有程序都在这里跑；也负责操作浏览器（Amazon、1688、批发商） |
| **6kpro**（朋友的服务器，中国 AI） | 运行中 | 大批量文字和看图工作：文案、分析、分类、比对 |
| **Lightsail 东京** | 运行中 | 只做公网入口：japanerp.com 转发到 Windows，Windows 关机时显示静态页 |

所有机器通过 **Tailscale** 组成私有网络，不对公网开放端口。

---

## 2. V64 到货后会安装什么（已经写好）

安装方式：V64 上运行一条命令，脚本自动完成全部安装。

```bash
curl -fsSL https://raw.githubusercontent.com/maxinjian1/jianpanerp/main/deploy/v64/install-v64.sh | sudo bash
```

脚本会依次安装：NVIDIA 驱动 550 → Docker → NVIDIA 容器工具 → Tailscale → 下载代码 → 启动全部服务 → 下载本地模型。第一次装驱动需要重启一次，重启后再跑同一条命令即可。

### 2.1 V64 上的服务

| 服务 | 端口 | 功能 |
|---|---|---|
| **ERP 前端** web-client | 3000 | 从 Mac 浏览器打开的管理界面 |
| **ERP 后端** api-core | 4000 | 订单、商品、库存、各平台对接、AI 网关；启动时自动升级数据库 |
| **预测服务** ai-service | 8000 | 销量预测（Prophet） |
| **本地大模型** Ollama | 11434 | 4 张 V100 全部挂载，默认 `qwen3:30b-a3b` |
| **AI 聊天界面** Open WebUI | 8080 | 像 ChatGPT 一样直接聊天、上传文档问答 |
| **数据库** PostgreSQL 15 | 内部 | 所有业务数据 |
| **队列** Redis 7 | 内部 | 定时任务和任务排队（BullMQ） |

客户在 Mac 上用：`http://v64:3000`（ERP）和 `http://v64:8080`（AI 聊天）。

### 2.2 V64 可选的本地模型（64GB 显存）

| 模型 | 显存 | 适合 |
|---|---|---|
| `qwen3:30b-a3b`（默认） | 约 19GB（Q4）/ 33GB（Q8） | 客服草稿、翻译、日报，快，可多人同时用 |
| `qwen3:32b` | 约 20GB | 质量更高，较慢 |
| `qwen2.5vl:32b` | 约 22GB | 看图：商品图、发票识别 |

V100 不支持 FP8，只能用 GGUF 量化格式。

### 2.3 日常维护

- 一键升级：`git pull` + `docker compose up -d --build`
- 每日备份：`deploy/v64/backup.sh`（建议每天 3:00）
- 把 japanerp.com 从 Windows 切到 V64：改 Lightsail 上 nginx 的两个转发地址即可

---

## 3. ERP 后端有哪些功能（api-core 模块）

| 模块 | 功能 |
|---|---|
| shopify | 商品、订单、库存同步（anetmc.com） |
| amazon | Amazon 日本对接（SP-API 预留） |
| rakuten | 楽天对接 |
| dropship | 批发商 kuajingyifan 代发闭环：采集、上架、下单 |
| orders / products / inventory / logistics | 订单、商品、库存、物流 |
| market-research | 市场调研 |
| llm-gateway | **统一 AI 网关**：按数据类型选择用中国 AI、本地模型还是其他，每次调用都记审计日志 |
| ai | AI 功能入口（翻译、文案、客服草稿） |
| tenants / auth / health | 多租户、登录权限、健康检查 |

规则：**客服消息只能 AI 起草，必须人工点发送**（Amazon / 楽天要求）。通知走 LINE Messaging API / Slack。

---

## 4. Windows 电脑现在装了什么、在跑什么

### 4.1 基础环境

| 软件 | 用途 |
|---|---|
| Node 24、Python 3.13 | 运行所有程序 |
| Docker Desktop + WSL Ubuntu | 跑数据库、队列、Ollama 容器 |
| Tailscale（100.120.180.90） | 私有网络，连 6kpro、Lightsail、你的 Mac |
| Google Chrome + Playwright | 自动操作浏览器 |
| Ollama（`qwen3:14b`、`qwen2.5:7b`） | 本地小模型，代替 V64 的大模型 |
| Claude Code（Opus 5.5，remote-control） | 接收云端指令，执行脚本 |
| claude-mem | 已装插件，提供方选择未完成（暂停） |

### 4.2 常驻服务（模拟 V64）

| 服务 | 端口 |
|---|---|
| ERP 前端 | 3000 |
| ERP 后端 + AI 网关 | 4000 |
| 预测服务 | 8000 |
| **图片服务 image-service**（RTX 4080，FLUX.1 生成图、rembg 抠图） | 8010 |
| PostgreSQL / Redis / Ollama | 5432 / 6379 / 11434 |

启动方式：`start-windows.ps1`（会等 Docker 就绪后再启动）。

### 4.3 浏览器自动化（专用 Chrome，你本人登录，程序代操作）

| 窗口 | 端口 | 用途 |
|---|---|---|
| Seller Central | 9222 | Amazon 只读审计、报告下载（修改类操作暂停中） |
| 1688 | 9223 | 找同款、联系供应商 |

账号密码和验证码只由你本人输入，程序不保存。

### 4.4 业务工具（`tools/` 目录）

| 工具 | 功能 | 状态 |
|---|---|---|
| kjyf-scraper | 采集批发商 1184 件商品 | 已完成 |
| dropship | 上架到 Shopify | 已完成，在售 1181 件 |
| product-images | 商品图重做 8 张 / 恢复原图 | **已全部恢复原图**；以后改图需逐款审核 |
| market-research | 店内商品打分、SEO、楽天比价、目录清理 | 已完成 |
| amazon-listing | Amazon 上架文件生成、店铺审计与 listing 优化 | 审计运行中，修改暂停 |
| amazon-research | Amazon 热卖榜调研、分析为什么好卖 | 运行中 |
| sourcing-1688 | 1688 找同款、供应商打分、发问询（微信 215914546） | 等调研结果后自动开始 |
| brand-assets | 店铺装饰图、商品卡片、App 图标 | 已完成 |

### 4.5 手机 App「安い」

`apps/mobile-yasui`（iOS + Android，Expo），数据直接连 Shopify，不依赖 Windows 或 V64。iPhone 已用 Expo Go 跑通，等 Apple 开发者账号审核后打包上架。

---

## 5. 中国 AI（6kpro）

| 项目 | 内容 |
|---|---|
| 地址 | `http://100.82.2.101:8199/v1`（Tailscale 共享，只开放这一个端口） |
| 模型 | GLM-5.3-Flash（别名 glm53 / dsv41 是同一个） |
| 能力 | 100 万字上下文、3.2 万字输出、能看图、能输出 JSON |
| 硬件 | RTX PRO 6000 96GB + 4×CMP 170HX，单请求约 75 字/秒，4 并发约 238 字/秒 |
| 费用 | 不消耗 Claude 额度 |
| 用途 | 商品文案、SEO、商品图分类、热卖品分析、1688 同款看图比对、店铺审计 |
| 无 | 图像生成模型（计划另一台双 4090 机器部署 Qwen-Image） |

切换模型只需改 Windows `.env` 里的 `CN_LLM_MODEL`；看图可单独用 `CN_LLM_VISION_MODEL`。

---

## 6. 分工一览

| 工作 | 谁做 |
|---|---|
| 写程序、安排任务、检查结果、给你汇报 | 云端 Claude |
| 执行脚本、操作浏览器 | Windows 上的 Claude + 后台程序 |
| 大批量文字分析、看图比对 | 6kpro 中国 AI |
| 店铺装饰图生成、商品抠图 | Windows RTX 4080 |
| 将来客户数据、客服、本地聊天 | V64 本地模型（到货后） |
| 公网访问 japanerp.com | Lightsail 转发 |

**规则变更**：2026-10-18 已删除「数据不出境」强制规则。本地模型和中国 AI 都可选用，不再强制客服或订单数据只走本地。Amazon 和楽天平台自己对买家个人信息的规定仍然有效。

---

## 7. V64 到货后要做的事

1. 装好 Ubuntu 24.04，接网线。
2. 运行上面的一条安装命令，按提示重启一次，再运行一次。
3. 用 Tailscale 链接授权，加入网络。
4. 把 Windows 上的数据库导出、导入 V64；或者直接在 V64 上重新同步 Shopify。
5. 改 Lightsail 的转发地址，让 japanerp.com 指向 V64。
6. Windows 退回开发测试用。
