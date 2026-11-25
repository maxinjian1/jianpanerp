# 本机 ComfyUI（127.0.0.1:8188）按文字指令改一张图。三个模型都是 Apache-2.0（可商用）。
#   python tools/comfy/edit.py <klein|qwen|longcat> <输入图> "<英文指令>" <输出.png> [种子] [步数]
#   klein   = FLUX.2 klein 4B（蒸馏版，4 步，最快）
#   qwen    = Qwen-Image-Edit 2511 fp8 + Lightning 4 步 LoRA
#   longcat = LongCat-Image-Edit（美团，50 步，慢）
# 图的参数取自 ComfyUI 自带模板 image_flux2_klein_image_edit_4b_distilled / image_qwen_image_edit_2511 / image_longcat_image_edit。
# 注意：改图模型会重画整张图，商品本体的像素也会变。出图后必须对照原图检查（印字、花纹、形状）。
import json, os, sys, time, uuid, urllib.request, urllib.parse

B = 'http://127.0.0.1:8188'
model, src, prompt, out = sys.argv[1:5]
seed = int(sys.argv[5]) if len(sys.argv) > 5 else 1
steps = int(sys.argv[6]) if len(sys.argv) > 6 else {'klein': 4, 'qwen': 4, 'longcat': 50}[model]

name = 'edit-' + uuid.uuid4().hex[:8] + os.path.splitext(src)[1]
bd = '----b' + uuid.uuid4().hex
body = (f'--{bd}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() \
    + open(src, 'rb').read() + f'\r\n--{bd}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{bd}--\r\n'.encode()
up = json.load(urllib.request.urlopen(urllib.request.Request(B + '/upload/image', body, {'Content-Type': 'multipart/form-data; boundary=' + bd})))
N = lambda c, **i: {'class_type': c, 'inputs': i}
g = {'img': N('LoadImage', image=up['name'])}

if model == 'klein':
    g.update({
        'unet': N('UNETLoader', unet_name='flux-2-klein-4b.safetensors', weight_dtype='default'),
        'clip': N('CLIPLoader', clip_name='qwen_3_4b.safetensors', type='flux2', device='default'),
        'vae': N('VAELoader', vae_name='flux2-vae.safetensors'),
        'scale': N('ImageScaleToTotalPixels', image=['img', 0], upscale_method='lanczos', megapixels=1, resolution_steps=16),
        'size': N('GetImageSize', image=['scale', 0]),
        'pos0': N('CLIPTextEncode', clip=['clip', 0], text=prompt),
        'neg0': N('ConditioningZeroOut', conditioning=['pos0', 0]),
        'enc': N('VAEEncode', pixels=['scale', 0], vae=['vae', 0]),
        'pos': N('ReferenceLatent', conditioning=['pos0', 0], latent=['enc', 0]),
        'neg': N('ReferenceLatent', conditioning=['neg0', 0], latent=['enc', 0]),
        'lat': N('EmptyFlux2LatentImage', width=['size', 0], height=['size', 1], batch_size=1),
        'sig': N('Flux2Scheduler', steps=steps, width=['size', 0], height=['size', 1]),
        'smp': N('KSamplerSelect', sampler_name='euler'),
        'noise': N('RandomNoise', noise_seed=seed),
        'guide': N('CFGGuider', model=['unet', 0], positive=['pos', 0], negative=['neg', 0], cfg=1),
        'run': N('SamplerCustomAdvanced', noise=['noise', 0], guider=['guide', 0], sampler=['smp', 0], sigmas=['sig', 0], latent_image=['lat', 0]),
        'dec': N('VAEDecode', samples=['run', 0], vae=['vae', 0]),
    })
elif model == 'qwen':
    g.update({
        'unet': N('UNETLoader', unet_name='qwen_image_edit_2511_fp8mixed.safetensors', weight_dtype='default'),
        'clip': N('CLIPLoader', clip_name='qwen_2.5_vl_7b_fp8_scaled.safetensors', type='qwen_image', device='default'),
        'vae': N('VAELoader', vae_name='qwen_image_vae.safetensors'),
        'scale': N('FluxKontextImageScale', image=['img', 0]),
        'pos0': N('TextEncodeQwenImageEditPlus', clip=['clip', 0], vae=['vae', 0], image1=['scale', 0], prompt=prompt),
        'neg0': N('TextEncodeQwenImageEditPlus', clip=['clip', 0], vae=['vae', 0], image1=['scale', 0], prompt=''),
        'pos': N('FluxKontextMultiReferenceLatentMethod', conditioning=['pos0', 0], reference_latents_method='index_timestep_zero'),
        'neg': N('FluxKontextMultiReferenceLatentMethod', conditioning=['neg0', 0], reference_latents_method='index_timestep_zero'),
        'm1': N('ModelSamplingAuraFlow', model=['unet', 0], shift=3.1),
        'm2': N('CFGNorm', model=['m1', 0], strength=1),
        'm3': N('LoraLoaderModelOnly', model=['m2', 0], lora_name='Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', strength_model=1),
        'enc': N('VAEEncode', pixels=['scale', 0], vae=['vae', 0]),
        # 追加 LoRA：环境变量 EDIT_LORA=文件名[:强度]（例：qwen-edit-fusion.safetensors 商品融合、qwen-edit-relight.safetensors 重打光）
        'm4': N('LoraLoaderModelOnly', model=['m3', 0], lora_name=os.environ['EDIT_LORA'].split(':')[0],
                strength_model=float((os.environ['EDIT_LORA'].split(':') + ['1'])[1])) if os.environ.get('EDIT_LORA') else N('ModelSamplingAuraFlow', model=['m3', 0], shift=3.1),
        'run': N('KSampler', model=['m4', 0], positive=['pos', 0], negative=['neg', 0], latent_image=['enc', 0], seed=seed,
                 steps=steps, cfg=1, sampler_name='euler', scheduler='simple', denoise=1),
        'dec': N('VAEDecode', samples=['run', 0], vae=['vae', 0]),
    })
elif model == 'longcat':
    g.update({
        'unet': N('UNETLoader', unet_name='longcat_image_edit_bf16.safetensors', weight_dtype='default'),
        'clip': N('CLIPLoader', clip_name='qwen_2.5_vl_7b_fp8_scaled.safetensors', type='longcat_image', device='default'),
        'vae': N('VAELoader', vae_name='ae.safetensors'),
        'scale': N('ImageScaleToTotalPixels', image=['img', 0], upscale_method='lanczos', megapixels=1, resolution_steps=16),
        'pos0': N('TextEncodeQwenImageEdit', clip=['clip', 0], vae=['vae', 0], image=['scale', 0], prompt=prompt),
        'neg0': N('TextEncodeQwenImageEdit', clip=['clip', 0], vae=['vae', 0], image=['scale', 0], prompt=''),
        'pos1': N('FluxGuidance', conditioning=['pos0', 0], guidance=4.5),
        'neg1': N('FluxGuidance', conditioning=['neg0', 0], guidance=4.5),
        'pos': N('FluxKontextMultiReferenceLatentMethod', conditioning=['pos1', 0], reference_latents_method='index'),
        'neg': N('FluxKontextMultiReferenceLatentMethod', conditioning=['neg1', 0], reference_latents_method='index'),
        'enc': N('VAEEncode', pixels=['scale', 0], vae=['vae', 0]),
        'run': N('KSampler', model=['unet', 0], positive=['pos', 0], negative=['neg', 0], latent_image=['enc', 0], seed=seed,
                 steps=steps, cfg=4.5, sampler_name='euler', scheduler='simple', denoise=1),
        'dec': N('VAEDecode', samples=['run', 0], vae=['vae', 0]),
    })
else:
    sys.exit('模型只能是 klein / qwen / longcat')
g['save'] = N('SaveImage', images=['dec', 0], filename_prefix='edit-' + model)

req = urllib.request.Request(B + '/prompt', json.dumps({'prompt': g}).encode(), {'Content-Type': 'application/json'})
try:
    pid = json.load(urllib.request.urlopen(req))['prompt_id']
except urllib.error.HTTPError as e:
    print('拒绝:', e.read().decode()[:2500]); sys.exit(1)
t0 = time.time()
while True:
    hist = json.load(urllib.request.urlopen(f'{B}/history/{pid}'))
    if pid in hist:
        st = hist[pid].get('status', {})
        if st.get('status_str') == 'error': print('出错:', json.dumps(st, ensure_ascii=False)[:2500]); sys.exit(1)
        imgs = [i for o in hist[pid]['outputs'].values() for i in o.get('images', [])]
        if imgs: break
    if time.time() - t0 > 3600: print('超时'); sys.exit(1)
    time.sleep(2)
i = imgs[0]
data = urllib.request.urlopen(B + '/view?' + urllib.parse.urlencode({'filename': i['filename'], 'subfolder': i['subfolder'], 'type': i['type']})).read()
open(out, 'wb').write(data)
print('ok', model, out, len(data), '字节', round(time.time() - t0), '秒')
