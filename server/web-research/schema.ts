/**
 * Web Research schema — research_topics + collection_runs
 *
 * Initialized independently from main schema so it can be versioned separately.
 */
import db from "../db/connection.js";

export function initializeWebResearchSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS research_topics (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      query          TEXT    NOT NULL DEFAULT '',
      url_list       TEXT,
      source_type    TEXT    NOT NULL DEFAULT 'keyword',
      interval_minutes INTEGER NOT NULL DEFAULT 360,
      enabled        INTEGER NOT NULL DEFAULT 1,
      created_at     DATETIME DEFAULT (datetime('now')),
      last_run_at    DATETIME
    );

    CREATE TABLE IF NOT EXISTS collection_runs (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id        INTEGER NOT NULL REFERENCES research_topics(id) ON DELETE CASCADE,
      run_at          DATETIME DEFAULT (datetime('now')),
      urls_collected  INTEGER NOT NULL DEFAULT 0,
      new_chunks      INTEGER NOT NULL DEFAULT 0,
      duplicates      INTEGER NOT NULL DEFAULT 0,
      status          TEXT    NOT NULL DEFAULT 'success',
      error           TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runs_topic ON collection_runs(topic_id);
  `);
}
