/**
 * Scheduler — interval-based research topic runner
 *
 * Uses pure Node.js setInterval (no external cron dependency).
 * Tracks intervals in-memory with Map<topicId, handle>.
 */
import { listTopics, getTopic } from "./topics.js";
import { collectForTopic } from "./collector.js";

const MIN_INTERVAL_MS = 60_000; // 1 minute minimum
const intervalHandles = new Map<number, ReturnType<typeof setInterval>>();
let schedulerRunning = false;

export function startScheduler(): void {
  if (schedulerRunning) return;
  schedulerRunning = true;
  console.log("[Scheduler] Web research scheduler started");

  const topics = listTopics();
  for (const topic of topics) {
    if (topic.enabled) {
      scheduleTopic(topic.id, topic.interval_minutes);
    }
  }
}

export function stopScheduler(): void {
  for (const [, handle] of intervalHandles) {
    clearInterval(handle);
  }
  intervalHandles.clear();
  schedulerRunning = false;
  console.log("[Scheduler] Web research scheduler stopped");
}

export function scheduleTopic(topicId: number, intervalMinutes: number): void {
  // Clear existing interval if any
  unscheduleTopic(topicId);

  const topic = getTopic(topicId);
  if (!topic || !topic.enabled) return;

  const intervalMs = Math.max(intervalMinutes * 60_000, MIN_INTERVAL_MS);

  const handle = setInterval(async () => {
    const current = getTopic(topicId);
    if (!current || !current.enabled) {
      unscheduleTopic(topicId);
      return;
    }
    try {
      console.log(`[Scheduler] Running collection for topic: ${current.name}`);
      await collectForTopic(topicId);
    } catch (err) {
      console.error(
        `[Scheduler] Collection failed for topic ${topicId} (${current.name}):`,
        (err as Error).message?.slice(0, 100)
      );
    }
  }, intervalMs);

  intervalHandles.set(topicId, handle);
  console.log(`[Scheduler] Topic "${topic.name}" scheduled every ${intervalMinutes}min (${intervalMs}ms)`);
}

export function unscheduleTopic(topicId: number): void {
  const existing = intervalHandles.get(topicId);
  if (existing) {
    clearInterval(existing);
    intervalHandles.delete(topicId);
  }
}

export function isTopicScheduled(topicId: number): boolean {
  return intervalHandles.has(topicId);
}

export async function runTopicNow(topicId: number): Promise<void> {
  const topic = getTopic(topicId);
  if (!topic) throw new Error(`Topic ${topicId} not found`);
  await collectForTopic(topicId);
}
