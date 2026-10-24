// 사업계획 개요서 정답지 세트 — 생성 예시를 docs/사업계획_정답지_예시.md 로 뽑는다(세트를 고친 뒤 눈으로 검토용)
//   node tools/bp_lib/sample.js
const fs = require('fs'), path = require('path');
const P = require('../doc-parsers.js'), lib = require('../bp_lib.json');
const N = { problem: '① 추진 배경·현장 애로', solution: '② 차별화·개발 계획', market: '③ 시장·판로', budget: '④ 소요자금·조달', team: '⑤ 대표·조직 역량', outcome: '⑥ 고용·성장 목표' };
const cases = [
  ['주유소 · 소상공인 · 고금리 대출 있음', { code: '47711', section: 'G', size: 'smb', ksicName: '운송장비용 주유소 운영업', item: '주유소', years: 9, salesText: '월평균 매출 8,500만원', employees: 3, highRate: true, maxRate: 9.5, salesChannel: '매장 판매 (B2C)' }],
  ['꽃집 · 소상공인 · 창업 2년 · 청년 여성 대표', { code: '47851', section: 'G', size: 'smb', ksicName: '화초 및 식물 소매업', item: '꽃집', years: 2, salesText: '월평균 매출 1,200만원', employees: 0, ceoAge: 31, ceoSex: '여', smartWish: true }],
  ['화훼 재배 · 소상공인', { code: '01122', section: 'A', size: 'smb', ksicName: '화훼작물 재배업', item: '장미 재배', years: 12, employees: 2, equip: 'none' }],
  ['정밀 금형 · 중기업 · 수출·특허·인증', { code: '25999', section: 'C', size: 'sme', ksicName: '그 외 기타 분류 안된 금속 가공 제품 제조업', item: '정밀 금형', years: 15, salesText: '연매출 4,200백만원', employees: 32, certs: 'ISO 9001, 이노비즈', ipText: '특허 2건', equip: 'yes', equipDetail: '5축 CNC 2대', export: 'yes', exportAmt: '320' }],
  ['빵 제조 · 소기업', { code: '10602', section: 'C', size: 'small', ksicName: '빵류 제조업', item: '베이커리 제조', years: 6, employees: 9 }],
  ['실내 인테리어 공사 · 소기업', { code: '42412', section: 'F', size: 'small', ksicName: '도배, 실내장식 및 내장 목공사업', item: '인테리어', years: 8, employees: 6 }],
  ['앱 개발 · 소기업 · 인증 없음', { code: '62010', section: 'J', size: 'small', ksicName: '컴퓨터 프로그래밍 서비스업', item: '앱 개발', years: 4, salesText: '연매출 900백만원', employees: 8 }],
  ['카페 · 소상공인 · 매출 감소', { code: '56221', section: 'I', size: 'smb', ksicName: '커피 전문점', item: '카페', years: 5, salesText: '월평균 매출 2,300만원', employees: 2, salesTrend: 'down' }],
  ['미용실 · 소상공인 · 고금리', { code: '96112', section: 'S', size: 'smb', ksicName: '두발 미용업', item: '미용실', years: 3, employees: 1, highRate: true, maxRate: 12.5 }],
  ['보습 학원 · 소상공인', { code: '85501', section: 'P', size: 'smb', ksicName: '일반 교과 학원', item: '보습학원', years: 4, employees: 3 }],
  ['요양원 · 소기업', { code: '87111', section: 'Q', size: 'small', ksicName: '노인 요양 복지시설 운영업', item: '요양원', years: 7, employees: 14 }],
  ['화물 운송 · 중기업', { code: '49301', section: 'H', size: 'sme', ksicName: '일반 화물자동차 운송업', item: '화물 운송', years: 11, employees: 40 }]
];
let md = '# 사업계획 개요서 정답지 세트 — 생성 예시\n\n> `tools/bp_lib/sample.js` 로 뽑은 자동 생성 결과 그대로(편집 없음). [○○] 는 컨설턴트가 실제 값으로 채우는 칸, 숫자는 입력값에서만 들어갑니다.\n\n';
md += `세트 규모: 대분류 ${Object.keys(lib.sections).length}개 · 세분류 ${Object.keys(lib.subs).length}개 · 규모 3종 · 상황 ${Object.keys(lib.situations).length}가지\n\n`;
for (const [t, c] of cases) {
  const r = P.bpCompose(c, lib);
  md += `## ${t}\n\n_세트: ${r.sub ? lib.subs[r.sub].name + ' → ' : ''}${lib.sections[r.section].name} · 상황: ${r.flags.join(', ') || '없음'}_\n\n`;
  for (const k in N) md += `**${N[k]}**\n\n` + r.fields[k].split('\n').map(l => '    ' + l).join('\n') + '\n\n';
}
fs.writeFileSync(path.join(__dirname, '..', '..', 'docs', '사업계획_정답지_예시.md'), md);
console.log('docs/사업계획_정답지_예시.md', cases.length + '건');
