"""kit/svg 의 원본 SVG → 크기별 PNG(투명)·JPG(바탕색)·ICO.
SVG 는 헤드리스 Chrome 으로 큰 크기(투명 바탕)로 한 번 그린 뒤 PIL 로 줄인다.
16·24px 는 굵은 단순화판(-small.svg)에서 만든다.
"""
import os, re, subprocess, tempfile, shutil
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
KIT = os.path.join(HERE, 'kit')
SVG = os.path.join(KIT, 'svg')
PNG = os.path.join(KIT, 'png')
JPG = os.path.join(KIT, 'jpg')
ICO = os.path.join(KIT, 'favicon')
for d in (PNG, JPG, ICO):
    os.makedirs(d, exist_ok=True)
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
TMP = tempfile.mkdtemp(prefix='msc-kit-')
PROFILE = os.path.join(TMP, 'profile')

NAVY, BLACK, WHITE = (10, 31, 68), (10, 11, 15), (255, 255, 255)


def svg_size(path):
    t = open(path, encoding='utf-8').read()
    m = re.search(r'viewBox="0 0 ([\d.]+) ([\d.]+)"', t)
    return float(m.group(1)), float(m.group(2))


def render(name, width):
    """SVG 를 가로 width px 로 투명 PNG 렌더 → PIL Image"""
    src = os.path.join(SVG, name)
    w, h = svg_size(src)
    W, H = int(round(width)), int(round(width * h / w))
    html = os.path.join(TMP, 'r.html')
    uri = 'file:///' + src.replace('\\', '/')
    with open(html, 'w', encoding='utf-8') as f:
        f.write(f'<!doctype html><html><head><meta charset="utf-8"><style>html,body{{margin:0;background:transparent;overflow:hidden}}img{{display:block;width:{W}px;height:{H}px}}</style></head><body><img src="{uri}"></body></html>')
    out = os.path.join(TMP, 'r.png')
    if os.path.exists(out):
        os.remove(out)
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--hide-scrollbars', f'--window-size={W},{H}',
                    '--default-background-color=00000000', '--virtual-time-budget=2000', '--force-device-scale-factor=1',
                    f'--user-data-dir={PROFILE}', f'--screenshot={out}', 'file:///' + html.replace('\\', '/')],
                   capture_output=True, timeout=120)
    return Image.open(out).convert('RGBA').crop((0, 0, W, H))


def save_png_jpg(img, stem, bg):
    img.save(os.path.join(PNG, stem + '.png'), optimize=True)
    flat = Image.new('RGB', img.size, bg)
    flat.paste(img, mask=img.split()[3])
    flat.save(os.path.join(JPG, stem + '.jpg'), quality=95, subsampling=0)


EMBLEMS = {   # 이름: JPG 바탕
    'color': WHITE, 'color-ondark': NAVY, 'mark-dark': NAVY, 'mark-light': WHITE, 'mono-black': WHITE, 'mono-white': BLACK,
}
E_SIZES = [32, 48, 64, 128, 180, 192, 256, 512, 1024]
SMALL_SIZES = [16, 24]
LOCKUPS = {
    'msc-lockup-horizontal-light': WHITE, 'msc-lockup-horizontal-dark': NAVY,
    'msc-lockup-horizontal-light-nosub': WHITE, 'msc-lockup-horizontal-dark-nosub': NAVY,
    'msc-lockup-horizontal-mono-black': WHITE, 'msc-lockup-horizontal-mono-white': BLACK,
    'msc-lockup-stacked-light': WHITE, 'msc-lockup-stacked-dark': NAVY,
    'msc-wordmark-light': WHITE, 'msc-wordmark-dark': NAVY, 'msc-wordmark-light-sub': WHITE, 'msc-wordmark-dark-sub': NAVY,
}
L_WIDTHS = [320, 640, 1280, 2560]

count = 0
for v, bg in EMBLEMS.items():
    big = render(f'msc-emblem-{v}.svg', 2048)
    for s in E_SIZES:
        save_png_jpg(big.resize((s, s), Image.LANCZOS), f'msc-emblem-{v}-{s}', bg); count += 1
    small = render(f'msc-emblem-{v}-small.svg', 1024)
    for s in SMALL_SIZES:
        save_png_jpg(small.resize((s, s), Image.LANCZOS), f'msc-emblem-{v}-{s}', bg); count += 1
for name, bg in LOCKUPS.items():
    big = render(f'{name}.svg', 3200)
    for w in L_WIDTHS:
        h = round(big.height * w / big.width)
        save_png_jpg(big.resize((w, h), Image.LANCZOS), f'{name}-{w}w', bg); count += 1
seal = render('msc-seal-verified.svg', 2048)
for s in [128, 256, 512, 1024]:
    save_png_jpg(seal.resize((s, s), Image.LANCZOS), f'msc-seal-verified-{s}', WHITE); count += 1

# 파비콘: 16·24 는 단순화판, 32·48·64 는 기본판 / 웹앱 아이콘
fav = {s: Image.open(os.path.join(PNG, f'msc-emblem-color-{s}.png')) for s in [16, 24, 32, 48, 64]}
fav[64].save(os.path.join(ICO, 'favicon.ico'), sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64)], append_images=[fav[16], fav[24], fav[32], fav[48]])
shutil.copy(os.path.join(PNG, 'msc-emblem-color-180.png'), os.path.join(ICO, 'apple-touch-icon.png'))
shutil.copy(os.path.join(PNG, 'msc-emblem-color-192.png'), os.path.join(ICO, 'icon-192.png'))
shutil.copy(os.path.join(PNG, 'msc-emblem-color-512.png'), os.path.join(ICO, 'icon-512.png'))
shutil.copy(os.path.join(SVG, 'msc-emblem-color.svg'), os.path.join(ICO, 'favicon.svg'))
shutil.rmtree(TMP, ignore_errors=True)
print('PNG·JPG 쌍', count, '| PNG', len(os.listdir(PNG)), '| JPG', len(os.listdir(JPG)), '| favicon', len(os.listdir(ICO)))
