// ML-based semantic embeddings using Transformers.js
// Uses gte-base-en-v1.5 for feature extraction

import { pipeline, FeatureExtractionPipeline, env } from '@huggingface/transformers';

// Configure ONNX Runtime for Chrome extension service worker
// CRITICAL: Service workers have limited API access, need special configuration

// Configure transformers.js environment for service workers
// Disable GPU backends and force single-threaded WASM
if (env.backends?.onnx) {
  // Disable WebGPU backend (not available in service workers)
  if (env.backends.onnx.webgpu) {
    (env.backends.onnx as any).webgpu = undefined;
  }
  // Disable WebGL backend (not available in service workers)
  if (env.backends.onnx.webgl) {
    (env.backends.onnx as any).webgl = undefined;
  }
  // Configure WASM backend - force single-threaded to avoid pthread issues
  if (env.backends.onnx.wasm) {
    env.backends.onnx.wasm.proxy = false;
    env.backends.onnx.wasm.numThreads = 1;
  }
}

// Disable local models, use browser cache
env.allowLocalModels = false;
env.useBrowserCache = true;

// Configure WASM file paths for Chrome extension
// onnxruntime-web needs to know where to load .wasm files from
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL && env.backends?.onnx?.wasm) {
  const wasmPaths = {
    'ort-wasm.wasm': chrome.runtime.getURL('dist/ort-wasm.wasm'),
    'ort-wasm-simd.wasm': chrome.runtime.getURL('dist/ort-wasm-simd.wasm'),
    'ort-wasm-threaded.wasm': chrome.runtime.getURL('dist/ort-wasm-threaded.wasm'),
    'ort-wasm-simd-threaded.wasm': chrome.runtime.getURL('dist/ort-wasm-simd-threaded.wasm'),
  };

  // Primary path used by onnxruntime-web in service workers
  const onnxWasm = env.backends.onnx.wasm as any;
  const existingWasmPaths = (onnxWasm.wasmPaths ?? {}) as Record<string, string>;
  onnxWasm.wasmPaths = { ...existingWasmPaths, ...wasmPaths };

  // Keep legacy field populated for transformers.js compatibility
  const legacyEnv = (env as any);
  const legacyExisting = ((legacyEnv.wasm || {}).wasmPaths ?? {}) as Record<string, string>;
  legacyEnv.wasm = {
    ...(legacyEnv.wasm || {}),
    wasmPaths: { ...legacyExisting, ...wasmPaths },
  };
}

// Set ONNX Runtime to use CPU execution provider only
(env as any).onnx = {
  ...((env as any).onnx || {}),
  executionProviders: ['cpu'],
};

/**
 * Singleton class for managing the embedding model
 * Ensures the model is loaded only once and reused across requests
 */
class EmbeddingModelSingleton {
  private static instance: EmbeddingModelSingleton | null = null;
  private model: any | null = null; // Use 'any' to avoid complex type inference
  private isLoading: boolean = false;
  private loadError: string | null = null;

  private constructor() {}

  static getInstance(): EmbeddingModelSingleton {
    if (!EmbeddingModelSingleton.instance) {
      EmbeddingModelSingleton.instance = new EmbeddingModelSingleton();
    }
    return EmbeddingModelSingleton.instance;
  }

  /**
   * Initialize the model
   * @param progressCallback - Optional callback for tracking loading progress
   */
  async initialize(progressCallback?: (progress: any) => void): Promise<void> {
    if (this.model) {
      return; // Already initialized
    }

    if (this.isLoading) {
      // Wait for ongoing initialization
      while (this.isLoading) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return;
    }

    try {
      this.isLoading = true;
      console.log('Loading embedding model: Alibaba-NLP/gte-base-en-v1.5');

      this.model = await pipeline(
        'feature-extraction',
        'Alibaba-NLP/gte-base-en-v1.5',
        {
          progress_callback: progressCallback,
          device: 'wasm', // Use WASM backend (no pthread, single-threaded)
          dtype: 'q8', // Use 8-bit quantization for smaller model size
          // Note: quantization is handled automatically by transformers.js
        } as any
      );

      console.log('Embedding model loaded successfully');

      // Warmup inference
      await this.model('warmup text', { pooling: 'mean', normalize: true });
      console.log('Model warmup complete');

      this.loadError = null;
    } catch (error) {
      console.error('Failed to load embedding model:', error);
      this.loadError = error instanceof Error ? error.message : 'Unknown error';
      throw error;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Compute embedding for a text string
   */
  async computeEmbedding(text: string): Promise<Float32Array> {
    if (!this.model) {
      throw new Error('Model not initialized. Call initialize() first.');
    }

    if (!text || text.trim().length === 0) {
      throw new Error('Cannot compute embedding for empty text');
    }

    try {
      // Use mean pooling and normalize for better similarity comparison
      const output = await this.model(text, {
        pooling: 'mean',
        normalize: true,
      });

      // Convert to Float32Array
      return new Float32Array(output.data);
    } catch (error) {
      console.error('Error computing embedding:', error);
      throw error;
    }
  }

  getStatus(): 'loading' | 'ready' | 'error' {
    if (this.loadError) return 'error';
    if (this.isLoading) return 'loading';
    if (this.model) return 'ready';
    return 'loading';
  }

  getError(): string | null {
    return this.loadError;
  }
}

/**
 * Compute cosine similarity between two embeddings
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Similarity score between 0 and 1
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimension');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  // Return similarity normalized to [0, 1] range
  // Cosine similarity is in [-1, 1], but for normalized embeddings it's typically [0, 1]
  return Math.max(0, Math.min(1, dotProduct / denominator));
}

// Export singleton instance
export const embeddingModel = EmbeddingModelSingleton.getInstance();
