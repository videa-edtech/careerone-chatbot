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

const EXT_ICONS: Record<string, string> = {
  ".docx": "📝",
  ".pdf": "📄",
  ".pptx": "📊",
  ".xlsx": "📗",
};

/** 메시지 텍스트에서 /api/files/... 링크를 추출 */
function extractFileLinks(content: string): { name: string; url: string }[] {
  const matches = [...content.matchAll(/\/api\/files\/([^\s\n"')]+)/g)];
  return matches.map((m) => {
    const encoded = m[1];
    const name = decodeURIComponent(encoded);
    return { name, url: `/api/files/${encoded}` };
  });
}

function FileDownloadButton({ name, url }: { name: string; url: string }) {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  const icon = EXT_ICONS[ext] || "📎";
  return (
    <a
      href={url}
      download={name}
      className="inline-flex items-center gap-2 mt-3 px-3.5 py-2 bg-amber-glow/10 border border-amber-glow/30 rounded-xl text-sm font-body text-amber-glow hover:bg-amber-glow/20 hover:border-amber-glow/60 transition-colors"
    >
      <span>{icon}</span>
      <span className="truncate max-w-[200px]">{name}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="shrink-0">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
    </a>
  );
}

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
              <img src="https://careerone-dev.videabiz.com/images/careerone-logo.webp" alt=""/>
            </div>
            <span className="text-[11px] font-lemon text-[#1c007e]">Helper</span>
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

        {/* 생성된 파일 인라인 다운로드 버튼 */}
        {!isUser && !isStreaming && (() => {
          const links = extractFileLinks(message.content || "");
          if (links.length === 0) return null;
          return (
            <div className="flex flex-col gap-1.5 mt-1 ml-1">
              {links.map((f, i) => (
                <FileDownloadButton key={i} name={f.name} url={f.url} />
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
