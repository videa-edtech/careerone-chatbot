/**
 * Web Research API — topic CRUD + collection status
 */
import { Router, type Request, type Response } from "express";
import {
  listTopics,
  addTopic,
  updateTopic,
  deleteTopic,
  getTopic,
  getCollectionRuns,
} from "../web-research/topics.js";
import {
  scheduleTopic,
  unscheduleTopic,
  isTopicScheduled,
  runTopicNow,
  startScheduler,
  stopScheduler,
} from "../web-research/scheduler.js";
import { getDocumentStats } from "../ingestion/indexer.js";

const router = Router();

// GET /api/web-research/topics — list all topics
router.get("/api/web-research/topics", (_req: Request, res: Response) => {
  const topics = listTopics();
  res.json(
    topics.map((t) => ({
      ...t,
      scheduled: isTopicScheduled(t.id),
    }))
  );
});

// POST /api/web-research/topics — add new topic
router.post("/api/web-research/topics", (req: Request, res: Response) => {
  const { name, query, url_list, source_type = "keyword", interval_minutes = 360 } = req.body as {
    name?: string;
    query?: string;
    url_list?: string[];
    source_type?: "keyword" | "url";
    interval_minutes?: number;
  };

  if (!name?.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (source_type === "keyword" && !query?.trim()) {
    res.status(400).json({ error: "query is required for keyword source_type" });
    return;
  }
  if (source_type === "url" && (!url_list || !Array.isArray(url_list))) {
    res.status(400).json({ error: "url_list (array) is required for url source_type" });
    return;
  }
  if (interval_minutes < 1) {
    res.status(400).json({ error: "interval_minutes must be >= 1" });
    return;
  }

  const id = addTopic(
    name.trim(),
    query?.trim() || "",
    source_type === "url" ? url_list : null,
    source_type,
    interval_minutes
  );

  const topic = getTopic(id)!;
  scheduleTopic(id, topic.interval_minutes);
  res.status(201).json({ ...topic, scheduled: true });
});

// PUT /api/web-research/topics/:id — update topic
router.put("/api/web-research/topics/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const existing = getTopic(id);
  if (!existing) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }

  const {
    name,
    query,
    url_list,
    source_type,
    interval_minutes,
    enabled,
  } = req.body as {
    name?: string;
    query?: string;
    url_list?: string[] | null;
    source_type?: "keyword" | "url";
    interval_minutes?: number;
    enabled?: boolean;
  };

  const newName = name ?? existing.name;
  const newQuery = query ?? existing.query;
  const newUrlList = url_list !== undefined ? url_list : existing.url_list;
  const newSourceType = source_type ?? existing.source_type;
  const newInterval = interval_minutes ?? existing.interval_minutes;
  const newEnabled = enabled !== undefined ? Boolean(enabled) : existing.enabled;

  updateTopic(id, newName, newQuery, newUrlList, newSourceType, newInterval, newEnabled);

  if (newEnabled) {
    scheduleTopic(id, newInterval);
  } else {
    unscheduleTopic(id);
  }

  res.json({ ...getTopic(id), scheduled: isTopicScheduled(id) });
});

// DELETE /api/web-research/topics/:id — delete topic
router.delete("/api/web-research/topics/:id", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  unscheduleTopic(id);
  const deleted = deleteTopic(id);
  if (deleted) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Topic not found" });
  }
});

// POST /api/web-research/topics/:id/collect — trigger immediate collection
router.post("/api/web-research/topics/:id/collect", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const topic = getTopic(id);
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }

  try {
    await runTopicNow(id);
    res.json({ success: true, message: `Collection triggered for "${topic.name}"` });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// GET /api/web-research/topics/:id/runs — collection history
router.get("/api/web-research/topics/:id/runs", (req: Request, res: Response) => {
  const id = parseInt(req.params.id as string);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const limit = parseInt(req.query.limit as string) || 20;
  const runs = getCollectionRuns(id, limit);
  res.json(runs);
});

// POST /api/web-research/scheduler/stop — stop all scheduled collections
router.post("/api/web-research/scheduler/stop", (_req: Request, res: Response) => {
  stopScheduler();
  res.json({ success: true, message: "All scheduled collections stopped" });
});

// POST /api/web-research/scheduler/start — restart all enabled topics
router.post("/api/web-research/scheduler/start", (_req: Request, res: Response) => {
  startScheduler();
  const topics = listTopics();
  const scheduled = topics.filter((t) => t.enabled && isTopicScheduled(t.id)).length;
  res.json({ success: true, message: `Scheduler started — ${scheduled}/${topics.length} topics enabled` });
});

// GET /api/web-research/status — overall research status
router.get("/api/web-research/status", (_req: Request, res: Response) => {
  const topics = listTopics();
  const stats = getDocumentStats() as {
    total_documents: number;
    total_chunks: number;
    by_format: Array<{ format: string; doc_count: number; chunk_count: number }>;
  };

  const webStats = stats.by_format.find((f) => f.format === "web");

  res.json({
    total_topics: topics.length,
    enabled_topics: topics.filter((t) => t.enabled).length,
    scheduled_topics: topics.filter((t) => isTopicScheduled(t.id)).length,
    web_documents: webStats?.doc_count ?? 0,
    web_chunks: webStats?.chunk_count ?? 0,
    topics: topics.map((t) => ({
      id: t.id,
      name: t.name,
      source_type: t.source_type,
      query: t.query,
      url_list: t.url_list,
      interval_minutes: t.interval_minutes,
      enabled: t.enabled,
      scheduled: isTopicScheduled(t.id),
      last_run_at: t.last_run_at,
    })),
  });
});

export default router;
