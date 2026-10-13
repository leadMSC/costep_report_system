// 서류 글자 → 앱 칸 해석기 (부채 서류 2종). 브라우저(pdf.js 글자층)와 node 시험에서 같이 쓴다.
// 입력: 쪽 순서대로 늘어놓은 글자 줄 배열(쪽 경계는 '<<PAGE>>'). 출력: 앱 대출표에 넣을 후보 행.
// 원칙: 금액은 앱 단위(만원)로 바꾼다 · 금리는 이 서류들에 없으므로 비워 두고 '확인 필요' 표시
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
    if (!/거래처원장/.test(text) || !/잔액/.test(text)) return null;
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

  function parseDebtDocument(lines) { return parseLedger(lines) || parseCreditorChange(lines); }
  const api = { parseLedger, parseCreditorChange, parseDebtDocument, toDebtItems, UNIT_TO_MAN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MSCDocParsers = api;
})(typeof window !== 'undefined' ? window : globalThis);
