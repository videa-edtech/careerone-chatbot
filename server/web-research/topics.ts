/**
 * Research topic CRUD + collection run logging
 */
import db from "../db/connection.js";
import type { ResearchTopic, CollectionRun } from "./types.js";

let stmts: {
  list: ReturnType<typeof db.prepare>;
  add: ReturnType<typeof db.prepare>;
  update: ReturnType<typeof db.prepare>;
  delete: ReturnType<typeof db.prepare>;
  get: ReturnType<typeof db.prepare>;
  logRun: ReturnType<typeof db.prepare>;
  getRuns: ReturnType<typeof db.prepare>;
  touchLastRun: ReturnType<typeof db.prepare>;
} | null = null;

function s() {
  if (!stmts) {
    stmts = {
      list: db.prepare("SELECT * FROM research_topics ORDER BY created_at DESC"),
      add: db.prepare(
        "INSERT INTO research_topics (name, query, url_list, source_type, interval_minutes, enabled) VALUES (?, ?, ?, ?, ?, ?)"
      ),
      update: db.prepare(
        "UPDATE research_topics SET name=?, query=?, url_list=?, source_type=?, interval_minutes=?, enabled=? WHERE id=?"
      ),
      delete: db.prepare("DELETE FROM research_topics WHERE id=?"),
      get: db.prepare("SELECT * FROM research_topics WHERE id=?"),
      logRun: db.prepare(
        "INSERT INTO collection_runs (topic_id, urls_collected, new_chunks, duplicates, status, error) VALUES (?, ?, ?, ?, ?, ?)"
      ),
      getRuns: db.prepare("SELECT * FROM collection_runs WHERE topic_id=? ORDER BY run_at DESC LIMIT ?"),
      touchLastRun: db.prepare("UPDATE research_topics SET last_run_at=datetime('now') WHERE id=?"),
    };
  }
  return stmts;
}

export function listTopics(): ResearchTopic[] {
  const rows = s().list.all() as any[];
  return rows.map(row => ({
    ...row,
    url_list: row.url_list ? JSON.parse(row.url_list) : null,
    source_type: row.source_type as "keyword" | "url",
    enabled: Boolean(row.enabled),
  }));
}

export function getTopic(id: number): ResearchTopic | null {
  const row = s().get.get(id) as any;
  if (!row) return null;
  return {
    ...row,
    url_list: row.url_list ? JSON.parse(row.url_list) : null,
    source_type: row.source_type as "keyword" | "url",
    enabled: Boolean(row.enabled),
  };
}

export function addTopic(
  name: string,
  query: string,
  urlList: string[] | null,
  sourceType: "keyword" | "url",
  intervalMinutes: number
): number {
  const result = s().add.run(
    name,
    query,
    urlList ? JSON.stringify(urlList) : null,
    sourceType,
    intervalMinutes,
    1
  );
  return Number(result.lastInsertRowid);
}

export function updateTopic(
  id: number,
  name: string,
  query: string,
  urlList: string[] | null,
  sourceType: "keyword" | "url",
  intervalMinutes: number,
  enabled: boolean
): boolean {
  const result = s().update.run(
    name,
    query,
    urlList ? JSON.stringify(urlList) : null,
    sourceType,
    intervalMinutes,
    enabled ? 1 : 0,
    id
  );
  return result.changes > 0;
}

export function deleteTopic(id: number): boolean {
  const result = s().delete.run(id);
  return result.changes > 0;
}

export function logCollectionRun(
  topicId: number,
  urlsCollected: number,
  newChunks: number,
  duplicates: number,
  status: "success" | "partial" | "failed",
  error: string | null
): number {
  const result = s().logRun.run(topicId, urlsCollected, newChunks, duplicates, status, error);
  s().touchLastRun.run(topicId);
  return Number(result.lastInsertRowid);
}

export function getCollectionRuns(topicId: number, limit = 20): CollectionRun[] {
  return s().getRuns.all(topicId, limit) as CollectionRun[];
}
