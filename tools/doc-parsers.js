// 서류 글자 → 앱 칸 해석기 (부채 서류 2종). 브라우저(pdf.js 글자층)와 node 시험에서 같이 쓴다.
// 입력: 쪽 순서대로 늘어놓은 글자 줄 배열(쪽 경계는 '<<PAGE>>'). 출력: 앱 대출표에 넣을 후보 행.
// 규칙: 금액은 앱 단위(만원)로 바꾼다 · 금리는 이 서류들에 없으므로 비워 두고 '확인 필요' 표시
//       · 주민등록번호·성명 같은 개인 식별값은 결과에 담지 않는다.
(function (root) {
  const norm = s => String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim();
  const num = s => { const t = norm(s).replace(/[,\s]/g, ''); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
  const isNum = s => num(s) !== null;
  // 단위 → 만원 배율
  const UNIT_TO_MAN = { '원': 1 / 10000, '천원': 1 / 10, '만원': 1, '백만원': 100, '억원': 10000 };
  const toMan = (v, unit) => v === null ? null : Math.round(v * UNIT_TO_MAN[unit] * 10) / 10;

  // 기관 이름 정리: 약칭 → 정식 이름 (앞에서부터 먼저 맞는 것)
  const INSTITUTIONS = [
    [/중진공|중소벤처기업진흥공단|중소기업진흥공단/, '중소벤처기업진흥공단'],
    [/소진공|소상공인시장진흥공단/, '소상공인시장진흥공단'],
    [/IBK|기업은행/, 'IBK기업은행'],
    [/KB|국민/, 'KB국민은행'],
    [/신한/, '신한은행'], [/우리/, '우리은행'], [/하나/, '하나은행'],
    [/농협|NH/, 'NH농협은행'], [/수협/, '수협은행'], [/산업은행|KDB/, 'KDB산업은행'],
    [/새마을/, '새마을금고'], [/신협/, '신협'], [/저축은행/, '저축은행'],
    [/기보|기술보증/, '기술보증기금'], [/신보|신용보증기금/, '신용보증기금'], [/지역신보|신용보증재단/, '지역신용보증재단']
  ];
  const GUARANTEE = [[/\((기보|기술보증기금)\)/, '기술보증기금'], [/\((신보|신용보증기금)\)/, '신용보증기금'], [/\((지역신보|재단)\)/, '지역신용보증재단']];
  const LOAN_KIND = [[/시설/, '시설자금'], [/중소기업자금/, '중소기업자금'], [/운전|운영/, '운전자금'], [/창업/, '창업자금'], [/정책|중진공|소진공/, '정책자금'], [/구매/, '구매자금'], [/할부/, '할부'], [/신용/, '신용대출'], [/담보/, '담보대출']];
  const pick = (table, s) => { for (const [re, v] of table) if (re.test(s)) return v; return ''; };

  // 쪽마다 반복되는 머리·꼬리 줄 제거
  const FOOTER = /^(발급일시|발급번호|페이지)\s*:|^\(단위\s*:|^종합신용정보집중기관|^※/;

  // ───────── 1) 거래처원장(잔액) — 회계 프로그램 출력, 장기·단기차입금 계정 ─────────
  function parseLedger(lines) {
    const L = lines.map(norm).filter(l => l && l !== '<<PAGE>>');
    const text = L.join('\n');
    if (!/거래처원장/.test(text.replace(/\s+/g, '')) || !/잔액/.test(text)) return null;
    const per = text.match(/(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(\d{4})\.(\d{2})\.(\d{2})/);
    const acc = text.match(/계정과목\s*:\s*\[(\d+)\]\s*(\S+)/);
    const out = { kind: 'debt_ledger', title: '거래처원장(잔액)', unit: '원', asOf: per ? `${per[4]}-${per[5]}-${per[6]}` : '', account: acc ? acc[2] : '', rows: [], total: null };
    // 거래처 코드 줄: 쉼표 없는 숫자 + 다음 줄이 거래처명(숫자 아님)
    const isCode = k => /^\d{4,8}$/.test(L[k] || '') && L[k + 1] && !isNum(L[k + 1]);
    for (let i = 0; i < L.length; i++) {
      if (/^\[\s*합/.test(L[i])) { // 합계: 뒤따르는 숫자 중 마지막이 잔액 합계
        const nums = []; for (let j = i + 1; j < L.length && nums.length < 4; j++) { if (isNum(L[j])) nums.push(num(L[j])); else if (!/계\]$/.test(L[j])) break; }
        if (nums.length) out.total = { balanceWon: nums[nums.length - 1], balanceMan: toMan(nums[nums.length - 1], '원') };
        break;
      }
      if (!isCode(i)) continue;
      const name = L[i + 1].replace(/^_\s*/, '');
      const nums = [];
      let j = i + 2;
      while (j < L.length && isNum(L[j]) && !isCode(j)) { nums.push(num(L[j])); j++; }
      if (!nums.length) continue;
      const eok = name.match(/(\d+(?:\.\d+)?)\s*억/);
      const start = name.match(/_(\d{4})\.(\d{1,2})/) || name.match(/(\d{4})\.(\d{1,2})$/);
      const contract = name.match(/\(?(\d{1,4}-\d{3,})\)?/) || name.match(/\((\d{6,})\)/);
      const guarantor = pick(GUARANTEE, name);
      out.rows.push({
        institution: pick(INSTITUTIONS, name.replace(/\((기보|신보|지역신보)\)/g, '')) || '',
        type: pick(LOAN_KIND, name) || '',
        balanceMan: toMan(nums[nums.length - 1], '원'),
        openingMan: nums.length >= 2 ? toMan(nums[0], '원') : null,
        principalMan: eok ? Number(eok[1]) * 10000 : null,
        startYm: start ? `${start[1]}-${String(start[2]).padStart(2, '0')}` : '',
        contractNo: contract ? contract[1] : '',
        guarantor,
        rate: null,
        needs: [...(pick(INSTITUTIONS, name) ? [] : ['기관']), '금리'],
        source: name
      });
      i = j - 1;
    }
    return out;
  }

  // ───────── 2) 채권자변동정보 조회서 — 한국신용정보원, 개인(대표자) 대출 ─────────
  function parseCreditorChange(lines) {
    const raw = lines.map(norm);
    const text = raw.join('\n');
    if (!/채권자변동정보\s*조회서/.test(text)) return null;
    const um = text.match(/\(단위\s*:\s*(천원|원|만원|백만원|억원)\)/);
    const unit = um ? um[1] : '천원';
    const q = text.match(/조회일자\s*\n?\s*'?(\d{2})\.(\d{2})\.(\d{2})/);
    const out = { kind: 'creditor_change', title: '채권자변동정보 조회서', unit, asOf: q ? `20${q[1]}-${q[2]}-${q[3]}` : '', loans: [], delinquencies: [] };

    // 쪽 머리(조회서 제목 ~ 표 머리 끝)·꼬리·안내문을 걷어내고 데이터 줄만 남긴다. 성명·주민번호는 여기서 버린다.
    const data = [];
    let section = 0, inHead = false;
    for (let i = 0; i < raw.length; i++) {
      const l = raw[i];
      if (!l || l === '<<PAGE>>') continue;
      if (/^채권자변동정보\s*조회서$/.test(l)) { inHead = true; continue; }
      if (/연체채권의\s*채권자\s*변동\s*현황/.test(l)) { section = 2; inHead = true; continue; }
      if (/채무현황|^\d\.\s*채무\s*현황/.test(l) && section < 2) { section = 1; }
      if (inHead) {
        if ((section < 2 && l === '금액') || (section === 2 && /완성여부$/.test(l))) { inHead = false; if (!section) section = 1; }
        continue;
      }
      if (FOOTER.test(l) || /^\d\.\s/.test(l)) continue;
      data.push({ section, l });
    }

    // 1. 채무 현황: 순번 · 구분 · 대출종류(코드) · 기관명[지점] · 발생일자 · 금액
    const s1 = data.filter(d => d.section === 1).map(d => d.l);
    for (let i = 0; i + 5 < s1.length; i++) {
      if (!/^\d+$/.test(s1[i]) || !/정보$/.test(s1[i + 1] || '')) continue;
      const kind = s1[i + 2].match(/^(.+?)\s*\((\d{3,4})\)$/);
      const date = (s1[i + 4] || '').match(/^(\d{4})\.(\d{2})\.(\d{2})\.?$/);
      if (!kind || !date || !isNum(s1[i + 5])) continue;
      const inst = s1[i + 3].replace(/\[[^\]]*\]$/, '').trim();
      out.loans.push({
        category: s1[i + 1],
        institution: inst,
        type: kind[1],
        typeCode: kind[2],
        openedAt: `${date[1]}-${date[2]}-${date[3]}`,
        amountMan: toMan(num(s1[i + 5]), unit),
        amountBasis: '발생금액',   // 서류의 금액은 대출이 생긴 때의 금액 — 지금 잔액은 따로 확인
        rate: null,
        needs: ['잔액', '금리']
      });
      i += 5;
    }

    // 2. 연체채권의 채권자 변동 현황: 기관 · (전화) · 채권구분 · 발생일자 · 원금 · 이자 · 기한이익상실 · 추심위탁 · 채무조정 · 양도 · 양수(양도금액) · 해제사유(해제일자) · 소멸시효
    const s2 = data.filter(d => d.section === 2).map(d => d.l);
    const shortDate = s => { const m = String(s).match(/'?(\d{2})\.(\d{2})\.(\d{2})/); return m ? `20${m[1]}-${m[2]}-${m[3]}` : ''; };
    for (let i = 0; i < s2.length; i++) {
      if (!/^\d+$/.test(s2[i]) || !s2[i + 1] || isNum(s2[i + 1])) continue;
      let j = i + 1;
      const inst = s2[j++];
      if (/^\(\s*[\d-]+\s*\)$/.test(s2[j] || '')) j++;          // 기관 대표전화
      const kind = s2[j++];
      const occurred = shortDate(s2[j++]);
      if (!occurred || !isNum(s2[j]) || !isNum(s2[j + 1])) continue;
      const principal = num(s2[j++]), interest = num(s2[j++]);
      const accel = s2[j++], collect = s2[j++], adjust = s2[j++], transfer = s2[j++];
      let assignee = s2[j++];
      if (/^\([\d,]+\)$/.test(s2[j] || '')) assignee += ' ' + s2[j++];
      let release = s2[j++] || '';
      let releasedAt = '';
      if (/^\('?\d{2}\.\d{2}\.\d{2}\.?\)$/.test(s2[j] || '')) releasedAt = shortDate(s2[j++]);
      const prescription = s2[j++] || '';
      out.delinquencies.push({
        institution: inst, type: kind, occurredAt: occurred,
        principalMan: toMan(principal, unit), interestMan: toMan(interest, unit),
        accelerated: accel !== '-', collection: collect, adjustment: adjust === '-' ? '' : adjust,
        transferred: !/미양도/.test(transfer), assignee: assignee === '-' ? '' : assignee,
        released: release !== '-' && release !== '', releaseReason: release === '-' ? '' : release, releasedAt,
        prescription: prescription === '-' ? '' : prescription
      });
      i = j - 1;
    }
    out.summary = {
      loans: out.loans.length,
      loansTotalMan: Math.round(out.loans.reduce((a, r) => a + (r.amountMan || 0), 0) * 10) / 10,
      delinquencies: out.delinquencies.length,
      unresolved: out.delinquencies.filter(d => !d.released).length
    };
    return out;
  }

  // 앱 대출표(debtItems) 형태로: 기관 · 과목 · 잔액(만원) · 금리 · 월이자 · 상환방법
  function toDebtItems(parsed) {
    if (!parsed) return [];
    if (parsed.kind === 'debt_ledger') return parsed.rows.map(r => ({
      institution: r.institution || r.source, type: [r.type, r.guarantor && `${r.guarantor} 보증`].filter(Boolean).join(' · '),
      balance: r.balanceMan, rate: '', monthlyInterest: '', payback: r.startYm ? `${r.startYm} 실행` : '', _needs: r.needs, _from: '거래처원장'
    }));
    if (parsed.kind === 'creditor_change') return parsed.loans.map(r => ({
      institution: r.institution, type: `대표자 개인 · ${r.type}`, balance: r.amountMan, rate: '', monthlyInterest: '',
      payback: `${r.openedAt} 발생`, _needs: r.needs, _from: '채권자변동정보(발생금액)'
    }));
    return [];
  }

  // pdf.js 글자 조각(items: {s,x,y,w,h}) → 행[칸...]. 홈택스 PDF는 글자 한 자씩 조각이 나오므로
  // 같은 줄(높이 차 < 글자 높이의 40%)끼리 모아 x 순으로 잇고, 간격이 글자 높이보다 크면 칸을 나눈다.
  function itemsToRows(items) {
    const its = items.filter(i => i.s && i.s.trim()).map(i => ({ ...i, h: i.h || 10 })).sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    for (const it of its) {
      const r = rows.find(r => Math.abs(r.y - it.y) < Math.max(2, it.h * 0.4));
      if (r) r.items.push(it); else rows.push({ y: it.y, items: [it] });
    }
    rows.sort((a, b) => b.y - a.y);
    return rows.map(r => {
      const xs = r.items.sort((a, b) => a.x - b.x);
      const cells = [];
      let cur = null, end = 0;
      for (const it of xs) {
        const gap = it.x - end;
        if (!cur || gap > it.h * 1.1) { cur = { t: it.s, x: it.x }; cells.push(cur); }
        else cur.t += (gap > it.h * 0.25 ? ' ' : '') + it.s;
        end = it.x + (it.w || it.s.length * it.h * 0.9);
      }
      return cells.map(c => norm(c.t)).filter(Boolean);
    });
  }
  // 쪽 배열(각 쪽 items) → 칸 줄 배열('<<PAGE>>' 경계) — 부채 해석기 입력 형식
  function pagesToCells(pages) {
    const out = [];
    pages.forEach(items => { out.push('<<PAGE>>'); itemsToRows(items).forEach(r => r.forEach(c => out.push(c))); });
    return out;
  }
  function pagesToRows(pages) { return pages.map(items => itemsToRows(items)); }

  // ───────── 홈택스·공단 서류: 칸 이름(띄어쓰기 제거) 옆 값 읽기 ─────────
  const despace = s => String(s || '').replace(/\s+/g, '');
  // 행[칸...]에서 앞쪽 칸들을 이어 붙인 것이 label 과 맞으면 나머지 칸을 값으로
  function labelValue(rows, re) {
    for (const r of rows) for (let k = 1; k < r.length; k++) {
      if (re.test(despace(r.slice(0, k).join('')))) { const v = (r[k] || '').trim(); if (v) return v; }
    }
    return '';
  }
  const ymd = s => { const m = String(s).match(/(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})/); return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : ''; };
  const bizNoOf = s => { const m = String(s).match(/(\d{3})-?(\d{2})-?(\d{5})/); return m ? m[1] + '-' + m[2] + '-' + m[3] : ''; };
  // 사업자번호 가운데 두 자리 81~88 이면 법인
  const isCorpNo = b => { const m = /^\d{3}-(\d{2})-/.exec(b || ''); return !!m && +m[1] >= 81 && +m[1] <= 88; };
  // 법인등록번호 검증식: 앞 12자리에 1,2,1,2… 를 곱해 더한 값 → (10 - 합 % 10) % 10 = 끝자리
  function corpRegValid(s) {
    const d = String(s || '').replace(/\D/g, '');
    if (d.length !== 13) return false;
    let sum = 0; for (let i = 0; i < 12; i++) sum += +d[i] * (i % 2 ? 2 : 1);
    return (10 - sum % 10) % 10 === +d[12];
  }
  // '법인등록번호 : 110111-1234567' · '등록번호 110111-1234567'(등기부) · '주민(법인)등록번호'(법인 사업자일 때만). 검증식이 맞는 번호만
  const CORP_REG_RE = /(법\s*인\s*등\s*록\s*번\s*호|주\s*민\s*\(\s*법\s*인\s*\)\s*등\s*록\s*번\s*호|등\s*록\s*번\s*호)\s*[:：]?\s*(\d{6})\s*[-–—~]?\s*(\d{7})(?!\d)/g;
  function corpRegOf(text) {
    const t = String(text || ''), corpBiz = /\d{3}\s*-?\s*8[1-8]\s*-?\s*\d{5}/.test(t);
    for (const m of t.matchAll(CORP_REG_RE)) {
      if (/주\s*민/.test(m[1]) && !corpBiz) continue;   // 개인 사업자의 '주민(법인)' 칸은 주민번호
      if (corpRegValid(m[2] + m[3])) return m[2] + '-' + m[3];
    }
    return '';
  }
  // 국세청 사업자등록번호 검증식(가중치 1,3,7,1,3,7,1,3,5)
  function bizNoValid(b) {
    const d = String(b || '').replace(/\D/g, '').split('').map(Number);
    if (d.length !== 10) return false;
    const w = [1, 3, 7, 1, 3, 7, 1, 3, 5];
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += d[i] * w[i];
    sum += Math.floor(d[8] * 5 / 10);
    return (10 - (sum % 10)) % 10 === d[9];
  }
  // 앱의 '사업자구분 · 과세유형' 값: 개인 · 일반과세 / 개인 · 간이과세 / 개인 · 면세 / 법인 · 일반과세 / 법인 · 면세
  function formValue(corp, taxText) {
    const t = String(taxText || '');
    if (corp) return /면세/.test(t) ? '법인 · 면세' : '법인 · 일반과세';
    if (/간이/.test(t)) return '개인 · 간이과세';
    if (/면세/.test(t)) return '개인 · 면세';
    return '개인 · 일반과세';
  }
  const signed = s => { const t = norm(s).replace(/[,\s]/g, ''); if (/^\(.*\)$/.test(t) || /^△/.test(t)) return -Number(t.replace(/[()△]/g, '')); return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null; };
  const won2baek = v => v === null ? null : Math.round(v / 1e5) / 10;   // 원 → 백만원(소수 1자리)
  const won2man = v => v === null ? null : Math.round(v / 1e4);         // 원 → 만원

  const DOC_TYPES = [
    ['bizcert', '사업자등록증명', t => /사업자등록증명/.test(t)],
    ['fs', '표준재무제표증명', t => /표준재무제표증명|표준재무상태표|표준손익계산서/.test(t)],
    ['vat', '부가가치세 과세표준증명', t => /과세표준증명/.test(t)],
    ['ins', '4대보험 사업장 가입자명부', t => /사업장가입자명부/.test(t)],
    ['share', '주주명부', t => /주주명부/.test(t)],
    ['ledger', '거래처원장(차입금)', t => /거래처원장/.test(t)],
    ['creditor', '채권자변동정보 조회서', t => /채권자변동/.test(t)],
    ['ip', '지식재산권 등록증', t => /특허증|실용신안등록증|디자인등록증|상표등록증/.test(t) || (/출원번호/.test(t) && /[등동]록일/.test(t)) || /CERTIFICATEOF(PATENT|UTILITY|DESIGN|TRADEMARK)/i.test(t) || (/(Patent|Registration)Number/i.test(t) && /ApplicationNumber/i.test(t))],
    ['corpreg', '법인등기부등본', t => /등기사항|법인등기|등기부/.test(t)],
    ['lease', '임대차계약서', t => /임대차/.test(t)],
    ['idcard', '신분증', t => /주민등록증|운전면허증|신분증/.test(t)],
    ['bizreg', '사업자등록증', t => /사업자등록증/.test(t)]
  ];
  function classify(rows, fileName) {
    const t = despace(rows.flat().join(''));
    for (const [k, title, test] of DOC_TYPES) if (test(t)) return { kind: k, title };
    const f = despace(fileName || '');
    for (const [k, title, test] of DOC_TYPES) if (test(f)) return { kind: k, title, byName: true };
    return { kind: 'unknown', title: '알 수 없는 서류' };
  }

  function parseBizCert(rows) {
    const f = {}, meta = {};
    const name = labelValue(rows, /^상호/); if (name) f.corp_name = name;
    const tax0 = despace(rows.flat().join('')).match(/\((일반과세자|간이과세자|면세사업자|법인사업자)\)/);
    const no = bizNoOf(labelValue(rows, /^사업자등록번호$/));
    if (no) {
      f.corp_biz_no = no;
      if (!bizNoValid(no)) meta.corp_biz_no = { conf: 0.3, valid: false, note: '번호 검증식이 맞지 않아요 — 원본 확인' };
      f.corp_form = formValue(isCorpNo(no) || (tax0 && tax0[1] === '법인사업자'), tax0 && tax0[1]);
      meta.corp_form = { conf: tax0 ? 0.9 : 0.6 };
    }
    const ceo = labelValue(rows, /^대표자성명/); if (ceo) f.corp_ceo = ceo;
    const addr = labelValue(rows, /^사업장소재지$/); if (addr) f.corp_address = addr;
    const open = ymd(labelValue(rows, /^개업일$/)); if (open) f.corp_est_date = open;
    // 업태·종목은 값 줄이 이름 줄 바로 위에 있다
    const idx = re => rows.findIndex(r => re.test(despace(r.join(''))));
    const iu = idx(/^업태$/), ij = idx(/^종목$/);
    const up = iu > 0 ? rows[iu - 1].join(' ') : '', jm = ij > 0 ? rows[ij - 1].join(' ') : '';
    if (up || jm) { f.corp_biz_type = [jm, up ? '(' + up + ')' : ''].filter(Boolean).join(' '); meta.corp_biz_type = { conf: 0.7 }; }
    const reg = corpRegOf(rows.map(r => r.join(' ')).join('\n')); if (reg) { f.corp_reg_no = reg; meta.corp_reg_no = { conf: 0.9 }; }
    return { fields: f, meta, notes: tax0 ? [tax0[1]] : [] };
  }

  // 재무제표: "칸이름 | 코드 | 금액" 반복. 두 단 배치라 한 칸에 '금액 다음칸이름'이 붙어 오면 나눈다
  function fsTokens(rows) {
    return rows.flat().flatMap(c => c.split(/\s+(?=(?:[IVX]+|\d{1,2}|\(\d+\)|[가-하])\.)|(?<=\d)\s+(?=[^\d\s,(\-△])/)).map(norm).filter(Boolean);
  }
  // 과목 이름 앞 번호(Ⅰ. · (1) · 1. · 가.)와 뒤 계산식 괄호는 무시하고 이름이 '맞게 시작'할 때만
  const fsLabel = name => new RegExp('^(?:[IVXⅠ-Ⅻ]+\\.|\\(\\d+\\)|\\d+\\.|[가-하]\\.)?(?:' + name + ')(?:\\(.*\\))?$');
  function fsAmount(tokens, re) {
    for (let i = 0; i < tokens.length; i++) {
      if (!re.test(despace(tokens[i]))) continue;
      if (/^\d{2,3}$/.test(tokens[i + 1] || '')) { const v = signed(tokens[i + 2] || ''); return v === null ? 0 : v; }
    }
    return null;
  }
  function parseFS(rows) {
    const tk = fsTokens(rows);
    const all = despace(rows.flat().join(' '));
    let year = (all.match(/(\d{4})년귀속/) || [])[1];
    if (!year) { const m = all.match(/\d{4}\.\d{2}\.\d{2}~(\d{4})\.\d{2}\.\d{2}/) || all.match(/(\d{4})년\d{2}월\d{2}일까지/); year = m && m[1]; }
    let op = fsAmount(tk, /^(?:[IVX]+\.)?영업(?:손익|이익)/);
    if (op === null) { const loss = fsAmount(tk, /^(?:[IVX]+\.)?영업손실/); if (loss !== null) op = -Math.abs(loss); }
    const v = {
      sales: fsAmount(tk, /^(?:[IVX]+\.)?매출액$/),
      profit: op,
      debt: fsAmount(tk, /^부채총계/),
      equity: fsAmount(tk, /^자본총계/),
      assets: fsAmount(tk, /^자산총계/),
      interest: fsAmount(tk, /^\d*\.?이자비용$/),
      loanToCeo: fsAmount(tk, /^(?:\d+\.|[가-하]\.)?(?:주임종단기채권|가지급금)$/),
      // 주요 재무지표(재무제표 분석 엑셀과 같은 항목)
      net: fsAmount(tk, fsLabel('당기순(?:이익|손익)')),
      capital: fsAmount(tk, fsLabel('자본금')),
      stLoan: fsAmount(tk, fsLabel('단기차입금')),
      ltLoan: fsAmount(tk, fsLabel('장기차입금')),
      quick: fsAmount(tk, fsLabel('당좌자산')),
      curLiab: fsAmount(tk, fsLabel('유동부채')),
      intInc: fsAmount(tk, fsLabel('이자수익')),
      ar: fsAmount(tk, fsLabel('매출채권|외상매출금')),
      inv: fsAmount(tk, fsLabel('재고자산')),
      ap: fsAmount(tk, fsLabel('매입채무|외상매입금')),
      unpaid: fsAmount(tk, fsLabel('미지급금'))
    };
    if (v.net === null) { const loss = fsAmount(tk, fsLabel('당기순손실')); if (loss !== null) v.net = -Math.abs(loss); }
    const f = {};
    const name = labelValue(rows, /^(?:상호|법인명)$/); if (name) f.corp_name = name;
    const no = bizNoOf(labelValue(rows, /^사업자등록번호$/)); if (no) f.corp_biz_no = no;
    const balanced = v.assets !== null && v.debt !== null && v.equity !== null && Math.abs(v.assets - (v.debt + v.equity)) <= Math.abs(v.assets) * 0.01;
    const unit = (all.match(/단위[:：]?\(?(원|천원|백만원)/) || [])[1] || '원';
    const mul = unit === '천원' ? 1000 : unit === '백만원' ? 1e6 : 1;
    if (mul !== 1) Object.keys(v).forEach(k => { if (v[k] !== null) v[k] *= mul; });
    const notes = [year ? year + '년 결산' : '결산 연도를 찾지 못함'];
    if (!balanced) notes.push('자산 ≠ 부채+자본 — 확인 필요');
    return { year: year ? Number(year) : null, wonValues: v, balanced, fields: f, notes };
  }

  // 재무제표 전체 과목: 서류에 찍힌 모든 '과목 | 코드 | 금액'을 표별(재무상태표·손익계산서·원가명세서…)로 모은다.
  // 두 단 배치라 글 순서가 과목 순서와 다르므로 표 안에서는 코드 순으로 다시 세운다. 금액은 원 단위
  const FS_SECTIONS = [
    ['bs', '재무상태표', /재무상태표|대차대조표/],
    ['is', '손익계산서', /손익계산서/],
    ['cost', '원가명세서', /원가명세서/],
    ['re', '이익잉여금처분계산서', /이익잉여금처분계산서|결손금처리계산서/]
  ];
  const ROMAN = ['', 'Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ', 'Ⅵ', 'Ⅶ', 'Ⅷ', 'Ⅸ', 'Ⅹ', 'Ⅺ', 'Ⅻ'];
  const romanNum = s => { const v = { I: 1, V: 5, X: 10 }; let n = 0; for (let i = 0; i < s.length; i++) { const a = v[s[i]], b = v[s[i + 1]] || 0; n += a < b ? -a : a; } return n; };
  // 과목 이름 → 단계(1 로마자 · 2 (1) · 3 1. · 4 가. · 0 총계)와 화면 이름
  function fsItemLabel(raw) {
    let s = despace(raw).replace(/\((?:[IVX]+|\d+)(?:[+\-±][IVX\d()]+)+\)$/, '');   // 끝의 계산식 괄호 (I+II) 제거
    let level = 3, label = s;
    let m;
    if ((m = s.match(/^([IVX]+)\.(.+)$/))) { level = 1; label = (ROMAN[romanNum(m[1])] || m[1]) + '. ' + m[2]; }
    else if ((m = s.match(/^(\(\d+\))(.+)$/))) { level = 2; label = m[1] + ' ' + m[2]; }
    else if ((m = s.match(/^(\d+)\.(.+)$/))) { level = 3; label = m[1] + '. ' + m[2]; }
    else if ((m = s.match(/^([가-하])\.(.+)$/))) { level = 4; label = m[1] + '. ' + m[2]; }
    else if (/총계$|합계$/.test(s)) level = 0;
    const name = (m ? m[2] : s);
    return { level, label, name };
  }
  function parseFSFull(rows) {
    const tk = fsTokens(rows);
    const all = despace(rows.flat().join(' '));
    const unit = (all.match(/단위[:：]?\(?(원|천원|백만원)/) || [])[1] || '원';
    const mul = unit === '천원' ? 1000 : unit === '백만원' ? 1e6 : 1;
    const secs = {};
    let cur = 'bs';
    for (let i = 0; i < tk.length; i++) {
      const t = despace(tk[i]);
      const head = FS_SECTIONS.find(([, , re]) => re.test(t));
      if (head && !/^\d{2,3}$/.test(tk[i + 1] || '')) { cur = head[0]; continue; }
      if (!/[가-힣]/.test(t) || !/^\d{2,3}$/.test(tk[i + 1] || '')) continue;
      const amt = signed(tk[i + 2] || '');
      const it = fsItemLabel(t);
      if (!it.name || /^(과목|코드|금액|계정과목)$/.test(it.name)) continue;
      const sec = secs[cur] || (secs[cur] = []);
      sec.push({ code: Number(tk[i + 1]), label: it.label, name: it.name, level: it.level, won: amt === null ? null : amt * mul, seq: sec.length });
      i += amt === null ? 1 : 2;
    }
    const sections = FS_SECTIONS.filter(([k]) => secs[k] && secs[k].length).map(([key, title]) => ({
      key, title, rows: secs[key].sort((a, b) => a.code - b.code || a.seq - b.seq).map(({ code, label, name, level, won }) => ({ code, label, name, level, won }))
    }));
    return { unit, sections };
  }

  // 부가세 과세표준증명: 기간별(부터·까지·계) → 최근 12개월 월평균 매출(만원)
  function parseVAT(rows) {
    const periods = [];
    rows.forEach(r => {
      const d = r.filter(c => /^\d{4}\/\d{2}\/\d{2}$/.test(c));
      if (d.length >= 2) { const i = r.indexOf(d[1]); const total = signed(r[i + 1] || ''); if (total !== null) periods.push({ from: d[0], to: d[1], total }); }
    });
    // 같은 기간이 겹치면(예정 ⊂ 확정) 긴 기간 하나만 남긴다
    const key = d => d.replace(/\//g, '');
    for (let i = periods.length - 1; i >= 0; i--) {
      const p = periods[i];
      if (periods.some((q, j) => j !== i && key(q.from) <= key(p.from) && key(q.to) >= key(p.to) && (key(q.from) !== key(p.from) || key(q.to) !== key(p.to) || j < i))) periods.splice(i, 1);
    }
    periods.sort((a, b) => (a.to < b.to ? 1 : -1));
    const months = p => { const a = p.from.split('/').map(Number), b = p.to.split('/').map(Number); return (b[0] - a[0]) * 12 + (b[1] - a[1]) + 1; };
    let m = 0, sum = 0;
    for (const p of periods) { if (m >= 12) break; m += months(p); sum += p.total; }
    const yearTotals = {};
    periods.forEach(p => { const y = +p.from.slice(0, 4); yearTotals[y] = (yearTotals[y] || 0) + p.total; });
    // 반기별(원): 'YYYY-1' 상반기 · 'YYYY-2' 하반기. 1년을 한 번에 신고한 기간(1~12월)은 'YYYY-0'(반기 구분 없음)
    const halfTotals = {};
    periods.forEach(p => {
      const y = +p.from.slice(0, 4), a = +p.from.slice(5, 7), b = +p.to.slice(5, 7);
      const h = (b <= 6) ? 1 : (a >= 7) ? 2 : 0;
      halfTotals[y + '-' + h] = (halfTotals[y + '-' + h] || 0) + p.total;
    });
    const f = {};
    const meta = {};
    if (m) { f.smb_monthly_sales = won2man(sum / m); meta.smb_monthly_sales = { conf: m >= 12 ? 0.9 : 0.6, src: Math.round(sum / m), note: m >= 12 ? '' : '12개월이 안 되는 기간 평균' }; }
    const no = bizNoOf(labelValue(rows, /사업자등록번호$/) || ''); if (no) f.corp_biz_no = no;
    const ceo = labelValue(rows, /^성명\(대표자\)$/); if (ceo) f.corp_ceo = ceo.split(/\s*주민/)[0].trim();
    return { fields: f, meta, yearTotals, halfTotals, notes: m ? ['최근 ' + m + '개월 평균'] : ['과세기간 행을 찾지 못함'] };
  }

  // 4대보험 가입자명부: 인원수만 센다(이름·주민번호는 담지 않음). 고용보험 취득일이 있는 사람 = 상시근로자 기준
  function parseIns(rows) {
    let total = 0, emp = 0;
    rows.forEach(r => {
      if (!/^\d+$/.test(r[0] || '') || !/^\d{6}-\d\*+/.test(r[1] || '')) return;
      total++;
      if (/\d{4}\.\d{2}\.\d{2}/.test(r[6] || '')) emp++;
    });
    return { fields: total ? { sme_employees: String(emp || total) } : {}, notes: ['가입자 ' + total + '명 · 고용보험 ' + emp + '명'] };
  }

  // 주주명부: 대표이사 지분율만
  function parseShare(rows) {
    for (const r of rows) {
      const pct = r.find(c => /^\d{1,3}(\.\d+)?%$/.test(c));
      if (pct && r.some(c => /대표/.test(c))) return { fields: { corp_ceo_share: '대표이사 ' + pct }, notes: [] };
    }
    return { fields: {}, notes: ['대표이사 지분을 찾지 못함'] };
  }

  // ───────── 사진·스캔(글자 인식) 서류 ─────────
  // 개인정보 가리기: 주민·외국인등록번호 뒷자리는 읽자마자 지운다(앞 6자리가 날짜 꼴일 때만 — 금액 오인 방지)
  function redact(text) {
    const dateLike = s => { const m = +s.slice(2, 4), d = +s.slice(4, 6); return m >= 1 && m <= 12 && d >= 1 && d <= 31; };
    const keep = [];
    const src = String(text || '').replace(CORP_REG_RE, (all, label, a, b) => {
      const corpBiz = /\d{3}\s*-?\s*8[1-8]\s*-?\s*\d{5}/.test(String(text));
      if ((/주\s*민/.test(label) && !corpBiz) || !corpRegValid(a + b)) return all;
      keep.push(a + '-' + b); return label + ' \u0000' + (keep.length - 1) + '\u0000';
    });
    return src
      // 뒷자리는 OCR 이 ) | l 같은 잡음을 섞어 읽기도 하므로 그런 글자까지 함께 지운다
      .replace(/(^|[^\d])(\d{6})\s*[-–—~_.]\s*([1-8][\d)(|lIoO*]{4,9})/g, (all, pre, front) => dateLike(front) ? pre + front + '-*******' : all)
      .replace(/(^|[^\d])(\d{6})\s+([1-8])\s?(\d{3})\s?(\d{3})(?!\d)/g, (all, pre, front) => dateLike(front) ? pre + front + '-*******' : all)
      .replace(/\b(\d{2}-\d{2}-\d{6}-\d{2})\b/g, '**-**-******-**')   // 운전면허번호
      .replace(/\u0000(\d+)\u0000/g, (all, i) => keep[+i]);
  }
  // 줄 → 칸: 공백 2칸 이상이나 | 로 나눔
  const textRows = text => String(text || '').split(/\r?\n/).map(l => l.split(/\s{2,}|\|/).map(norm).filter(Boolean)).filter(r => r.length);

  // 한글 금액(삼천만원정, 일백이십만원) → 원
  function koreanAmount(s) {
    const D = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 }, U = { 십: 10, 백: 100, 천: 1000 }, B = { 만: 1e4, 억: 1e8 };
    let total = 0, block = 0, num = 0, hit = false;
    for (const ch of String(s).replace(/[^일이삼사오육칠팔구십백천만억]/g, '')) {
      hit = true;
      if (D[ch]) num = D[ch];
      else if (U[ch]) { block += (num || 1) * U[ch]; num = 0; }
      else if (B[ch]) { total += (block + num || 1) * B[ch]; block = 0; num = 0; }
    }
    return hit ? total + block + num : null;
  }
  // 계약서 금액 한 줄: 괄호 안 숫자 우선(₩ 기호는 OCR 에서 ¥ % # \ 로 바뀜), 없으면 한글 금액
  function amountOfLine(l) {
    const m = l.match(/\(\s*[^\d\s(]{0,2}\s*([\d][\d,.\s]{3,})\s*\)/);
    if (m) { const v = Number(m[1].replace(/[^\d]/g, '')); if (v) return v; }
    const k = l.match(/([일이삼사오육칠팔구십백천만억]{2,})\s*원/);
    return k ? koreanAmount(k[1]) : null;
  }

  // 임대차계약서: 보증금·월세·전용면적·용도(주택이면 대표자 주거 형태, 사업장이면 임차료)
  function parseLease(text) {
    const lines = String(text).split(/\r?\n/).map(norm).filter(Boolean);
    const amt = lines.filter(l => /원\s*정|원정|\(\s*[^\d\s]{0,2}\s*\d[\d,]{5,}\s*\)/.test(l)).map(l => ({ l, v: amountOfLine(l) })).filter(x => x.v);
    const monthlyLine = amt.find(x => /후불|선불|매월|월\s*세|차\s*임/.test(x.l));
    const deposit = amt.find(x => x !== monthlyLine);
    const others = amt.filter(x => x !== monthlyLine && x !== deposit).map(x => x.v);
    // 계약금 + 잔금(+중도금) = 보증금 이면 높은 정확도
    const sumOk = deposit && others.length >= 2 && others.reduce((a, b) => a + b, 0) === deposit.v;
    const all = despace(lines.join(''));
    const area = (lines.join(' ').match(/전용\s*면적[^\d]{0,12}(\d{1,4}(?:\.\d{1,4})?)/) || lines.join(' ').match(/(\d{1,4}\.\d{2,4})\s*(?:㎡|m2|m²)/) || [])[1];
    const residential = /주택|아파트|공동주택|다세대|오피스텔.*주거|원룸/.test(all);
    const f = {}, meta = {}, info = [];
    if (residential) {
      // 대표자 개인 주거 계약 → 주택 소유형태
      f.corp_house = monthlyLine && monthlyLine.v ? '임차 거주 (월세)' : '임차 거주 (전세)';
      meta.corp_house = { conf: 0.7, note: '주거용 계약 — 대표자 본인 계약인지 확인' };
    } else if (monthlyLine) {
      f.smb_cost_rent = String(Math.round(monthlyLine.v / 1e4));
      meta.smb_cost_rent = { conf: 0.7, src: monthlyLine.v, note: '부가세 별도 여부 확인' };
    }
    if (deposit) info.push('보증금 ' + Math.round(deposit.v / 1e4).toLocaleString('ko-KR') + '만원' + (sumOk ? '' : ' (확인 필요)'));
    if (monthlyLine) info.push('월세 ' + Math.round(monthlyLine.v / 1e4).toLocaleString('ko-KR') + '만원');
    if (area) info.push('전용면적 ' + area + '㎡ (약 ' + (Number(area) / 3.3058).toFixed(1) + '평)');
    const notes = [residential ? '주거용 임대차' : '사업장 임대차'].concat(info);
    if (!amt.length) notes.push('금액을 찾지 못했어요');
    return { fields: f, meta, notes };
  }

  // 법인 등기사항증명서: 등록번호(법인등록번호)·상호·본점 주소·회사성립연월일
  function parseCorpReg(rows) {
    const lines = rows.map(r => r.join(' ').replace(/\s+/g, ' ').trim());
    const f = {}, meta = {};
    const reg = corpRegOf(lines.join('\n')); if (reg) { f.corp_reg_no = reg; meta.corp_reg_no = { conf: 0.9 }; }
    const after = re => { for (const l of lines) { const m = l.match(re); if (m && m[1].trim()) return m[1].trim(); } return ''; };
    const name = after(/^상\s*호\s*[:：]?\s*(.+?)(?:\s+\d{4}\.\d{2}\.\d{2}.*)?$/); if (name) { f.corp_name = name; meta.corp_name = { conf: 0.8 }; }
    const addr = after(/^본\s*점\s*[:：]?\s*(.+?)(?:\s+\d{4}\.\d{2}\.\d{2}.*)?$/); if (addr) { f.corp_address = addr; meta.corp_address = { conf: 0.75, note: '등기상 본점 — 실제 사업장과 다를 수 있어요' }; }
    const est = ymd(after(/회\s*사\s*성\s*립\s*연\s*월\s*일\s*[:：]?\s*(.+)$/)); if (est) { f.corp_est_date = est; meta.corp_est_date = { conf: 0.8, note: '회사성립연월일' }; }
    return { fields: f, meta, notes: ['법인 등기사항증명서'] };
  }

  // 신분증(주민등록증·운전면허증): 이름, 생년월일(앞 6자리 — 세기는 추정). 주소는 저장하지 않고 참고만
  function parseIdCard(text) {
    const t = redact(text);
    const lines = t.split(/\r?\n/).map(norm).filter(Boolean);
    const f = {}, meta = {};
    // 이름: ① '홍길동(洪吉童)' ② '성명 홍길동' ③ 주민번호 줄 바로 위(또는 같은 줄 앞)의 한글 2~4자 한 낱말(운전면허증)
    const NOT_NAME = /^(주민등록증|운전면허증|자동차|면허증|대한민국|서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|특별시|광역시|시장|구청장|군수|도지사|경찰청장|적성검사|갱신기간|조건|발급|재발급|주소|성명|암호|일련번호|기간|면허|종류|보통|대형|특수|소형|원동기)$/;
    const okName = s => /^[가-힣]{2,4}$/.test(s) && !NOT_NAME.test(s);
    let name = '';
    const nm = t.match(/([가-힣]{2,4})\s*\(\s*[^\s)]{1,8}\s*\)/) || t.match(/성\s*명\s*[:：]?\s*([가-힣]{2,4})/);
    if (nm && okName(nm[1])) name = nm[1];
    if (!name) {
      const i = lines.findIndex(l => /\d{6}\s*[-–—]\s*[\d*]/.test(l));
      const cands = i < 0 ? [] : [lines[i].split(/\d{6}/)[0], lines[i - 1] || '', lines[i - 2] || ''];
      for (const c of cands) { const w = (c.match(/[가-힣]{2,4}/g) || []).filter(okName); if (w.length === 1 || (w.length && c.trim().length <= 6)) { name = w[w.length - 1]; break; } }
    }
    if (name) { f.corp_ceo = name; meta.corp_ceo = { conf: 0.7, note: '사진 글자 인식 — 확인해 주세요' }; }
    const rr = t.match(/(\d{2})(\d{2})(\d{2})\s*[-–—]\s*\*{7}/) || t.match(/(?:^|[^\d])(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\s*[-–—]\s*[\d*●xX#]/m);
    if (rr) {
      const yy = +rr[1], now = new Date().getFullYear() % 100;
      f.corp_ceo_birth = (yy > now ? '19' : '20') + rr[1] + '-' + rr[2] + '-' + rr[3];
      meta.corp_ceo_birth = { conf: 0.6, note: '태어난 세기는 추정 — 확인해 주세요' };
    }
    return { fields: f, meta, notes: ['주소·번호 뒷자리는 저장하지 않아요'] };
  }

  // 글자 인식 결과(문자열) 하나 → 서류 결과. 판별 실패하면 사용자가 고른 종류로 다시 읽는다
  function parseTextDocument(rawText, fileName, forceKind) {
    const text = redact(rawText);
    const rows = textRows(text);
    const auto = classify(rows, fileName);
    // 신분증은 제목이 깨지기 쉬워 번호 꼴 + 발급기관으로도 판별
    if (auto.kind === 'unknown' && /\d{6}-\*{7}/.test(text) && (/(시장|구청장|군수|도지사|경찰청장)/.test(despace(text)) || /[가-힣]{2,4}\s*\(/.test(text))) Object.assign(auto, { kind: 'idcard', title: '신분증' });
    const picked = forceKind && forceKind !== 'unknown' ? DOC_TYPES.find(d => d[0] === forceKind) : null;
    const c = picked ? { kind: picked[0], title: picked[1] } : auto;
    const out = { kind: c.kind, title: c.title, fields: {}, meta: {}, debtItems: [], notes: [], status: 'ok', ocr: true };
    if (despace(text).length < 15) { out.status = 'skip'; out.notes.push('글자를 거의 읽지 못했어요 — 더 밝고 반듯한 사진으로'); return out; }
    let r = null;
    if (c.kind === 'ip') { const ip = parseIP(text); out.ipItems = ip.items.length ? ip.items : [ip.item]; out.notes = ip.notes; return out; }
    if (c.kind === 'idcard') r = parseIdCard(text);
    else if (c.kind === 'lease') r = parseLease(text);
    else if (c.kind === 'bizcert') r = parseBizCert(rows);
    else if (c.kind === 'bizreg') r = parseBizReg(rows);
    else if (c.kind === 'share') r = parseShare(rows);
    else if (c.kind === 'corpreg') r = parseCorpReg(rows);
    else { out.status = 'skip'; out.notes.push(c.kind === 'unknown' ? '어떤 서류인지 알아보지 못했어요. 옆에서 종류를 골라 주세요' : '이 서류는 사진에서 아직 읽지 못해요(PDF 로 올려 주세요)'); return out; }
    out.fields = r.fields; out.meta = r.meta || {}; out.notes = r.notes || [];
    // 사진 인식은 한 단계 낮은 정확도로
    Object.keys(out.fields).forEach(k => { const m = out.meta[k] = out.meta[k] || {}; m.conf = Math.min(m.conf ?? 0.9, 0.75); });
    return out;
  }

  // 스캔 보정(픽셀 배열, 순수 함수): 밝기 150 미만만 글자로 보는 흑백화 + 긴 가로·세로 표 선 지우기
  function cleanScan(rgba, w, h) {
    const g = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { const y = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]; g[i] = y < 150 ? 1 : 0; }
    const minH = Math.round(w * 0.06), minV = Math.round(h * 0.03);
    for (let y = 0; y < h; y++) { let run = 0; for (let x = 0; x <= w; x++) { if (x < w && g[y * w + x]) run++; else { if (run >= minH) for (let k = x - run; k < x; k++) g[y * w + k] = 2; run = 0; } } }
    for (let x = 0; x < w; x++) { let run = 0; for (let y = 0; y <= h; y++) { if (y < h && g[y * w + x]) run++; else { if (run >= minV) for (let k = y - run; k < y; k++) g[k * w + x] = 2; run = 0; } } }
    for (let i = 0; i < w * h; i++) { const v = g[i] === 1 ? 0 : 255; rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; }
    return rgba;
  }

  // ───────── 지식재산권 등록증(특허·실용신안·디자인·상표) — 대부분 스캔본이라 글자 인식 글로 읽는다 ─────────
  // 등록증은 한글 라벨 위에 무늬(워터마크)가 있어 한글 라벨은 자주 깨지고, 아래 영문 라벨(Registration Number·
  // Application Number·Filing Date·Registration Date·Title of the …)은 잘 읽힌다. 값은 늘 영문 라벨 바로 윗줄에 있다.
  // 사람 줄은 '이름(생년월일6자리-*******)' 꼴(뒷자리는 redact 가 이미 지움) → 발명자·창작자는 이 꼴로 찾는다.
  // 번호 앞 두 자리로 권리 종류: 10 특허 · 20 실용신안 · 30 디자인 · 40 상표 (특허청 번호 체계)
  const IP_KIND = { 10: '특허', 20: '실용신안', 30: '디자인', 40: '상표' };
  const IP_HEAD = [[/CERTIFICATE\s*OF\s*PATENT|특\s*허\s*증/i, '특허'], [/UTILITY\s*MODEL|실\s*용\s*신\s*안\s*등\s*록\s*증/i, '실용신안'],
                   [/CERTIFICATE\s*OF\s*DESIGN|디\s*자\s*인\s*등\s*록\s*증/i, '디자인'], [/TRADEMARK|상\s*표\s*등\s*록\s*증/i, '상표']];
  // OCR 연도 실수 바로잡기: '20203'(2020년의 '년'→3) · '20922'(2022 가운데 9 끼어듦) · '9019'(2019 첫 자리 2→9)
  function fixYear(y) {
    y = String(y || '');
    const ok = v => +v >= 1950 && +v <= 2045;
    if (y.length === 4) return ok(y) ? y : (ok('2' + y.slice(1)) ? '2' + y.slice(1) : (ok('1' + y.slice(1)) ? '1' + y.slice(1) : ''));
    if (y.length >= 5) {
      if (ok(y.slice(0, 4))) return y.slice(0, 4);   // '202013'·'20203' → 2020 ('년'이 1·3 으로 읽힘)
      for (let i = y.length - 1; i >= 0; i--) { const v = y.slice(0, i) + y.slice(i + 1); if (v.length === 4 && ok(v)) return v; }   // '20922' → 2022
    }
    return '';
  }
  function ipDate(s) {
    const t = String(s || '').replace(/[oO]/g, '0');
    // '월'·'일' 글자가 있는 꼴을 먼저(연도 뒤 '년'이 숫자로 읽혀도 월·일을 잘못 잡지 않게), 없으면 느슨하게
    let m = t.match(/(\d{4,6})\D{0,3}?(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (!m) {
      // '월'·'일'이 숫자로 읽힌 경우('20203 0481 139' = 2020년 04월 13일): 연도 덩어리 다음 두 숫자 덩어리의 앞 두 자리
      const g = t.match(/\d+/g) || [];
      const yi = g.findIndex(x => x.length >= 4 && x.length <= 6 && /^(19|20)/.test(x));
      if (yi >= 0 && g[yi + 1] && g[yi + 2]) m = [null, g[yi], g[yi + 1].slice(0, 2), g[yi + 2].slice(0, 2)];
    }
    if (!m) return '';
    const y = fixYear(m[1]), mo = +m[2], d = +m[3];
    return y && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
  }
  // 등록번호는 특허청 전체 표기 'NN-NNNNNNN-00-00' 으로 (등록증에는 앞부분만 찍힘)
  const fullRegNo = (a, b, c) => `${a}-${b}-${c || '00-00'}`;
  const PERSON = /^[^가-힣]{0,3}([가-힣]{2,5})\s*[(（]\s*\d{6}\s*-/;
  const COMPANY = /(주식회사|\(주\)|㈜|유한회사|재단법인|사단법인|협동조합|대학교|산학협력단)/;
  const CERTIFY = /This\s*is\s*to\s*certify|위의\s*(발명|고안|디자인|상표)|증명합니다/i;

  // 한 쪽 글 → 등록증 한 건(번호가 없으면 null)
  function parseIPPage(text) {
    const t = redact(text);
    const lines = t.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const flat = lines.join('\n');
    const idx = re => lines.findIndex(l => re.test(l));
    const above = re => { const i = idx(re); return i > 0 ? lines[i - 1] : ''; };
    let kind = (IP_HEAD.find(([re]) => re.test(flat)) || [])[1] || '';
    // 등록번호: 'Registration Number' / 'Patent Number' 윗줄, 없으면 '제 NN-NNNNNNN 호'
    const regLine = above(/Registration\s*Number|Patent\s*Number/i) || '';
    const reg = (regLine.match(/(\d{2})\s*-\s*(\d{7})(?:\s*-\s*(\d{2}\s*-\s*\d{2}))?/) || flat.match(/제\s*(\d{2})\s*-\s*(\d{7})\s*호/));
    if (!reg) return null;
    const appLine = above(/Application\s*Number/i) || (lines.find(l => /출\s*원\s*번\s*호/.test(l)) || '');
    const app = appLine.match(/(\d{2})\s*-\s*(\d{4})\s*-\s*(\d{7})/);
    const code = +reg[1];
    if (IP_KIND[code]) kind = IP_KIND[code];
    const appYear = app ? (fixYear(app[2]) || app[2]) : '';
    // 날짜: 영문 라벨 윗줄
    let appDate = ipDate(above(/Filing\s*Da/i)) || ipDate(lines.find(l => /출\s*원\s*일/.test(l)) || '');
    let regDate = ipDate(above(/Regi\w*\s*Da(te|t|l)/i)) || ipDate(lines.find(l => /[등동]\s*록\s*일/.test(l)) || '');
    // 라벨을 못 읽었으면: 명칭 앞에 나오는 날짜 줄 순서(출원일 → 등록일)로
    if (!appDate || !regDate) {
      const tIdx = idx(/Title\s*of|of\s*the\s*(Invention|Device)|Article|roduc|Product|대상이\s*되는\s*물품|List\s*of\s*Goods|권\s*자|owner|atentee/i);
      const ds = lines.slice(0, tIdx > 0 ? tIdx : lines.length).map(ipDate).filter(Boolean);
      if (!appDate && ds[0]) appDate = ds[0];
      if (!regDate) regDate = ds.find(d => d !== appDate && d >= appDate) || '';
    }
    // 명칭: 'Title of the Invention/Device' · 디자인 '물품(Article/Product)' 라벨 다음 줄부터 권리자(회사) 줄 전까지
    let title = '';
    const ti = idx(/Title\s*of|of\s*the\s*(Invention|Device)|Article|roduc|Product|대상이\s*되는\s*물품|발명의\s*명칭|고안의\s*명칭/i);
    if (ti >= 0 && kind !== '상표') {
      const parts = [];
      for (let k = ti + 1; k < Math.min(lines.length, ti + 4); k++) {
        const l = lines[k];
        if (COMPANY.test(l) || PERSON.test(l) || /owner|atentee|Right|Type of|class|권\s*자|발\s*명\s*자|고\s*안\s*자|창\s*작\s*자|출\s*원\s*인/i.test(l) || /[가-힣]+\d{3,}\s*$/.test(l) || /^[^가-힣]*$/.test(l)) break;
        parts.push(l.replace(/\s{2,}.*/, ''));
      }
      title = parts.join(' ').replace(/(^|\s)([23])0(?=\s?[가-힣A-Za-z])/g, '$1$2D').replace(/\s+/g, ' ').trim();
    }
    if (kind === '상표') {
      const gi = idx(/List\s*of\s*Goods|지정\s*상품|상품\s*류/i);
      const cls = (flat.match(/제\s*(\d{1,2})\s*류(?:\s*등\s*(\d+)\s*개\s*류)?/) || []);
      const g = gi >= 0 ? (lines[gi + 1] || '').match(/\b(\d{2})\b/) : null;
      const c = cls[1] || (g && g[1]);
      const goods = (lines.find(l => /\d+\s*건/.test(l) && !/발급/.test(l)) || '').replace(/\s{2,}.*$/, '').replace(/\s*[|│].*$/, '').replace(/(^|\s)([23])0(?=\s?[가-힣A-Za-z])/g, '$1$2D').trim();
      title = [goods, c ? `제${+c}류${cls[2] ? ` 등 ${cls[2]}개류` : ''}` : ''].filter(Boolean).join(' · ');
    }
    // 권리자: 회사 줄(괄호 앞), 없으면 사람 줄 첫 번째
    const nameOf = l => String(l || '').replace(/^[^가-힣A-Za-z㈜(]+/, '').replace(/\s*[(（].*$/, '').trim();
    const ownerLine = lines.find(l => COMPANY.test(l) && /[(（]/.test(l)) || lines.find(l => COMPANY.test(l)) || '';
    // 발명자·고안자·창작자: 권리자 줄 다음부터 증명 문장 전까지의 사람 줄(주소 줄은 건너뜀)
    const oi = ownerLine ? lines.indexOf(ownerLine) : idx(/nventor|Devisers?|Creator|Designer/i);
    const ci = idx(CERTIFY);
    const people = [];
    for (let k = Math.max(0, oi + 1); k < (ci > oi ? ci : lines.length); k++) {
      const m = lines[k].match(PERSON);
      if (m && !COMPANY.test(lines[k]) && !people.includes(m[1])) people.push(m[1]);
    }
    const applicant = ownerLine ? nameOf(ownerLine) : (people.length && kind === '상표' ? people[0] : '');
    return {
      kind, title,
      appNo: app ? `${app[1]}-${appYear}-${app[3]}` : '', appDate,
      applicant, inventor: kind === '상표' ? '' : people.join(', '),
      regNo: fullRegNo(reg[1], reg[2], reg[3] && reg[3].replace(/\s/g, '')), regDate
    };
  }

  // 여러 쪽(합본 PDF·여러 장 사진): 쪽마다 한 건, 번호가 같은 다음 쪽(실용신안 2쪽 등)은 앞 건에 합침
  function parseIPPages(texts) {
    const items = [];
    for (const tx of texts) {
      const it = parseIPPage(tx);
      if (!it) continue;
      const prev = items.find(x => x.regNo === it.regNo);
      if (prev) {
        Object.keys(it).forEach(k => { if (!prev[k] && it[k]) prev[k] = it[k]; });
        if (it.inventor) prev.inventor = [...new Set([...(prev.inventor ? prev.inventor.split(', ') : []), ...it.inventor.split(', ')])].join(', ');
      } else items.push(it);
    }
    return items;
  }
  const IP_FIELDS = ['kind', 'title', 'appNo', 'appDate', 'applicant', 'inventor', 'regNo', 'regDate'];
  // 예전 호출(글 → 한 건)과 같은 모양 + items(여러 건). 글 안에 쪽 경계(<<PAGE>>)가 있으면 쪽마다 나눠 읽음
  function parseIP(text) {
    const items = parseIPPages(String(text || '').split(/<<PAGE>>/));
    const item = items[0] || { kind: '', title: '', appNo: '', appDate: '', applicant: '', inventor: '', regNo: '', regDate: '' };
    const got = items.reduce((a, x) => a + IP_FIELDS.filter(k => x[k]).length, 0);
    return { item, items, notes: [items.length > 1 ? `등록증 ${items.length}건` : (item.kind ? item.kind + ' 등록증' : '지식재산권 등록증'), `${got}/${Math.max(1, items.length) * 8}칸 읽음`] };
  }


  // 명칭 줄 두 번 읽기 합치기: 처음(한글+영문 모델)은 '3D' 같은 숫자·영문을 잘 읽고, 한글 전용은 한글 낱말을 잘 읽는다.
  // 낱말 수가 같으면 처음 결과에서 '영문 대문자만으로 된 낱말'(실제 약어가 아닌 것)만 한글 전용 결과로 바꾼다.
  const IP_ACRONYM = /^(AI|IoT|IOT|IT|ICT|LED|GPS|RFID|AR|VR|XR|PC|UV|CCTV|QR|BIM|CNC|PLC|EV|ESS|BMS|API|SW|HW|DB|OLED|LCD|PCB|MEMS|AGV|AMR|UAV|NFC|LTE|5G|3D|2D)$/i;
  function mergeTitleOcr(first, kor) {
    const a = String(first || '').trim().split(/\s+/), b = String(kor || '').trim().split(/\s+/);
    if (!a[0] || a.length !== b.length) return String(first || '').trim();
    return a.map((w, i) => (/^[A-Za-z]{2,}[^가-힣]*$/.test(w) && !IP_ACRONYM.test(w.replace(/[^A-Za-z0-9]/g, '')) && /[가-힣]/.test(b[i])) ? b[i] : w).join(' ');
  }

  // .xlsx(엑셀) 읽기 — 라이브러리 없이: zip 안의 sharedStrings·첫 시트만 풀어 행 배열로. 압축 풀기는 브라우저 기본 기능(DecompressionStream)
  async function readXlsx(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('엑셀(zip) 형식이 아니에요');
    const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
    const files = {};
    for (let k = 0; k < n; k++) {
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      files[name] = { method, csize, off };
      p += 46 + nlen + elen + clen;
    }
    const get = async name => {
      const f = files[name]; if (!f) return '';
      const lnl = dv.getUint16(f.off + 26, true), lel = dv.getUint16(f.off + 28, true);
      const data = u8.subarray(f.off + 30 + lnl + lel, f.off + 30 + lnl + lel + f.csize);
      if (f.method === 0) return new TextDecoder().decode(data);
      const ds = new DecompressionStream('deflate-raw');
      const out = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
      return new TextDecoder().decode(out);
    };
    const unx = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
    const ss = [...(await get('xl/sharedStrings.xml')).matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => unx([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]).join('')));
    const sheetName = Object.keys(files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f)).sort()[0];
    const xml = await get(sheetName);
    const colNo = ref => { let c = 0; for (const ch of ref.replace(/\d+/g, '')) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };
    // 엑셀 날짜(일련번호) → YYYY-MM-DD (날짜 서식 칸만 바꾸기는 어려워 4만~6만 사이 정수 + 열 제목에 '일'이 있을 때 parseIPList 가 다시 판단)
    const rows = [];
    for (const r of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const t = (c[2].match(/t="(\w+)"/) || [])[1], v = ((c[3] || '').match(/<v>([\s\S]*?)<\/v>/) || [])[1], is = ((c[3] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
        row[colNo(c[1])] = t === 's' ? ss[+v] : t === 'inlineStr' ? unx(is || '') : v !== undefined ? unx(v) : '';
      }
      rows.push(Array.from(row, x => x === undefined ? '' : x));
    }
    return rows;
  }
  const xlDate = v => { const n = Number(v); if (!/^\d{5}(\.\d+)?$/.test(String(v)) || n < 20000 || n > 70000) return v; const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000); return d.toISOString().slice(0, 10); };

  // 특허사무소 목록 표(권리·출원번호·출원일·출원인·발명자·등록번호·등록일·명칭) — 표 행 배열 → 여러 건
  function parseIPList(rows) {
    const sq = s => String(s == null ? '' : s).replace(/\s+/g, '');
    const hi = rows.findIndex(r => r.some(c => /출원번호/.test(sq(c))) && r.some(c => /등록번호|명칭/.test(sq(c))));
    if (hi < 0) return [];
    const H = rows[hi].map(sq);
    const col = re => H.findIndex(h => re.test(h));
    const c = { right: col(/^권리$|^종류$|^구분$/), appNo: col(/출원번호/), appDate: col(/출원일/), applicant: col(/출원인|권리자/), inventor: col(/발명자|창작자|고안자/), regNo: col(/등록번호/), regDate: col(/등록일/), title: col(/명칭/) };
    const v = (r, k) => c[k] >= 0 ? String(r[c[k]] == null ? '' : r[c[k]]).trim() : '';
    const day = s => { s = xlDate(s); const m = String(s).match(/(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
    const out = [];
    for (const r of rows.slice(hi + 1)) {
      const appNo = (v(r, 'appNo').match(/\d{2}-\d{4}-\d{7}/) || [''])[0];
      const reg = v(r, 'regNo').match(/(\d{2})-(\d{7})(?:-(\d{2}-\d{2}))?/);
      if (!appNo && !reg) continue;
      const code = +((reg || [])[1] || appNo.slice(0, 2));
      const right = v(r, 'right');
      const kind = IP_KIND[code] || (/실용/.test(right) ? '실용신안' : /디자인/.test(right) ? '디자인' : /상표/.test(right) ? '상표' : /특허/.test(right) ? '특허' : '');
      out.push({ kind, title: v(r, 'title'), appNo, appDate: day(v(r, 'appDate')), applicant: v(r, 'applicant'),
        inventor: kind === '상표' ? '' : v(r, 'inventor').split(/[ㆍ·,、/]+/).map(s => s.trim()).filter(Boolean).join(', '),
        regNo: reg ? fullRegNo(reg[1], reg[2], reg[3]) : '', regDate: day(v(r, 'regDate')) });
    }
    return out;
  }

  // ───────── 사업자등록증(등록증 본문 — '증명'과 칸 모양이 다름) ─────────
  // 줄 예: '등록번호 : 123-45-67890' · '상 호 : OO' · '성 명 : OO  생년월일 : 1980 년 01 월 02 일' · '개업연월일 : 2019 년 04 월 01 일'
  //        '사업장소재지 : …' · '사업의 종류 : 업태 제조업  종목 탁주'(두 줄로 이어지기도). 위치(x)가 있으면 업태·종목 칸을 나눠 읽는다
  function parseBizReg(rows, pages) {
    const f = {}, meta = {};
    const lines = rows.map(r => r.join(' '));
    const flat = despace(lines.join('|'));
    const val = re => { for (const l of lines) { const d = l.replace(/\s+/g, ' '); const m = despace(d).match(re); if (m) return m; } return null; };
    const no = bizNoOf((flat.match(/등록번호[:：]?(\d{3}-?\d{2}-?\d{5})/) || [])[1] || '');
    const tax0 = flat.match(/\((일반과세자|간이과세자|면세사업자|법인사업자)\)/);
    if (no) {
      f.corp_biz_no = no;
      if (!bizNoValid(no)) meta.corp_biz_no = { conf: 0.3, valid: false, note: '번호 검증식이 맞지 않아요 — 원본 확인' };
      f.corp_form = formValue(isCorpNo(no) || (tax0 && tax0[1] === '법인사업자'), tax0 && tax0[1]);
      meta.corp_form = { conf: tax0 ? 0.9 : 0.6 };
    }
    // 값은 띄어쓰기를 살려서: 라벨 다음 ':' 뒤부터 다음 라벨 전까지
    const after = (labelRe, stopRe) => {
      for (const l of lines) {
        const s = l.replace(/\s+/g, ' ');
        const m = s.match(new RegExp('(?:' + labelRe.source + ')\\s*[:：]\\s*(.+)$'));
        if (m) { let v = m[1]; if (stopRe) v = v.split(stopRe)[0]; v = v.trim(); if (v) return v; }
      }
      return '';
    };
    const name = after(/상\s*호|법\s*인\s*명(?:\s*\(단체명\))?/, /\s+(?:성\s*명|대\s*표\s*자)\s*[:：]/); if (name) f.corp_name = name;
    const ceo = after(/성\s*명|대\s*표\s*자/, /\s+생\s*년\s*월\s*일|\s+주민|\s+법인등록/); if (ceo) f.corp_ceo = ceo.replace(/\s+/g, '');
    const birth = val(/생년월일[:：]?(\d{4})년(\d{1,2})월(\d{1,2})일/);
    if (birth) { f.corp_ceo_birth = `${birth[1]}-${birth[2].padStart(2, '0')}-${birth[3].padStart(2, '0')}`; meta.corp_ceo_birth = { conf: 0.85 }; }
    const open = val(/개업연월일[:：]?(\d{4})년(\d{1,2})월(\d{1,2})일/);
    if (open) f.corp_est_date = `${open[1]}-${open[2].padStart(2, '0')}-${open[3].padStart(2, '0')}`;
    const addr = after(/사\s*업\s*장\s*소\s*재\s*지/, /\s+본\s*점\s*소\s*재\s*지\s*[:：]/); if (addr) f.corp_address = addr;
    // 업태·종목: 위치가 있으면 '업태'·'종목' 글자 아래·오른쪽 칸을 모은다
    let up = '', jm = '';
    const items = (pages || []).flat();
    const lab = t => items.find(i => despace(i.s) === t);
    const U = lab('업태'), J = lab('종목');
    if (U && J) {
      const band = i => i.y <= U.y + 4 && i.y >= U.y - 40;
      up = items.filter(i => band(i) && i.x > U.x + 5 && i.x < J.x - 2 && despace(i.s) !== '업태').sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.s.trim()).join(' ');
      jm = items.filter(i => band(i) && i.x > J.x + 5 && despace(i.s) !== '종목').sort((a, b) => b.y - a.y || a.x - b.x).map(i => i.s.trim()).join(' ');
    } else {
      const l = lines.find(x => /업\s*태/.test(x) && /종\s*목/.test(x)) || '';
      const m = l.replace(/\s+/g, ' ').match(/업\s*태\s*(.*?)\s*종\s*목\s*(.*)$/);
      if (m) { up = m[1].trim(); jm = m[2].trim(); }
    }
    if (up || jm) { f.corp_biz_type = [jm, up ? '(' + up + ')' : ''].filter(Boolean).join(' '); meta.corp_biz_type = { conf: 0.75 }; }
    const reg = corpRegOf(lines.join('\n')); if (reg) { f.corp_reg_no = reg; meta.corp_reg_no = { conf: 0.9 }; }
    return { fields: f, meta, notes: tax0 ? ['사업자등록증', tax0[1]] : ['사업자등록증'] };
  }

  // ───────── 상담 메모(텍스트 파일) — '● 라벨  값' 꼴 정리 메모 ─────────
  // 비밀번호·아이디·계좌번호·주민번호 뒷자리·자택주소는 읽지 않고 버린다(앱 칸에도, 결과에도 남기지 않음)
  const NOTE_SECRET = /비번|비밀번호|패스워드|password|\bpw\b|아이디|\bid\b|계좌|공동인증|인증서\s*비|자택|집\s*주소|기보\s*$/i;
  function parseNotes(text, now) {
    const f = {}, meta = {}, notes = [], debtItems = [], vatYears = {};
    const yr = (now || new Date()).getFullYear();
    const raw = redact(String(text || '')).replace(/\r/g, '');
    const lines = raw.split('\n').map(l => l.replace(/ /g, ' ').trim());
    const pairs = [];
    for (const l of lines) {
      const m = l.match(/^[●•○◎▶■□\-*]\s*([^\t]+?)(?:\t+|\s{2,})(.*)$/) || l.match(/^[●•○◎▶■□\-*]\s*(.+?)$/);
      if (m) pairs.push([m[1].replace(/\s+/g, ' ').trim(), (m[2] || '').trim()]);
    }
    // 비밀 줄은 처음부터 뺀다: 라벨·값에 비번·아이디·계좌 등이 있거나, 값이 비밀번호처럼 생긴 것(특수문자 섞인 한 덩어리)
    const looksSecret = v => /^\S{6,}$/.test(v) && /[!@#$%^&]/.test(v) && !/@[\w-]+\.[a-z]{2,}$/i.test(v);   // '*' 는 뺌(주민번호 가림 표시)
    const safe = pairs.filter(([k, v]) => !NOTE_SECRET.test(k) && !NOTE_SECRET.test(v) && !looksSecret(v) && !v.split(/\s*\/\s*/).some(looksSecret));
    const get = re => { const p = safe.find(([k, v]) => re.test(k) && v); return p ? p[1] : ''; };
    const put = (id, v, conf, note) => { if (v === '' || v === null || v === undefined) return; f[id] = v; meta[id] = Object.assign({ conf: conf ?? 0.8 }, note ? { note } : {}); };
    // 첫 줄: '상호 123-45-67890'
    const first = lines.find(l => l && !/^[●•]/.test(l)) || '';
    const fm = first.match(/^(.+?)\s*(\d{3}-\d{2}-\d{5})/);
    if (fm) { put('corp_name', fm[1].trim(), 0.85); const no = bizNoOf(fm[2]); put('corp_biz_no', no, bizNoValid(no) ? 0.85 : 0.3, bizNoValid(no) ? '' : '번호 검증식이 맞지 않아요 — 원본 확인'); }
    put('corp_ceo', get(/^대표자?$/).replace(/\s+/g, ''), 0.8);
    const day = s => { const m = String(s).match(/(\d{4})\s*[년.\-/]\s*(\d{1,2})\s*[월.\-/]\s*(\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : ''; };
    put('corp_est_date', day(get(/^개업일|^개업연월일|^설립일/)) || day(get(/^창업/)), 0.8);
    put('corp_address', get(/^소재지$|^사업장\s*(주소|소재지)?$|^본점/), 0.75);
    // 주민번호는 앞 6자리만(뒷자리는 redact 가 이미 지움) → 생년월일. 세기는 지금 연도 기준 추정
    const rrn = (get(/주민/) || '').match(/(\d{2})(\d{2})(\d{2})/);
    if (rrn) { const yy = +rrn[1]; const full = (yy > yr % 100 ? 1900 : 2000) + yy; put('corp_ceo_birth', `${full}-${rrn[2]}-${rrn[3]}`, 0.7, '주민번호 앞자리로 추정 — 확인'); }
    put('corp_biz_type', get(/^업종$|^업태|^종목/), 0.7);
    // 매출: 'NN년' 라벨의 원 단위 금액 → 연도별(올해 상반기 등은 올해 누적)
    for (const [k, v] of safe) {
      const y2 = k.match(/(\d{2,4})\s*년/); const won = (v.match(/([\d,]{5,})\s*원/) || [])[1];
      if (/매출/.test(k + ' ' + v) || /상반기|하반기|분기|누적/.test(k)) {
        if (y2 && won) { const y = y2[1].length === 2 ? 2000 + +y2[1] : +y2[1]; vatYears[y] = (vatYears[y] || 0) + Number(won.replace(/,/g, '')); }
      }
    }
    // 신용점수 'K895/N885' · 'KCB 895 / NICE 885'
    const cr = get(/신용\s*(점수|평점|등급)/) || get(/^신용$/);
    const k = cr.match(/K(?:CB)?\s*[:：]?\s*(\d{3,4})/i), n = cr.match(/N(?:ICE)?\s*[:：]?\s*(\d{3,4})/i);
    if (k) put('sme_kcb', k[1], 0.8); if (n) put('sme_nice', n[1], 0.8);
    // 체납·4대보험: 'X/없음' 이면 체납 없음 → 완납 '예', 'O/있음' 이면 '아니오'
    const yn = s => /^(x|없음|무|해당\s*없음|n|no)$/i.test(s.trim()) ? 'no' : /^(o|있음|유|y|yes)$/i.test(s.trim()) ? 'yes' : '';
    const tax = yn(get(/체납/)); if (tax) put('smb_chk_tax_ok', tax === 'no' ? '예' : '아니오', 0.75, '메모의 체납 여부로 판단');
    const ins = get(/4대\s*보험|사회\s*보험/);
    const insYn = yn(ins); if (insYn) put('smb_chk_insurance', insYn === 'yes' ? '예' : '아니오', 0.6, '메모 기준 — 직원 사회보험 가입 확인');
    const certs = get(/인증|벤처|이노/); if (certs) put('corp_certs', certs, 0.5, '메모 그대로 — 실제 인증서와 대조');
    const bank = (get(/주거래/) || (lines.find(l => /주거래/.test(l)) || '').replace(/.*주거래\S*\s*/, '')).replace(/[\d-]{8,}.*/, '').trim();
    if (bank && bank.length <= 15 && !NOTE_SECRET.test(bank)) put('corp_main_bank', bank, 0.6);
    // 기존 대출: '농협2천(개인), 코로나정책자금 3천(기보)'
    const loans = get(/대출|정책자금|차입/);
    loans.split(/[,，、]/).forEach(part => {
      const m = part.trim().match(/^(.*?)(\d+(?:\.\d+)?)\s*(억|천만?|백만|만)\s*원?\s*(?:\((.*?)\))?/);
      if (!m) return;
      const unit = { '억': 10000, '천': 1000, '천만': 1000, '백만': 100, '만': 1 }[m[3]] || 1;
      const inst = (m[1] || '').trim() || (m[4] || '').trim();
      if (!inst) return;
      debtItems.push({ institution: inst, type: m[4] ? m[4].trim() : '', balance: Math.round(+m[2] * unit), rate: '', monthlyInterest: '', payback: '', _from: '상담 메모(추정)' });
    });
    const dropped = lines.filter(l => NOTE_SECRET.test(l)).length;
    if (dropped) notes.push(`비밀번호·계정·계좌 같은 줄 ${dropped}개는 읽지 않았어요`);
    return { fields: f, meta, debtItems, vatYears, notes };
  }

  // 서류 하나: 쪽별 글자 조각 → {kind,title,fields,debtItems,fs,notes,status}
  // forceKind: 자동 판별이 틀렸을 때 사용자가 고른 종류로 같은 글자를 다시 읽는다
  function parseDocument(pages, fileName, forceKind) {
    const rows = pagesToRows(pages).flat();
    const chars = rows.flat().join('').length;
    const auto = classify(rows, fileName);
    const picked = forceKind && forceKind !== 'unknown' ? DOC_TYPES.find(d => d[0] === forceKind) : null;
    const c = picked ? { kind: picked[0], title: picked[1] } : auto;
    const out = { kind: c.kind, title: c.title, fields: {}, debtItems: [], notes: [], status: 'ok' };
    if (chars < 20) { out.status = 'scan'; out.notes.push('사진으로 된 서류 — 글자 인식(OCR) 다음 단계'); return out; }
    let r = null;
    if (c.kind === 'bizcert') r = parseBizCert(rows);
    else if (c.kind === 'bizreg') r = parseBizReg(rows, pages);
    else if (c.kind === 'fs') { r = parseFS(rows); out.fs = { year: r.year, wonValues: r.wonValues, balanced: r.balanced, full: parseFSFull(rows) }; }
    else if (c.kind === 'vat') r = parseVAT(rows);
    else if (c.kind === 'ins') r = parseIns(rows);
    else if (c.kind === 'share') r = parseShare(rows);
    else if (c.kind === 'corpreg') r = parseCorpReg(rows);
    else if (c.kind === 'ip') { const ip = parseIP(rows.map(r => r.join('  ')).join(String.fromCharCode(10))); out.ipItems = ip.items.length ? ip.items : [ip.item]; out.notes = ip.notes; return out; }
    else if (c.kind === 'ledger' || c.kind === 'creditor') {
      const parsed = parseDebtDocument(pagesToCells(pages));
      out.debtItems = toDebtItems(parsed);
      if (parsed && parsed.kind === 'creditor_change') out.notes.push('대표자 개인 대출 ' + parsed.summary.loans + '건 · 연체 이력 ' + parsed.summary.delinquencies + '건(미해제 ' + parsed.summary.unresolved + ')');
      if (parsed && parsed.kind === 'debt_ledger') out.notes.push('차입금 ' + parsed.rows.length + '건 · 기준일 ' + parsed.asOf);
      if (!parsed) { out.status = 'skip'; out.notes.push('표를 읽지 못함'); }
      return out;
    } else { out.status = 'skip'; out.notes.push(c.kind === 'unknown' ? '종류를 알 수 없음' : '아직 읽는 규칙이 없는 서류'); return out; }
    out.fields = r.fields; out.meta = r.meta || {}; out.notes = r.notes;
    if (r.yearTotals) out.vatYears = r.yearTotals;
    if (r.halfTotals) out.vatHalves = r.halfTotals;
    return out;
  }

  // 재무제표 여러 장(연도별) → 3개년 칸(백만원): 가장 최근 해 = 당기(sme_*), 그 전 해 = _2024, 그 전전 해 = _2023
  function fsToFields(fsList) {
    const list = fsList.filter(x => x && x.year).sort((a, b) => b.year - a.year);
    if (!list.length) return {};
    const top = list[0].year, f = {}, src = {}, conf = {};
    const suf = { 0: '', 1: '_2024', 2: '_2023' };
    const put = (id, won, x) => { if (won === null || won === undefined) return; f[id] = won2baek(won); src[id] = won; conf[id] = x.balanced === false ? 0.4 : 0.9; };
    list.forEach(x => {
      const k = top - x.year; if (!(k in suf)) return;
      const v = x.wonValues;
      put('sme_sales' + suf[k], v.sales, x);
      put('sme_profit' + suf[k], v.profit, x);
      put('sme_debt' + suf[k], v.debt, x);
      put('sme_equity' + suf[k], v.equity, x);
      // 주요 재무지표 입력 칸(백만원)
      [['sme_assets', 'assets'], ['sme_net', 'net'], ['sme_capital', 'capital'], ['sme_st_loan', 'stLoan'], ['sme_lt_loan', 'ltLoan'],
        ['sme_quick', 'quick'], ['sme_cur_liab', 'curLiab'], ['sme_int_exp', 'interest'], ['sme_int_inc', 'intInc'],
        ['sme_ar', 'ar'], ['sme_inv', 'inv'], ['sme_ap', 'ap'], ['sme_unpaid', 'unpaid']].forEach(([id, key]) => put(id + suf[k], v[key], x));
      if (v.loanToCeo) put(k === 0 ? 'sme_loan_to_ceo' : 'sme_loan_to_ceo' + suf[k], v.loanToCeo, x);
      if (k === 0 && v.sales) { f._monthlyFromFs = won2man(v.sales / 12); src._monthlyFromFs = v.sales / 12; }
    });
    f._fsTopYear = top; f._src = src; f._conf = conf;
    return f;
  }

  function parseDebtDocument(lines) { return parseLedger(lines) || parseCreditorChange(lines); }
  const api = { parseLedger, parseCreditorChange, parseDebtDocument, toDebtItems, UNIT_TO_MAN, itemsToRows, pagesToCells, pagesToRows, classify, parseDocument, fsToFields, DOC_TYPES, bizNoValid, formValue, redact, parseTextDocument, cleanScan, koreanAmount, parseIP, parseIPPages, parseIPList, fixYear, mergeTitleOcr, readXlsx, parseBizReg, parseNotes, parseFSFull, parseVAT, corpRegOf, corpRegValid, parseCorpReg, parseIdCard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MSCDocParsers = api;
})(typeof window !== 'undefined' ? window : globalThis);
