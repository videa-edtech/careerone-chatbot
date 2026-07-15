import { useState, useEffect, useCallback } from "react";

export interface DocStatus {
  total_documents: number;
  total_chunks: number;
  by_format: { format: string; doc_count: number; chunk_count: number }[];
}

export interface Document {
  id: number;
  file_name: string;
  format: string;
  chunk_count: number;
  created_at: string;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function useStatus() {
  const [status, setStatus] = useState<DocStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      setStatus(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { status, refresh };
}

export function useDocuments() {
  const [docs, setDocs] = useState<Document[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      setDocs(await res.json());
    } catch { /* ignore */ }
  }, []);

  const remove = useCallback(async (id: number) => {
    await fetch(`/api/documents/${id}`, { method: "DELETE" });
    await refresh();
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);
  return { docs, refresh, remove };
}

export function useConversations() {
  const [convs, setConvs] = useState<Conversation[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      setConvs(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { convs, refresh };
}

export interface OutputFile {
  name: string;
  size: number;
  modified: string;
  url: string;
}

export function useOutputFiles() {
  const [files, setFiles] = useState<OutputFile[]>([]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/output-files");
      if (res.ok) setFiles(await res.json());
    } catch { /* ignore */ }
  }, []);

  // 최초 로드 + 3초마다 폴링 (파일 생성 즉시 사이드바 반영)
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { files, refresh };
}
