# product-video — 商品销售短视频（试点：乐天 A 档 3 件）

目标：15〜25 秒竖版（9:16）+ 横版（16:9）商品视频，可批量。**商品本体永远是实拍图，AI 只负责「动起来」和「配音」。**

## 流程（`video.mjs`，Windows 跑）

| 步 | 做什么 | 用什么 | 在哪 |
|---|---|---|---|
| pick | 从斑马草稿箱取该商品的图片（最多 12 张） | `tools/rakuten/out/drafts/<spu>.json` | 本地 |
| script | 3〜4 个镜头的分镜：用哪张图、字幕（≤12 字）、旁白（≤30 字）、镜头运动；数字只能来自草稿说明 | 6kpro（夜间窗口） | 6kpro |
| animate | 每个镜头 5 秒，图生视频，提示词只写镜头和光线，禁止改商品 | 可灵 image2video | 云端 |
| voice | 日语旁白 | VOICEVOX（本地，免费） | RTX 4080 机 |
| render | 1080×1920 / 1920×1080，字幕代码渲染（游ゴシック），可选 BGM | ffmpeg | 本地 |
| check | 禁止语（价格/送料/No.1/最強/他社名/医疗效能）、字数、时长、分辨率 | 正则 + ffprobe | 本地 |

输出：`out/<spu>/final/<spu>-9x16.mp4`、`-16x9.mp4`，`storyboard.json`、`check.json`。`out/` 不入 git；试点成品另行上传给用户看。

## 前置（Windows 一次性）

1. `.env` 追加（**密钥由用户亲手填，不经聊天**）：
   ```
   KLING_BASE_URL=https://api.klingai.com   # 用中继服务时改成中继地址
   KLING_API_KEY=                           # 中继服务的单个 key；官方 API 则改填下面两项
   KLING_ACCESS_KEY=
   KLING_SECRET_KEY=
   KLING_MODEL=kling-v2-1
   KLING_MODE=std
   VOICEVOX_URL=http://127.0.0.1:50021
   VOICEVOX_SPEAKER=2
   VIDEO_FONT=C:/Windows/Fonts/YuGothB.ttc
   VIDEO_BGM=
   ```
2. VOICEVOX：官网下载 Windows 版，启动后 50021 端口即可（免费，商用需在说明里标注角色名，见各角色利用規約）。
3. ffmpeg 在 PATH（`winget install Gyan.FFmpeg`）。
4. 草稿箱图片已导出（`tools/rakuten/draft-sync.mjs` 的前置步骤 banma-export）。

## 试点

```
node tools/product-video/video.mjs all --spu stqi-ctbl-001,TB-04,gd011 --window 20-10
```
可灵每条 5 秒 std 约 1 积分级别的费用（以你账号的计费为准）；3 件 × 4 镜头 = 12 条。`out/kling-usage.jsonl` 记每次调用。

## 规则
- 成品先给用户看，**用户承认后**才上传到 Amazon（主图视频）/ 乐天（商品页动画）/ TikTok。
- Amazon 主图视频：无价格、无促销、无「No.1」、无他社比较、无 URL；乐天可稍活泼但同样不写价格（价格在页面上会变）。
- 旁白和字幕里的数字只能来自草稿说明文；取不到就不写数字。
- 可灵的 prompt 只写镜头运动与光线；一旦发现商品变形、变色、多出物体，该镜头作废重生成或换图。
