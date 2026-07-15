---
name: search-strategy
description: "검색 전략을 결정합니다. 로컬 문서 검색, 웹 검색, 파일 분석 중 최적의 방법을 선택할 때 적용됩니다."
---

# 검색 전략 결정 규칙

사용자 질문에 따라 최적의 검색 방법을 선택합니다.

## 판단 플로우

```
질문 분석
  │
  ├─ 업로드 문서 관련? ─── Yes → search_documents (rag-search 에이전트)
  │                         │
  │                         └─ 결과 부족? → 키워드 변경 후 재검색
  │                                          │
  │                                          └─ 여전히 부족? → WebSearch 보충
  │
  ├─ "최신", "요즘", "현재" 포함? ─── Yes → WebSearch (web-research 에이전트)
  │
  ├─ 파일 경로/코드 언급? ─── Yes → Read/Glob/Grep (file-analyst 에이전트)
  │
  └─ 일반 대화/지식 질문? ─── Yes → 도구 없이 직접 답변
```

## search_documents 활용법

- **기본 검색**: 핵심 키워드 2-3개로 검색
- **재검색**: 동의어, 관련 용어로 변경 (예: "매출" → "수익", "revenue")
- **넓은 검색**: top_k를 10으로 늘려서 재시도

## 복합 질문 처리

"이 문서의 내용과 최신 트렌드를 비교해줘" 같은 복합 질문:
1. search_documents로 문서 내용 확보
2. WebSearch로 최신 트렌드 검색
3. 두 결과를 종합하여 비교 답변

## 검색 모드
- `auto`: 시스템이 최적 모드 자동 선택 (기본값)
- `fts`: FTS5 BM25 키워드 검색만 사용
- `hybrid`: FTS5 + Vector 하이브리드 (Phase 2)
