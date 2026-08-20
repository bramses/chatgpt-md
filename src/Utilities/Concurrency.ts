/**
 * Small concurrency helpers for bulk import work.
 *
 * Thousands of conversations must not turn into thousands of simultaneous API
 * calls, and a transient rate limit must not fail a whole run.
 */

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class AbortedError extends Error {
  constructor() {
    super("Import aborted");
    this.name = "AbortedError";
  }
}

/** Run `worker` over `items` with at most `limit` in flight, in input order. */
export async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
  signal?: { aborted: boolean }
): Promise<void> {
  const size = Math.max(1, Math.min(limit || 1, 32));
  let cursor = 0;

  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      if (signal?.aborted) return;
      const index = cursor++;
      await worker(items[index], index);
    }
  });

  await Promise.all(runners);
}

const RETRYABLE = /rate.?limit|429|timeout|ETIMEDOUT|ECONNRESET|socket hang up|503|502|overloaded|fetch failed/i;

export function isRetryable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return RETRYABLE.test(message);
}

/** Retry with exponential backoff, but only for transient transport failures. */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; signal?: { aborted: boolean } } = {}
): Promise<T> {
  const attempts = options.attempts ?? 3;
  const baseDelay = options.baseDelayMs ?? 1000;

  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (options.signal?.aborted) throw new AbortedError();
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (error instanceof AbortedError || !isRetryable(error) || attempt === attempts - 1) throw error;
      await sleep(baseDelay * Math.pow(2, attempt));
    }
  }
  throw lastError;
}
