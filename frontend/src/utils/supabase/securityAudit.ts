/**
 * Security Audit Module for Supabase Connections
 * 
 * Tracks and audits all credential access and operations
 * for security monitoring and compliance.
 */

import { logSecurityEvent, secureLogger } from '../logging/supabaseConnectionLogger';

export interface AuditEvent {
  id: string;
  timestamp: number;
  eventType: AuditEventType;
  userId?: string;
  projectId?: string;
  metadata?: Record<string, any>;
  risk: RiskLevel;
}

export enum AuditEventType {
  CREDENTIAL_ACCESS = 'CREDENTIAL_ACCESS',
  CREDENTIAL_CREATED = 'CREDENTIAL_CREATED',
  CREDENTIAL_UPDATED = 'CREDENTIAL_UPDATED',
  CREDENTIAL_DELETED = 'CREDENTIAL_DELETED',
  CONNECTION_TEST = 'CONNECTION_TEST',
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_CREDENTIAL_FORMAT = 'INVALID_CREDENTIAL_FORMAT',
  ENCRYPTION_KEY_ROTATION = 'ENCRYPTION_KEY_ROTATION',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
}

export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

class SecurityAuditor {
  private static instance: SecurityAuditor;
  private auditLog: AuditEvent[] = [];
  private maxLogSize: number = 5000;
  private suspiciousPatterns: Map<string, number> = new Map();
  
  private constructor() {
    // Initialize auditor
    this.startPeriodicAnalysis();
  }
  
  public static getInstance(): SecurityAuditor {
    if (!SecurityAuditor.instance) {
      SecurityAuditor.instance = new SecurityAuditor();
    }
    return SecurityAuditor.instance;
  }
  
  /**
   * Record an audit event
   */
  public recordEvent(
    eventType: AuditEventType,
    userId?: string,
    projectId?: string,
    metadata?: Record<string, any>
  ): void {
    const risk = this.assessRisk(eventType, metadata);
    
    const event: AuditEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      eventType,
      userId,
      projectId,
      metadata,
      risk,
    };
    
    // Add to audit log
    this.auditLog.push(event);
    
    // Trim log if needed
    if (this.auditLog.length > this.maxLogSize) {
      this.auditLog.shift();
    }
    
    // Log security event
    logSecurityEvent(`Audit: ${eventType}`, userId, {
      projectId,
      risk,
      ...metadata,
    });
    
    // Check for suspicious patterns
    this.checkSuspiciousActivity(event);
    
    // Alert on high-risk events
    if (risk === RiskLevel.HIGH || risk === RiskLevel.CRITICAL) {
      this.alertHighRiskEvent(event);
    }
  }
  
  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Assess risk level of an event
   */
  private assessRisk(
    eventType: AuditEventType,
    metadata?: Record<string, any>
  ): RiskLevel {
    // Critical risk events
    if (eventType === AuditEventType.SUSPICIOUS_ACTIVITY) {
      return RiskLevel.CRITICAL;
    }
    
    // High risk events
    if (
      eventType === AuditEventType.ENCRYPTION_KEY_ROTATION ||
      eventType === AuditEventType.CREDENTIAL_DELETED
    ) {
      return RiskLevel.HIGH;
    }
    
    // Medium risk events
    if (
      eventType === AuditEventType.RATE_LIMIT_EXCEEDED ||
      eventType === AuditEventType.INVALID_CREDENTIAL_FORMAT ||
      eventType === AuditEventType.CONNECTION_FAILED
    ) {
      // Check for repeated failures
      const failureCount = metadata?.failureCount || 1;
      if (failureCount > 3) {
        return RiskLevel.HIGH;
      }
      return RiskLevel.MEDIUM;
    }
    
    // Low risk events
    return RiskLevel.LOW;
  }
  
  /**
   * Check for suspicious activity patterns
   */
  private checkSuspiciousActivity(event: AuditEvent): void {
    const key = `${event.userId}_${event.eventType}`;
    const count = (this.suspiciousPatterns.get(key) || 0) + 1;
    this.suspiciousPatterns.set(key, count);
    
    // Check for suspicious patterns
    const timeWindow = 5 * 60 * 1000; // 5 minutes
    const recentEvents = this.getRecentEvents(timeWindow, event.userId);
    
    // Pattern 1: Too many failed attempts
    const failedAttempts = recentEvents.filter(
      e => e.eventType === AuditEventType.CONNECTION_FAILED
    );
    if (failedAttempts.length > 5) {
      this.recordEvent(
        AuditEventType.SUSPICIOUS_ACTIVITY,
        event.userId,
        event.projectId,
        { reason: 'Excessive failed connection attempts', count: failedAttempts.length }
      );
    }
    
    // Pattern 2: Rapid credential changes
    const credentialChanges = recentEvents.filter(
      e => e.eventType === AuditEventType.CREDENTIAL_UPDATED
    );
    if (credentialChanges.length > 3) {
      this.recordEvent(
        AuditEventType.SUSPICIOUS_ACTIVITY,
        event.userId,
        event.projectId,
        { reason: 'Rapid credential changes', count: credentialChanges.length }
      );
    }
    
    // Pattern 3: Access from multiple projects rapidly
    const uniqueProjects = new Set(
      recentEvents
        .filter(e => e.projectId)
        .map(e => e.projectId)
    );
    if (uniqueProjects.size > 10) {
      this.recordEvent(
        AuditEventType.SUSPICIOUS_ACTIVITY,
        event.userId,
        event.projectId,
        { reason: 'Access from multiple projects', count: uniqueProjects.size }
      );
    }
  }
  
  /**
   * Alert on high-risk events
   */
  private alertHighRiskEvent(event: AuditEvent): void {
    console.error('[SECURITY ALERT]', {
      eventId: event.id,
      eventType: event.eventType,
      risk: event.risk,
      userId: event.userId,
      timestamp: new Date(event.timestamp).toISOString(),
    });
    
    // In production, send to monitoring service
    if (import.meta.env?.PROD) {
      this.sendToMonitoringService(event);
    }
  }
  
  /**
   * Send event to monitoring service
   */
  private sendToMonitoringService(event: AuditEvent): void {
    // Implement integration with monitoring service
    // e.g., Sentry, DataDog, CloudWatch
  }
  
  /**
   * Get recent events for analysis
   */
  private getRecentEvents(
    timeWindow: number,
    userId?: string
  ): AuditEvent[] {
    const cutoff = Date.now() - timeWindow;
    return this.auditLog.filter(
      e => e.timestamp > cutoff && (!userId || e.userId === userId)
    );
  }
  
  /**
   * Start periodic security analysis
   */
  private startPeriodicAnalysis(): void {
    // Run analysis every 5 minutes
    setInterval(() => {
      this.runSecurityAnalysis();
    }, 5 * 60 * 1000);
  }
  
  /**
   * Run comprehensive security analysis
   */
  private runSecurityAnalysis(): void {
    const oneHour = 60 * 60 * 1000;
    const recentEvents = this.getRecentEvents(oneHour);
    
    // Analyze patterns
    const analysis = {
      totalEvents: recentEvents.length,
      highRiskEvents: recentEvents.filter(e => e.risk === RiskLevel.HIGH || e.risk === RiskLevel.CRITICAL).length,
      uniqueUsers: new Set(recentEvents.map(e => e.userId).filter(Boolean)).size,
      uniqueProjects: new Set(recentEvents.map(e => e.projectId).filter(Boolean)).size,
      eventTypes: {} as Record<string, number>,
    };
    
    // Count event types
    recentEvents.forEach(e => {
      analysis.eventTypes[e.eventType] = (analysis.eventTypes[e.eventType] || 0) + 1;
    });
    
    // Log analysis results
    secureLogger.info('SecurityAnalysis', 'Periodic security analysis completed', analysis);
    
    // Clear old suspicious patterns
    this.suspiciousPatterns.clear();
  }
  
  /**
   * Get audit summary for reporting
   */
  public getAuditSummary(
    timeWindow?: number,
    userId?: string
  ): {
    totalEvents: number;
    riskDistribution: Record<RiskLevel, number>;
    topEventTypes: Array<{ type: AuditEventType; count: number }>;
    recentHighRiskEvents: AuditEvent[];
  } {
    const events = timeWindow 
      ? this.getRecentEvents(timeWindow, userId)
      : this.auditLog.filter(e => !userId || e.userId === userId);
    
    const riskDistribution: Record<RiskLevel, number> = {
      [RiskLevel.LOW]: 0,
      [RiskLevel.MEDIUM]: 0,
      [RiskLevel.HIGH]: 0,
      [RiskLevel.CRITICAL]: 0,
    };
    
    const eventTypeCounts = new Map<AuditEventType, number>();
    
    events.forEach(e => {
      riskDistribution[e.risk]++;
      eventTypeCounts.set(e.eventType, (eventTypeCounts.get(e.eventType) || 0) + 1);
    });
    
    const topEventTypes = Array.from(eventTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    
    const recentHighRiskEvents = events
      .filter(e => e.risk === RiskLevel.HIGH || e.risk === RiskLevel.CRITICAL)
      .slice(-10);
    
    return {
      totalEvents: events.length,
      riskDistribution,
      topEventTypes,
      recentHighRiskEvents,
    };
  }
  
  /**
   * Export audit log for compliance
   */
  public exportAuditLog(
    startTime?: number,
    endTime?: number
  ): string {
    const events = this.auditLog.filter(e => {
      if (startTime && e.timestamp < startTime) return false;
      if (endTime && e.timestamp > endTime) return false;
      return true;
    });
    
    return JSON.stringify(events, null, 2);
  }
  
  /**
   * Clear audit log (use with caution)
   */
  public clearAuditLog(): void {
    const clearedCount = this.auditLog.length;
    this.auditLog = [];
    logSecurityEvent('Audit log cleared', undefined, { clearedCount });
  }
}

// Export singleton instance
export const securityAuditor = SecurityAuditor.getInstance();

// Convenience functions
export function auditCredentialAccess(
  userId: string,
  projectId: string,
  metadata?: Record<string, any>
): void {
  securityAuditor.recordEvent(
    AuditEventType.CREDENTIAL_ACCESS,
    userId,
    projectId,
    metadata
  );
}

export function auditConnectionTest(
  userId: string,
  projectId: string,
  success: boolean,
  metadata?: Record<string, any>
): void {
  securityAuditor.recordEvent(
    success ? AuditEventType.CONNECTION_TEST : AuditEventType.CONNECTION_FAILED,
    userId,
    projectId,
    metadata
  );
}

export function auditCredentialOperation(
  operation: 'create' | 'update' | 'delete',
  userId: string,
  projectId: string,
  metadata?: Record<string, any>
): void {
  const eventType = operation === 'create' 
    ? AuditEventType.CREDENTIAL_CREATED
    : operation === 'update'
    ? AuditEventType.CREDENTIAL_UPDATED
    : AuditEventType.CREDENTIAL_DELETED;
  
  securityAuditor.recordEvent(eventType, userId, projectId, metadata);
}

export default securityAuditor;