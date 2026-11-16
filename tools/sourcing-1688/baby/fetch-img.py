"""spec.json の画像（gal + 色画像 + col）を 1688 CDN から取得 → out/baby/img/<mn>/<id>.jpg"""
import json, os, urllib.request, concurrent.futures as cf
B = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(B, '..', 'out', 'baby', 'img')
spec = json.load(open(os.path.join(B, 'spec.json'), encoding='utf-8'))['products']
jobs = []
for p in spec:
    ids = list(dict.fromkeys(p['gal'] + [v[-3] for v in p['v'] if v[-3]] + p.get('col', [])))
    d = os.path.join(OUT, p['mn']); os.makedirs(d, exist_ok=True)
    for i in ids: jobs.append((p, i, os.path.join(d, i + '.jpg')))
def get(j):
    p, i, f = j
    if os.path.exists(f) and os.path.getsize(f) > 2000: return None
    u = f"https://cbu01.alicdn.com/img/ibank/O1CN01{i}_!!{p['sel']}-0-cib.jpg"
    try:
        req = urllib.request.Request(u, headers={'User-Agent': 'Mozilla/5.0', 'Referer': 'https://detail.1688.com/'})
        data = urllib.request.urlopen(req, timeout=30).read(); open(f, 'wb').write(data); return None
    except Exception as e: return f"{p['mn']} {i} {e}"
with cf.ThreadPoolExecutor(6) as ex:
    errs = [r for r in ex.map(get, jobs) if r]
print(len(jobs), 'images, errors', len(errs)); print('\n'.join(errs[:30]))
