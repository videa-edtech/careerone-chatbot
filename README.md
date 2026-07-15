# mini-rag-deepseek

> **Local AI Cowork Platform** — RAG + 11 Specialized Agents + DeepSeek V4 Flash

[한국어](README.ko.md) | English

A fully local document intelligence platform. Upload PDFs, DOCX, PPTX, XLSX, Markdown, and code — then chat, search, and generate professional documents powered by DeepSeek V4 Flash.

---

## ✨ Features

- **Hybrid Search** — FTS5 BM25 + sqlite-vec vector search with RRF ranking
- **11 Specialized Agents** — RAG search, web research, document writing, presentation, spreadsheet, business analysis, HR, operations, and more
- **File Generation** — Create DOCX / PPTX / XLSX directly from chat, with inline download buttons
- **SSE Streaming** — Real-time token streaming with tool-call status events
- **100% Local Embeddings** — all-MiniLM-L6-v2 runs on-device, no external embedding API needed
- **Auto Summarization** — Documents summarized by DeepSeek V4 Flash on upload and indexed for RAG
- **Session Memory** — Multi-turn conversation history, intent tracking, work journal

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│           React 18 + Tailwind CSS (Vite)        │  ← localhost:5173
└──────────────────────┬──────────────────────────┘
                       │ SSE / REST API
┌──────────────────────▼──────────────────────────┐
│           Express + LangGraph Orchestrator       │  ← localhost:4001
│  ┌─────────────────────────────────────────────┐ │
│  │     createReactAgent (orchestrator)         │ │
│  │  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │ │
│  │  │rag-search│ │doc-writer│ │biz-analyst  │ │ │
│  │  └──────────┘ └──────────┘ └─────────────┘ │ │
│  │          + 8 more specialized agents        │ │
│  └─────────────────────────────────────────────┘ │
│  ┌──────────────────┐  ┌───────────────────────┐ │
│  │  SQLite FTS5     │  │  sqlite-vec (384-dim) │ │
│  │  BM25 full-text  │  │  all-MiniLM-L6-v2    │ │
│  └──────────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────┘
```

---

## 🤖 Agents (11)

| Agent | Role | Output |
|-------|------|--------|
| `rag-search` | Document search + answer with source attribution | Text |
| `web-research` | Real-time web search and page fetch | Text |
| `file-analyst` | Local file reading and analysis | Text |
| `memory` | Intent tracking, work journal, knowledge graph | — |
| `doc-writer` | Reports, emails, meeting notes, blog posts | **DOCX** |
| `presentation-maker` | Pitch decks, briefings, training slides | **PPTX** |
| `spreadsheet-maker` | Dashboards, data tables, financial models | **XLSX** |
| `business-analyst` | Strategy, finance, competitive/scenario analysis | DOCX/Text |
| `hr-specialist` | Recruitment, training, org design, change management | DOCX/Text |
| `operations-support` | PM, legal, CS, translation, quality management | DOCX/Text |
| `code-assistant` | Code review, debugging, documentation | Text |

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Python 3.9+ (for document parsing)
- DeepSeek API key → [platform.deepseek.com](https://platform.deepseek.com)

### Install

```bash
git clone https://github.com/raondaon-kim/mini-rag-deepseek.git
cd mini-rag-deepseek

# Server dependencies
npm install

# Client dependencies
cd client && npm install && cd ..

# Python document libraries
pip install python-docx python-pptx openpyxl pymupdf
```

### Configure

```bash
cp .env.example .env
```

```env
DEEPSEEK_API_KEY=sk-your-key-here
PORT=4001
DOCS_PATH=./docs
DATA_PATH=./data
DB_PATH=./data/rag.sqlite
```

### Run

```bash
# Terminal 1 — Backend (port 4001)
npm start

# Terminal 2 — Frontend (port 5173)
cd client && npm run dev
```

Open **http://localhost:5173** and start chatting.

Drop documents into `./docs/` — they are indexed automatically on startup and whenever new files appear.

---

## 📁 Project Structure

```
mini-rag-deepseek/
├── server/
│   ├── agents/          # 11 agent definitions + registry + skill loader
│   ├── orchestrator/    # LangGraph chat handler + SSE streaming
│   ├── mcp/             # LangChain DynamicStructuredTool wrappers (RAG + file tools)
│   ├── tasks/           # create-docx / create-pptx / create-excel
│   ├── search/          # FTS5 + sqlite-vec hybrid search + RRF
│   ├── ingestion/       # Document parsing, chunking, dedup, indexing
│   ├── memory/          # Conversation, summaries, intent, work journal
│   └── llm/             # DeepSeek client factory + local embedder
├── client/
│   └── src/             # React 18 components + SSE hooks
├── .claude/skills/      # 76 skill prompt files (agent knowledge base)
├── docs/                # Drop documents here for auto-indexing
└── data/                # SQLite DB + generated output files
```

---

## ⚙️ Key Technical Decisions

| Topic | Choice | Reason |
|-------|--------|--------|
| LLM | DeepSeek V4 Flash | Fast, cost-effective, OpenAI-compatible API |
| Thinking mode | **Disabled** (`thinking: { type: "disabled" }`) | Required — enabled by default, breaks tool calling |
| Agent framework | LangGraph `createReactAgent` + `streamEvents("v2")` | Replaces Anthropic Agent SDK after migration |
| File agent pattern | **One-shot** (LLM → tool_call → execute, no loop) | Prevents infinite recursion with `tool_choice: "any"` |
| Embeddings | all-MiniLM-L6-v2 via `@xenova/transformers` | Fully local, no OpenAI key required |
| Search | SQLite FTS5 + sqlite-vec, RRF fusion | Zero external infra dependency |
| File generation | `docx` / `pptxgenjs` / `exceljs` | Pure Node.js, no LibreOffice/Office needed |

---

## ⚠️ DeepSeek V4 Flash — Critical Note

DeepSeek V4 Flash enables **thinking mode by default**. This breaks tool calling. Always disable it explicitly:

```typescript
// server/llm/deepseek.ts
modelKwargs: { thinking: { type: "disabled" } }
```

---

## 📊 Smoke Test

38/39 items passed on initial migration. See [SMOKE_TEST.md](SMOKE_TEST.md) for the complete checklist covering health, streaming, agent tool calls, search modes, file upload/dedup, summary generation, conversation history, error handling, and the full E2E pipeline.

---

## 📄 Migration Notes

Migrated from `@anthropic-ai/claude-agent-sdk` + Claude Haiku 4.5 → LangChain.js + LangGraph + DeepSeek V4 Flash.
See [MIGRATION_DEEPSEEK_V4.md](MIGRATION_DEEPSEEK_V4.md) for the full technical breakdown.

---

## License

MIT
