"""스캔 서류 글자 인식 점검: tools/ocr-check.html 을 헤드리스 Chrome 으로 열어 쪽마다 OCR·해석 결과를 받는다.
사전: 로컬 서버 127.0.0.1:5180, vendor/ocr(언어 데이터 포함).
사용: python tools/ocr_check.py tests/pdf_sample/ip/s01.pdf [--raw] [--noclean] [--json 결과.json]
출력: 쪽마다 칸 채움 수(값은 화면에 찍지 않음 — 실제 서류의 개인정보 보호). --json 이면 결과 전체를 파일로(저장소 밖에 둘 것).
"""
import json, os, re, shutil, subprocess, sys, tempfile, urllib.parse

CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
args = [a for a in sys.argv[1:] if not a.startswith('--')]
path = args[0]
q = {'f': '../' + path.replace('\\', '/')}
if '--raw' in sys.argv: q['raw'] = '1'
if '--noclean' in sys.argv: q['clean'] = '0'
url = 'http://127.0.0.1:5180/tools/ocr-check.html?' + urllib.parse.urlencode(q)
prof = tempfile.mkdtemp(prefix='oc-')
try:
    dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--timeout=240000', '--user-data-dir=' + prof, '--dump-dom', url],
                         capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=900).stdout
finally:
    shutil.rmtree(prof, ignore_errors=True)
m = re.search(r'<pre id="out">(OK|ERR):(.*?)</pre>', dom, re.S)
if not m: sys.exit('FAIL 결과 없음')
if m.group(1) == 'ERR': sys.exit('FAIL ' + m.group(2))
import html as H
res = json.loads(H.unescape(m.group(2)))
KEYS = ['kind', 'title', 'appNo', 'appDate', 'applicant', 'inventor', 'regNo', 'regDate']
for r in res:
    it = r['ip']
    print(f"p{r['page']:>2} {r['ms']:>6}ms  " + ' '.join(f"{k}:{'O' if it.get(k) else '-'}" for k in KEYS) + f"  kind={it.get('kind','')} regNo형태={re.sub(r'[0-9]', '9', it.get('regNo',''))}")
if '--json' in sys.argv:
    out = sys.argv[sys.argv.index('--json') + 1]
    json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('결과 파일:', out)
