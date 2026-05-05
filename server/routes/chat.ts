import { Router, type Request, type Response } from "express";
import { handleChat } from "../orchestrator/chat-handler.js";
import { search, type SearchMode } from "../search/orchestrator.js";
import { streamChat } from "../llm/provider.js";
import { buildPrompt } from "../llm/prompt.js";
import { addMessage, createConversation } from "../memory/conversation-store.js";
import { logTask } from "../memory/task-log.js";

const router = Router();

/**
 * POST /api/chat — Agent SDK 경유 채팅
 *
 * Agent SDK가 MCP 도구를 사용하여 검색/답변/의도추적을 자동 오케스트레이션.
 * 서브에이전트(rag-search, memory)가 필요에 따라 호출됨.
 */
router.post("/api/chat", async (req: Request, res: Response) => {
  const {
    message,
    top_k = 5,
    search_mode = "auto",
    session_id,
    mode = "agent", // "agent" | "direct"
  } = req.body as {
    message: string;
    top_k?: number;
    search_mode?: SearchMode;
    session_id?: string;
    mode?: "agent" | "direct";
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  // Agent SDK mode (default)
  if (mode === "agent") {
    await handleChat(res, {
      message,
      topK: top_k,
      searchMode: search_mode,
      sessionId: session_id,
    });
    return;
  }

  // Direct mode (fallback — no Agent SDK, faster but no orchestration)
  await handleDirectChat(res, { message, topK: top_k, searchMode: search_mode, sessionId: session_id });
});

/**
 * POST /api/chat/poll — JSON polling fallback endpoint
 *
 * SSE를 사용할 수 없는 환경(제한된 CORS, 프록시 차단 등)에서 폴백으로 사용.
 * 동일한 핸들러를 사용하되 SSE 스트리밍 대신 완전한 JSON 응답을 반환.
 */
router.post("/api/chat/poll", async (req: Request, res: Response) => {
  const { message, top_k = 5, search_mode = "auto", session_id } = req.body as {
    message: string;
    top_k?: number;
    search_mode?: SearchMode;
    session_id?: string;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  const convId = session_id || createConversation();

  try {
    const chunks = await search(message, { searchMode: search_mode, topK: top_k });

    const sourcesPayload = chunks.map((c) => ({
      id: c.id,
      title: c.title,
      content: c.content.slice(0, 200) + (c.content.length > 200 ? "..." : ""),
      file_name: c.file_name,
      file_path: c.file_path,
      format: c.format,
      score: c.score,
      metadata: c.metadata ? JSON.parse(c.metadata) : {},
    }));

    const { systemPrompt, userPrompt } = buildPrompt(chunks, message);
    let fullResponse = "";

    for await (const token of streamChat(systemPrompt, userPrompt)) {
      fullResponse += token;
    }

    addMessage(convId, { role: "user", content: message, timestamp: new Date().toISOString() });
    addMessage(convId, { role: "assistant", content: fullResponse, timestamp: new Date().toISOString(), sources: sourcesPayload });
    logTask(convId, `Poll query: "${message.slice(0, 50)}"`, `${chunks.length} sources`, chunks.map((c) => c.file_name));

    res.json({
      session_id: convId,
      sources_count: chunks.length,
      chunks: sourcesPayload,
      message: fullResponse,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/chat/direct — 직접 Claude API 호출 (폴백용)
 *
 * Agent SDK 없이 직접 검색 → 프롬프트 → Claude API.
 * 더 빠르지만 쿼리 재구성, 의도 추적 등 없음.
 */
router.post("/api/chat/direct", async (req: Request, res: Response) => {
  const { message, top_k = 5, search_mode = "auto", session_id } = req.body;

  if (!message?.trim()) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  await handleDirectChat(res, { message, topK: top_k, searchMode: search_mode, sessionId: session_id });
});

const SSE_TIMEOUT_MS = 60_000; // 60 seconds max SSE connection

async function handleDirectChat(
  res: Response,
  opts: { message: string; topK: number; searchMode: SearchMode; sessionId?: string }
) {
  const convId = opts.sessionId || createConversation();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Session-Id", convId);

  let timedOut = false;
  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    if (!res.writableEnded) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "SSE timeout (60s)" })}\n\n`);
      res.end();
    }
  }, SSE_TIMEOUT_MS);

  try {
    const chunks = await search(opts.message, {
      searchMode: opts.searchMode,
      topK: opts.topK,
    });

    const sourcesPayload = chunks.map((c) => ({
      id: c.id,
      title: c.title,
      content: c.content.slice(0, 200) + (c.content.length > 200 ? "..." : ""),
      file_name: c.file_name,
      file_path: c.file_path,
      format: c.format,
      score: c.score,
      metadata: c.metadata ? JSON.parse(c.metadata) : {},
    }));
    res.write(`event: sources\ndata: ${JSON.stringify({ chunks: sourcesPayload, session_id: convId })}\n\n`);

    const { systemPrompt, userPrompt } = buildPrompt(chunks, opts.message);
    let fullResponse = "";

    try {
      for await (const token of streamChat(systemPrompt, userPrompt)) {
        if (timedOut) break;
        fullResponse += token;
        res.write(`event: token\ndata: ${JSON.stringify({ text: token })}\n\n`);
      }
    } catch (streamErr) {
      clearTimeout(timeoutHandle);
      const errMsg = streamErr instanceof Error ? streamErr.message : "stream error";
      if (!res.writableEnded) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: errMsg })}\n\n`);
      }
      return;
    }

    clearTimeout(timeoutHandle);

    addMessage(convId, { role: "user", content: opts.message, timestamp: new Date().toISOString() });
    addMessage(convId, { role: "assistant", content: fullResponse, timestamp: new Date().toISOString(), sources: sourcesPayload });
    logTask(convId, `Direct query: "${opts.message.slice(0, 50)}"`, `${chunks.length} sources`, chunks.map((c) => c.file_name));

    res.write(`event: done\ndata: ${JSON.stringify({ session_id: convId, sources_count: chunks.length })}\n\n`);
  } catch (error) {
    clearTimeout(timeoutHandle);
    res.write(`event: error\ndata: ${JSON.stringify({ error: (error as Error).message })}\n\n`);
  }
  res.end();
}

export default router;
