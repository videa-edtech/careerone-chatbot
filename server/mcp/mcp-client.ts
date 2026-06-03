/**
 * MCP → LangChain Tool 변환 레이어
 *
 * ragMcpServer(McpServer)의 도구들을 LangChain DynamicTool 형태로 래핑.
 * createReactAgent에 직접 전달 가능.
 *
 * 기존 claude-agent-sdk의 MCP 브리지 역할 대체.
 */
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { search } from "../search/orchestrator.js";
import { getDocumentStats, listDocuments, deleteDocument } from "../ingestion/indexer.js";
import { getDocumentSummaries } from "../memory/document-summary.js";
import { logTask } from "../memory/task-log.js";
import { saveIntent, listIntents } from "../memory/intent-store.js";
import { listConversations } from "../memory/conversation-store.js";
import {
  saveWorkJournal,
  getSmartContext,
  searchWorkJournal,
  addFeedbackToJournal,
} from "../memory/work-journal.js";
import { createDocx } from "../tasks/create-docx.js";
import { createPptx } from "../tasks/create-pptx.js";
import { createExcel } from "../tasks/create-excel.js";
import { PATHS } from "../config.js";
import { mkdir } from "fs/promises";
import path from "path";

// ==============================
// RAG 도구들 → LangChain DynamicStructuredTool
// ==============================

export interface RagToolContext {
  userIp?: string;
}

export function buildRagTools(context: RagToolContext = {}): DynamicStructuredTool[] {
  const searchDocumentsTool = new DynamicStructuredTool({
    name: "search_documents",
    description: "인덱싱된 문서에서 키워드/의미 검색을 수행합니다. 사용자 질문에 답하기 위해 관련 문서 청크를 찾을 때 사용하세요.",
    schema: z.object({
      query: z.string().describe("검색 쿼리 텍스트"),
      top_k: z.number().int().min(1).max(20).default(5).describe("반환할 결과 수"),
      search_mode: z.enum(["fts", "hybrid", "auto"]).default("auto").describe("검색 모드"),
    }),
    func: async (args) => {
      const results = await search(args.query, {
        topK: args.top_k,
        searchMode: args.search_mode,
      });

      if (results.length === 0) {
        return "검색 결과가 없습니다. 다른 키워드로 검색해보세요.";
      }

      const docIds = [...new Set(results.map((r) => r.document_id))];
      const summaries = getDocumentSummaries(docIds);
      const summaryMap = new Map(summaries.map((s) => [s.document_id, s]));

      let responseText = "";
      for (const docId of docIds) {
        const summary = summaryMap.get(docId);
        const docChunks = results.filter((r) => r.document_id === docId);

        if (summary) {
          responseText += `📋 문서 컨텍스트 [${docChunks[0]?.file_name || ""}]: ${summary.summary.slice(0, 200)}\n\n`;
        }

        const topChunks = docChunks.slice(0, 3);
        for (let i = 0; i < topChunks.length; i++) {
          const r = topChunks[i];
          const meta = r.metadata ? JSON.parse(r.metadata) : {};
          const pageInfo = meta.page ? ` (p.${meta.page})` : "";
          responseText += `[${i + 1}] ${r.title} — ${r.file_name}${pageInfo} [${r.format.toUpperCase()}]\nScore: ${r.score.toFixed(4)}\n${r.content}\n\n`;
        }

        if (docChunks.length > 3) {
          const remaining = docChunks.slice(3);
          responseText += `추가 관련 섹션: ${remaining.map((r) => {
            const meta = r.metadata ? JSON.parse(r.metadata) : {};
            return meta.page ? `p.${meta.page}` : r.title;
          }).join(", ")}\n`;
        }
        responseText += "\n---\n\n";
      }

      return `검색 결과 ${results.length}건:\n\n${responseText.trim()}`;
    },
  });

  const getDocumentStatusTool = new DynamicStructuredTool({
    name: "get_document_status",
    description: "현재 인덱싱된 문서의 통계를 조회합니다.",
    schema: z.object({}),
    func: async () => {
      const stats = getDocumentStats();
      if (stats.total_documents === 0) {
        return "인덱싱된 문서가 없습니다. 문서를 업로드해주세요.";
      }
      return `총 ${stats.total_documents}개 문서, ${stats.total_chunks.toLocaleString()}개 청크\n포맷별: ${(stats.by_format as Array<{ format: string; doc_count: number; chunk_count: number }>).map((f) => `${f.format.toUpperCase()} ${f.doc_count}개(${f.chunk_count}청크)`).join(", ")}`;
    },
  });

  const listDocumentsTool = new DynamicStructuredTool({
    name: "list_documents",
    description: "인덱싱된 문서 목록을 조회합니다.",
    schema: z.object({
      format: z.string().optional().describe("포맷 필터"),
      limit: z.number().int().default(20).describe("최대 조회 수"),
    }),
    func: async (args) => {
      const docs = listDocuments(args.format, args.limit) as Array<{
        id: number; file_name: string; format: string; chunk_count: number; created_at: string;
      }>;

      if (docs.length === 0) return "등록된 문서가 없습니다.";
      const list = docs.map((d) => `- [${d.format.toUpperCase()}] ${d.file_name} (${d.chunk_count}청크, ${d.created_at})`).join("\n");
      return `문서 ${docs.length}건:\n${list}`;
    },
  });

  const deleteDocumentTool = new DynamicStructuredTool({
    name: "delete_document",
    description: "인덱싱된 문서를 삭제합니다.",
    schema: z.object({
      document_id: z.number().int().describe("삭제할 문서 ID"),
    }),
    func: async (args) => {
      const success = deleteDocument(args.document_id);
      return success ? `문서 ${args.document_id} 삭제 완료` : `문서 ${args.document_id}을 찾을 수 없습니다`;
    },
  });

  const saveUserIntentTool = new DynamicStructuredTool({
    name: "save_user_intent",
    description: "사용자의 의도나 목표를 MD 파일로 저장합니다.",
    schema: z.object({
      title: z.string().describe("의도 제목"),
      content: z.string().describe("의도 상세 내용"),
      tags: z.array(z.string()).optional().describe("관련 태그"),
      status: z.enum(["new", "in_progress", "done"]).default("new").describe("진행 상태"),
    }),
    func: async (args) => {
      const filePath = await saveIntent(args.title, args.content, args.tags || [], args.status);
      return `의도 저장됨: ${filePath}`;
    },
  });

  const logTaskExecutionTool = new DynamicStructuredTool({
    name: "log_task_execution",
    description: "수행한 작업을 로그로 기록합니다.",
    schema: z.object({
      action: z.string().describe("수행한 작업 설명"),
      result: z.string().describe("작업 결과 요약"),
      related_files: z.array(z.string()).optional().describe("관련 파일명 목록"),
    }),
    func: async (args) => {
      logTask(null, args.action, args.result, args.related_files || []);
      return "작업 기록 완료";
    },
  });

  const getConversationHistoryTool = new DynamicStructuredTool({
    name: "get_conversation_history",
    description: "이전 대화 목록을 조회합니다.",
    schema: z.object({
      limit: z.number().int().default(10).describe("조회할 대화 수"),
    }),
    func: async (args) => {
      if (!context.userIp) {
        return "대화 기록은 사용자 IP 컨텍스트가 있을 때만 조회할 수 있습니다.";
      }

      const convs = listConversations(context.userIp, args.limit) as Array<{
        id: string; title: string; created_at: string; updated_at: string;
      }>;
      if (convs.length === 0) return "이전 대화 기록이 없습니다.";
      const list = convs.map((c) => `- ${c.title} (${c.updated_at})`).join("\n");
      return `최근 대화 ${convs.length}건:\n${list}`;
    },
  });

  const getUserIntentsTool = new DynamicStructuredTool({
    name: "get_user_intents",
    description: "저장된 사용자 의도/목표 목록을 조회합니다.",
    schema: z.object({}),
    func: async () => {
      const intents = await listIntents();
      if (intents.length === 0) return "저장된 사용자 의도가 없습니다.";
      const list = intents.map((i) =>
        `- [${i.status}] ${i.title} (${i.date}) ${i.tags.length > 0 ? `태그: ${i.tags.join(", ")}` : ""}`
      ).join("\n");
      return `사용자 의도 ${intents.length}건:\n${list}`;
    },
  });

  const saveWorkJournalTool = new DynamicStructuredTool({
    name: "save_work_journal",
    description: "작업 완료 후 학습 일지를 기록합니다.",
    schema: z.object({
      task_type: z.string().describe("작업 유형"),
      skill_used: z.string().describe("적용한 Skill/프레임워크 이름"),
      description: z.string().describe("수행한 작업 내용 요약"),
      output_file: z.string().optional().describe("생성된 파일 경로"),
      user_feedback: z.string().optional().describe("사용자 반응/피드백"),
      lessons: z.string().optional().describe("배운 점"),
      quality_notes: z.string().optional().describe("잘된 점, 개선할 점"),
    }),
    func: async (args) => {
      const id = saveWorkJournal(args);
      return `작업 일지 기록됨 (id: ${id}): ${args.task_type} — ${args.skill_used}`;
    },
  });

  const queryWorkJournalTool = new DynamicStructuredTool({
    name: "query_work_journal",
    description: "이전 작업 기록을 조회합니다.",
    schema: z.object({
      task_type: z.string().optional().describe("작업 유형으로 필터"),
      keyword: z.string().optional().describe("키워드 검색"),
    }),
    func: async (args) => {
      if (args.keyword) {
        const results = searchWorkJournal(args.keyword, 5);
        if (results.length === 0) return "관련 작업 기록이 없습니다.";
        const text = results.map((r) =>
          `[${r.created_at}] ${r.task_type} — ${r.skill_used}\n  설명: ${r.description}\n  교훈: ${r.lessons || "없음"}\n  피드백: ${r.user_feedback || "없음"}`
        ).join("\n\n");
        return `검색 결과 ${results.length}건:\n\n${text}`;
      }

      const { recent, digest } = getSmartContext(args.task_type || "");
      const parts: string[] = [];

      if (digest.total_count > 0) {
        parts.push(`📊 작업 요약 (총 ${digest.total_count}건):`);
        parts.push(`  사용한 Skill: ${digest.skills_used.join(", ")}`);
        if (digest.common_lessons.length > 0) parts.push(`  반복 교훈: ${digest.common_lessons.join("; ")}`);
        if (digest.common_feedback.length > 0) parts.push(`  반복 피드백: ${digest.common_feedback.join("; ")}`);
      }

      if (recent.length > 0) {
        parts.push(`\n📋 최근 ${recent.length}건:`);
        for (const r of recent) {
          parts.push(`[${r.created_at}] ${r.skill_used}\n  ${r.description}`);
        }
      }

      return parts.length === 0 ? "이전 작업 기록이 없습니다." : parts.join("\n");
    },
  });

  const addFeedbackTool = new DynamicStructuredTool({
    name: "add_feedback_to_journal",
    description: "가장 최근 작업 기록에 사용자 피드백과 교훈을 추가합니다.",
    schema: z.object({
      journal_id: z.number().int().describe("작업 일지 ID"),
      feedback: z.string().describe("사용자 피드백 내용"),
      lesson: z.string().optional().describe("배운 교훈"),
    }),
    func: async (args) => {
      addFeedbackToJournal(args.journal_id, args.feedback, args.lesson);
      return `피드백 기록됨 (journal #${args.journal_id})`;
    },
  });

  // ==============================
  // 파일 생성 도구
  // ==============================

  const createDocxTool = new DynamicStructuredTool({
    name: "create_docx",
    description: "Word(.docx) 문서를 생성합니다. 보고서, 이메일, 회의록, 기획서 등 텍스트 기반 문서에 사용하세요. 생성 후 다운로드 링크를 반환합니다.",
    schema: z.object({
      file_name: z.string().describe("파일명 (예: 보고서.docx). .docx 확장자 포함"),
      title: z.string().describe("문서 제목"),
      author: z.string().optional().describe("작성자"),
      sections: z.array(z.object({
        heading: z.string().optional().describe("섹션 제목"),
        heading_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional().describe("제목 레벨 (1=대제목, 2=중제목, 3=소제목)"),
        content: z.string().describe("섹션 본문 내용"),
      })).describe("문서 섹션 목록"),
    }),
    func: async (args) => {
      const sections = args.sections.map(s => ({
        heading: s.heading,
        headingLevel: s.heading_level as 1 | 2 | 3 | undefined,
        content: s.content,
      }));
      const safeIp = (context.userIp || "unknown").replace(/:/g, "_");
      const targetDir = path.join(PATHS.output, safeIp);
      await mkdir(targetDir, { recursive: true });
      const filePath = await createDocx(
        args.file_name,
        sections,
        { title: args.title, author: args.author },
        targetDir
      );
      const fileName = filePath.split(/[\\/]/).pop()!;
      return `✅ Word 문서 생성 완료\n파일명: ${fileName}\n다운로드: /api/files/${encodeURIComponent(safeIp)}/${encodeURIComponent(fileName)}\n사이드바 "생성된 파일" 목록에서 바로 다운로드할 수 있습니다.`;
    },
  });

  const createPptxTool = new DynamicStructuredTool({
    name: "create_pptx",
    description: "PowerPoint(.pptx) 프레젠테이션을 생성합니다. 피치덱, 보고 PPT, 교육 자료에 사용하세요.",
    schema: z.object({
      file_name: z.string().describe("파일명 (예: 발표자료.pptx). .pptx 확장자 포함"),
      title: z.string().describe("프레젠테이션 제목"),
      author: z.string().optional().describe("작성자"),
      slides: z.array(z.object({
        title: z.string().describe("슬라이드 제목"),
        content: z.string().describe("슬라이드 내용"),
        notes: z.string().optional().describe("발표자 노트"),
        layout: z.enum(["title", "content", "two-column", "section"]).optional().describe("슬라이드 레이아웃"),
      })).describe("슬라이드 목록"),
    }),
    func: async (args) => {
      const safeIp = (context.userIp || "unknown").replace(/:/g, "_");
      const targetDir = path.join(PATHS.output, safeIp);
      await mkdir(targetDir, { recursive: true });
      const filePath = await createPptx(
        args.file_name,
        args.slides,
        { title: args.title, author: args.author },
        targetDir
      );
      const fileName = filePath.split(/[\\/]/).pop()!;
      return `✅ PowerPoint 생성 완료\n파일명: ${fileName}\n다운로드: /api/files/${encodeURIComponent(safeIp)}/${encodeURIComponent(fileName)}\n사이드바 "생성된 파일" 목록에서 바로 다운로드할 수 있습니다.`;
    },
  });

  const createExcelTool = new DynamicStructuredTool({
    name: "create_excel",
    description: "Excel(.xlsx) 스프레드시트를 생성합니다. 데이터 테이블, 대시보드, 집계표에 사용하세요.",
    schema: z.object({
      file_name: z.string().describe("파일명 (예: 데이터.xlsx). .xlsx 확장자 포함"),
      sheets: z.array(z.object({
        name: z.string().describe("시트 이름"),
        headers: z.array(z.string()).describe("열 헤더 목록"),
        rows: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))).describe("데이터 행 목록"),
      })).describe("시트 목록"),
    }),
    func: async (args) => {
      const safeIp = (context.userIp || "unknown").replace(/:/g, "_");
      const targetDir = path.join(PATHS.output, safeIp);
      await mkdir(targetDir, { recursive: true });
      const filePath = await createExcel(args.file_name, args.sheets, targetDir);
      const fileName = filePath.split(/[\\/]/).pop()!;
      return `✅ Excel 파일 생성 완료\n파일명: ${fileName}\n다운로드: /api/files/${encodeURIComponent(safeIp)}/${encodeURIComponent(fileName)}\n사이드바 "생성된 파일" 목록에서 바로 다운로드할 수 있습니다.`;
    },
  });

  return [
    searchDocumentsTool,
    getDocumentStatusTool,
    listDocumentsTool,
    deleteDocumentTool,
    saveUserIntentTool,
    logTaskExecutionTool,
    getConversationHistoryTool,
    getUserIntentsTool,
    saveWorkJournalTool,
    queryWorkJournalTool,
    addFeedbackTool,
    createDocxTool,
    createPptxTool,
    createExcelTool,
  ];
}
