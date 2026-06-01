# mini-rag-deepseek

> **로컬 AI 코워크 플랫폼** — RAG + 11개 전문 에이전트 + DeepSeek V4 Flash

[English](README.md) | 한국어

PDF, DOCX, PPTX, XLSX, Markdown, 코드 파일을 업로드하면 DeepSeek V4 Flash 기반으로 채팅, 검색, 전문 문서 생성까지 한 번에 처리하는 완전 로컬 문서 인텔리전스 플랫폼입니다.

---

## ✨ 주요 기능

- **하이브리드 검색** — FTS5 BM25 + sqlite-vec 벡터 검색 + RRF 랭킹
- **11개 전문 에이전트** — RAG 검색, 웹 조사, 문서 작성, 프레젠테이션, 스프레드시트, 비즈니스 분석, HR, 운영 지원 등
- **파일 생성** — 채팅에서 바로 DOCX / PPTX / XLSX 생성, 인라인 다운로드 버튼 제공
- **SSE 스트리밍** — 실시간 토큰 스트리밍 + 도구 호출 상태 이벤트
- **완전 로컬 임베딩** — all-MiniLM-L6-v2 온디바이스 실행, 외부 임베딩 API 불필요
- **자동 요약** — 업로드 시 DeepSeek V4 Flash가 문서를 자동 요약하고 RAG에 인덱싱
- **세션 메모리** — 멀티턴 대화 기록, 의도 추적, 작업 일지

---

## 🏗️ 아키텍처

```
┌─────────────────────────────────────────────────┐
│           React 18 + Tailwind CSS (Vite)        │  ← localhost:5173
└──────────────────────┬──────────────────────────┘
                       │ SSE / REST API
┌──────────────────────▼──────────────────────────┐
│           Express + LangGraph 오케스트레이터     │  ← localhost:4001
│  ┌─────────────────────────────────────────────┐ │
│  │     createReactAgent (오케스트레이터)        │ │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │ │
│  │  │rag-search│ │doc-writer│ │biz-analyst  │ │ │
│  │  └──────────┘ └──────────┘ └─────────────┘ │ │
│  │          + 8개 전문 에이전트                │ │
│  └─────────────────────────────────────────────┘ │
│  ┌──────────────────┐  ┌───────────────────────┐ │
│  │  SQLite FTS5     │  │  sqlite-vec (384차원) │ │
│  │  BM25 전문 검색  │  │  all-MiniLM-L6-v2    │ │
│  └──────────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 🤖 에이전트 (11개)

| 에이전트 | 역할 | 산출물 |
|----------|------|--------|
| `rag-search` | 문서 검색 + 출처 표시 답변 | 텍스트 |
| `web-research` | 실시간 웹 검색 및 페이지 수집 | 텍스트 |
| `file-analyst` | 로컬 파일 읽기 및 분석 | 텍스트 |
| `memory` | 의도 추적, 작업 일지, 지식 그래프 | — |
| `doc-writer` | 보고서, 이메일, 회의록, 블로그 | **DOCX** |
| `presentation-maker` | 피치덱, 보고 PPT, 교육 자료 | **PPTX** |
| `spreadsheet-maker` | 대시보드, 데이터 테이블, 재무 모델 | **XLSX** |
| `business-analyst` | 전략/재무/경쟁사/시나리오 분석 | DOCX/텍스트 |
| `hr-specialist` | 채용/교육/조직설계/변화관리 | DOCX/텍스트 |
| `operations-support` | PM/법무/CS/번역/품질관리 | DOCX/텍스트 |
| `code-assistant` | 코드 리뷰, 디버깅, 문서화 | 텍스트 |

---

## 🚀 빠른 시작

### 사전 요구사항

- Node.js 18+
- Python 3.9+ (문서 파싱)
- DeepSeek API 키 → [platform.deepseek.com](https://platform.deepseek.com)

### 설치

```bash
git clone https://github.com/raondaon-kim/mini-rag-deepseek.git
cd mini-rag-deepseek

# 서버 의존성
npm install

# 클라이언트 의존성
cd client && npm install && cd ..

# Python 문서 라이브러리
pip install python-docx python-pptx openpyxl pymupdf
```

### 환경 설정

```bash
cp .env.example .env
# .env 파일을 열어 DEEPSEEK_API_KEY 설정
```

```env
DEEPSEEK_API_KEY=sk-your-key-here
PORT=4001
DOCS_PATH=./docs
DATA_PATH=./data
DB_PATH=./data/rag.sqlite
```

### 실행

```bash
# 터미널 1 — 백엔드 (4001포트)
npm start

# 터미널 2 — 프론트엔드 (5173포트)
cd client && npm run dev
```

**http://localhost:5173** 접속 후 바로 사용 가능합니다.

`./docs/` 폴더에 문서를 넣으면 서버 시작 시 자동 인덱싱됩니다.

---

## 📁 프로젝트 구조

```
mini-rag-deepseek/
├── server/
│   ├── agents/          # 11개 에이전트 정의 + 레지스트리 + 스킬 로더
│   ├── orchestrator/    # LangGraph 채팅 핸들러 + SSE 스트리밍
│   ├── mcp/             # LangChain DynamicStructuredTool (RAG + 파일 생성 도구)
│   ├── tasks/           # create-docx / create-pptx / create-excel
│   ├── search/          # FTS5 + sqlite-vec 하이브리드 검색 + RRF
│   ├── ingestion/       # 문서 파싱, 청킹, 중복 제거, 인덱싱
│   ├── memory/          # 대화, 요약, 의도, 작업 일지
│   └── llm/             # DeepSeek 클라이언트 + 로컬 임베더
├── client/
│   └── src/             # React 18 컴포넌트 + SSE 훅
├── .claude/skills/      # 76개 스킬 프롬프트 파일 (에이전트 지식 베이스)
├── docs/                # 자동 인덱싱할 문서를 여기에 넣으세요
└── data/                # SQLite DB + 생성된 파일 출력
```

---

## ⚙️ 핵심 기술 결정

| 항목 | 선택 | 이유 |
|------|------|------|
| LLM | DeepSeek V4 Flash | 빠르고, 비용 효율적이며, OpenAI 호환 API |
| Thinking 모드 | **비활성화** (`thinking: { type: "disabled" }`) | 기본 활성화 상태에서는 tool calling 불가 |
| 에이전트 프레임워크 | LangGraph `createReactAgent` + `streamEvents("v2")` | Anthropic Agent SDK 마이그레이션 대체 |
| 파일 생성 패턴 | **원샷** (LLM → tool_call 추출 → 직접 실행, 루프 없음) | `tool_choice: "any"` 무한 재귀 방지 |
| 임베딩 | all-MiniLM-L6-v2 (`@xenova/transformers`) | 완전 로컬, OpenAI 키 불필요 |
| 검색 | SQLite FTS5 + sqlite-vec, RRF 융합 | 외부 인프라 의존성 없음 |
| 파일 생성 라이브러리 | `docx` / `pptxgenjs` / `exceljs` | 순수 Node.js, LibreOffice/Office 불필요 |

---

## ⚠️ DeepSeek V4 Flash 필수 주의사항

DeepSeek V4 Flash는 **thinking 모드가 기본 활성화**되어 있습니다. Thinking 모드가 켜진 상태에서는 tool calling이 전혀 작동하지 않습니다. 반드시 명시적으로 비활성화하세요:

```typescript
// server/llm/deepseek.ts
modelKwargs: { thinking: { type: "disabled" } }
```

---

## 📊 스모크 테스트 결과

초기 마이그레이션에서 39개 항목 중 38개 통과. 전체 체크리스트(헬스, 스트리밍, 에이전트 도구 호출, 검색 모드, 파일 업로드/중복 제거, 요약 생성, 대화 기록, 에러 처리, E2E 파이프라인)는 [SMOKE_TEST.md](SMOKE_TEST.md)를 참고하세요.

---

## 📄 마이그레이션 노트

`@anthropic-ai/claude-agent-sdk` + Claude Haiku 4.5 → LangChain.js + LangGraph + DeepSeek V4 Flash 마이그레이션.
전체 기술 세부사항은 [MIGRATION_DEEPSEEK_V4.md](MIGRATION_DEEPSEEK_V4.md)를 참고하세요.

---

## 라이선스

MIT
