import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { initializeSchema } from "./db/schema.js";
import { initializeWebResearchSchema } from "./web-research/schema.js";
import { seedInitialTopics } from "./web-research/seed.js";
import chatRouter from "./routes/chat.js";
import uploadRouter from "./routes/upload.js";
import documentsRouter from "./routes/documents.js";
import webResearchRouter from "./routes/web-research.js";
import { mkdir } from "fs/promises";
import { startWatcher } from "./ingestion/watcher.js";
import { startScheduler } from "./web-research/scheduler.js";
import { initAgents } from "./agents/definitions.js";
import { preloadAllSkills } from "./agents/skill-loader.js";
import { checkPythonEnvironment } from "./utils/check-python.js";

const app = express();
const PORT = parseInt(process.env.PORT || "3001");
const DATA_PATH = process.env.DATA_PATH || "./data";
const DOCS_PATH_ENV = process.env.DOCS_PATH || "./docs";

app.set("trust proxy", true);

// Ensure directories exist (use DATA_PATH for Render Persistent Disk support)
await mkdir("uploads", { recursive: true });
await mkdir(path.join(DATA_PATH, "memory/intents"), { recursive: true });
await mkdir(path.join(DATA_PATH, "memory/conversations"), { recursive: true });
await mkdir(path.join(DATA_PATH, "memory/task-log"), { recursive: true });
await mkdir(path.join(DATA_PATH, "memory/web-research/content"), { recursive: true });
await mkdir(path.join(DATA_PATH, "output"), { recursive: true });
await mkdir(path.join(DATA_PATH, "output/summaries"), { recursive: true });
await mkdir(DATA_PATH, { recursive: true });
await mkdir(DOCS_PATH_ENV, { recursive: true });

// Initialize database
initializeSchema();
initializeWebResearchSchema();

// Load skills and initialize agents (Claude Code 불필요 — 독립 실행)
await preloadAllSkills();
await initAgents();

// Python 환경 확인 (문서 생성용)
checkPythonEnvironment();

// Web research: seed topics + start scheduler
seedInitialTopics();
startScheduler();

// Middleware
app.use(cors());
app.use(express.json());

// Static file serving — 생성된 파일 다운로드 (/api/files/파일명)
app.use("/api/files", express.static(path.resolve(DATA_PATH, "output")));

// Routes
app.use(chatRouter);
app.use(uploadRouter);
app.use(documentsRouter);
app.use(webResearchRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Production: Serve client build (React SPA)
const clientDist = path.resolve("client/dist");
app.use(express.static(clientDist));

// Widget route — stripped-down standalone page for CareerONE iframe/widget
app.get("/rag-widget", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

// Express 5 catch-all: use middleware instead of path pattern
app.use((_req, res, next) => {
  // Only serve index.html for non-API, non-file requests (SPA fallback)
  if (_req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(clientDist, "index.html"));
});

// File watcher — docs/ 자동 인덱싱 (data/output은 직접 인덱싱으로 처리)
startWatcher(DOCS_PATH_ENV);

app.listen(PORT, () => {
  console.log(`\n🚀 Mini-RAG server running at http://localhost:${PORT}`);
  console.log(`   POST /api/chat     — Chat with RAG`);
  console.log(`   POST /api/upload   — Upload documents`);
  console.log(`   GET  /api/status   — Index status`);
  console.log(`   GET  /api/documents — Document list`);
  console.log(`   GET  /api/files/*  — Download generated files`);
  console.log(`   👁  Watching ${DOCS_PATH_ENV}/ for auto-indexing\n`);
});

export default app;
