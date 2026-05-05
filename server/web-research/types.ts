export interface ResearchTopic {
  id: number;
  name: string;
  query: string;
  url_list: string[] | null;
  source_type: "keyword" | "url";
  interval_minutes: number;
  enabled: boolean;
  created_at: string;
  last_run_at: string | null;
}

export interface CollectionRun {
  id: number;
  topic_id: number;
  run_at: string;
  urls_collected: number;
  new_chunks: number;
  duplicates: number;
  status: "success" | "partial" | "failed";
  error: string | null;
}

export interface WebContent {
  url: string;
  title: string;
  content: string;
  fetched_at: string;
  content_hash: string;
}
