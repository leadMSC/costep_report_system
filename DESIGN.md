---
name: MSC report
description: 컨설턴트가 공문서를 쓰는 작업대 — 경영진단 서식 생성기
colors:
  paper: "#F6F5F1"
  surface: "#FFFFFF"
  surface-2: "#FBFAF7"
  surface-3: "#F1EFE9"
  line: "#E4E2DB"
  line-2: "#D6D3CA"
  field-line: "#C9CED8"
  ink: "#0A0B0F"
  ink-2: "#33363D"
  ink-3: "#66635C"
  navy: "#0A1F44"
  navy-text-2: "#A9B6D3"
  teal: "#00A898"
  teal-deep: "#0F766E"
  teal-bright: "#00E0C6"
  teal-soft: "rgba(0,168,152,.08)"
  gold: "#E0A100"
  gold-text: "#8A6200"
  gold-soft: "rgba(255,195,0,.14)"
  red-text: "#A32D2D"
  red-soft: "#FCEBEB"
  blue-text: "#0A1F44"
  blue-soft: "#EEF1F7"
  toast: "rgba(15,23,42,.88)"
typography:
  body:
    fontFamily: "'Noto Sans KR', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.55
  label:
    fontFamily: "'Noto Sans KR', sans-serif"
    fontSize: "12px"
    fontWeight: 400
  section-title:
    fontFamily: "'Noto Sans KR', sans-serif"
    fontSize: "14px"
    fontWeight: 800
  sub-title:
    fontFamily: "'Noto Sans KR', sans-serif"
    fontSize: "12.5px"
    fontWeight: 800
  meta:
    fontFamily: "'Noto Sans KR', sans-serif"
    fontSize: "11px"
    fontWeight: 600
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  card: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "20px 24px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 12px"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    height: "24px"
    padding: "3px 10px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "30px"
  button-add:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.teal-deep}"
    rounded: "{rounded.md}"
    height: "28px"
  toast:
    backgroundColor: "{colors.toast}"
    textColor: "{colors.surface}"
    rounded: "{rounded.pill}"
    height: "48px"
  step-rail:
    backgroundColor: "{colors.navy}"
    textColor: "{colors.surface}"
---

# Design System: MSC report

## Overview
**북극성: 공문서를 쓰는 작업대.** 종이색 책상 위에 흰 서류철(카드)이 놓이고, 왼쪽에는 남색 단계 막대, 오른쪽에는 실제로 나갈 A4 서식이 늘 보인다. 화면은 출력물과 같은 결을 가진다: 검정 글자, 머리카락 같은 선, 청록은 "다 됐다·여기를 누르라"는 신호로만 아껴 쓴다. 꾸밈보다 정확함, 화려함보다 빨리 읽히는 것.

테마는 두 가지: 기본 `paper`(종이), 선택 `ink`(어두운 화면). 모든 색은 `--t-*` 변수로 두 테마를 함께 정의한다.

하지 않는 것: 배경 그라데이션, 장식용 유리 효과, 카드 한쪽만 굵은 색 띠, 이모지 아이콘, 카드 속 카드.

## Colors
- **종이(paper #F6F5F1)** 바탕 위 **흰 면(surface)** 카드. 구분은 그림자보다 선(line #E4E2DB / line-2 #D6D3CA).
- **잉크(ink #0A0B0F)**: 글자와 주 버튼·선택된 칩. 주 행동은 검정 면에 흰 글자.
- **남색(navy #0A1F44)**: 왼쪽 단계 막대(앱 틀). 화면에서 가장 넓은 색 면.
- **청록(teal #00A898 / 진한 #0F766E / 밝은 #00E0C6)**: 완료·진행률·추가 단추·초점. 면적 작게.
- **상태색**: 금(gold-text #8A6200 on gold-soft) = 주의·빈칸 안내, 빨강(red-text #A32D2D on red-soft) = 오류·반려, 남색 글자 on blue-soft = 정보.
- 회색 글자는 ink-2(보조), ink-3(설명·자리표시) 두 단계만.

## Typography
- 글꼴은 Noto Sans KR 하나. 숫자는 `font-variant-numeric: tabular-nums`.
- 위계는 크기보다 **굵기**로: 구역 제목 14px/800, 소제목 12.5px/800, 입력 글 13px/500, 칸 이름 12px/400, 보조 11px/600.
- 칸 이름은 짧게(예: "상호 (법인명)"), 설명은 칸 아래 11~12px ink-3.

## Layout
- 3단: 왼쪽 단계 막대(접기 가능) · 가운데 입력(약 500px, 세로 스크롤) · 오른쪽 A4 미리보기.
- 입력은 흰 카드 묶음(제목 앞 검정 점 ●). 카드 안 칸은 2열 격자, 좁으면 1열.
- 긴 묶음은 접는 구역(`cust-sec`): 위 선 1px, 제목 + 채움 요약(예: "2/6", 다 채우면 청록) + 꺾쇠.
- 아래 고정 띠: 자동 저장 상태 · 입력 기록 · 새로 쓰기 · 저장(검정).

## Elevation & Depth
대부분 평평하다. 카드는 `shadow-xs` 수준. 떠 있는 것(달력·메뉴·토스트·모달)만 부드러운 그림자: 짧은 그림자 + 크게 번지는 그림자 두 겹.

## Shapes
카드 16px, 입력·버튼 8px, 작은 단추 6~10px, 칩·토스트는 둥근 알약(9999px). 안쪽 모양은 바깥 반경에서 간격만큼 뺀다.

## Components
### Buttons
주 버튼 = 검정 면·흰 글자 12px/700, 8px 반경. 보조 = 글자만(ink-3), 위에 올리면 흐린 면. 추가 = 흰 면·점선 테두리·청록 글자("+ 항목 추가").
### Chips
선택지 = 흰 알약·회색 테두리 12px/600, 고르면 검정 면·흰 글자. 예시 칩은 작게(24px).
### Cards / Containers
흰 면, 16px 반경, 선 1px, 안쪽 20~24px. 제목 줄: ● + 14px/800.
### Inputs / Fields
높이 36px, 테두리 #C9CED8, 8px 반경, 초점 때 청록 테두리 + 옅은 청록 3px 링.
### Navigation
왼쪽 남색 막대: 번호 동그라미 + 단계 이름 + 채움 수(예: 4/7, 다 차면 청록) + 아래 가는 채움 막대.
### Toast
화면 아래 가운데 어두운 알약, 12.5px/800 흰 글자, 되돌리기 단추(청록 글자), × 닫기.

## Do's and Don'ts
### Do:
- 고객 서식(A4)은 이 화면 규칙보다 출력 규칙(A4 1장, PDF 점검)이 우선.
- 상태는 색 + 글자로 함께 (색만으로 뜻을 전하지 않는다).
- 새 기능도 같은 카드·칩·입력 모양을 그대로 쓴다.
### Don't:
- 배경 그라데이션, 장식 유리, 한쪽 굵은 색 띠, 이모지 아이콘.
- 청록을 넓은 면에 칠하기.
- 새 글꼴이나 새 강조색 추가.
