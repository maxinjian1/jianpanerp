# kjyf-scraper — kuajingyifan.com 采集 → ERP → Shopify

在 **Windows**（或 V64）上运行，零依赖（Node 20+ 自带 `fetch` / `vm`）。云端容器出不了白名单，跑不了。

## 为什么不用 Playwright
2026-10-15 调研：站点是 Nuxt 2 SSR，商品页 HTML 的 `window.__NUXT__` 已包含每个 SKU 的
`skuId / outId / price / stockNum / originalPrice / weight` 和图片 URL（腾讯云 COS 东京）。
页面显示层写着「ログイン後に価格を確認する」，但数据层匿名可见。登录只在**下单**时需要。

## 步骤
```powershell
# 0. 服务要在跑（api-core :4000）。.env 里填 ERP_PASSWORD（随便定一个，首次自动注册 ops@anet.local）
# 1. 先试 3 个，顺便导出原始状态看看字段
node tools\kjyf-scraper\scrape.mjs --limit 3 --dump
#    看 tools\kjyf-scraper\out\products.json：标题/价格/SKU/图片是否正确；不对就看 out\dump-*.json 改字段映射
# 2. 采 300 个并推进 ERP
node tools\kjyf-scraper\scrape.mjs --limit 300 --post
# 3. 翻译 + 上架（api-core 内完成：GLM 日语化 → Shopify 建品，价格 = 批发价×1.15 向上取整到 ¥10，默认 ACTIVE 直接在售）
#    先 10 个：
curl -X POST "http://localhost:4000/api/v1/dropship/publish-batch?limit=10" -H "Authorization: Bearer <token>" -H "x-tenant-id: <tenantId>"
#    之后 limit=50 循环直到没有 scraped/translated 状态的商品
```
token / tenantId 从 `POST /api/v1/auth/login`（ERP_EMAIL / ERP_PASSWORD）拿。

## 输出格式（= api-core `ScrapedProduct`）
```json
{ "externalId": "39522", "sourceUrl": "...", "titleZh": "瑜伽垫 YB-05", "images": ["https://..."],
  "variants": [{ "name": "A", "sku": "YB-05-A", "wholesalePrice": 2109, "stock": 5, "options": ["A"] }],
  "optionNames": ["规格"], "raw": { "skuIds": [97299] } }
```
`raw.skuIds` 下单机器人要用（批发商下单按 skuId 加购）。

## 站点结构速查
| 内容 | URL |
|---|---|
| sitemap | `/sitemap/ja-JP.xml`（约 1186 个商品；根 `/sitemap.xml` 504） |
| 商品页 | `/ja-JP/p/{goodId}/{slug}` |
| 分类 | `/ja-JP/c/0`（全部，每页 12，`?page=N`） |
| 业务 API | `http://beehole.kuajingyifan.com`（Bearer token，下单机器人阶段再分析） |

## 注意
- 并发 3、间隔 400ms，对方站在 Cloudflare 后面，别调太猛。
- 价格为日元、货在日本，无汇率。
- 采集结果和 dump 都在 `out/`（已 gitignore）。
