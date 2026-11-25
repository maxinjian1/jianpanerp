# A+ 图：6kpro 指挥（写背景提示词与日文文案、看图打分）+ 本机 ComfyUI 出背景（Z-Image Turbo）+ 4x 放大
# + 实拍图抠图合成（商品像素不经 AI 重画）+ amazon-visual-19 导出 1464×600 / 970×300。
#   PY=apps/image-service/venv/Scripts/python.exe
#   $PY -I tools/amazon-a-plus/aplus_comfy.py <sku> direct            6kpro 写 direction.json（背景提示词 + 文案）
#   $PY -I tools/amazon-a-plus/aplus_comfy.py <sku> render [A01,A03]  出背景 → 放大 → 合成 → work/raw/Axx.png（2928×1200）
#   $PY -I tools/amazon-a-plus/aplus_comfy.py <sku> review [A01]      6kpro 逐张打分 → review.json（附修改后的提示词）
#   $PY -I tools/amazon-a-plus/aplus_comfy.py <sku> redo              综合分 < 7 的换提示词/种子重做一次
#   $PY -I tools/amazon-a-plus/aplus_comfy.py <sku> preview           带文字位置示意的总览 preview.jpg + HD 成品 hd/
# 输入：tools/amazon-a-plus/inputs/<sku>/product.json（事实）、modules.json（每张图放哪张实拍、放哪里）
# 规则：AI 只画背景（无人、无字、无商品）；日文只由代码渲染；文案只用 product.json 里的事实；上传前用户确认。
import base64, io, json, os, re, subprocess, sys, time, urllib.request
from PIL import Image, ImageDraw, ImageFilter, ImageFont

sys.stdout.reconfigure(encoding='utf-8')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sku, cmd = sys.argv[1], sys.argv[2]
only = sys.argv[3].split(',') if len(sys.argv) > 3 else None
IN = os.path.join(ROOT, 'tools/amazon-a-plus/inputs', sku)
OUT = os.path.join(ROOT, 'tools/amazon-a-plus/output', sku)
WORK = os.path.join(OUT, 'work'); os.makedirs(os.path.join(WORK, 'raw'), exist_ok=True)
COMFY = os.path.join(ROOT, 'tools/comfy')
PROD = json.load(open(os.path.join(IN, 'product.json'), encoding='utf-8'))
MODS = json.load(open(os.path.join(IN, 'modules.json'), encoding='utf-8'))
W, H = 2928, 1200                      # 母稿 = A+ 1464×600 的 2 倍
J = lambda p, d=None: json.load(open(p, encoding='utf-8')) if os.path.exists(p) else d
def save(p, o): json.dump(o, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
run = lambda *a: subprocess.run([sys.executable, '-I', *a], check=True)
F = lambda s, b=True: ImageFont.truetype('C:/Windows/Fonts/YuGothB.ttc' if b else 'C:/Windows/Fonts/YuGothM.ttc', s)
DIRP, REVP = os.path.join(OUT, 'direction.json'), os.path.join(OUT, 'review.json')


def llm(text, images=(), max_tokens=8000):
    env = dict(re.findall(r'^([A-Z_0-9]+)=(.*)$', open(os.path.join(ROOT, '.env'), encoding='utf-8').read(), re.M))
    g = lambda k, d='': env.get(k, d).strip().strip('"')
    content = [{'type': 'text', 'text': text}]
    for im in images:
        im = im.convert('RGB'); im.thumbnail((1464, 1464)); b = io.BytesIO(); im.save(b, 'JPEG', quality=90)
        content.append({'type': 'image_url', 'image_url': {'url': 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()}})
    body = {'model': g('CN_LLM_VISION_MODEL') or g('CN_LLM_MODEL', 'GLM-5.3-Flash'), 'messages': [{'role': 'user', 'content': content}],
            'max_tokens': max_tokens, 'temperature': 0.3, 'reasoning_effort': 'low'}   # high 会把输出额度全用在思考上
    h = {'Content-Type': 'application/json'}
    if g('CN_LLM_API_KEY'): h['Authorization'] = 'Bearer ' + g('CN_LLM_API_KEY')
    url = g('CN_LLM_BASE_URL', 'http://100.82.2.101:8199/v1').rstrip('/') + '/chat/completions'
    r = json.load(urllib.request.urlopen(urllib.request.Request(url, json.dumps(body).encode(), h), timeout=600))
    t = r['choices'][0]['message'].get('content') or ''
    m = re.search(r'\{.*\}', t, re.S)
    if not m: raise SystemExit('6kpro 没有返回 JSON：' + t[:400])
    return json.loads(m.group(0))


FACTS = json.dumps({k: PROD[k] for k in ('brand', 'product_name', 'selling_points', 'specifications', 'restrictions')}, ensure_ascii=False)
BG_RULES = '''背景由 Z-Image Turbo 生成，画幅是很宽的横幅（宽:高 = 2.44:1）。商品不由 AI 画，而是把实拍照片抠图后贴上去。所以背景提示词必须：
- 英文，一段话，以 "Professional advertising background photograph," 开头；
- 写清楚画面右半边有什么可以放商品的东西（modules 里的 surface 说明），并且要清晰对焦、空着；
- 画面左半边要简洁、柔和虚化（Amazon 的文字框固定盖在左半边）；
- 光线方向、时间、季节写具体；适合日本的儿童夏季外出用品；
- 不要在提示词里提到「圆形小窗、标签、文字框、overlay、cutout」等之后才贴上去的东西（模型会真的画出一个白色圆或方块）；
- 台面上必须是空的（写 "the surface is completely empty, nothing on it"），不要瓶子、管子、杯子、玩具等任何物品；远处也不要出现行人；
- 结尾必须有 "no people, no text, no letters, no logos, no products, no hats"。'''


def direct():
    q = f'''你是电商视觉总监，为 Amazon.co.jp 的 A+（商品紹介コンテンツ）指挥 5 张横幅图。
商品事实（只能用这些，不能添加任何没有写的数值、素材、功效）：
{FACTS}

5 张图的构成（实拍图怎么放已经定好）：
{json.dumps([{k: m[k] for k in ('id', 'theme', 'surface')} for m in MODS], ensure_ascii=False)}

{BG_RULES}

每张图另外写日文文案：headline（20 字以内）、body（60 字以内，です・ます体）。禁止：价格、送料、No.1/最強/人気/ランキング、医疗或保护效果的断言（例如「紫外線から守る」「肌を守る」「安全」）、UV 的任何数值、他社名。5 张的背景场景要互不相同。
只输出 JSON：{{"modules":[{{"id":"A01","scene":"中文一句话说明场景","bg_prompt":"...","headline":"...","body":"..."}}, ...]}}'''
    d = llm(q, [Image.open(os.path.join(IN, PROD['assets']['hero_white']))])
    for m in d['modules']: m['seed'] = 1
    save(DIRP, d); print(json.dumps(d, ensure_ascii=False, indent=1))


def cutout(src):
    """实拍图 → （小图先 4x 放大）→ rembg 抠图，缓存到 work/cut-<名>.png"""
    p = os.path.join(WORK, 'cut-' + os.path.splitext(os.path.basename(src))[0] + '.png')
    if not os.path.exists(p):
        im = Image.open(os.path.join(IN, src)).convert('RGB'); t = os.path.join(WORK, 'tmp-src.png'); im.save(t)
        if max(im.size) < 1600: run(os.path.join(COMFY, 'upscale.py'), t, t)
        from rembg import remove, new_session
        c = remove(Image.open(t).convert('RGB'), session=new_session('birefnet-general')); c.crop(c.getbbox()).save(p)
    return Image.open(p).convert('RGBA')


def render(ids):
    d = {m['id']: m for m in J(DIRP)['modules']}
    for M in MODS:
        i = M['id']
        if ids and i not in ids: continue
        bgp, key = os.path.join(WORK, f'bg-{i}.png'), os.path.join(WORK, f'bg-{i}.key')
        sig = d[i]['bg_prompt'] + '|' + str(d[i].get('seed', 1))
        if not os.path.exists(bgp) or (open(key, encoding='utf-8').read() if os.path.exists(key) else '') != sig:
            raw = os.path.join(WORK, f'bg-{i}-raw.png')
            run(os.path.join(COMFY, 'zimage.py'), d[i]['bg_prompt'], raw, '1952', '800', str(d[i].get('seed', 1)))
            run(os.path.join(COMFY, 'upscale.py'), raw, bgp)                         # 4x → 7808×3200
            Image.open(bgp).convert('RGB').resize((W, H), Image.LANCZOS).save(bgp); open(key, 'w', encoding='utf-8').write(sig)
        bg = Image.open(bgp).convert('RGBA'); dr = ImageDraw.Draw(bg)
        for it in M['items']:
            if it.get('circle'):                                                    # 细节圆形小窗（实拍裁切）
                im = Image.open(os.path.join(IN, it['src'])).convert('RGB'); s = min(im.size); x0, y0 = [round((a - s) * b) for a, b in zip(im.size, it.get('at', (0.5, 0.5)))]
                r = round(H * it['circle']); im = im.crop((x0, y0, x0 + s, y0 + s)).resize((2 * r, 2 * r), Image.LANCZOS)
                cx, cy = round(W * it['cx']), round(H * it['cy']); mk = Image.new('L', (2 * r, 2 * r), 0); ImageDraw.Draw(mk).ellipse((0, 0, 2 * r, 2 * r), fill=255)
                sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse((cx - r - 8, cy - r + 10, cx + r + 8, cy + r + 26), fill=(0, 0, 0, 120))
                bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18))); dr.ellipse((cx - r - 12, cy - r - 12, cx + r + 12, cy + r + 12), fill=(255, 255, 255, 255)); bg.paste(im, (cx - r, cy - r), mk)
                continue
            c = cutout(it['src']); ph = round(H * it['h']); c = c.resize((round(c.width * ph / c.height), ph), Image.LANCZOS)
            x, base = round(W * it['cx'] - c.width / 2), round(H * it['base'])
            if it.get('shadow', True):                                               # 接触阴影（椭圆）
                sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); k = it.get('shadow_y', 0.13)
                ImageDraw.Draw(sh).ellipse((x + c.width * 0.04, base - ph * k * 1.6, x + c.width * 0.96, base - ph * k * 0.2), fill=(0, 0, 0, it.get('shadow_a', 130)))
                bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(26)))
                a = c.getchannel('A').point(lambda v: v * it.get('contact_a', 150) // 255)   # 贴着轮廓下沿的接触阴影（含下巴绳）
                ct = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ct.paste(Image.new('RGBA', c.size, (0, 0, 0, 255)), (x + 6, base - ph + 14), a)
                bg.alpha_composite(ct.filter(ImageFilter.GaussianBlur(9)))
            bg.alpha_composite(c, (x, base - ph))
        for L in M.get('labels', []):                                                # 尺寸等事实标签（代码渲染）
            cx, y = round(W * L['cx']), round(H * L['y']); lines = L['lines']; fs = [F(60)] + [F(46, False)] * (len(lines) - 1)
            w = max(dr.textlength(s, font=f) for s, f in zip(lines, fs)) + 90; hh = 60 + sum(f.size * 1.5 for f in fs)
            dr.rounded_rectangle((cx - w / 2, y, cx + w / 2, y + hh), 34, fill=(255, 255, 255, 235)); yy = y + 30
            for n, (s, f) in enumerate(zip(lines, fs)):
                dr.text((cx, yy), s, font=f, fill=(34, 62, 120) if n == 0 else (50, 54, 66), anchor='ma'); yy += f.size * 1.5
        bg.convert('RGB').save(os.path.join(WORK, 'raw', i + '.png')); print('ok', i)


def review(ids):
    d = {m['id']: m for m in J(DIRP)['modules']}; R = J(REVP, {})
    hero = Image.open(os.path.join(IN, PROD['assets']['hero_white']))
    for M in MODS:
        i = M['id']
        if ids and i not in ids: continue
        q = f'''图1 是 Amazon A+ 横幅图 {i}（主题：{M['theme']}）。背景是 AI 生成的，商品是把实拍照片（图2）抠图后贴上去的，所以商品花纹本身不会错；要检查的是合成是否自然。
生成背景用的提示词："{d[i]['bg_prompt']}"
{BG_RULES}
请只根据图里看得到的内容打分（每项 0〜10），看不清就写看不清：
- prompt：这条提示词本身写得好不好
- background：背景是否真实、好看、适合儿童夏季外出用品；有没有出现人、文字、招牌、别的商品或帽子（有就写进 issues，并且 background ≤ 4）
- placement：商品是否像真的放在那个面上（大小比例、接触阴影、有没有悬空、光线方向是否和背景一致）
- left_space：左半边是否干净，能盖一个白色文字框
- overall：综合
只输出 JSON：{{"prompt":0,"background":0,"placement":0,"left_space":0,"overall":0,"issues":["..."],"new_bg_prompt":"改进后的英文背景提示词（必须改动，针对 issues）"}}'''
        r = llm(q, [Image.open(os.path.join(WORK, 'raw', i + '.png')), hero], 4000)
        R.setdefault(i, []).append({'seed': d[i].get('seed', 1), 'bg_prompt': d[i]['bg_prompt'], **r}); save(REVP, R)
        print(i, {k: r.get(k) for k in ('prompt', 'background', 'placement', 'left_space', 'overall')}, r.get('issues'))


def redo():
    D = J(DIRP); R = J(REVP, {}); ids = []
    for m in D['modules']:
        last = (R.get(m['id']) or [{}])[-1]
        if last.get('overall', 10) < 7 and len(R[m['id']]) < 3:
            m['bg_prompt'] = last.get('new_bg_prompt') or m['bg_prompt']; m['seed'] = m.get('seed', 1) + 1; ids.append(m['id'])
    save(DIRP, D); print('重做', ids)
    if ids: render(ids); review(ids)


def preview():
    d = {m['id']: m for m in J(DIRP)['modules']}; hd = os.path.join(OUT, 'hd'); os.makedirs(hd, exist_ok=True)
    sheet = Image.new('RGB', (1464, (600 + 16) * len(MODS)), 'white')
    for n, M in enumerate(MODS):
        i = M['id']; im = Image.open(os.path.join(WORK, 'raw', i + '.png')).convert('RGB')
        im.save(os.path.join(hd, f'{sku}-{i}-2928x1200.jpg'), quality=95, subsampling=0)
        p = im.resize((1464, 600), Image.LANCZOS).convert('RGBA'); box = Image.new('RGBA', p.size, (0, 0, 0, 0)); b = ImageDraw.Draw(box)
        b.rounded_rectangle((56, 150, 620, 450), 10, fill=(255, 255, 255, 225)); p.alpha_composite(box); b = ImageDraw.Draw(p)   # 文字框位置示意（实际由 Amazon 模块渲染）
        f = F(38)
        while b.textlength(d[i]['headline'], font=f) > 500: f = F(f.size - 2)
        b.text((88, 190), d[i]['headline'], font=f, fill=(20, 24, 40)); y = 262; line = ''
        for ch in d[i]['body']:
            if b.textlength(line + ch, font=F(24, False)) > 500: b.text((88, y), line, font=F(24, False), fill=(60, 64, 76)); y += 40; line = ''
            line += ch
        b.text((88, y), line, font=F(24, False), fill=(60, 64, 76)); sheet.paste(p.convert('RGB'), (0, n * 616))
    sheet.save(os.path.join(OUT, 'preview.jpg'), quality=90); print('ok', os.path.join(OUT, 'preview.jpg'))


{'direct': direct, 'render': lambda: render(only), 'review': lambda: review(only), 'redo': redo, 'preview': preview}[cmd]()
