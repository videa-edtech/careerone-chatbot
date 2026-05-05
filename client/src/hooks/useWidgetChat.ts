import { useState, useCallback, useRef, useEffect } from "react";

export interface Source {
  id: number;
  title: string;
  content: string;
  file_name: string;
  file_path: string;
  format: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[];
  timestamp: string;
}

const SESSION_KEY = "careerone-widget-session-id";
const SSE_POLL_FALLBACK_MS = 3000; // fallback to poll after 3s of no SSE data

interface UseWidgetChatOptions {
  apiEndpoint?: string;
  pollEndpoint?: string;
}

export function useWidgetChat(opts: UseWidgetChatOptions = {}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sseDataReceivedRef = useRef(false);
  const pollFallbackRef = useRef(false);

  const apiEndpoint = opts.apiEndpoint || "/api/chat";
  const pollEndpoint = opts.pollEndpoint || "/api/chat/poll";

  // sessionId persistence
  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) setSessionId(saved);
  }, []);

  useEffect(() => {
    if (sessionId) {
      localStorage.setItem(SESSION_KEY, sessionId);
    }
  }, [sessionId]);

  const clearError = useCallback(() => setError(null), []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      clearError();

      const userMsg: Message = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      sseDataReceivedRef.current = false;
      pollFallbackRef.current = false;

      const controller = new AbortController();
      abortRef.current = controller;

      // Start poll fallback timer
      pollTimerRef.current = setTimeout(() => {
        if (!sseDataReceivedRef.current) {
          pollFallbackRef.current = true;
          controller.abort();
        }
      }, SSE_POLL_FALLBACK_MS);

      let assistantText = "";
      let sources: Source[] = [];

      // Optimistic empty assistant message
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", timestamp: new Date().toISOString() },
      ]);

      try {
        if (pollFallbackRef.current) {
          // Poll fallback path
          clearTimeout(pollTimerRef.current!);

          const pollRes = await fetch(pollEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              message: text,
              top_k: 5,
              search_mode: "auto",
              session_id: sessionId,
            }),
            signal: controller.signal,
          });

          if (!pollRes.ok) {
            const errData = await pollRes.json().catch(() => ({}));
            throw new Error(errData.error || `poll failed: ${pollRes.status}`);
          }

          const pollData = await pollRes.json();

          if (pollData.session_id) setSessionId(pollData.session_id);
          sources = (pollData.chunks || []) as Source[];
          assistantText = pollData.message || "";

          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: assistantText,
              sources,
              timestamp: new Date().toISOString(),
            };
            return updated;
          });
        } else {
          // SSE path
          const res = await fetch(apiEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
              message: text,
              top_k: 5,
              search_mode: "auto",
              session_id: sessionId,
            }),
            signal: controller.signal,
          });

          const reader = res.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let currentEvent = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (line.startsWith("event: ")) {
                currentEvent = line.slice(7).trim();
              } else if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.slice(6));

                  if (currentEvent === "sources") {
                    sseDataReceivedRef.current = true;
                    clearTimeout(pollTimerRef.current!);
                    sources = (data.chunks || []) as Source[];
                    if (data.session_id) setSessionId(data.session_id);
                  } else if (currentEvent === "token" && data.text) {
                    sseDataReceivedRef.current = true;
                    assistantText += data.text;
                    setMessages((prev) => {
                      const updated = [...prev];
                      updated[updated.length - 1] = {
                        role: "assistant",
                        content: assistantText,
                        sources,
                        timestamp: new Date().toISOString(),
                      };
                      return updated;
                    });
                  } else if (currentEvent === "done") {
                    setMessages((prev) => {
                      const updated = [...prev];
                      updated[updated.length - 1] = {
                        role: "assistant",
                        content: assistantText,
                        sources,
                        timestamp: new Date().toISOString(),
                      };
                      return updated;
                    });
                  } else if (currentEvent === "error" && data.error) {
                    setError(data.error);
                  }
                } catch {
                  // skip malformed JSON
                }
              }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          // Was abort called intentionally (stop button or poll fallback)?
          if (!pollFallbackRef.current) {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: "요청이 중단되었습니다.",
                timestamp: new Date().toISOString(),
              };
              return updated;
            });
          }
        } else {
          setError((e as Error).message || "알 수 없는 오류가 발생했습니다.");
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "오류가 발생했습니다. 다시 시도해주세요.",
              sources: [],
              timestamp: new Date().toISOString(),
            };
            return updated;
          });
        }
      } finally {
        clearTimeout(pollTimerRef.current!);
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, sessionId, apiEndpoint, pollEndpoint, clearError]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    clearTimeout(pollTimerRef.current!);
  }, [clearError]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    localStorage.removeItem(SESSION_KEY);
    clearError();
  }, [clearError]);

  return {
    messages,
    isStreaming,
    error,
    sessionId,
    sendMessage,
    stopStreaming,
    clearChat,
    clearError,
  };
}