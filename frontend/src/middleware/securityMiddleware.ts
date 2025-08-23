import { securityService } from '../services/securityService';
import { toast } from 'sonner';
import type { SecurityValidationResult } from '../services/securityService';

/**
 * Security middleware for intercepting and validating various operations
 */

export interface SecurityMiddlewareConfig {
  enableCodeValidation: boolean;
  enableAPIValidation: boolean;
  enableDatabaseValidation: boolean;
  enableFileValidation: boolean;
  blockOnCritical: boolean;
  showToasts: boolean;
}

const defaultConfig: SecurityMiddlewareConfig = {
  enableCodeValidation: true,
  enableAPIValidation: true,
  enableDatabaseValidation: true,
  enableFileValidation: true,
  blockOnCritical: true,
  showToasts: true,
};

class SecurityMiddleware {
  private config: SecurityMiddlewareConfig = defaultConfig;
  private isEnabled = true;

  updateConfig(newConfig: Partial<SecurityMiddlewareConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  enable() {
    this.isEnabled = true;
  }

  disable() {
    this.isEnabled = false;
  }

  /**
   * Intercept and validate file operations
   */
  async interceptFileOperation(
    operation: 'read' | 'write' | 'create' | 'delete',
    fileName: string,
    content?: string,
    size?: number
  ): Promise<{ allowed: boolean; reason?: string }> {
    if (!this.isEnabled || !this.config.enableFileValidation) {
      return { allowed: true };
    }

    try {
      // Validate file upload/creation
      if ((operation === 'write' || operation === 'create') && content !== undefined && size !== undefined) {
        const validation = await securityService.validateFileUpload(fileName, content, size);
        
        if (!validation.isValid) {
          if (this.config.showToasts) {
            toast.error(`File ${operation} blocked: ${validation.violations.join(', ')}`);
          }
          
          if (this.config.blockOnCritical && validation.riskLevel === 'critical') {
            return { allowed: false, reason: validation.violations.join(', ') };
          }
        }
      }

      // Additional file operation validations can be added here
      return { allowed: true };
    } catch (error: any) {
      console.error('Security validation failed:', error);
      return { allowed: true }; // Allow on validation failure to prevent blocking legitimate operations
    }
  }

  /**
   * Intercept and validate API calls
   */
  async interceptAPICall(
    url: string,
    method: string,
    headers: Record<string, string> = {},
    body?: any
  ): Promise<{ allowed: boolean; reason?: string; modifiedHeaders?: Record<string, string> }> {
    if (!this.isEnabled || !this.config.enableAPIValidation) {
      return { allowed: true };
    }

    try {
      const validation = await securityService.validateAPIEndpoint(url, method, headers);
      
      if (!validation.isValid) {
        if (this.config.showToasts && validation.riskLevel === 'critical') {
          toast.error(`API call blocked: ${validation.violations.join(', ')}`);
        }
        
        if (this.config.blockOnCritical && validation.riskLevel === 'critical') {
          return { allowed: false, reason: validation.violations.join(', ') };
        }
      }

      // Add security headers if missing
      const modifiedHeaders = { ...headers };
      if (!modifiedHeaders['X-Requested-With']) {
        modifiedHeaders['X-Requested-With'] = 'XMLHttpRequest';
      }

      return { allowed: true, modifiedHeaders };
    } catch (error: any) {
      console.error('API security validation failed:', error);
      return { allowed: true };
    }
  }

  /**
   * Intercept and validate database operations
   */
  async interceptDatabaseOperation(
    operation: 'select' | 'insert' | 'update' | 'delete' | 'create' | 'alter' | 'drop',
    query: string,
    params?: any[]
  ): Promise<{ allowed: boolean; reason?: string; modifiedQuery?: string }> {
    if (!this.isEnabled || !this.config.enableDatabaseValidation) {
      return { allowed: true };
    }

    try {
      // Scan the SQL query for security issues
      const scan = await securityService.scanCode('query.sql', query, 'sql');
      const criticalViolations = scan.violations.filter(v => v.severity === 'critical');
      
      if (criticalViolations.length > 0) {
        if (this.config.showToasts) {
          toast.error(`Database operation blocked: ${criticalViolations[0].message}`);
        }
        
        if (this.config.blockOnCritical) {
          return { 
            allowed: false, 
            reason: `Critical SQL security issue: ${criticalViolations[0].message}` 
          };
        }
      }

      return { allowed: true };
    } catch (error: any) {
      console.error('Database security validation failed:', error);
      return { allowed: true };
    }
  }

  /**
   * Intercept and validate code execution
   */
  async interceptCodeExecution(
    fileName: string,
    content: string,
    language: string
  ): Promise<{ allowed: boolean; reason?: string; warnings?: string[] }> {
    if (!this.isEnabled || !this.config.enableCodeValidation) {
      return { allowed: true };
    }

    try {
      const scan = await securityService.scanCode(fileName, content, language);
      const criticalViolations = scan.violations.filter(v => v.severity === 'critical');
      const warnings = scan.violations
        .filter(v => v.severity === 'warning' || v.severity === 'error')
        .map(v => v.message);
      
      if (criticalViolations.length > 0) {
        if (this.config.showToasts) {
          toast.error(`Code execution blocked: ${criticalViolations[0].message}`);
        }
        
        if (this.config.blockOnCritical) {
          return { 
            allowed: false, 
            reason: `Critical security issue: ${criticalViolations[0].message}`,
            warnings
          };
        }
      }

      if (warnings.length > 0 && this.config.showToasts) {
        toast.warning(`Security warnings in ${fileName}: ${warnings.length} issue(s) found`);
      }

      return { allowed: true, warnings };
    } catch (error: any) {
      console.error('Code security validation failed:', error);
      return { allowed: true };
    }
  }

  /**
   * Validate environment variable access
   */
  validateEnvAccess(envKey: string): { allowed: boolean; reason?: string } {
    if (!this.isEnabled) {
      return { allowed: true };
    }

    // Block access to sensitive environment variables in client-side code
    const sensitiveKeys = [
      'DATABASE_URL',
      'SUPABASE_SERVICE_KEY',
      'PRIVATE_KEY',
      'SECRET_KEY',
      'AWS_SECRET_ACCESS_KEY',
      'STRIPE_SECRET_KEY',
    ];

    const isSensitive = sensitiveKeys.some(key => 
      envKey.toUpperCase().includes(key) || key.includes(envKey.toUpperCase())
    );

    if (isSensitive) {
      if (this.config.showToasts) {
        toast.error(`Access to sensitive environment variable "${envKey}" blocked`);
      }
      return { 
        allowed: false, 
        reason: `Access to sensitive environment variable "${envKey}" is not allowed in client-side code` 
      };
    }

    return { allowed: true };
  }

  /**
   * Create a secure fetch wrapper
   */
  createSecureFetch() {
    return async (url: string, options: RequestInit = {}) => {
      const method = options.method || 'GET';
      const headers = (options.headers as Record<string, string>) || {};

      const validation = await this.interceptAPICall(url, method, headers, options.body);
      
      if (!validation.allowed) {
        throw new Error(`Request blocked by security policy: ${validation.reason}`);
      }

      // Use modified headers if provided
      const finalOptions = {
        ...options,
        headers: validation.modifiedHeaders || headers,
      };

      return fetch(url, finalOptions);
    };
  }

  /**
   * Create a secure database client wrapper
   */
  createSecureDbClient(originalClient: any) {
    return new Proxy(originalClient, {
      get: (target, prop) => {
        const originalMethod = target[prop];

        // Intercept database query methods
        if (typeof originalMethod === 'function' && 
            ['query', 'select', 'insert', 'update', 'delete', 'upsert'].includes(prop as string)) {
          return async (...args: any[]) => {
            // Extract query information
            const query = typeof args[0] === 'string' ? args[0] : JSON.stringify(args[0]);
            const operation = prop as string;

            const validation = await this.interceptDatabaseOperation(
              operation as any, 
              query, 
              args.slice(1)
            );

            if (!validation.allowed) {
              throw new Error(`Database operation blocked by security policy: ${validation.reason}`);
            }

            return originalMethod.apply(target, args);
          };
        }

        return originalMethod;
      },
    });
  }

  /**
   * Get security summary
   */
  getSecuritySummary() {
    return {
      enabled: this.isEnabled,
      config: this.config,
      interceptedOperations: {
        fileOperations: this.config.enableFileValidation,
        apiCalls: this.config.enableAPIValidation,
        databaseOperations: this.config.enableDatabaseValidation,
        codeExecution: this.config.enableCodeValidation,
      },
    };
  }
}

export const securityMiddleware = new SecurityMiddleware();