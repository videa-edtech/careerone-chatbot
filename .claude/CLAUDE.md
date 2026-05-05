# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Mini-RAG: 로컬 AI 코워크 플랫폼

## 프로젝트 개요
다양한 포맷의 로컬 문서(PDF, DOCX, PPTX, XLSX, Markdown, 코드)를 인덱싱하여 RAG 기반 질의응답을 제공하는 로컬 AI 코워크 플랫폼입니다.

## 개발 명령어

```bash
# 서버 실행 (development — tsx watch)
npm run dev

# 프론트엔드 실행 (Vite dev server, port 5173)
npm run dev:client

# 통합 서버 실행 (production build + start on port 4001)
npm run build:start

# 단독 시작 (backend만, port 4001)
npm start

# 테스트
npm test              # vitest run (1회)
npm run test:watch    # vitest (watch mode)
```

## 환경 설정

```bash
cp .env.example .env
# Edit .env: ANTHROPIC_API_KEY required (from console.anthropic.com)
```

Python 라이브러리 필요 (문서 생성용):
```bash
pip install python-pptx openpyxl xlsxwriter python-docx reportlab Pillow
```

**前提:** Node.js 20+, Python 3.10+

## 아키텍처
- **Backend**: Node.js + Express + better-sqlite3 (SQLite FTS5)
- **Frontend**: React 18 + Tailwind CSS (Vite)
- **LLM**: Claude Haiku 4.5 via Agent SDK
- **검색**: FTS5 BM25 + sqlite-vec Vector → RRF 하이브리드
- **오케스트레이션**: Claude Agent SDK (11개 전문 에이전트 + Registry 기반 라우팅)

## 멀티 에이전트 아키텍처 (11개)

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
| `education-specialist` | 교육과정/커리큘럼/평가/인강/교재/AI교육/직무분석/미래일자리 | course-design, curriculum-builder, learning-assessment, career-pathway-analyzer, skills-gap-analyzer, future-job-recommender, 8개 교육 스킬 |
| `operations-support` | PM/법무/CS/번역/품질/영업 | project-management, legal-compliance, customer-service, customer-success, translation-guide, quality-management, compliance-audit, sales-outreach |

### 라우팅
- **Agent Registry** (`server/agents/registry.ts`): 에이전트 메타데이터 + 키워드 + 그룹 분류
- **Skill Router** (`server/agents/skill-router.ts`): 다국어 동의어 확장 → 키워드 매칭 → 상위 3개 에이전트 선택
- 오케스트레이터가 2단계 라우팅: ① 그룹 분류 → ② 그룹 내 에이전트 선택
- 복합 요청: 순서대로 여러 에이전트 위임 (분석 → 생성)

## 검색 아키텍처 (중요!)

### 사전 검색 파이프라인 (server/orchestrator/chat-handler.ts)
모든 질문에 대해 Agent SDK 호출 **전에** 서버 측에서 자동 검색:
1. 전체 메시지로 FTS5 BM25 검색
2. 키워드 추출 → 개별 키워드 검색 (조사/어미 제거)
3. 영문 메시지 → 한국어 동의어로 재검색
4. 검색 결과를 프롬프트에 주입 → LLM이 항상 검색 결과를 참고

### RRF 하이브리드 검색 (server/search/hybrid.ts)
- FTS5 BM25 + sqlite-vec Vector 결과를 Reciprocal Rank Fusion으로 합산
- 가중치: `weight_fts=1.5`, `weight_vec=1.0` (FTS5가 Korean에서 더 정확)
- `rrf_k=60`, 후보 집합: `topK * 4`

### 검색 모드
- `auto` → vectorEnabled이면 hybrid, 아니면 fts
- `fts` → FTS5 BM25 only
- `hybrid` → FTS5 + Vector RRF

## Skills 시스템 (76개)

Skills는 markdown 프레임워크로, 에이전트 프롬프트에 동적으로 임베딩됩니다.

| Category | Count | 대표 Skill |
|----------|-------|-----------|
| Writing | 15 | Pyramid/SCQA, AIDA, SPIN, StoryBrand, BLUF |
| Education | 14 | Course Design, Curriculum Builder, AI Education, Career Pathway Analyzer |
| Business | 11 | Competitor Analysis, Financial Report, Scenario Analysis |
| Operations | 8 | Project Management, Legal Compliance, Quality Management |
| Office | 8 | DOCX Official, PPTX Official, XLSX Official, PDF Official |
| System | 6 | Search Strategy, Source Attribution, Intent Tracking |
| Content | 4 | Content Strategy, Social Media, Campaign Planning |
| HR | 4 | HR Recruitment, Change Management, Org Design |
| PPT | 4 | Pitch Deck, Status Report, Training Slides |

**동적 로딩**: 모든 11개 에이전트의 Skills를 항상 로드하면 ~22K tokens. `skill-router.ts`로 상위 3개만 선택 시 ~5K tokens.

### 핵심 설계 결정
- **FTS5 > Vector for Korean** — all-MiniLM-L6-v2 is weak on Korean, so FTS5 gets higher weight (1.5 vs 1.0)
- **Server-side pre-search** — LLM sometimes skips calling search tools, so search results are always injected into the prompt
- **Excel as markdown tables** — headers are repeated in every chunk for row/column relationship searchability
- **Background vector embedding** — FTS5 indexed immediately for fast search, vectors generated async

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

### 외부 MCP 서버 (동적 시작)
| 서버 | 조건 | 용도 |
|------|------|------|
| `memory` | 프로파일링 키워드 감지 시 | 지식 그래프 영속 메모리 |
| `sequential-thinking` | 분석/비교/전략 키워드 시 | 단계별 추론 |
| `fetch` | web-research 또는 URL 언급 시 | URL→Markdown 변환 |

### SSE Events (`/api/chat`)
```
event: token   → {text: "partial response..."}
event: status  → {text: "문서 검색...", tool: "mcp__rag__search_documents"}
event: sources → {chunks: [...], session_id: "..."}
event: done    → {session_id: "..."}
event: error   → {error: "message"}
```

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
│   ├── agents/          — 11개 에이전트 정의 + registry + skill-loader + skill-router
│   ├── orchestrator/    — Agent SDK query() 핸들러 + 사전 검색
│   ├── mcp/             — Custom MCP Server (rag 도구)
│   ├── db/              — SQLite 연결 + 스키마 (FTS5 + sqlite-vec)
│   ├── ingestion/        — 문서 파싱, 청킹, 인덱싱
│   ├── search/          — FTS5, Vector, RRF hybrid
│   ├── memory/          — 대화/의도/작업 기록/세션
│   ├── llm/             — Claude API + 임베딩 (all-MiniLM-L6-v2)
│   ├── tasks/           — DOCX/PPTX/XLSX 생성 (python-pptx, openpyxl 등)
│   └── routes/          — Express 라우트
├── client/              — React 18 + Tailwind + Vite
├── .claude/skills/      — 76개 SKILL.md
├── data/                — SQLite DB + 생성 파일 (gitignored)
└── docs/                — 검색 대상 문서 (자동 인덱싱)
```
