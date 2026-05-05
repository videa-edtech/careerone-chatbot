/**
 * Web research pipeline — converts fetched WebContent into indexed chunks
 *
 * Flow: WebContent → save as .md with frontmatter → readDocument → chunk → index
 */
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { computeHash, isDuplicate } from "../ingestion/deduplicator.js";
import { chunkDocument } from "../ingestion/chunker.js";
import { indexDocument } from "../ingestion/indexer.js";
import type { WebContent } from "./types.js";
import { PATHS } from "../config.js";

const WEB_CONTENT_DIR = path.resolve(PATHS.memory, "web-research", "content");

function sanitizeFileName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9가-힣_.~-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 100);
}

export async function indexWebContent(content: WebContent): Promise<number> {
  // 1. Save content as synthetic markdown file
  await mkdir(WEB_CONTENT_DIR, { recursive: true });

  const safeTitle = sanitizeFileName(content.title);
  const fileName = `${content.content_hash.slice(0, 16)}_${safeTitle}.md`;
  const filePath = path.join(WEB_CONTENT_DIR, fileName);

  // Write as markdown with YAML frontmatter
  const markdown = `---
source_url: ${content.url}
fetched_at: ${content.fetched_at}
format: web
---

# ${content.title}

${content.content}
`;

  await writeFile(filePath, markdown, "utf-8");

  // 2. Read back through existing reader (markdown path)
  const { readDocument } = await import("../ingestion/reader.js");
  const { content: docContent, metadata } = await readDocument(filePath);

  if (!docContent.trim()) return 0;

  // 3. Deduplication check (reuse existing function)
  const hash = computeHash(docContent);
  const existingId = isDuplicate(hash);
  if (existingId) return 0;

  // 4. Chunk
  const chunks = chunkDocument(fileName, docContent, "markdown", {
    ...metadata,
    source_url: content.url,
    fetched_at: content.fetched_at,
    format: "web",
  });

  if (chunks.length === 0) return 0;

  // 5. Index
  const fileSize = Buffer.byteLength(markdown, "utf-8");
  const result = await indexDocument(
    filePath,
    fileName,
    "web",
    hash,
    { ...metadata, source_url: content.url, fetched_at: content.fetched_at, format: "web" },
    fileSize,
    chunks
  );

  return result.chunks_created;
}
