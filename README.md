# Mini-RAG: Sri Lanka TVET Career Counseling Platform

**English** | **[한국어](README.ko.md)**

---

A multilingual AI career counseling platform for Sri Lanka's Technical and Vocational Education and Training (TVET) ecosystem. Students and counselors ask career questions in Sinhala, Tamil, or English — the system searches indexed web content and institutional data to provide personalized guidance.

## CareerOne: What It Does

CareerOne is a widget-style chatbot that runs on Mini-RAG's multi-agent architecture. It is designed for deployment on TVET institution websites.

### Core Features

- **Multilingual career Q&A** — Ask in Sinhala (සිංහල), Tamil (தமிழ்), or English. The system auto-detects the script and expands queries across all three languages.
- **Career pathway analysis** — NVQ level progression, qualification recognition, further education routes
- **Skill gap diagnosis** — Compare current competencies against target job requirements
- **Future job recommendations** — Match skills to Sri Lanka's labor market trends (tourism, IT, manufacturing, agriculture, textiles)
- **Periodic web research** — Auto-collects updated labor market and qualification information on a schedule
- **Document generation** — Create career reports, counseling summaries as DOCX/PPTX

## Example Conversations

### Sinhala — සිංහල
```
User: NVQ සුදුසුකම් ලබා ගත්තු පසු කුමන රැකියා ලබා ගත හැකිද?
AI: ## NVQ සුදුසුකම් පසුම්බිය පිළිබඳ තොරතුරු
    NVQ මට්ටම් 1-6 දක්වා පවතී:
    • NVQ 1-2: � basic vocational skills
    • NVQ 3-4: සාමාර්ථ තල කුසලතා
    • NVQ 5-6: උසස් කුසලතා (degree සමඟ සමාන)
    ...
    출처: [TVEC Guidelines]
```

### Tamil — தமிழ்
```
User: NVQ தகுதி பெற்றபிறகு என்ன வேலைகள் கிடைக்கும்?
AI: ## NVQ தகுதிக்குப் பிறகான வாழ்க்கைப் பாதை
    NVQ மட்டம் 1-6 வரை உள்ளன:
    • NVQ 1-2: அடிப்படை தொழிற்பயிற்சி
    • NVQ 3-4: மூத்த நிபுணர் தரம்
    • NVQ 5-6: பட்டம் சமமான நிபுணர் தரம்
    ...
    출처: [TVEC Guidelines]
```

### English
```
User: What career paths are available after completing NVQ Level 4?
AI: ## NVQ Level 4 — Career Pathways
    NVQ Level 4 holders can pursue:
    1. Direct employment in supervisory/technician roles
    2. University entrance (NVQ 5-6 to degree)
    3. entrepreneurship — start your own SME
    ...
    Source: [TVEC Sri Lanka]
```

### Skill Gap Analysis (any language)
```
User:  ICT තුළ රැකියා එකකට යන්න මාව උදව් කරන්න
AI: ## ඔබේ දක්ෂතා blank spots
    | පුහුණු කිරීම  | දැන්  | ඉලඟට  | Gap  |
    | Python          | L1    | L3     | -2   |
    | ජාල කරණය       | L0    | L2     | -2   |
    | දත්ත විශ්ලේෂණය  | L1    | L3     | -2   |
    ## Recommended: ඔබට ICT ඉගෙන ගත හැකි නිර්දේශ කෙරෙමු
    1.  Web Development (6 months) — 85% match
    2.  Data Analytics (4 months) — 72% match
    3.  Network Admin (3 months) — 68% match
```

## Architecture

```
Browser (CareerOne Widget — React + Tailwind)
  │ SSE streaming
  ▼
Mini-RAG Server (Node.js + TypeScript + Express)
  │
  ├── Orchestrator (Claude Haiku 4.5 via Agent SDK)
  │   ├── Pre-Search ──── server-side RAG before LLM
  │   │                    (Unicode script detection: Sinhala/Tamil/English)
  │   │
  │   └── 11 Specialized Agents
  │       ├── rag-search ─────── TVET doc Q&A with source citations
  │       ├── web-research ───── Periodic labor market collection
  │       ├── file-analyst ────── Local file analysis
  │       ├── memory ──────────── Student profile + session memory
  │       ├── education-specialist ─ Curriculum, career paths, gap analysis
  │       └── doc-writer ──────── Career reports (DOCX/PDF)
  │
  ├── Custom MCP Server ── RAG tools (search, status, journal)
  ├── External MCP ─────── memory, sequential-thinking, fetch
  │
  └── SQLite
      ├── FTS5 (BM25 keyword search)
      ├── sqlite-vec (vector KNN — paraphrase-multilingual-MiniLM)
      └── RRF hybrid fusion (weight_fts=1.5, weight_vec=1.0)
```

### How TVET Research Collection Works

Web research runs on a schedule (per-topic interval):

| Topic | Source | Interval |
|-------|--------|----------|
| NVQ Qualification Framework | Wikipedia URLs | 12h |
| TVEC NAVTA | Wikipedia URLs | 12h |
| Sri Lanka Education System | Wikipedia URLs | 12h |
| Tourism & Hospitality careers | Web search | 6h |
| IT & Technology careers | Web search | 6h |
| Manufacturing skills | Web search | 12h |
| Agriculture careers | Web search | 12h |
| Textiles & Garment industry | Web search | 12h |
| Employability skills | Web search | 6h |
| NVQ to degree pathways | Web search | 12h |

### How Search & Routing Works

1. **Script Detection** — `detectScript()` identifies Sinhala (U+0D80), Tamil (U+0B80), Korean, Japanese, English
2. **Multilingual Expansion** — Sinhala/Tamil keywords → Korean → English for cross-language FTS5 matching
3. **Pre-Search Injection** — search results always injected into prompt before agent runs
4. **Dynamic Skill Loading** — only matched agents load their skills (~5K tokens vs 22K)
5. **Agent Routing** — `skill-router.ts` scores 11 agents by keyword + synonym hits

## Skills (CareerOne-relevant subset)

| Category | Skills | Purpose |
|----------|--------|---------|
| **Education (14)** | Course Design, Curriculum Builder, Learning Assessment, **Career Pathway Analyzer**, **Skills Gap Analyzer**, **Future Job Recommender**, Work Journal | TVET & career counseling |
| **HR (4)** | HR Recruitment, Change Management, Org Design, HRD Training | Student profiling |
| **Office (8)** | DOCX Official, PPTX Official, PDF Official | Career report generation |

Full 76 skills available for all document generation and business analysis needs.

## Quick Start

### Prerequisites

| Requirement | Version | Purpose |
|-------------|---------|---------|
| **Node.js** | 20+ | Server runtime |
| **npm** | 10+ | Package management |
| **Python** | 3.10+ | Document generation (DOCX, PPTX) |
| **Anthropic API Key** | — | LLM (Claude Haiku 4.5) |

### Step 1: Install

```bash
git clone https://github.com/scottnaddle/mini-rag.git
cd mini-rag
npm install
cd client && npm install && cd ..
```

### Step 2: Python Libraries

```bash
pip install python-pptx openpyxl xlsxwriter python-docx reportlab Pillow
```

### Step 3: Environment

```bash
cp .env.example .env
# Edit: ANTHROPIC_API_KEY, DOCS_PATH, DATA_PATH
```

### Step 4: Run

```bash
# Backend (port 4001)
npm start

# Frontend (port 5173) — only for development
npm run dev:client
```

> **Embedding model:** `paraphrase-multilingual-MiniLM-L12-v2` auto-downloads on first run (~80MB). Supports Sinhala, Tamil, Korean, English, Japanese, and 45+ other languages.

### Step 5: Embed CareerOne Widget

Add the widget to any TVET institution website:

```html
<div id="careerone-chat"></div>
<script src="https://your-server.com/client/widget.js"></script>
```

Configure via query params or the widget settings panel.

---

## Developer Guide

This section covers frontend development, API integration, and widget embedding.

### Frontend Development

```bash
# Terminal 1: Backend
npm start
# → http://localhost:4001

# Terminal 2: Frontend (hot reload)
npm run dev:client
# → http://localhost:5173

# Production build
cd client && npm run build
# → dist/ (served by backend at /rag-widget route)
```

The frontend Vite dev server proxies `/api/*` requests to `http://localhost:4001`. No CORS issues during development.

**Build widget for embedding:**
```bash
cd client && npm run build
# Output: client/dist/index.html + assets/
# Serve these files from any static host (NGINX, CDN, etc.)
```

---

### TypeScript Types

All types match the frontend hooks in `client/src/hooks/`:

```typescript
// Message shape
interface Message {
  role: "user" | "assistant";
  content: string;       // Markdown content
  sources?: Source[];    // Attached sources
  timestamp: string;     // ISO 8601
}

interface Source {
  id: number;
  title: string;
  content: string;      // Chunk content snippet
  file_name: string;
  file_path: string;
  format: string;       // "pdf" | "docx" | "web" | etc.
  score: number;        // Relevance score
  metadata: Record<string, unknown>;
}
```

---

### API Integration Examples

> **Note:** All `/api/chat` endpoints require `ANTHROPIC_API_KEY` to be set in `.env`. Search, upload, and scheduler endpoints work without it.

#### SSE Streaming Chat (recommended)

```typescript
async function chat(message: string, sessionId?: string) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ message, top_k: 5, search_mode: "auto", session_id: sessionId }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        const data = JSON.parse(line.slice(6));

        if (eventType === "token" && data.text) {
          // streaming token → append to message
          console.log("token:", data.text);
        } else if (eventType === "sources" && data.chunks) {
          // sources available → render citation UI
          console.log("sources:", data.chunks);
        } else if (eventType === "done" && data.session_id) {
          // conversation complete → save sessionId for continuity
          console.log("session_id:", data.session_id);
        }
      }
    }
  }
}
```

**curl test:**
```bash
curl -X POST http://localhost:4001/api/chat \
  -H "Content-Type: application/json; charset=utf-8" \
  -d '{"message": "NVQ Level 4இல் என்ன வேலைகள் கிடைக்கும்?", "top_k": 5}' \
  -N
```

#### JSON Polling Fallback (for restricted environments)

```typescript
async function chatPoll(message: string, sessionId?: string) {
  const res = await fetch("/api/chat/poll", {
    method: "POST",
    headers: { "Content-Type: "application/json; charset=utf-8" },
    body: JSON.stringify({ message, top_k: 5, search_mode: "auto", session_id: sessionId }),
  });
  const data = await res.json();
  // { session_id, sources_count, chunks: Source[], message: string }
  return data;
}
```

**curl test:**
```bash
curl -X POST http://localhost:4001/api/chat/poll \
  -H "Content-Type: application/json" \
  -d '{"message": "What careers after NVQ Level 4?", "top_k": 5}'
```

#### Upload a Document

```typescript
const formData = new FormData();
formData.append("file", fileInput.files[0]);

const res = await fetch("/api/upload", { method: "POST", body: formData });
const data = await res.json();
// { id, file_name, format, chunks_created, file_size }
```

#### Search (no LLM)

```bash
curl -X POST http://localhost:4001/api/search \
  -H "Content-Type: application/json" \
  -d '{"query": "NVQ qualification framework", "top_k": 5, "search_mode": "fts"}'
```

#### Manage Research Scheduler

```bash
# Check status
curl http://localhost:4001/api/web-research/status

# Stop all periodic collections
curl -X POST http://localhost:4001/api/web-research/scheduler/stop

# Resume all collections
curl -X POST http://localhost:4001/api/web-research/scheduler/start

# Trigger one topic immediately
curl -X POST http://localhost:4001/api/web-research/topics/21/collect
```

---

### Widget Integration (Complete Example)

#### Option A: Full-page Widget (iframe embed)

```html
<!-- In your TVET institution page -->
<iframe
  src="https://your-mini-rag-server.com/rag-widget"
  style="width: 100%; height: 600px; border: none; border-radius: 12px;"
  allow="microphone"
></iframe>
```

#### Option B: Inline Chat Component (React/JS)

```html
<!-- Minimal widget container -->
<div id="chat-root"></div>

<script type="module">
  import React from "https://esm.sh/react@18";
  import { createRoot } from "https://esm.sh/react-dom@18/client";

  // Embedded widget — no npm install needed
  const API = "https://your-mini-rag-server.com";

  function CareerChat({ apiEndpoint = `${API}/api/chat` }) {
    const [messages, setMessages] = React.useState([]);
    const [input, setInput] = React.useState("");
    const [sessionId, setSessionId] = React.useState(
      localStorage.getItem("co-sid") || null
    );

    async function send(text) {
      const userMsg = { role: "user", content: text };
      setMessages(m => [...m, userMsg, { role: "assistant", content: "..." }]);

      const res = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, session_id: sessionId }),
      });

      let assistantText = "";
      for await (const chunk of res.body) {
        const text = new TextDecoder().decode(chunk);
        if (text.startsWith("data: ")) {
          const d = JSON.parse(text.slice(6));
          if (d.text) { assistantText += d.text; setMessages(m => m.slice(0,-1).concat({ role:"assistant", content:assistantText })); }
          if (d.session_id) { setSessionId(d.session_id); localStorage.setItem("co-sid", d.session_id); }
        }
      }
    }

    return React.createElement("div", { className: "chat-wrap" },
      React.createElement("div", { className: "messages" },
        messages.map((m, i) => React.createElement("div", { key: i, className: `msg ${m.role}` }, m.content))
      ),
      React.createElement("input", {
        value: input,
        onChange: e => setInput(e.target.value),
        onKeyDown: e => e.key === "Enter" && (send(input), setInput("")),
        placeholder: "Ask about careers, NVQ, skills..."
      })
    );
  }

  createRoot(document.getElementById("chat-root")).render(
    React.createElement(CareerChat)
  );
</script>
```

#### Option C: Production React Integration

```bash
cd client
npm install
npm run build
```

Then serve `client/dist/` from your web server. The widget is accessible at `/rag-widget` (full-page) or components in `client/src/components/WidgetChat.tsx` can be imported directly:

```tsx
// In your existing React app
import WidgetChat from "./components/WidgetChat";
import { useWidgetChat } from "./hooks/useWidgetChat";

function MyPage() {
  const { messages, isStreaming, error, sendMessage, stopStreaming } = useWidgetChat({
    apiEndpoint: "https://your-mini-rag-server.com/api/chat",
  });

  return (
    <WidgetChat
      messages={messages}
      isStreaming={isStreaming}
      onSend={sendMessage}
      onStop={stopStreaming}
      error={error}
      onClearError={() => {}}
    />
  );
}
```

**Environment variable for API endpoint:**
```bash
VITE_API_BASE=https://your-mini-rag-server.com
```
Then use `import.meta.env.VITE_API_BASE` in your code.

---

### Tailwind Design System

The widget uses a warm dark theme. Key color tokens:

```js
// desk (background)
desk.bg        // #23201b — page background
desk.surface   // #2b2722 — card surface
desk.elevated  // #353029 — elevated UI

// amber (accent)
amber.glow     // #e8a84c — primary accent
amber.warm     // #d4903a — hover state

// ink (text)
ink.100        // #f0ebe4 — primary text
ink.400        // #b09a80 — secondary text
ink.600        // #86705c — muted text
```

Custom fonts: `font-display` (Newsreader), `font-body` (Pretendard/Noto Sans KR).

---

### Troubleshooting

**SSE not working?** Use `/api/chat/poll` instead — same results, JSON only.

**CORS errors?** The Vite proxy handles this in dev. In production, either serve the widget from the same origin as the API, or configure CORS headers on the Express server.

**No search results?** Check `GET /api/status` to see if documents are indexed. Use `POST /api/upload` to add documents.

**Model download slow?** The embedding model (~80MB) downloads on first `/api/search` call. Set `HUGGINGFACE_HUB_CACHE` env var to a local path to cache it.

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/chat` | Career chat with SSE. Body: `{message, top_k?, search_mode?}` |
| `POST` | `/api/upload` | Upload TVET documents. Multipart form: `file` |
| `POST` | `/api/search` | Direct search (no LLM). Body: `{query, top_k?, search_mode?}` |
| `GET` | `/api/documents` | List indexed documents |
| `GET` | `/api/status` | Index stats |
| `GET` | `/api/conversations` | Conversation history |
| `GET` | `/api/conversations/:id` | Single conversation messages |
| `DELETE` | `/api/documents/:id` | Delete a document |
| `GET` | `/api/output-files` | List generated career reports |
| `GET` | `/api/files/:name` | Download a generated file |
| `GET` | `/api/web-research/status` | Research scheduler status |
| `POST` | `/api/web-research/scheduler/stop` | Stop periodic collection |
| `POST` | `/api/web-research/scheduler/start` | Restart periodic collection |
| `POST` | `/api/web-research/topics/:id/collect` | Trigger immediate collection |

### SSE Events (Chat)

```
event: token   → {text: "partial response..."}
event: status  → {text: "Searching NVQ data...", tool: "mcp__rag__search_documents"}
event: sources → {chunks: [...], session_id: "..."}
event: done    → {session_id: "..."}
event: error   → {error: "message"}
```

## Project Structure

```
mini-rag/
├── server/
│   ├── agents/          # 11 agents + registry + skill-router
│   ├── orchestrator/    # Agent SDK handler + pre-search
│   ├── mcp/             # Custom RAG MCP server
│   ├── db/              # SQLite (FTS5 + sqlite-vec)
│   ├── ingestion/       # Document parser, chunker, indexer
│   ├── search/          # FTS5 + Vector + RRF hybrid
│   ├── memory/          # Conversations, intents, sessions
│   ├── llm/             # Claude API + multilingual embedder
│   ├── tasks/           # DOCX/PPTX/XLSX generators
│   └── routes/          # Express routes + web-research scheduler
├── client/
│   └── src/components/  # React UI (ChatView, WidgetChat, Sidebar)
├── .claude/skills/      # 76 SKILL.md files
├── data/                # SQLite DB + generated files (gitignored)
└── docs/                # TVET document folder (auto-indexed on startup)
```

## Key Design Decisions

- **FTS5 > Vector for Korean** — FTS5 still leads for Korean queries, so weight_fts=1.5, weight_vec=1.0
- **Multilingual embedding** — paraphrase-multilingual-MiniLM-L12-v2 enables cross-language search for Sinhala↔Tamil↔English
- **Server-side pre-search** — LLM sometimes skips calling tools, so search results are always injected into the prompt
- **Unicode script detection** — Sinhala/Tamil scripts detected via U+0D80/U+0B80 ranges, not language codes
- **Periodic web research** — Sri Lanka labor market data auto-collected on topic-specific schedules; scheduler can be stopped/started via API
- **Dynamic skill loading** — only matched agents load their skills (~5K tokens vs 22K), keeping responses fast
- **Excel as markdown tables** — headers repeated per chunk to preserve row/column relationships during search

## License

MIT
