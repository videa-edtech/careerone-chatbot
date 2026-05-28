import type { Document, Conversation, OutputFile } from "../hooks/useApi";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  documents: Document[];
  conversations: Conversation[];
  outputFiles: OutputFile[];
  onNewChat: () => void;
  onDeleteDoc: (id: number) => void;
  onLoadConversation: (id: string) => void;
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
  ".xlsx": "📗",
  ".pptx": "📊",
  ".docx": "📝",
  ".pdf": "📄",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffMin < 1) return "방금";
    if (diffMin < 60) return `${diffMin}분 전`;
    if (diffHr < 24) return `${diffHr}시간 전`;
    if (diffDay < 7) return `${diffDay}일 전`;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  } catch {
    return "";
  }
}

export default function Sidebar({
  isOpen, onClose, documents, conversations, outputFiles,
  onNewChat, onDeleteDoc, onLoadConversation,
}: Props) {
  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-40 md:hidden" onClick={onClose} />
      )}

      <aside className={`fixed top-0 left-0 h-full w-72 bg-blue-100 z-50 transform transition-transform duration-300 ease-out ${isOpen ? "translate-x-0" : "-translate-x-full"} flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-blue-500 bg-blue-500">
          <div className="flex items-center gap-2.5">
            {/*<div className="w-7 h-7 rounded-lg bg-amber-glow/15 flex items-center justify-center">*/}
            {/*  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2" strokeLinecap="round">*/}
            {/*    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />*/}
            {/*  </svg>*/}
            {/*</div>*/}
            {/*<span className="font-display text-base text-paper-white">Mini-RAG</span>*/}
            <div className="w-14 h-14 rounded-md flex items-center justify-center">
              <img src="https://careerone-dev.videabiz.com/images/careerone-logo.webp" alt=""/>
            </div>
            <span className="font-lemon text-[#1c007e] text-xs text-white">Helper</span>
          </div>
          <button onClick={onClose} className="text-white hover:text-paper-cream transition-colors p-1.5 rounded-lg hover:bg-desk-hover">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* New chat */}
        <div className="px-3 py-3">
          <button onClick={onNewChat} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white border border-blue-500 text-blue-500 text-sm font-body hover:text-white hover:bg-blue-500 transition-all duration-200">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New conversation
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Conversations */}
          {conversations.length > 0 && (
            <section className="px-3 pb-3">
              <h3 className="px-2 py-2 text-[11px] font-body text-blue-500 uppercase tracking-wider">Chat history</h3>
              <div className="space-y-0.5">
                {conversations.slice(0, 20).map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => { onLoadConversation(conv.id); onClose(); }}
                    className="w-full flex items-start gap-2 px-2.5 py-2.5 rounded-lg text-sm font-body text-ink-400 hover:bg-desk-hover hover:text-paper-cream transition-colors text-left group"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="shrink-0 mt-0.5 text-ink-600 group-hover:text-ink-400 transition-colors">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{conv.title}</p>
                      <p className="text-[11px] text-ink-600 mt-0.5">{formatTime(conv.updated_at || conv.created_at)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Generated Files */}
          {outputFiles.length > 0 && (
            <section className="px-3 pb-3">
              <h3 className="px-2 py-2 text-[11px] font-body text-ink-600 uppercase tracking-wider">
                생성된 파일 ({outputFiles.length})
              </h3>
              <div className="space-y-0.5">
                {outputFiles.map((file) => {
                  const ext = file.name.slice(file.name.lastIndexOf("."));
                  const icon = EXT_ICONS[ext] || "📎";
                  return (
                    <a
                      key={file.name}
                      href={file.url}
                      download={file.name}
                      className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-body text-ink-400 hover:bg-desk-hover hover:text-amber-glow transition-colors group"
                    >
                      <span className="shrink-0 text-base">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-ink-300 group-hover:text-amber-glow transition-colors">{file.name}</p>
                        <p className="text-[11px] text-ink-600">{formatSize(file.size)}</p>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-ink-600 group-hover:text-amber-glow transition-colors">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </a>
                  );
                })}
              </div>
            </section>
          )}

          {/* Uploaded Documents */}
          {documents.length > 0 && (
            <section className="px-3 pb-3">
              <h3 className="px-2 py-2 text-[11px] font-body text-ink-600 uppercase tracking-wider">
                File uploaded ({documents.length})
              </h3>
              <div className="space-y-0.5">
                {documents.map((doc) => (
                  <div key={doc.id} className="group flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg text-sm font-body text-ink-400 hover:bg-desk-hover transition-colors">
                    <span className="shrink-0 text-base">{FORMAT_ICONS[doc.format] || "📎"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-ink-300 group-hover:text-paper-cream transition-colors">{doc.file_name}</p>
                      <p className="text-[11px] text-ink-600">{doc.chunk_count} file</p>
                    </div>
                    <button
                      onClick={() => onDeleteDoc(doc.id)}
                      className="opacity-0 group-hover:opacity-100 text-ink-600 hover:text-red-400 transition-all p-1 rounded"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-desk-border/40 text-center">
          <p className="text-[11px] font-body text-ink-700">CareerOne · Your chatbot helper</p>
        </div>
      </aside>
    </>
  );
}
