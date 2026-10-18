# 国内 AI 指挥 ComfyUI 改商品图（试点）

原则：**商品像素不动**。6kpro 只负责「看图下判断」和「质检」，ComfyUI 只生成背景/补边/擦字区域，最后由 `compose.py` 把原图里的商品像素贴回去。改好的图只出预览，用户逐款审核后写进 `tools/product-images/approved.txt` 才会发布。

## 流程
`plan`（6kpro 看原图决定每张图的操作）→ `edit`（compose.py 做遮罩 + ComfyUI 生成）→ `qc`（6kpro 前后对比，不合格换 seed 重做最多 2 次）→ `sheet`（前后对比图到 `out-preview/`，入库给用户看）

```
node tools/comfy/run.mjs check
node tools/comfy/run.mjs all --handles <handle1>,<handle2>
```

## 操作与实现
| op | 谁做 | 说明 |
|---|---|---|
| remove_text | RapidOCR 找字（避开商品）→ ComfyUI `inpaint` | 只擦叠加的促销字/水印 |
| pad_square | compose.py；背景不是纯色时 ComfyUI `outpaint` | 补成正方形，不裁剪 |
| bg_white | compose.py | 纯白底 + 淡接地阴影（无 AI） |
| bg_scene | ComfyUI `background` + 贴回原商品 | 日本家居场景，无人物无文字 |
| upscale | ComfyUI `upscale` | 放大增强 |

## workflows/
ComfyUI 菜单「Workflow → Export (API)」导出，把输入换成占位符：
`{{IMAGE}}`（LoadImage 文件名）、`{{MASK}}`（遮罩 LoadImage 文件名）、`{{PROMPT}}`、`{{NEG}}`、`{{SEED}}`、`{{SIZE}}`。数值占位符写成字符串 `"{{SEED}}"`，脚本替换成数字。
需要：`inpaint.json`、`outpaint.json`、`background.json`、`upscale.json`。缺的那类操作会自动跳过。

## 环境
- Windows（试点）：ComfyUI 在 `C:\ComfyUI`，`http://127.0.0.1:8188`（`.env` 可设 `COMFY_URL`）。RTX 4080 16GB → FLUX Fill 用 GGUF Q8（ComfyUI-GGUF 节点）。
- V64（量产）：4 张 V100 各跑一个 ComfyUI 实例（端口 8188–8191），fp16/GGUF（Volta 不支持 bf16/FP8）。
- 模型许可：FLUX.1 Fill [dev] 权重是非商业许可，正式量产前确认输出商用条款；可替换为 Apache-2.0 的 Qwen-Image-Edit。
