# Migration Guide: Claude Haiku 4.5 → DeepSeek V4 Flash

> **목표**: `@anthropic-ai/claude-agent-sdk` + `@anthropic-ai/sdk` 기반 아키텍처를  
> `LangChain.js (LangGraph + @langchain/mcp-adapters)` + `DeepSeek V4 Flash` 로 마이그레이션

---

## 📋 목차

1. [배경 및 결정 사항](#1-배경-및-결정-사항)
2. [DeepSeek V4 Flash 스펙](#2-deepseek-v4-flash-스펙)
3. [변경 범위 요약](#3-변경-범위-요약)
4. [새 아키텍처 설계](#4-새-아키텍처-설계)
5. [Phase 1 — 패키지 교체](#phase-1--패키지-교체)
6. [Phase 2 — LLM 레이어 교체](#phase-2--llm-레이어-교체)
7. [Phase 3 — MCP 서버 재작성](#phase-3--mcp-서버-재작성)
8. [Phase 4 — 에이전트 정의 재설계](#phase-4--에이전트-정의-재설계)
9. [Phase 5 — 오케스트레이터 재설계](#phase-5--오케스트레이터-재설계)
10. [Phase 6 — 메모리 레이어 교체](#phase-6--메모리-레이어-교체)
11. [Phase 7 — 환경변수 및 설정 변경](#phase-7--환경변수-및-설정-변경)
12. [Phase 8 — 검증](#phase-8--검증)
13. [수정 불필요 파일](#수정-불필요-파일)
14. [리스크 및 주의사항](#리스크-및-주의사항)

---

## 1. 배경 및 결정 사항

### 왜 DeepSeek V4 Flash인가?

| 항목 | Claude Haiku 4.5 | DeepSeek V4 Flash |
|------|-----------------|-------------------|
| 컨텍스트 | 200K 토큰 | **1M 토큰** |
| 최대 출력 | 8K 토큰 | **384K 토큰** |
| Tool Calling | ✓ | ✓ (OpenAI 형식) |
| Streaming | ✓ | ✓ |
| Parallel Tools | ✓ | ✓ |
| OpenAI SDK 호환 | ✗ | **✓ (완전 호환)** |

### 왜 LangChain.js + LangGraph인가?

`claude-agent-sdk`의 `query()` 함수는 **Anthropic 전용**으로, DeepSeek에서 직접 사용 불가.  
대안으로 **LangChain.js + LangGraph**를 선택한 이유:

- `@langchain/mcp-adapters` — MCP 서버를 LangChain Tool로 **자동 변환** (재작성 최소화)
- `ChatOpenAI(baseURL: deepseek)` — DeepSeek을 OpenAI 호환으로 즉시 사용
- `createReactAgent` — ReAct 루프 자동 구현 (tool-loop 직접 작성 불필요)
- `streamEvents()` — 기존 SSE 스트리밍 구조와 호환

---

## 2. DeepSeek V4 Flash 스펙

```
모델명:     deepseek-v4-flash
출시일:     2026년 4월 24일
Base URL:   https://api.deepseek.com
API 형식:   OpenAI Chat Completions 완전 호환
컨텍스트:   1,000,000 토큰
최대 출력:  384,000 토큰
파라미터:   284B (활성화: 13B)
Tool Call:  지원 (비-thinking 모드)
Streaming:  지원
```

> ⚠️ **주의**: `deepseek-v4-flash`는 기본적으로 thinking 모드가 활성화됩니다.  
> Tool calling을 사용하려면 반드시 thinking을 비활성화해야 합니다:
>
> ```typescript
> extra_body: { thinking: { type: "disabled" } }
> ```
>
> ⚠️ **레거시 모델명**: `deepseek-chat`은 2026년 7월 24일 폐지 예정.  
> 반드시 `deepseek-v4-flash`로 명시할 것.

---

## 3. 변경 범위 요약

### 🔴 반드시 수정 (Anthropic 직접 의존)

| 파일 | 이유 | 난이도 |
|------|------|--------|
| `server/orchestrator/chat-handler.ts` | `query()` 전체 교체, SSE 이벤트 재설계 | 높음 |
| `server/mcp/rag-server.ts` | `createSdkMcpServer` → 표준 MCP SDK | 중간 |
| `server/agents/definitions.ts` | `AgentDefinition` 타입 교체 | 중간 |
| `server/llm/provider.ts` | Anthropic SDK → OpenAI SDK | 낮음 |
| `server/memory/document-summary.ts` | Anthropic SDK → OpenAI SDK | 낮음 |
| `server/memory/session-summary.ts` | Anthropic SDK → OpenAI SDK | 낮음 |
| `package.json` | 패키지 교체 | 낮음 |
| `.env` | API 키 교체 | 낮음 |

### 🟢 수정 불필요 (Anthropic 무관)

`server/db/`, `server/search/`, `server/ingestion/`, `server/routes/`,  
`server/tasks/`, `server/llm/embedder.ts`, `server/llm/prompt.ts`,  
`server/agents/skill-loader.ts`, `server/agents/skill-router.ts`,  
`server/agents/registry.ts`, `server/memory/` (conversation-store, intent-store,  
session-events, session-usage, task-log, work-journal), `server/config.ts`

---

## 4. 새 아키텍처 설계

### 기존 아키텍처 (Anthropic)

```
Express SSE
  └─ query() [claude-agent-sdk]
       ├─ Orchestrator (Claude Haiku 4.5)
       │    └─ 11 Sub-Agents (각각 Claude Haiku 4.5)
       └─ createSdkMcpServer [RAG 도구 11개]
```

### 새 아키텍처 (LangChain + DeepSeek)

```
Express SSE
  └─ LangGraph createReactAgent
       ├─ Orchestrator LLM (DeepSeek V4 Flash via ChatOpenAI)
       ├─ MCP Tools (@langchain/mcp-adapters)
       │    ├─ RAG MCP Server (표준 @modelcontextprotocol/sdk)
       │    ├─ Memory MCP Server (npx)
       │    └─ Sequential Thinking MCP Server (npx)
       └─ Sub-Agents (LangGraph 노드로 구현)
            └─ 각각 DeepSeek V4 Flash + 전용 Tools
```

### 새 파일 구조

```
server/
├── llm/
│   ├── deepseek.ts          ← NEW: DeepSeek ChatOpenAI 인스턴스 팩토리
│   ├── provider.ts          ← MODIFY: OpenAI SDK 기반으로 교체
│   └── embedder.ts          ← 유지
│
├── mcp/
│   ├── rag-server.ts        ← REWRITE: 표준 MCP SDK로 재작성
│   └── mcp-client.ts        ← NEW: @langchain/mcp-adapters 클라이언트
│
├── agents/
│   ├── definitions.ts       ← REWRITE: LangGraph 에이전트 정의
│   ├── langgraph-agents.ts  ← NEW: createReactAgent 기반 서브에이전트
│   ├── registry.ts          ← 유지
│   ├── skill-loader.ts      ← 유지
│   └── skill-router.ts      ← 유지
│
├── orchestrator/
│   └── chat-handler.ts      ← REWRITE: LangGraph 기반 오케스트레이터
│
└── memory/
    ├── document-summary.ts  ← MODIFY: OpenAI SDK로 교체
    └── session-summary.ts   ← MODIFY: OpenAI SDK로 교체
```

---

## Phase 1 — 패키지 교체

### 제거할 패키지

```bash
npm uninstall @anthropic-ai/claude-agent-sdk @anthropic-ai/sdk
```

### 설치할 패키지

```bash
npm install openai \
  @langchain/core \
  @langchain/openai \
  @langchain/langgraph \
  @langchain/mcp-adapters \
  @modelcontextprotocol/sdk
```

### package.json 변경 사항

```diff
 "dependencies": {
-  "@anthropic-ai/claude-agent-sdk": "^0.2.97",
-  "@anthropic-ai/sdk": "^0.39.0",
+  "openai": "^4.x.x",
+  "@langchain/core": "^0.3.x",
+  "@langchain/openai": "^0.3.x",
+  "@langchain/langgraph": "^0.2.x",
+  "@langchain/mcp-adapters": "^0.x.x",
+  "@modelcontextprotocol/sdk": "^1.x.x",
   "@huggingface/transformers": "^4.0.1",
   ...
 }
```

---

## Phase 2 — LLM 레이어 교체

### 2-1. `server/llm/deepseek.ts` (신규 생성)

DeepSeek 클라이언트 팩토리 — 프로젝트 전반에서 공유 사용.

```typescript
// server/llm/deepseek.ts
import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

/** LangChain용 ChatOpenAI 인스턴스 (에이전트/오케스트레이터) */
export function createDeepSeekChat(options?: {
  temperature?: number;
  maxTokens?: number;
  streaming?: boolean;
}) {
  return new ChatOpenAI({
    model: DEEPSEEK_MODEL,
    apiKey: process.env.DEEPSEEK_API_KEY,
    configuration: { baseURL: DEEPSEEK_BASE_URL },
    temperature: options?.temperature ?? 0,
    maxTokens: options?.maxTokens ?? 4096,
    streaming: options?.streaming ?? true,
    // thinking 비활성화 필수 (tool calling 사용 시)
    modelKwargs: {
      extra_body: { thinking: { type: "disabled" } },
    },
  });
}

/** 직접 호출용 OpenAI SDK 클라이언트 (메모리 레이어 등) */
export const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: DEEPSEEK_BASE_URL,
});

export { DEEPSEEK_MODEL };
```

### 2-2. `server/llm/provider.ts` 수정

```diff
-import Anthropic from "@anthropic-ai/sdk";
+import { deepseekClient, DEEPSEEK_MODEL } from "./deepseek.js";

-const client = new Anthropic();

 export async function* streamChat(
   systemPrompt: string,
   userMessage: string,
-  model = "claude-haiku-4-5-20251001"
+  model = DEEPSEEK_MODEL
 ): AsyncGenerator<string, void, unknown> {
-  const stream = await client.messages.create({
-    model,
-    max_tokens: 4096,
-    system: systemPrompt,
-    messages: [{ role: "user", content: userMessage }],
-    stream: true,
-  });
-
-  for await (const event of stream) {
-    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
-      yield event.delta.text;
-    }
-  }
+  const stream = await deepseekClient.chat.completions.create({
+    model,
+    max_tokens: 4096,
+    messages: [
+      { role: "system", content: systemPrompt },
+      { role: "user", content: userMessage },
+    ],
+    stream: true,
+    extra_body: { thinking: { type: "disabled" } },
+  });
+
+  for await (const chunk of stream) {
+    const text = chunk.choices[0]?.delta?.content;
+    if (text) yield text;
+  }
 }
```

---

## Phase 3 — MCP 서버 재작성

### 배경

`createSdkMcpServer`는 `@anthropic-ai/claude-agent-sdk` 전용 API.  
표준 `@modelcontextprotocol/sdk`의 `McpServer`로 재작성한다.

### 3-1. `server/mcp/rag-server.ts` 재작성

```typescript
// server/mcp/rag-server.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { search } from "../search/orchestrator.js";
import { getDb } from "../db/connection.js";
// ... 기타 memory 모듈 임포트

export function createRagMcpServer(): McpServer {
  const server = new McpServer({
    name: "rag",
    version: "4.0.0",
  });

  // search_documents
  server.tool(
    "search_documents",
    "인덱싱된 문서에서 관련 내용을 검색합니다",
    {
      query: z.string().describe("검색 쿼리"),
      top_k: z.number().optional().default(5).describe("반환할 결과 수"),
      search_mode: z.enum(["auto", "fts", "hybrid"]).optional().default("auto"),
    },
    async ({ query, top_k, search_mode }) => {
      const results = await search(query, { topK: top_k, searchMode: search_mode as any });
      return {
        content: [{
          type: "text",
          text: JSON.stringify(results.map(r => ({
            id: r.id,
            file_name: r.file_name,
            content: r.content.slice(0, 1000),
            score: r.score,
            metadata: r.metadata,
          }))),
        }],
      };
    }
  );

  // get_document_status
  server.tool(
    "get_document_status",
    "인덱싱된 문서 통계를 반환합니다",
    {},
    async () => {
      const db = getDb();
      const stats = db.prepare(`
        SELECT COUNT(*) as doc_count,
               SUM(chunk_count) as total_chunks
        FROM documents
      `).get() as any;
      return {
        content: [{ type: "text", text: JSON.stringify(stats) }],
      };
    }
  );

  // list_documents
  server.tool(
    "list_documents",
    "인덱싱된 문서 목록을 반환합니다",
    {
      format: z.string().optional().describe("필터링할 파일 형식 (pdf, docx 등)"),
      limit: z.number().optional().default(20),
    },
    async ({ format, limit }) => {
      const db = getDb();
      let query = "SELECT id, file_name, format, created_at FROM documents";
      if (format) query += ` WHERE format = '${format}'`;
      query += ` ORDER BY created_at DESC LIMIT ${limit}`;
      const docs = db.prepare(query).all();
      return {
        content: [{ type: "text", text: JSON.stringify(docs) }],
      };
    }
  );

  // save_user_intent, log_task_execution, get_conversation_history,
  // get_user_intents, save_work_journal, query_work_journal,
  // add_feedback_to_journal — 동일한 패턴으로 구현
  // (server/memory/ 모듈 재사용)

  return server;
}

/**
 * MCP 서버를 stdio 모드로 실행 (독립 프로세스)
 * @langchain/mcp-adapters에서 npx/node로 시작
 */
export async function startRagMcpServerProcess() {
  const server = createRagMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

### 3-2. `server/mcp/mcp-client.ts` (신규 생성)

`@langchain/mcp-adapters`로 모든 MCP 서버를 LangChain Tool로 변환.

```typescript
// server/mcp/mcp-client.ts
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { PATHS } from "../config.js";
import path from "path";

let mcpClient: MultiServerMCPClient | null = null;

/**
 * MCP 클라이언트 초기화 (서버 시작 시 1회)
 * RAG 서버는 인프로세스로, 외부 서버는 npx로 시작
 */
export async function initMcpClient(options?: {
  memory?: boolean;
  sequentialThinking?: boolean;
  fetch?: boolean;
}) {
  const servers: Record<string, any> = {
    // RAG MCP 서버 — 현재 프로젝트의 server/mcp/rag-server.ts를 stdio로 실행
    rag: {
      transport: "stdio",
      command: "npx",
      args: ["tsx", path.resolve("server/mcp/rag-server-process.ts")],
    },
  };

  // 선택적 외부 MCP 서버
  if (options?.memory) {
    servers.memory = {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
      env: { MEMORY_FILE_PATH: PATHS.knowledgeGraph },
    };
  }

  if (options?.sequentialThinking) {
    servers["sequential-thinking"] = {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    };
  }

  if (options?.fetch) {
    servers.fetch = {
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-fetch"],
    };
  }

  mcpClient = new MultiServerMCPClient({ mcpServers: servers });
  return mcpClient;
}

export async function getMcpTools(serverNames?: string[]) {
  if (!mcpClient) throw new Error("MCP client not initialized");
  if (serverNames) {
    const toolArrays = await Promise.all(
      serverNames.map(name => mcpClient!.getTools(name).catch(() => []))
    );
    return toolArrays.flat();
  }
  return mcpClient.getTools();
}

export async function closeMcpClient() {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
  }
}
```

---

## Phase 4 — 에이전트 정의 재설계

### `server/agents/definitions.ts` 재작성

`AgentDefinition` (Anthropic 전용 타입) → 커스텀 `AgentSpec` 타입으로 교체.  
LangGraph `createReactAgent`와 호환되는 구조.

```typescript
// server/agents/definitions.ts
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createDeepSeekChat } from "../llm/deepseek.js";
import { getMcpTools } from "../mcp/mcp-client.js";
import { loadSkillsForAgent } from "./skill-loader.js";

/** 에이전트 스펙 (Anthropic AgentDefinition 대체) */
export interface AgentSpec {
  name: string;
  description: string;         // 오케스트레이터 라우팅 힌트
  systemPrompt: string;        // Skills 포함 시스템 프롬프트
  toolNames: string[];         // 허용 MCP 도구 이름 (접두사 포함)
}

/** 런타임 에이전트 (LangGraph createReactAgent 결과) */
export type CompiledAgent = ReturnType<typeof createReactAgent>;

/**
 * 쿼리에 필요한 에이전트만 빌드 (기존 buildAgentsForQuery 대체)
 * 반환값: { [agentName]: CompiledAgent }
 */
export async function buildAgentsForQuery(
  neededAgentNames: string[]
): Promise<Record<string, CompiledAgent>> {
  const agents: Record<string, CompiledAgent> = {};
  const allTools = await getMcpTools();

  for (const name of neededAgentNames) {
    const spec = AGENT_SPECS[name];
    if (!spec) continue;

    // 이 에이전트에 허용된 도구만 필터링
    const agentTools = allTools.filter(t => spec.toolNames.includes(t.name));

    // Skills 로드 (기존 skill-loader.ts 재사용)
    const systemPrompt = await loadSkillsForAgent(name, spec.systemPrompt);

    agents[name] = createReactAgent({
      llm: createDeepSeekChat({ temperature: 0 }),
      tools: agentTools,
      messageModifier: systemPrompt,
    });
  }

  return agents;
}

/** 11개 에이전트 스펙 정의 */
const AGENT_SPECS: Record<string, AgentSpec> = {
  "rag-search": {
    name: "rag-search",
    description: "인덱싱된 문서에서 검색하여 답변을 생성합니다",
    systemPrompt: `당신은 문서 검색 전문가입니다. 항상 search_documents 도구를 사용하여 관련 문서를 찾고 답변하세요.`,
    toolNames: [
      "search_documents",
      "get_document_status",
      "list_documents",
    ],
  },
  "web-research": {
    name: "web-research",
    description: "웹 검색으로 최신 정보를 수집합니다",
    systemPrompt: `당신은 웹 리서치 전문가입니다. WebSearch와 WebFetch를 활용하여 최신 정보를 찾으세요.`,
    toolNames: ["WebSearch", "WebFetch", "fetch"],
  },
  "file-analyst": {
    name: "file-analyst",
    description: "로컬 파일을 분석합니다",
    systemPrompt: `당신은 파일 분석 전문가입니다. Read, Glob, Grep 도구로 파일을 분석하세요.`,
    toolNames: ["Read", "Glob", "Grep"],
  },
  "memory": {
    name: "memory",
    description: "사용자 정보를 저장하고 조회합니다",
    systemPrompt: `당신은 사용자 정보 관리 전문가입니다. 대화에서 사용자 정보를 감지하고 저장하세요.`,
    toolNames: [
      "save_user_intent", "get_user_intents",
      "create_entities", "add_observations", "search_nodes",
      "open_nodes", "delete_entities",
    ],
  },
  "doc-writer": {
    name: "doc-writer",
    description: "DOCX, PDF 문서를 작성합니다",
    systemPrompt: `당신은 문서 작성 전문가입니다. 검색된 자료를 바탕으로 전문적인 문서를 작성하세요.`,
    toolNames: FILE_CREATION_TOOLS,
  },
  "presentation-maker": {
    name: "presentation-maker",
    description: "PowerPoint 프레젠테이션을 제작합니다",
    systemPrompt: `당신은 프레젠테이션 전문가입니다. 논리적 흐름과 시각적 구성을 고려하여 PPT를 제작하세요.`,
    toolNames: FILE_CREATION_TOOLS,
  },
  "spreadsheet-maker": {
    name: "spreadsheet-maker",
    description: "Excel 스프레드시트를 제작합니다",
    systemPrompt: `당신은 데이터 분석 및 엑셀 전문가입니다. 데이터를 구조화하여 엑셀 파일을 생성하세요.`,
    toolNames: FILE_CREATION_TOOLS,
  },
  "business-analyst": {
    name: "business-analyst",
    description: "비즈니스 데이터를 분석하고 보고서를 작성합니다",
    systemPrompt: `당신은 비즈니스 분석 전문가입니다. 데이터 기반의 인사이트를 도출하세요.`,
    toolNames: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
  },
  "hr-specialist": {
    name: "hr-specialist",
    description: "인사/채용 관련 문서를 처리합니다",
    systemPrompt: `당신은 HR 전문가입니다. 채용, 평가, 교육 관련 업무를 지원하세요.`,
    toolNames: FILE_CREATION_TOOLS,
  },
  "education-specialist": {
    name: "education-specialist",
    description: "교육 커리큘럼과 학습 자료를 설계합니다",
    systemPrompt: `당신은 교육 설계 전문가입니다. 학습 목표에 맞는 커리큘럼을 설계하세요.`,
    toolNames: [...FILE_CREATION_TOOLS, "WebSearch", "WebFetch"],
  },
  "operations-support": {
    name: "operations-support",
    description: "운영 지원 문서와 매뉴얼을 작성합니다",
    systemPrompt: `당신은 운영 지원 전문가입니다. 프로세스 문서화와 운영 매뉴얼을 작성하세요.`,
    toolNames: FILE_CREATION_TOOLS,
  },
};

const FILE_CREATION_TOOLS = [
  "Bash", "Write", "Read", "Glob",
  "search_documents",
  "query_work_journal", "save_work_journal",
  "add_feedback_to_journal", "log_task_execution",
];
```

---

## Phase 5 — 오케스트레이터 재설계

### `server/orchestrator/chat-handler.ts` 재작성

`query()` 기반 → LangGraph `createReactAgent` + `streamEvents()` 기반.

```typescript
// server/orchestrator/chat-handler.ts
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage } from "@langchain/core/messages";
import type { Response } from "express";
import { createDeepSeekChat, DEEPSEEK_MODEL } from "../llm/deepseek.js";
import { getMcpTools } from "../mcp/mcp-client.js";
import { buildAgentsForQuery } from "../agents/definitions.js";
import { predictNeededAgents } from "../agents/skill-router.js";
import { buildOrchestratorPrompt } from "./prompt-builder.js";
import { search } from "../search/orchestrator.js";
import {
  addMessage,
  createConversation,
} from "../memory/conversation-store.js";
import { appendEvent } from "../memory/session-events.js";
import { saveSessionUsage } from "../memory/session-usage.js";
import { generateSessionSummary, getRecentSummaries } from "../memory/session-summary.js";

interface ChatOptions {
  message: string;
  topK?: number;
  searchMode?: string;
  sessionId?: string;
}

export async function handleChat(res: Response, options: ChatOptions) {
  const { message, topK = 5, searchMode = "auto", sessionId } = options;
  const convId = sessionId || createConversation();

  // SSE 헤더
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Session-Id", convId);

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  addMessage(convId, { role: "user", content: message, timestamp: new Date().toISOString() });
  appendEvent(convId, "user.message", { content: message });

  try {
    // 1. 필요한 에이전트 예측 (기존 skill-router 재사용)
    const neededAgents = predictNeededAgents(message);
    sendEvent("status", { text: "에이전트 초기화 중..." });

    // 2. MCP Tools + Sub-Agents 빌드
    const allMcpTools = await getMcpTools(["rag"]);
    const subAgents = await buildAgentsForQuery(neededAgents);

    // 3. 사전 RAG 검색 (기존 로직 재사용)
    let preSearchContext = "";
    try {
      const results = await search(message, { topK, searchMode: searchMode as any });
      if (results.length > 0) {
        const parts = results.slice(0, 7).map(r => {
          const meta = r.metadata ? JSON.parse(r.metadata) : {};
          return `[${r.file_name}]\n${r.content.slice(0, 600)}`;
        });
        preSearchContext = `\n\n## 사전 검색 결과\n${parts.join("\n\n---\n")}`;
      }
    } catch (e) {
      console.warn("[PreSearch] Failed:", (e as Error).message);
    }

    // 4. 서브에이전트를 Tool로 래핑 (오케스트레이터가 호출)
    const { tool } = await import("@langchain/core/tools");
    const { z } = await import("zod");

    const subAgentTools = Object.entries(subAgents).map(([name, agent]) =>
      tool(
        async ({ prompt }: { prompt: string }) => {
          sendEvent("status", { text: `${name} 에이전트 작업 중...`, agent: name });
          appendEvent(convId, "agent.delegate", { agent: name, prompt });
          const result = await agent.invoke({
            messages: [new HumanMessage(prompt)],
          });
          const lastMsg = result.messages.at(-1);
          return typeof lastMsg?.content === "string"
            ? lastMsg.content
            : JSON.stringify(lastMsg?.content);
        },
        {
          name: name.replace(/-/g, "_"),
          description: `${name} 에이전트에 작업 위임`,
          schema: z.object({ prompt: z.string().describe("에이전트에 전달할 작업 지시") }),
        }
      )
    );

    // 5. 오케스트레이터 에이전트 생성
    const orchestratorTools = [...allMcpTools, ...subAgentTools];
    const orchestratorLlm = createDeepSeekChat({ streaming: true });
    const systemPrompt = await buildOrchestratorPrompt(convId);

    const orchestrator = createReactAgent({
      llm: orchestratorLlm,
      tools: orchestratorTools,
      messageModifier: systemPrompt,
    });

    // 6. 스트리밍 실행
    let fullResponse = "";
    let inputTokens = 0;
    let outputTokens = 0;

    const stream = orchestrator.streamEvents(
      {
        messages: [
          new HumanMessage(
            `검색 모드: ${searchMode}, 최대 결과: ${topK}\n\n질문: ${message}${preSearchContext}`
          ),
        ],
      },
      { version: "v2" }
    );

    for await (const event of stream) {
      switch (event.event) {
        case "on_chat_model_stream":
          // LLM 토큰 실시간 스트리밍
          if (event.data?.chunk?.content) {
            const text = event.data.chunk.content as string;
            fullResponse += text;
            sendEvent("token", { text });
          }
          break;

        case "on_tool_start":
          sendEvent("status", {
            text: `${TOOL_LABELS[event.name] || event.name}...`,
            tool: event.name,
          });
          appendEvent(convId, "agent.tool_progress", { tool: event.name });
          break;

        case "on_tool_end":
          appendEvent(convId, "agent.tool_end", { tool: event.name });
          break;

        case "on_llm_end":
          // 토큰 사용량 추적
          const usage = event.data?.output?.llmOutput?.tokenUsage;
          if (usage) {
            inputTokens += usage.promptTokens || 0;
            outputTokens += usage.completionTokens || 0;
          }
          break;
      }
    }

    // 7. 완료 처리
    addMessage(convId, { role: "assistant", content: fullResponse, timestamp: new Date().toISOString() });
    appendEvent(convId, "agent.message", { content: fullResponse });

    saveSessionUsage({
      session_id: convId,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_read_tokens: 0,
      total_cost_usd: 0, // DeepSeek 가격 기반으로 계산
      num_turns: 1,
      model: DEEPSEEK_MODEL,
    });

    sendEvent("sources", { chunks: [], session_id: convId });
    sendEvent("done", { session_id: convId });

    // 비동기 세션 요약 (백그라운드)
    generateSessionSummary(convId, [
      { role: "user", content: message },
      { role: "assistant", content: fullResponse },
    ]).catch(() => {});

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[LangGraph Error]", errMsg);
    appendEvent(convId, "session.error", { error: errMsg });
    sendEvent("error", { error: errMsg });
  }

  res.end();
}

// 도구 한국어 라벨 (기존 유지)
const TOOL_LABELS: Record<string, string> = {
  search_documents: "문서 검색",
  get_document_status: "인덱스 확인",
  list_documents: "문서 목록 조회",
  WebSearch: "웹 검색",
  WebFetch: "웹 페이지 수집",
  Bash: "코드 실행",
  Write: "파일 생성",
  Read: "파일 읽기",
  Glob: "파일 검색",
  Grep: "내용 검색",
};
```

---

## Phase 6 — 메모리 레이어 교체

### `server/memory/document-summary.ts` 수정

```diff
-import Anthropic from "@anthropic-ai/sdk";
+import { deepseekClient, DEEPSEEK_MODEL } from "../llm/deepseek.js";

-const client = new Anthropic();

 // client.messages.create() → deepseekClient.chat.completions.create()
-const resp = await client.messages.create({
-  model: "claude-haiku-4-5-20251001",
-  max_tokens: 400,
-  messages: [{ role: "user", content: prompt }],
-});
-const text = resp.content[0].type === "text" ? resp.content[0].text : "";

+const resp = await deepseekClient.chat.completions.create({
+  model: DEEPSEEK_MODEL,
+  max_tokens: 400,
+  messages: [{ role: "user", content: prompt }],
+  extra_body: { thinking: { type: "disabled" } },
+});
+const text = resp.choices[0]?.message?.content ?? "";
```

### `server/memory/session-summary.ts` 수정

```diff
-import Anthropic from "@anthropic-ai/sdk";
+import { deepseekClient, DEEPSEEK_MODEL } from "../llm/deepseek.js";

-const client = new Anthropic();

-const response = await client.messages.create({
-  model: "claude-haiku-4-5-20251001",
-  max_tokens: 500,
-  messages: [{ role: "user", content: summaryPrompt }],
-});
-const text = response.content[0].type === "text" ? response.content[0].text : "{}";

+const response = await deepseekClient.chat.completions.create({
+  model: DEEPSEEK_MODEL,
+  max_tokens: 500,
+  messages: [{ role: "user", content: summaryPrompt }],
+  extra_body: { thinking: { type: "disabled" } },
+});
+const text = response.choices[0]?.message?.content ?? "{}";
```

---

## Phase 7 — 환경변수 및 설정 변경

### `.env` 변경

```diff
-# Claude API (Required)
-ANTHROPIC_API_KEY=your-anthropic-key-here
+# DeepSeek API (Required)
+# Get your key from: https://platform.deepseek.com
+DEEPSEEK_API_KEY=your-deepseek-key-here

 # Server
 PORT=4001

 # Document paths
 DOCS_PATH=./docs
 DATA_PATH=./data
 DB_PATH=./data/rag.sqlite
```

### `.env.example` 동일하게 변경

### `render.yaml` 변경 (배포 설정)

```diff
-  - key: ANTHROPIC_API_KEY
+  - key: DEEPSEEK_API_KEY
     sync: false
```

### `server/index.ts` — MCP 클라이언트 초기화 추가

```diff
+import { initMcpClient, closeMcpClient } from "./mcp/mcp-client.js";

 async function bootstrap() {
   initDb();
   await loadSkills();
+
+  // MCP 클라이언트 초기화 (서버 시작 시 1회)
+  await initMcpClient({ memory: false, sequentialThinking: false });
+
   app.listen(PORT, () => console.log(`Server on :${PORT}`));
 }

+// 서버 종료 시 MCP 클라이언트 정리
+process.on("SIGTERM", async () => {
+  await closeMcpClient();
+  process.exit(0);
+});
+process.on("SIGINT", async () => {
+  await closeMcpClient();
+  process.exit(0);
+});
```

---

## Phase 8 — 검증

### 체크리스트

```
[ ] npm install 성공 (의존성 충돌 없음)
[ ] TypeScript 컴파일 오류 없음 (npx tsc --noEmit)
[ ] 서버 시작 성공 (npm run dev)
[ ] MCP 클라이언트 초기화 로그 확인
[ ] 문서 인덱싱 테스트 (docs/ 폴더에 파일 추가)
[ ] 기본 RAG 검색 테스트 ("문서에서 X를 찾아줘")
[ ] 서브에이전트 위임 테스트 ("PPT 만들어줘")
[ ] SSE 스트리밍 테스트 (토큰 실시간 수신 확인)
[ ] 세션 요약 생성 확인 (대화 후 session-summary 파일)
[ ] 문서 요약 생성 확인 (새 문서 업로드 후)
[ ] 멀티에이전트 테스트 (분석 + 문서 생성 복합 요청)
```

### 빠른 동작 확인

```bash
# 1. 빌드 확인
npx tsc --noEmit

# 2. 서버 시작
npm run dev

# 3. 기본 채팅 테스트
curl -X POST http://localhost:4001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "안녕하세요", "mode": "agent"}'

# 4. RAG 검색 테스트
curl -X POST http://localhost:4001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "문서 목록을 보여줘", "mode": "agent"}'
```

---

## 수정 불필요 파일

다음 파일/디렉토리는 Anthropic에 의존하지 않으므로 **수정 없이 재사용**:

| 경로 | 이유 |
|------|------|
| `server/db/` | SQLite/better-sqlite3만 사용 |
| `server/search/` | SQLite FTS5 + sqlite-vec |
| `server/ingestion/` | 파싱/청킹 로직 |
| `server/llm/embedder.ts` | Hugging Face (Anthropic 무관) |
| `server/llm/prompt.ts` | 순수 문자열 조합 |
| `server/agents/skill-loader.ts` | 파일 시스템 읽기 |
| `server/agents/skill-router.ts` | 순수 키워드 매칭 |
| `server/agents/registry.ts` | 메타데이터 배열 |
| `server/memory/` (6개 파일) | SQLite CRUD |
| `server/routes/` | Express 라우팅 |
| `server/tasks/` | DOCX/XLSX/PPTX 생성 |
| `server/config.ts` | 환경변수 읽기 |

---

## 리스크 및 주의사항

### 🔴 높은 리스크

| 리스크 | 내용 | 대응 |
|--------|------|------|
| MCP 프로세스 시작 오버헤드 | `@langchain/mcp-adapters`가 각 서버를 npx로 시작 (2-5초) | 서버 시작 시 1회만 초기화하여 재사용 |
| DeepSeek thinking 모드 | 기본값이 thinking 활성화 → tool calling 실패 | `extra_body: { thinking: { type: "disabled" } }` 필수 |
| LangGraph 에이전트 상태 관리 | `createReactAgent`의 메시지 히스토리 누적 | `maxIterations` 및 `recursionLimit` 설정 필수 |

### 🟡 중간 리스크

| 리스크 | 내용 | 대응 |
|--------|------|------|
| SSE 이벤트 구조 변경 | `streamEvents()`의 이벤트 타입이 기존과 다름 | 클라이언트 `client.ts` SSE 파서 검토 필요 |
| 에이전트 프롬프트 품질 | DeepSeek ≠ Claude, 프롬프트 재튜닝 필요 가능성 | 초기 테스트 후 시스템 프롬프트 조정 |
| `@langchain/mcp-adapters` 버전 | 빠르게 변화하는 패키지 | 버전 고정 후 사용 (`^` 대신 정확한 버전) |

### 💡 권장 사항

- **단계적 마이그레이션**: Phase 2(LLM 레이어)부터 시작하여 서버 부팅을 확인한 뒤 진행
- **직접 모드 유지**: `/api/chat?mode=direct`는 Phase 2 완료 후 즉시 동작 가능
- **에이전트 모드 마지막**: Phase 5(오케스트레이터) 완료 후 검증
- **롤백 플랜**: 각 Phase 완료 후 git commit 하여 롤백 지점 확보

---

## 예상 작업 시간

| Phase | 내용 | 예상 시간 |
|-------|------|----------|
| Phase 1 | 패키지 교체 | 30분 |
| Phase 2 | LLM 레이어 교체 | 1시간 |
| Phase 3 | MCP 서버 재작성 | 3-4시간 |
| Phase 4 | 에이전트 정의 재설계 | 2-3시간 |
| Phase 5 | 오케스트레이터 재설계 | 4-5시간 |
| Phase 6 | 메모리 레이어 교체 | 1시간 |
| Phase 7 | 환경변수/설정 변경 | 30분 |
| Phase 8 | 검증 | 2-3시간 |
| **합계** | | **14-18시간** |

---

*작성일: 2026-06-01*  
*대상 모델: DeepSeek V4 Flash (`deepseek-v4-flash`)*  
*마이그레이션 접근법: LangChain.js + LangGraph + @langchain/mcp-adapters*
