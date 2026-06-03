/**
 * Custom MCP Server for Mini-RAG — DeepSeek 마이그레이션 버전
 *
 * @anthropic-ai/claude-agent-sdk의 createSdkMcpServer + tool() 제거
 * → @modelcontextprotocol/sdk의 표준 McpServer로 교체
 *
 * 동일한 11개 도구를 유지하면서 호환 레이어 제공.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { search } from "../search/orchestrator.js";
import { getDocumentStats, listDocuments, deleteDocument } from "../ingestion/indexer.js";
import { getDocumentSummaries } from "../memory/document-summary.js";
import { logTask } from "../memory/task-log.js";
import { saveIntent, listIntents } from "../memory/intent-store.js";
import {
  saveWorkJournal,
  getSmartContext,
  searchWorkJournal,
  addFeedbackToJournal,
} from "../memory/work-journal.js";

// ==============================
// MCP Server 인스턴스
// ==============================

export const ragMcpServer = new McpServer({
  name: "rag",
  version: "3.0.0",
});

// ==============================
// 검색 도구
// ==============================

ragMcpServer.tool(
  "search_documents",
  "인덱싱된 문서에서 키워드/의미 검색을 수행합니다. 사용자 질문에 답하기 위해 관련 문서 청크를 찾을 때 사용하세요. 결과는 관련도 순으로 정렬됩니다.",
  {
    query: z.string().describe("검색 쿼리 텍스트"),
    top_k: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe("반환할 결과 수"),
    search_mode: z
      .enum(["fts", "hybrid", "auto"])
      .default("auto")
      .describe("검색 모드: fts=키워드, hybrid=키워드+벡터, auto=최적 자동 선택"),
  },
  async (args) => {
    const results = await search(args.query, {
      topK: args.top_k,
      searchMode: args.search_mode,
    });

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "검색 결과가 없습니다. 다른 키워드로 검색해보세요.",
          },
        ],
      };
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

    return {
      content: [
        {
          type: "text" as const,
          text: `검색 결과 ${results.length}건:\n\n${responseText.trim()}`,
        },
      ],
    };
  }
);

ragMcpServer.tool(
  "get_document_status",
  "현재 인덱싱된 문서의 통계를 조회합니다. 전체 문서 수, 청크 수, 포맷별 분포를 확인할 수 있습니다.",
  {},
  async () => {
    const stats = getDocumentStats();
    const summary =
      stats.total_documents === 0
        ? "인덱싱된 문서가 없습니다. 문서를 업로드해주세요."
        : `총 ${stats.total_documents}개 문서, ${stats.total_chunks.toLocaleString()}개 청크\n포맷별: ${(stats.by_format as Array<{ format: string; doc_count: number; chunk_count: number }>).map((f) => `${f.format.toUpperCase()} ${f.doc_count}개(${f.chunk_count}청크)`).join(", ")}`;

    return {
      content: [{ type: "text" as const, text: summary }],
    };
  }
);

ragMcpServer.tool(
  "list_documents",
  "인덱싱된 문서 목록을 조회합니다. 파일명, 포맷, 청크 수, 생성 날짜를 확인할 수 있습니다.",
  {
    format: z
      .string()
      .optional()
      .describe("포맷 필터 (pdf, docx, pptx, xlsx, markdown 등)"),
    limit: z.number().int().default(20).describe("최대 조회 수"),
  },
  async (args) => {
    const docs = listDocuments(args.format, args.limit) as Array<{
      id: number;
      file_name: string;
      format: string;
      chunk_count: number;
      created_at: string;
    }>;

    if (docs.length === 0) {
      return {
        content: [
          { type: "text" as const, text: "등록된 문서가 없습니다." },
        ],
      };
    }

    const list = docs
      .map(
        (d) =>
          `- [${d.format.toUpperCase()}] ${d.file_name} (${d.chunk_count}청크, ${d.created_at})`
      )
      .join("\n");

    return {
      content: [
        { type: "text" as const, text: `문서 ${docs.length}건:\n${list}` },
      ],
    };
  }
);

ragMcpServer.tool(
  "delete_document",
  "인덱싱된 문서를 삭제합니다. 문서 ID를 지정하면 해당 문서와 모든 관련 청크가 삭제됩니다.",
  {
    document_id: z.number().int().describe("삭제할 문서 ID"),
  },
  async (args) => {
    const success = deleteDocument(args.document_id);
    return {
      content: [
        {
          type: "text" as const,
          text: success
            ? `문서 ${args.document_id} 삭제 완료`
            : `문서 ${args.document_id}을 찾을 수 없습니다`,
        },
      ],
    };
  }
);

// ==============================
// 기록 도구
// ==============================

ragMcpServer.tool(
  "save_user_intent",
  "사용자의 의도나 목표를 MD 파일로 저장합니다. 대화에서 사용자가 새로운 목표나 프로젝트 의도를 표현하면 이 도구로 기록하세요.",
  {
    title: z.string().describe("의도 제목 (예: 'RAG 시스템 구축')"),
    content: z.string().describe("의도 상세 내용 (마크다운 형식)"),
    tags: z
      .array(z.string())
      .optional()
      .describe("관련 태그 (예: ['RAG', '문서검색'])"),
    status: z
      .enum(["new", "in_progress", "done"])
      .default("new")
      .describe("진행 상태"),
  },
  async (args) => {
    const filePath = await saveIntent(
      args.title,
      args.content,
      args.tags || [],
      args.status
    );
    return {
      content: [
        {
          type: "text" as const,
          text: `의도 저장됨: ${filePath}`,
        },
      ],
    };
  }
);

ragMcpServer.tool(
  "log_task_execution",
  "수행한 작업을 로그로 기록합니다. 검색, 문서 처리 등 모든 작업 완료 후 호출하세요.",
  {
    action: z.string().describe("수행한 작업 설명"),
    result: z.string().describe("작업 결과 요약"),
    related_files: z
      .array(z.string())
      .optional()
      .describe("관련 파일명 목록"),
  },
  async (args) => {
    logTask(null, args.action, args.result, args.related_files || []);
    return {
      content: [{ type: "text" as const, text: "작업 기록 완료" }],
    };
  }
);

ragMcpServer.tool(
  "get_conversation_history",
  "이전 대화 목록을 조회합니다. 사용자가 이전 대화를 참조하거나 맥락을 이어갈 때 사용하세요.",
  {
    limit: z.number().int().default(10).describe("조회할 대화 수"),
  },
  async () => {
    return {
      content: [
        {
          type: "text" as const,
          text: "대화 기록은 사용자 IP 컨텍스트가 있을 때만 조회할 수 있습니다.",
        },
      ],
    };
  }
);

ragMcpServer.tool(
  "get_user_intents",
  "저장된 사용자 의도/목표 목록을 조회합니다. 세션 시작 시 이전 맥락을 파악하거나, 진행 상황을 확인할 때 사용하세요.",
  {},
  async () => {
    const intents = await listIntents();

    if (intents.length === 0) {
      return {
        content: [
          {
            type: "text" as const,
            text: "저장된 사용자 의도가 없습니다.",
          },
        ],
      };
    }

    const list = intents
      .map(
        (i) =>
          `- [${i.status}] ${i.title} (${i.date}) ${i.tags.length > 0 ? `태그: ${i.tags.join(", ")}` : ""}`
      )
      .join("\n");
    return {
      content: [
        {
          type: "text" as const,
          text: `사용자 의도 ${intents.length}건:\n${list}`,
        },
      ],
    };
  }
);

// ==============================
// 작업 학습 일지 도구
// ==============================

ragMcpServer.tool(
  "save_work_journal",
  "작업 완료 후 학습 일지를 기록합니다. 어떤 Skill/프레임워크를 적용했고 결과가 어땠는지 기록하세요.",
  {
    task_type: z.string().describe("작업 유형: report, proposal, ppt, excel, search, analysis, email, blog, essay, marketing 등"),
    skill_used: z.string().describe("적용한 Skill/프레임워크 이름"),
    description: z.string().describe("수행한 작업 내용 요약"),
    output_file: z.string().optional().describe("생성된 파일 경로"),
    user_feedback: z.string().optional().describe("사용자 반응/피드백"),
    lessons: z.string().optional().describe("배운 점, 다음에 다르게 할 것"),
    quality_notes: z.string().optional().describe("잘된 점, 개선할 점"),
  },
  async (args) => {
    const id = saveWorkJournal(args);
    return {
      content: [{
        type: "text" as const,
        text: `작업 일지 기록됨 (id: ${id}): ${args.task_type} — ${args.skill_used}`,
      }],
    };
  }
);

ragMcpServer.tool(
  "query_work_journal",
  "이전 작업 기록을 조회합니다. 같은 유형의 작업을 할 때 이전에 적용한 프레임워크, 사용자 피드백, 교훈을 참고하세요.",
  {
    task_type: z.string().optional().describe("작업 유형으로 필터 (예: report, ppt, excel). 미지정 시 최근 기록 반환"),
    keyword: z.string().optional().describe("키워드 검색"),
  },
  async (args) => {
    if (args.keyword) {
      const results = searchWorkJournal(args.keyword, 5);
      if (results.length === 0) {
        return { content: [{ type: "text" as const, text: "관련 작업 기록이 없습니다." }] };
      }
      const text = results.map((r) =>
        `[${r.created_at}] ${r.task_type} — ${r.skill_used}\n  설명: ${r.description}\n  교훈: ${r.lessons || "없음"}\n  피드백: ${r.user_feedback || "없음"}`
      ).join("\n\n");
      return { content: [{ type: "text" as const, text: `검색 결과 ${results.length}건:\n\n${text}` }] };
    }

    const { recent, digest } = getSmartContext(args.task_type || "");
    const parts: string[] = [];

    if (digest.total_count > 0) {
      parts.push(`📊 ${digest.task_type || "전체"} 작업 요약 (총 ${digest.total_count}건):`);
      parts.push(`  사용한 Skill: ${digest.skills_used.join(", ")}`);
      if (digest.common_lessons.length > 0) parts.push(`  반복 교훈: ${digest.common_lessons.join("; ")}`);
      if (digest.common_feedback.length > 0) parts.push(`  반복 피드백: ${digest.common_feedback.join("; ")}`);
    }

    if (recent.length > 0) {
      parts.push(`\n📋 최근 ${recent.length}건 상세:`);
      for (const r of recent) {
        parts.push(`[${r.created_at}] ${r.skill_used}\n  ${r.description}\n  교훈: ${r.lessons || "없음"}\n  피드백: ${r.user_feedback || "없음"}`);
      }
    }

    if (parts.length === 0) {
      return { content: [{ type: "text" as const, text: "이전 작업 기록이 없습니다. 첫 작업입니다!" }] };
    }

    return { content: [{ type: "text" as const, text: parts.join("\n") }] };
  }
);

ragMcpServer.tool(
  "add_feedback_to_journal",
  "가장 최근 작업 기록에 사용자 피드백과 교훈을 추가합니다.",
  {
    journal_id: z.number().int().describe("작업 일지 ID"),
    feedback: z.string().describe("사용자 피드백 내용"),
    lesson: z.string().optional().describe("이 피드백에서 배운 교훈"),
  },
  async (args) => {
    addFeedbackToJournal(args.journal_id, args.feedback, args.lesson);
    return {
      content: [{ type: "text" as const, text: `피드백 기록됨 (journal #${args.journal_id})` }],
    };
  }
);
