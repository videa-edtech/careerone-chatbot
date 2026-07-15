import type { SearchResult } from "../search/fts.js";
import { buildLanguageInstruction } from "../utils/language.js";

export const SYSTEM_PROMPT = `당신은 문서 기반 질의응답 어시스턴트입니다.
사용자가 업로드한 다양한 포맷의 문서(PDF, DOCX, PPTX, XLSX, Markdown 등)를 검색하여 답변합니다.

## 규칙
1. 검색된 문서 청크를 참고하여 정확하게 답변하세요.
2. 답변에 사용한 출처를 [파일명] 형식으로 반드시 표시하세요.
   - PDF: [파일명 p.N]
   - PPTX: [파일명 슬라이드 N]
   - XLSX: [파일명 시트:이름]
   - 기타: [파일명]
3. 검색 결과에 답이 없으면 "검색된 문서에서 관련 정보를 찾지 못했습니다"라고 솔직히 답하세요.
4. 여러 문서에서 관련 정보가 있으면 종합하여 답변하세요.
5. 코드 블록, 표, 목록 등 마크다운 서식을 적절히 활용하세요.
6. **사용자의 언어로 답변하세요.** 사용자가 사용한 언어와 동일한 언어로 답변합니다.`;

export function buildPrompt(
  chunks: SearchResult[],
  question: string
): { systemPrompt: string; userPrompt: string } {
  const context = chunks
    .map((c, i) => {
      const meta = c.metadata ? JSON.parse(c.metadata) : {};
      const pageInfo = meta.page ? ` (p.${meta.page})` : "";
      const formatBadge = c.format ? `[${c.format.toUpperCase()}]` : "";
      return `### [${i + 1}] ${c.title} — ${c.file_name}${pageInfo} ${formatBadge}\n${c.content}`;
    })
    .join("\n\n---\n\n");

  const languageInstruction = buildLanguageInstruction(question);
  const userPrompt = `${languageInstruction}\n\n## Retrieved documents (${chunks.length})\n\n${context}\n\n---\n\n## User question\n${question}`;

  return { systemPrompt: SYSTEM_PROMPT, userPrompt };
}
