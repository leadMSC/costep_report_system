> **리드디벨롭 주의 (2026-10-11):** 아래 원문은 원본 기준이며 일부 사실과 다르다 — 공고 수 27개 아님(43개), 3개년 재무 입력은 v1에서 추가, 파일 크기 기준(230~250KB) 폐기, 아래 검증 스크립트 1번은 `alert` 미정의로 실패함.
> 개발본 검증은 `node tools/check.js` 를 쓴다. 계획은 `DEVELOP_PLAN.md`, 변경 이력은 `CHANGELOG.md`.

# 코스텝(COSTEP) 원페이지 경영진단 및 지원사업 연계 자동화시스템 개발·인수인계 핸드오프 (Handoff Document)

본 문서는 **코스텝(COSTEP)**의 `원페이지 경영진단 및 지원사업 연계 자동화시스템`(`코스텝_원페이지_경영진단_자동화시스템.html`)을 **Claude Code(클로드 코드)** 환경에서 즉시 이어받아 유지보수, 추가 기능 개발 및 고도화 작업을 진행할 수 있도록 작성된 종합 기술 인수인계서입니다.

---

## 1. 프로젝트 개요 및 아키텍처 원칙

### 1.1 시스템 목적
- **수진기업 기초 실태조사(입력)** ➔ **분야별 정식 행정시행문 및 진단서 4종 A4 규격 자동 생성(출력)** ➔ **중소기업/소기업/소상공인 맞춤 공공 지원사업 실시간 적격 매칭(연계)**을 단일 HTML 파일로 완결하는 원페이지(SPA) 전산 솔루션입니다.

### 1.2 핵심 기술 스택
- **프론트엔드 구조**: 무설치 단일 HTML5 파일 (Single File Standalone WebApp)
- **스타일링**: Tailwind CSS (CDN 연동), Noto Sans KR (웹폰트), 코스텝 전용 딥 틸(#169aa8) 및 슬레이트 팔레트
- **스크립트 엔진**: Pure Vanilla JavaScript (ES6+, 외부 무거운 프레임워크 종속성 제로)
- **오프라인/클라이언트 완결성**: 브라우저 로컬 저장소(`localStorage`), 클라이언트 단 A4 인쇄 엔진(`window.print`), 순수 HTML-to-Doc 내보내기 엔진 탑재

### 1.3 절대 준수 기준 및 브랜드 아이덴티티
- **회사명**: **코스텝** (영문: **COSTEP**)
- **본점 소재지**: **경기도 화성시 동탄기흥로 594-7 907호 908호**
- **비주얼 원칙**:
  - **이모지 전면 배제**: 유치한 이모티콘(🎯, 🏢, 📍, 🏷️ 등) 일체 금지, 정갈한 SVG 벡터 아이콘 및 배지 사용
  - **비표준 외래어/AI 조어 배제**: `PSST`, `Outcome`, `BEP`, `솔루션`, `프레임워크` 등 전면 제거
  - **사내 전산망 스타일 유지**: 외부 포털(`기업마당 공식공고` 등) 명칭을 노출하지 않고 코스텝 독자 내부 프로그램 비주얼 유지
  - **단어 기준**: `10대`, `원칙` 등의 단어를 배제하고 `주요 업종 구분`, `공문서 작성 기준` 등의 전문 행정어 사용

---

## 2. 파일 구성 및 소스 코드 레이아웃

- **주요 소스 파일**: `코스텝_원페이지_경영진단_자동화시스템.html` (약 242KB)
- **구조도**:
```text
<!DOCTYPE html>
<html lang="ko">
<head>
  ├── 메타태그 및 Tailwind CSS, 구글 폰트 로드
  └── @media print 및 A4 단일 페이지 규격(.a4-page-card) CSS 정의
</head>
<body class="min-h-screen text-slate-900 pb-16">
  ├── <header> (no-print: 상단 고정 네비게이션, 화면 전환 탭 3개)
  └── <main>
        ├── <div id="screen_input"> (화면 1: 기업 실태 기초조사서)
        │     ├── 카드 1: 기업 규모(소상공인/소기업/중기업) & 10대 주요 업종 선택기
        │     ├── 카드 2: 수진기업 기본 정보 & 대표자/주주 인적사항
        │     ├── 카드 2B: 거래처 구조, 지식재산권, 보유 인증 현황
        │     ├── 카드 3: 금융기관별 여신·차입금 세부 현황표 (동적 행 추가/삭제)
        │     ├── 카드 4A: 소상공인 전용 수지분석 (월매출, 5대 고정비, 손익분기 자동연산, 4대 체크리스트)
        │     ├── 카드 4B: 중소·소기업 전용 3개년 결산 재무제표 (Y-3, Y-2, Y-1) & 주요 업종 특화 제원
        │     └── 카드 5: 공공 지원사업 신청 대비 사업계획 개요서 & 지능형 자동 생성기
        │
        ├── <div id="screen_reports" class="hidden"> (화면 2: 행정시행문 및 진단서 출력 센터)
        │     ├── 좌측 사이드바 (lg:col-span-3, no-print)
        │     │     ├── 일괄 제어: 전체 공문서 인쇄/PDF 및 일괄 독스 다운로드
        │     │     ├── 분야별 자문 서류철 (1~6번 선택)
        │     │     └── 낱개 서식 선택기 (서식 1~4번 및 전체 일괄 열람)
        │     └── 우측 A4 공문서 워크스페이스 (lg:col-span-9)
        │           └── <div id="active_report_render_area">
        │                 ├── 서식 1: 정식 행정시행문 (두문, 본문, 결문, 코스텝 직인)
        │                 ├── 서식 2: 경영진단 결과보고서 (제원표, 인증, 부채표, 3개년 재무분석)
        │                 ├── 서식 3: 세부 실행안내서 및 구비서류 (단계별 절차, 맞춤 공고 연계)
        │                 └── 서식 4: 사업계획 개요서 (공모 제출용 표준 서식)
        │
        └── <div id="screen_radar" class="hidden space-y-5"> (화면 3: 공공 지원사업 맞춤 연계)
              ├── 검색바 (사업명, 소관부처, 지원대상 필터)
              ├── 분야별 탭 바 (전체, 금융, 기술, 인력, 수출, 내수, 창업, 경영, 기타 실시간 카운트)
              ├── 연동 상태 배너 (실시간 적격 대사 갱신 일시)
              └── <div id="radar_announcements_grid"> (공고 카드 3열 그리드)
  <script>
    ├── 1. 기본 상태(window.appState) 및 직인 Base64 상수 정의
    ├── 2. 27개 지원사업 카탈로그(SUPPORT_PROGRAM_CATALOG) 및 실시간 동기화 엔진
    ├── 3. 화면 전환 및 트랙(규모/업종) 제어 함수 (switchMainScreen, setBizTrack, setIndustryTrack)
    ├── 4. 실시간 계산 엔진 (calcSmbMetrics, calcDebtTotals, addDebtRow, removeDebtRow)
    ├── 5. 지능형 사업계획 개요서 자동생성 엔진 (autoGenerateBusinessPlan)
    ├── 6. 18종 보고서 데이터베이스 (COSTEP_REPORTS_DB: smb, small, sme 각 6종)
    ├── 7. 공문서 렌더링 및 동적 데이터 대사 엔진 (renderActiveReport, getMatchedAnnouncementForCategory)
    ├── 8. 인쇄 및 구글 독스/MS 워드 내보내기 엔진 (printSingleSheet, downloadSingleSheetDoc, downloadAllSheetsDoc)
    └── 9. 이벤트 바인딩 및 DOMContentLoaded 초기화
  </script>
</body>
</html>
```

---

## 3. 핵심 상태 관리 (State Management)

클라이언트의 모든 반응형 상태는 `window.appState` 전역 객체로 중앙 집중 관리됩니다:

```javascript
window.appState = {
  currentScreen: 'input',     // 'input' | 'reports' | 'radar'
  bizTrack: 'smb',            // 'smb' (소상공인) | 'small' (소기업) | 'sme' (중기업)
  industryTrack: 'mfg',       // 'mfg' | 'it' | 'bio' | 'const' | 'dist' | 'food' | 'logis' | 'content' | 'esg' | 'service'
  activeReportKey: 'manage',  // 소상공인(manage..labor), 소기업(strategy..esg), 중기업(strategy..esg)
  activeSheet: 'all',         // 'all' | 'official' | 'report' | 'guide' | 'bplan'
  radarFilter: 'recom',       // 'recom' (추천 공고) | 'all' (전체 열람)
  radarCategory: 'all',       // 'all' | '금융' | '기술' | '인력' | '수출' | '내수' | '창업' | '경영' | '기타'
  debtItems: []               // 금융기관별 차입금 행 데이터 배열
};
```

---

## 4. 데이터 플로우 및 핵심 모듈 분석

### 4.1 화면 1 ➔ 화면 2 실시간 100% 자동 연동 구조 (`renderActiveReport()`)
* **원리**: 사용자가 화면 1의 폼 필드에 입력한 값은 `syncCompanyData()` 및 `renderActiveReport()` 호출 시 DOM에서 즉시 추출되어 서식 1~4 템플릿의 변수로 1:1 대사됩니다.
* **주요 바인딩 변수**:
  - 기본정보: `corpName`, `corpForm`, `bizNo`, `regNo`, `ceoName`, `ceoBirth`, `estDate`, `address`, `factoryAddress`, `bizType`, `mainBank`, `ceoShare`, `houseType`
  - 거래처/인증: `salesChannel`, `clients`, `vendors`, `patents`, `certs`
  - 금융부채: `debtItems` 배열 루프 ➔ `debtRowsHtml` 테이블 자동 생성 (잔액, 이자, 금리 가중평균 산출)
  - 소상공인 수지: `monthlySales`, `fixedTotal`, `dailyReq`, `monthlyReq`, `statusStr`, 5대 고정비(임차, 관리, 인건, 렌탈, 이자), 4대 체크리스트
  - 중소·소기업 3개년 결산: `sme_sales_2023(Y-3)`, `sme_sales_2024(Y-2)`, `sme_sales(Y-1)` 및 영업이익, 부채총계, 자본총계 비교 표, 신용평점(NICE/KCB), 가지급금, 상시근로자수
  - 사업계획 개요: `bpProblem`, `bpSolution`, `bpScaleup`, `bpBudget`, `bpTeam`, `bpOutcome`

### 4.2 지능형 사업계획서 자동 생성 엔진 (`autoGenerateBusinessPlan()`)
* 사용자가 기초조사서에 기재한 업종(`ind`), 주생산품(`bizType`), 설립일자(`estDate` ➔ 업력 N년차 계산), 매출 규모, 판매방식, 거래처, 특허 및 인증 현황을 종합 분석합니다.
* 10대 주업종별 전문 템플릿 알고리즘과 결합하여 **문제인식, 실현가능성, 성장전략, 자금조달계획, 사업수행역량, 파급효과** 6대 영역을 문맥에 맞게 서술형으로 자동 작성합니다.

### 4.3 2차원 정밀 타겟팅 공고 추천 엔진 (`getMatchedAnnouncementForCategory()`)
* 기업 규모(`track`: smb / small / sme)와 주업종(`ind`: mfg / it / bio / const 등)을 2차원으로 복합 대사합니다.
* 서식 3(세부 실행안내서) 하단의 **소관부처 적격 지원제도 연계 안내** 박스에 해당 기업의 조건과 현재 열람 중인 서식 주제에 1:1로 부합하는 전용 공고를 핀포인트로 출력합니다.

### 4.4 A4 단일 인쇄 규격 및 구글 독스/MS 워드 내보내기 엔진
* **A4 단일 규격 (`.a4-page-card`)**: 가로 210mm, 높이 297mm의 정밀 인쇄 박스로 스타일링되어 인쇄/PDF 저장 시 페이지 넘침이나 레이아웃 왜곡이 없습니다.
* **독스 내보내기 (`downloadSingleSheetDoc()`, `downloadAllSheetsDoc()`)**: 순수 HTML DOM 구조를 `application/msword` MIME 타입과 UTF-8 인코딩이 결합된 `.doc` 바이너리로 변환하여 로컬 다운로드합니다. 이 파일은 구글 드라이브(Google Docs)나 MS Word에서 100% 서식 보존 상태로 즉시 열리고 자유롭게 편집 가능합니다.

---

## 5. 클로드 코드(Claude Code) 작업 시 주의사항 및 가이드

1. **파일 무결성 보존**:
   - `코스텝_원페이지_경영진단_자동화시스템.html`을 수정할 때 스크립트 기반 문자열 치환(`replace`)을 사용할 경우, 시작 태그(`<div ...>`)나 선언문(`<!DOCTYPE html>`)이 잘려 나가지 않도록 반드시 전체 파일 시작/끝 태그 및 크기(약 230~250KB)를 확인하십시오.
2. **이모지 및 외부 명칭 삽입 금지**:
   - 신규 기능이나 텍스트를 추가할 때 유치한 이모지나 `기업마당 공식공고`, `10대`, `원칙` 등의 단어를 다시 작성하지 않도록 주의하십시오.
3. **연도 표기 통일**:
   - 재무제표 관련 헤더는 반드시 **`Y-3` / `Y-2` / `Y-1`** 표기를 유지하십시오.
4. **로컬 스토리지 안전장치**:
   - 브라우저 환경이 아닌 Node.js 등 서버/CLI 가상 환경에서 파싱할 때 `localStorage` 미정의 오류가 발생하지 않도록 `safeStorage` 래퍼 객체를 통해 접근해야 합니다.

---

## 6. 테스트 및 검증 절차

클로드 코드로 수정 작업을 수행한 후에는 반드시 다음 3단계 검증을 실행하십시오:

```bash
# 1. 자바스크립트 문법 검사 및 가상 DOM 시뮬레이션
node -e "
const fs = require('fs');
const html = fs.readFileSync('코스텝_원페이지_경영진단_자동화시스템.html', 'utf8');
const vm = require('vm');
const scriptContent = html.substring(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const mockDOM = {
  window: {},
  document: {
    getElementById: () => ({ value: '', innerText: '', innerHTML: '', classList: { add: ()=>{}, remove: ()=>{} }, setAttribute: ()=>{}, addEventListener: ()=>{} }),
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener: () => {}
  },
  console: console
};
mockDOM.window = mockDOM;
vm.createContext(mockDOM);
vm.runInContext(scriptContent, mockDOM);
console.log('Script Syntax Check: PASS');
mockDOM.setBizTrack('small');
mockDOM.setIndustryTrack('it');
mockDOM.autoGenerateBusinessPlan();
mockDOM.renderActiveReport();
console.log('Full Execution Simulation: PASS');
"

# 2. 금지 단어 및 이모지 잔존 검사
node -e "
const fs = require('fs');
const html = fs.readFileSync('코스텝_원페이지_경영진단_자동화시스템.html', 'utf8');
const banned = ['10대', '원칙', '기업마당', 'BEP', 'TYPE html>'];
banned.forEach(w => console.log(w + ' count:', html.split(w).length - 1));
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
console.log('Has Emoji:', emojiRegex.test(html));
"

# 3. ZIP 패키징
python3 -c "
import zipfile
with zipfile.ZipFile('코스텝_원페이지_경영진단_자동화시스템_정밀반영_공고개편본.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    z.write('코스텝_원페이지_경영진단_자동화시스템.html', arcname='코스텝_원페이지_경영진단_자동화시스템.html')
print('Packaging Complete!')
"
```
