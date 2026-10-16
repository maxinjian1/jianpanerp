"""ANET 店铺装饰图生成（本地 RTX 4080，FLUX.1-schnell，Apache-2.0 可商用）

用法（在 apps/image-service 目录、同一个 venv）：
  venv\\Scripts\\python.exe gen.py                 # 生成 prompts.json 里全部
  venv\\Scripts\\python.exe gen.py --only hero-desktop,cat-pet
  venv\\Scripts\\python.exe gen.py --out ..\\web-client\\public\\brand\\gen

输出 PNG 到 --out（默认 apps/web-client/public/brand/gen/），文件名与 Shopify Files 里的名字一致，
确认效果后再由云端会话用 fileCreate(REPLACE) 导入 Shopify。
首次运行会从 HuggingFace 下载约 34GB 模型（black-forest-labs/FLUX.1-schnell，无需登录）。
16GB 显存：bf16 + model_cpu_offload，1536×864 约 30–60 秒/张。
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from diffusers import FluxPipeline

HERE = Path(__file__).resolve().parent
DEFAULT_OUT = HERE.parent / "web-client" / "public" / "brand" / "gen"
MODEL = "black-forest-labs/FLUX.1-schnell"

# 统一风格：日系明亮生活感、自然光、留白、无文字无人脸特写（避免肖像权/文字乱码）
STYLE = (
    "bright airy Japanese lifestyle photography, soft natural window light, clean minimal interior, "
    "muted warm neutral palette with cream and light wood, shallow depth of field, high-end e-commerce "
    "campaign look, no text, no watermark, no logo, no people faces"
)


def load_prompts(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompts", default=str(HERE / "prompts.json"))
    ap.add_argument("--out", default=str(DEFAULT_OUT))
    ap.add_argument("--only", default="", help="逗号分隔的 name 列表")
    ap.add_argument("--seed", type=int, default=20261016)
    ap.add_argument("--steps", type=int, default=4)  # schnell 4 步即可
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    items = load_prompts(Path(args.prompts))
    if args.only:
        keep = {s.strip() for s in args.only.split(",") if s.strip()}
        items = [i for i in items if i["name"] in keep]

    print(f"loading {MODEL} …", flush=True)
    pipe = FluxPipeline.from_pretrained(MODEL, torch_dtype=torch.bfloat16)
    pipe.enable_model_cpu_offload()  # 16GB 显存够用，主体放 CPU 内存逐层搬运

    for i, it in enumerate(items):
        name, w, h = it["name"], int(it["width"]), int(it["height"])
        prompt = f"{it['prompt']}, {STYLE}"
        g = torch.Generator("cpu").manual_seed(args.seed + i)
        t0 = time.time()
        img = pipe(
            prompt=prompt,
            width=w,
            height=h,
            num_inference_steps=args.steps,
            guidance_scale=0.0,  # schnell 不用 CFG
            max_sequence_length=256,
            generator=g,
        ).images[0]
        p = out / f"{name}.png"
        img.save(p)
        print(f"[{i+1}/{len(items)}] {p.name} {w}x{h} {time.time()-t0:.1f}s", flush=True)


if __name__ == "__main__":
    main()
