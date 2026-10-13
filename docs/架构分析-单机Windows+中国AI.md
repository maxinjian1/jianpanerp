# ANET 四店铺 AI 运营系统 — 单机 Windows + 中国模型 API 架构分析

> 前提：一台 Windows 电脑跑全部本地数据与服务；AI 推理走中国模型 API（阿里云百炼 Qwen / DeepSeek / Kimi 等）。
> 对照《ANET 四店铺 AI 运营系统》设计稿与当前 `jianpanerp` 仓库，分析差距与所需架构。

---

## 1. 现状盘点（仓库已有什么）

| 层 | 已有 | 说明 |
|---|---|---|
| 后端 `apps/api-core` (NestJS) | auth / tenants / products / orders / inventory / logistics / amazon / rakuten / market-research / ai | 约 3,600 行模块代码；SaaS 多租户骨架；Amazon SP-API 与楽天 RMS 有基础 service |
| AI 服务 `apps/ai-service` (FastAPI) | Prophet 销量预测、补货建议 | **没有任何 LLM 调用**，只有统计模型 |
| 数据库 `packages/database` (Prisma + PostgreSQL) | Tenant / User / Product / Order / Shipment / Warehouse / Inventory / MarketplaceCredential / ForecastResult / AuditLog 等 | 没有「一份主数据 × 四渠道映射」的 PIM 表，没有内容草稿、客服收件箱、LLM 审计表 |
| 前端 `apps/web-admin` / `apps/web-client` (Next.js) | SaaS 后台 + 卖家 ERP 界面 | 没有「待办收件箱」人机确认页 |
| 启动脚本 `start-*.sh` | macOS（brew services） | **Windows 上不能直接用** |
| 配置 `env.example.txt` | Postgres / Redis / JWT / Amazon / Rakuten / Stripe / `AI_SERVICE_URL` / `ENCRYPTION_KEY` | 没有任何中国模型 API 的配置项 |

结论：仓库是一个 **OMS/WMS 骨架**，设计稿里真正省人力的三块——内容生产、客服草稿、日报预警——目前 **0% 实现**；Yahoo 与 Shopify 渠道也缺失。

---

## 2. 设计稿假设 vs. 你的实际条件

| 设计稿假设 | 你的条件 | 影响 |
|---|---|---|
| 本地 ANET V64 跑 Qwen3.5-35B / Whisper / Wan 2.x | 一台 Windows 电脑（GPU 未知） | 35B 模型跑不动；「含个人信息任务走本地大模型」这条路要改 |
| n8n 自托管在 V64 / NAS | 单机 | n8n 可以装，但多一套运行时；建议核心同步用代码内队列，n8n 只做可选 |
| 中国 API 用于非敏感批量任务 | 相同 | 可直接采用，但要解决 **出境合规** 与 **网络稳定性** |
| 4 平台 API 接入 | 仓库只有 Amazon + 楽天 | 需补 Yahoo!ショッピング、Shopify |

**核心改动：把「本地大模型处理 PII」改成「网关内脱敏（假名化）→ 中国 API → 本地还原」。**
这样一台没有强 GPU 的 Windows 也能处理客服/订单任务，且顾客姓名、地址、电话永远不离开本机。
如果电脑有 ≥12GB 显存的 GPU，可以再加 Ollama + Qwen3-8B 作为「PII 任务本地兜底」，但这是加分项，不是必须。

---

## 3. 目标架构（单机 Windows 版）

```
┌───────────────────────────── Windows 主机 ─────────────────────────────┐
│                                                                        │
│  Docker Desktop (WSL2) 或 原生进程                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌───────────────────────┐  │
│  │ web-admin│ │web-client│ │  api-core    │ │  worker (BullMQ)      │  │
│  │  :3001   │ │  :3000   │ │  NestJS :4000│ │  定时拉单/同步/日报    │  │
│  └──────────┘ └──────────┘ └──────┬───────┘ └───────────┬───────────┘  │
│                                   │                     │              │
│                 ┌─────────────────▼─────────────────────▼───────────┐  │
│                 │               AI Gateway（新模块）                   │  │
│                 │  1. 任务分级 (public / internal / pii)              │  │
│                 │  2. PII 检测 + 假名化  (姓名→<P1>, 地址→<A1>…)      │  │
│                 │  3. Provider 路由  Qwen → DeepSeek → Kimi → Ollama  │  │
│                 │  4. 还原 + 审计日志 + Token 计费                     │  │
│                 └───────┬──────────────────────────┬────────────────┘  │
│                         │ 仅脱敏/非敏感数据           │ (可选) 本地       │
│  ┌──────────┐ ┌─────────┼──────────┐  ┌────────────▼──────────────┐   │
│  │PostgreSQL│ │ Redis   │          │  │ Ollama + Qwen3-8B (GPU)    │   │
│  │ 本地数据  │ │ 队列/缓存│          │  └───────────────────────────┘   │
│  └──────────┘ └─────────┘          │                                   │
│  ┌──────────────────────┐          │  ┌───────────────────────────┐   │
│  │ Playwright RPA Worker │          │  │ ai-service (FastAPI)       │   │
│  │ R-Messe/Yahoo问询/    │          │  │ Prophet 预测 (保留)        │   │
│  │ Request a Review      │          │  └───────────────────────────┘   │
│  └──────────────────────┘          │                                   │
└────────────────────────────────────┼───────────────────────────────────┘
                                     │ HTTPS
          ┌──────────────────────────▼──────────────────────────┐
          │  中国模型 API                                         │
          │  阿里云百炼 (Qwen3 / Qwen-VL / 万相 / CosyVoice)       │
          │  备用：DeepSeek / Kimi                                │
          └─────────────────────────────────────────────────────┘
          ┌─────────────────────────────────────────────────────┐
          │  四平台 API：Amazon SP-API · 楽天 RMS · Yahoo · Shopify│
          └─────────────────────────────────────────────────────┘
```

---

## 4. 还需要补什么（按优先级）

### P0 — 没有这些系统跑不起来

| # | 缺口 | 做法 | 落在仓库哪里 |
|---|---|---|---|
| 1 | **Windows 运行环境** | `docker-compose.yml`（postgres / redis / api-core / ai-service / web / worker），`start.ps1` 替代 brew 脚本；Docker 容器 `restart: always` 实现开机自启 | 根目录 |
| 2 | **AI Gateway 模块** | NestJS 新模块 `modules/llm-gateway`：统一 `chat()/vision()/embed()` 接口；Provider 适配器用百炼的 OpenAI 兼容端点（`/compatible-mode/v1`），切换 DeepSeek/Kimi 只换 base_url + key | `apps/api-core/src/modules/llm-gateway` |
| 3 | **PII 分级与假名化** | 任务携带 `dataClass: 'public' \| 'internal' \| 'pii'`；`pii` 类在发送前用正则 + 词典替换姓名/地址/电话/邮箱/订单号为占位符，映射存 Redis（TTL 1h），响应回来后还原；禁止 `pii` 任务直接出境 | 同上 `pii-masker.ts` |
| 4 | **LLM 审计表** | Prisma 新增 `LlmRequestLog(provider, model, dataClass, promptTokens, completionTokens, costJpy, maskedFields, taskType, tenantId, createdAt)` | `packages/database/prisma/schema.prisma` |
| 5 | **PIM 渠道映射表** | `ProductChannelListing(productId, channel[AMAZON/RAKUTEN/YAHOO/SHOPIFY], externalId, title, description(HTML), bulletPoints, price, stock, status, lastSyncedAt, lastError)`；`Product` 保留中文主数据 | schema.prisma |
| 6 | **中国 API 配置项** | `DASHSCOPE_API_KEY`, `DASHSCOPE_BASE_URL`, `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `LLM_DEFAULT_PROVIDER`, `LLM_PII_PROVIDER`(=ollama 或 masked-dashscope) | `env.example.txt` |

### P1 — 设计稿里"省时间"的核心能力

| # | 缺口 | 做法 |
|---|---|---|
| 7 | **内容生产流水线** | `ContentDraft` 表 + `content.service`：输入 SKU 主数据 → 一次调用生成 4 渠道文案（JSON schema 输出）→ 合规词库检查（景表法/药机法/Amazon 禁用词，存 `ComplianceRule` 表）→ 待审核 |
| 8 | **待办收件箱（人机确认）** | 统一 `Draft` 表（type: listing / customer_reply / review_reply / restock_email / ad_change；status: pending / approved / sent / rejected）+ web-client 一个页面：看 → 改 → 点发送。**客服回复只能从这里人工点击发出**，满足 Amazon/楽天规则 |
| 9 | **任务队列与定时任务** | BullMQ（Redis 已在 env 里）：每 15 分钟拉四店订单、每天 8:00 日报、每小时同步库存、每日竞品抓取。单机不建议再上 n8n；如果想要可视化编排再加 |
| 10 | **Yahoo / Shopify 渠道模块** | 仿 `amazon` / `rakuten` 模块结构，抽一个 `ChannelAdapter` 接口（`pullOrders / pushListing / updateStock / updatePrice`），四个实现 |
| 11 | **通知** | ⚠ LINE Notify 已于 2025 年 3 月停服，设计稿需改为 **LINE Messaging API** 或 Slack Webhook / 邮件 |
| 12 | **日报生成** | 定时任务汇总四店销售/广告/库存/差评 → Gateway (`public` 级，不含个人信息) → 一段话 + 表 → 推送 |

### P2 — 媒体与 RPA

| # | 缺口 | 做法 |
|---|---|---|
| 13 | **RPA Worker** | Playwright 独立进程（Windows 原生，非 Docker，便于有头浏览器 + 持久化登录态），每店独立 profile；只做读取与「替人点按钮」 |
| 14 | **图像/视频/配音** | 万相 (图生视频)、Qwen-Image、CosyVoice 走 Gateway 的 `media` 通道；本地 `ffmpeg` 合成字幕/封面；文件存本地目录 + 定期备份（单机不必上 MinIO） |
| 15 | **本地模型兜底（可选）** | 有 GPU：Ollama + `qwen3:8b`，Gateway 把 `pii` 任务路由到它；无 GPU：维持假名化方案 |

### P3 — 单机运维（容易被忽略，但一台电脑全靠它）

| 项 | 做法 |
|---|---|
| 备份 | 每晚 `pg_dump` → NAS/OneDrive/S3，保留 30 天；`.env` 与 Playwright 登录态一起备份 |
| 断电 | UPS；Docker `restart: always`；Windows 自动登录 + 任务计划启动 Docker Desktop |
| 远程访问 | Tailscale（零配置、不开公网端口），手机上也能审待办收件箱 |
| 安全 | Windows 防火墙只开本机/Tailscale；`.env` 不入 git；数据库密码/API Key 用 Windows Credential Manager 或 `.env` 权限限制 |
| 监控 | 队列失败告警（BullMQ failed → LINE/Slack）；每日 Token 费用汇总写入日报 |
| 硬件建议 | 32GB 内存、NVMe SSD；若要本地模型：RTX 4070 12GB 起（Qwen3-8B Q4）；不跑本地模型则无 GPU 要求 |

---

## 5. 合规要点（APPI × 中国 API）

1. **假名化不等于匿名化**：APPI 下假名加工信息仍受限制，但 **不出境的映射表 + 出境的仅占位符文本** 属于可接受做法；隐私政策要写明「利用 AI 服务处理」。
2. **百炼国际站 vs 国内站**：阿里云 Model Studio 国际站节点在新加坡（`dashscope-intl.aliyuncs.com`），从日本访问延迟更低、且属"新加坡"而非"中国"出境目的地，审计上更好交代；国内站价格略低。网关里做成可配置。
3. **审计日志必须有**：谁、何时、哪类数据、发给哪个 Provider、脱敏了哪些字段——`LlmRequestLog` 就是为此设计的。
4. **客服消息不自动发送**：Amazon Messaging / 楽天 R-Messe / Yahoo 问询一律 AI 起草 → 人工点击。

---

## 6. 建议的实施顺序（与设计稿 6 周对齐）

| 周 | 目标 | 对应缺口 |
|---|---|---|
| 1 | Windows 跑起来：docker-compose + start.ps1 + Prisma 迁移（PIM 映射表、审计表） | #1 #4 #5 #6 |
| 2 | AI Gateway + 假名化 + 审计；用 Qwen 跑通「一个 SKU → 四渠道文案」 | #2 #3 #7 |
| 3 | BullMQ 定时任务：四店拉单（先 Amazon/楽天）、库存同步、日报推送（LINE Messaging API） | #9 #11 #12 |
| 4 | 待办收件箱页面；客服问询分类 + 草稿（API 可读的部分）；差评预警 | #8 |
| 5 | Yahoo / Shopify 适配器；RPA Worker（R-Messe / Yahoo 问询读取） | #10 #13 |
| 6 | 媒体流水线（脚本 → 万相 → CosyVoice → ffmpeg）；全流程演练 + 备份/UPS/Tailscale | #14 #15 P3 |

---

## 7. 一句话总结

你的仓库已有 OMS/WMS 骨架，缺的是 **「AI 网关 + 脱敏」「PIM 四渠道映射」「待办收件箱」「队列调度」「Windows 运行环境」** 五件事；
把设计稿里的"本地 V64 大模型"换成"网关内假名化 + 中国 API（可选本地小模型兜底）"，一台 Windows 电脑就能承载整套系统。
