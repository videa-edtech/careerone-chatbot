/**
 * LLM Provider — DeepSeek V4 Flash
 *
 * 기존 Anthropic SDK → OpenAI 호환 DeepSeek SDK로 교체.
 * streamChat(): SSE 스트리밍 텍스트 생성기
 */
import OpenAI from "openai";
import { deepseekClient, DEEPSEEK_MODEL } from "./deepseek.js";

export async function* streamChat(
  systemPrompt: string,
  userMessage: string,
  _model = DEEPSEEK_MODEL // 하위 호환성 — 실제로는 항상 deepseek-v4-flash 사용
): AsyncGenerator<string, void, unknown> {
  // DeepSeek V4: thinking 비활성화 필수 (tool calling 호환)
  const params: OpenAI.Chat.ChatCompletionCreateParamsStreaming & Record<string, unknown> = {
    model: DEEPSEEK_MODEL,
    max_tokens: 4096,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    thinking: { type: "disabled" }, // DeepSeek V4 전용
  };

  const stream = await deepseekClient.chat.completions.create(
    params as OpenAI.Chat.ChatCompletionCreateParamsStreaming
  );

  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) {
      yield text;
    }
  }
}
