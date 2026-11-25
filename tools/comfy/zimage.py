# 本机 ComfyUI（127.0.0.1:8188）用 Z-Image Turbo 出一张图。
#   python tools/comfy/zimage.py "<英文提示词>" <输出.png> [宽 高 种子]
# 模型：diffusion_models/z_image_turbo_bf16.safetensors、text_encoders/qwen_3_4b.safetensors、vae/z_image_ae.safetensors（Apache-2.0）
# 参数取自 ComfyUI 自带模板 image_z_image_turbo.json：8 步、cfg 1、res_multistep/simple、ModelSamplingAuraFlow shift 3。
import json, sys, time, urllib.request, urllib.parse

B = 'http://127.0.0.1:8188'
prompt, out = sys.argv[1], sys.argv[2]
w, h, seed = (int(x) for x in (sys.argv[3:6] + ['1024', '1024', '1'][len(sys.argv[3:6]):]))
g = {
    '1': {'class_type': 'UNETLoader', 'inputs': {'unet_name': 'z_image_turbo_bf16.safetensors', 'weight_dtype': 'default'}},
    '2': {'class_type': 'CLIPLoader', 'inputs': {'clip_name': 'qwen_3_4b.safetensors', 'type': 'lumina2', 'device': 'default'}},
    '3': {'class_type': 'VAELoader', 'inputs': {'vae_name': 'z_image_ae.safetensors'}},
    '4': {'class_type': 'ModelSamplingAuraFlow', 'inputs': {'model': ['1', 0], 'shift': 3}},
    '5': {'class_type': 'CLIPTextEncode', 'inputs': {'clip': ['2', 0], 'text': prompt}},
    '6': {'class_type': 'ConditioningZeroOut', 'inputs': {'conditioning': ['5', 0]}},
    '7': {'class_type': 'EmptySD3LatentImage', 'inputs': {'width': w, 'height': h, 'batch_size': 1}},
    '8': {'class_type': 'KSampler', 'inputs': {'model': ['4', 0], 'positive': ['5', 0], 'negative': ['6', 0], 'latent_image': ['7', 0], 'seed': seed,
                                               'steps': 8, 'cfg': 1, 'sampler_name': 'res_multistep', 'scheduler': 'simple', 'denoise': 1}},
    '9': {'class_type': 'VAEDecode', 'inputs': {'samples': ['8', 0], 'vae': ['3', 0]}},
    '10': {'class_type': 'SaveImage', 'inputs': {'images': ['9', 0], 'filename_prefix': 'zimage'}},
}
req = urllib.request.Request(B + '/prompt', json.dumps({'prompt': g}).encode(), {'Content-Type': 'application/json'})
try:
    pid = json.load(urllib.request.urlopen(req))['prompt_id']
except urllib.error.HTTPError as e:
    print('拒绝:', e.read().decode()[:1500]); sys.exit(1)
t0 = time.time()
while True:
    hist = json.load(urllib.request.urlopen(f'{B}/history/{pid}'))
    if pid in hist:
        st = hist[pid].get('status', {})
        if st.get('status_str') == 'error': print('出错:', json.dumps(st, ensure_ascii=False)[:1500]); sys.exit(1)
        imgs = [i for o in hist[pid]['outputs'].values() for i in o.get('images', [])]
        if imgs: break
    if time.time() - t0 > 1200: print('超时'); sys.exit(1)
    time.sleep(2)
i = imgs[0]
data = urllib.request.urlopen(B + '/view?' + urllib.parse.urlencode({'filename': i['filename'], 'subfolder': i['subfolder'], 'type': i['type']})).read()
open(out, 'wb').write(data)
print('ok', out, len(data), '字节', round(time.time() - t0), '秒')
