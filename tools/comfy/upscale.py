# 本机 ComfyUI（127.0.0.1:8188）用 4x-UltraSharp 把一张图放大 4 倍（只放大，不重画内容）。
#   python tools/comfy/upscale.py <输入图> <输出.png>
import json, os, sys, time, uuid, urllib.request, urllib.parse

B = 'http://127.0.0.1:8188'
src, out = sys.argv[1], sys.argv[2]
name = 'up-' + uuid.uuid4().hex[:8] + os.path.splitext(src)[1]
bd = '----b' + uuid.uuid4().hex
body = (f'--{bd}\r\nContent-Disposition: form-data; name="image"; filename="{name}"\r\nContent-Type: application/octet-stream\r\n\r\n').encode() \
    + open(src, 'rb').read() + f'\r\n--{bd}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n--{bd}--\r\n'.encode()
up = json.load(urllib.request.urlopen(urllib.request.Request(B + '/upload/image', body, {'Content-Type': 'multipart/form-data; boundary=' + bd})))
g = {
    '1': {'class_type': 'LoadImage', 'inputs': {'image': up['name']}},
    '2': {'class_type': 'UpscaleModelLoader', 'inputs': {'model_name': '4x-UltraSharp.pth'}},
    '3': {'class_type': 'ImageUpscaleWithModel', 'inputs': {'upscale_model': ['2', 0], 'image': ['1', 0]}},
    '4': {'class_type': 'SaveImage', 'inputs': {'images': ['3', 0], 'filename_prefix': 'upscale'}},
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
    if time.time() - t0 > 900: print('超时'); sys.exit(1)
    time.sleep(1)
i = imgs[0]
data = urllib.request.urlopen(B + '/view?' + urllib.parse.urlencode({'filename': i['filename'], 'subfolder': i['subfolder'], 'type': i['type']})).read()
open(out, 'wb').write(data)
print('ok', out, len(data), '字节', round(time.time() - t0), '秒')
