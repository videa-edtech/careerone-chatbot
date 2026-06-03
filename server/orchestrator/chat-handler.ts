/**
 * LangGraph Chat Handler — DeepSeek V4 Flash 마이그레이션
 *
 * @anthropic-ai/claude-agent-sdk query() 제거
 * → LangGraph createReactAgent + streamEvents("v2") 로 교체
 *
 * SSE 이벤트: token, sources, status, done, error
 */
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import type { Response } from "express";
import { createDeepSeekChat } from "../llm/deepseek.js";
import { buildRagTools } from "../mcp/mcp-client.js";
import { search } from "../search/orchestrator.js";
import { buildAgentsForQuery } from "../agents/definitions.js";
import { predictNeededAgents } from "../agents/skill-router.js";
import {
  addMessage,
  resolveConversationForUser,
} from "../memory/conversation-store.js";
import { logTask } from "../memory/task-log.js";
import { generateSessionSummary, getRecentSummaries } from "../memory/session-summary.js";
import { appendEvent } from "../memory/session-events.js";
import { saveSessionUsage } from "../memory/session-usage.js";
import { buildRoutingPrompt } from "../agents/registry.js";
import path from "path";
import { PATHS } from "../config.js";

// ==============================
// 도구/에이전트 한국어 라벨
// ==============================
const TOOL_LABELS: Record<string, string> = {
  "search_documents": "문서 검색",
  "get_document_status": "인덱스 확인",
  "list_documents": "문서 목록 조회",
  "save_work_journal": "작업 기록 저장",
  "query_work_journal": "작업 기록 조회",
  "Bash": "코드 실행",
  "Write": "파일 생성",
  "Read": "파일 읽기",
  "Glob": "파일 검색",
  "Grep": "내용 검색",
  "WebSearch": "웹 검색",
  "WebFetch": "웹 페이지 수집",
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
    ? `\n## 최근 생성된 파일\n사용자가 "이 파일", "아까 만든 것" 등으로 참조하면 아래 파일을 의미합니다:\n${recentFiles}\n`
    : "";

  const summarySection = sessionSummaries
    ? `\n## 이전 작업 이력\n${sessionSummaries}\n`
    : "";

  return `당신은 Mini-RAG 로컬 AI 코워크 플랫폼의 오케스트레이터입니다.

## 핵심 역할
사용자의 자연어 요청을 분석하고, 최적의 전문 에이전트에게 위임합니다.
${userSection}${filesSection}${summarySection}
${routingGuide}

## 문서 검색 전략 (가장 중요한 규칙!)
**모든 질문에 대해 먼저 search_documents를 호출하세요.** 절대로 검색 없이 답변하거나 되묻지 마세요.
- 검색 결과가 있으면 → 그 내용으로 답변
- 검색 결과가 없을 때만 → "인덱싱된 문서에서 관련 정보를 찾지 못했습니다"
⚠️ 절대로 사용자에게 "어떤 문서인가요?" 등 되묻지 마세요. 먼저 검색하세요.

## 다국어 검색 (중요!)
영어 이름(Kim Minji) → 한국어 이름(김민지)으로도 검색하세요.

## 파일 생성 — 오케스트레이터가 직접 도구 호출 (최우선 규칙!)
Word/PPT/Excel 파일 생성 요청 시 아래 순서를 반드시 따르세요:
1. search_documents로 관련 자료 검색 (선택)
2. **create_docx(Word), create_pptx(PPT), create_excel(Excel) 도구를 이 오케스트레이터가 직접 호출**
3. 도구가 반환한 다운로드 경로를 응답에 포함

🚫 doc_writer / presentation_maker / spreadsheet_maker 서브에이전트에 **절대 위임하지 마세요**.
🚫 도구 호출 없이 "파일을 만들었습니다"라고 말하지 마세요. 반드시 도구를 직접 실행하세요.

## 답변 규칙
- **사용자의 언어로 답변하세요.**
- 마크다운 활용, 출처 표시, 지어내기 금지`;
}

interface ChatOptions {
  message: string;
  topK?: number;
  searchMode?: string;
  sessionId?: string;
  userIp: string;
}

/**
 * 최근 생성된 파일 목록 로드
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
    files.sort((a, b) => b.modified.localeCompare(a.modified));
    return files.slice(0, 10).map((f) => `- ${f.name} (${f.modified.slice(0, 16)})`).join("\n");
  } catch {
    return undefined;
  }
}

/**
 * 이전 세션 요약 로드
 */
function loadSessionSummaries(userIp: string): string | undefined {
  try {
    const summaries = getRecentSummaries(3, userIp);
    if (summaries.length === 0) return undefined;

    return summaries.map((s, i) => {
      const parts = [];
      if (s.request) parts.push(`요청: ${s.request}`);
      if (s.completed) parts.push(`완료: ${s.completed}`);
      if (s.next_steps) parts.push(`다음: ${s.next_steps}`);
      return `${i + 1}. ${parts.join(" | ")}`;
    }).join("\n");
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
    const raw = await readFile(PATHS.knowledgeGraph, "utf-8");
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

/**
 * 사전 RAG 검색 수행
 */
async function runPreSearch(
  message: string,
  topK: number,
  searchMode: string
): Promise<string> {
  try {
    const seen = new Set<number>();
    const allResults: Awaited<ReturnType<typeof search>> = [];

    // 1차: 전체 메시지로 검색
    const fullResults = await search(message, { topK, searchMode: searchMode as any });
    for (const r of fullResults) {
      if (!seen.has(r.id)) { seen.add(r.id); allResults.push(r); }
    }

    // 2차: 핵심 키워드 개별 검색
    const keywords = extractKeywords(message).split(/\s+/).filter((k) => k.length >= 2);
    for (const kw of keywords.slice(0, 3)) {
      try {
        const kwResults = await search(kw, { topK: 3, searchMode: "fts" });
        for (const r of kwResults) {
          if (!seen.has(r.id)) { seen.add(r.id); allResults.push(r); }
        }
      } catch { /* skip */ }
    }

    // 3차: 영문 메시지 한국어 동의어 검색
    const isEnglish = /^[a-zA-Z\s\d.,!?'"()-]+$/.test(message.trim());
    if (isEnglish && allResults.length < 3) {
      for (const kw of expandSearchToKorean(message)) {
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
      console.log(`[PreSearch] ${allResults.length} results`);
      return `\n\n## 사전 검색 결과 (자동)\n아래는 사용자 질문에 대해 인덱싱된 문서에서 자동 검색한 결과입니다.\n**이 데이터에 답이 있으면 반드시 이 데이터를 기반으로 답변하세요.**\n\n${contextParts.join("\n\n---\n")}`;
    }

    console.log(`[PreSearch] No results for: "${message.slice(0, 40)}"`);
    return "";
  } catch (e) {
    console.warn("[PreSearch] Failed:", (e as Error).message?.slice(0, 60));
    return "";
  }
}

/**
 * 에이전트별 서브에이전트 도구 생성
 * LangGraph에서 각 서브에이전트를 Tool로 래핑
 */
function buildSubAgentTools(
  agentSpecs: Record<string, { name: string; description: string; prompt: string; tools: string[] }>,
  ragTools: DynamicStructuredTool[]
): DynamicStructuredTool[] {
  const subAgentTools: DynamicStructuredTool[] = [];

  for (const [agentName, spec] of Object.entries(agentSpecs)) {
    const agentTool = tool(
      async (args: { task: string }) => {
        try {
          const agentLlm = createDeepSeekChat({ temperature: 0 });

          // 이 에이전트에 허용된 도구만 필터링
          const allowedTools = ragTools.filter((t) => spec.tools.includes(t.name));

          // ── 파일 생성 에이전트: 원샷(one-shot) 패턴 ──
          // ReAct 루프 없이 LLM→tool_call 추출→직접 실행으로 무한 루프 방지
          const FILE_AGENTS = new Set(["doc-writer", "presentation-maker", "spreadsheet-maker"]);
          if (FILE_AGENTS.has(agentName)) {
            const fileTools = allowedTools.filter(t =>
              ["create_docx", "create_pptx", "create_excel"].includes(t.name)
            );
            if (fileTools.length > 0) {
              const llmWithTools = agentLlm.bindTools(fileTools, { tool_choice: "any" });
              const response = await llmWithTools.invoke([
                new SystemMessage(spec.prompt + `\n\n반드시 ${fileTools.map(t=>t.name).join("/")} 도구를 호출하여 실제 파일을 생성하세요.`),
                new HumanMessage(args.task),
              ]);
              // tool_calls에서 첫 번째 파일 생성 도구 실행
              const toolCalls = (response as any).tool_calls as Array<{ name: string; args: Record<string, unknown> }> | undefined;
              if (toolCalls && toolCalls.length > 0) {
                const tc = toolCalls[0];
                const targetTool = fileTools.find(t => t.name === tc.name);
                if (targetTool) {
                  const result = await targetTool.invoke(tc.args);
                  return String(result);
                }
              }
              // tool_call이 없으면 텍스트 응답 반환
              return typeof response.content === "string" ? response.content : `[${agentName}] 파일 생성 도구 호출 실패`;
            }
          }

          // ── 일반 에이전트: ReAct 루프 ──
          const agentExecutor = createReactAgent({
            llm: agentLlm,
            tools: allowedTools,
            stateModifier: spec.prompt,
          });

          const result = await agentExecutor.invoke(
            { messages: [new HumanMessage(args.task)] },
            { recursionLimit: 10 }
          );
          const lastMsg = result.messages[result.messages.length - 1];
          return typeof lastMsg.content === "string" ? lastMsg.content : JSON.stringify(lastMsg.content);

        } catch (e) {
          console.error(`[SubAgent:${agentName}] ERROR:`, (e as Error).message?.slice(0, 200));
          return `[${agentName}] 에이전트 오류: ${(e as Error).message}`;
        }
      },
      {
        name: agentName.replace(/-/g, "_"),
        description: spec.description,
        schema: z.object({
          task: z.string().describe("에이전트에게 위임할 작업 내용"),
        }),
      }
    ) as unknown as DynamicStructuredTool;

    subAgentTools.push(agentTool);
  }

  return subAgentTools;
}

export async function handleChat(res: Response, options: ChatOptions) {
  const { message, topK = 5, searchMode = "auto", sessionId, userIp } = options;

  const convId = resolveConversationForUser(userIp, sessionId);

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Session-Id", convId);

  // 사용자 메시지 저장
  addMessage(convId, { role: "user", content: message, timestamp: new Date().toISOString() });
  appendEvent(convId, "user.message", { content: message });

  const [userContext, recentFiles, preSearchContext] = await Promise.all([
    loadUserContext(),
    loadRecentOutputFiles(),
    runPreSearch(message, topK, searchMode),
  ]);
  const sessionSummaries = loadSessionSummaries(userIp);

  // 동적 에이전트 빌드
  const neededAgents = predictNeededAgents(message);
  const agentSpecs = await buildAgentsForQuery(neededAgents);

  console.log(`[Chat] Agents needed: ${neededAgents.join(", ") || "orchestrator-only"}`);

  // RAG 도구 빌드
  const ragTools = buildRagTools({ userIp });

  // 서브에이전트 도구 빌드 (에이전트를 tool로 래핑)
  // 파일 생성 에이전트는 제외 — 오케스트레이터가 create_docx/pptx/excel을 직접 호출
  const subAgentTools = buildSubAgentTools(agentSpecs, ragTools);

  // 오케스트레이터 전체 도구 = RAG 도구(create_docx/pptx/excel 포함) + 서브에이전트 도구
  const orchestratorTools = [...ragTools, ...subAgentTools];

  const llm = createDeepSeekChat({ temperature: 0 });
  const systemPrompt = buildOrchestratorPrompt(userContext, recentFiles, sessionSummaries);

  const orchestrator = createReactAgent({
    llm,
    tools: orchestratorTools,
    stateModifier: systemPrompt,
  });

  let fullResponse = "";
  let sourcesEmitted = false;
  const startTime = Date.now();

  try {
    const prompt = `사용자 질문에 답변하세요. 검색 모드: ${searchMode}, 최대 결과: ${topK}\n\n질문: ${message}${preSearchContext}`;

    const eventStream = orchestrator.streamEvents(
      { messages: [new HumanMessage(prompt)] },
      { version: "v2" }
    );

    for await (const event of eventStream) {
      const eventType = event.event;
      const name = (event as any).name as string | undefined;
      const data = event.data as any;

      // ── LLM 스트리밍 토큰 ──
      if (eventType === "on_chat_model_stream") {
        const chunk = data?.chunk;
        const content = chunk?.content;
        if (typeof content === "string" && content) {
          fullResponse += content;
          res.write(`event: token\ndata: ${JSON.stringify({ text: content })}\n\n`);
        }
      }

      // ── 도구 실행 시작 → status 이벤트 ──
      if (eventType === "on_tool_start") {
        const toolName = name || data?.name || "";
        const label = TOOL_LABELS[toolName] || AGENT_LABELS[toolName.replace(/_/g, "-")] || toolName;
        res.write(`event: status\ndata: ${JSON.stringify({ text: `${label}...`, tool: toolName })}\n\n`);
        appendEvent(convId, "agent.tool_start", { tool: toolName });
        console.log(`[Tool] START: ${toolName}`);
      }

      // ── 도구 실행 완료 → 소스 추출 ──
      if (eventType === "on_tool_end") {
        const toolName = name || "";
        const output = data?.output;

        // 검색 결과에서 소스 추출
        if (!sourcesEmitted && toolName === "search_documents" && typeof output === "string") {
          const sourceMatches = [...output.matchAll(/\[(\d+)\]\s+(.+?)\s+—\s+(.+?)\s+\[(\w+)\]/g)];
          const sources = sourceMatches.map((match) => ({
            title: match[2],
            file_name: match[3].split(" (")[0],
            format: match[4].toLowerCase(),
            score: 0,
          }));
          if (sources.length > 0) {
            res.write(`event: sources\ndata: ${JSON.stringify({ chunks: sources, session_id: convId })}\n\n`);
            appendEvent(convId, "session.sources", { chunks: sources });
            sourcesEmitted = true;
          }
        }

        appendEvent(convId, "agent.tool_end", { tool: toolName });
      }

      // ── 서브에이전트 시작 상태 ──
      if (eventType === "on_chain_start") {
        const chainName = (event as any).name as string | undefined;
        if (chainName && AGENT_LABELS[chainName.replace(/_/g, "-")]) {
          const label = AGENT_LABELS[chainName.replace(/_/g, "-")] || chainName;
          res.write(`event: status\ndata: ${JSON.stringify({ text: `${label} 작업 중...`, agent: chainName })}\n\n`);
          appendEvent(convId, "agent.delegate", { agent: chainName });
        }
      }
    }

    // sources 미전송 시 빈 sources 전송
    if (!sourcesEmitted) {
      res.write(`event: sources\ndata: ${JSON.stringify({ chunks: [], session_id: convId })}\n\n`);
    }

    // 응답 저장
    addMessage(convId, { role: "assistant", content: fullResponse, timestamp: new Date().toISOString() });
    appendEvent(convId, "agent.message", { content: fullResponse });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logTask(
      convId,
      `LangGraph query: "${message.slice(0, 50)}${message.length > 50 ? "..." : ""}"`,
      `Response generated via LangGraph + DeepSeek V4 Flash (${elapsed}s)`,
      []
    );

    // 토큰 사용량 추적 (DeepSeek는 스트리밍 중 usage 정보 제한적)
    const usage = {
      session_id: convId,
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 0,
      total_cost_usd: 0,
      num_turns: 1,
      model: "deepseek-v4-flash",
    };
    saveSessionUsage(usage);
    appendEvent(convId, "session.done", { cost_usd: 0, num_turns: 1 });

    res.write(`event: done\ndata: ${JSON.stringify({ session_id: convId })}\n\n`);

    // 백그라운드 세션 요약
    generateSessionSummary(convId, [
      { role: "user", content: message },
      { role: "assistant", content: fullResponse },
    ]).catch(() => {});

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[LangGraph Error]", errMsg);
    appendEvent(convId, "session.error", { error: errMsg });
    res.write(`event: error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`);
  }

  res.end();
}

// ==============================
// 키워드 추출 유틸리티
// ==============================

function extractKeywords(message: string): string {
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

  return cleaned.split(/\s+/).filter((t) => t.length >= 2).join(" ").trim();
}

function expandSearchToKorean(message: string): string[] {
  const lower = message.toLowerCase();
  const EN_TO_KR: Record<string, string> = {
    "education": "교육", "training": "교육", "learning": "학습",
    "career": "경력", "competency": "역량", "skill": "역량",
    "job": "직무", "finance": "재무", "financial": "재무",
    "accounting": "회계", "certification": "자격증",
    "curriculum": "커리큘럼", "assessment": "평가",
    "recruitment": "채용", "marketing": "마케팅",
    "security": "보안", "design": "설계",
    "history": "이력", "recommend": "추천", "future": "미래",
  };

  const koreanKeywords: string[] = [];
  for (const [en, kr] of Object.entries(EN_TO_KR)) {
    if (lower.includes(en)) koreanKeywords.push(kr);
  }

  const namePattern = /\b([A-Z][a-z]+)\s+([A-Z][a-z]+)/g;
  if (namePattern.test(message)) koreanKeywords.push("교육이력");

  return [...new Set(koreanKeywords)];
}
