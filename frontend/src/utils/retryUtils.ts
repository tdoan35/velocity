/**
 * Retry utility with exponential backoff for file sync operations
 */

export interface RetryOptions {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryableErrors?: string[];
  onRetry?: (attempt: number, error: Error) => void;
}

export interface RetryableError extends Error {
  code?: string;
  hint?: string;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  baseDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffFactor: 2,
  retryableErrors: ['P0001'], // Rate limit error code
  onRetry: () => {},
};

/**
 * Determines if an error is retryable based on error code or message
 */
function isRetryableError(error: RetryableError, retryableErrors: string[]): boolean {
  // Check error code first
  if (error.code && retryableErrors.includes(error.code)) {
    return true;
  }
  
  // Check error message for rate limit indicators
  const message = error.message.toLowerCase();
  return (
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('network error') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('temporarily unavailable')
  );
}

/**
 * Calculates delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, options: Required<RetryOptions>): number {
  const exponentialDelay = options.baseDelay * Math.pow(options.backoffFactor, attempt - 1);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay);
  
  // Add jitter to prevent thundering herd
  const jitter = cappedDelay * 0.1 * Math.random();
  return Math.floor(cappedDelay + jitter);
}

/**
 * Retries an async operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: RetryableError;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as RetryableError;
      
      // Don't retry on last attempt or non-retryable errors
      if (attempt === opts.maxAttempts || !isRetryableError(lastError, opts.retryableErrors)) {
        throw lastError;
      }
      
      const delay = calculateDelay(attempt, opts);
      
      // Call retry callback
      opts.onRetry(attempt, lastError);
      
      console.warn(
        `Operation failed (attempt ${attempt}/${opts.maxAttempts}): ${lastError.message}. ` +
        `Retrying in ${delay}ms...`
      );
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Creates a rate limit aware retry wrapper for Supabase RPC calls
 */
export function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  operationName: string = 'RPC operation'
): Promise<T> {
  return withRetry(operation, {
    maxAttempts: 5,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffFactor: 2,
    retryableErrors: ['P0001'], // Rate limit error
    onRetry: (attempt, error) => {
      console.log(`${operationName} rate limited, retrying (${attempt}/5): ${error.message}`);
      
      // Show user-friendly toast for rate limits
      if (error.message.includes('rate limit')) {
        import('sonner').then(({ toast }) => {
          toast.warning(`Too many edits - waiting ${Math.floor(1000 * Math.pow(2, attempt - 1) / 1000)}s before retry`);
        });
      }
    }
  });
}

/**
 * Retry wrapper specifically for file operations with user feedback
 */
export function withFileOperationRetry<T>(
  operation: () => Promise<T>,
  fileName?: string
): Promise<T> {
  const operationName = fileName ? `File operation (${fileName})` : 'File operation';
  
  return withRetry(operation, {
    maxAttempts: 3,
    baseDelay: 2000, // Longer delay for file operations
    maxDelay: 15000,
    backoffFactor: 2,
    retryableErrors: ['P0001', 'P0002'], // Rate limit and version conflict
    onRetry: (attempt, error) => {
      console.log(`${operationName} failed, retrying (${attempt}/3): ${error.message}`);
      
      // Show user feedback
      import('sonner').then(({ toast }) => {
        if (error.message.includes('rate limit')) {
          toast.warning(`Saving ${fileName || 'file'} - too many edits, retrying...`);
        } else if (error.message.includes('version conflict')) {
          toast.warning(`Saving ${fileName || 'file'} - file was modified, retrying...`);
        } else {
          toast.warning(`Saving ${fileName || 'file'} failed, retrying...`);
        }
      });
    }
  });
}