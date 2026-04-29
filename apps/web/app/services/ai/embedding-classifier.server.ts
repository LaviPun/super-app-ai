/**
 * Tier B embedding classifier (Phase 2.1).
 * Computes cosine similarity between the user prompt embedding and precomputed intent example embeddings.
 * Returns the top matching intent and a confidence score (S2) for use in computeConfidenceScore().
 *
 * Requires OPENAI_API_KEY or a configured provider with embedding support.
 * If embedding is unavailable, returns null (Tier A keyword result is used).
 *
 * Embeddings are computed lazily and cached in-memory for the process lifetime.
 * In production, these should be persisted to Redis or DB; this is the first working version.
 */

import { INTENT_EXAMPLES } from '~/services/ai/intent-examples';

interface EmbeddingCache {
  intent: string;
  /** Average embedding across all examples for this intent. */
  vector: number[];
}

let cachedIntentVectors: EmbeddingCache[] | null = null;
let cacheLoadPromise: Promise<EmbeddingCache[] | null> | null = null;

/** Cosine similarity between two equal-length vectors. */
function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** Average a list of equal-length vectors. */
function averageVectors(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const len = vectors[0]!.length;
  const result = new Array<number>(len).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < len; i++) result[i] = (result[i] ?? 0) + (v[i] ?? 0);
  }
  return result.map(x => x / vectors.length);
}

/**
 * Call OpenAI embeddings API. Returns null on failure.
 */
async function embedTexts(texts: string[], apiKey: string): Promise<number[][] | null> {
  try {
    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: texts,
        dimensions: 512, // Smaller dimension = faster + cheaper
      }),
    });
    if (!res.ok) return null;
    const json = await res.json() as { data: Array<{ embedding: number[] }> };
    return json.data.map(d => d.embedding);
  } catch {
    return null;
  }
}

/**
 * Load (or return cached) intent example vectors. Returns null if embeddings unavailable.
 */
async function loadIntentVectors(): Promise<EmbeddingCache[] | null> {
  if (cachedIntentVectors) return cachedIntentVectors;
  if (cacheLoadPromise) return cacheLoadPromise;

  cacheLoadPromise = (async () => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return null; // No embedding key available

    const intents = Object.keys(INTENT_EXAMPLES);
    const results: EmbeddingCache[] = [];

    // Embed each intent's examples in batches (max 100 texts per call)
    for (const intent of intents) {
      const examples = INTENT_EXAMPLES[intent] ?? [];
      if (examples.length === 0) continue;

      const embeddings = await embedTexts(examples, apiKey);
      if (!embeddings) return null; // Fail fast — don't cache partial results

      results.push({ intent, vector: averageVectors(embeddings) });
    }

    cachedIntentVectors = results;
    return results;
  })();

  return cacheLoadPromise;
}

export interface EmbeddingMatchResult {
  /** Best matching intent (CleanIntentId). */
  intent: string;
  /** Cosine similarity score 0-1. Used as S2 in confidence formula. */
  score: number;
  /** Top 3 alternatives with scores. */
  alternatives: Array<{ intent: string; score: number }>;
}

/**
 * Find the best matching intent for a prompt using embedding similarity.
 * Returns null if embedding service is unavailable or fails.
 */
export async function findIntentByEmbedding(prompt: string): Promise<EmbeddingMatchResult | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;

  const intentVectors = await loadIntentVectors();
  if (!intentVectors || intentVectors.length === 0) return null;

  const promptEmbeddings = await embedTexts([prompt], apiKey);
  if (!promptEmbeddings || promptEmbeddings.length === 0) return null;
  const promptVector = promptEmbeddings[0]!;

  const scored = intentVectors
    .map(({ intent, vector }) => ({ intent, score: cosineSimilarity(promptVector, vector) }))
    .sort((a, b) => b.score - a.score);

  const [best, ...rest] = scored;
  if (!best) return null;

  return {
    intent: best.intent,
    score: best.score,
    alternatives: rest.slice(0, 3),
  };
}

/** Invalidate the in-memory embedding cache (e.g. after intent examples update). */
export function invalidateEmbeddingCache(): void {
  cachedIntentVectors = null;
  cacheLoadPromise = null;
}
