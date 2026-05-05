/**
 * Collector — fetches web content for a research topic
 *
 * source_type='keyword': WebSearch → parse URLs → fetch each
 * source_type='url':    fetch each URL from url_list directly
 */
import { computeHash, isDuplicate } from "../ingestion/deduplicator.js";
import { indexWebContent } from "./pipeline.js";
import { logCollectionRun } from "./topics.js";
import { getTopic } from "./topics.js";
import { logTask } from "../memory/task-log.js";
import type { WebContent } from "./types.js";

const MIN_FETCH_INTERVAL_MS = 2000;
const DEFAULT_TOP_K = 5;

let lastFetchTime = 0;

async function rateLimitedFetch<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const elapsed = now - lastFetchTime;
  if (elapsed < MIN_FETCH_INTERVAL_MS) {
    await new Promise((r) => setTimeout(r, MIN_FETCH_INTERVAL_MS - elapsed));
  }
  lastFetchTime = Date.now();
  return fn();
}

/** Extract URLs from web search text */
function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s\n)\]"'>]+/g;
  const matches = text.match(urlRegex) || [];
  // Remove trailing punctuation
  return [...new Set(matches.map((u) => u.replace(/[.,;:)\]!?]+$/, "")))].slice(
    0,
    DEFAULT_TOP_K
  );
}

/** Fetch a URL and extract text content */
async function fetchUrl(url: string): Promise<{ title: string; content: string } | null> {
  try {
    const res = await rateLimitedFetch(() =>
      fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (compatible; MiniRAG/1.0; +https://github.com/raondaon-kim/mini-rag)",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(15000),
      })
    );

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    const html = await res.text();

    if (!contentType.includes("text/html")) {
      // Not HTML — treat as raw text
      return { title: url, content: html.slice(0, 50000) };
    }

    // Parse title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim().replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : url;

    // Strip HTML tags and extract readable text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();

    return {
      title,
      content: text.slice(0, 50000),
    };
  } catch {
    return null;
  }
}

/**
 * Collect web content for a topic
 *
 * Returns the count of newly indexed chunks (0 if all duplicate or failed)
 */
export async function collectForTopic(topicId: number): Promise<{
  collected: number;
  newChunks: number;
  duplicates: number;
}> {
  const topic = getTopic(topicId);
  if (!topic) throw new Error(`Topic ${topicId} not found`);

  let urls: string[] = [];

  if (topic.source_type === "keyword") {
    // Keyword search via Wikipedia API (reliable, free, no key required)
    try {
      const wikiRes = await rateLimitedFetch(() =>
        fetch(
          `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(topic.query)}&limit=${DEFAULT_TOP_K}&format=json&origin=*`,
          { signal: AbortSignal.timeout(10000) }
        )
      );
      if (wikiRes.ok) {
        const json = await wikiRes.json() as [string, string[], string[], string[]];
        const wikiUrls = json[3] || [];
        urls.push(...wikiUrls.slice(0, DEFAULT_TOP_K));
      }
    } catch (err) {
      console.warn(`[Collector] Wikipedia search failed for topic ${topicId}:`, (err as Error).message);
    }

    // Also try general web search via Brave Search API (free tier)
    const braveKey = process.env.BRAVE_SEARCH_API_KEY;
    if (braveKey && urls.length < DEFAULT_TOP_K) {
      try {
        const braveRes = await rateLimitedFetch(() =>
          fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(topic.query)}&count=${DEFAULT_TOP_K}`,
            {
              headers: {
                Accept: "application/json",
                "X-Subscription-Token": braveKey,
              },
              signal: AbortSignal.timeout(10000),
            }
          )
        );
        if (braveRes.ok) {
          const braveJson = await braveRes.json() as {
            web?: { results?: Array<{ url?: string }> };
          };
          const braveUrls = (braveJson.web?.results || [])
            .map((r) => r.url)
            .filter((u): u is string => !!u)
            .slice(0, DEFAULT_TOP_K - urls.length);
          urls.push(...braveUrls);
        }
      } catch (err) {
        console.warn(`[Collector] Brave search failed for topic ${topicId}:`, (err as Error).message);
      }
    }
  } else {
    // URL list mode — use urls directly
    urls = (topic.url_list || []).slice(0, DEFAULT_TOP_K);
  }

  if (urls.length === 0) {
    logCollectionRun(topicId, 0, 0, 0, "partial", "No URLs found");
    return { collected: 0, newChunks: 0, duplicates: 0 };
  }

  let newChunks = 0;
  let duplicates = 0;
  const fetched: string[] = [];

  for (const url of urls) {
    const result = await fetchUrl(url);
    if (!result || !result.content.trim() || result.content.length < 100) {
      continue;
    }

    const contentHash = computeHash(result.content);

    // Check duplicate
    if (isDuplicate(contentHash)) {
      duplicates++;
      continue;
    }

    const webContent: WebContent = {
      url,
      title: result.title,
      content: result.content,
      fetched_at: new Date().toISOString(),
      content_hash: contentHash,
    };

    const chunks = await indexWebContent(webContent);
    newChunks += chunks;
    fetched.push(url);
  }

  const status = duplicates === urls.length ? "partial" : fetched.length > 0 ? "success" : "failed";
  logCollectionRun(topicId, urls.length, newChunks, duplicates, status, null);
  logTask(
    null,
    `Web research: ${topic.name}`,
    `${fetched.length} fetched, ${newChunks} new chunks, ${duplicates} duplicates`,
    fetched
  );

  return { collected: fetched.length, newChunks, duplicates };
}
