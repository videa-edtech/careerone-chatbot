import { useEffect, useRef, useState } from "react";
import type { Message } from "../hooks/useWidgetChat";
import MessageBubble from "./MessageBubble";

interface Props {
  messages: Message[];
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  error: string | null;
  onClearError: () => void;
}

/**
 * Stripped-down chat UI for the CareerONE widget.
 * Reuses existing MessageBubble component.
 */
export default function WidgetChat({ messages, isStreaming, onSend, onStop, error, onClearError }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMsgCount = useRef(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    const isNewMessage = messages.length > lastMsgCount.current;
    lastMsgCount.current = messages.length;

    if (isNearBottom || isNewMessage) {
      el.scrollTo({ top: el.scrollHeight, behavior: isNewMessage ? "smooth" : "auto" });
    }
  }, [messages]);

  const handleSubmit = (text: string) => {
    if (isStreaming) {
      onStop();
      return;
    }
    if (!text.trim()) return;
    onSend(text.trim());
  };

  return (
    <div className="flex flex-col h-full bg-desk-bg">
      {/* Error banner */}
      {error && (
        <div className="shrink-0 mx-4 mt-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={onClearError} className="text-red-400 hover:text-red-300 font-bold px-2">✕</button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        <div className="max-w-xl mx-auto space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-12 text-ink-300">
              <div className="text-2xl mb-2">👋</div>
              <p className="text-sm">CareerONE 상담에 오신 것을 환영합니다.</p>
              <p className="text-xs mt-1 text-ink-400">취업, 진로,スキル 개발에 대해 질문해 주세요.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <MessageBubble
              key={`${msg.role}-${i}`}
              message={msg}
              isLast={i === messages.length - 1}
              isStreaming={isStreaming}
            />
          ))}
          <div className="h-2" />
        </div>
      </div>

      {/* Input bar */}
      <div className="shrink-0 px-4 pb-4">
        <WidgetInputBar onSubmit={handleSubmit} isStreaming={isStreaming} onStop={onStop} />
      </div>
    </div>
  );
}

function WidgetInputBar({ onSubmit, isStreaming, onStop }: { onSubmit: (t: string) => void; isStreaming: boolean; onStop: () => void }) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, [text]);

  const handleSubmit = () => {
    if (isStreaming) {
      onStop();
      return;
    }
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative w-full max-w-xl mx-auto">
      <div className="relative bg-desk-elevated border border-desk-border rounded-2xl shadow-lg transition-all duration-200 focus-within:border-amber-glow/40">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="메시지를 입력하세요..."
          rows={1}
          className="w-full px-4 py-3 pr-14 bg-transparent resize-none text-ink-100 placeholder-ink-400 focus:outline-none rounded-2xl text-sm"
          style={{ minHeight: "48px", maxHeight: "160px" }}
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() && !isStreaming}
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold transition-all ${
            isStreaming
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
              : "bg-amber-glow/20 text-amber-glow hover:bg-amber-glow/30 disabled:opacity-30 disabled:cursor-not-allowed"
          }`}
        >
          {isStreaming ? "■" : "↑"}
        </button>
      </div>
    </div>
  );
}