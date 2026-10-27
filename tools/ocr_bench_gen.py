"""OCR 비교 시험 세트: 가짜 값 서류 8종 × 촬영 상태 5종 = 40장 + 정답(truth.json)."""
import json, os, random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
import numpy as np

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
FONTS = {'malgun': 'C:/Windows/Fonts/malgun.ttf', 'batang': 'C:/Windows/Fonts/batang.ttc', 'gulim': 'C:/Windows/Fonts/gulim.ttc'}

DOCS = {
  'bizreg': ('malgun', ['사업자등록증', '(법인사업자)', '등록번호 : 220-81-62517', '법인명(단체명) : 가나기초이엔씨 주식회사', '대 표 자 : 홍길동',
     '개업연월일 : 2019 년 11 월 01 일', '법인등록번호 : 110111-7654321', '사업장 소재지 : 서울특별시 중구 세종대로 110, 3층 301호',
     '업태 : 건설업   종목 : 보링, 그라우팅 및 관정공사업', '발급번호 4821-937-6650-112'],
     ['220-81-62517', '가나기초이엔씨', '홍길동', '2019년11월01일', '110111-7654321', '세종대로110', '건설업', '4821-937-6650-112']),
  'vat': ('batang', ['부가가치세 과세표준증명', '상호 : 다라정밀 주식회사   사업자등록번호 : 314-86-21093', '과세기간        과세표준        납부세액',
     '2024년 1기     1,834,347,400     98,512,300', '2024년 2기     1,736,530,100     87,104,650', '2025년 1기     2,084,127,274     105,466,115',
     '발급일 : 2026년 03월 15일'],
     ['314-86-21093', '1,834,347,400', '98,512,300', '1,736,530,100', '87,104,650', '2,084,127,274', '105,466,115', '2026년03월15일']),
  'fs': ('gulim', ['표준재무제표증명 (요약)', '과목              제 7(당)기          제 6(전)기', '매출액            3,512,804,221       2,906,115,780',
     '영업이익            214,603,550         158,220,014', '자산총계          4,120,553,900       3,688,104,512', '부채총계          2,610,400,128       2,402,995,310',
     '자본금              300,000,000         300,000,000', '단기차입금          850,000,000         920,000,000'],
     ['3,512,804,221', '2,906,115,780', '214,603,550', '158,220,014', '4,120,553,900', '2,610,400,128', '300,000,000', '850,000,000']),
  'bank': ('malgun', ['통장 사본', 'IBK기업은행', '계좌번호 : 123-456789-01-012', '예금주 : 가나기초이엔씨(주)', '신규일 2019.11.08   통장번호 0021'],
     ['IBK기업은행', '123-456789-01-012', '가나기초이엔씨', '2019.11.08']),
  'patent': ('batang', ['특 허 증', 'CERTIFICATE OF PATENT', '특허 제 10-2345678 호', '출원번호 10-2021-0154321', '출원일 2021년 11월 10일',
     '등록일 2023년 04월 12일', '발명의 명칭 : 지반 보강용 그라우팅 장치 및 그 시공 방법', '특허권자 : 가나기초이엔씨 주식회사', '발명자 : 홍길동, 김철수'],
     ['10-2345678', '10-2021-0154321', '2021년11월10일', '2023년04월12일', '지반보강용그라우팅장치', '시공방법', '홍길동', '김철수']),
  'share': ('gulim', ['주 주 명 부', '2025년 12월 31일 현재', '성명        주식수       지분율', '홍길동      42,000       70.00%', '김영희      12,000       20.00%',
     '박민수       6,000       10.00%', '합계        60,000      100.00%'],
     ['홍길동', '42,000', '70.00%', '김영희', '12,000', '20.00%', '박민수', '6,000', '10.00%', '60,000']),
  'lease': ('batang', ['부동산 임대차 계약서', '소재지 : 경기도 화성시 마도면 마도공단로 45', '보증금 : 금 오천만원정 (₩50,000,000)', '차 임 : 금 일백이십만원정 (₩1,200,000) 매월 25일 지급',
     '임대기간 : 2024년 03월 01일부터 2026년 02월 28일까지', '면적 : 330.58㎡'],
     ['마도공단로45', '50,000,000', '1,200,000', '25일', '2024년03월01일', '2026년02월28일', '330.58']),
  'ins': ('malgun', ['사업장 가입자 명부(고용보험)', '사업장관리번호 22081625170', '번호  성명     취득일          구분', '1    이수진   2021-03-02      상용', '2    정대호   2022-07-18      상용',
     '3    최유리   2023-01-09      상용', '4    한지민   2024-05-20      상용', '가입자 수 : 4명'],
     ['22081625170', '이수진', '2021-03-02', '정대호', '2022-07-18', '최유리', '2023-01-09', '한지민', '2024-05-20']),
}


def render(lines, font, size):
    W = 1400
    f = ImageFont.truetype(FONTS[font], size)
    H = 140 + len(lines) * int(size * 2.1) + 80
    im = Image.new('RGB', (W, H), (250, 249, 245))
    d = ImageDraw.Draw(im)
    d.text((W // 2 - len(lines[0]) * size // 2, 50), lines[0], font=ImageFont.truetype(FONTS[font], int(size * 1.4)), fill=(15, 15, 15))
    for i, l in enumerate(lines[1:]):
        d.text((90, 140 + i * int(size * 2.1)), l, font=f, fill=(25, 25, 25))
    return im


def photo(im, rnd):
    w, h = im.size
    a = np.array(im).astype(np.float32)
    # 고르지 않은 조명: 한쪽이 어둡게
    gx = np.linspace(0.78, 1.04, w)[None, :, None]; gy = np.linspace(1.0, 0.86, h)[:, None, None]
    a = np.clip(a * gx * gy, 0, 255)
    im = Image.fromarray(a.astype(np.uint8))
    # 원근(살짝 비스듬히 찍음) + 기울기
    dx, dy = int(w * 0.04), int(h * 0.03)
    coeffs = _persp([(0, 0), (w, 0), (w, h), (0, h)], [(dx, dy), (w - dx // 2, 0), (w, h - dy), (dx // 3, h)])
    im = im.transform((w, h), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=(120, 118, 112))
    im = im.rotate(rnd.uniform(-2.5, 2.5), resample=Image.BICUBIC, fillcolor=(120, 118, 112))
    im = im.filter(ImageFilter.GaussianBlur(1.1))
    return im


def _persp(src, dst):
    m = []
    for (x, y), (u, v) in zip(dst, src):
        m.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); m.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    A = np.array(m, dtype=np.float64); B = np.array(src, dtype=np.float64).reshape(8)
    return np.linalg.solve(A, B).tolist()


def lowres(im):
    w, h = im.size
    return im.resize((int(w * 0.42), int(h * 0.42)), Image.BILINEAR)


def fax(im, rnd):
    g = im.convert('L').filter(ImageFilter.GaussianBlur(0.6))
    a = np.array(g); a = np.where(a < 150, 0, 255).astype(np.uint8)
    noise = np.random.default_rng(rnd.randint(0, 9999)).random(a.shape)
    a[noise < 0.012] = 0; a[noise > 0.992] = 255
    return Image.fromarray(a).convert('RGB')


rnd = random.Random(7)
truth = {}
for key, (font, lines, fields) in DOCS.items():
    for cond in ['clean', 'photo', 'lowres', 'fax', 'small']:
        size = 22 if cond == 'small' else 32
        im = render(lines, font, size)
        if cond == 'photo': im = photo(im, rnd)
        elif cond == 'lowres': im = lowres(im)
        elif cond == 'fax': im = fax(im, rnd)
        q = 55 if cond in ('photo', 'lowres') else 85
        name = f'{key}_{cond}.jpg'
        im.save(os.path.join(out, name), quality=q)
        truth[name] = {'doc': key, 'cond': cond, 'text': '\n'.join(lines), 'fields': fields}
json.dump(truth, open(os.path.join(out, 'truth.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(truth), 'images')
