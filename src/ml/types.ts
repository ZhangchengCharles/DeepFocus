// Type definitions for ML-based semantic similarity

export interface EmbeddingModel {
  compute: (text: string) => Promise<Float32Array>;
  isReady: boolean;
}

export interface SimilarityResult {
  blockedSimilarity: number;
  allowedSimilarity: number;
  shouldBlock: boolean;
}

export interface EmbeddingCache {
  [keyword: string]: Float32Array;
}

export interface SlidingWindow {
  text: string;
  startIndex: number;
  endIndex: number;
}

export type MLModelStatus = null | 'loading' | 'ready' | 'error';

export interface MLStatusMessage {
  status: MLModelStatus;
  error?: string;
}

export interface ComputeSimilarityMessage {
  type: 'COMPUTE_PAGE_SIMILARITY';
  text: string;
  blockedKeywords: string[];
  allowedKeywords: string[];
}

export interface PrecomputeEmbeddingsMessage {
  type: 'PRECOMPUTE_KEYWORD_EMBEDDINGS';
  keywords: string[];
}

export interface GetMLStatusMessage {
  type: 'GET_ML_STATUS';
}
