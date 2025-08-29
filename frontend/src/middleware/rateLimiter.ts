/**
 * Rate Limiting Middleware for API Protection
 * 
 * This module provides rate limiting functionality to prevent abuse
 * of sensitive API endpoints, particularly those handling credentials.
 */

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (request: any) => string; // Function to generate rate limit key
  skipSuccessfulRequests?: boolean; // Skip counting successful requests
  skipFailedRequests?: boolean; // Skip counting failed requests
  message?: string; // Custom error message
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
  blocked: boolean;
}

class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private config: Required<RateLimitConfig>;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: RateLimitConfig) {
    this.config = {
      windowMs: config.windowMs,
      maxRequests: config.maxRequests,
      keyGenerator: config.keyGenerator || this.defaultKeyGenerator,
      skipSuccessfulRequests: config.skipSuccessfulRequests || false,
      skipFailedRequests: config.skipFailedRequests || false,
      message: config.message || 'Too many requests, please try again later.',
    };

    // Start cleanup interval to remove expired entries
    this.startCleanup();
  }

  /**
   * Default key generator using IP address or user ID
   */
  private defaultKeyGenerator(request: any): string {
    // Try to get user ID first
    if (request.userId) {
      return `user:${request.userId}`;
    }
    
    // Fall back to IP address
    const ip = request.ip || 
                request.headers?.['x-forwarded-for'] || 
                request.headers?.['x-real-ip'] || 
                'unknown';
    return `ip:${ip}`;
  }

  /**
   * Check if a request should be rate limited
   */
  public async checkLimit(request: any): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  }> {
    const key = this.config.keyGenerator(request);
    const now = Date.now();
    
    let entry = this.limits.get(key);
    
    // Create new entry or reset if window expired
    if (!entry || entry.resetTime < now) {
      entry = {
        count: 0,
        resetTime: now + this.config.windowMs,
        firstRequest: now,
        blocked: false,
      };
      this.limits.set(key, entry);
    }
    
    // Check if already blocked
    if (entry.blocked && entry.resetTime > now) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return {
        allowed: false,
        limit: this.config.maxRequests,
        remaining: 0,
        resetTime: entry.resetTime,
        retryAfter,
      };
    }
    
    // Increment counter
    entry.count++;
    
    // Check if limit exceeded
    if (entry.count > this.config.maxRequests) {
      entry.blocked = true;
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return {
        allowed: false,
        limit: this.config.maxRequests,
        remaining: 0,
        resetTime: entry.resetTime,
        retryAfter,
      };
    }
    
    return {
      allowed: true,
      limit: this.config.maxRequests,
      remaining: this.config.maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  public reset(key: string): void {
    this.limits.delete(key);
  }

  /**
   * Clear all rate limits
   */
  public clearAll(): void {
    this.limits.clear();
  }

  /**
   * Start cleanup interval to remove expired entries
   */
  private startCleanup(): void {
    // Clean up every minute
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.limits.entries()) {
        if (entry.resetTime < now) {
          this.limits.delete(key);
        }
      }
    }, 60000); // 1 minute
  }

  /**
   * Stop the cleanup interval
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.limits.clear();
  }

  /**
   * Get current rate limit status for a key
   */
  public getStatus(key: string): {
    count: number;
    remaining: number;
    resetTime: number;
    blocked: boolean;
  } | null {
    const entry = this.limits.get(key);
    if (!entry) {
      return null;
    }
    
    const now = Date.now();
    if (entry.resetTime < now) {
      this.limits.delete(key);
      return null;
    }
    
    return {
      count: entry.count,
      remaining: Math.max(0, this.config.maxRequests - entry.count),
      resetTime: entry.resetTime,
      blocked: entry.blocked,
    };
  }
}

// Create specific rate limiters for different endpoints
export const connectionTestLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // 10 requests per minute
  message: 'Too many connection attempts. Please wait before trying again.',
});

export const credentialStoreLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 5, // 5 storage operations per minute
  message: 'Too many credential operations. Please wait before trying again.',
});

export const healthCheckLimiter = new RateLimiter({
  windowMs: 30 * 1000, // 30 seconds
  maxRequests: 20, // 20 health checks per 30 seconds
  message: 'Too many health check requests.',
});

// Stricter rate limiter for failed authentication attempts
export const failedAuthLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5, // 5 failed attempts per 15 minutes
  message: 'Too many failed authentication attempts. Account temporarily locked.',
});

/**
 * Express-style middleware wrapper
 */
export function rateLimitMiddleware(limiter: RateLimiter) {
  return async (req: any, res: any, next: any) => {
    const result = await limiter.checkLimit(req);
    
    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', result.limit);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
    
    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter || 60);
      return res.status(429).json({
        error: 'Too many requests',
        message: limiter['config'].message,
        retryAfter: result.retryAfter,
      });
    }
    
    next();
  };
}

/**
 * Simple function-based rate limiting for client-side use
 */
export async function checkRateLimit(
  limiter: RateLimiter,
  identifier: string
): Promise<boolean> {
  const result = await limiter.checkLimit({ userId: identifier });
  return result.allowed;
}

export default RateLimiter;