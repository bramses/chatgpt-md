/**
 * Standardized async error handling utilities
 * Ensures consistent error handling patterns across the application
 */

/**
 * Type for async functions that may fail
 */
export type AsyncFunction<T = void> = () => Promise<T>;

/**
 * Safely execute an async function with error handling
 * @param asyncFn - The async function to execute
 * @param errorHandler - Function to handle errors (optional)
 * @param label - Label for logging purposes (optional)
 * @returns Promise that resolves to the result or undefined on error
 */
export async function executeAsync<T>(
  asyncFn: AsyncFunction<T>,
  errorHandler?: (error: any, label?: string) => void,
  label?: string
): Promise<T | undefined> {
  try {
    return await asyncFn();
  } catch (error) {
    if (errorHandler) {
      errorHandler(error, label);
    }
    return undefined;
  }
}

/**
 * Safely execute an async function with error logging but rethrow
 * Useful when you want to log the error but still propagate it
 * @param asyncFn - The async function to execute
 * @param label - Label for logging purposes
 * @returns Promise that resolves to the result or throws the error
 */
export async function executeAsyncWithLogging<T>(asyncFn: AsyncFunction<T>, label: string): Promise<T> {
  try {
    return await asyncFn();
  } catch (error) {
    console.error(`[${label}]`, error);
    throw error;
  }
}

/**
 * Execute multiple async functions in parallel with error handling
 * @param asyncFns - Array of async functions to execute
 * @param errorHandler - Function to handle errors (optional)
 * @returns Promise that resolves to array of results or undefined for failed items
 */
export async function executeAsyncParallel<T>(
  asyncFns: AsyncFunction<T>[],
  errorHandler?: (error: any, index: number) => void
): Promise<(T | undefined)[]> {
  const results = await Promise.allSettled(asyncFns.map((fn) => fn()));

  return results.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    } else {
      if (errorHandler) {
        errorHandler(result.reason, index);
      }
      return undefined;
    }
  });
}

/**
 * Execute async function with timeout
 * @param asyncFn - The async function to execute
 * @param timeoutMs - Timeout in milliseconds
 * @param timeoutError - Custom error message for timeout (optional)
 * @returns Promise that resolves to the result or throws timeout error
 */
export function executeAsyncWithTimeout<T>(
  asyncFn: AsyncFunction<T>,
  timeoutMs: number,
  timeoutError: string = "Operation timed out"
): Promise<T> {
  return Promise.race([
    asyncFn(),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(timeoutError)), timeoutMs)),
  ]);
}

/**
 * Execute async function with retry logic
 * @param asyncFn - The async function to execute
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param delayMs - Delay between retries in milliseconds (default: 1000)
 * @param errorHandler - Function to handle errors (optional)
 * @returns Promise that resolves to the result or throws after all retries fail
 */
export async function executeAsyncWithRetry<T>(
  asyncFn: AsyncFunction<T>,
  maxRetries: number = 3,
  delayMs: number = 1000,
  errorHandler?: (error: any, attempt: number) => void
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await asyncFn();
    } catch (error) {
      lastError = error;
      if (errorHandler) {
        errorHandler(error, attempt);
      }

      // Don't delay after the last failed attempt
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

/**
 * Create a safe async function that never throws
 * @param asyncFn - The async function to wrap
 * @param fallback - Fallback value if the function fails (optional)
 * @returns Promise that always resolves (never rejects)
 */
export function createSafeAsync<T>(asyncFn: AsyncFunction<T>, fallback?: T): AsyncFunction<T | undefined> {
  return async () => {
    try {
      return await asyncFn();
    } catch {
      return fallback;
    }
  };
}
