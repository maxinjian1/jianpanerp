---
name: ad-image-comfy
description: アネットの商品広告画像を本機 ComfyUI で作る SOP（第 1 版）。実写の商品写真はそのまま使い、背景だけ Z-Image Turbo で生成、4x-UltraSharp で拡大、rembg で切り抜いて合成し、日本語はコードで描く。横 2560×1440 / 1280×720 と楽天用の正方形 1200×1200 を一度に出す。「广告图」「広告画像」「バナー」「ComfyUI で画像」「高清图」「乐天尺寸の広告」と言われたらこの skill を使う。アップロードは用户承認後のみ。
---

# 广告图 SOP（本机 ComfyUI）第 1 版

一条命令出 3 张：横版 2560×1440、横版 1280×720、正方形 1200×1200。

```
apps/image-service/venv/Scripts/python.exe -I tools/comfy/ad.py tools/comfy/ads/<id>.json
```

样板：`tools/comfy/ads/banz-0001.json`（BANZ 耳罩，烟花夜景）。成品在 spec 的 `dir`（`tools/comfy/out/` 不入 git）。

## 规则（不能破）

1. **商品本体只用实拍图。** AI 只生成背景。放大用 4x-UltraSharp（只放大，不重画）。不用 FLUX Fill（不可商用）。
2. **AI 不画文字。** 背景提示词必须写 `no people, no text, no letters, no logos, no products`。日文全部由 `ad.py` 渲染。
3. **文字只取商品页上的事实**（对象年龄、重量、参考值要写「参考値」等）。不写价格、送料、No.1/最強、排名、医疗效能、他社名。
4. 内衣类不做 AI 真人穿着图。
5. **不自动上传。** 做完发给用户看；上传到乐天/Amazon/IG 等用户同意后再做。乐天首图文字 ≤20%：这套图文字多，只能放第 2 张以后。销售主力的首图不动。

## 步骤

1. **确认 ComfyUI 在跑**：`curl -s http://127.0.0.1:8188/system_stats`。没起来就启动（重启电脑后要重启）：
   `Start-Process C:\ComfyUI\venv\Scripts\python.exe -ArgumentList 'main.py','--listen','127.0.0.1','--port','8188' -WorkingDirectory C:\ComfyUI`
2. **选实拍图**：从商品原图里找商品最大、最干净的一张，把所有候选拼成一张总览图自己看过再选。记下裁切框 `[x0,y0,x1,y1]`（只框商品，留一点边）。商品在原图里宽不到约 500px 的，成品会发平，要告诉用户。
3. **定场景**：按商品用途和**当前季节**选（用户没指定时不要拿过季场景）。提示词要点：广告摄影、场景主体在画面一侧、**前景下方有一块清晰的台面**放商品、留大片空白。
4. **写文案**：`head` 两行（第 2 行金色）、`sub` 一句、`chips` 最多 3 个 `[大字, 小字]`、`foot` 最多 2 条。逐条能在商品页上找到出处。
5. **写 spec** `tools/comfy/ads/<id>.json`，跑命令。背景约 20 秒，全程约 1〜2 分钟（抠图走 CPU）。
6. **自己看图**（必须）：`chk-cut.jpg`（抠图有没有缺角、带进背景）、`chk-wide.jpg`、`chk-sq.jpg`。检查：
   - 背景里有没有出现人、字、招牌、多余商品 → 换 `seed` 或改提示词，`--redo bg`
   - 商品是否落在台面上（不是浮在空中）→ 调 `table`（台面上沿占背景高度的比例，默认 0.715）
   - 文字有没有压到商品、标签有没有重叠、亮背景上字看不看得清
   - 换了实拍图或裁切框 → `--redo product`
7. **交付**：SendUserFile 发 3 张，说明用了哪张实拍、背景是生成的、图上每句话的出处、已知不足。

## 已知限制（第 1 版）

- 只有一种版式（文字左/上、商品右）。商品是横长或很扁的，位置要手调 `ad.py`。
- 商品阴影是简单椭圆，没有按背景光源方向做。
- 字体固定游ゴシック；没有按品类换风格。
- 正方形版从背景横向 `sq_x`（默认 0.34）处裁，背景主体偏了就调它。
- 没有 Amazon 白底主图功能（那个走 amazon-visual-sop）。

## 相关脚本

- `tools/comfy/zimage.py "<提示词>" out.png 宽 高 种子`：单独出一张图
- `tools/comfy/upscale.py in out.png`：单独放大 4 倍
