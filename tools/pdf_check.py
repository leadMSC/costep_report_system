"""PDF 저장 점검: 헤드리스 Chrome 으로 서식을 PDF 로 만들고, 화면 글자가 PDF 에 빠짐없이 들어갔는지 대조한다.
사전: 로컬 서버 127.0.0.1:5180 (리드디벨롭 폴더) 실행 중, pypdf 설치.
사용: python tools/pdf_check.py [--src orig] [--quick]
"""
import json, os, re, subprocess, sys, tempfile, html
from pypdf import PdfReader

CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
BASE = 'http://127.0.0.1:5180/tools/print-check.html'
OUT = os.path.join(tempfile.gettempdir(), 'leaddev-pdfcheck')
os.makedirs(OUT, exist_ok=True)
src = 'orig' if '--src' in sys.argv and 'orig' in sys.argv else 'dev'
l3 = '--l3' in sys.argv   # 3단 보기(기본 화면)에서 인쇄해도 같은지

def chrome(args):
    # --l3: 3단 보기는 폭 900px 이상에서만 켜지므로 창을 넓히고, 배치 작업이 더 있어 시간 한도도 늘린다
    extra = ['--window-size=1600,900', '--virtual-time-budget=45000'] if l3 else ['--virtual-time-budget=20000']
    # 실행마다 새 크롬 작업 폴더 — 같은 폴더를 이어 쓰면 앞 실행이 남긴 잠금 때문에 가끔 페이지를 다 못 읽는다
    prof = tempfile.mkdtemp(prefix='pc-', dir=OUT)
    try:
        return subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                               '--user-data-dir=' + prof] + extra + args,
                              capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=180)
    finally:
        import shutil
        shutil.rmtree(prof, ignore_errors=True)

norm = lambda t: re.sub(r'\s+', '', t)

def check(params, label):
    url = BASE + '?' + '&'.join(f'{k}={v}' for k, v in {**params, 'src': src, **({'l3': 1} if l3 else {})}.items())
    dom = chrome(['--dump-dom', url]).stdout
    m = re.search(r'<script type="text/x-expected" id="expected">(.*?)</script>', dom, re.S)
    if not m:
        return f'{label}: 기대 글자 수집 실패'
    exp = json.loads(m.group(1))
    pdf = os.path.join(OUT, f'{src}{"-l3" if l3 else ""}-{label}.pdf')
    chrome([f'--print-to-pdf={pdf}', url])
    reader = PdfReader(pdf)
    pages = len(reader.pages)
    pdf_text = norm(''.join(p.extract_text() or '' for p in reader.pages))
    exp_text = norm(exp['text'])
    missing = []
    for tok in sorted(set(t for t in re.split(r'\s+', exp['text']) if len(t) >= 2)):
        nt = norm(tok)
        if exp_text.count(nt) > pdf_text.count(nt):
            missing.append(tok)
    hclip = exp.get('hclip', [])
    # 페이지 그림 저장 (사람이 눈으로 확인할 때 사용)
    if '--png' in sys.argv:
        import pymupdf
        doc = pymupdf.open(pdf)
        for i, pg in enumerate(doc):
            pg.get_pixmap(dpi=60).save(os.path.join(OUT, f'{src}-{label}-p{i + 1}.png'))
    bad = missing or hclip
    status = 'OK ' if not bad else '잘림'
    msg = f'{status} {label}: 서식 {exp["cards"]}장 → PDF {pages}쪽'
    if missing: msg += f' | PDF에 없는 글자 {len(missing)}개: {" / ".join(missing[:12])}'
    if hclip: msg += f' | 가로 잘림 표: {", ".join(hclip[:6])}'
    return msg

cases = []
datasets = ['demo'] if '--quick' in sys.argv else ['demo', 'long', 'debt10', 'empty']
for data in datasets:
    for track in ['smb', 'small', 'sme']:
        cases.append(({'case': 'batch', 'track': track, 'data': data, 'ind': 'mfg' if data != 'debt10' else 'logis'}, f'batch-{track}-{data}'))
cases.append(({'case': 'single', 'track': 'smb', 'data': 'demo', 'key': 'manage', 'sheet': 'report'}, 'single-smb-manage-report'))
cases.append(({'case': 'single', 'track': 'sme', 'data': 'long', 'key': 'finance', 'sheet': 'bplan'}, 'single-sme-finance-bplan-long'))
for params, label in cases:
    print(check(params, label), flush=True)
print('PDF 저장 위치:', OUT)
