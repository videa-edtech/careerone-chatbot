import { useRef } from "react";
import type { DocStatus } from "../hooks/useApi";
import InputBar from "./InputBar";

interface Props {
  status: DocStatus | null;
  onSend: (text: string) => void;
  isStreaming: boolean;
  onStop: () => void;
  onUploadClick: () => void;
}

// const SUGGESTIONS = [
//   { label: "문서 요약", text: "이 문서의 핵심 내용을 요약해줘", icon: "📋" },
//   { label: "개념 정리", text: "주요 개념을 표로 정리해줘", icon: "🧩" },
//   { label: "비교 분석", text: "문서에 나온 주요 항목들을 비교 분석해줘", icon: "⚖️" },
//   { label: "보고서 작성", text: "이 내용으로 경영진 보고서를 만들어줘", icon: "📊" },
//   { label: "PPT 제작", text: "핵심 내용으로 발표 자료 PPT를 만들어줘", icon: "🎯" },
//   { label: "SWOT 분석", text: "이 데이터를 기반으로 SWOT 분석해줘", icon: "📐" },
// ];

export default function HomeView({ status, onSend, isStreaming, onStop, onUploadClick }: Props) {
  return (
    <div className="flex flex-col h-full items-center justify-center px-4 relative bg-[#F5F7FA]">
      {/* Ambient background effects */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[15%] left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-amber-glow/[0.025] rounded-full blur-[120px]" />
        <div className="absolute bottom-[20%] left-[20%] w-[300px] h-[300px] bg-amber-dim/[0.015] rounded-full blur-[100px]" />
        <div className="absolute top-[40%] right-[15%] w-[200px] h-[200px] bg-amber-muted/[0.02] rounded-full blur-[80px]" />
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-2xl w-full relative z-10">
        {/* Logo mark */}
        {/*<div className="relative mb-6 animate-fade-in">*/}
        {/*  <div className="w-[72px] h-[72px] rounded-2xl  flex items-center justify-center ">*/}
        {/*    /!*<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">*!/*/}
        {/*    /!*  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />*!/*/}
        {/*    /!*  <circle cx="12" cy="10" r="2" />*!/*/}
        {/*    /!*  <path d="M12 12v3" />*!/*/}
        {/*    /!*</svg>*!/*/}
        {/*    <img src="https://careerone.gov.lk/images/careerone-logo.webp" alt=""/>*/}
        {/*  </div>*/}
        {/*  /!* Subtle ring effect *!/*/}
        {/*  <div className="absolute -inset-3 rounded-3xl border border-amber-glow/[0.06] animate-pulse-glow" />*/}
        {/*</div>*/}

        {/* Greeting */}
        <h1 className="font-lemon text-[#1c007e] text-[2.5rem] md:text-[3rem] mb-3 animate-fade-in tracking-tight" style={{ animationDelay: "0.1s" }}>
          Hello,
        </h1>
        <p className="font-lemon text-[#201F36] text-base mb-10 animate-fade-in text-center leading-relaxed" style={{ animationDelay: "0.2s" }}>
          I'm your help robot. Feel Free to ask me anything about CareerOne!
        </p>

        {/* Stats pills */}
        {/*{status && status.total_documents > 0 && (*/}
        {/*  <div className="flex flex-wrap justify-center gap-2 mb-8 animate-fade-in" style={{ animationDelay: "0.25s" }}>*/}
        {/*    <span className="px-3.5 py-1.5 rounded-full bg-desk-elevated/80 border border-desk-border/70 text-xs font-body text-ink-400 backdrop-blur-sm">*/}
        {/*      문서 {status.total_documents}개*/}
        {/*    </span>*/}
        {/*    <span className="px-3.5 py-1.5 rounded-full bg-desk-elevated/80 border border-desk-border/70 text-xs font-body text-ink-400 backdrop-blur-sm">*/}
        {/*      청크 {status.total_chunks.toLocaleString()}개*/}
        {/*    </span>*/}
        {/*    {status.by_format.map((f) => (*/}
        {/*      <span key={f.format} className="px-3.5 py-1.5 rounded-full bg-desk-elevated/80 border border-desk-border/70 text-xs font-body text-ink-300 backdrop-blur-sm">*/}
        {/*        {f.format.toUpperCase()} {f.doc_count}*/}
        {/*      </span>*/}
        {/*    ))}*/}
        {/*  </div>*/}
        {/*)}*/}

        {/* Quick suggestions grid */}
        {/*<div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 mb-8 w-full max-w-xl animate-fade-in" style={{ animationDelay: "0.3s" }}>*/}
        {/*  {SUGGESTIONS.map((q) => (*/}
        {/*    <button*/}
        {/*      key={q.text}*/}
        {/*      onClick={() => onSend(q.text)}*/}
        {/*      className="group flex items-center gap-2.5 px-4 py-3 rounded-xl bg-desk-surface/80 border border-desk-border/60 text-sm font-body text-ink-400 hover:text-paper-cream hover:border-amber-glow/25 hover:bg-desk-elevated/80 transition-all duration-200 text-left backdrop-blur-sm"*/}
        {/*    >*/}
        {/*      <span className="text-base opacity-60 group-hover:opacity-100 transition-opacity">{q.icon}</span>*/}
        {/*      <span>{q.label}</span>*/}
        {/*    </button>*/}
        {/*  ))}*/}
        {/*</div>*/}

        {/* Upload hint when no docs */}
        {(!status || status.total_documents === 0) && (
          <button
            onClick={onUploadClick}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-dashed border-blue-500 text-sm font-body text-blue-500 hover:text-white hover:border-white hover:bg-blue-500 transition-all mb-8 animate-fade-in"
            style={{ animationDelay: "0.35s" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Please upload a file to start
          </button>
        )}
      </div>

      {/* Input at bottom */}
      <div className="shrink-0 w-full max-w-3xl pb-6 relative z-10 animate-fade-in" style={{ animationDelay: "0.4s" }}>
        <InputBar
          onSend={onSend}
          isStreaming={isStreaming}
          onStop={onStop}
          onUploadClick={onUploadClick}
          placeholder="Please enter your question for CareerOne"
          autoFocus
        />
      </div>
    </div>
  );
}
