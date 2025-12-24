// Simple text preprocessing and sliding window implementation for semantic analysis

import { SlidingWindow } from './types';

/**
 * Tokenize text into words (simple whitespace-based tokenization)
 */
export function tokenize(text: string): string[] {
  // Simple tokenization: split by whitespace and filter empty strings
  return text
    .toLowerCase()
    .split(/\s+/)
    .filter(token => token.length > 0);
}

/**
 * Create sliding windows from text
 * @param text - Input text to process
 * @param windowSize - Number of tokens per window (default: 512)
 * @param overlap - Number of overlapping tokens between windows (default: 128)
 * @returns Array of text windows
 */
export function createSlidingWindows(
  text: string,
  windowSize: number = 512,
  overlap: number = 128
): SlidingWindow[] {
  const tokens = tokenize(text);
  const windows: SlidingWindow[] = [];

  // If text is shorter than window size, return as single window
  if (tokens.length <= windowSize) {
    return [{
      text: tokens.join(' '),
      startIndex: 0,
      endIndex: tokens.length
    }];
  }

  // Create sliding windows with overlap
  const stride = windowSize - overlap;
  for (let i = 0; i < tokens.length; i += stride) {
    const windowTokens = tokens.slice(i, i + windowSize);

    // Skip if window is too small (less than 25% of window size)
    if (windowTokens.length < windowSize * 0.25) {
      break;
    }

    windows.push({
      text: windowTokens.join(' '),
      startIndex: i,
      endIndex: i + windowTokens.length
    });

    // Break if this window reaches the end
    if (i + windowSize >= tokens.length) {
      break;
    }
  }

  return windows;
}

/**
 * Extract visible text from a document (useful for content scripts)
 */
export function extractVisibleText(maxLength: number = 5000): string {
  if (typeof document === 'undefined') {
    return '';
  }

  const bodyText = document.body?.innerText || '';
  return bodyText.slice(0, maxLength);
}

/**
 * Calculate the 75th percentile of an array of numbers
 * Used for aggregating similarity scores from multiple windows
 */
export function calculate75thPercentile(values: number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  // Sort in descending order
  const sorted = [...values].sort((a, b) => b - a);

  // 75th percentile = element at 25% position (since sorted descending)
  const index = Math.floor(sorted.length * 0.25);
  return sorted[index];
}
