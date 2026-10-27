# 草稿箱 → anetmc.com 同期 結果（2026-10-27，第五阶段）

- 斑馬草稿箱 全量导出：1,003 件 / 失败 0（SPU 重复 2 件 → 文件 1,002）。
- plan（`draft-sync-plan.md`）：matched 648 / dup 58（对应 Shopify 281 件，未动，等人工）/ 排除 121（Shopify 已 DRAFT 117 + 断货表命中 4）→ 对象 321。
- 另排除 1 件：**098**（Shopify＝天然石ブレスレット，草稿＝ヘアブラシ，短型番撞号误匹配）→ 实际对象 320（`tools/rakuten/out/exclude-apply.txt` = exclude-stock.txt + 098）。
- apply（1 件/秒，2% 停）：**成功 319**（试跑 2 + 正式 317）/ **失败 1**。
  - 失败：`ext01` 非接触赤外線体温計 —— 草稿图片中有 1 张 Shopify 处理失败（media FAILED，重试 1 次仍失败）→ 已 rollback，**保持原图和原说明**。
- 只改了图片和说明；标题、价格、库存、标签、状态未动。每件旧图+旧说明备份在 Windows `tools/rakuten/out/shopify-backup/<handle>/`，`draft-sync.mjs rollback [--only handle]` 可恢复。
- 日志：`draft-sync-apply-20261027.txt`。
