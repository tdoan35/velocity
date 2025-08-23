import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export interface SecurityValidationResult {
  isValid: boolean;
  violations: string[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface CodeSecurityScan {
  fileName: string;
  language: string;
  violations: SecurityViolation[];
  riskScore: number;
}

export interface SecurityViolation {
  line: number;
  column: number;
  severity: 'info' | 'warning' | 'error' | 'critical';
  rule: string;
  message: string;
  suggestion?: string;
}

export interface ProjectSecurityConfig {
  enableCodeScanning: boolean;
  enableDependencyChecks: boolean;
  enableDatabaseSecurityChecks: boolean;
  enableAPISecurityValidation: boolean;
  allowedDomains: string[];
  blockedPackages: string[];
  maxFileSize: number;
  maxProjectSize: number;
}

class SecurityService {
  private config: ProjectSecurityConfig = {
    enableCodeScanning: true,
    enableDependencyChecks: true,
    enableDatabaseSecurityChecks: true,
    enableAPISecurityValidation: true,
    allowedDomains: ['localhost', '*.supabase.co', '*.expo.dev'],
    blockedPackages: ['eval', 'vm2', 'node-serialize'],
    maxFileSize: 1024 * 1024 * 5, // 5MB
    maxProjectSize: 1024 * 1024 * 100, // 100MB
  };

  /**
   * Scan code content for security vulnerabilities
   */
  async scanCode(fileName: string, content: string, language: string): Promise<CodeSecurityScan> {
    const violations: SecurityViolation[] = [];
    const lines = content.split('\n');

    // Check for common security issues
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      
      // Check for hardcoded secrets
      const secretPatterns = [
        { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/i, rule: 'hardcoded-api-key' },
        { pattern: /password\s*[:=]\s*['"][^'"]+['"]/i, rule: 'hardcoded-password' },
        { pattern: /secret\s*[:=]\s*['"][^'"]+['"]/i, rule: 'hardcoded-secret' },
        { pattern: /token\s*[:=]\s*['"][^'"]+['"]/i, rule: 'hardcoded-token' },
        { pattern: /sk_[a-z0-9]{24,}/i, rule: 'stripe-secret-key' },
        { pattern: /[a-z0-9]{32}[-_][a-z0-9]{6}[-_][a-z0-9]{16}/i, rule: 'supabase-anon-key' },
      ];

      secretPatterns.forEach(({ pattern, rule }) => {
        if (pattern.test(line)) {
          violations.push({
            line: lineNumber,
            column: 0,
            severity: 'critical',
            rule,
            message: 'Hardcoded secret detected. Use environment variables instead.',
            suggestion: 'Move sensitive values to .env files or use secure vault services.',
          });
        }
      });

      // Check for dangerous functions
      const dangerousPatterns = [
        { pattern: /eval\s*\(/i, rule: 'dangerous-eval', severity: 'critical' as const },
        { pattern: /innerHTML\s*=/i, rule: 'xss-risk-innerhtml', severity: 'warning' as const },
        { pattern: /dangerouslySetInnerHTML/i, rule: 'xss-risk-dangerous-html', severity: 'warning' as const },
        { pattern: /document\.write/i, rule: 'dom-manipulation-risk', severity: 'warning' as const },
        { pattern: /process\.env/i, rule: 'env-access', severity: 'info' as const },
      ];

      dangerousPatterns.forEach(({ pattern, rule, severity }) => {
        if (pattern.test(line)) {
          violations.push({
            line: lineNumber,
            column: 0,
            severity,
            rule,
            message: this.getSecurityMessage(rule),
            suggestion: this.getSecuritySuggestion(rule),
          });
        }
      });

      // Language-specific checks
      if (language === 'sql') {
        this.scanSQLSecurity(line, lineNumber, violations);
      } else if (language === 'typescript' || language === 'javascript') {
        this.scanJavaScriptSecurity(line, lineNumber, violations);
      }
    });

    // Calculate risk score
    const riskScore = this.calculateRiskScore(violations);

    return {
      fileName,
      language,
      violations,
      riskScore,
    };
  }

  /**
   * Scan SQL for security issues
   */
  private scanSQLSecurity(line: string, lineNumber: number, violations: SecurityViolation[]): void {
    const sqlPatterns = [
      { pattern: /;\s*drop\s+table/i, rule: 'sql-injection-drop', severity: 'critical' as const },
      { pattern: /;\s*delete\s+from.*where\s+1\s*=\s*1/i, rule: 'sql-injection-delete', severity: 'critical' as const },
      { pattern: /union\s+select/i, rule: 'sql-injection-union', severity: 'critical' as const },
      { pattern: /'\s*or\s+'1'\s*=\s*'1/i, rule: 'sql-injection-auth-bypass', severity: 'critical' as const },
      { pattern: /grant\s+all/i, rule: 'excessive-privileges', severity: 'warning' as const },
      { pattern: /alter\s+table.*disable\s+row\s+level\s+security/i, rule: 'rls-disabled', severity: 'error' as const },
    ];

    sqlPatterns.forEach(({ pattern, rule, severity }) => {
      if (pattern.test(line)) {
        violations.push({
          line: lineNumber,
          column: 0,
          severity,
          rule,
          message: this.getSecurityMessage(rule),
          suggestion: this.getSecuritySuggestion(rule),
        });
      }
    });
  }

  /**
   * Scan JavaScript/TypeScript for security issues
   */
  private scanJavaScriptSecurity(line: string, lineNumber: number, violations: SecurityViolation[]): void {
    const jsPatterns = [
      { pattern: /localStorage\.setItem.*token/i, rule: 'token-in-localstorage', severity: 'warning' as const },
      { pattern: /sessionStorage\.setItem.*token/i, rule: 'token-in-sessionstorage', severity: 'warning' as const },
      { pattern: /console\.log.*password/i, rule: 'password-in-console', severity: 'warning' as const },
      { pattern: /fetch\s*\(\s*['"`][^'"`]*http:/i, rule: 'insecure-http', severity: 'warning' as const },
      { pattern: /new\s+Function\s*\(/i, rule: 'dynamic-function-creation', severity: 'error' as const },
    ];

    jsPatterns.forEach(({ pattern, rule, severity }) => {
      if (pattern.test(line)) {
        violations.push({
          line: lineNumber,
          column: 0,
          severity,
          rule,
          message: this.getSecurityMessage(rule),
          suggestion: this.getSecuritySuggestion(rule),
        });
      }
    });
  }

  /**
   * Validate database schema for security
   */
  async validateDatabaseSecurity(schema: any): Promise<SecurityValidationResult> {
    const violations: string[] = [];
    
    if (schema.tables) {
      schema.tables.forEach((table: any) => {
        // Check for RLS
        if (!table.rls_enabled) {
          violations.push(`Table "${table.name}" does not have Row Level Security enabled`);
        }

        // Check for proper policies
        if (table.rls_enabled && (!table.policies || table.policies.length === 0)) {
          violations.push(`Table "${table.name}" has RLS enabled but no policies defined`);
        }

        // Check for sensitive column names without proper constraints
        table.columns?.forEach((column: any) => {
          if (column.name.toLowerCase().includes('password') && !column.encrypted) {
            violations.push(`Column "${column.name}" in table "${table.name}" may contain passwords but is not encrypted`);
          }
          
          if (column.name.toLowerCase().includes('email') && !column.unique) {
            violations.push(`Email column "${column.name}" in table "${table.name}" should be unique`);
          }
        });
      });
    }

    const riskLevel = violations.length === 0 ? 'low' : 
                     violations.length <= 2 ? 'medium' : 
                     violations.length <= 5 ? 'high' : 'critical';

    return {
      isValid: violations.length === 0,
      violations,
      riskLevel,
    };
  }

  /**
   * Validate API endpoint security
   */
  async validateAPIEndpoint(endpoint: string, method: string, headers: Record<string, string>): Promise<SecurityValidationResult> {
    const violations: string[] = [];

    // Check for HTTPS
    if (endpoint.startsWith('http://') && !endpoint.includes('localhost')) {
      violations.push('API endpoint should use HTTPS for production');
    }

    // Check for authentication headers
    const hasAuth = headers['Authorization'] || headers['authorization'] || 
                   headers['X-API-Key'] || headers['x-api-key'];
    
    if (!hasAuth && method !== 'GET') {
      violations.push('Non-GET requests should include authentication headers');
    }

    // Check for dangerous methods without proper auth
    if (['DELETE', 'PUT', 'PATCH'].includes(method.toUpperCase()) && !hasAuth) {
      violations.push('Destructive operations require authentication');
    }

    // Validate domain
    const url = new URL(endpoint);
    const isAllowedDomain = this.config.allowedDomains.some(domain => {
      if (domain.startsWith('*.')) {
        return url.hostname.endsWith(domain.slice(2));
      }
      return url.hostname === domain;
    });

    if (!isAllowedDomain) {
      violations.push(`Domain "${url.hostname}" is not in the allowed list`);
    }

    const riskLevel = violations.length === 0 ? 'low' : 
                     violations.length <= 1 ? 'medium' : 
                     violations.length <= 3 ? 'high' : 'critical';

    return {
      isValid: violations.length === 0,
      violations,
      riskLevel,
    };
  }

  /**
   * Validate file upload security
   */
  async validateFileUpload(fileName: string, content: string, size: number): Promise<SecurityValidationResult> {
    const violations: string[] = [];

    // Check file size
    if (size > this.config.maxFileSize) {
      violations.push(`File size (${size} bytes) exceeds limit (${this.config.maxFileSize} bytes)`);
    }

    // Check file extension
    const extension = fileName.split('.').pop()?.toLowerCase();
    const dangerousExtensions = ['exe', 'bat', 'cmd', 'scr', 'pif', 'vbs', 'js', 'jar'];
    
    if (extension && dangerousExtensions.includes(extension) && !fileName.endsWith('.js')) {
      violations.push(`File extension ".${extension}" is potentially dangerous`);
    }

    // Check for malicious content
    const maliciousPatterns = [
      /<script[^>]*>.*<\/script>/i,
      /javascript:/i,
      /vbscript:/i,
      /on\w+\s*=/i, // event handlers
    ];

    maliciousPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        violations.push('File contains potentially malicious content');
      }
    });

    const riskLevel = violations.length === 0 ? 'low' : 
                     violations.length <= 1 ? 'medium' : 
                     violations.length <= 2 ? 'high' : 'critical';

    return {
      isValid: violations.length === 0,
      violations,
      riskLevel,
    };
  }

  /**
   * Get security message for a rule
   */
  private getSecurityMessage(rule: string): string {
    const messages: Record<string, string> = {
      'hardcoded-api-key': 'Hardcoded API key detected',
      'hardcoded-password': 'Hardcoded password detected',
      'hardcoded-secret': 'Hardcoded secret detected',
      'hardcoded-token': 'Hardcoded token detected',
      'stripe-secret-key': 'Stripe secret key detected',
      'supabase-anon-key': 'Supabase anonymous key detected',
      'dangerous-eval': 'Use of eval() function detected',
      'xss-risk-innerhtml': 'Potential XSS vulnerability with innerHTML',
      'xss-risk-dangerous-html': 'Potential XSS vulnerability with dangerouslySetInnerHTML',
      'dom-manipulation-risk': 'Risky DOM manipulation detected',
      'env-access': 'Environment variable access detected',
      'sql-injection-drop': 'Potential SQL injection with DROP statement',
      'sql-injection-delete': 'Potential SQL injection with DELETE statement',
      'sql-injection-union': 'Potential SQL injection with UNION SELECT',
      'sql-injection-auth-bypass': 'Potential authentication bypass attempt',
      'excessive-privileges': 'Excessive database privileges granted',
      'rls-disabled': 'Row Level Security disabled',
      'token-in-localstorage': 'Storing tokens in localStorage',
      'token-in-sessionstorage': 'Storing tokens in sessionStorage',
      'password-in-console': 'Password logged to console',
      'insecure-http': 'Using insecure HTTP protocol',
      'dynamic-function-creation': 'Dynamic function creation detected',
    };

    return messages[rule] || 'Security issue detected';
  }

  /**
   * Get security suggestion for a rule
   */
  private getSecuritySuggestion(rule: string): string {
    const suggestions: Record<string, string> = {
      'hardcoded-api-key': 'Use environment variables or secure vault services',
      'hardcoded-password': 'Use environment variables and proper authentication',
      'hardcoded-secret': 'Store secrets securely using environment variables',
      'hardcoded-token': 'Use secure token storage mechanisms',
      'stripe-secret-key': 'Store Stripe keys in environment variables',
      'supabase-anon-key': 'Use environment variables for Supabase keys',
      'dangerous-eval': 'Avoid eval() and use safer alternatives',
      'xss-risk-innerhtml': 'Sanitize user input or use textContent instead',
      'xss-risk-dangerous-html': 'Sanitize HTML content before rendering',
      'dom-manipulation-risk': 'Use safer DOM manipulation methods',
      'env-access': 'Ensure environment variables are properly secured',
      'sql-injection-drop': 'Use parameterized queries and proper validation',
      'sql-injection-delete': 'Use parameterized queries with WHERE conditions',
      'sql-injection-union': 'Validate and sanitize user input',
      'sql-injection-auth-bypass': 'Use proper authentication mechanisms',
      'excessive-privileges': 'Follow principle of least privilege',
      'rls-disabled': 'Enable Row Level Security for data protection',
      'token-in-localstorage': 'Use httpOnly cookies or secure token storage',
      'token-in-sessionstorage': 'Use more secure storage for sensitive tokens',
      'password-in-console': 'Remove password logging from production code',
      'insecure-http': 'Use HTTPS for all API communications',
      'dynamic-function-creation': 'Avoid dynamic function creation for security',
    };

    return suggestions[rule] || 'Follow security best practices';
  }

  /**
   * Calculate risk score based on violations
   */
  private calculateRiskScore(violations: SecurityViolation[]): number {
    const weights = {
      info: 1,
      warning: 2,
      error: 4,
      critical: 8,
    };

    return violations.reduce((score, violation) => {
      return score + weights[violation.severity];
    }, 0);
  }

  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<ProjectSecurityConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current security configuration
   */
  getConfig(): ProjectSecurityConfig {
    return { ...this.config };
  }

  /**
   * Generate security report for entire project
   */
  async generateSecurityReport(projectId: string): Promise<{
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    totalViolations: number;
    criticalIssues: number;
    codeScans: CodeSecurityScan[];
    recommendations: string[];
  }> {
    // This would scan all project files in a real implementation
    const mockReport = {
      overallRisk: 'medium' as const,
      totalViolations: 5,
      criticalIssues: 1,
      codeScans: [],
      recommendations: [
        'Enable Row Level Security on all database tables',
        'Implement proper authentication for API endpoints',
        'Use environment variables for all sensitive configuration',
        'Add input validation for user-generated content',
        'Enable HTTPS for all production endpoints',
      ],
    };

    return mockReport;
  }
}

export const securityService = new SecurityService();