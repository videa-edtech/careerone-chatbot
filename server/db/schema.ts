import db, { vectorEnabled } from "./connection.js";
import { EMBEDDING_DIM } from "../llm/embedder.js";

export function initializeSchema(): void {
  db.exec(`
    -- ==========================================
    -- 문서 테이블
    -- ==========================================
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      format TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      metadata JSON,
      file_size INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_hash
      ON documents(content_hash);

    -- ==========================================
    -- 청크 테이블
    -- ==========================================
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      metadata JSON,
      embedding BLOB,
      token_count INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_document
      ON chunks(document_id);

    -- ==========================================
    -- FTS5 전문 검색
    -- ==========================================
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      title, content,
      content='chunks',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );

    -- FTS5 동기화 트리거
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, title, content)
      VALUES (new.id, new.title, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
      INSERT INTO chunks_fts(rowid, title, content)
      VALUES (new.id, new.title, new.content);
    END;

    -- ==========================================
    -- 파일 변경 추적
    -- ==========================================
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      mtime REAL NOT NULL,
      size INTEGER NOT NULL,
      hash TEXT NOT NULL
    );

    -- ==========================================
    -- 설정 테이블
    -- ==========================================
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value JSON NOT NULL
    );

    -- ==========================================
    -- 대화 히스토리
    -- ==========================================
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT,
      user_ip TEXT NOT NULL DEFAULT 'unknown',
      messages JSON NOT NULL DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ==========================================
    -- 작업 로그
    -- ==========================================
    CREATE TABLE IF NOT EXISTS task_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      action TEXT NOT NULL,
      result TEXT,
      related_files JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ==========================================
    -- 작업 학습 일지
    -- ==========================================
    CREATE TABLE IF NOT EXISTS work_journal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_type TEXT NOT NULL,
      skill_used TEXT NOT NULL,
      description TEXT NOT NULL,
      output_file TEXT,
      user_feedback TEXT,
      lessons TEXT,
      quality_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_wj_task_type ON work_journal(task_type);
    CREATE INDEX IF NOT EXISTS idx_wj_skill ON work_journal(skill_used);

    -- ==========================================
    -- 세션 이벤트 로그 (Managed Agents 패턴)
    -- ==========================================
    CREATE TABLE IF NOT EXISTS session_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      agent_name TEXT,
      observation_type TEXT,
      payload JSON NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_se_session ON session_events(session_id);
    CREATE INDEX IF NOT EXISTS idx_se_type ON session_events(event_type);

    -- ==========================================
    -- 세션 요약 (claude-mem 패턴)
    -- ==========================================
    CREATE TABLE IF NOT EXISTS session_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      request TEXT,
      investigated TEXT,
      learned TEXT,
      completed TEXT,
      next_steps TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ==========================================
    -- 문서 요약 (Karpathy Wiki 패턴)
    -- ==========================================
    CREATE TABLE IF NOT EXISTS document_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      key_concepts JSON,
      structure TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- ==========================================
    -- 세션 토큰 사용량 추적
    -- ==========================================
    CREATE TABLE IF NOT EXISTS session_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      total_cost_usd REAL DEFAULT 0,
      num_turns INTEGER DEFAULT 0,
      model TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // ==========================================
  // 마이그레이션 — 기존 테이블에 새 컬럼 추가
  // ==========================================
  try {
    db.exec("ALTER TABLE session_events ADD COLUMN observation_type TEXT");
  } catch { /* 이미 존재하면 무시 */ }
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_se_obs_type ON session_events(observation_type)");
  } catch { /* 무시 */ }
  try {
    db.exec("ALTER TABLE conversations ADD COLUMN user_ip TEXT NOT NULL DEFAULT 'unknown'");
  } catch { /* 이미 존재하면 무시 */ }
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_conversations_user_ip_updated ON conversations(user_ip, updated_at DESC)");
  } catch { /* 무시 */ }

  // ==========================================
  // Phase 2: sqlite-vec 벡터 테이블 (확장 로드된 경우만)
  // ==========================================
  if (vectorEnabled) {
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_vec USING vec0(
          embedding float[${EMBEDDING_DIM}]
        )
      `);
      console.log("[DB] Vector table created (dim=%d)", EMBEDDING_DIM);

      // Orphan 벡터 정리 (삭제된 청크의 벡터가 남아있을 수 있음)
      try {
        const orphanCount = db.prepare(
          "SELECT COUNT(*) as cnt FROM chunks_vec WHERE rowid NOT IN (SELECT id FROM chunks)"
        ).get() as { cnt: number };
        if (orphanCount.cnt > 0) {
          db.exec("DELETE FROM chunks_vec WHERE rowid NOT IN (SELECT id FROM chunks)");
          console.log("[DB] Cleaned %d orphan vectors", orphanCount.cnt);
        }
      } catch { /* vec table might be empty */ }
    } catch (e) {
      console.warn("[DB] Vector table creation failed:", (e as Error).message?.slice(0, 60));
    }
  }

  // 기본 설정값 (없으면 삽입)
  const insertSetting = db.prepare(
    "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)"
  );

  const defaults: Record<string, unknown> = {
    search_mode: "auto",
    top_k: 5,
    rrf_k: 60,
    weight_fts: 1.5,
    weight_vec: 1.0,
    chunk_max_tokens: 512,
    chunk_overlap_tokens: 50,
  };

  const insertMany = db.transaction(() => {
    for (const [key, value] of Object.entries(defaults)) {
      insertSetting.run(key, JSON.stringify(value));
    }
  });
  insertMany();

  console.log("[DB] Schema initialized");
}
