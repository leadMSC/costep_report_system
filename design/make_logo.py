"""CoStep 로고 벡터 생성기.

마크(굵은 C + 위로 오르는 스텝 날)와 워드마크(Noto Sans KR Bold 윤곽선)를 SVG 로 만든다.
실행: python design/make_logo.py  →  design/logo/*.svg
"""
import math
import os

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen
from fontTools.varLib.instancer import instantiateVariableFont

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo')
FONT = r'C:\Windows\Fonts\NotoSansKR-VF.ttf'

R_OUT, R_IN = 50.0, 30.0          # 고리 바깥·안쪽 반지름 (두께 20)


def pt(r, deg):
    a = math.radians(deg)
    return r * math.cos(a), r * math.sin(a)


def sector(o1, o2, i1, i2):
    """바깥 o1→o2, 안쪽 i2→i1 로 닫는 고리 조각. 각도는 화면 기준(y 아래), 감소 방향 = 반시계."""
    span = abs(o2 - o1)
    large = 1 if span > 180 else 0
    sweep_out = 0 if o2 < o1 else 1
    x1, y1 = pt(R_OUT, o1); x2, y2 = pt(R_OUT, o2)
    x3, y3 = pt(R_IN, i2); x4, y4 = pt(R_IN, i1)
    large_in = 1 if abs(i2 - i1) > 180 else 0
    return (f'M{x1:.2f},{y1:.2f} A{R_OUT},{R_OUT} 0 {large} {sweep_out} {x2:.2f},{y2:.2f} '
            f'L{x3:.2f},{y3:.2f} A{R_IN},{R_IN} 0 {large_in} {1 - sweep_out} {x4:.2f},{y4:.2f} Z')


# 몸통: 왼쪽 위에서 반시계로 돌아 오른쪽 아래(42°)까지. 아래 끝은 바깥이 더 길어 날렵하게, 위 끝은 스텝 날과 평행한 사선 틈
BODY = sector(-132, -318, -104, -324)
# 스텝 날: 몸통과 사선 틈(원본의 칼선)을 두고 위쪽을 감싸며, 끝은 바깥이 길어 오른쪽으로 뻗는다
BLADE = sector(-126, -36, -98, -60)


def mark_bbox():
    xs, ys = [], []
    for (o1, o2, i1, i2) in [(-132, -318, -104, -324), (-126, -36, -98, -60)]:
        for k in range(0, 201):
            t = k / 200
            for r, a1, a2 in [(R_OUT, o1, o2), (R_IN, i1, i2)]:
                x, y = pt(r, a1 + (a2 - a1) * t)
                xs.append(x); ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


def wordmark(text='CoStep', weight=700, size=100.0, tracking=-0.01):
    vf = TTFont(FONT)
    font = instantiateVariableFont(vf, {'wght': weight})
    gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
    scale = size / upm
    x = 0.0; paths = []; minx = miny = 1e9; maxx = maxy = -1e9
    for ch in text:
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        # 글꼴 좌표(y 위)를 SVG(y 아래)로 뒤집고 크기 맞춤
        gs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 0)))
        paths.append(pen.getCommands())
        bp = BoundsPen(gs); gs[name].draw(bp)
        if bp.bounds:
            b = bp.bounds
            minx = min(minx, x + b[0] * scale); maxx = max(maxx, x + b[2] * scale)
            miny = min(miny, -b[3] * scale); maxy = max(maxy, -b[1] * scale)
        x += gs[name].width * scale + tracking * size
    return ' '.join(paths), (minx, miny, maxx, maxy)


GRAD = '''<defs><linearGradient id="csStep" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#00E0C6"/><stop offset="1" stop-color="#FFC300"/></linearGradient></defs>'''

STYLES = {
    'black': ('#0A0B0F', '#0A0B0F', '#0A0B0F', ''),
    'white': ('#FFFFFF', '#FFFFFF', '#FFFFFF', ''),
    'color': ('#0A1F44', 'url(#csStep)', '#0A1F44', GRAD),        # 밝은 바탕용
    'color-dark': ('#FFFFFF', 'url(#csStep)', '#FFFFFF', GRAD),   # 어두운 바탕용
}


def svg(w, h, body, defs, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.1f} {h:.1f}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{defs}{body}</svg>\n')


def main():
    os.makedirs(OUT, exist_ok=True)
    bx0, by0, bx1, by1 = mark_bbox()
    mw, mh = bx1 - bx0, by1 - by0
    word, (wx0, wy0, wx1, wy1) = wordmark()
    ww, wh = wx1 - wx0, wy1 - wy0
    pad = 8
    for key, (c_body, c_blade, c_word, defs) in STYLES.items():
        mark = f'<path d="{BODY}" fill="{c_body}"/><path d="{BLADE}" fill="{c_blade}"/>'
        # 1) 마크 단독: 실제 도형 경계 기준으로 정확히 가운데
        W = H = max(mw, mh) + pad * 2
        g = f'<g transform="translate({W / 2 - (bx0 + bx1) / 2:.2f},{H / 2 - (by0 + by1) / 2:.2f})">{mark}</g>'
        open(os.path.join(OUT, f'costep-mark-{key}.svg'), 'w', encoding='utf-8').write(svg(W, H, g, defs, 'CoStep'))
        # 2) 세로형: 마크 높이 = 워드마크 폭의 46%, 둘 다 가로 가운데 정렬
        ms = (ww * 0.46) / mh
        gap = wh * 0.55
        W = ww + pad * 4
        H = mh * ms + gap + wh + pad * 4
        mx = W / 2 - (bx0 + bx1) / 2 * ms
        my = pad * 2 - by0 * ms
        wxp = W / 2 - (wx0 + wx1) / 2
        wyp = pad * 2 + mh * ms + gap - wy0
        body = (f'<g transform="translate({mx:.2f},{my:.2f}) scale({ms:.4f})">{mark}</g>'
                f'<path transform="translate({wxp:.2f},{wyp:.2f})" d="{word}" fill="{c_word}"/>')
        open(os.path.join(OUT, f'costep-logo-stacked-{key}.svg'), 'w', encoding='utf-8').write(svg(W, H, body, defs, 'CoStep'))
        # 3) 가로형: 마크 높이 = 워드마크 높이의 1.45배, 세로 가운데 정렬
        ms2 = (wh * 1.45) / mh
        H2 = mh * ms2 + pad * 2
        gap2 = wh * 0.45
        W2 = mw * ms2 + gap2 + ww + pad * 2
        body2 = (f'<g transform="translate({pad - bx0 * ms2:.2f},{H2 / 2 - (by0 + by1) / 2 * ms2:.2f}) scale({ms2:.4f})">{mark}</g>'
                 f'<path transform="translate({pad + mw * ms2 + gap2 - wx0:.2f},{H2 / 2 - (wy0 + wy1) / 2:.2f})" d="{word}" fill="{c_word}"/>')
        open(os.path.join(OUT, f'costep-logo-horizontal-{key}.svg'), 'w', encoding='utf-8').write(svg(W2, H2, body2, defs, 'CoStep'))
    print('mark bbox', [round(v, 2) for v in (bx0, by0, bx1, by1)], 'word', [round(v, 1) for v in (wx0, wy0, wx1, wy1)])
    print(sorted(os.listdir(OUT)))


if __name__ == '__main__':
    main()
