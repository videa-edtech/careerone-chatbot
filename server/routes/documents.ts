import { Router, type Request, type Response } from "express";
import { getDocumentStats, listDocuments, deleteDocument } from "../ingestion/indexer.js";
import { listConversations, getConversationForUser } from "../memory/conversation-store.js";
import { getTaskLog } from "../memory/task-log.js";
import { listIntents } from "../memory/intent-store.js";
import { getSessionMessages, getEvents } from "../memory/session-events.js";
import { getSessionUsage, getTotalUsage } from "../memory/session-usage.js";
import { getClientIp } from "../utils/client-ip.js";

const router = Router();

// Document management
router.get("/api/documents", (req: Request, res: Response) => {
  const format = req.query.format as string | undefined;
  const limit = parseInt(req.query.limit as string) || 50;
  const docs = listDocuments(format, limit);
  res.json(docs);
});

router.delete("/api/documents/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid document ID" });
    return;
  }
  const deleted = deleteDocument(id);
  if (deleted) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Document not found" });
  }
});

// Status (+ usage tracking)
router.get("/api/status", (_req: Request, res: Response) => {
  const stats = getDocumentStats();
  const usage = getTotalUsage();
  res.json({ ...stats, usage });
});

// Conversations
router.get("/api/conversations", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 20;
  res.json(listConversations(getClientIp(req), limit));
});

router.get("/api/conversations/:id", (req: Request, res: Response) => {
  const convId = req.params.id as string;
  const conv = getConversationForUser(convId, getClientIp(req));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // 이벤트 기반 메시지 우선, 없으면 legacy messages 사용
  const eventMessages = getSessionMessages(convId);
  const messages = eventMessages.length > 0
    ? eventMessages
    : JSON.parse(conv.messages);

  const usage = getSessionUsage(convId);
  res.json({ ...conv, messages, usage });
});

// 세션 이벤트 로그 (디버깅/추적용)
router.get("/api/conversations/:id/events", (req: Request, res: Response) => {
  const convId = req.params.id as string;
  const conv = getConversationForUser(convId, getClientIp(req));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  const events = getEvents(convId);
  res.json(events);
});

// Task log
router.get("/api/task-log", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json(getTaskLog(limit));
});

// Intents
router.get("/api/intents", async (_req: Request, res: Response) => {
  const intents = await listIntents();
  res.json(intents);
});

// Generated output files
import { readdir, stat as fsStat } from "fs/promises";
import path from "path";
import { PATHS } from "../config.js";

router.get("/api/output-files", async (_req: Request, res: Response) => {
  const outputDir = PATHS.output;
  try {
    const entries = await readdir(outputDir);
    const files = [];
    for (const name of entries) {
      const filePath = path.join(outputDir, name);
      const info = await fsStat(filePath);
      if (info.isFile()) {
        files.push({
          name,
          size: info.size,
          modified: info.mtime.toISOString(),
          url: `/api/files/${encodeURIComponent(name)}`,
        });
      }
    }
    files.sort((a, b) => b.modified.localeCompare(a.modified));
    res.json(files);
  } catch {
    res.json([]);
  }
});

// Search (without LLM — raw search results)
import { search } from "../search/orchestrator.js";

router.post("/api/search", async (req: Request, res: Response) => {
  const { query: q, top_k = 5, search_mode = "auto" } = req.body;
  if (!q?.trim()) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const results = await search(q, { searchMode: search_mode, topK: top_k });
  res.json(results);
});

export default router;
