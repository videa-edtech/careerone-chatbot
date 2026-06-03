---
name: writing-selector
description: "글쓰기/문서 생성 요청 시 최적의 프레임워크를 자동 선택합니다. 모든 문서 작성, 글쓰기, 보고서, 이메일 요청의 첫 단계로 적용됩니다."
---

# 글쓰기 프레임워크 선택 가이드

문서 생성 요청을 받으면 **먼저 이 가이드로 적절한 프레임워크를 선택**한 뒤, 해당 프레임워크의 Skill을 따라 작성합니다.

## 선택 플로우

```
요청 분석
  │
  ├─── 📊 비즈니스 ────────────────────────────────
  │ ├─ 보고서/분석? → pyramid-scqa
  │ ├─ 제안서/기획서? → problem-solution-benefit
  │ ├─ 설득 필요/B2B? → spin-framework
  │ ├─ 신규 제품? → amazon-prfaq
  │ ├─ 이메일/짧은 메모? → bluf-writing
  │ ├─ 요약/브리핑? → executive-summary
  │ └─ 사례/성과 보고? → star-framework
  │
  ├─── 🎓 학술/연구 ────────────────────────────────
  │ └─ 논문/연구/실험? → imrad-academic
  │
  ├─── 📝 기술 ─────────────────────────────────────
  │ └─ 기술 문서/사양서/매뉴얼? → technical-document
  │
  ├─── 📢 마케팅/카피 ──────────────────────────────
  │ ├─ 광고/랜딩페이지/세일즈? → aida-marketing
  │ ├─ 짧은 광고/SNS/이메일? → pas-copywriting
  │ └─ 브랜드 메시징/웹사이트? → storybrand
  │
  ├─── 📖 창작/스토리 ──────────────────────────────
  │ └─ 소설/시나리오/브랜드 스토리? → three-act-story
  │
  ├─── 🌐 블로그/SEO ───────────────────────────────
  │ └─ 블로그/가이드/콘텐츠? → blog-seo
  │
  ├─── ✏️ 에세이/개인 글 ───────────────────────────
  │ └─ 에세이/칼럼/수필/자소서? → narrative-essay
  │
  ├─── 📊 PPT? → ppt-selector로 이동
  ├─── 📈 엑셀? → excel-selector로 이동
  │
  └─── ❓ 불분명? → 사용자에게 유형과 목적 확인
```

## 키워드 매칭 테이블

| 사용자 키워드 | 선택 Skill | 카테고리 |
|-------------|-----------|---------|
| 보고서, 분석, 리포트, 전략 | `pyramid-scqa` | 비즈니스 |
| 제안서, 기획서, 계획서, 예산 | `problem-solution-benefit` | 비즈니스 |
| 설득, 영업, 컨설팅, B2B | `spin-framework` | 비즈니스 |
| 신규 제품, 새 기능, 런칭, 혁신 | `amazon-prfaq` | 비즈니스 |
| 이메일, 메모, 상태, 업데이트 | `bluf-writing` | 비즈니스 |
| 요약, 브리핑, 핵심, 경영진 | `executive-summary` | 비즈니스 |
| 사례, 성과, 프로젝트 보고 | `star-framework` | 비즈니스 |
| 논문, 연구, 학술, 실험, 분석 | `imrad-academic` | 학술 |
| 기술 문서, 사양서, 매뉴얼, API | `technical-document` | 기술 |
| 광고, 마케팅, 랜딩페이지, 판매 | `aida-marketing` | 마케팅 |
| SNS, 짧은 카피, 이메일 마케팅 | `pas-copywriting` | 마케팅 |
| 브랜드, 웹사이트 카피, 피치 | `storybrand` | 마케팅 |
| 이야기, 소설, 시나리오, 내러티브 | `three-act-story` | 창작 |
| 블로그, SEO, 포스트, 가이드 | `blog-seo` | 콘텐츠 |
| 에세이, 칼럼, 수필, 자소서, 감상 | `narrative-essay` | 에세이 |
| PPT, 발표, 슬라이드 | → `ppt-selector` | PPT |
| 엑셀, 표, 데이터 | → `excel-selector` | 엑셀 |

## 복합 문서 처리

| 상황 | 조합 |
|------|------|
| 보고서 + 요약 | `pyramid-scqa` + `executive-summary` |
| 연구 + 발표 | `imrad-academic` + PPT(`training-slides`) |
| 마케팅 + 스토리 | `aida-marketing` + `three-act-story` |
| 제안서 + PPT + 엑셀 | `spin-framework` + `pitch-deck` + `excel-dashboard` |
| 블로그 + SEO | `blog-seo` (이미 SEO 포함) |

## 모든 프레임워크에 공통된 메타 원칙

1. **결론 먼저** — 첫 문단에서 핵심을 말하라 (비즈니스/학술) 또는 훅으로 시작 (창작/마케팅)
2. **하나의 메시지** — 문서당 하나의 핵심 메시지
3. **독자 인식** — 쓰기 전에 "누가 읽는가? 무엇을 해야 하는가?" 명확히
4. **수치화** — "증가" → "12% 증가 ($4.2M)"
5. **구체성** — 모든 모호한 단어를 구체적으로 교체
6. **스캐너용 서식** — 헤더, 볼드, 불릿 (비즈니스/기술) / 장면과 대화 (창작)
