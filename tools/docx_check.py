"""Word(.docx) 내보내기 점검: 헤드리스 Chrome 으로 tools/docx-check.html 을 열어 .docx 를 만들고,
zip·XML 구조를 검사한 뒤 설치된 Word 로 열어 PDF 로 바꿔 본다(Word 가 못 열면 실패).
사전: 로컬 서버 127.0.0.1:5180 (리드디벨롭 폴더) 실행 중.
사용: python tools/docx_check.py [--track sme] [--key finance] [--logo] [--no-word]
결과: %TEMP%/leaddev-docxcheck/ 에 .docx·.pdf
"""
import base64, io, os, re, shutil, subprocess, sys, tempfile, zipfile
import xml.dom.minidom

CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
OUT = os.path.join(tempfile.gettempdir(), 'leaddev-docxcheck')
os.makedirs(OUT, exist_ok=True)
arg = lambda k: sys.argv[sys.argv.index(k) + 1] if k in sys.argv else ''
q = '&'.join(f'{k}={v}' for k, v in {'track': arg('--track'), 'key': arg('--key'), 'logo': '1' if '--logo' in sys.argv else ''}.items() if v)
url = 'http://127.0.0.1:5180/tools/docx-check.html' + ('?' + q if q else '')

prof = tempfile.mkdtemp(prefix='dc-', dir=OUT)
try:
    dom = subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--window-size=1700,1000', '--virtual-time-budget=20000',
                          '--user-data-dir=' + prof, '--dump-dom', url],
                         capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180).stdout
finally:
    shutil.rmtree(prof, ignore_errors=True)

m = re.search(r'<pre id="out">(OK|ERR):(.*?)</pre>', dom, re.S)
if not m:
    sys.exit('FAIL 결과를 못 받음(페이지가 다 안 그려짐)')
if m.group(1) == 'ERR':
    sys.exit('FAIL 만들기 오류: ' + m.group(2))
data = base64.b64decode(m.group(2))
name = 'check' + ('-' + q.replace('&', '-').replace('=', '') if q else '')
path = os.path.join(OUT, name + '.docx')
open(path, 'wb').write(data)

# 1) zip·XML 구조
z = zipfile.ZipFile(io.BytesIO(data))
assert z.testzip() is None, 'zip 손상'
for n in z.namelist():
    if n.endswith('.xml') or n.endswith('.rels'):
        xml.dom.minidom.parseString(z.read(n))   # 잘못된 XML 이면 예외
doc = z.read('word/document.xml').decode('utf-8')
imgs = [n for n in z.namelist() if n.startswith('word/media/')]
print(f'OK  구조: {len(data):,}바이트 · 문단 {doc.count("<w:p>") + doc.count("<w:p/>")} · 표 {doc.count("<w:tbl>")} · 그림 {len(imgs)} · 쪽나눔 {doc.count("w:type=\"page\"")}')

# 2) Word 로 열어 PDF 로 바꿔 보기
if '--no-word' not in sys.argv:
    pdf = os.path.join(OUT, name + '.pdf')
    ps = f"""
$ErrorActionPreference = 'Stop'
$w = New-Object -ComObject Word.Application
$w.Visible = $false; $w.DisplayAlerts = 0
try {{
  $d = $w.Documents.Open('{path}', $false, $true, $false)
  $n = $d.ComputeStatistics(2)
  $d.ExportAsFixedFormat('{pdf}', 17)
  $d.Close(0)
  Write-Output "PAGES=$n"
}} finally {{ $w.Quit() }}
"""
    r = subprocess.run(['powershell', '-NoProfile', '-Command', ps], capture_output=True, text=True, timeout=120)
    pg = re.search(r'PAGES=(\d+)', r.stdout)
    if not pg:
        sys.exit('FAIL Word 가 열지 못함: ' + (r.stderr or r.stdout).strip()[:300])
    print(f'OK  Word 열기: {pg.group(1)}쪽 → {pdf}')
print('파일:', path)
