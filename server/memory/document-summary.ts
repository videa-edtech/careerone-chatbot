/**
 * Document Summary — Karpathy Wiki 패턴 (DeepSeek V4 Flash)
 *
 * @anthropic-ai/sdk 제거 → deepseekClient (OpenAI 호환)로 교체
 */
import db from "../db/connection.js";
import { deepseekClient } from "../llm/deepseek.js";
import { writeFile, mkdir, stat as fsStat } from "fs/promises";
import path from "path";
import { PATHS } from "../config.js";
import { chunkDocument } from "../ingestion/chunker.js";
import { indexDocument } from "../ingestion/indexer.js";
import { computeHash } from "../ingestion/deduplicator.js";

const DEEPSEEK_MODEL = "deepseek-v4-flash";

export interface DocumentSummary {
  id?: number;
  document_id: number;
  title: string;
  summary: string;
  key_concepts: string;
  structure: string;
  created_at?: string;
}

// Lazy-init
let _stmts: {
  upsert: any;
  getByDocId: any;
  getByDocIds: any;
  getAll: any;
} | null = null;

function stmts() {
  if (!_stmts) {
    _stmts = {
      upsert: db.prepare(`
        INSERT INTO document_summaries (document_id, title, summary, key_concepts, structure)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(document_id) DO UPDATE SET
          title = excluded.title,
          summary = excluded.summary,
          key_concepts = excluded.key_concepts,
          structure = excluded.structure
      `),
      getByDocId: db.prepare(
        "SELECT * FROM document_summaries WHERE document_id = ?"
      ),
      getByDocIds: db.prepare(
        "SELECT * FROM document_summaries WHERE document_id IN (SELECT value FROM json_each(?))"
      ),
      getAll: db.prepare(
        "SELECT * FROM document_summaries ORDER BY created_at DESC"
      ),
    };
  }
  return _stmts;
}

export function saveDocumentSummary(summary: DocumentSummary): void {
  stmts().upsert.run(summary.document_id, summary.title, summary.summary, summary.key_concepts, summary.structure);
}

export function getDocumentSummary(documentId: number): DocumentSummary | null {
  return stmts().getByDocId.get(documentId) as DocumentSummary | null;
}

export function getDocumentSummaries(documentIds: number[]): DocumentSummary[] {
  if (documentIds.length === 0) return [];
  return stmts().getByDocIds.all(JSON.stringify(documentIds)) as DocumentSummary[];
}

export function getAllSummaries(): DocumentSummary[] {
  return stmts().getAll.all() as DocumentSummary[];
}

// ==============================
// 병렬 요약 생성
// ==============================

const CONCURRENT = 5;
const SEGMENT_CHARS = 3000;

async function parallelBatch<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((item, idx) => fn(item, i + idx))
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
    if (i + concurrency < items.length) {
      console.log(`[DocSummary] segments ${i + 1}-${i + batch.length}/${items.length} done`);
    }
  }
  return results;
}

function buildSegments(chunks: Array<{ title: string; content: string }>): string[] {
  const segments: string[] = [];
  let current = "";

  for (const chunk of chunks) {
    if (chunk.content.length < 30) continue;
    const entry = `[${chunk.title}]\n${chunk.content}\n\n`;
    if (current.length + entry.length > SEGMENT_CHARS && current.length > 100) {
      segments.push(current);
      current = entry;
    } else {
      current += entry;
    }
  }
  if (current.length > 100) segments.push(current);
  return segments;
}

/**
 * AI로 문서 요약 생성 — DeepSeek V4 Flash 사용
 */
export async function generateDocumentSummary(
  documentId: number,
  fileName: string,
  chunks: Array<{ title: string; content: string }>
): Promise<DocumentSummary | null> {
  if (chunks.length === 0) return null;

  try {
    const segments = buildSegments(chunks);
    console.log(`[DocSummary] ${fileName}: ${chunks.length} chunks → ${segments.length} segments`);

    // ── 1단계: 모든 세그먼트 병렬 요약 ──
    const partialSummaries = await parallelBatch(
      segments,
      CONCURRENT,
      async (segment, idx) => {
        const resp = await deepseekClient.chat.completions.create({
          model: DEEPSEEK_MODEL,
          max_tokens: 400,
          // @ts-ignore
          thinking: { type: "disabled" },
          messages: [{
            role: "user",
            content: `다음 문서 구간의 내용을 마크다운으로 요약하세요. 핵심 개념, 중요 용어, 주요 내용을 빠짐없이 포함하세요.

### 구간 ${idx + 1}/${segments.length}
${segment}

형식:
#### [이 구간의 주제]
[핵심 내용 3-5줄. 중요 용어는 **굵게** 표시]`,
          }],
        });
        return resp.choices[0]?.message?.content ?? "";
      }
    );

    console.log(`[DocSummary] ${fileName}: ${segments.length}/${segments.length} segments summarized`);

    // ── 2단계: 전체 개요 생성 ──
    const allPartials = partialSummaries.filter(Boolean).join("\n\n");

    const overviewResp = await deepseekClient.chat.completions.create({
      model: DEEPSEEK_MODEL,
      max_tokens: 800,
      // @ts-ignore
      thinking: { type: "disabled" },
      messages: [{
        role: "user",
        content: `다음은 "${fileName}" 문서의 섹션별 요약입니다. 전체 문서의 개요를 마크다운으로 작성하세요.

${allPartials.slice(0, 8000)}

형식:
## 전체 요약
[문서 전체 내용을 5-8문장으로 종합 요약]

## 핵심 개념
- **[개념1]**: [1줄 설명]
- **[개념2]**: [1줄 설명]
(최대 10개)

## 문서 구조
[파트/챕터 구성을 2-3문장으로]`,
      }],
    });

    const overview = overviewResp.choices[0]?.message?.content ?? "";

    // ── 3단계: 최종 마크다운 조합 ──
    let fullMd = `# ${fileName} — AI 요약\n\n`;
    fullMd += `> 원본: ${fileName} | 청크: ${chunks.length}개 | 생성일: ${new Date().toISOString().slice(0, 10)}\n\n`;
    fullMd += `${overview}\n\n`;
    fullMd += `---\n\n# 섹션별 상세 요약\n\n`;
    fullMd += allPartials;
    fullMd += `\n\n---\n*이 요약은 DeepSeek V4 Flash가 자동으로 생성했습니다. 전체 ${segments.length}개 구간을 처리했습니다.*\n`;

    // ── 4단계: DB 필드 추출 ──
    const titleMatch = overview.match(/^##?\s+전체 요약\s*\n([\s\S]*?)(?=\n## |$)/m);
    const conceptsMatch = overview.match(/## 핵심 개념\s*\n([\s\S]*?)(?=\n## |$)/);
    const structureMatch = overview.match(/## 문서 구조\s*\n([\s\S]*?)(?=\n## |$)/);

    const extractedSummary = titleMatch?.[1]?.trim() || overview.slice(0, 800);
    const extractedConcepts = conceptsMatch?.[1]?.match(/\*\*(.+?)\*\*/g)?.map((s: string) => s.replace(/\*\*/g, "")) || [];
    const extractedStructure = structureMatch?.[1]?.trim() || "";

    const summary: DocumentSummary = {
      document_id: documentId,
      title: fileName.replace(/\.[^.]+$/, ""),
      summary: extractedSummary,
      key_concepts: JSON.stringify(extractedConcepts),
      structure: extractedStructure,
    };

    saveDocumentSummary(summary);

    // 마크다운 파일 저장
    const summaryDir = PATHS.summaries;
    await mkdir(summaryDir, { recursive: true });
    const safeName = fileName.replace(/[^a-zA-Z0-9가-힣._-]/g, "_").replace(/\.[^.]+$/, "");
    const mdPath = path.join(summaryDir, `${safeName}_요약.md`);
    await writeFile(mdPath, fullMd, "utf-8");

    // 요약 마크다운을 RAG 인덱스에 등록
    try {
      const summaryChunks = chunkDocument(`${safeName}_요약.md`, fullMd, "markdown", { source: fileName, type: "summary" });
      const hash = computeHash(fullMd);
      const fileSize = (await fsStat(mdPath)).size;
      await indexDocument(mdPath, `${safeName}_요약.md`, "markdown", hash, { source: fileName, type: "summary" }, fileSize, summaryChunks);
      console.log(`[DocSummary] ✅ ${fileName}: ${segments.length} segments → ${mdPath} (${(fullMd.length / 1024).toFixed(1)}KB) → ${summaryChunks.length} search chunks indexed`);
    } catch (e) {
      console.warn("[DocSummary] Summary indexing failed:", (e as Error).message?.slice(0, 60));
      console.log(`[DocSummary] ✅ ${fileName}: ${segments.length} segments → ${mdPath} (${(fullMd.length / 1024).toFixed(1)}KB)`);
    }

    return summary;
  } catch (e) {
    console.warn("[DocSummary] Failed:", (e as Error).message?.slice(0, 80));
    return null;
  }
}
