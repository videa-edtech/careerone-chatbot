import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import chatRouter from "../routes/chat.js";
import { initializeSchema } from "../db/schema.js";
import { mkdir } from "fs/promises";

function createTestApp() {
  const testApp = express();
  testApp.use(express.json());
  testApp.use(chatRouter);
  return testApp;
}

describe("POST /api/chat/poll", () => {
  let server: ReturnType<ReturnType<typeof createTestApp>["listen"]>;

  beforeAll(async () => {
    await mkdir("data/test/poll", { recursive: true });
    process.env.DATA_PATH = "data/test/poll";
    process.env.DB_PATH = "data/test/poll/rag.sqlite";
    initializeSchema();
    const app = createTestApp();
    server = app.listen(0);
  });

  afterAll(() => {
    server.close();
  });

  async function poll(body: Record<string, unknown>) {
    const addr = server.address() as { port: number };
    const res = await fetch(`http://localhost:${addr.port}/api/chat/poll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  }

  it("returns 400 when message is empty", async () => {
    const { status, data } = await poll({ message: "" });
    expect(status).toBe(400);
    expect(data).toEqual({ error: "message is required" });
  });

  it("returns 400 when message is missing", async () => {
    const { status, data } = await poll({});
    expect(status).toBe(400);
    expect(data).toEqual({ error: "message is required" });
  });

  it("returns 400 when message is only whitespace", async () => {
    const { status, data } = await poll({ message: "   " });
    expect(status).toBe(400);
    expect(data).toEqual({ error: "message is required" });
  });

  it("creates new conversation and returns response when no session_id given", async () => {
    const { status, data } = await poll({ message: "안녕하세요" });
    expect(status).toBe(200);
    expect(data).toHaveProperty("session_id");
    expect(data).toHaveProperty("message");
    expect(typeof data.message).toBe("string");
    expect(data.session_id.length).toBeGreaterThan(0);
  });

  it("returns existing conversation when session_id provided", async () => {
    const r1 = await poll({ message: "테스트 질문" });
    expect(r1.status).toBe(200);
    const sessionId = r1.data.session_id;

    const r2 = await poll({ message: "테스트 질문", session_id: sessionId });
    expect(r2.status).toBe(200);
    expect(r2.data.session_id).toBe(sessionId);
  });

  it("returns chunks and sources_count", async () => {
    const { status, data } = await poll({ message: "테스트" });
    expect(status).toBe(200);
    expect(data).toHaveProperty("chunks");
    expect(data).toHaveProperty("sources_count");
    expect(Array.isArray(data.chunks)).toBe(true);
    expect(typeof data.sources_count).toBe("number");
  });
});