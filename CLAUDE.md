# 리드디벨롭 작업 규칙

- 개발 대상은 `코스텝_경영진단_리드디벨롭.html` 하나. 원본 `../코스텝_원페이지_경영진단_자동화시스템.html`은 고치지 않는다.
- **모든 운영·의사결정·개선·수정·편집은 `작업로그.md`에 기록한다.** 형식과 규칙은 그 파일 상단 「기록 지침」을 따른다. 결함 한 건 = 항목 한 개, 로그와 코드는 같은 커밋.
- 수정 후 검증: `node tools/check.js` → 화면 시나리오 `tools/scenario-runner.html` → PDF 저장 `python tools/pdf_check.py` (로컬 서버 127.0.0.1:5180, 설정은 상위 폴더 `.claude/launch.json`). 결과 숫자를 로그 「검증」 줄에 적는다.
- 고객에게는 서식을 PDF로 저장해 보낸다. 출력물 판단은 PDF 기준.
- 커밋 끝에 `CHANGELOG.md` 요약, 계획 변화는 `DEVELOP_PLAN.md`.
- **진행 상황이 바뀌면(결함 고침·시나리오·로드맵 등) 원본 구글 시트를 먼저 고치고 대시보드를 즉시 갱신한다.** 절차는 `dashboard/갱신방법.md`. 매일 07:30 자동 갱신 예약(`costep-dashboard-refresh`)도 있다.
- 화면·서식·차트·애니메이션을 고칠 때는 전역 지침 「화면 디자인 스킬 적극 사용」대로 `impeccable`(Operate 모드) → `web-design-guidelines`·`break-ui` 점검을 쓴다. 단 A4 1장·PDF 점검·기존 색/글꼴 체계가 스킬 지시보다 우선.
