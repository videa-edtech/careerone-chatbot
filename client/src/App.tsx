import { useState, useCallback, useEffect, useRef } from "react";
import { useChat } from "./hooks/useChat";
import { useUpload } from "./hooks/useUpload";
import { useStatus, useDocuments, useConversations, useOutputFiles } from "./hooks/useApi";
import HomeView from "./components/HomeView";
import ChatView from "./components/ChatView";
import Sidebar from "./components/Sidebar";
import DropOverlay from "./components/DropOverlay";
import WidgetChat from "./components/WidgetChat";
import { useWidgetChat } from "./hooks/useWidgetChat";

// Detect if running in widget mode (query param set by /rag-widget route)
const isWidgetMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("widget");

function WidgetApp() {
  const { messages, isStreaming, error, sendMessage, stopStreaming, clearChat, clearError } = useWidgetChat();
  return <WidgetChat messages={messages} isStreaming={isStreaming} onSend={sendMessage} onStop={stopStreaming} error={error} onClearError={clearError} />;
}

export default function App() {
  if (isWidgetMode) return <WidgetApp />;

  const {
    messages, isStreaming, statusText, sendMessage, stopStreaming, clearChat,
    loadConversation, restoreLastSession,
  } = useChat();
  const { upload, phase: uploadPhase, progress: uploadProgress, resetProgress } = useUpload();
  const { status, refresh: refreshStatus } = useStatus();
  const { docs, refresh: refreshDocs, remove: removeDoc } = useDocuments();
  const { convs, refresh: refreshConvs } = useConversations();
  const { files: outputFiles, refresh: refreshOutputFiles } = useOutputFiles();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const restoredRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isInChat = messages.length > 0;

  // Restore last session on mount
  useEffect(() => {
    if (!restoredRef.current) {
      restoredRef.current = true;
      restoreLastSession();
    }
  }, [restoreLastSession]);

  // Refresh sidebar data after streaming ends
  useEffect(() => {
    if (!isStreaming && messages.length > 0) {
      refreshConvs();
      refreshOutputFiles();
    }
  }, [isStreaming, messages.length, refreshConvs, refreshOutputFiles]);

  // Upload handler — useUpload가 phase/progress를 관리
  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        try {
          await upload(file);
          refreshStatus();
          refreshDocs();
          refreshOutputFiles();
        } catch { /* useUpload handles error state */ }
        // done 상태 2초 표시 후 리셋
        await new Promise((r) => setTimeout(r, 2000));
        resetProgress();
      }
    },
    [upload, refreshStatus, refreshDocs, refreshOutputFiles, resetProgress]
  );

  // Drag-and-drop handlers
  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;
      setIsDragging(false);
      const files = e.dataTransfer?.files;
      if (files && files.length > 0) processFiles(files);
    },
    [processFiles]
  );

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer?.types.includes("Files")) setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  useEffect(() => {
    window.addEventListener("drop", handleDrop);
    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    return () => {
      window.removeEventListener("drop", handleDrop);
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
    };
  }, [handleDrop, handleDragEnter, handleDragLeave, handleDragOver]);

  const handleSend = useCallback((text: string) => sendMessage(text), [sendMessage]);

  const handleNewChat = useCallback(() => {
    clearChat();
    setSidebarOpen(false);
  }, [clearChat]);

  const handleLoadConversation = useCallback(
    (convId: string) => {
      loadConversation(convId);
    },
    [loadConversation]
  );

  // File input click handler
  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0) {
        processFiles(files);
        e.target.value = ""; // reset for re-upload
      }
    },
    [processFiles]
  );

  return (
    <div className="h-screen flex flex-col bg-white overflow-hidden">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.pptx,.xlsx,.md,.txt,.py,.js,.ts,.tsx,.jsx,.json,.csv"
        multiple
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Top bar */}
      <header className="shrink-0 flex items-center justify-between px-4 py-2.5  bg-white z-30">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="flex items-center gap-2 text-gray-500 hover:text-paper-cream transition-colors p-1.5 rounded-lg hover:bg-desk-hover"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <div className="flex justify-center w-full">
          <div className="flex items-center gap-2">
            <div className="rounded-md flex items-center justify-center">
              {/*<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#e8a84c" strokeWidth="2.5" strokeLinecap="round">*/}
              {/*  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />*/}
              {/*</svg>*/}
              <img src="https://careerone-dev.videabiz.com/images/careerone-logo.webp" className="w-[64px]" alt=""/>
            </div>
            <span className="font-lemon text-xl text-[#1c007e]">Helper</span>
          </div>
        </div>


        {/*<div className="flex items-center gap-3">*/}
        {/*  {status && status.total_documents > 0 && (*/}
        {/*    <span className="text-xs font-body text-ink-600 tabular-nums">*/}
        {/*      {status.total_documents} docs · {status.total_chunks.toLocaleString()} chunks*/}
        {/*    </span>*/}
        {/*  )}*/}
        {/*</div>*/}
      </header>

      {/* Main */}
      <main className="flex-1 overflow-hidden">
        {isInChat ? (
          <ChatView
            messages={messages}
            isStreaming={isStreaming}
            statusText={statusText}
            onSend={handleSend}
            onStop={stopStreaming}
            onUploadClick={handleUploadClick}
          />
        ) : (
          <HomeView
            status={status}
            onSend={handleSend}
            isStreaming={isStreaming}
            onStop={stopStreaming}
            onUploadClick={handleUploadClick}
          />
        )}
      </main>

      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        documents={docs}
        conversations={convs}
        outputFiles={outputFiles}
        onNewChat={handleNewChat}
        onDeleteDoc={async (id) => { await removeDoc(id); refreshStatus(); }}
        onLoadConversation={handleLoadConversation}
      />

      {/* Drop overlay */}
      <DropOverlay isActive={isDragging} phase={uploadPhase} progress={uploadProgress} />
    </div>
  );
}
