#!/bin/bash
# 下载本机 ComfyUI 的可商用模型（全部 Apache-2.0，官方 Comfy-Org 仓库 + lightx2v 加速 LoRA）。可重复执行（断点续传）。
#   bash tools/comfy/download-models.sh
M=/c/ComfyUI/models; H=https://huggingface.co
get() { # 目录 文件名 URL
  mkdir -p "$M/$1"; echo "== $2"; curl -L -C - --retry 20 --retry-delay 5 -sS -o "$M/$1/$2" "$3"
  # curl 断流时也可能返回成功 → 必须和仓库里的大小比对（2026-11-25 qwen_image_vae 少了 37MB，重跑续传即可）
  r=$(curl -sIL "$3" | grep -i '^x-linked-size' | tail -1 | tr -dc 0-9); l=$(stat -c %s "$M/$1/$2")
  if [ "$r" = "$l" ]; then echo "ok $2 $l"; else echo "不完整 $2 本地 $l / 应为 $r（重跑本脚本续传）"; BAD=1; fi
}
get vae              flux2-vae.safetensors                    $H/Comfy-Org/Flux-2-Klein-4B/resolve/main/split_files/vae/flux2-vae.safetensors
get diffusion_models flux-2-klein-4b.safetensors              $H/Comfy-Org/Flux-2-Klein-4B/resolve/main/split_files/diffusion_models/flux-2-klein-4b.safetensors
get vae              qwen_image_vae.safetensors               $H/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/vae/qwen_image_vae.safetensors
get loras            Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors $H/lightx2v/Qwen-Image-Edit-2511-Lightning/resolve/main/Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors
get text_encoders    qwen_2.5_vl_7b_fp8_scaled.safetensors    $H/Comfy-Org/Qwen-Image_ComfyUI/resolve/main/split_files/text_encoders/qwen_2.5_vl_7b_fp8_scaled.safetensors
get diffusion_models longcat_image_edit_bf16.safetensors      $H/Comfy-Org/LongCat-Image/resolve/main/split_files/diffusion_models/longcat_image_edit_bf16.safetensors
get diffusion_models qwen_image_edit_2511_fp8mixed.safetensors $H/Comfy-Org/Qwen-Image-Edit/resolve/main/split_files/diffusion_models/qwen_image_edit_2511_fp8mixed.safetensors
[ -z "$BAD" ] && echo ALL-DONE || { echo "有文件不完整"; exit 1; }
