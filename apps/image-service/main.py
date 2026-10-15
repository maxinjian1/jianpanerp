"""
ANET 商品画像処理サービス（Windows RTX 4080 / V64 で動かす本地サービス。画像は外部に出さない）

  POST /process  {"url": "...", "steps": ["ocr_inpaint","rembg_white","square"], "size": 1200}
      → {"url": "http://localhost:8010/files/<hash>.png", "steps_applied": [...], "text_boxes": N, "ms": 820}
  GET  /files/<name>.png   処理済み画像（api-core が取りに来る）
  GET  /health

処理ステップ（順に適用）:
  ocr_inpaint : OCR で文字（中国語の販促文・ロゴ・透かし等）の矩形を検出 → LaMa で塗り潰し
  rembg_white : 背景を切り抜いて白背景に
  square      : 正方形キャンバス（既定 1200×1200）に余白付きで配置
  text_only   : ocr_inpaint のみ（背景は残す）… steps に "ocr_inpaint" だけ指定すれば同じ

モデルは初回使用時に自動ダウンロード（rembg: BiRefNet/U2Net、iopaint: LaMa、rapidocr: 同梱）。
"""
from __future__ import annotations

import hashlib
import io
import os
import time
from pathlib import Path
from typing import Optional

import httpx
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from PIL import Image, ImageDraw, ImageFilter
from pydantic import BaseModel, Field

OUT_DIR = Path(os.environ.get("IMAGE_OUT_DIR", Path(__file__).parent / "out"))
OUT_DIR.mkdir(parents=True, exist_ok=True)
PUBLIC_BASE = os.environ.get("IMAGE_PUBLIC_BASE", "http://localhost:8010")
PORT = int(os.environ.get("IMAGE_PORT", "8010"))
REMBG_MODEL = os.environ.get("REMBG_MODEL", "isnet-general-use")  # 代替: birefnet-general, u2net
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ANET-image-service"

app = FastAPI(title="ANET image service", version="0.1")

# ───────── lazy-loaded models ─────────
_ocr = None
_rembg_session = None
_lama = None


def get_ocr():
    global _ocr
    if _ocr is None:
        from rapidocr_onnxruntime import RapidOCR  # 日本語/中国語/英語対応、ONNX
        _ocr = RapidOCR()
    return _ocr


def get_rembg():
    global _rembg_session
    if _rembg_session is None:
        from rembg import new_session
        _rembg_session = new_session(REMBG_MODEL)
    return _rembg_session


def get_lama():
    global _lama
    if _lama is None:
        import torch
        from iopaint.model_manager import ModelManager
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _lama = ModelManager(name="lama", device=device)
    return _lama


# ───────── steps ─────────
def step_ocr_inpaint(img: Image.Image, min_conf: float = 0.5, pad: int = 6) -> tuple[Image.Image, int]:
    """文字領域を検出して LaMa で消す。検出 0 件なら元画像を返す。"""
    rgb = img.convert("RGB")
    arr = np.array(rgb)
    result, _ = get_ocr()(arr)
    boxes = []
    for item in result or []:
        box, text, conf = item[0], item[1], float(item[2])
        if conf < min_conf or not str(text).strip():
            continue
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        boxes.append((max(0, int(min(xs)) - pad), max(0, int(min(ys)) - pad), min(arr.shape[1], int(max(xs)) + pad), min(arr.shape[0], int(max(ys)) + pad)))
    if not boxes:
        return rgb, 0
    mask = Image.new("L", rgb.size, 0)
    d = ImageDraw.Draw(mask)
    for b in boxes:
        d.rectangle(b, fill=255)
    mask = mask.filter(ImageFilter.MaxFilter(5))
    from iopaint.schema import InpaintRequest
    out = get_lama()(arr, np.array(mask), InpaintRequest())  # BGR ndarray
    out_img = Image.fromarray(out[:, :, ::-1]) if out.shape[2] == 3 else Image.fromarray(out)
    return out_img.convert("RGB"), len(boxes)


def step_rembg_white(img: Image.Image) -> Image.Image:
    from rembg import remove
    cut = remove(img.convert("RGBA"), session=get_rembg())
    bg = Image.new("RGBA", cut.size, (255, 255, 255, 255))
    bg.alpha_composite(cut)
    return bg.convert("RGB")


def step_square(img: Image.Image, size: int = 1200, margin: float = 0.06) -> Image.Image:
    """白キャンバスに等比で収める（主体が小さすぎる場合は非白領域でトリミングしてから）。"""
    rgb = img.convert("RGB")
    # 非白領域の bbox でトリム（白背景画像のみ効く）
    arr = np.array(rgb)
    nonwhite = np.where((arr < 245).any(axis=2))
    if nonwhite[0].size:
        y0, y1 = nonwhite[0].min(), nonwhite[0].max()
        x0, x1 = nonwhite[1].min(), nonwhite[1].max()
        if (x1 - x0) > 20 and (y1 - y0) > 20:
            rgb = rgb.crop((x0, y0, x1 + 1, y1 + 1))
    inner = int(size * (1 - 2 * margin))
    w, h = rgb.size
    scale = min(inner / w, inner / h)
    rgb = rgb.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), (255, 255, 255))
    canvas.paste(rgb, ((size - rgb.width) // 2, (size - rgb.height) // 2))
    return canvas


# ───────── API ─────────
class ProcessReq(BaseModel):
    url: str
    steps: list[str] = Field(default_factory=lambda: ["ocr_inpaint", "rembg_white", "square"])
    size: int = 1200
    force: bool = False  # True なら既存キャッシュを無視


@app.get("/health")
def health():
    import torch
    return {"ok": True, "cuda": torch.cuda.is_available(), "device": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu", "rembg_model": REMBG_MODEL}


@app.get("/files/{name}")
def files(name: str):
    p = OUT_DIR / name
    if not p.is_file() or p.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
        raise HTTPException(404)
    return FileResponse(p)


@app.post("/process")
async def process(req: ProcessReq):
    t0 = time.time()
    key = hashlib.sha1(f"{req.url}|{','.join(req.steps)}|{req.size}".encode()).hexdigest()[:20]
    out_path = OUT_DIR / f"{key}.png"
    if out_path.exists() and not req.force:
        return {"url": f"{PUBLIC_BASE}/files/{out_path.name}", "cached": True, "steps_applied": req.steps, "ms": 0}

    async with httpx.AsyncClient(timeout=30, headers={"User-Agent": UA}, follow_redirects=True) as c:
        r = await c.get(req.url)
        if r.status_code != 200:
            raise HTTPException(502, f"fetch {r.status_code}")
    try:
        img = Image.open(io.BytesIO(r.content))
        img.load()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(415, f"not an image: {e}")

    applied, text_boxes = [], 0
    for s in req.steps:
        if s == "ocr_inpaint":
            img, text_boxes = step_ocr_inpaint(img)
            applied.append(s)
        elif s == "rembg_white":
            img = step_rembg_white(img)
            applied.append(s)
        elif s == "square":
            img = step_square(img, req.size)
            applied.append(s)
        else:
            raise HTTPException(400, f"unknown step {s}")
    img.convert("RGB").save(out_path, "PNG", optimize=True)
    return {"url": f"{PUBLIC_BASE}/files/{out_path.name}", "cached": False, "steps_applied": applied, "text_boxes": text_boxes, "ms": int((time.time() - t0) * 1000)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=PORT)
