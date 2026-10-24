// 리드디벨롭 시나리오 목록 — scenario-runner.html 이 순서대로 실행한다.
// run(api) 은 { verdict: 'PASS' | 'FAIL' | 'WARN', evidence: [문장...] } 를 돌려준다.
// FAIL = 고객 출력물이 틀리거나 입력이 사라짐, WARN = 문구가 오해를 부를 수 있어 사람이 판단할 것.

const LONG_PLAN = '구형 설비 노후화로 불량률이 높아 납기 지연이 반복되고 있으며 원자재 단가 상승으로 채산성이 악화되어 '.repeat(7).slice(0, 500);

window.SCENARIOS = [
  {
    id: '0-0', name: '작성 예시 전수 렌더 (3규모 × 6분야 × 4서식 × 3업종)',
    async run(api) {
      api.demo();
      const issues = api.sweep(['smb', 'small', 'sme'], ['mfg', 'logis', 'service']);
      return { verdict: issues.length ? 'FAIL' : 'PASS', evidence: issues.length ? issues : ['넘침·잔여 토큰 없음 (216장)'] };
    }
  },
  {
    id: '1-1', name: '사업자 구분별 시행문 수신 표기',
    async run(api) {
      api.demo(); api.set('corp_form', '개인 · 일반과세');
      const indiv = api.line(api.render('smb', null).official, '귀하');
      api.set('corp_form', '법인 · 일반과세');
      const corp = api.line(api.render('smb', null).official, '귀하');
      const ok = indiv.includes('대표 귀하') && !indiv.includes('대표이사') && corp.includes('대표이사 귀하');
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: ['개인사업자: ' + indiv, '법인: ' + corp] };
    }
  },
  {
    id: '1-2', name: '매출 0 / 고정비 0 / 매출만 입력',
    async run(api) {
      const ev = []; let verdict = 'PASS';
      const fixed = ['smb_cost_rent', 'smb_cost_util', 'smb_cost_labor', 'smb_cost_rental', 'smb_cost_interest'];
      api.fresh(); api.set('smb_monthly_sales', '0'); api.set('smb_cost_rent', '300');
      const a = api.line(api.render('smb', 'manage').report, '수지 판정');
      ev.push('매출0·고정비300 → ' + a);
      if (!a.includes('월 매출 0원')) verdict = 'FAIL';
      api.fresh(); api.set('smb_monthly_sales', '1000'); fixed.forEach(id => api.set(id, ''));
      const r = api.render('smb', 'manage').report;
      ev.push('매출1000·고정비 빈칸 → ' + api.line(r, '수지 판정') + ' / ' + api.line(r, '손익분기 매출'));
      if (/최소 0만원|흑자 운용/.test(r) || !r.includes('판정 불가')) verdict = 'FAIL';
      return { verdict, evidence: ev };
    }
  },
  {
    id: '1-3', name: '음수·소수·한글 숫자 입력',
    async run(api) {
      const ev = []; let verdict = 'PASS';
      api.fresh();
      api.set('smb_cost_rent', '-100');
      const rent = api.val('smb_cost_rent'), rentMsg = api.doc.getElementById('smb_cost_rent').validationMessage;
      api.set('smb_cost_util', '12.5');
      api.set('smb_monthly_sales', '1억');
      const sales = api.val('smb_monthly_sales'), salesMsg = api.doc.getElementById('smb_monthly_sales').validationMessage;
      const fixedTxt = api.text('smb_disp_fixed_total');
      ev.push(`임차료 "-100" → "${rent}" ${rentMsg ? '(안내: ' + rentMsg + ')' : '(안내 없음)'}`);
      ev.push(`매출 "1억" → "${sales}" ${salesMsg ? '(안내 표시)' : '(안내 없음)'}`);
      ev.push(`관리비 12.5 포함 고정비 합계 "${fixedTxt}"`);
      if (fixedTxt.startsWith('-') || rent.startsWith('-') || sales === '1' || !salesMsg) verdict = 'FAIL';
      api.demo(); api.call('setBizTrack', 'sme'); api.set('sme_profit', '-120');
      ev.push(`영업이익 "-120"(손실) → "${api.val('sme_profit')}" (음수 허용 칸)`);
      if (api.val('sme_profit') !== '-120') verdict = 'FAIL';
      return { verdict, evidence: ev };
    }
  },
  {
    id: '1-4', name: '대출 0건 / 10건 / 금리 7.0% / 0%',
    async run(api) {
      const ev = []; let verdict = 'PASS';
      api.demo(); api.setDebts([]);
      const zero = api.render('smb', 'debt');
      ev.push('0건 → ' + api.line(zero.report, '금융차입금'));
      ev.push(`0건일 때 월 차입이자 칸 "${api.val('smb_cost_interest')}" (작성 예시 65 유지 여부)`);
      const ten = Array.from({ length: 10 }, (_, i) => ({ institution: '은행' + (i + 1), type: '운전자금', balance: 1000, rate: 4, monthlyInterest: 3, payback: '만기일시' }));
      api.demo(); api.setDebts(ten);
      const t = api.render('sme', 'finance');
      ev.push(`10건 → 결과보고서 넘침 ${t.overflow.length ? t.overflow.join(', ') : '없음'}`);
      if (t.overflow.length) verdict = 'FAIL';
      api.demo(); api.setDebts([{ institution: 'A', type: '운전자금', balance: 1000, rate: 7.0, monthlyInterest: 6, payback: '-' }]);
      const alertShown = !api.doc.getElementById('debt_high_rate_alert').classList.contains('hidden');
      ev.push(`금리 7.0% → 고금리 경고 ${alertShown ? '표시' : '미표시'}`);
      if (!alertShown) verdict = 'FAIL';
      api.setDebts([{ institution: 'A', type: '운전자금', balance: 1000, rate: 0, monthlyInterest: 0, payback: '-' }]);
      ev.push(`금리 0% → 평균금리 "${api.text('debt_avg_rate')}"`);
      return { verdict, evidence: ev };
    }
  },
  {
    id: '1-5', name: '긴 상호·주소·사업계획(각 500자)',
    async run(api) {
      api.demo();
      api.set('corp_name', '주식회사 대한민국정밀기계부품제조및첨단소재연구개발센터글로벌');
      api.set('corp_address', '경기도 화성시 동탄첨단산업1로 27 동탄테크노밸리 지식산업센터 A동 15층 1501호 1502호 1503호 (영천동, 금강펜테리움 IX타워)');
      ['bp_problem', 'bp_solution', 'bp_market', 'bp_budget', 'bp_team', 'bp_outcome'].forEach(id => api.set(id, LONG_PLAN));
      const issues = api.sweep(['smb', 'sme'], ['mfg']);
      return { verdict: issues.length ? 'FAIL' : 'PASS', evidence: issues.length ? issues : ['넘침 없음'] };
    }
  },
  {
    id: '1-6', name: '특수문자 상호 <b>&"',
    async run(api) {
      api.demo(); api.set('corp_name', '<b>굵게</b> & "따옴표" 상사');
      const s = api.render('smb', null);
      const bolded = [...api.doc.querySelectorAll('#print_target_report b')].some(b => b.textContent === '굵게');
      const literal = s.report.includes('<b>굵게</b>');
      return { verdict: (!bolded && literal) ? 'PASS' : 'FAIL', evidence: [`문자 그대로 표시 ${literal ? '예' : '아니오'}, 태그로 해석 ${bolded ? '예' : '아니오'}`] };
    }
  },
  {
    id: '1-7', name: '설립일 미래 / 올해 / 비움 → 사업계획 업력 문구',
    async run(api) {
      const ev = []; let verdict = 'PASS';
      const y = new Date().getFullYear();
      const cases = [['미래(2030-01-01)', '2030-01-01', '설립 예정'], [`올해(${y}-01-02)`, `${y}-01-02`, '올해 설립'], ['비움', '', ''], ['5년 전', `${y - 5}-03-01`, '설립 5년차']];
      for (const [label, val, expect] of cases) {
        api.demo(); ['bp_problem', 'bp_solution', 'bp_market', 'bp_budget', 'bp_team', 'bp_outcome'].forEach(id => api.set(id, ''));
        api.set('corp_est_date', val); api.call('autoGenerateBusinessPlan');
        const team = api.val('bp_team').split(/\r?\n/)[0];
        const ok = (expect ? team.includes(expect) : !/년차|올해 설립|설립 예정/.test(team)) && !team.includes('다년간');
        if (!ok) verdict = 'FAIL';
        ev.push(`${label} → ${ok ? '맞음' : '틀림'}: ${team.match(/\(([^)]*)\)/)?.[1] || team.slice(0, 60)}`);
      }
      ev.push('설립일 입력칸 최댓값: ' + (api.doc.getElementById('corp_est_date').max || '없음'));
      return { verdict, evidence: ev };
    }
  },
  {
    id: '1-8', name: '규모 전환 후 숨은 칸 값 섞임',
    async run(api) {
      api.demo(); api.call('setBizTrack', 'sme'); api.call('setBizTrack', 'smb');
      const s = api.render('smb', null);
      const leak = /NICE|KCB|가지급금|Y-3/.test(s.report);
      return { verdict: leak ? 'FAIL' : 'PASS', evidence: [leak ? '소상공인 보고서에 중소기업 재무 항목이 섞임' : '소상공인 보고서에 중소기업 항목 없음'] };
    }
  },
  {
    id: '1-9', name: '작성한 사업계획 → 자동 생성 버튼',
    async run(api) {
      const ev = []; let verdict = 'PASS';
      const mine = '우리 회사가 직접 쓴 문제 인식 문장';
      api.demo(); api.set('bp_problem', mine); api.set('bp_budget', '');
      api.w.confirm = () => true;                      // [확인] 빈 칸만 채우기
      api.call('autoGenerateBusinessPlan');
      const kept = api.val('bp_problem') === mine, budgetFilled = api.val('bp_budget') !== '';
      ev.push(`빈 칸만 채우기 → 직접 쓴 문장 ${kept ? '유지' : '사라짐'}, 빈 자금계획 칸 ${budgetFilled ? '채워짐' : '빈칸'}`);
      if (!kept || !budgetFilled) verdict = 'FAIL';
      let n = 0; api.w.confirm = () => (++n === 2);     // [취소] → [확인] 전체 새로 작성
      api.set('bp_problem', mine); api.call('autoGenerateBusinessPlan');
      const replaced = api.val('bp_problem') !== mine;
      ev.push(`전체 새로 작성 선택 → ${replaced ? '새 문장으로 바뀜' : '그대로'}`);
      api.w.confirm = () => false;                     // 둘 다 [취소] → 변화 없음
      api.set('bp_problem', mine); api.call('autoGenerateBusinessPlan');
      const untouched = api.val('bp_problem') === mine;
      ev.push(`두 번 모두 취소 → ${untouched ? '변화 없음' : '바뀜'}`);
      if (!replaced || !untouched) verdict = 'FAIL';
      return { verdict, evidence: ev };
    }
  },
  {
    id: '1-10', name: '일괄 인쇄 영역·.doc 생성 내용',
    async run(api) {
      const ev = []; let verdict = 'PASS';
      api.demo(); api.render('smb', null);
      api.call('printAllReportsBatch');
      const area = api.doc.getElementById('active_report_render_area');
      const cards = area.querySelectorAll('.a4-page-card').length;
      ev.push(`일괄 인쇄 카드 ${cards}장 (빈 쪽 여부는 tools/pdf_check.py 의 PDF 쪽수로 확인)`);
      const doc = api.captureDoc(() => api.call('downloadSingleSheetDoc', 'official'));
      ev.push(`.doc 생성 ${doc ? doc.length + '자' : '실패'}, 직인 이미지 ${/<img[^>]+data:image/.test(doc || '') ? '포함' : '없음'}, 버튼 잔존 ${/<button/.test(doc || '') ? '있음' : '없음'}`);
      if (!doc || /<button/.test(doc)) verdict = 'FAIL';
      return { verdict, evidence: ev };
    }
  },
  {
    id: '1-11', name: '새로고침 후 입력 보존',
    async run(api) {
      api.demo(); api.set('corp_name', '새로고침시험상사');
      await new Promise(r => setTimeout(r, 900));   // 자동 저장 대기
      await api.reload();
      const kept = api.val('corp_name'), debts = api.w.appState.debtItems.length;
      const ok = kept === '새로고침시험상사' && debts === 3;
      return { verdict: ok ? 'PASS' : 'FAIL', evidence: [`새로고침 후 상호 "${kept}", 대출 ${debts}건 (기대: 새로고침시험상사, 3건)`] };
    }
  },
  {
    id: '2-1', name: '고객 저장·불러오기·파일 주고받기',
    async run(api) {
      const ev = []; let verdict = 'PASS';
      api.demo(); api.call('setBizTrack', 'sme'); api.set('corp_name', '갑상사'); api.set('sme_sales', '1,234');
      api.call('saveClient');
      api.call('newClient');
      const cleared = api.val('corp_name') === '' && api.w.appState.bizTrack === 'smb';
      ev.push('새 고객 → 입력 비움 ' + (cleared ? '예' : '아니오'));
      api.set('corp_name', '을상사'); api.set('smb_monthly_sales', '500'); api.call('saveClient');
      const sel = api.doc.getElementById('client_select');
      const opts = [...sel.options].filter(o => o.value).map(o => o.text.split(' · ')[0]);
      ev.push('저장 목록: ' + opts.join(', '));
      const idA = [...sel.options].find(o => o.text.startsWith('갑상사'))?.value;
      api.call('loadClient', idA);
      const backA = api.val('corp_name') === '갑상사' && api.val('sme_sales') === '1,234' && api.w.appState.bizTrack === 'sme';
      ev.push('갑상사 다시 불러오기 → 상호·매출·규모 ' + (backA ? '일치' : '불일치'));
      const { text } = api.call('clientExportText');
      api.call('newClient');
      api.call('importClientText', text);
      const backFile = api.val('corp_name') === '갑상사' && api.val('sme_sales') === '1,234';
      ev.push('파일로 내보낸 뒤 가져오기 → ' + (backFile ? '일치' : '불일치'));
      let bad = false; try { api.call('importClientText', '{"hello":1}'); } catch (e) { bad = true; }
      ev.push('다른 파일 가져오기 → ' + (bad ? '거부됨' : '받아들임'));
      if (!cleared || opts.length !== 2 || !backA || !backFile || !bad) verdict = 'FAIL';
      return { verdict, evidence: ev };
    }
  }
];
