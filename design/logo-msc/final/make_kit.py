"""MSC report 브랜드 키트 생성 — 우승작 C1 'Growth-M' 다듬은 판.
심사 지적 반영: 단색 남색 타일 · 금색 점을 대각선 끝에 붙임('Mi' 방지) · 16/24px 단순화판(굵은 획·큰 점)
· 흑백판은 대각선과 세로획 사이 틈(녹아웃) · 글자는 모두 Noto Sans KR 윤곽선(path) · B2 직인 발상을 '진단 확인' 보조 인장으로.
출력: kit/svg/*.svg (원본) — PNG·JPG·ICO 는 export.py 가 이 SVG 를 그려서 만든다.
"""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'kit', 'svg')
os.makedirs(OUT, exist_ok=True)
FONT = r'C:\Windows\Fonts\NotoSansKR-VF.ttf'

C = dict(navy='#0A1F44', navy2='#12295A', teal='#00E0C6', teal_ink='#00A898', gold='#FFC300', gold_ink='#E0A100',
         white='#FFFFFF', black='#0A0B0F', gray='#66635C', gray_d='#A9B6D3', paper='#F6F5F1')

_fonts = {}


def font(w):
    if w not in _fonts:
        f = TTFont(FONT)
        _fonts[w] = instantiateVariableFont(f, {'wght': w})
    return _fonts[w]


def text_path(s, w, size, x, baseline, tracking=0.0):
    """글자 → SVG path d. tracking 은 em 비율. 반환 (d, 끝 x, 위쪽 y, 아래쪽 y)"""
    f = font(w)
    gs = f.getGlyphSet()
    cmap = f.getBestCmap()
    upm = f['head'].unitsPerEm
    k = size / upm
    ds, cx = [], x
    top, bot = 1e9, -1e9
    for ch in s:
        if ch == ' ':
            cx += f['hmtx']['space'][0] * k + tracking * size
            continue
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, cx, baseline)))
        ds.append(pen.getCommands())
        bp = BoundsPen(gs)
        gs[g].draw(bp)
        if bp.bounds:
            top = min(top, baseline - bp.bounds[3] * k)
            bot = max(bot, baseline - bp.bounds[1] * k)
        cx += f['hmtx'][g][0] * k + tracking * size
    return ' '.join(ds), cx - tracking * size, top, bot


# ── 엠블럼(512 격자) ──
def m_geom(small=False):
    if small:   # 16·24px: 굵은 획, 큰 점, 좁은 폭
        return dict(sw=78, r=52, L=150, R=362, top_l=212, top_r=166, mid=(256, 312), bot=356, dx=-4)
    return dict(sw=58, r=42, L=140, R=372, top_l=204, top_r=150, mid=(256, 316), bot=372, dx=-5)


def m_paths(g, vert, diag, dot, gap=None, gap_color=None):
    L, R, tl, tr, (mx, my), b, sw, r = g['L'], g['R'], g['top_l'], g['top_r'], g['mid'], g['bot'], g['sw'], g['r']
    verts = f'<path d="M{L} {b} V{tl} M{R} {tr} V{b}" fill="none" stroke="{vert}" stroke-width="{sw}" stroke-linecap="round"/>'
    dpath = f'M{L} {tl} L{mx} {my} L{R} {tr}'
    out = verts
    if gap:   # 흑백판: 대각선 둘레에 바탕색 틈
        out += f'<path d="{dpath}" fill="none" stroke="{gap_color}" stroke-width="{sw + gap}" stroke-linecap="round" stroke-linejoin="round"/>'
    out += f'<path d="{dpath}" fill="none" stroke="{diag}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>'
    if gap:
        out += f'<circle cx="{R}" cy="{tr}" r="{r + gap / 2}" fill="{gap_color}"/>'
    out += f'<circle cx="{R}" cy="{tr}" r="{r}" fill="{dot}"/>'   # 점 중심 = 대각선 끝 → 항상 붙어 있음
    return f'<g transform="translate({g["dx"]} 0)">{out}</g>'


def emblem(variant='color', small=False, tile=True):
    g = m_geom(small)
    rx = 120 if small else 116
    if variant == 'color':
        bg, v, d, dot, gap = C['navy'], C['white'], C['teal'], C['gold'], None
    elif variant == 'mono-black':   # 검정 타일 + 흰 M (흰 바탕 위)
        bg, v, d, dot, gap = C['black'], C['white'], C['white'], C['white'], None   # 틈을 넣으면 점이 떨어져 'Mi'로 읽혀 한 덩어리로
    elif variant == 'mono-white':   # 흰 타일 + 검정 M (검정 바탕 위)
        bg, v, d, dot, gap = C['white'], C['black'], C['black'], C['black'], None
    elif variant == 'color-ondark':   # 남색 바탕 위: 타일을 한 톤 밝게 해 바탕과 구분
        bg, v, d, dot, gap = '#16316A', C['white'], C['teal'], C['gold'], None
    elif variant == 'mark-dark':    # 타일 없음, 남색 바탕 위
        bg, v, d, dot, gap = None, C['white'], C['teal'], C['gold'], None
    elif variant == 'mark-light':   # 타일 없음, 흰 바탕 위
        bg, v, d, dot, gap = None, C['navy'], C['teal_ink'], C['gold'], None
    body = ''
    if bg:
        body += f'<rect width="512" height="512" rx="{rx}" fill="{bg}"/>'
    body += m_paths(g, v, d, dot, gap, bg)
    return body


def svg(w, h, body, title):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w:.0f} {h:.0f}" width="{w:.0f}" height="{h:.0f}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')


def save(name, content):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(content)


# ── 글자 로고: MSC(800) + report(500), 아래 powered by COSTEP(600) ──
def wordmark(x, baseline, size, theme, sub=True, sub_size=None):
    msc_c = C['navy'] if theme == 'light' else C['white']
    rep_c = C['teal_ink'] if theme == 'light' else C['teal']
    sub_c = C['gray'] if theme == 'light' else C['gray_d']
    d1, x1, t1, b1 = text_path('MSC', 800, size, x, baseline, tracking=-0.015)
    d2, x2, t2, b2 = text_path('report', 500, size, x1 + size * 0.20, baseline, tracking=-0.01)
    body = f'<path d="{d1}" fill="{msc_c}"/><path d="{d2}" fill="{rep_c}"/>'
    right, bottom, top = x2, max(b1, b2), min(t1, t2)
    if sub:
        ss = sub_size or size * 0.205
        d3, x3, t3, b3 = text_path('powered by ', 500, ss, x + 2, baseline + size * 0.43, tracking=0.06)
        d4, x4, t4, b4 = text_path('COSTEP', 800, ss, x3, baseline + size * 0.43, tracking=0.08)
        body += f'<path d="{d3}" fill="{sub_c}"/><path d="{d4}" fill="{sub_c}"/>'
        right, bottom = max(right, x4), max(bottom, b3, b4)
    return body, right, top, bottom


def lockup_h(theme, sub=True, emblem_variant=None):
    E = 240                       # 엠블럼 크기
    size = 150                    # 글자 크기
    pad = 0
    ev = emblem_variant or ('color-ondark' if theme == 'dark' else 'color')
    k = E / 512
    body = f'<g transform="translate({pad} 0) scale({k})">{emblem(ev)}</g>'
    # 'MSC' 대문자 높이를 엠블럼 세로 중심에 맞춤(부제가 있으면 살짝 위로)
    cap = 0.735 * size
    baseline = E / 2 + cap / 2 - (18 if sub else 0)
    wb, right, top, bottom = wordmark(E + 52, baseline, size, theme, sub)
    body += wb
    W = right + 4
    return svg(W, E, body, 'MSC report')


def lockup_v(theme):
    ev = 'color-ondark' if theme == 'dark' else 'color'
    E = 280
    size = 150
    wb, right, top, bottom = wordmark(0, 0, size, theme, sub=True)
    tw = right
    W = max(E, tw) + 0
    k = E / 512
    body = f'<g transform="translate({(W - E) / 2} 0) scale({k})">{emblem(ev)}</g>'
    wb, right, top, bottom = wordmark((W - tw) / 2, E + 48 + 0.735 * size, size, theme, sub=True)
    body += wb
    return svg(W, bottom + 6, body, 'MSC report')


def wordmark_only(theme, sub=False):
    size = 150
    wb, right, top, bottom = wordmark(0, 0.735 * size + 4, size, theme, sub=sub)
    return svg(right + 4, bottom + 6, wb, 'MSC report')


# ── 보조 인장: 'MSC 진단 확인' (B2 직인 발상) — 보고서 서명란·표지용 ──
def seal():
    k = 0.42
    body = f'<rect x="8" y="8" width="496" height="496" rx="64" fill="{C["navy"]}"/>'
    body += f'<rect x="40" y="40" width="432" height="432" rx="40" fill="none" stroke="{C["teal"]}" stroke-width="16"/>'
    # 위: 작은 M (단색 흰·청록·금)
    body += f'<g transform="translate({256 - 256 * k} 70) scale({k})">{m_paths(m_geom(), C["white"], C["teal"], C["gold"])}</g>'
    d1, x1, t1, b1 = text_path('진단 확인', 800, 92, 0, 0)
    w1 = x1
    d1, x1, t1, b1 = text_path('진단 확인', 800, 92, 256 - w1 / 2, 370)
    body += f'<path d="{d1}" fill="{C["white"]}"/>'
    d2, x2, t2, b2 = text_path('MSC REPORT', 700, 40, 0, 0, tracking=0.18)
    w2 = x2
    d2, x2, t2, b2 = text_path('MSC REPORT', 700, 40, 256 - w2 / 2, 438, tracking=0.18)
    body += f'<path d="{d2}" fill="{C["teal"]}"/>'
    return svg(512, 512, body, 'MSC 진단 확인 인장')


if __name__ == '__main__':
    for v in ['color', 'color-ondark', 'mono-black', 'mono-white', 'mark-dark', 'mark-light']:
        save(f'msc-emblem-{v}.svg', svg(512, 512, emblem(v), 'MSC report'))
        save(f'msc-emblem-{v}-small.svg', svg(512, 512, emblem(v, small=True), 'MSC report'))
    save('msc-lockup-horizontal-light.svg', lockup_h('light'))
    save('msc-lockup-horizontal-dark.svg', lockup_h('dark'))
    save('msc-lockup-horizontal-light-nosub.svg', lockup_h('light', sub=False))
    save('msc-lockup-horizontal-dark-nosub.svg', lockup_h('dark', sub=False))
    save('msc-lockup-horizontal-mono-black.svg', lockup_h('light', emblem_variant='mono-black').replace(C['navy'], C['black']).replace(C['teal_ink'], C['black']).replace(C['gray'], C['black']))
    save('msc-lockup-horizontal-mono-white.svg', lockup_h('dark', emblem_variant='mono-white').replace(C['teal'], C['white']).replace(C['gray_d'], C['white']))
    save('msc-lockup-stacked-light.svg', lockup_v('light'))
    save('msc-lockup-stacked-dark.svg', lockup_v('dark'))
    save('msc-wordmark-light.svg', wordmark_only('light'))
    save('msc-wordmark-dark.svg', wordmark_only('dark'))
    save('msc-wordmark-light-sub.svg', wordmark_only('light', sub=True))
    save('msc-wordmark-dark-sub.svg', wordmark_only('dark', sub=True))
    save('msc-seal-verified.svg', seal())
    print('\n'.join(sorted(os.listdir(OUT))))
