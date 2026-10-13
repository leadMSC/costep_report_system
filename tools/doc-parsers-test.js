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
console.log(`\n${n}개 통과`);

// 앱(HTML) 안에 넣은 해석기가 tools/doc-parsers.js 와 같은지
ok('앱 내장본 = 원본', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '코스텝_경영진단_리드디벨롭.html'), 'utf8');
  const src = fs.readFileSync(path.join(__dirname, 'doc-parsers.js'), 'utf8');
  assert.ok(html.includes(src.trim()), 'HTML 안 해석기가 원본과 다릅니다 — 원본을 고친 뒤 HTML 에 다시 넣으세요');
});
console.log(`${n}개 통과(대조 포함)`);
