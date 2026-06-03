# Mini-RAG: 로컬 AI 코워크 플랫폼

## 프로젝트 개요
다양한 포맷의 로컬 문서(PDF, DOCX, PPTX, XLSX, Markdown, 코드)를 인덱싱하여 RAG 기반 질의응답을 제공하는 로컬 AI 코워크 플랫폼입니다.

## 아키텍처
- **Backend**: Node.js + Express + better-sqlite3 (SQLite FTS5)
- **Frontend**: React 18 + Tailwind CSS (Vite)
- **LLM**: Codex Haiku 4.5 via Agent SDK
- **검색**: FTS5 BM25 + sqlite-vec Vector → RRF 하이브리드
- **오케스트레이션**: Codex Agent SDK (10개 전문 에이전트 + Registry 기반 라우팅)

## 멀티 에이전트 아키텍처 (10개)

### 정보 에이전트
| 에이전트 | 역할 | Skills | 도구 |
|----------|------|--------|------|
| `rag-search` | 문서 검색 + 답변 | source-attribution, search-strategy | MCP rag (search, status, list) |
| `web-research` | 웹 최신 정보 수집 | source-attribution | WebSearch, WebFetch, fetch |
| `file-analyst` | 로컬 파일 분석 | — | Read, Glob, Grep |
| `memory` | 의도/기억 관리 | intent-tracking | MCP rag (intent, journal), MCP memory |

### 파일 생성 에이전트
| 에이전트 | 역할 | Skills | 산출물 |
|----------|------|--------|--------|
| `doc-writer` | 보고서, 이메일, 회의록, 블로그 등 | docx-official, pdf-official, writing-selector, 15개 글쓰기 프레임워크 | DOCX, PDF |
| `presentation-maker` | 피치덱, 보고 PPT, 교육 자료 | pptx-official, ppt-selector, ppt-design-rules, 4개 PPT 프레임워크 | PPTX |
| `spreadsheet-maker` | 대시보드, 데이터 테이블 | xlsx-official, excel-selector, excel-design-rules, 2개 엑셀 프레임워크 | XLSX |

### 도메인 전문 에이전트
| 에이전트 | 역할 | Skills |
|----------|------|--------|
| `business-analyst` | 전략/재무/경쟁사/시장/경영진/시나리오/제품/로드맵 | competitor-analysis, strategic-planning, financial-report, data-analysis, executive-briefing, board-report, scenario-analysis, product-planning, roadmap-builder, revenue-analysis |
| `hr-specialist` | 채용/교육/평가/온보딩/조직/변화관리 | hr-recruitment, hrd-training, change-management, org-design |
| `operations-support` | PM/법무/CS/번역/품질/영업 | project-management, legal-compliance, customer-service, customer-success, translation-guide, quality-management, compliance-audit, sales-outreach |

### 라우팅
- **Agent Registry** (`server/agents/registry.ts`): 에이전트 메타데이터 + 키워드 + 그룹 분류
- 오케스트레이터가 2단계 라우팅: ① 그룹 분류 → ② 그룹 내 에이전트 선택
- 복합 요청: 순서대로 여러 에이전트 위임 (분석 → 생성)

## 사용 가능한 도구

### Custom MCP "rag" 도구
| 도구 | 설명 |
|------|------|
| `search_documents` | 인덱싱된 문서에서 FTS5 BM25 검색 |
| `get_document_status` | 인덱스 통계 |
| `list_documents` | 인덱싱된 문서 목록 |
| `delete_document` | 문서 삭제 |
| `save_user_intent` | 사용자 의도 저장 |
| `get_user_intents` | 의도 목록 조회 |
| `log_task_execution` | 작업 기록 |
| `get_conversation_history` | 대화 목록 조회 |
| `save_work_journal` | 작업 학습 기록 |
| `query_work_journal` | 이전 작업 기록 조회 |
| `add_feedback_to_journal` | 사용자 피드백 기록 |

### 외부 MCP 서버 도구
| 서버 | 용도 |
|------|------|
| `memory` | 지식 그래프 영속 메모리 (엔티티/관계) |
| `sequential-thinking` | 단계별 추론 (복합 분석) |
| `fetch` | URL→Markdown 변환 |

## 핵심 규칙
1. 문서 검색 결과에 없는 내용은 절대 지어내지 마세요
2. 답변 시 반드시 출처를 표시하세요: [파일명], [파일명 p.N], [제목](URL)
3. 한국어로 답변하세요 (질문이 영어면 영어로)
4. 사용자가 목표/의도를 표현하면 memory 에이전트에 위임
5. 중요한 사실은 mcp__memory에 엔티티로 저장
6. 복잡한 질문은 sequential-thinking으로 단계별 사고
7. **파일 생성은 해당 전문 에이전트에게 위임** — Skills 프레임워크 자동 적용
8. **작업 완료 후 work journal 기록** — 이전 경험을 학습하여 반복 작업 개선

## 디렉토리 구조
```
mini-rag/
├── server/              — Express + Agent SDK 백엔드
│   ├── agents/          — 10개 에이전트 정의 + registry + skill-loader
│   ├── orchestrator/    — Agent SDK query() 핸들러
│   ├── mcp/             — Custom MCP Server (rag 도구)
│   ├── db/              — SQLite 연결 + 스키마
│   ├── ingestion/       — 문서 파싱, 청킹, 인덱싱
│   ├── search/          — FTS5 + Vector 하이브리드 검색
│   ├── memory/          — 대화/의도/작업 기록
│   ├── llm/             — Codex API + 프롬프트
│   └── routes/          — Express 라우트
├── client/              — React 프론트엔드
├── .Codex/skills/      — 63개 SKILL.md (에이전트 프롬프트에 임베딩)
├── data/                — SQLite DB + 메모리 파일
└── docs/                — 검색 대상 문서
```
