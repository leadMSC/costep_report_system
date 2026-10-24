"""사업계획 개요서 정답지 세트 합치기 → tools/bp_lib.json + 앱 HTML 에 넣기.

    python tools/bp_lib/build.py            # 합치고 검사하고 HTML 에 넣음
    python tools/bp_lib/build.py --check    # 검사만

part*.json(업종 대분류·세분류·규모) + situations.json(상황·조달) 를 하나로 합친다.
검사: 숫자 금지(○○ 자리표시만), 길이(문장 80자·용도 25자), 대분류 21개 모두 있음.
"""
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
HTML = os.path.join(ROOT, '코스텝_경영진단_리드디벨롭.html')
OUT = os.path.join(os.path.dirname(HERE), 'bp_lib.json')
SECTIONS = 'ABCDEFGHIJKLMNOPQRSTU'
FIELDS = ['problem', 'solution', 'market', 'facility', 'working', 'team', 'outcome']


def texts(arr):
    for x in arr or []:
        yield x if isinstance(x, str) else x.get('t', '')


def main():
    lib = {'v': 1, 'sections': {}, 'subs': {}, 'size': {}}
    for f in sorted(glob.glob(os.path.join(HERE, 'part*.json'))):
        d = json.load(open(f, encoding='utf-8'))
        lib['sections'].update(d.get('sections', {}))
        lib['subs'].update(d.get('subs', {}))
        lib['size'].update(d.get('size', {}))
    sit = json.load(open(os.path.join(HERE, 'situations.json'), encoding='utf-8'))
    lib['situations'] = {k: {kk: vv for kk, vv in v.items() if kk != 'when'} for k, v in sit['situations'].items()}
    lib['funding'] = sit['funding']

    errs = []
    missing = [s for s in SECTIONS if s not in lib['sections']]
    if missing:
        errs.append('대분류 없음: ' + ''.join(missing))
    for kind in ('sections', 'subs'):
        for key, e in lib[kind].items():
            for fld in FIELDS:
                if not e.get(fld):
                    errs.append(f'{kind}.{key}.{fld} 비어 있음')
                for t in texts(e.get(fld)):
                    lim = 25 if fld in ('facility', 'working') else 80
                    if re.search(r'\d', t):
                        errs.append(f'{kind}.{key}.{fld} 숫자: {t}')
                    if len(t) > lim:
                        errs.append(f'{kind}.{key}.{fld} {len(t)}자: {t}')
    for s in ('smb', 'small', 'sme'):
        if s not in lib['size']:
            errs.append('규모 없음: ' + s)
    n_lines = sum(len(list(texts(e.get(f)))) for kind in ('sections', 'subs') for e in lib[kind].values() for f in FIELDS)
    print(f"대분류 {len(lib['sections'])} · 세분류 {len(lib['subs'])} · 규모 {len(lib['size'])} · 상황 {len(lib['situations'])} · 업종 문장 {n_lines}개")
    if errs:
        print('\n'.join(errs[:40]))
        print(f'오류 {len(errs)}건')
        if '--check' not in sys.argv:
            sys.exit(1)
    if '--check' in sys.argv:
        return
    js = json.dumps(lib, ensure_ascii=False, separators=(',', ':'))
    open(OUT, 'w', encoding='utf-8').write(json.dumps(lib, ensure_ascii=False, indent=1))
    html = open(HTML, encoding='utf-8', newline='').read()
    tag = '<script type="application/json" id="bp_lib_data">'
    block = tag + js.replace('</', '<\\/') + '</script>'
    if tag in html:
        html = re.sub(re.escape(tag) + r'.*?</script>', lambda m: block, html, count=1, flags=re.S)
    else:
        anchor = '<script type="application/json" id="ksic_data">'
        i = html.index(anchor)
        html = html[:i] + block + '\n' + html[i:]
    open(HTML, 'w', encoding='utf-8', newline='').write(html)
    print(f'HTML 에 넣음 ({len(js) // 1024}KB)')


if __name__ == '__main__':
    main()
