import { useEffect, useRef } from "react";
import type { Message } from "../hooks/useChat";
import MessageBubble from "./MessageBubble";
import InputBar from "./InputBar";
import StatusIndicator from "./StatusIndicator";

interface Props {
  messages: Message[];
  isStreaming: boolean;
  statusText: string | null;
  onSend: (text: string) => void;
  onStop: () => void;
  onUploadClick: () => void;
}

export default function ChatView({ messages, isStreaming, statusText, onSend, onStop, onUploadClick }: Props) {
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

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA]">
      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <MessageBubble
              key={`${msg.role}-${i}`}
              message={msg}
              isLast={i === messages.length - 1}
              isStreaming={isStreaming}
            />
          ))}
          {/* Bottom spacer */}
          <div className="h-2" />
        </div>
      </div>

      {/* Status indicator + Input bar */}
      <div className="shrink-0">
        {isStreaming && <StatusIndicator text={statusText} />}
        <div className="px-4 pb-5 pt-2">
          <InputBar
            onSend={onSend}
            isStreaming={isStreaming}
            onStop={onStop}
            onUploadClick={onUploadClick}
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}
