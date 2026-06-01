/**
 * Session Summary — claude-mem 패턴 차용 (DeepSeek V4 Flash)
 *
 * @anthropic-ai/sdk 제거 → deepseekClient (OpenAI 호환)로 교체
 */
import db from "../db/connection.js";
import { deepseekClient } from "../llm/deepseek.js";

const DEEPSEEK_MODEL = "deepseek-v4-flash";

export interface SessionSummary {
  id?: number;
  session_id: string;
  request: string;
  investigated: string;
  learned: string;
  completed: string;
  next_steps: string;
  created_at?: string;
}

// Lazy-init
let _stmts: {
  upsert: any;
  getBySession: any;
  getRecent: any;
} | null = null;

function stmts() {
  if (!_stmts) {
    _stmts = {
      upsert: db.prepare(`
        INSERT INTO session_summaries (session_id, request, investigated, learned, completed, next_steps)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          request = excluded.request,
          investigated = excluded.investigated,
          learned = excluded.learned,
          completed = excluded.completed,
          next_steps = excluded.next_steps
      `),
      getBySession: db.prepare(
        "SELECT * FROM session_summaries WHERE session_id = ?"
      ),
      getRecent: db.prepare(
        "SELECT * FROM session_summaries ORDER BY created_at DESC LIMIT ?"
      ),
    };
  }
  return _stmts;
}

export function saveSessionSummary(summary: SessionSummary): void {
  stmts().upsert.run(
    summary.session_id,
    summary.request,
    summary.investigated,
    summary.learned,
    summary.completed,
    summary.next_steps
  );
}

export function getSessionSummary(sessionId: string): SessionSummary | null {
  return stmts().getBySession.get(sessionId) as SessionSummary | null;
}

export function getRecentSummaries(limit = 3): SessionSummary[] {
  return stmts().getRecent.all(limit) as SessionSummary[];
}

/**
 * AI로 세션 요약 생성 — DeepSeek V4 Flash 직접 호출
 */
export async function generateSessionSummary(
  sessionId: string,
  messages: Array<{ role: string; content: string }>
): Promise<SessionSummary | null> {
  if (messages.length < 2) return null;

  try {
    const conversation = messages
      .map((m) => `${m.role === "user" ? "사용자" : "AI"}: ${m.content.slice(0, 500)}`)
      .join("\n")
      .slice(0, 3000);

    const response = await deepseekClient.chat.completions.create({
      model: DEEPSEEK_MODEL,
      max_tokens: 500,
      // @ts-ignore — DeepSeek 전용
      thinking: { type: "disabled" },
      messages: [
        {
          role: "user",
          content: `다음 대화를 요약하세요. 각 항목을 1-2문장으로 간결하게 작성하세요.

대화:
${conversation}

JSON으로 응답하세요:
{"request":"사용자가 요청한 것","investigated":"탐색/조사한 것","learned":"핵심 학습 내용","completed":"완료된 작업","next_steps":"다음 단계 제안"}`,
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    const summary: SessionSummary = {
      session_id: sessionId,
      request: parsed.request || "",
      investigated: parsed.investigated || "",
      learned: parsed.learned || "",
      completed: parsed.completed || "",
      next_steps: parsed.next_steps || "",
    };

    saveSessionSummary(summary);
    console.log(`[Summary] Session ${sessionId.slice(0, 8)} summarized (DeepSeek V4 Flash)`);
    return summary;
  } catch (e) {
    console.warn("[Summary] Failed to generate:", (e as Error).message?.slice(0, 60));
    return null;
  }
}
