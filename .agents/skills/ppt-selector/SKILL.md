---
name: ppt-selector
description: "PPT 생성 요청 시 최적의 프레임워크를 자동 선택합니다. 모든 PPT/발표자료 생성의 첫 단계로 적용됩니다."
---

# PPT 프레임워크 선택 가이드

PPT 생성 요청을 받으면 **먼저 유형을 판단**한 뒤 적절한 Skill을 따릅니다. `ppt-design-rules`는 항상 함께 적용합니다.

## 선택 플로우

```
PPT 요청
  │
  ├─ 사업 제안 / 투자 / 스타트업?
  │   └→ pitch-deck (10-20-30 Rule)
  │
  ├─ 상태 보고 / 주간·월간 보고?
  │   └→ status-report-ppt (SCR + 신호등)
  │
  ├─ 교육 / 워크숍 / 세미나?
  │   └→ training-slides (Gagne + Assertion-Evidence)
  │
  ├─ 제품 런칭 / 키노트 / 스토리텔링 / 크리에이티브?
  │   └→ creative-presentation (Duarte Sparkline + Hero's Journey)
  │
  └─ 일반 발표 / 기타?
      └→ ppt-design-rules 원칙만 적용하여 자유 구성
```

## 키워드 매칭

| 키워드 | Skill |
|--------|-------|
| 피치, 투자, 사업 소개, IR | `pitch-deck` |
| 주간, 월간, 분기, 진행, 상태 | `status-report-ppt` |
| 교육, 강의, 워크숍, 세미나, 튜토리얼 | `training-slides` |
| 런칭, 키노트, 스토리, 영감, 크리에이티브, 제품 소개 | `creative-presentation` |
| 발표, 소개, 안내, 일반 | `ppt-design-rules` |
