# course-digest — 让 Windows 本地模型「看」课程，做成知识库 + skill

用户 2026-10-25 指示：课程在 `D:\BaiduNetdiskDownload\2026漫剧短剧全新教程（10月）`，用 Windows 本地大模型自己看视频、自己学习、做成数据库和 skill。**社内学习用途，不再分发课程内容。**

## 怎么「看」
| 步 | 做什么 | 用什么（全部在 Windows 本地） |
|---|---|---|
| scan | 列出全部文件（视频 / 文档 / 图片 / 压缩包 / 自带 skill） | Node |
| transcribe | 中文语音 → 带时间戳的文字 | faster-whisper large-v3（RTX 4080，约 1〜2 分钟/视频） |
| frames | 场面切换 + 每 30 秒抽一帧，每视频 ≤40 张 | ffmpeg |
| docs | PDF / DOCX / XLSX / MD / TXT 抽文字 | Python（pypdf、python-docx、openpyxl） |
| notes | 视觉模型读截图（哪个软件、哪个按钮、参数原文）→ 文本模型把转写 + 画面整理成：工具 / 步骤 / 提示词原文 / 坑 / 素材 / 讲师原话 | Ollama：`qwen2.5vl:7b` + `qwen3:30b-a3b` |
| db | SQLite + FTS5 全文检索（item / step / tool / prompt / pitfall / asset / transcript）+ 目录 `docs/course-digest/README.md` | node:sqlite |
| skills | 按主题生成 SKILL.md 草稿（漫剧流程、人物一致性、可灵、Seedance、剪映、配音、平台规则…）到 `out/skills/`；课程自带的 skill 原样复制到 `out/skills/_bundled/`；`--install` 才放进 `.claude/skills/ai-drama-*/` | Ollama |
| ask | 问问题 → 检索知识库 → 本地模型带出处回答 | Ollama |

笔记规则写死在提示词里：**只写视频里真正讲到的，没讲到的写「未提及」**，提示词尽量逐字保留。skill 生成时会标注：我们的用途是日本电商商品视频，国内分账/番茄改编只作参考。

## Windows 一次性准备
```powershell
pip install faster-whisper pypdf python-docx openpyxl
ollama pull qwen2.5vl:7b
ollama pull qwen3:30b-a3b
winget install Gyan.FFmpeg          # 已装可跳过
```
`.env` 可加：`COURSE_DIR=D:\BaiduNetdiskDownload\2026漫剧短剧全新教程（10月）`、`LOCAL_VL_MODEL=qwen2.5vl:7b`、`LOCAL_TEXT_MODEL=qwen3:30b-a3b`、`WHISPER_MODEL=large-v3`。

## 跑
```powershell
node tools/course-digest/digest.mjs scan --dir "D:\BaiduNetdiskDownload\2026漫剧短剧全新教程（10月）"
node tools/course-digest/digest.mjs all  --dir "..." --limit 3      # 先 3 个视频看效果
node tools/course-digest/digest.mjs all  --dir "..."                # 全量（51 个视频约 2〜4 小时，可中断续跑）
node tools/course-digest/digest.mjs ask "可灵怎么保持人物一致"
```
`out/`（转写、截图、笔记、数据库）不入 git；只有目录 `docs/course-digest/README.md` 和审阅后的 skill 入库。

## 用在哪
- `tools/product-video/` 的分镜与可灵提示词：从 `ask` 里查「可灵 运镜 提示词」「人物一致性」直接借用。
- 以后 V64 到了，同一套脚本把模型换成 V64 上的即可（Whisper + Qwen2.5-VL 32B）。
