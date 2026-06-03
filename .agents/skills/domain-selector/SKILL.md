---
name: domain-selector
description: "사용자 요청의 업무 도메인을 판단하여 최적의 에이전트를 선택합니다. 오케스트레이터가 라우팅 시 참고합니다."
---

# 업무 도메인 → 에이전트 라우팅 가이드

## 에이전트 선택 플로우

```
요청 분석
  │
  ├── 문서 관련 질문 → rag-search
  ├── 최신/외부 정보 → web-research
  ├── 파일 분석 → file-analyst
  ├── 의도/기억 → memory
  │
  ├── 문서 작성 요청 ──┐
  │   ├── 보고서/제안서  │
  │   ├── 이메일/공지    │→ doc-writer
  │   ├── 회의록        │
  │   ├── 블로그/에세이  │
  │   └── 학술/기술문서  ┘
  │
  ├── PPT 요청 → presentation-maker
  │   ├── 피치덱/IR
  │   ├── 상태 보고
  │   ├── 교육 자료
  │   └── 크리에이티브
  │
  ├── 엑셀 요청 → spreadsheet-maker
  │   ├── 대시보드
  │   ├── 데이터 테이블
  │   └── 재무 모델
  │
  ├── 비즈니스 분석 ──┐
  │   ├── 경쟁사/시장    │
  │   ├── SWOT/전략      │→ business-analyst
  │   ├── 재무 분석      │
  │   ├── 경영진/이사회  │
  │   ├── 시나리오       │
  │   ├── 제품 기획      │
  │   ├── 로드맵        │
  │   └── 매출 분석     ┘
  │
  ├── HR/HRD ──────────┐
  │   ├── 채용/JD/면접   │→ hr-specialist
  │   ├── 교육/온보딩    │
  │   ├── 조직 설계      │
  │   └── 변화관리      ┘
  │
  ├── 교육 ──────────────┐
  │   ├── 교육과정/커리큘럼│
  │   ├── 인강/스크립트   │→ education-specialist
  │   ├── 교재/도서 기획  │
  │   ├── 평가/시험/퀴즈  │
  │   ├── AI 교육/AIED   │
  │   └── 교육 사업 기획  ┘
  │
  ├── 운영/지원 ────────┐
  │   ├── PM/WBS/리스크  │
  │   ├── 법무/계약      │→ operations-support
  │   ├── 고객서비스/FAQ │
  │   ├── 번역/다국어   │
  │   ├── 품질/감사     │
  │   └── 영업 지원     ┘
  │
  └── 일반 대화 → 오케스트레이터 직접 답변
```

## 키워드 → 에이전트 매핑

| 키워드 | 에이전트 |
|--------|---------|
| 보고서, 제안서, 이메일, 회의록, 블로그, 에세이, 논문, 기술문서 | doc-writer |
| PPT, 발표, 슬라이드, 피치덱, 교육자료 | presentation-maker |
| 엑셀, 표, 대시보드, 데이터, 스프레드시트 | spreadsheet-maker |
| 경쟁사, SWOT, 시장분석, 전략, 사업계획, OKR | business-analyst |
| 재무, 예산, 손익, 매출, MRR, ARR, 투자 | business-analyst |
| 경영진, CEO, 이사회, IR, 시나리오, 워게임 | business-analyst |
| 제품기획, PRD, 로드맵, 백로그 | business-analyst |
| 채용, JD, 면접, 평가표, 온보딩 | hr-specialist |
| 조직설계, R&R, 변화관리, ADKAR | hr-specialist |
| 교육과정, 커리큘럼, 학습목표, ADDIE, 차시 | education-specialist |
| 인강, 강의 스크립트, 스토리보드, 교안 | education-specialist |
| 교재, 도서, 목차, 원고, 출판 | education-specialist |
| 시험, 퀴즈, 문항, 루브릭, 평가 설계 | education-specialist |
| AI 교육, AIED, 적응형, AI 튜터, LMS | education-specialist |
| 교육 사업, 수강생, 완료율, 교육 ROI | education-specialist |
| 프로젝트, WBS, 스프린트, 리스크, 간트 | operations-support |
| 계약서, NDA, 컴플라이언스, 감사, 품질, ISO | operations-support |
| FAQ, 고객응대, CS, 에스컬레이션 | operations-support |
| 번역, 영어로, 한국어로, 다국어, 현지화 | operations-support |
| 영업, 세일즈, 콜드메일, 제안 | operations-support |
| 캠페인, 마케팅전략, SNS, A/B테스트, CRO | doc-writer (카피) + business-analyst (전략) |
| 콘텐츠 전략, 콘텐츠 캘린더, 소셜미디어 | doc-writer |

## 복합 요청 처리

| 요청 예시 | 에이전트 조합 |
|-----------|-------------|
| "경쟁사 분석 보고서를 PPT로" | business-analyst → presentation-maker |
| "채용공고 + 면접질문 엑셀" | hr-specialist → spreadsheet-maker |
| "재무 데이터 분석 후 대시보드" | business-analyst → spreadsheet-maker |
| "영업 제안서 번역" | operations-support (영업+번역) |
| "프로젝트 상태 보고 이메일" | operations-support (PM) → doc-writer (이메일) |
| "시장분석 보고서" | business-analyst → doc-writer |
| "제품 로드맵 PPT" | business-analyst → presentation-maker |
| "이사회 보고 자료" | business-analyst → presentation-maker |
| "AI 교육과정 설계" | education-specialist |
| "인강 스크립트 + PPT" | education-specialist → presentation-maker |
| "교재 목차 + 원고 가이드" | education-specialist → doc-writer |
| "교육 사업 기획서" | education-specialist → doc-writer |
| "수강생 분석 대시보드" | education-specialist → spreadsheet-maker |
