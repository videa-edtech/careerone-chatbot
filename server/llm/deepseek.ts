/**
 * DeepSeek V4 Flash — LLM 클라이언트 팩토리
 *
 * - LangChain용: createDeepSeekChat() → ChatOpenAI 인스턴스
 * - 직접 호출용: deepseekClient → OpenAI 클라이언트 (messages.create 등)
 *
 * ⚠️ 중요: DeepSeek V4 Flash는 기본적으로 thinking 모드가 활성화됩니다.
 *   tool calling 사용 시 반드시 thinking을 비활성화해야 합니다:
 *   extra_body: { thinking: { type: "disabled" } }
 */
import { ChatOpenAI } from "@langchain/openai";
import OpenAI from "openai";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

// ==============================
// LangChain ChatOpenAI 인스턴스
// ==============================

/**
 * LangGraph / createReactAgent 용 LLM 팩토리
 * tool calling 시 thinking 비활성화 필수
 */
export function createDeepSeekChat(options?: {
  temperature?: number;
  maxTokens?: number;
}): ChatOpenAI {
  return new ChatOpenAI({
    model: DEEPSEEK_MODEL,
    temperature: options?.temperature ?? 0,
    maxTokens: options?.maxTokens ?? 4096,
    openAIApiKey: process.env.DEEPSEEK_API_KEY,
    configuration: {
      baseURL: DEEPSEEK_BASE_URL,
    },
    // DeepSeek V4: thinking 모드 비활성화 (tool calling 호환성)
    modelKwargs: {
      thinking: { type: "disabled" },
    },
  });
}

// ==============================
// 직접 호출용 OpenAI 클라이언트
// (document-summary.ts, session-summary.ts 등)
// ==============================

export const deepseekClient = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: DEEPSEEK_BASE_URL,
});

/**
 * 직접 text completion 호출 헬퍼
 * Anthropic client.messages.create() 대체
 */
export async function deepseekCompletion(
  systemPrompt: string,
  userContent: string,
  maxTokens = 1024
): Promise<string> {
  const response = await deepseekClient.chat.completions.create({
    model: DEEPSEEK_MODEL,
    max_tokens: maxTokens,
    // @ts-ignore — DeepSeek 전용 파라미터
    thinking: { type: "disabled" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}

export { DEEPSEEK_MODEL, DEEPSEEK_BASE_URL };
