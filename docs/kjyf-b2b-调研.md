# kjyf B2B（beehole.kuajingyifan.com/b2b）只读调研

2026-10-19，Windows 上的 Chrome（CDP 9224，profile `kjyf-b2b`，用户本人登录）完成。
只读：没有下单、没有加购物车、没有改设置。token 和 cookie 的值没有打印、也没有保存。
API 在登录页的页面上下文里调用，每次请求间隔 1.1 秒以上；共调用约 90 次，另外匿名抓取旧站 20 页。
样例 JSON 在 `tools/kjyf-b2b/samples/`，已去掉 token、个人信息、`timestamp` 和 `req_id`。

## 结论（先看这里）

1. **B2B 就是旧站的同一个后台。** 商品 ID（`good_id`）、`sku_id`、`out_id`、价格完全一致：20 个样例、46 个 SKU 都一样。B2B 是 view 2（简体中文界面），旧站 www.kuajingyifan.com 是 view 0（ja-JP）。
2. **登录后价格不变。** 同一个搜索接口，带登录 token 和匿名调用返回的价格、件数完全一样。没有阶梯批发价（`/admin/good/wholesale/2b/get` 在 20/20 个样例里都返回 `list: null`）。`original_price`、`purchase_price`、`tax_rate`、`extra_fee` 全部是 0。
   - 页面没有「含税」「不含税」或「运费」的字样；「邮费」一栏是空的。价格是否含税，接口和页面都没写，需要问批发商。按日本 B2C 的惯例，大概率是含税价。
3. **没有重量、尺寸和 JAN。**
   - 商品级 `weight` 在 20/20 个样例里都是 0；SKU 没有重量字段；没有尺寸或包装尺寸字段。
   - `good_infos`（规格参数）在 20/20 个样例里都是 null。
   - `barcode`：46 个 SKU 里只有 3 个有值，而且填的是 `out_id`（例如 `B-12-A`），不是 JAN。另有 1 个 SKU 的 `out_id` 本身是 13 位 JAN 形式（`4571660640678`）。
   - 尺寸和重量只在 `desc`（HTML）的正文里偶尔出现：20 个里有 5 个能找到「サイズ／重量／尺寸」，大多数写在详情图片上。
   - **所以 B2B 解决不了 Amazon 缺重量和尺寸的问题**，仍然只能从描述文字或图片里读（read-specs.mjs 的做法）。
4. **和 Shopify 的对应很简单：Shopify variant 的 `sku` 就是 kjyf 的 `out_id`。**
   - 20 个样例里有 17 个商品（41/46 个 SKU）按 `out_id` 对上。
   - 对不上的 3 个（39362、39534、39278）是 B2B 新上的商品，Shopify 还没有。
   - Shopify 售价在 41/41 个 SKU 上都等于 `ceil(B2B 价 × 1.15 / 10) × 10`，比率是 1.150 到 1.159。也就是说，我们的成本假设（批发价 = 旧站价 = B2B 价，加价 15%）是一致的。
5. **商品数**：B2B（view 2，`on_shelves=1`）共 **1135** 个；旧站 view 0 共 1191 个；Shopify 上 ANET 在售 1181 个。
6. **库存**：`skus[].stock_num` 和 `/admin/sku/stock/new/2b/get` 的 `available_stock`、`physical_stock` 一致。搜索结果里的 `available_stock` 是对的；详情接口里的 `available_stock` 是 0，不能用。
7. **B2B 唯一的增量**是实时库存接口（可以按 `out_id` 单个查询），以及登录后才能下单。商品数据本身，旧站匿名的 `__NUXT__` 已经全有。

## 接口

全部是 `https://beehole.kuajingyifan.com` 下的路径，`POST` 加 JSON 请求体。
请求头只有 `authorization` 和 `content-type`。`authorization` 的值等于 `localStorage.user.token`（不加 Bearer 前缀；加了 Bearer 结果也一样）。
未登录也能调这些接口，结果相同。
响应外层是 `{code: 0, message: "SUCCESS", data, timestamp, req_id}`。

| 用途 | 路径 | 请求参数 | 主要返回字段 |
|---|---|---|---|
| 商品搜索／列表 | `/admin/product/2b/search` | `viewId, page, limit, cat_id, order_type, on_shelves` | `data.total`, `data.currency`, `data.list[]`（商品结构见下） |
| 商品详情 | `/admin/good/2b/info` | `good_id, view_id` | 商品结构，再加上 `cats{cat_id,name,p_cat_id}`, `good_infos`, `keywords`, `update_time`, `source_language`, `from_platform`, `from_good_id`, `is_supply_operation` |
| 阶梯批发价 | `/admin/good/wholesale/2b/get` | `good_id` | `list`（样例中全部为 null） |
| SKU 库存 | `/admin/sku/stock/new/2b/get` | `out_id` | `warehouse_country_list, available_stock, physical_stock, lock_stock, reserved_stock` |
| 分类 | `/admin/cat/2b/list` | `show_main, view_id` | `list[]{cat_id, p_cat_id, name, weight, image_url, view_id}` |
| 商品标签 | `/admin/label/2b/good/label/list` | `good_id, view_id` | `list`（样例为空） |
| 视图（语言／站点） | `/admin/shop/view/2b/list` | `limit, main_shop_id, page` | `list[]{view_id, name, language, currency, is_default}` |
| 配送方式 | `/admin/delivery_method/list` | `page, limit, viewId` | `list`（null） |
| 商城配置 | `/admin/mall_config/2b/get` | `shop_id, name`（`PsCountry` / `mall_shouhou_config`） | `data`（JSON 字符串） |
| 会员信息 | `GET /admin/member/profile` | — | 含个人信息，**没有记录内容** |

**商品结构**（search 的 `list[]` 和 info 共用）：
- `good_id, shop_id, view_id, cid, cat_id, title, sub_title, desc`（HTML）`, note`（发货说明）
- `image_url`、`image_url_1` 到 `image_url_9`（最多 10 张）
- `video_url, slug, language, on_shelves, rate, sales_num, weight`（全部为 0）`, out_ids`
- `delivery_countries[]`、`mailing_mode`（0、1 或 2，含义不明）、`shipping_period`（0 或 1）
- `price_min, price_max, discount_price_min, discount_price_max, deduction_ratio, discount_ratio`
- `sku_props[]{prop_id, prop_name, values[]{value_id, prop_value}}`
- `skus[]`

**SKU 结构**：`sku_id, good_id, props_ids("propId:valueId"), price, purchase_price, original_price, stock_num, available_stock, out_id, barcode, barcode_type("GTIN"), tax_rate, extra_fee, sku_image, is_for_sale, from_sku_id, zhan_yong_stock_num, is_filing`

注意：搜索结果里有的商品 `title` 是空的（只有 `sub_title`），完整标题以详情接口为准。

## 分类和商品数（view 2，上架中）

| cat_id | 分类 | 商品数 |
|---|---|---|
| 3 | 日用品杂货 | 441 |
| 465 | 衣物 · 配饰 · 珠宝 | 195 |
| 4 | 母婴 | 135 |
| 738 | 🎉 サプライズセール🎉 | 73 |
| 6 | 宠物・宠物用品 | 58 |
| 7 | 健康减肥 | 56 |
| 10 | 家具・家居 | 45 |
| 11 | 旅行・露营用品 | 43 |
| 5 | 时尚·箱包 | 42 |
| 2 | 手机・平板电脑用品 | 29 |
| 744 | 📦仓库耗材📦 | 0 |
| 261 下的 262–267 | 日用品／家居家具／户外运动／宠物用品／婴儿用品／旅行用品 | 0（空的旧分类） |
| — | **合计（不指定 cat_id）** | **1135** |

除促销分类外，各分类相加是 1044；加上促销分类（738）是 1117，比总数 1135 少 18 个，说明有少量商品不属于任何主分类。

## 20 个样例

价格是第一个 SKU 的；「旧站」指旧站匿名 `__NUXT__` 的价格；「Shopify」指按 `out_id` 对上的 Shopify 售价。

| good_id | 分类 | SKU 数 | B2B 价 | 旧站 | Shopify | 库存 | 重量 | JAN | 图片 | desc 里有尺寸／重量 |
|---|---|---|---|---|---|---|---|---|---|---|
| 39426 | 手机・平板 | 2 | 1880 | 1880 | 2170 | 440 | 0 | — | 2 | — |
| 39362 | 手机・平板 | 1 | 2066 | 2066 | 未上架 | 10 | 0 | — | 8 | — |
| 39518 | 日用品杂货 | 2 | 1649 | 1649 | 1900 | 40 | 0 | — | 10 | — |
| 39534 | 日用品杂货 | 1 | 960 | 960 | 未上架 | 23 | 0 | — | 6 | — |
| 39440 | 母婴 | 4 | 4109 | 4109 | 4730 | 19 | 0 | — | 2 | — |
| 39300 | 时尚·箱包 | 1 | 2178 | 2178 | 2510 | 19 | 0 | — | 10 | 有 |
| 39443 | 宠物 | 1 | 3190 | 3190 | 3670 | 15 | 0 | — | 2 | — |
| 39512 | 健康减肥 | 5 | 1099 | 1099 | 1270 | 19 | 0 | — | 10 | — |
| 39276 | 家具・家居 | 2 | 3299 | 3299 | 3800 | 43 | 0 | — | 10 | — |
| 39479 | 旅行・露营 | 1 | 699 | 699 | 810 | 9 | 0 | — | 2 | 有（26×15cm，15g） |
| 39367 | 衣物配饰 | 3 | 3080 | 3080 | 3550 | 10 | 0 | — | 9 | — |
| 39278 | 衣物配饰 | 3 | 2558 | 2558 | 未上架 | 48 | 0 | — | 8 | — |
| 38900 | 促销 | 2 | 1134 | 1134 | 1310 | 14 | 0 | — | 9 | — |
| 37026 | 母婴 | 3 | 3000 | 3000 | 3450 | 8 | 0 | — | 10 | — |
| 927 | 时尚·箱包 | 3 | 1923 | 1923 | 2220 | 4 | 0 | `B-12-B`（=out_id） | 5 | — |
| 38120 | 宠物 | 4 | 1299 | 1299 | 1500 | 2 | 0 | — | 10 | — |
| 39281 | 健康减肥 | 1 | 1265 | 1265 | 1460 | 39 | 0 | out_id 是 `4571660640678` | 10 | — |
| 36474 | 家具・家居 | 1 | 29969 | 29969 | 34470 | 0 | 0 | — | 7 | 有（700×450mm，42kg） |
| 37563 | 旅行・露营 | 3 | 1619 | 1619 | 1870 | 4 | 0 | — | 10 | — |
| 38805 | 促销 | 3 | 919 | 919 | 1060 | 49 | 0 | — | 10 | 有（15×15×7.5cm） |

逐个 SKU 的完整对比在 `tools/kjyf-b2b/samples/compare-20.json`。

## 建议

- 采集继续用旧站匿名的 `__NUXT__`（`tools/kjyf-scraper`）或这个 search 接口（不需要登录，`limit` 可以调大，翻页 60 次左右就能拿全）。B2B 登录不带来新的商品字段。
- 缺重量和尺寸的问题，B2B 解决不了。仍然按「描述文字 → 详情图片识别 → 留空」的顺序处理。
- 价格是否含税需要向批发商确认。
- 实时库存可以用 `/admin/sku/stock/new/2b/get`（按 `out_id`）或 search 结果里的 `skus[].stock_num`。如果要做下单机器人，需要 `sku_id`（两边一致）。
- 3 个 B2B 新品（39362、39534、39278）不在 Shopify 上。是否全量比对出新品，等指示。
