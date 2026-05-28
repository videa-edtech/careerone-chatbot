import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message, Source } from "../hooks/useChat";

interface Props {
  message: Message;
  isLast: boolean;
  isStreaming: boolean;
}

const FORMAT_ICONS: Record<string, string> = {
  pdf: "📄",
  docx: "📝",
  pptx: "📊",
  xlsx: "📗",
  markdown: "📋",
  code: "💻",
  text: "📃",
};

function SourceChip({ source }: { source: Source }) {
  const icon = FORMAT_ICONS[source.format] || "📎";
  const meta = source.metadata || {};
  const pageInfo = meta.page ? ` p.${meta.page}` : "";

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-desk-elevated/80 border border-desk-border/70 rounded-lg text-xs font-body text-ink-300 hover:border-amber-glow/30 hover:text-amber-glow transition-colors cursor-default backdrop-blur-sm">
      <span>{icon}</span>
      <span className="truncate max-w-[140px]">{source.file_name}{pageInfo}</span>
      {source.score !== 0 && (
        <span className="text-ink-600 tabular-nums">{Math.abs(source.score).toFixed(2)}</span>
      )}
    </span>
  );
}

export default function MessageBubble({ message, isLast, isStreaming }: Props) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-slide-up`}>
      <div className={`max-w-[85%] ${isUser ? "ml-12" : "mr-12"}`}>
        {/* Role indicator for assistant */}
        {!isUser && (
          <div className="flex items-center gap-1.5 mb-1.5 ml-1">
            <div className="w-14 h-10 rounded-md flex items-center justify-center">
              <img src="https://careerone.gov.lk/images/careerone-logo.webp" alt=""/>
            </div>
            <span className="text-[11px] font-body text-ink-600">CareerOne helper</span>
          </div>
        )}

        {/* Message content */}
        <div
          className={`rounded-2xl px-5 py-3.5 ${
            isUser
              ? "bg-blue-500 text-white"
              : "bg-blue-500 text-white"
          }`}
        >
          {isUser ? (
            <p className="font-body text-[15px] leading-relaxed whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className={`prose-rag font-body text-[15px] leading-relaxed ${isLast && isStreaming ? "typing-cursor" : ""}`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content || "..."}
              </ReactMarkdown>
            </div>
          )}
        </div>

        {/* Source citations */}
        {!isUser && message.sources && message.sources.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2 ml-1">
            {message.sources.map((src, i) => (
              <SourceChip key={i} source={src} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
