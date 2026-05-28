import { useState, useRef, useEffect } from "react";

interface Props {
  onSend: (text: string) => void;
  isStreaming: boolean;
  onStop: () => void;
  onUploadClick?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

export default function InputBar({ onSend, isStreaming, onStop, onUploadClick, placeholder, autoFocus = true }: Props) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    }
  }, [text]);

  const handleSubmit = () => {
    if (isStreaming) {
      onStop();
      return;
    }
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      <div className="relative bg-white border border-blue-500 rounded-2xl shadow-lg  transition-all duration-200 focus-within:border-blue-500 focus-within:shadow-blue/800">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder || "메시지를 입력하세요..."}
          rows={1}
          className="w-full bg-white text-[#464559] placeholder-blue-500 pl-5 pr-24 py-4 resize-none outline-none font-body text-[15px] leading-relaxed rounded-2xl"
        />

        {/* Action buttons */}
        <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
          {/* Upload button */}
          {onUploadClick && (
            <button
              onClick={onUploadClick}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-blue-500 hover:text-amber-glow hover:bg-blue-500 hover:text-white transition-all"
              title="Upload"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
          )}

          {/* Send / Stop button */}
          <button
            onClick={handleSubmit}
            className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150 ${
              isStreaming
                ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                : text.trim()
                  ? "bg-blue-500 text-white hover:bg-blue-600"
                  : "bg-white text-blue-500 border border-blue-500"
            }`}
          >
            {isStreaming ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                <rect width="14" height="14" rx="2" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <p className="text-center text-blue-600 text-xs mt-2.5 font-body">
        Drag document to upload · Enter Send · Shift+Enter Newline
      </p>
    </div>
  );
}
