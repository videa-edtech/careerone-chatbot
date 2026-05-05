/**
 * Embedding Module — transformers.js (paraphrase-multilingual-MiniLM-L12-v2, 384dim)
 *
 * 싱글턴 파이프라인으로 모델을 한 번만 로드.
 * 첫 호출 시 ~2-3초 로드, 이후 ~10ms/문장.
 *
 * 모델: 50+ 언어 지원 (English, Korean, Sinhala, Tamil, Japanese, etc.)
 * all-MiniLM-L6-v2는 영어-only였으므로 멀티링구얼 모델로 교체.
 */
import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const EMBEDDING_DIM = 384;

let embedPipeline: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

async function getEmbedder(): Promise<FeatureExtractionPipeline> {
  if (embedPipeline) return embedPipeline;
  if (loading) return loading;

  loading = (async () => {
    console.log("[Embedder] Loading model:", MODEL_NAME);
    const p = await pipeline("feature-extraction", MODEL_NAME);
    embedPipeline = p;
    console.log("[Embedder] Model ready (dim=%d)", EMBEDDING_DIM);
    return p;
  })();

  return loading;
}

/**
 * 텍스트 → Float32Array 임베딩 (384차원)
 */
export async function generateEmbedding(text: string): Promise<Float32Array> {
  const emb = await getEmbedder();
  const result = await emb(text, { pooling: "mean", normalize: true });
  return new Float32Array(result.data as Float32Array);
}

/**
 * 배치 임베딩 — 여러 텍스트를 한번에
 */
export async function generateEmbeddings(texts: string[]): Promise<Float32Array[]> {
  const results: Float32Array[] = [];
  for (const text of texts) {
    results.push(await generateEmbedding(text));
  }
  return results;
}

/**
 * Float32Array → JSON string (sqlite-vec vec_f32용)
 */
export function embeddingToJson(embedding: Float32Array): string {
  return JSON.stringify(Array.from(embedding));
}

/**
 * Float32Array → Buffer (sqlite-vec MATCH 쿼리용)
 */
export function embeddingToBuffer(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

/**
 * Float32Array → hex string (sqlite-vec INSERT용, x'...' 리터럴)
 */
export function embeddingToHex(embedding: Float32Array): string {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength).toString("hex");
}

/**
 * 모델 프리로드 (서버 시작 시 호출 가능)
 */
export async function preloadEmbedder(): Promise<void> {
  await getEmbedder();
}
