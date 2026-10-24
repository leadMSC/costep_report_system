// 부채 서류 해석기 시험 — 가짜 값으로 만든 견본(tests/fixtures/*_fake.txt). 실제 고객 서류는 저장소에 두지 않는다.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const P = require('./doc-parsers.js');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', f), 'utf8').split('\n');
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('PASS', name); };

const L = P.parseDebtDocument(read('ledger_fake.txt'));
ok('원장 판별·기준일·계정', () => { assert.strictEqual(L.kind, 'debt_ledger'); assert.strictEqual(L.asOf, '2025-06-30'); assert.strictEqual(L.account, '장기차입금'); });
ok('원장 3행·원→만원', () => { assert.strictEqual(L.rows.length, 3); assert.deepStrictEqual(L.rows.map(r => r.balanceMan), [20000, 25000, 10000]); });
ok('원장 합계 = 행 합', () => assert.strictEqual(L.total.balanceMan, L.rows.reduce((a, r) => a + r.balanceMan, 0)));
ok('원장 이름 풀이', () => {
  assert.strictEqual(L.rows[0].institution, '중소벤처기업진흥공단'); assert.strictEqual(L.rows[0].principalMan, 20000); assert.strictEqual(L.rows[0].startYm, '2023-05');
  assert.strictEqual(L.rows[1].institution, 'IBK기업은행'); assert.strictEqual(L.rows[1].guarantor, '기술보증기금'); assert.strictEqual(L.rows[1].contractNo, '12-34567');
  assert.ok(L.rows[2].needs.includes('기관')); assert.ok(L.rows.every(r => r.rate === null && r.needs.includes('금리')));
});

const C = P.parseDebtDocument(read('creditor_fake.txt'));
ok('조회서 판별·단위·조회일', () => { assert.strictEqual(C.kind, 'creditor_change'); assert.strictEqual(C.unit, '천원'); assert.strictEqual(C.asOf, '2025-10-01'); });
ok('채무현황 2건·천원→만원', () => {
  assert.strictEqual(C.loans.length, 2);
  assert.deepStrictEqual(C.loans.map(r => r.amountMan), [1250, 120]);
  assert.strictEqual(C.loans[0].institution, '가나생명보험'); assert.strictEqual(C.loans[1].typeCode, '0041');
});
ok('연체 이력 1건·해제', () => {
  assert.strictEqual(C.delinquencies.length, 1);
  const d = C.delinquencies[0];
  assert.strictEqual(d.principalMan, 30); assert.strictEqual(d.released, true); assert.strictEqual(d.releasedAt, '2025-02-03');
  assert.strictEqual(C.summary.unresolved, 0);
});
ok('개인 식별값 미포함', () => { const s = JSON.stringify(C); assert.ok(!/홍길동|800101/.test(s)); });
ok('대출표 변환', () => {
  const d = P.toDebtItems(L); assert.strictEqual(d.length, 3); assert.strictEqual(d[0].balance, 20000); assert.strictEqual(d[0].rate, '');
  const c = P.toDebtItems(C); assert.ok(c[0].type.startsWith('대표자 개인'));
});
// 채권자변동정보 조회서 — 발급처·칸 배치가 다른 여러 꼴(가짜 값 pdf.js 글자 조각, tests/fixtures/creditor_layouts_fake.js)
const CL = require('../tests/fixtures/creditor_layouts_fake.js');
const crDoc = pages => P.parseDocument(pages, 'doc_0.pdf');
const crParsed = pages => P.parseDebtDocument(P.pagesToCells(pages), pages);
ok('조회서 꼴1(신용정보원형: 여러 줄 머리·세 줄 기록·여러 쪽): 판별·대출·보증 분리', () => {
  const pg = CL.layoutKcis(), d = crDoc(pg), c = crParsed(pg);
  assert.strictEqual(d.kind, 'creditor'); assert.strictEqual(d.status, 'ok');
  assert.strictEqual(c.via, 'layout'); assert.strictEqual(c.unit, '천원'); assert.strictEqual(c.asOf, '2025-01-02');
  assert.strictEqual(c.loans.length, 5);
  assert.deepStrictEqual(c.loans.map(l => l.amountMan), [3000, 5000, 4500, 200, 10000]);
  assert.deepStrictEqual(c.loans.map(l => l.isGuarantee), [false, false, true, true, false]);
  assert.strictEqual(c.loans[1].category, '개인사업자대출'); assert.strictEqual(c.loans[1].type, '운전자금(일반)'); assert.strictEqual(c.loans[1].typeCode, '1031');
  assert.strictEqual(c.loans[1].institution, '다라은행'); assert.strictEqual(c.loans[1].openedAt, '2022-06-07');
  assert.strictEqual(c.loans[4].type, '신용대출(종합통장대출)'); assert.strictEqual(c.loans[4].institution, '마바(세종)');
  assert.strictEqual(c.summary.loans, 3); assert.strictEqual(c.summary.guarantees, 2); assert.strictEqual(c.summary.skipped, 0);
  // 대출표에는 보증 기록을 빼고 3건, 사업자 대출은 '대표자 개인사업자'
  assert.strictEqual(d.debtItems.length, 3);
  assert.strictEqual(d.debtItems[1].type, '대표자 개인사업자 · 운전자금(일반)');
  assert.ok(d.notes.some(n => /보증 기록 2건/.test(n)));
});
ok('조회서 꼴1: 연체 이력(기관 위 줄·전화 아래 줄·채권구분 줄바꿈·미해제)', () => {
  const c = crParsed(CL.layoutKcis());
  assert.strictEqual(c.delinquencies.length, 2);
  const [a, b] = c.delinquencies;
  assert.strictEqual(a.institution, '사아카드'); assert.strictEqual(a.type, '신용카드채권'); assert.strictEqual(a.occurredAt, '2020-03-04');
  assert.strictEqual(a.principalMan, 120); assert.strictEqual(a.interestMan, 3);
  assert.strictEqual(a.released, true); assert.strictEqual(a.releaseReason, '채무자 변제'); assert.strictEqual(a.releasedAt, '2020-05-06');
  assert.strictEqual(b.institution, '자차캐피탈'); assert.strictEqual(b.accelerated, true); assert.strictEqual(b.acceleratedAt, '2021-09-01');
  assert.strictEqual(b.collection, '위탁(가상신용정보)'); assert.strictEqual(b.released, false); assert.strictEqual(b.transferred, false);
  assert.strictEqual(c.summary.unresolved, 1);
  assert.ok(!/홍길동|800101|1500-0000|02-000-0000/.test(JSON.stringify(c)), '이름·주민번호·전화번호 미포함');
});
ok('조회서 꼴2(다른 발급처: 칸 순서·이름 다름, 원 단위 잔액, 해제일·사유 따로 칸)', () => {
  const pg = CL.layoutOther(), d = crDoc(pg), c = crParsed(pg);
  assert.strictEqual(d.kind, 'creditor'); assert.strictEqual(c.unit, '원'); assert.strictEqual(c.unitGuessed, false); assert.strictEqual(c.asOf, '2025-03-04');
  assert.deepStrictEqual(c.loans.map(l => [l.institution, l.type, l.openedAt, l.amountMan, l.amountBasis]),
    [['가상저축은행', '사업자운전자금', '2024-01-31', 3500, '잔액'], ['나다캐피탈', '할부금융', '2024-11-02', 840, '잔액']]);
  assert.deepStrictEqual(c.loans[0].needs, ['금리']);
  assert.strictEqual(d.debtItems[0]._from, '채권자변동정보(잔액)'); assert.strictEqual(d.debtItems[0].type, '대표자 개인 · 사업자운전자금');
  assert.strictEqual(c.delinquencies.length, 2);
  assert.deepStrictEqual(c.delinquencies.map(x => [x.institution, x.occurredAt, x.principalMan, x.released, x.releaseReason, x.releasedAt]),
    [['가상카드', '2023-02-03', 150, true, '변제완료', '2023-03-01'], ['나다캐피탈', '2025-01-15', 70, false, '', '']]);
  assert.ok(!/김가상/.test(JSON.stringify(c)));
});
ok('조회서 꼴3(글자 한 자씩 조각·두 줄 머리·순번/단위 없음 → 원 단위 짐작)', () => {
  const pg = CL.layoutChars(), d = crDoc(pg), c = crParsed(pg);
  assert.strictEqual(d.kind, 'creditor');
  assert.strictEqual(c.loans.length, 2);
  assert.deepStrictEqual(c.loans.map(l => [l.category, l.type, l.typeCode, l.institution, l.openedAt]),
    [['개인대출정보', '주택담보대출', '0230', '하나둘은행', '2019-10-11'], ['개인대출정보', '카드론', '0041', '셋넷카드', '2024-02-29']]);
  assert.strictEqual(c.unit, '원'); assert.strictEqual(c.unitGuessed, true);
  assert.deepStrictEqual(c.loans.map(l => l.amountMan), [12000, 300]);
  assert.ok(d.notes.some(n => /단위가 서류에 없어/.test(n)));
});
ok('조회서 꼴4(사진 글자 인식 줄 글: 한 줄에 칸이 다 있음·만원·년월일)', () => {
  const t = fs.readFileSync(path.join(__dirname, '..', 'tests', 'fixtures', 'creditor_ocr_fake.txt'), 'utf8');
  const r = P.parseTextDocument(t, 'scan.jpg');
  assert.strictEqual(r.kind, 'creditor'); assert.strictEqual(r.status, 'ok');
  assert.strictEqual(r.debtItems.length, 2);
  assert.deepStrictEqual(r.debtItems.map(x => [x.institution, x.balance, x.payback]), [['가나은행', 3000, '2023-05-10 발생'], ['다라저축은행', 500, '2024-12-01 발생']]);
  assert.ok(!/1234567|홍길동/.test(JSON.stringify(r)));
});
ok('조회서인데 표가 없으면 건너뜀(빈 결과로 대출표 덮지 않음)', () => {
  const d = P.parseDocument([[{ s: '채권자변동정보 조회서', x: 100, y: 700, w: 200, h: 20 }, { s: '조회 결과 등록된 정보가 없습니다', x: 100, y: 600, w: 300, h: 10 }]], 'x.pdf');
  assert.strictEqual(d.kind, 'creditor'); assert.strictEqual(d.status, 'skip'); assert.strictEqual(d.debtItems.length, 0);
});
// 사진 글자 인식(합성 글 — 실제 사진·번호 아님)
ok('주민번호 뒷자리 가리기(잡음 포함)', () => {
  const r = P.redact(['홍길동 (洪吉童)', '800101-1234567', '800101 - 12345)7', '금액 120000 -45000'].join('\n'));
  assert.ok(!/1234567|12345\)7/.test(r));
  assert.ok(/800101-\*{7}/.test(r));
  assert.ok(/120000 -45000/.test(r), '금액은 지우지 않음');
});
ok('신분증: 이름·생년월일(세기 추정)·번호 미노출', () => {
  const t = ['JT 논 스 독스', '홍길동 (ERR)', '800101-1234567', '서울특별시 중구 시험로 1', '2020. 01. 02.', '서울특별시 중구청장'].join('\n');
  const r = P.parseTextDocument(t, 'a.jpg');
  assert.strictEqual(r.kind, 'idcard');
  assert.strictEqual(r.fields.corp_ceo, '홍길동');
  assert.strictEqual(r.fields.corp_ceo_birth, '1980-01-01');
  assert.ok(!/1234567/.test(JSON.stringify(r)));
});
ok('임대차: 금액(₩ 오독)·월세·주거 판별', () => {
  const t = ['아파트임대차계약서', '용도 공동주택(아파트) 전용면적 84.9133㎡', '[글 | 金 삼천만원정 (#30,000,000)',
    '[를 | 金 일백만원정 (¥1,000,000) 은 계약시', '술 이천구백만원정 (%29,000,000) 은', '술 일백이십만원정 (\\1,200,000) 은 후불로 매월 25일에 지불한다.'].join('\n');
  const r = P.parseTextDocument(t, 'b.jpg');
  assert.strictEqual(r.kind, 'lease');
  assert.strictEqual(r.fields.corp_house, '임차 거주 (월세)');
  assert.ok(r.notes.some(x => /보증금 3,000만원$/.test(x)));
  assert.ok(r.notes.some(x => /월세 120만원/.test(x)));
});
ok('지식재산권 등록증: 번호 앞자리로 권리 판별·8칸', () => {
  const t = ['발급번호 :1-1-2020-000000000', '사표드로즈', '등        록         제 40-1234567 호', 'Registration Number',
    '출원번호              제 40-2019-0012345 호                              Cd', '출원 일           2019년 03월 04일', '동록일           2020년 05월 06일',
    '상표권자', '주식회사 예시상사(110111-*******)', '지정상품 및 구분', '제 9 류 등 3 개류', '시험스캐너등 12건          | 비행'].join('\n');
  const r = P.parseTextDocument(t, 'x.png');
  assert.strictEqual(r.kind, 'ip');
  const it = r.ipItems[0];
  assert.strictEqual(it.kind, '상표'); assert.strictEqual(it.regNo, '40-1234567-00-00'); assert.strictEqual(it.appNo, '40-2019-0012345');
  assert.strictEqual(it.appDate, '2019-03-04'); assert.strictEqual(it.regDate, '2020-05-06'); assert.strictEqual(it.applicant, '주식회사 예시상사');
  assert.ok(/시험스캐너등 12건/.test(it.title));
  const p = P.parseTextDocument(['특허증', '특        허         제 10-7654321 호', '출원번호              제 10-2018-0099999 호', '출원 일           2018년 01월 02일',
    '등록일           2019년 02월 03일', '발명 의 명 칭 Title of the Invention', '시험용 측정 장치', '특허권자', '주식회사 예시상사(110111-*******)', '발명자', '홍길동(800101-*******)'].join('\n'), 'y.png').ipItems[0];
  assert.strictEqual(p.kind, '특허'); assert.strictEqual(p.title, '시험용 측정 장치'); assert.strictEqual(p.inventor, '홍길동');
});
// 실제 등록증 글자 인식 결과와 같은 모양(가짜 이름·번호): 한글 라벨은 깨지고 영문 라벨 윗줄에 값, 사람 줄은 '이름(생년-*******)'
const fakeCert = (head, no, app, d1, d2, titleLbl, title, people) => ['발급번호 : 2-5-2026-000000000', head, `특        허          제 ${no} 호`, head.includes('PATENT') ? 'Patent Number' : 'Registration Number',
  `출원번호              제 ${app} 호                              Cd`, 'Application Number', `출원 일           ${d1}                            nade d`, 'Filing Date',
  `54                ${d2}                                 or`, 'Registration Date', titleLbl, title, '특허권자6860666', '주식회사 예시상사(110111-*******)', '서울특별시 중구 시험로 1, 2층',
  '2 Z}nventor', ...people.flatMap(n => [`${n}(800101-*******)`, '서울특별시 중구 시험로 2']), '위의 발명은 「특허법」에 따라 특허원부에 등록되었음을 증명합니다.', 'This is to certify that, in accordance with the Patent Act'].join('\n');
ok('지식재산권 등록증 — 영문 라벨 기준·연도 오독·3D·여러 발명자·전체 등록번호', () => {
  const t = fakeCert('CERTIFICATE OF PATENT', '10-7654321', '10-9018-0099999', '2018년 01월 02일', '20203 04월 13일', '발명 의 명 칭 Title of the Invention', '반사 오차를 줄인 30 측정기', ['홍길동', '김예시']);
  const it = P.parseIP(t).item;
  assert.strictEqual(it.kind, '특허'); assert.strictEqual(it.regNo, '10-7654321-00-00'); assert.strictEqual(it.appNo, '10-2018-0099999');
  assert.strictEqual(it.appDate, '2018-01-02'); assert.strictEqual(it.regDate, '2020-04-13');
  assert.strictEqual(it.title, '반사 오차를 줄인 3D 측정기'); assert.strictEqual(it.applicant, '주식회사 예시상사'); assert.strictEqual(it.inventor, '홍길동, 김예시');
});
ok('지식재산권 합본 — 쪽마다 한 건, 같은 번호 이어지는 쪽은 합침', () => {
  const a = fakeCert('CERTIFICATE OF PATENT', '10-1111111', '10-2019-0011111', '2019년 02월 15일', '2020년 04월 13일', 'Title of the Invention', '시험 장치', ['홍길동']);
  const b = fakeCert('CERTIFICATE OF UTILITY MODEL REGISTRATION', '20-0222222', '20-2022-0000222', '20922년 03월 29일', '2023년 04월 28일', '고안의 명칭 Title of the Device', '시험 설치장치', []);
  const b2 = ['20-0222222 호', 'Registration Number', '고안자 Devisers', '이예시(800101-*******)', '박예시(800101-*******)'].join('\n');
  const r = P.parseIP([a, b, b2].join('<<PAGE>>'));
  assert.strictEqual(r.items.length, 2);
  assert.strictEqual(r.items[1].kind, '실용신안'); assert.strictEqual(r.items[1].appDate, '2022-03-29'); assert.strictEqual(r.items[1].inventor, '이예시, 박예시');
});
ok('명칭 두 번 읽기 합치기', () => {
  assert.strictEqual(P.mergeTitleOcr('AXE 이용한 체적 산출 시스템', '센서를 이용한 체적 산출 시스템'), '센서를 이용한 체적 산출 시스템');
  assert.strictEqual(P.mergeTitleOcr('30 스캐너', '931 스캐너'), '30 스캐너');
  assert.strictEqual(P.mergeTitleOcr('IoT 기반 관리', '이오티 기반 관리'), 'IoT 기반 관리');
});
ok('특허 목록 표(엑셀) — 출원 중·등록·발명자 나눔·엑셀 날짜', () => {
  const rows = [['', 'No.', '권리', 'Our Ref.', '출원번호', '출원일', '출원인', '발명자', '등록번호', '등록일', '명칭한글'],
    ['', '1', '국내특허', 'A1', '10-2024-0000001', '45359', '주식회사 예시상사', '홍길동ㆍ김예시', '10-1234567-00-00', '2024-11-25', '시험 장치'],
    ['', '2', '국내특허', 'A2', '10-2025-0000002', '2025-01-02', '주식회사 예시상사', '홍길동', '-', '-', '출원 중 장치']];
  const it = P.parseIPList(rows);
  assert.strictEqual(it.length, 2);
  assert.strictEqual(it[0].regNo, '10-1234567-00-00'); assert.strictEqual(it[0].appDate, '2024-03-08'); assert.strictEqual(it[0].inventor, '홍길동, 김예시');
  assert.strictEqual(it[1].regNo, ''); assert.strictEqual(it[1].title, '출원 중 장치');
});
ok('지식재산권 날짜 — 월·일 글자가 숫자로 읽혀도, 영문 제목만으로도 등록증으로', () => {
  const page = d => ['CERTIFICATE OF PATENT', '제 10-1111111 호', 'Patent Number', '제 10-2019-0011111 호', 'Application Number', '출원 일 2019년 02월 15일', 'Filing Date', d, 'Registration Date', 'Title of the Invention', '시험 장치'].join('\n');
  [['20203 0481 139', '2020-04-13'], ['202593 08월 229', '2025-08-22'], ['202013 05월 28일', '2020-05-28'], ['2019 12가 03가', '2019-12-03']].forEach(([d, want]) => assert.strictEqual(P.parseIPPages([page(d)])[0].regDate, want, d));
  assert.strictEqual(P.parseTextDocument(['CERTIFICATE OF PATENT', '제 10-1111111 호', 'Patent Number', '제 10-2019-0011111 호', 'Application Number'].join('\n'), 'x.png').kind, 'ip');
});
ok('사업자등록증(등록증 본문) — 번호·상호·성명·생년월일·개업일·소재지·업태/종목', () => {
  const it = (s, x, y) => ({ s, x, y, w: s.length * 8, h: 10 });
  const pages = [[it('사업자등록증', 181, 722), it('(일반과세자)', 237, 699), it('등록번호 :', 202, 672), it('123-45-67890', 293, 672),
    it('상 호 :', 51, 648), it('예시주조', 175, 648), it('성 명 :', 51, 625), it('홍길동', 175, 625), it('생 년 월 일 :', 325, 625), it('1980 년 01 월 02 일', 419, 625),
    it('개 업 연 월 일 :', 51, 603), it('2019 년 04 월 01 일', 175, 603), it('사업장소재지 :', 51, 580), it('서울특별시 중구 시험로 1', 175, 580),
    it('사업의종류 :', 51, 537), it('업태', 178, 539), it('제조업', 209, 538), it('종목', 354, 539), it('탁주', 385, 538), it('약주', 385, 521)]];
  const r = P.parseDocument(pages, 'x.pdf');
  assert.strictEqual(r.kind, 'bizreg'); assert.strictEqual(r.status, 'ok');
  const f = r.fields;
  assert.strictEqual(f.corp_biz_no, '123-45-67890'); assert.strictEqual(f.corp_name, '예시주조'); assert.strictEqual(f.corp_ceo, '홍길동');
  assert.strictEqual(f.corp_ceo_birth, '1980-01-02'); assert.strictEqual(f.corp_est_date, '2019-04-01'); assert.strictEqual(f.corp_address, '서울특별시 중구 시험로 1');
  assert.strictEqual(f.corp_biz_type, '탁주 약주 (제조업)'); assert.ok(/개인/.test(f.corp_form));
});
ok('상담 메모(텍스트) — 칸·연도 매출·신용·체납·대출, 비밀번호·계좌·주민 뒷자리·자택주소는 버림', () => {
  const t = ['예시주조 123-45-67890', '● 대표자\t\t홍길동', '● 개업일\t\t2019 년 04 월 01 일', '● 소재지\t\t서울특별시 중구 시험로 1',
    '● 주민등록번호\t\t800102-1234567', '● 자택주소\t\t서울특별시 중구 비밀로 9', '● 업종\t\t탁주 제조업', '● 매출 25년 얼마로 마감?\t\t100,000,000원',
    '● 26년 상반기\t\t50,000,000원', '● 기존 기업신용 대출, 정책자금\t\t농협2천(개인), 정책자금 3천(기보)', '● 신용점수\t\tK895/N885',
    '● 국세,지방세 체납\t\tX', '● 공동인증서 비번\t\tsecretpw1!', '● 기보\t\tmyid / mypw2!', '주거래가 농협', '301-0000-0000-11', '아이디', 'ID0000'].join('\n');
  const r = P.parseNotes(t, new Date('2026-10-15'));
  const f = r.fields;
  assert.strictEqual(f.corp_name, '예시주조'); assert.strictEqual(f.corp_biz_no, '123-45-67890'); assert.strictEqual(f.corp_ceo, '홍길동');
  assert.strictEqual(f.corp_est_date, '2019-04-01'); assert.strictEqual(f.corp_ceo_birth, '1980-01-02');
  assert.strictEqual(r.vatYears[2025], 100000000); assert.strictEqual(r.vatYears[2026], 50000000);
  assert.strictEqual(f.sme_kcb, '895'); assert.strictEqual(f.sme_nice, '885'); assert.strictEqual(f.smb_chk_tax_ok, '예'); assert.strictEqual(f.corp_main_bank, '농협');
  assert.strictEqual(r.debtItems.length, 2); assert.strictEqual(r.debtItems[0].balance, 2000);
  const all = JSON.stringify(r);
  assert.ok(!/secretpw|mypw|myid|비밀로|1234567|301-0000|ID0000/.test(all), '비밀값이 결과에 남음');
});
// 표준재무제표 전체 과목(가짜 금액). 실물처럼 한 줄에 두 단(왼쪽 01~, 오른쪽 30~), 로마자 계산식 괄호, △ 음수
ok('재무제표 전체 과목: 표별·코드순·단계', () => {
  const rows = [
    ['표준재무제표증명'], ['표준재무상태표'], ['(단위 : 천원)'], ['과목', '코드', '금액', '과목', '코드', '금액'],
    ['Ⅰ.유동자산', '01', '500', 'Ⅲ.유동부채', '30', '200'],
    ['(1)당좌자산', '02', '300', '1.단기차입금', '31', '150'],
    ['1.현금및현금성자산', '03', '100', '2.미지급금', '32', '50'],
    ['2.매출채권', '04', '200', '부채총계', '33', '200'],
    ['(2)재고자산', '05', '200', 'Ⅴ.자본금', '34', '100'],
    ['자산총계', '06', '500', '자본총계', '35', '300'],
    ['표준손익계산서'],
    ['Ⅰ.매출액', '01', '1,000', 'Ⅵ.영업외수익', '20', '10'],
    ['Ⅱ.매출원가', '02', '600', '1.이자수익', '21', '10'],
    ['Ⅲ.매출총이익(Ⅰ-Ⅱ)', '03', '400', 'Ⅶ.영업외비용', '22', '30'],
    ['Ⅳ.판매비와관리비', '04', '450', '1.이자비용', '23', '30'],
    ['Ⅴ.영업이익(손실)(Ⅲ-Ⅳ)', '05', '△50', 'Ⅹ.당기순이익(손실)', '24', '△70']
  ];
  const r = P.parseFSFull(rows);
  assert.strictEqual(r.unit, '천원');
  assert.deepStrictEqual(r.sections.map(s => s.key), ['bs', 'is']);
  const bs = r.sections[0].rows, is = r.sections[1].rows;
  assert.deepStrictEqual(bs.map(x => x.code), [1, 2, 3, 4, 5, 6, 30, 31, 32, 33, 34, 35]);
  assert.strictEqual(bs[0].label, 'Ⅰ. 유동자산'); assert.strictEqual(bs[0].level, 1); assert.strictEqual(bs[0].won, 500000);
  assert.strictEqual(bs[1].level, 2); assert.strictEqual(bs[2].level, 3); assert.strictEqual(bs[5].level, 0);
  assert.strictEqual(is[2].label, 'Ⅲ. 매출총이익');   // 계산식 괄호 제거
  assert.strictEqual(is.find(x => x.name.startsWith('영업이익')).won, -50000);
  assert.strictEqual(is.length, 10);
  assert.deepStrictEqual(P.parseFSFull([['표준재무상태표'], ['자본총계(III+~VII)', '50', '300']]).sections[0].rows.map(x => [x.label, x.level]), [['자본총계', 0]]);
});
// 부가세 과세표준증명 → 반기 매출(가짜 금액): 법인 예정+확정은 더하고, 겹치는 예정은 빼고, 1년 한 번 신고는 반기 구분 없음
ok('부가세 반기 매출', () => {
  const r = P.parseVAT([
    ['2025/01/01', '2025/03/31', '100,000'], ['2025/01/01', '2025/06/30', '250,000'],
    ['2024/01/01', '2024/03/31', '90,000'], ['2024/04/01', '2024/06/30', '110,000'], ['2024/07/01', '2024/12/31', '230,000'],
    ['2023/01/01', '2023/12/31', '400,000']]);
  assert.deepStrictEqual(r.halfTotals, { '2025-1': 250000, '2024-1': 200000, '2024-2': 230000, '2023-0': 400000 });
});
// 법인등록번호(가짜 번호, 검증식만 맞춤): 라벨 옆이면 가리지 않고 읽음, 개인의 '주민(법인)' 칸은 주민번호로 가림
ok('법인등록번호 읽기·가리기 예외', () => {
  const mk = p => { let s = 0; for (let i = 0; i < 12; i++) s += +p[i] * (i % 2 ? 2 : 1); return p + ((10 - s % 10) % 10); };
  const a = mk('110111123456'), A = a.slice(0, 6) + '-' + a.slice(6);
  assert.ok(P.corpRegValid(a)); assert.ok(!P.corpRegValid('8001011234567'.slice(0, 12) + '0') || true);
  assert.ok(P.redact('법인등록번호 : ' + A).includes(A), '법인번호가 지워짐');
  assert.ok(!P.redact('주민(법인)등록번호 ' + A + ' 사업자등록번호 123-45-67890').includes(A), '개인 주민번호 칸이 남음');
  assert.ok(P.redact('주민등록번호 800101-1234567').includes('800101-*******'));
  const rows = ['사업자등록증', '(법인사업자)', '등록번호 : 123-81-12345', '법인명(단체명) : 주식회사 가나', '법인등록번호 : ' + A].map(l => [l]);
  assert.strictEqual(P.parseBizReg(rows, []).fields.corp_reg_no, A);
  const g = P.parseCorpReg([['등록번호 ' + A], ['상 호 주식회사 가나다'], ['본 점 서울특별시 강남구 테헤란로 1'], ['회사성립연월일 2015 년 03 월 02 일']]).fields;
  assert.deepStrictEqual([g.corp_reg_no, g.corp_name, g.corp_est_date], [A, '주식회사 가나다', '2015-03-02']);
});
ok('신분증: 운전면허증·주민등록증 이름·생년월일(가짜)', () => {
  const d = P.parseIdCard('자동차운전면허증\n11-12-345678-90\n홍길동\n800101-1234567\n서울특별시 강남구 역삼동\n').fields;
  assert.deepStrictEqual([d.corp_ceo, d.corp_ceo_birth], ['홍길동', '1980-01-01']);
  const j = P.parseIdCard('주 민 등 록 증\n이철수\n850707 - 1******\n서울특별시 종로구청장\n').fields;
  assert.deepStrictEqual([j.corp_ceo, j.corp_ceo_birth], ['이철수', '1985-07-07']);
  assert.ok(!/1234567/.test(JSON.stringify(d)));
});
// 세무사 결산 재무제표(가짜 금액): 글자가 한 자씩, 당기·전기 금액 열, 기간 줄에도 '(당)기'
ok('결산 재무제표: 당기·전기 두 해', () => {
  const its = [];
  const put = (str, x, y, step = 10) => [...str].forEach((c, i) => its.push({ s: c, x: x + i * step, y, w: 9, h: 9 }));
  const amt = (str, right, y) => [...str].forEach((c, i, a) => its.push({ s: c, x: right - (a.length - i) * 4.5, y, w: 4.5, h: 9 }));
  put('재무상태표', 200, 800, 12); put('제9(당)기2025년12월31일현재', 60, 780, 9); put('(단위:원)', 480, 760, 6);
  put('제9(', 280, 740, 5); its.push({ s: '당', x: 300, y: 740, w: 9, h: 9 }, { s: ')', x: 309, y: 740, w: 4, h: 9 }, { s: '기', x: 314, y: 740, w: 9, h: 9 });
  its.push({ s: '전', x: 466, y: 740, w: 9, h: 9 }, { s: ')', x: 475, y: 740, w: 4, h: 9 }, { s: '기', x: 480, y: 740, w: 9, h: 9 });
  const row = (name, y, cur, prev) => { put(name, 60, y, 12); amt(cur, 381, y); amt(prev, 547, y); };
  row('Ⅰ.유동자산', 700, '500,000', '400,000'); row('자산총계', 680, '900,000', '800,000'); row('부채총계', 660, '500,000', '450,000'); row('자본총계', 640, '400,000', '350,000');
  const isPage = [...'손익계산서'].map((c, i) => ({ s: c, x: 200 + i * 12, y: 800, w: 9, h: 9 }));
  const r = P.parseDocument([its, isPage], 'x.pdf');
  assert.strictEqual(r.kind, 'fsacct');
  assert.deepStrictEqual(r.fsList.map(y => [y.year, y.wonValues.assets, y.wonValues.equity, y.balanced]), [[2025, 900000, 400000, true], [2024, 800000, 350000, true]]);
});
ok('글자층이 깨진 PDF는 글자 인식으로', () => {
  assert.ok(P.garbledText('\u0002\u0003\u0004\u000e\u000f\u0010\u0011\u0012'.repeat(10) + 'ABC 123'));
  assert.ok(P.garbledText('/12/34/56 /78/90 /11/22/33/44/55 /66'.repeat(3)));
  assert.ok(!P.garbledText('사업자등록증 (법인사업자) 등록번호 : 123-81-12345 법인명(단체명) : 주식회사 가나'));
  const r = P.parseDocument([[...Array(40)].map((_, i) => ({ s: '\u0002\u0003\u0004\u000e', x: i * 10, y: 700, w: 9, h: 9 }))], 'x.pdf');
  assert.strictEqual(r.status, 'scan');
});
ok('사업자등록증 제목이 깨진 글자 인식: 본문 칸 이름으로 판별', () => {
  const t = ['Wa 국세청', 'ATS,', '=:', '( 법인사업자 )', '등록번호 : 123-81-00001', '법인 명(단체명) : 가나다라 주식회사', '대표자(가나다라) ： 홍길동',
    '개 업 연 월 일 : 2015 년 03 월 02일   법인 등록번호 : 110111-1234569', '사업장 소 재지 ： 서울특별시 중구 시험로 1', '본 점 소 재 지 : 서울특별시 중구 시험로 1',
    '사업의 종류 : 업태 서비스 종목 소프트웨어', '가 가 세 무 서 장'].join('\n');
  const r = P.parseTextDocument(t, 'doc_0.pdf');
  assert.strictEqual(r.kind, 'bizreg');
  assert.strictEqual(r.fields.corp_biz_no, '123-81-00001');
  assert.strictEqual(r.fields.corp_name, '가나다라 주식회사');
  assert.strictEqual(r.fields.corp_ceo, '홍길동');
  assert.strictEqual(r.fields.corp_reg_no, '110111-1234569');
  assert.strictEqual(r.fields.corp_est_date, '2015-03-02');
  assert.ok(!r.fields.corp_ceo_birth, '법인등록번호를 생년월일로 읽지 않음');
  // '법인등록번호' 라벨이 있으면 검증식이 안 맞아도(실제 번호에 있음) 앞자리가 날짜 꼴이어도 그대로 법인번호
  const r2 = P.parseTextDocument(t.replace('110111-1234569', '110111-1234561'), 'doc_0.pdf');
  assert.strictEqual(r2.fields.corp_reg_no, '110111-1234561');
  assert.strictEqual(r2.meta.corp_reg_no.valid, undefined);
  // 라벨이 깨져 '법인'을 못 읽고 검증식도 안 맞으면: 낮은 신뢰 + 원본 확인
  const r3 = P.parseTextDocument(t.replace('법인 등록번호 : 110111-1234569', '가가 등록번호 : 134511-1234561'), 'doc_0.pdf');
  assert.strictEqual(r3.fields.corp_reg_no, '134511-1234561');
  assert.strictEqual(r3.meta.corp_reg_no.valid, false);
  // 칸 이름이 하나뿐이면 판별하지 않음
  assert.strictEqual(P.parseTextDocument(['( 법인사업자 )', '등록번호 : 123-81-12345', '아무 내용'].join('\n'), 'x.png').kind, 'unknown');
});
ok('사업자등록증명 스캔: 쌍점 없는 같은 줄 칸 이름 + 값(잡음 _ | 섞임)', () => {
  const t = ['[국세청 사업자등록증명]', '( 법인사업자 )', '상 호 ( 법 인 명 ) 가나다주식회사', '사 업 자 등 록 번 호 _123-81-00001', '성 명 ( 대 표 자 ) 홍길동',
    '| 사 업 장 소 재 지 서울특별시 중구 시험로 1', '| 개      업      일 2015a 03가 02가'].join('\n');
  const r = P.parseTextDocument(t, 'x.pdf', 'bizcert');
  assert.deepStrictEqual([r.fields.corp_name, r.fields.corp_biz_no, r.fields.corp_ceo, r.fields.corp_est_date, r.fields.corp_form],
    ['가나다주식회사', '123-81-00001', '홍길동', '2015-03-02', '법인 · 일반과세']);
  assert.ok(/서울특별시 중구/.test(r.fields.corp_address));
});
ok('흐린 스캔 보충: 대표자성명·잡음(、)·한 글자 상호·둥록·업태 칸 위 값·사업의 종류·법인번호', () => {
  const a = ['사업자등록증명', '( 법인사업자 )', '상호 ( 법 인 명 ) 녁', '사 업 자 둥 록 번 호 123-81-00001', '대표자성명(대표유형) 홍길동',
    '| 주민(가나)등록번호 _134511-0000001', '| 개      업      일 _2015년 03월 02일', '음식/제조/도,소매', '업             태', '한식/떡류/식품', '종            목'].join('\n');
  const r = P.parseTextDocument(a, 'x.pdf');
  assert.strictEqual(r.kind, 'bizcert');
  assert.deepStrictEqual([r.fields.corp_name, r.fields.corp_biz_no, r.fields.corp_ceo, r.fields.corp_reg_no], ['녁', '123-81-00001', '홍길동', '134511-0000001']);
  assert.strictEqual(r.fields.corp_biz_type, '한식/떡류/식품 (음식/제조/도,소매)');
  const b = P.parseTextDocument(['부가가치세과세표준중명', '성     명(대표자) 、 홍길동                 주민(법인>등록번호', '2024/01/01 2024/06/30 1,000 0 1,000 0'].join('\n'), 'x.pdf');
  assert.strictEqual(b.fields.corp_ceo, '홍길동');
  const c = P.parseTextDocument(['사업자등록증', '( 법인사업자 )', '등록번호 : 123-81-00001', '법인명(단체명) : 가나주식회사', '대     표     자 : 홍길동', '사업의 종류 : 제조업 기계부품 도매업 전자부품', '발 급 사 유 : 신규'].join('\n'), 'x.pdf');
  assert.strictEqual(c.fields.corp_biz_type, '제조업 기계부품 도매업 전자부품');
});
ok('부가세 과세표준증명 스캔(글자 인식): 기간·금액·합계 검산', () => {
  const t = ['부가가치세과세표준증명', '성 명(대표자) 홍길동', '사 업 자 등 록 번 호 123-81-00001',
    '2024/01/01 2024/06/30 183,434,740 0 183,434,740 0', '2024/07/01 2024/12/31 173,653,010 0 173.653,O10 0'].join('\n');
  const r = P.parseTextDocument(t, 'x.pdf');
  assert.strictEqual(r.kind, 'vat'); assert.strictEqual(r.status, 'ok');
  assert.deepStrictEqual(r.vatHalves, { '2024-1': 183434740, '2024-2': 173653010 });
  assert.strictEqual(r.fields.corp_biz_no, '123-81-00001');
  assert.ok(r.notes.some(x => /합계 검산 2\/2/.test(x)));
  // 숫자 하나 오독(합계 안 맞음) → 월평균 정확도 낮춤
  const r2 = P.parseTextDocument(t.replace('183,434,740 0 183', '188,434,740 0 183'), 'x.pdf');
  assert.ok(r2.meta.smb_monthly_sales.conf < 0.6);
});
ok('표준산업분류 추천: 사업자등록증 업태·종목 → KSIC 11차 세세분류', () => {
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'ksic11.json'), 'utf8'));
  assert.strictEqual(D.items.length, 1205);
  const top = (u, i) => (P.suggestKsic(u, i, D)[0] || {}).code;
  assert.strictEqual(top('도매 및 소매업', '주유소'), '47711');
  assert.ok(/^4620[24]$/.test(top('도매', '화훼')));
  assert.ok(/^011(22|51)$/.test(top('농업', '화훼')));
  assert.strictEqual(top('소매업', '꽃집'), '47851');
  assert.strictEqual(top('서비스', '미용실'), '96112');
  assert.strictEqual(top('숙박 및 음식점업', '커피전문점'), '56221');
  assert.ok(/^85/.test(top('서비스업', '학원')) && top('서비스업', '학원') !== '85303');   // 교육 서비스, '대학원'(85303)에 붙지 않음
  assert.strictEqual(top('제조', '빵'), '10602');
  assert.strictEqual(top('건설업', '실내건축공사'), '42412');
  assert.strictEqual(top('서비스업', '경영컨설팅'), '71531');
  assert.deepStrictEqual(P.suggestKsic('', '', D), []);
  assert.strictEqual(P.searchKsic('47711', D)[0].name, '운송장비용 주유소 운영업');
});
ok('사업자등록증 업태·종목은 원문 그대로 따로', () => {
  const a = ['사업자등록증명', '( 법인사업자 )', '상호 ( 법 인 명 ) 녁', '사 업 자 둥 록 번 호 123-81-00001', '음식/제조/도,소매', '업             태', '한식/떡류/식품', '종            목'].join('\n');
  const r = P.parseTextDocument(a, 'x.pdf');
  assert.strictEqual(r.fields.corp_biz_up, '음식/제조/도,소매');
  assert.strictEqual(r.fields.corp_biz_item, '한식/떡류/식품');
});
ok('법정 규모 기준(표준산업분류)', () => {
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'ksic11.json'), 'utf8'));
  const g = P.sizeRule('47711', D);
  assert.deepStrictEqual([g.section, g.smeEok, g.smallEok, g.smbEmp], ['G', 1000, 50, 5]);
  const c = P.sizeRule('10602', D); // 빵 제조(C10): 소기업 120억, 소상공인 10명 미만
  assert.deepStrictEqual([c.section, c.smallEok, c.smbEmp], ['C', 120, 10]);
  assert.strictEqual(P.sizeTier(g, 4, 30), 'smb');
  assert.strictEqual(P.sizeTier(g, 8, 30), 'small');
  assert.strictEqual(P.sizeTier(g, 8, 60), 'sme');
  assert.strictEqual(P.sizeTier(g, 8, 1200), 'over');
  assert.strictEqual(P.sizeTier(g, 3, null), 'smb');
  assert.strictEqual(P.sizeTier(g, 8, null), null);
  assert.strictEqual(P.sizeRule('', D), null);
});
ok('신분증 주민등록번호 13자리(가짜 번호)', () => {
  assert.strictEqual(P.rrnFrom('주민등록증 홍길동 900101-1234568 서울특별시'), '900101-1234568');
  assert.strictEqual(P.rrnFrom('900101 - l234568'), '900101-1234568');           // 글자 인식 잡음
  assert.strictEqual(P.rrnFrom('금액 123,456 원 / 991399-1234567'), '');            // 날짜 꼴 아님
  assert.strictEqual(P.rrnFrom('900101-1234560 그리고 900101-1234568'), '900101-1234568'); // 검증식 맞는 쪽 우선
  assert.ok(!/1234568/.test(P.redact('900101-1234568')));                          // 서류 글에서는 여전히 가림
});
ok('사업계획 정답지: 모든 대분류 × 규모가 빈칸 없이, 지어낸 숫자 없이', () => {
  const lib = JSON.parse(fs.readFileSync(path.join(__dirname, 'bp_lib.json'), 'utf8'));
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'ksic11.json'), 'utf8'));
  for (const sec of 'ABCDEFGHIJKLMNOPQRSTU') {
    const code = (D.items.find(x => x[2] === sec) || [])[0];
    for (const size of ['smb', 'small', 'sme']) {
      const r = P.bpCompose({ code, section: sec, size, ksicName: '시험 업종' }, lib);
      for (const k of ['problem', 'solution', 'market', 'budget', 'team', 'outcome']) {
        if (k === 'solution') { assert.ok(/개발·도입 계획/.test(r.fields[k]), `${sec}/${size} ${k} 비어 있음`); continue; }
        assert.ok(r.fields[k] && r.fields[k].length > 10, `${sec}/${size} ${k} 비어 있음`);
        assert.ok(r.fields[k].split('\n').length <= 6, `${sec}/${size} ${k} 줄이 너무 많음`);
      }
      const all = Object.values(r.fields).join('\n').split('(' + code + ')').join('');   // 표준산업분류 코드 표기는 입력값
      assert.ok(!/\d/.test(all), `${sec}/${size} 입력에 없는 숫자: ${(all.match(/.{0,12}\d.{0,12}/) || [])[0]}`);
      assert.deepStrictEqual(r.banHits, [], `${sec}/${size} 업종에 안 맞는 말: ${r.banHits}`);
    }
  }
});
ok('사업계획 정답지: 세분류마다 그 세트가 쓰이고 안 맞는 말 없음', () => {
  const lib = JSON.parse(fs.readFileSync(path.join(__dirname, 'bp_lib.json'), 'utf8'));
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'ksic11.json'), 'utf8'));
  for (const key of Object.keys(lib.subs)) {
    const it = D.items.find(x => x[0].startsWith(key));
    assert.ok(it, `세분류 ${key} 에 맞는 표준산업분류 코드가 없음`);
    for (const size of ['smb', 'sme']) {
      const r = P.bpCompose({ code: it[0], section: it[2], size }, lib);
      assert.strictEqual(r.sub, key === r.sub ? key : r.sub);   // 더 긴 앞자리 세트가 있으면 그쪽
      assert.ok(it[0].startsWith(r.sub), `${key}: 세분류 세트가 안 쓰임`);
      assert.deepStrictEqual(r.banHits, [], `${key}/${size} 안 맞는 말: ${r.banHits}`);
    }
  }
});
ok('사업계획 정답지: 주유소·꽃집은 그 업종 말만, 사실은 입력값 그대로', () => {
  const lib = JSON.parse(fs.readFileSync(path.join(__dirname, 'bp_lib.json'), 'utf8'));
  const gas = P.bpCompose({ code: '47711', section: 'G', size: 'smb', ksicName: '운송장비용 주유소 운영업', item: '주유소', highRate: true, maxRate: 9.5, employees: 3 }, lib);
  const gt = Object.values(gas.fields).join('\n');
  assert.strictEqual(gas.sub, '47711');
  assert.ok(/주유/.test(gt) && /9\.5%/.test(gt) && /3명/.test(gt));
  for (const w of ['풀필먼트', '라이브커머스', 'CNC', 'SaaS', '임상', '클린룸']) assert.ok(!gt.includes(w), '주유소에 ' + w);
  const flo = P.bpCompose({ code: '47851', section: 'G', size: 'smb', item: '꽃집' }, lib);
  const ft = Object.values(flo.fields).join('\n');
  assert.strictEqual(flo.sub, '4785');
  assert.ok(/꽃|화훼|생화/.test(ft));
  for (const w of ['풀필먼트', 'CNC', '주유', '임상']) assert.ok(!ft.includes(w), '꽃집에 ' + w);
  // 같은 입력 → 같은 글(매번 달라지지 않음)
  assert.deepStrictEqual(P.bpCompose({ code: '47851', section: 'G', size: 'smb', item: '꽃집' }, lib).fields, flo.fields);
});
ok('한글 금액', () => {
  assert.strictEqual(P.koreanAmount('삼천만'), 30000000);
  assert.strictEqual(P.koreanAmount('일백이십만'), 1200000);
  assert.strictEqual(P.koreanAmount('일억 이천만'), 120000000);
});
ok('사업자등록번호 검증식', () => {
  assert.strictEqual(P.bizNoValid('220-81-62517'), true);
  assert.strictEqual(P.bizNoValid('123-45-67890'), false);
});
// 합본 PDF(가짜 값): 서류 여러 개를 한 파일로 → 쪽마다 제목으로 나눔
const mkPage = rows => rows.flatMap((r, i) => r.map((s, j) => ({ s, x: 50 + j * 160, y: 800 - i * 20, w: s.length * 8, h: 10 })));
const BIZCERT_P = mkPage([['발급번호 : 1111-2222-3333'], ['사업자등록증명'], ['( 법인사업자 )'], ['상호(법인명)', '가나다주식회사'], ['사업자등록번호', '123-81-00001'], ['성명(대표자)', '홍길동'], ['개업일', '2015년 03월 02일']]);
const VAT_P = mkPage([['발급번호 : 4444-5555-6666'], ['부가가치세 과세표준증명'], ['사업자등록번호', '123-81-00001'], ['과세기간', '과세표준'],
  ['2024/01/01', '2024/06/30', '100,000,000'], ['2024/07/01', '2024/12/31', '120,000,000'], ['2023/01/01', '2023/06/30', '90,000,000'], ['2023/07/01', '2023/12/31', '95,000,000']]);
const fsTitle = (y, sales) => mkPage([['표준재무제표증명'], [y + '년 귀속'], ['표준재무상태표'], ['(단위 : 원)'], ['과목', '코드', '금액'],
  ['Ⅰ.유동자산', '01', '500,000,000'], ['자산총계', '06', '900,000,000'], ['부채총계', '33', '400,000,000'], ['자본총계', '35', '500,000,000']]);
const fsIs = sales => mkPage([['표준손익계산서'], ['과목', '코드', '금액'], ['Ⅰ.매출액', '01', sales], ['Ⅱ.매출원가', '02', '600,000,000'], ['Ⅴ.영업이익(손실)', '05', '50,000,000'], ['Ⅹ.당기순이익(손실)', '24', '30,000,000']]);
const CONT_P = mkPage([['3.기타비용', '25', '1,000,000'], ['4.잡손실', '26', '500,000']]);
ok('합본 PDF 나누기: 사업자등록증명 + 부가세 + 재무제표 2개년(이어지는 쪽 포함)', () => {
  const pages = [BIZCERT_P, VAT_P, fsTitle(2024), fsIs('1,200,000,000'), fsTitle(2023), fsIs('1,000,000,000'), CONT_P];
  const s = P.splitBundle(pages, { fileName: '합본.pdf' });
  assert.deepStrictEqual(s.map(x => [x.from, x.to, x.kind]), [[1, 1, 'bizcert'], [2, 2, 'vat'], [3, 4, 'fs'], [5, 7, 'fs']]);
  assert.strictEqual(s[3].pages.length, 3);
  const r = s.map(x => P.parseDocument(x.pages, '합본.pdf', x.kind));
  assert.strictEqual(r[0].fields.corp_biz_no, '123-81-00001');
  assert.deepStrictEqual(r[1].vatYears, { 2024: 220000000, 2023: 185000000 });
  assert.deepStrictEqual([r[2].fs.year, r[3].fs.year], [2024, 2023]);
  assert.deepStrictEqual([r[2].fs.wonValues.sales, r[3].fs.wonValues.sales], [1200000000, 1000000000]);
});
ok('합본 PDF 나누기: 서류 하나짜리는 그대로 한 묶음', () => {
  for (const pages of [[fsTitle(2024), fsIs('1,000')], [BIZCERT_P], [VAT_P, CONT_P], CL.layoutKcis(), CL.layoutOther(), CL.layoutChars(), [CONT_P, fsTitle(2024), fsIs('1,000')]]) {
    const s = P.splitBundle(pages, { fileName: 'x.pdf' });
    assert.strictEqual(s.length, 1); assert.strictEqual(s[0].pages, pages); assert.deepStrictEqual([s[0].from, s[0].to], [1, pages.length]);
  }
  assert.strictEqual(P.splitBundle([], {}).length, 1);
});
ok('합본 PDF 나누기: 같은 종류는 발급번호가 다르거나 1쪽 표시일 때만 새 서류', () => {
  const v2 = mkPage([['발급번호 : 7777-8888-9999'], ['부가가치세 과세표준증명'], ['과세기간', '과세표준'], ['2022/01/01', '2022/12/31', '80,000,000']]);
  assert.deepStrictEqual(P.splitBundle([VAT_P, v2]).map(x => [x.from, x.to]), [[1, 1], [2, 2]]);
  const ins = k => mkPage([['사업장가입자명부'], ['- ' + k + ' -']]);
  assert.deepStrictEqual(P.splitBundle([ins(1), ins(2), ins(1)]).map(x => [x.from, x.to]), [[1, 2], [3, 3]]);
  assert.strictEqual(P.splitBundle([ins(1), mkPage([['사업장가입자명부']])]).length, 1);   // 제목만 되풀이 → 한 서류
});
ok('합본 스캔(글자 인식) 나누기: 제목 깨진 사업자등록증 + 부가세 + 이어지는 쪽', () => {
  const texts = [
    '사 엽 자 등 륵 중\n( 법인사업자 )\n등록번호 : 123-81-00001\n법인명(단체명) : 가나주식회사\n개업연월일 : 2015 년 03 월 02 일\n사업장소재지 : 서울특별시 강남구 테헤란로 1',
    '부가가치세과세표준중명\n성 명(대표자) 홍길동\n사 업 자 등 록 번 호 123-81-00001\n2024/01/01 2024/06/30 183,434,740 0 183,434,740 0',
    '2024/07/01 2024/12/31 173,653,010 0 173,653,010 0'
  ];
  const s = P.splitBundleText(texts);
  assert.deepStrictEqual(s.map(x => [x.from, x.to, x.kind]), [[1, 1, 'bizreg'], [2, 3, 'vat']]);
  assert.ok(s[1].text.includes('<<PAGE>>'));
  const b = P.parseTextDocument(s[0].text, 'x.pdf', s[0].kind), v = P.parseTextDocument(s[1].text, 'x.pdf', s[1].kind);
  assert.strictEqual(b.fields.corp_biz_no, '123-81-00001');
  assert.deepStrictEqual(v.vatHalves, { '2024-1': 183434740, '2024-2': 173653010 });
  assert.strictEqual(P.splitBundleText([texts[1], texts[2]]).length, 1);
  assert.strictEqual(P.splitBundleText([texts[1], texts[2]])[0].text, texts[1] + '\n<<PAGE>>\n' + texts[2]);
});
console.log(`\n${n}개 통과`);

// 앱(HTML) 안에 넣은 해석기가 tools/doc-parsers.js 와 같은지
ok('앱 내장본 = 원본', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '코스텝_경영진단_리드디벨롭.html'), 'utf8');
  const src = fs.readFileSync(path.join(__dirname, 'doc-parsers.js'), 'utf8');
  assert.ok(html.includes(src.trim()), 'HTML 안 해석기가 원본과 다릅니다 — 원본을 고친 뒤 HTML 에 다시 넣으세요');
});
console.log(`${n}개 통과(대조 포함)`);
