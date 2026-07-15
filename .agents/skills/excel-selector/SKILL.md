---
name: excel-selector
description: "엑셀 생성 요청 시 최적의 프레임워크를 자동 선택합니다. 모든 엑셀 생성의 첫 단계로 적용됩니다."
---

# 엑셀 프레임워크 선택 가이드

엑셀 생성 요청을 받으면 **먼저 유형을 판단**합니다. `excel-design-rules`는 항상 함께 적용합니다.

## 선택 플로우

```
엑셀 요청
  │
  ├─ KPI / 대시보드 / 실적 요약 / 경영 보고?
  │   └→ excel-dashboard (Cole Nussbaumer + IBCS)
  │
  ├─ 목록 / 명단 / 재고 / 일정 / 데이터 정리?
  │   └→ excel-data-table (Tufte Data-Ink)
  │
  └─ 기타 / 단순 표?
      └→ excel-design-rules 원칙만 적용
```

## 키워드 매칭

| 키워드 | Skill |
|--------|-------|
| KPI, 대시보드, 실적, 매출 보고, 월간 | `excel-dashboard` |
| 목록, 명단, 재고, 일정, 관리, 정리 | `excel-data-table` |
| 표, 간단한, 데이터, 계산 | `excel-design-rules` |
