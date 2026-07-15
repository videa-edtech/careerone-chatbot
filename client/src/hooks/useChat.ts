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

const SESSION_KEY = "mini-rag-session-id";

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    return localStorage.getItem(SESSION_KEY);
  });
  const abortRef = useRef<AbortController | null>(null);

  // sessionId 변경 시 localStorage에 저장
  useEffect(() => {
    if (sessionId) {
      localStorage.setItem(SESSION_KEY, sessionId);
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [sessionId]);

  // 이전 대화 복원
  const loadConversation = useCallback(async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations/${convId}`);
      if (!res.ok) {
        setSessionId(null);
        return false;
      }
      const data = await res.json();
      const msgs: Message[] = (data.messages || []).map((m: any) => ({
        role: m.role,
        content: m.content,
        sources: m.sources,
        timestamp: m.timestamp || data.created_at,
      }));
      setMessages(msgs);
      setSessionId(convId);
      return true;
    } catch {
      return false;
    }
  }, []);

  // 서버에 저장된 마지막 세션 자동 복원
  const restoreLastSession = useCallback(async () => {
    const savedId = localStorage.getItem(SESSION_KEY);
    if (savedId) {
      return loadConversation(savedId);
    }
    return false;
  }, [loadConversation]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isStreaming) return;

      const userMsg: Message = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      let assistantText = "";
      let sources: Source[] = [];

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "", timestamp: new Date().toISOString() },
      ]);

      try {
        const res = await fetch("/api/chat", {
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
                  sources = data.chunks || [];
                  if (data.session_id) {
                    setSessionId(data.session_id);
                  }
                } else if (currentEvent === "token" && data.text) {
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
                } else if (currentEvent === "status" && data.text) {
                  setStatusText(data.text);
                } else if (currentEvent === "done") {
                  setStatusText(null);
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
                }
              } catch {
                // skip
              }
            }
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: "오류가 발생했습니다. 다시 시도해주세요.",
              timestamp: new Date().toISOString(),
            };
            return updated;
          });
        }
      }

      setIsStreaming(false);
      abortRef.current = null;
    },
    [isStreaming, sessionId]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsStreaming(false);
    setStatusText(null);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setSessionId(null);
  }, []);

  return {
    messages,
    isStreaming,
    statusText,
    sessionId,
    sendMessage,
    stopStreaming,
    clearChat,
    loadConversation,
    restoreLastSession,
  };
}
