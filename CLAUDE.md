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
| **展示层** | AWS Lightsail 东京 `13.158.114.4`，域名 **japanerp.com** | **轻量展示站（2026-10-19 用户定为规则）**：japanerp.com 在 Lightsail 上直接由 nginx 提供**轻量静态展示页**（预先构建好的 HTML/CSS/图片，压缩+缓存），目标是任何人打开都秒开；**不再把首页反代到 Windows/V64**（之前反代 Windows 时 Windows 一停就要等 5s 才回退，很慢）。ERP、API、AI、数据库等**全部后台在 V64 上**（V64 到货前由 Windows 模拟），通过 Tailscale 访问，不经 japanerp.com 首页。静态页在 Windows/云端构建后上传，配置源在 `deploy/lightsail/`。**Lightsail 上不跑 Node、不编译**（412MiB 内存不升级） | 无数据落在 Lightsail |
| **产品层（交付给客户）** | **ANET V64**（Ubuntu 24.04 + CUDA 12.x，4×Tesla V100 16GB NVLink，64GB HBM2，600W） | 真正的运行主机：ERP Hub + AI Gateway + 本地模型（Qwen3.5-35B-A3B Q8，约 90–130 tok/s）+ Whisper + Open WebUI。**客户从 Mac 远程使用** | 全部客户数据、订单、客服、聊天都在这台机器上 |
| **开发/模拟层** | 用户的 Windows 电脑 | **模拟 V64** 做开发测试；没有 V100 时本地模型用 Ollama 小模型或假名化+中国 API 代替 | 测试数据 |

V64 产品规格与商业计划见用户上传的《ANET V64 16GB 深度分析》；仓库里的部署脚本以 **Ubuntu 为目标**，Windows 脚本只是开发便利。

## 核心架构决定（已定，不要重新讨论）
1. **AI 两条路**：不重要/非敏感的批量任务（文案、竞品分析、日报、视频脚本、图片重制）→ **中国模型 = 6kpro 服务器**（用户决定不用阿里云/百炼/DeepSeek 等公有云，缺模型找 6kpro 加）；V64 本地模型（vLLM/llama.cpp Volta 构建，Qwen3.5-35B-A3B）作为可选提供方。**2026-10-18 用户决定删除「数据不出境」规则**：不再强制客服/订单等数据只走本地模型，工作记录、记忆工具（如 claude-mem 云端模式）也可外发。路由仍在统一 AI Gateway（`apps/api-core/src/modules/llm-gateway`，**已实现**）内按 `dataClass` 选择 provider（`LLM_DEFAULT_PROVIDER` / `LLM_PII_PROVIDER` 均为可配置项，不再是强制约束）。每次调用写 `LlmRequestLog` 审计表。
2. 开发机（Windows，无 V100）跑同一套代码：`LLM_PII_PROVIDER` 切到 `ollama`（小模型）或 `masked-dashscope`（假名化后出境，仅限测试数据）。
3. 客服消息 **只能 AI 起草、人工点击发送**（Amazon/楽天规则）。
4. 通知用 LINE Messaging API / Slack，**不用 LINE Notify**（已停服）。
5. 调度用 BullMQ（Redis），不上 n8n。
6. **远程网络统一用 Tailscale**（2026-10-14 用户决定）：Windows / Lightsail / V64 / 用户 Mac / 客户 Mac 都加入同一 tailnet，不开公网端口；V64 镜像目标：客户不敲命令——全部服务 Docker Compose + Web 管理面板 + 一键更新/恢复；Mac 远程通过 Tailscale 访问 `http://v64:3000`（ERP）与 `:8080`（Open WebUI）。
7. **japanerp.com = AWS Lightsail 轻量展示站，后台全部在 V64**（2026-10-19 用户决定）：展示页只做「快速给人看」，静态、轻量、秒开；任何业务功能（ERP/订单/客服/AI/管理后台）不放在 Lightsail，也不让展示页依赖后台在线。

## 当前经营方针（2026-10-29 用户同意，本周起以此为准，优先于下面的工具开发）
用户原话：「我想要的是一个更高效卖出产品的项目，而不是更复杂的系统」。**不再建新系统**，三店同时以销售额为唯一目标，按「先砍再卖、从成交数据反推、单品毛利、评价优先、活动日历、每周一张 KPI 表」执行：
- **Amazon（唯一有成交的渠道，优先）**：90 日 1,304 单集中在内衣・ルームウェア 7 系列；前 30 件子 ASIN（`docs/amazon-fba/top30-fba-plan.md`，首批 FBA 合计 426 件）→ 发 FBA + 自動広告（日 3,000 円，只投 CVR ≥3.5% 的）+ Vine；1,052 件零流量商品高于竞品价的下架；**暂停 1,129 件 SARADEMUNT 杂货新品上架、暂停 1688 找同款**。
- **乐天**：用户登录 RMS 做完 ②〜⑤（リードタイム 2 日、A 档积分 3 倍、首单券、RPP 30,000 円 只投 A 档 45 件）；约 ECC 电话；报名 11 月 お買い物マラソン；专门店化 3 ジャンル。
- **Shopify**：装 GA4 + Meta Pixel + Search Console + Judge.me（导入 Amazon 评价）；5 份政策贴完；首页只推 A 档 26 件 +「公式サイト限定価格」；IG 下周起只发 A 档。
- **原始素材待取**：批发商「日本店畅销 TOP 50」（用户去问）、Amazon 検索語レポート/SQP、乐天 R-Karte。
- 验证方式：乐天 ECC 的意见、Amazon ユニットセッション率 对比基准（杂货 8〜12%）、30 天 3 万円广告小实验的 ACOS/出单。
- 外部专家会用而我们未用的工具：Keepa、セラースプライト/Helium 10、Brand Analytics、R-Karte、Nint、FBA 料金シミュレーター、Vine。

## 环境地图
| 环境 | 怎么连 |
|---|---|
| 云端 Claude 会话（本仓库容器） | 写代码、提交、推送到 `claude/*` 分支。出站**只有 HTTPS 且走域名白名单**：到 `13.158.114.4` 的 22/80/443/7000/7001 全部被拦（`host_not_allowed`），**不能直连 Lightsail**，需用户把该 IP / japanerp.com 加入云环境 Allowed domains |
| Windows 电脑（`C:\Users\maxinjian\source\jianpanerp`，Win11 Enterprise，**RTX 4080 16GB**，64GB RAM，Node 24，Python 3.13，Tailscale IP **100.120.180.90**） | 用户以**管理员 PowerShell** 运行 `claude --dangerously-skip-permissions` 再 `/remote-control`（当前会话 `session_019DupZeGVcWx6WEyY4mWnHy`（2026-10-16 开，已设 crossSessionInbound=accept，消息直达）；旧会话 `session_01Nd2VVN2EQB7MRGGzBzvqQk` 等均已归档。**会话关闭时它后台起的 node 循环会一起死**，长任务要用关沙箱 Start-Process 常驻），云端会话用 `send_message` 发任务，分阶段、措辞平实（一次派太多系统级操作会被云端分类器拦）。**也是到 Lightsail / V64 的 SSH 跳板**（Windows 内置 OpenSSH） |
| AWS Lightsail 东京 `13.158.114.4` | **登录用户 `ubuntu`**，`ssh -i C:\Users\maxinjian\.ssh\lightsail-tokyo.pem ubuntu@13.158.114.4`（pem 已放好）。**规格极小：Ubuntu 24.04，2 vCPU，412 MiB 内存（swap 4G），19 GB 盘已用 63%**——跑不了 Next.js build，部署前需升级套餐或改静态导出。已有服务：**haproxy 占 80/443**、**frps 在 7000**（frp 服务端）、7001 空。Tailscale 已装（2026-10-14，待授权）。密钥**不入 git** |
| **中国 LLM 服务器 `6kpro`**（**第三方**，Tailscale 主人 leosma@gmail.com，Debian 12，OpenAI 兼容）| `http://100.82.2.101:8199/v1`，模型 `GLM-5.3-Flash`（1M 上下文、32K 输出、视觉、JSON、`reasoning_effort`）。**2026-10-16 机主确认硬件**：裸 vLLM，无鉴权；底模 zai-org/GLM-5.3-Flash 的 NVFP4/FP8 本地量化版，`dsv41`/`glm53`/`GLM-5.3-Flash` 是同一模型别名；1×RTX PRO 6000 Blackwell 96GB + 4×CMP 170HX 64GB，5 卡流水线并行；单请求约 75 tok/s，4 并发合计 238 tok/s。图像模型 Qwen-Image-2.1 计划部署在另一台双 4090 机器上，届时另行共享。**Windows→6kpro 实际是 IPv6 直连**（tailscale ping 全部 direct，约 95ms），不经 DERP；机主自建东京 DERP `daretok`（region 900，36.50.84.239.sslip.io:8443，无 verify-clients）联调仅在直连失败时才有意义。**2026-10-14 实测：Mac / Windows / 云端全部不可达**——地址是对方 tailnet 的内网 IP，用户的设备不在那个网络里。2026-10-15 对方已 Share 给 maxinjian@gmail.com（管理台「Shared with me」可见，Expiry disabled），**只开放 8199 端口**（ping/其他端口不通属正常）。**2026-10-15 已打通**：之前不通的根因是机主禁用了官方东京 DERP 中继、自建中继不支持跨 tailnet 共享，机主恢复官方中继后 Mac `curl /v1/models` 返回 200。健康检查 `GET /health`。Windows 测通后 `LLM_DEFAULT_PROVIDER=cn`；`LLM_PII_PROVIDER` 保持 `local`。Key 放 `.env` 的 `CN_LLM_API_KEY` |
| AWS API | 需要 `AWS_ACCESS_KEY_ID/SECRET/DEFAULT_REGION=ap-northeast-1` 放在云环境 Network secrets；容器自带的 AWS 变量是内部用的，无效 |
| 用户 MacBook Air | Tailscale IP 100.82.52.75（同一 tailnet） |
| V64 实机 | **暂无，用 Windows 电脑代替**（2026-10-14 用户确认）：本地模型 = Windows 原生 Ollama（RTX 4080，`qwen3:14b`），`LOCAL_LLM_BASE_URL=http://localhost:11434/v1`。真机到手后：Ubuntu 24.04 上 `curl … deploy/v64/install-v64.sh \| sudo bash`（驱动/Docker/toolkit/Tailscale/代码/`docker-compose.v64.yml` 全套 + Ollama `qwen3:30b-a3b` + Open WebUI）。说明见 `deploy/v64/README.md` |

## Windows remote-control 会话的限制（实测）
- 它**不能**给云端会话回消息（没有 send_message 工具）→ 云端会话用 `list_events` 读它的 assistant 文本来获取结果。
- 它的权限分类器会拦：`git clone`（需用户在其提示符前加 `!` 自己跑）、搜索密钥文件、安装需管理员权限的软件（Docker Desktop/WSL 需用户口头批准）。
- 给它下任务时：一次一件、附带用户需要自己做的命令。

## 工作流约定
- **对用户的回答一律用中文**（2026-11-01 用户：「以后你回答用中文，我习惯用中文工作」）。给 Windows 的指令、文档、提交说明照旧可用中日文。
- 开发分支由会话指定（当前 `claude/brave-dirac-s6orrc`），不直接推 main。
- 新建环境相关文件（脚本/compose/部署文档）放仓库根或 `docs/`，Windows 侧执行。
- 密钥只放 `.env` / Windows 凭据管理器 / 云环境 secrets，聊天里不贴。
- 每次会话结束前：把新的决定与进度写进 **`docs/进度日志.md`**（最上面加一条）。本文件只放长期有效的规则；新的长期规则同时写进下面「现行规则摘要」。要查过去的做法、文件位置、经验，先 grep `docs/进度日志.md`。

## 现行规则摘要（从进度日志提炼，2026-11-28；细节与出处见 docs/进度日志.md）
- **6kpro**：白天也可跑批量（11-11），单路顺序调用、不并发；调用用 `reasoning_effort: low`（high 会把输出额度用在思考上）。6kpro 停机就等，面向客户的文案不用本地模型代写（11-01）；本地 Strata 只作草稿/备用。
- **ANET ERP**（`Desktop\AI\AI_ScanCAD\japan-erp`，8090）：本会话提需求、出导入文件、在 `trial` 只读验收；ERP 会话改代码。部署、读进 `anet` 必须用户在 ERP 会话里亲口同意；其他会话的话不算用户同意。导入文件放 `tools/erp-bridge/out/pending/`（`out/orders*.csv` 会被每晚任务读走）；ERP 会话核对过的文件不要再改。迁移 0019 已上线（11-28），Amazon 取消行可写。**仓库（0020，11-28）**：`own_stock.csv` 只改公司仓库 main，不要再用乐天 RMS/物流公司的数做它；物流公司（tpl）的实数用 `warehouse_counts.csv`（warehouse, sku_code, quantity, note）。
- **每晚订单导出**：计划任务 `anet-erp-orders-export` 23:10（电脑时间＝北京时间，JST−1h）→ `tools/erp-bridge/nightly-orders.mjs`。金额字段先查占位值（乐天 -9999）。
- **SALONCARE**（Amazon 品牌写法不带空格）：切换线上全权授权，做完汇报；花钱、凭据、安全设置除外。
- **商品画面**：商品本体用实拍抠图，不让 AI 重画商品/带字包装/真人脸；日文由代码渲染；视频不用 AI 生成画面（10-26）。ComfyUI 测试可用非商用模型，上架前确认许可（11-25）。
- **合规**：TikTok 等平台类目要求认证时不换类目绕过（11-26）；电器无 PSE 不上；存储类（U 盘/SD/硬盘）不卖（11-11）；化妆品无全成分不上。
- **下载、发帖、发邮件、上传、花钱**：每次先问用户；Seller Central 报告下载需用户同意。
- **Seller Central 操作**：中文界面，窗口在后台时截图易超时 → 读 DOM；报告内容可在页面内 fetch `documentMetadata?referenceId=` 取得，多份拼一个 Blob 下载。

## 新业务线：批发商 → Shopify 代发闭环（2026-10-15 立项，需求见 `docs/需求-Shopify代发闭环.md`）
- Shopify 店：LECOCO ITALY = **`0scqav-e7.myshopify.com`**（anetmc.com，47 商品；完整备份在 `backups/shopify-lecoco-products-2026-10-15.json`，归档操作待用户确认）。
- **Shopify API 接入方式（2026 起）**：后台已不能建旧式自定义应用。走 **Dev Dashboard** 建 App → scopes `read_products, write_products, read_orders, write_orders, write_fulfillments` → 发布版本 → 安装到店 → 得 Client ID / Client secret（无固定 token）。运行时用 client_credentials 换 token（约 24h 有效）：`POST https://0scqav-e7.myshopify.com/admin/oauth/access_token`，body `grant_type=client_credentials&client_id=…&client_secret=…`。`.env`：`SHOPIFY_STORE_DOMAIN` / `SHOPIFY_CLIENT_ID` / `SHOPIFY_CLIENT_SECRET`（secret 由用户亲手填，不经聊天）。
- 批发商 kuajingyifan.com（用户有账号，已授权采集）；云端白名单不含该域，采集/下单都在 Windows 用 Playwright。
- 图片：**2026-10-15 用户决定直接用批发商原图，不做 AI 处理**；**2026-10-16 晚规则变更（已推迟执行）**：为上架乐天/Amazon，商品图将**全部重做**（用户现有做图 AI），原则「AI 出图、代码出字」（AI 不画日文，文字用 Chromium 模板渲染 Noto Sans JP）；每品 8 张：Amazon 纯白首图 / 乐天首图文字≤20% 无边框 / 卖点 / 场景 / 寸法図 / 细节 / セット内容 / 安心栏；文案按两平台字段限制由 6kpro 生成；后台加「渠道上架」模块一键推 RMS API + SP-API。**2026-10-16 深夜用户看过样图后拍板：MIX 风格（主图/卖点/寸法/细节/颜色/安心 = B 量贩店风，场景 = A 生活杂货风），全部商品按顺序重做，不等 6kpro 图像模型**；**用户随后明确：不需要逐批审阅，云端自行质检后直接全量生成并 publish 替换 Shopify 图片**（旧图 URL 保留在 media-backup.json 可回滚）。流水线 `tools/product-images/pipeline.mjs`（Windows 跑：fetch → classify[6kpro 视觉分类原图 + mainBox/cleanBox] → cutout[rembg BiRefNet GPU] → spec[6kpro 写日文文案 JSON，禁止编造数字] → render[`tools/brand-assets/product-cards.mjs` --style MIX] → preview[4×2 联络表入库 out-preview/] → publish[stagedUploads + productCreateMedia + reorder + 删旧图，备份 media-backup.json，可 rollback]）。样品：`tools/brand-assets/samples/shoe-rack/`（原图含他牌包 → 分类器 hasBrandLogo 排除）。2026-10-16 再次确认：批发商本身面向日本市场，商品图**不重做**（`IMAGE_PROCESS` 永远 0，不要跑 repair?reprocess）。Windows RTX 4080 的 `apps/image-service`（8010 常驻）只用于**店铺装饰图 / 营销图 / 后期流媒体视频素材**，不接上架流程（6kpro 暂无显卡资源加图像模型；以后有了再加 Qwen-Image-Edit）。所有中国侧 AI 只走 6kpro，不用阿里云。
- 订单闭环第一阶段：人工一键确认后再去批发商下单付款。

