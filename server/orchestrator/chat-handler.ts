/**
 * Agent SDK Chat Handler — Multi-Agent Architecture
 *
 * Express SSE 응답을 Agent SDK query()로 처리.
 * 11개 전문 에이전트를 오케스트레이션.
 *
 * Managed Agents 패턴 차용:
 * - 세션 이벤트 로그 (append-only)
 * - 토큰 사용량 추적
 * - 도구 실행 상태 SSE 스트리밍
 *
 * SSE 이벤트: token, sources, status, done, error
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Response } from "express";
import { ragMcpServer } from "../mcp/rag-server.js";
import { search } from "../search/orchestrator.js";
import { buildAgentsForQuery } from "../agents/definitions.js";
import { predictNeededAgents } from "../agents/skill-router.js";
import {
  addMessage,
  createConversation,
} from "../memory/conversation-store.js";
import { logTask } from "../memory/task-log.js";
import { generateSessionSummary, getRecentSummaries } from "../memory/session-summary.js";
import { appendEvent } from "../memory/session-events.js";
import { saveSessionUsage } from "../memory/session-usage.js";
import { buildRoutingPrompt } from "../agents/registry.js";
import path from "path";
import { PATHS } from "../config.js";

// ==============================
// 외부 MCP 서버 설정
// ==============================
const MEMORY_FILE = PATHS.knowledgeGraph;

/**
 * 외부 MCP 서버 — 필요할 때만 포함 (npx 시작 오버헤드 2-5초/서버)
 * 매 query()마다 새로 시작되므로, 불필요한 서버를 제거하면 응답 속도 대폭 개선
 */
const MCP_MEMORY = {
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-memory"],
  env: { MEMORY_FILE_PATH: MEMORY_FILE },
};
const MCP_THINKING = {
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
};
const MCP_FETCH = {
  command: "npx",
  args: ["-y", "@modelcontextprotocol/server-fetch"],
};

/**
 * 메시지에 따라 필요한 외부 MCP 서버만 선택
 */
function selectMcpServers(message: string, neededAgents: string[]): Record<string, { command: string; args: string[]; env?: Record<string, string> }> {
  const servers: Record<string, { command: string; args: string[]; env?: Record<string, string> }> = {};
  const lowerMsg = message.toLowerCase();

  // memory: 프로파일링 키워드가 있을 때만 (npx 시작 비용 절감)
  if (neededAgents.includes("memory")) {
    servers.memory = MCP_MEMORY;
  }

  // sequential-thinking: 복잡한 분석 요청 시만
  if (lowerMsg.includes("분석") || lowerMsg.includes("비교") || lowerMsg.includes("전략") ||
      lowerMsg.includes("시나리오") || lowerMsg.includes("단계")) {
    servers["sequential-thinking"] = MCP_THINKING;
  }

  // fetch: 웹 URL 수집 필요 시만
  if (neededAgents.includes("web-research") ||
      lowerMsg.includes("url") || lowerMsg.includes("http") || lowerMsg.includes("웹사이트")) {
    servers.fetch = MCP_FETCH;
  }

  return servers;
}

const PROJECT_ROOT = path.resolve(".");

// ==============================
// 도구/에이전트 한국어 라벨
// ==============================
const TOOL_LABELS: Record<string, string> = {
  "mcp__rag__search_documents": "문서 검색",
  "mcp__rag__get_document_status": "인덱스 확인",
  "mcp__rag__list_documents": "문서 목록 조회",
  "mcp__rag__save_work_journal": "작업 기록 저장",
  "mcp__rag__query_work_journal": "작업 기록 조회",
  "mcp__memory__search_nodes": "기억 검색",
  "mcp__memory__create_entities": "정보 기억",
  "mcp__sequential-thinking__sequentialthinking": "단계별 분석",
  "mcp__fetch__fetch": "웹 콘텐츠 수집",
  Bash: "코드 실행",
  Write: "파일 생성",
  Read: "파일 읽기",
  Glob: "파일 검색",
  Grep: "내용 검색",
  WebSearch: "웹 검색",
  WebFetch: "웹 페이지 수집",
};

const AGENT_LABELS: Record<string, string> = {
  "rag-search": "📄 문서 검색",
  "web-research": "🌐 웹 리서치",
  "file-analyst": "🔍 파일 분석",
  memory: "🧠 기억 저장",
  "doc-writer": "📝 문서 작성",
  "presentation-maker": "📊 PPT 제작",
  "spreadsheet-maker": "📗 엑셀 제작",
  "business-analyst": "📈 비즈니스 분석",
  "hr-specialist": "👥 HR",
  "education-specialist": "🎓 교육 설계",
  "operations-support": "⚙️ 운영 지원",
};

/**
 * 오케스트레이터 시스템 프롬프트 생성
 */
function buildOrchestratorPrompt(userContext?: string, recentFiles?: string, sessionSummaries?: string): string {
  const routingGuide = buildRoutingPrompt();

  const userSection = userContext
    ? `\n## 사용자 컨텍스트 (지식 그래프에서 로드됨)\n${userContext}\n→ 위 정보를 참고하여 사용자에게 맞춤형 응답을 제공하세요.\n`
    : "";

  const filesSection = recentFiles
    ? `\n## 최근 생성된 파일\n사용자가 "이 파일", "아까 만든 것", "그 요약집" 등으로 참조하면 아래 파일을 의미합니다:\n${recentFiles}\n이 파일들은 RAG 인덱스에 포함되어 있어 search_documents로 내용을 검색할 수 있습니다.\n파일 경로: data/output/파일명\n`
    : "";

  const summarySection = sessionSummaries
    ? `\n## 이전 작업 이력\n사용자와의 이전 대화 요약입니다. "이전에", "지난번에", "아까" 등의 참조 시 활용하세요:\n${sessionSummaries}\n`
    : "";

  return `당신은 Mini-RAG 로컬 AI 코워크 플랫폼의 오케스트레이터입니다.

## 핵심 역할
사용자의 자연어 요청을 분석하고, 최적의 전문 에이전트에게 위임합니다.
당신은 직접 작업하지 않고, 11개의 전문 에이전트를 지휘합니다.
${userSection}${filesSection}${summarySection}
${routingGuide}

## 문서 검색 전략 (가장 중요한 규칙!)
**모든 질문에 대해 먼저 search_documents를 호출하세요.** 절대로 검색 없이 답변하거나 되묻지 마세요.
- 사용자가 특정 사람/항목/데이터를 질문하면 → 해당 키워드로 search_documents 호출
- 검색 결과가 있으면 → 그 내용으로 답변
- 검색 결과가 없을 때만 → "인덱싱된 문서에서 관련 정보를 찾지 못했습니다"
- **복잡한 질문** (여러 문서 비교, 심층 분석) → rag-search 에이전트에 위임
⚠️ 절대로 사용자에게 "어떤 문서인가요?", "맥락을 알려주세요" 등 되묻지 마세요. 먼저 검색하세요.

## 다국어 검색 (중요!)
인덱싱된 문서는 주로 한국어입니다. 사용자가 영어/일본어 등으로 질문해도:
- 영어 이름(Kim Minji) → **한국어 이름(김민지)으로도 검색**하세요
- 영어 키워드(education, finance) → **한국어 동의어(교육, 재무)로도 검색**하세요
- 사전 검색 결과에 데이터가 있으면 그 데이터를 기반으로 **사용자 언어로** 답변하세요
- 사전 검색 결과에 한국어 데이터가 포함되어 있으면, 그것이 바로 관련 데이터입니다

## 파일 생성 시 RAG 검색 필수 (매우 중요!)
보고서, PPT, 엑셀 등 파일 생성 요청 시 **반드시 다음 절차를 따르세요:**
1. **먼저** search_documents로 관련 자료를 검색 (핵심 키워드로 2~3회 검색)
2. 검색 결과에서 핵심 내용을 정리
3. 정리된 내용을 포함하여 전문 에이전트(doc-writer, presentation-maker, spreadsheet-maker)에 위임
4. 위임할 때 **검색된 자료 내용을 프롬프트에 반드시 포함**: "다음 자료를 기반으로 작성하세요: [검색 결과 요약]"

⚠️ 검색 없이 에이전트에 위임하면 에이전트가 일반 지식으로만 문서를 생성하게 됩니다.
인덱싱된 문서의 실제 데이터가 반영되어야 의미 있는 결과물이 나옵니다.

## 복합 작업 처리
분석 + 파일 생성이 결합된 요청은 순서대로 위임하세요.

## 사용자 프로파일링 (자동)
대화에서 사용자 정보(이름, 역할, 회사, 선호도, 피드백)를 감지하면 memory 에이전트에 위임하여 저장.

## 도구 직접 사용
- 맥락: get_conversation_history, get_user_intents
- 지식: mcp__memory (저장/조회)
- 추론: mcp__sequential-thinking
- 피드백: add_feedback_to_journal

## 위임 원칙
- 문서 검색 → rag-search, 파일 생성 → 해당 에이전트, 분석 → 전문 에이전트
- 사용자 정보 감지 → memory, 일반 대화 → 직접 답변

## 답변 규칙
- **사용자의 언어로 답변하세요.** 사용자가 한국어로 질문하면 한국어로, 영어면 영어로, 일본어면 일본어로 답변합니다.
- 마크다운 활용, 출처 표시, 지어내기 금지
- 에이전트에 위임할 때도 사용자의 언어를 명시하세요: "사용자 언어: [감지된 언어]"`;
}

interface ChatOptions {
  message: string;
  topK?: number;
  searchMode?: string;
  sessionId?: string;
}

/**
 * 최근 생성된 파일 목록 로드 (대화 컨텍스트에 포함)
 */
async function loadRecentOutputFiles(): Promise<string | undefined> {
  try {
    const { readdir, stat: fsStat } = await import("fs/promises");
    const outputDir = PATHS.output;
    const entries = await readdir(outputDir);
    const files: { name: string; modified: string }[] = [];

    for (const name of entries) {
      if (name.startsWith(".")) continue;
      const info = await fsStat(path.join(outputDir, name));
      if (info.isFile()) {
        files.push({ name, modified: info.mtime.toISOString() });
      }
    }

    if (files.length === 0) return undefined;

    // 최신순 10개
    files.sort((a, b) => b.modified.localeCompare(a.modified));
    const recent = files.slice(0, 10);
    return recent.map((f) => `- ${f.name} (${f.modified.slice(0, 16)})`).join("\n");
  } catch {
    return undefined;
  }
}

/**
 * 이전 세션 요약 로드 (claude-mem 패턴)
 */
function loadSessionSummaries(): string | undefined {
  try {
    const summaries = getRecentSummaries(3);
    if (summaries.length === 0) return undefined;

    const lines = summaries.map((s, i) => {
      const parts = [];
      if (s.request) parts.push(`요청: ${s.request}`);
      if (s.completed) parts.push(`완료: ${s.completed}`);
      if (s.next_steps) parts.push(`다음: ${s.next_steps}`);
      return `${i + 1}. ${parts.join(" | ")}`;
    });

    return lines.join("\n");
  } catch {
    return undefined;
  }
}

/**
 * 지식 그래프에서 사용자 컨텍스트 로드
 */
async function loadUserContext(): Promise<string | undefined> {
  try {
    const { readFile } = await import("fs/promises");
    const raw = await readFile(MEMORY_FILE, "utf-8");
    const graph = JSON.parse(raw);
    if (!graph.entities || graph.entities.length === 0) return undefined;

    const lines: string[] = [];
    for (const entity of graph.entities) {
      if (!entity.observations || entity.observations.length === 0) continue;
      lines.push(`**${entity.name}** (${entity.entityType}): ${entity.observations.join("; ")}`);
    }
    return lines.length > 0 ? lines.join("\n") : undefined;
  } catch {
    return undefined;
  }
}

export async function handleChat(res: Response, options: ChatOptions) {
  const { message, topK = 5, searchMode = "auto", sessionId } = options;

  const convId = sessionId || createConversation();

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Session-Id", convId);

  // Store user message (legacy + event log)
  addMessage(convId, { role: "user", content: message, timestamp: new Date().toISOString() });
  appendEvent(convId, "user.message", { content: message });

  const userContext = await loadUserContext();
  const recentFiles = await loadRecentOutputFiles();
  const sessionSummaries = loadSessionSummaries();

  // 동적 에이전트 빌드: 필요한 에이전트만 Skills 로드
  const neededAgents = predictNeededAgents(message);
  const dynamicAgents = await buildAgentsForQuery(neededAgents);

  // 동적 MCP 서버 선택: 필요한 서버만 시작 (npx 오버헤드 최소화)
  const dynamicMcpServers = selectMcpServers(message, neededAgents);
  const mcpNames = Object.keys(dynamicMcpServers);
  console.log(`[MCP] ${mcpNames.length} external servers: ${mcpNames.join(", ") || "none (fast mode)"}`);

  // 사전 RAG 검색: 모든 질문에 대해 서버 측에서 먼저 검색 수행
  // 전체 메시지 + 개별 키워드 검색으로 관련 문서를 확실히 찾음
  let preSearchContext = "";
  try {
    const seen = new Set<number>();
    const allResults: Awaited<ReturnType<typeof search>> = [];

    // 1차: 전체 메시지로 검색
    const fullResults = await search(message, { topK: topK, searchMode: searchMode as any });
    for (const r of fullResults) {
      if (!seen.has(r.id)) { seen.add(r.id); allResults.push(r); }
    }

    // 2차: 핵심 키워드를 개별 검색 (고유명사 매칭 강화)
    const keywords = extractKeywords(message).split(/\s+/).filter((k) => k.length >= 2);
    for (const kw of keywords.slice(0, 3)) { // 상위 3개 키워드
      try {
        const kwResults = await search(kw, { topK: 3, searchMode: "fts" });
        for (const r of kwResults) {
          if (!seen.has(r.id)) { seen.add(r.id); allResults.push(r); }
        }
      } catch { /* skip */ }
    }

    // 3차: 비영문 스크립트 또는 결과 부족 시 → 다국어 동의어로 재검색
    const detectedLang = detectScript(message);
    if (detectedLang !== "english" && allResults.length < 3) {
      const multilingualKw = expandMultilingualSearch(message, detectedLang);
      for (const kw of multilingualKw) {
        try {
          const kwResults = await search(kw, { topK: 3, searchMode: "fts" });
          for (const r of kwResults) {
            if (!seen.has(r.id)) { seen.add(r.id); allResults.push(r); }
          }
        } catch { /* skip */ }
      }
    }

    if (allResults.length > 0) {
      const contextParts: string[] = [];
      for (const r of allResults.slice(0, 7)) {
        const meta = r.metadata ? JSON.parse(r.metadata) : {};
        const pageInfo = meta.page ? ` (p.${meta.page})` : "";
        const sheetInfo = meta.sheet ? ` [${meta.sheet}]` : "";
        contextParts.push(`[${r.file_name}${pageInfo}${sheetInfo}]\n${r.content.slice(0, 600)}`);
      }
      preSearchContext = `\n\n## 사전 검색 결과 (자동)\n아래는 사용자 질문에 대해 인덱싱된 문서에서 자동 검색한 결과입니다.\n**이 데이터에 답이 있으면 반드시 이 데이터를 기반으로 답변하세요.**\n추가 검색이 필요하면 search_documents를 호출할 수 있습니다.\n\n${contextParts.join("\n\n---\n")}`;
      console.log(`[PreSearch] ${allResults.length} results (full=${fullResults.length}, keywords=${keywords.join(",")})`);
    } else {
      console.log(`[PreSearch] No results for: "${message.slice(0, 40)}"`);
    }
  } catch (e) {
    console.warn("[PreSearch] Failed:", (e as Error).message?.slice(0, 60));
  }

  let fullResponse = "";
  let sourcesEmitted = false;

  try {
    const agentQuery = query({
      prompt: `사용자 질문에 답변하세요. 검색 모드: ${searchMode}, 최대 결과: ${topK}\n\n질문: ${message}${preSearchContext}`,
      options: {
        model: "claude-haiku-4-5-20251001",
        cwd: PROJECT_ROOT,
        allowedTools: [
          "Agent",
          "mcp__rag__search_documents", "mcp__rag__get_document_status", "mcp__rag__list_documents",
          "mcp__rag__save_user_intent", "mcp__rag__get_user_intents",
          "mcp__rag__log_task_execution", "mcp__rag__get_conversation_history",
          // 동적 MCP 도구 — 포함된 서버의 도구만 허용
          ...(dynamicMcpServers.memory ? ["mcp__memory__*"] : []),
          ...(dynamicMcpServers["sequential-thinking"] ? ["mcp__sequential-thinking__*"] : []),
          ...(dynamicMcpServers.fetch ? ["mcp__fetch__*"] : []),
          "Bash",
          "mcp__rag__save_work_journal", "mcp__rag__query_work_journal", "mcp__rag__add_feedback_to_journal",
          "WebSearch", "WebFetch", "Read", "Write", "Glob", "Grep",
        ],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        agents: dynamicAgents,
        mcpServers: { rag: ragMcpServer, ...dynamicMcpServers },
        systemPrompt: buildOrchestratorPrompt(userContext, recentFiles, sessionSummaries),
        maxTurns: 15,
        maxBudgetUsd: 0.60,
      },
    });

    for await (const msg of agentQuery) {
      const m = msg as any;

      // 디버그: 모든 이벤트 타입 로깅 (parent 여부 + 내용 일부)
      const subtype = m.subtype ? `.${m.subtype}` : "";
      const parent = m.parent_tool_use_id ? ` [sub]` : ` [root]`;
      const preview = msg.type === "assistant" && m.message?.content?.[0]?.text
        ? ` "${m.message.content[0].text.slice(0, 50)}"`
        : "";
      console.log(`[SSE] ${msg.type}${subtype}${parent}${m.tool_name ? ` (${m.tool_name})` : ""}${preview}`);

      // ── Assistant text → stream tokens ──
      if (msg.type === "assistant" && m.message?.content) {
        for (const block of m.message.content) {
          if (block.type === "text" && block.text) {
            fullResponse += block.text;
            res.write(`event: token\ndata: ${JSON.stringify({ text: block.text })}\n\n`);
          }
        }
      }

      // ── stream_event → 토큰 단위 스트리밍 (서브에이전트 포함) ──
      if (msg.type === "stream_event" && m.event) {
        const evt = m.event;
        // content_block_delta → text_delta: 실시간 토큰
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta?.text) {
          // 서브에이전트의 중간 출력은 무시 (최종 assistant 메시지만 사용)
          // 단, 부모가 없으면(오케스트레이터 직접 출력) 스트리밍
          if (!m.parent_tool_use_id) {
            fullResponse += evt.delta.text;
            res.write(`event: token\ndata: ${JSON.stringify({ text: evt.delta.text })}\n\n`);
          }
        }
      }

      // ── User (sub) → 서브에이전트 위임 시작 ──
      if (msg.type === "user" && m.parent_tool_use_id) {
        // 서브에이전트에게 위임하는 내부 user 메시지 — 상태 표시
        const agentHint = typeof m.message?.content === "string"
          ? m.message.content.slice(0, 30)
          : "";
        res.write(`event: status\ndata: ${JSON.stringify({ text: `에이전트 작업 중...` })}\n\n`);
      }

      // ── Assistant (sub) → 서브에이전트 응답 중 상태 갱신 ──
      if (msg.type === "assistant" && m.parent_tool_use_id && m.message?.content?.[0]?.text) {
        // 서브에이전트가 응답 생성 중 — "거의 완료" 상태로 업데이트
        res.write(`event: status\ndata: ${JSON.stringify({ text: `응답 생성 중...` })}\n\n`);
      }

      // ── Tool progress → SSE status (실시간 상태) ──
      if (msg.type === "tool_progress") {
        const label = TOOL_LABELS[m.tool_name] || m.tool_name;
        res.write(`event: status\ndata: ${JSON.stringify({ text: `${label}...`, tool: m.tool_name })}\n\n`);
        appendEvent(convId, "agent.tool_progress", { tool: m.tool_name, elapsed: m.elapsed_time_seconds });
      }

      // ── System events → agent delegation status ──
      if (msg.type === "system") {
        if (m.subtype === "task_started") {
          const desc = m.description || "";
          const agentLabel = AGENT_LABELS[desc] || desc;
          res.write(`event: status\ndata: ${JSON.stringify({ text: `${agentLabel} 작업 중...`, agent: desc })}\n\n`);
          appendEvent(convId, "agent.delegate", { agent: desc, prompt: m.prompt?.slice(0, 200) }, desc);
        }
        if (m.subtype === "task_progress") {
          res.write(`event: status\ndata: ${JSON.stringify({ text: "에이전트 작업 진행 중..." })}\n\n`);
        }
      }

      // ── Tool use summary → extract sources ──
      if (msg.type === "tool_use_summary" && !sourcesEmitted) {
        const m = msg as any;
        appendEvent(convId, "agent.tool_summary", { summary: m.summary });

        try {
          const resultContent = JSON.stringify(msg);
          if (resultContent.includes("검색 결과") || resultContent.includes("search")) {
            const sourceMatches = resultContent.matchAll(
              /\[(\d+)\]\s+(.+?)\s+—\s+(.+?)\s+\[(\w+)\]/g
            );
            const sources = [];
            for (const match of sourceMatches) {
              sources.push({
                title: match[2],
                file_name: match[3].split(" (")[0],
                format: match[4].toLowerCase(),
                score: 0,
              });
            }
            if (sources.length > 0) {
              res.write(`event: sources\ndata: ${JSON.stringify({ chunks: sources, session_id: convId })}\n\n`);
              appendEvent(convId, "session.sources", { chunks: sources });
              sourcesEmitted = true;
            }
          }
        } catch { /* ignore */ }
      }

      // ── Result → usage tracking + session complete ──
      if (msg.type === "result") {
        const m = msg as any;

        if (!sourcesEmitted) {
          res.write(`event: sources\ndata: ${JSON.stringify({ chunks: [], session_id: convId })}\n\n`);
        }

        // 토큰 사용량 추적 (Managed Agents 패턴)
        if (m.subtype === "success" && m.usage) {
          const usage = {
            session_id: convId,
            input_tokens: m.usage?.input_tokens || 0,
            output_tokens: m.usage?.output_tokens || 0,
            cache_read_tokens: m.usage?.cache_read_input_tokens || 0,
            total_cost_usd: m.total_cost_usd || 0,
            num_turns: m.num_turns || 0,
            model: "claude-haiku-4-5-20251001",
          };
          saveSessionUsage(usage);
          appendEvent(convId, "session.done", {
            cost_usd: usage.total_cost_usd,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            num_turns: usage.num_turns,
          });
        } else if (m.subtype === "error") {
          appendEvent(convId, "session.error", { error: m.result || "Unknown error" });
        }
      }
    }

    // Store assistant response (legacy + event log)
    addMessage(convId, { role: "assistant", content: fullResponse, timestamp: new Date().toISOString() });
    appendEvent(convId, "agent.message", { content: fullResponse });

    logTask(
      convId,
      `Agent SDK query: "${message.slice(0, 50)}${message.length > 50 ? "..." : ""}"`,
      `Response generated via Agent SDK (11 agents)`,
      []
    );

    res.write(`event: done\ndata: ${JSON.stringify({ session_id: convId })}\n\n`);

    // 비동기 세션 요약 생성 (응답 지연 없음, 백그라운드)
    const allMessages = [
      { role: "user", content: message },
      { role: "assistant", content: fullResponse },
    ];
    generateSessionSummary(convId, allMessages).catch(() => {});
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Agent SDK Error]", errMsg);
    appendEvent(convId, "session.error", { error: errMsg });
    res.write(`event: error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`);
  }

  res.end();
}

/**
 * 메시지에서 검색용 핵심 키워드 추출
 * 조사, 어미, 일반 동사를 제거하고 명사/고유명사만 남김
 */
function extractKeywords(message: string): string {
  // 한국어 조사/어미/일반 표현 제거
  const stopPatterns = [
    /을|를|이|가|은|는|의|에|에서|으로|로|와|과|에게|한테|까지|부터|도|만|뿐|밖에/g,
    /해줘|알려줘|보여줘|찾아줘|말해줘|설명해줘|정리해줘|만들어줘|작성해줘/g,
    /무엇|어떤|어디|누구|언제|어떻게|왜/g,
    /좀|다|잘|더|좀더|그|이|저|것/g,
  ];

  let cleaned = message;
  for (const pattern of stopPatterns) {
    cleaned = cleaned.replace(pattern, " ");
  }

  // 연속 공백 정리 + 빈 토큰 제거
  const tokens = cleaned.split(/\s+/).filter((t) => t.length >= 2);
  return tokens.join(" ").trim();
}

/**
 * 스크립트 기반 언어 감지
 * Unicode 범위로 한국어/영어/싱할라어/타밀어 구분
 */
function detectScript(text: string): string {
  // 순서 중요: specific scripts 먼저
  if (/[\u0D80-\u0DFF]/.test(text)) return "sinhala";    // 𑄃–𑄹
  if (/[\u0B80-\u0BFF]/.test(text)) return "tamil";       // த–்
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) return "korean";
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return "japanese";
  if (/^[\u0020-\u007E\s\d.,!?'"()-]+$/.test(text)) return "english";
  return "mixed";
}

/**
 * 비영문 메시지에서 한국어 검색 키워드를 추출
 * 싱할라어/타밀어/영어 → 한국어 동의어 변환으로 FTS5 한국어 인덱스와 매칭
 */
function expandMultilingualSearch(message: string, lang: string): string[] {
  const lower = message.toLowerCase();
  const koreanKeywords: string[] = [];

  // 언어별 동의어 매트릭스
  const TRANS_MAP: Record<string, Record<string, string>> = {
    english: {
      "education": "교육", "training": "교육", "learning": "학습",
      "career": "경력", "competency": "역량", "competencies": "역량",
      "skill": "역량", "skills": "역량", "job": "직무",
      "finance": "재무", "financial": "재무", "accounting": "회계",
      "data analysis": "데이터분석", "data analyst": "데이터분석",
      "certification": "자격증", "certificate": "자격증",
      "curriculum": "커리큘럼", "assessment": "평가",
      "recruitment": "채용", "marketing": "마케팅", "security": "보안",
      "design": "설계", "consultant": "컨설턴트", "engineering": "공학",
      "developer": "개발자", "manager": "매니저", "analyst": "분석가",
      "history": "이력", "recommend": "추천", "future": "미래",
    },
    sinhala: {
      // සිංහල (Sinhala) → Korean
      "education": "교육", "training": "교육", "learning": "학습",
      "career": "경력", "job": "직무", "work": "일",
      "skill": "역량", "skills": "역량", "competency": "역량",
      "university": "대학교", "school": "학교",
      "course": "과정", "curriculum": "커리큘럼",
      "certificate": "자격증", "certification": "자격증",
      "recommendation": "추천", "future": "미래",
      "analysis": "분석", "data": "데이터",
      "history": "이력", "financial": "재무",
    },
    tamil: {
      // தமிழ் (Tamil) → Korean
      "education": "교육", "training": "교육", "learning": "학습",
      "career": "경력", "job": "직무", "work": "일",
      "skill": "역량", "skills": "역량", "competency": "역량",
      "university": "대학교", "school": "학교",
      "course": "과정", "curriculum": "커리큘럼",
      "certificate": "자격증", "certification": "자격증",
      "recommendation": "추천", "future": "미래",
      "analysis": "분석", "data": "데이터",
      "history": "이력", "financial": "재무",
    },
    japanese: {
      "教育": "교육", "訓練": "교육", "学習": "학습",
      "キャリア": "경력", " career": "경력", "job": "직무",
      "スキル": "역량", "能力": "역량",
      "大学": "대학교", "学校": "학교",
      "課程": "과정", "curriculum": "커리큘럼",
      "証明書": "자격증", "資格": "자격증",
      "推薦": "추천", "未来": "미래",
    },
  };

  const trans = TRANS_MAP[lang] || TRANS_MAP.english;
  for (const [foreign, kr] of Object.entries(trans)) {
    if (lower.includes(foreign)) {
      koreanKeywords.push(kr);
    }
  }

  // 영문 이름 패턴 감지 (Title Case: "Kim Minji", "Park Seo-yeon")
  // → 한국어 데이터에서 이름 매칭을 위해 교육이력 전체를 검색
  const namePattern = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)/g;
  if (namePattern.test(message)) {
    koreanKeywords.push("교육이력");
  }

  return [...new Set(koreanKeywords)];
}
