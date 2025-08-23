/**
 * Security-Focused Logging for Supabase Connections
 * 
 * This module provides secure logging utilities that never expose
 * sensitive credentials while maintaining useful debugging information.
 */

import { sanitizeForLogging, hashForLogging } from '../supabase/credentialSecurity';

export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  SECURITY: 'SECURITY',
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  metadata?: Record<string, any>;
  userId?: string;
  projectId?: string;
  requestId?: string;
}

interface SensitiveField {
  pattern: RegExp;
  replacement: string;
}

class SecureLogger {
  private static instance: SecureLogger;
  private logs: LogEntry[] = [];
  private maxLogs: number = 1000;
  private sensitivePatterns: SensitiveField[] = [
    // Supabase anon keys (JWT format)
    {
      pattern: /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g,
      replacement: '[REDACTED_JWT]',
    },
    // Service role keys
    {
      pattern: /service_role_key["\s]*[:=]["\s]*["']?[^"',\s]+/gi,
      replacement: 'service_role_key:[REDACTED]',
    },
    // Anon keys in various formats
    {
      pattern: /anon_?key["\s]*[:=]["\s]*["']?[^"',\s]+/gi,
      replacement: 'anon_key:[REDACTED]',
    },
    // API keys
    {
      pattern: /api_?key["\s]*[:=]["\s]*["']?[^"',\s]+/gi,
      replacement: 'api_key:[REDACTED]',
    },
    // Passwords
    {
      pattern: /password["\s]*[:=]["\s]*["']?[^"',\s]+/gi,
      replacement: 'password:[REDACTED]',
    },
    // Bearer tokens
    {
      pattern: /Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g,
      replacement: 'Bearer [REDACTED_TOKEN]',
    },
    // Email addresses (optional - uncomment if needed)
    // {
    //   pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    //   replacement: '[REDACTED_EMAIL]',
    // },
  ];

  private constructor() {
    // Private constructor for singleton
  }

  public static getInstance(): SecureLogger {
    if (!SecureLogger.instance) {
      SecureLogger.instance = new SecureLogger();
    }
    return SecureLogger.instance;
  }

  /**
   * Sanitize a string by removing sensitive information
   */
  private sanitize(input: string | undefined | null): string {
    if (!input || typeof input !== 'string') {
      return String(input || '');
    }
    
    let sanitized = input;
    for (const pattern of this.sensitivePatterns) {
      sanitized = sanitized.replace(pattern.pattern, pattern.replacement);
    }
    return sanitized;
  }

  /**
   * Sanitize an object by removing sensitive fields
   */
  private sanitizeObject(obj: any): any {
    if (typeof obj === 'string') {
      return this.sanitize(obj);
    }
    
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sanitizeObject(item));
    }
    
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip known sensitive fields entirely
      if (this.isSensitiveField(key)) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string') {
        sanitized[key] = this.sanitize(value);
      } else if (typeof value === 'object') {
        sanitized[key] = this.sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  /**
   * Check if a field name indicates sensitive data
   */
  private isSensitiveField(fieldName: string): boolean {
    const sensitiveFields = [
      'password',
      'secret',
      'token',
      'key',
      'apikey',
      'api_key',
      'anon_key',
      'anonKey',
      'service_role_key',
      'serviceRoleKey',
      'credential',
      'auth',
      'authorization',
    ];
    
    const lowerField = fieldName.toLowerCase();
    return sensitiveFields.some(sensitive => lowerField.includes(sensitive));
  }

  /**
   * Create a log entry
   */
  private createLogEntry(
    level: LogLevel,
    category: string,
    message: string,
    metadata?: Record<string, any>
  ): LogEntry {
    const sanitizedMessage = this.sanitize(message);
    const sanitizedMetadata = metadata ? this.sanitizeObject(metadata) : undefined;
    
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message: sanitizedMessage,
      metadata: sanitizedMetadata,
      requestId: this.generateRequestId(),
    };
  }

  /**
   * Generate a unique request ID for tracing
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Log a message
   */
  private log(
    level: LogLevel,
    category: string,
    message: string,
    metadata?: Record<string, any>
  ): void {
    const entry = this.createLogEntry(level, category, message, metadata);
    
    // Store in memory (limited)
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    // Output to console in development
    if (import.meta.env?.DEV) {
      const consoleMethod = this.getConsoleMethod(level);
      console[consoleMethod](
        `[${entry.timestamp}] [${level}] [${category}]`,
        entry.message,
        entry.metadata || ''
      );
    }
    
    // In production, you might want to send to a logging service
    if (import.meta.env?.PROD && level === LogLevel.ERROR) {
      this.sendToLoggingService(entry);
    }
  }

  /**
   * Get appropriate console method for log level
   */
  private getConsoleMethod(level: LogLevel): 'log' | 'info' | 'warn' | 'error' {
    switch (level) {
      case LogLevel.ERROR:
      case LogLevel.SECURITY:
        return 'error';
      case LogLevel.WARN:
        return 'warn';
      case LogLevel.INFO:
        return 'info';
      default:
        return 'log';
    }
  }

  /**
   * Send log entry to external logging service (placeholder)
   */
  private sendToLoggingService(entry: LogEntry): void {
    // Implement integration with logging service (e.g., Sentry, LogRocket)
    // Make sure to never send unsanitized data
    if (window.console && import.meta.env?.VITE_ENABLE_ERROR_TRACKING) {
      // Example: Send to logging service
      // loggingService.send(entry);
    }
  }

  // Public logging methods
  
  public debug(category: string, message: string | undefined | null, metadata?: Record<string, any>): void {
    this.log(LogLevel.DEBUG, category, message || '', metadata);
  }
  
  public info(category: string, message: string | undefined | null, metadata?: Record<string, any>): void {
    this.log(LogLevel.INFO, category, message || '', metadata);
  }
  
  public warn(category: string, message: string | undefined | null, metadata?: Record<string, any>): void {
    this.log(LogLevel.WARN, category, message || '', metadata);
  }
  
  public error(category: string, message: string | undefined | null, metadata?: Record<string, any>): void {
    this.log(LogLevel.ERROR, category, message || '', metadata);
  }
  
  public security(category: string, message: string | undefined | null, metadata?: Record<string, any>): void {
    this.log(LogLevel.SECURITY, category, message || '', metadata);
  }

  /**
   * Log a connection attempt
   */
  public logConnectionAttempt(
    projectId: string,
    userId: string,
    projectUrl: string,
    success: boolean
  ): void {
    const metadata = {
      projectId,
      userId,
      projectUrl: projectUrl.replace(/https:\/\/([^.]+)\./, 'https://*****.'),
      success,
    };
    
    if (success) {
      this.info('SupabaseConnection', 'Connection attempt successful', metadata);
    } else {
      this.warn('SupabaseConnection', 'Connection attempt failed', metadata);
    }
  }

  /**
   * Log a security event
   */
  public logSecurityEvent(
    event: string,
    userId?: string,
    metadata?: Record<string, any>
  ): void {
    this.security('Security', event, {
      ...metadata,
      userId,
      timestamp: Date.now(),
    });
  }

  /**
   * Log rate limit violation
   */
  public logRateLimitViolation(
    endpoint: string,
    identifier: string,
    metadata?: Record<string, any>
  ): void {
    this.security('RateLimit', `Rate limit exceeded for ${endpoint}`, {
      endpoint,
      identifier: hashForLogging(identifier),
      ...metadata,
    });
  }

  /**
   * Get recent logs (sanitized)
   */
  public getRecentLogs(
    count: number = 100,
    level?: LogLevel,
    category?: string
  ): LogEntry[] {
    let filtered = [...this.logs];
    
    if (level) {
      filtered = filtered.filter(log => log.level === level);
    }
    
    if (category) {
      filtered = filtered.filter(log => log.category === category);
    }
    
    return filtered.slice(-count);
  }

  /**
   * Clear all logs
   */
  public clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs for debugging (sanitized)
   */
  public exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

// Export singleton instance
export const secureLogger = SecureLogger.getInstance();

// Convenience functions for logging
export function logConnectionAttempt(
  projectId: string,
  userId: string,
  projectUrl: string,
  success: boolean
): void {
  secureLogger.logConnectionAttempt(projectId, userId, projectUrl, success);
}

export function logSecurityEvent(
  event: string,
  userId?: string,
  metadata?: Record<string, any>
): void {
  secureLogger.logSecurityEvent(event, userId, metadata);
}

export function logRateLimitViolation(
  endpoint: string,
  identifier: string,
  metadata?: Record<string, any>
): void {
  secureLogger.logRateLimitViolation(endpoint, identifier, metadata);
}

export function logError(
  category: string,
  message: string,
  error: Error | unknown,
  metadata?: Record<string, any>
): void {
  const errorDetails = error instanceof Error ? {
    name: error.name,
    message: error.message,
    stack: import.meta.env?.DEV ? error.stack : undefined,
  } : { error: String(error) };
  
  secureLogger.error(category, message, {
    ...metadata,
    error: errorDetails,
  });
}

export function logInfo(
  category: string,
  message: string,
  metadata?: Record<string, any>
): void {
  secureLogger.info(category, message, metadata);
}

export function logDebug(
  category: string,
  message: string,
  metadata?: Record<string, any>
): void {
  secureLogger.debug(category, message, metadata);
}

export default secureLogger;