import { useState, useEffect, useCallback } from 'react';
import { useProjectSecurityContext } from '../contexts/ProjectContext';
import { toast } from 'sonner';
import type { SecurityViolation } from '../services/securityService';

interface SecurityMonitoringOptions {
  autoScanOnSave?: boolean;
  autoValidateAPI?: boolean;
  autoValidateDatabase?: boolean;
  showToastOnViolations?: boolean;
  onSecurityViolation?: (violation: SecurityViolation) => void;
}

interface SecurityMonitoringState {
  isMonitoring: boolean;
  lastScanTime: Date | null;
  pendingScans: number;
  totalViolations: number;
  criticalViolations: number;
}

export function useSecurityMonitoring(options: SecurityMonitoringOptions = {}) {
  const {
    autoScanOnSave = true,
    autoValidateAPI = true,
    autoValidateDatabase = true,
    showToastOnViolations = true,
    onSecurityViolation,
  } = options;

  const { 
    isSecurityEnabled, 
    activeThreats, 
    recentScans,
    scanCode,
    validateDatabaseSecurity,
    validateAPIEndpoint,
    validateFileUpload
  } = useProjectSecurityContext();

  const [monitoringState, setMonitoringState] = useState<SecurityMonitoringState>({
    isMonitoring: false,
    lastScanTime: null,
    pendingScans: 0,
    totalViolations: 0,
    criticalViolations: 0,
  });

  const [scanQueue, setScanQueue] = useState<Array<{
    id: string;
    fileName: string;
    content: string;
    language: string;
    priority: number;
  }>>([]);

  useEffect(() => {
    updateMonitoringState();
  }, [recentScans, activeThreats]);

  const updateMonitoringState = () => {
    const totalViolations = recentScans.reduce((total, scan) => total + scan.violations.length, 0);
    const criticalViolations = recentScans.reduce((total, scan) => 
      total + scan.violations.filter(v => v.severity === 'critical').length, 0);

    setMonitoringState(prev => ({
      ...prev,
      totalViolations,
      criticalViolations,
      lastScanTime: recentScans.length > 0 ? new Date() : prev.lastScanTime,
    }));
  };

  const startMonitoring = useCallback(() => {
    if (!isSecurityEnabled) {
      toast.warning('Security monitoring is disabled');
      return;
    }

    setMonitoringState(prev => ({ ...prev, isMonitoring: true }));
    console.log('Security monitoring started');
  }, [isSecurityEnabled]);

  const stopMonitoring = useCallback(() => {
    setMonitoringState(prev => ({ ...prev, isMonitoring: false }));
    setScanQueue([]);
    console.log('Security monitoring stopped');
  }, []);

  const scanFile = useCallback(async (fileName: string, content: string, language: string) => {
    if (!isSecurityEnabled || !monitoringState.isMonitoring) return null;

    try {
      setMonitoringState(prev => ({ ...prev, pendingScans: prev.pendingScans + 1 }));

      const result = await scanCode(fileName, content, language);
      
      if (result?.violations && result.violations.length > 0) {
        const criticalViolations = result.violations.filter(v => v.severity === 'critical');
        
        if (showToastOnViolations && criticalViolations.length > 0) {
          toast.error(`${criticalViolations.length} critical security issue(s) found in ${fileName}`);
        }

        // Notify about each critical violation
        criticalViolations.forEach(violation => {
          onSecurityViolation?.(violation);
        });
      }

      return result;
    } catch (error: any) {
      console.error('Security scan failed:', error);
      if (showToastOnViolations) {
        toast.error(`Security scan failed for ${fileName}`);
      }
      return null;
    } finally {
      setMonitoringState(prev => ({ 
        ...prev, 
        pendingScans: Math.max(0, prev.pendingScans - 1),
        lastScanTime: new Date(),
      }));
    }
  }, [isSecurityEnabled, monitoringState.isMonitoring, scanCode, showToastOnViolations, onSecurityViolation]);

  const queueScan = useCallback((fileName: string, content: string, language: string, priority = 5) => {
    if (!isSecurityEnabled || !monitoringState.isMonitoring) return;

    const scanId = `${fileName}-${Date.now()}`;
    setScanQueue(prev => [...prev, {
      id: scanId,
      fileName,
      content,
      language,
      priority,
    }].sort((a, b) => b.priority - a.priority));
  }, [isSecurityEnabled, monitoringState.isMonitoring]);

  const processScanQueue = useCallback(async () => {
    if (scanQueue.length === 0 || !monitoringState.isMonitoring) return;

    const nextScan = scanQueue[0];
    setScanQueue(prev => prev.slice(1));

    await scanFile(nextScan.fileName, nextScan.content, nextScan.language);
  }, [scanQueue, monitoringState.isMonitoring, scanFile]);

  // Auto-process scan queue
  useEffect(() => {
    if (scanQueue.length > 0 && monitoringState.pendingScans === 0) {
      const timer = setTimeout(processScanQueue, 100);
      return () => clearTimeout(timer);
    }
  }, [scanQueue, monitoringState.pendingScans, processScanQueue]);

  const validateDatabaseSchema = useCallback(async (schema: any) => {
    if (!isSecurityEnabled || !autoValidateDatabase) return null;

    try {
      const result = await validateDatabaseSecurity(schema);
      
      if (!result?.isValid && showToastOnViolations) {
        toast.warning(`Database security issues: ${result.violations.join(', ')}`);
      }

      return result;
    } catch (error: any) {
      console.error('Database security validation failed:', error);
      if (showToastOnViolations) {
        toast.error('Database security validation failed');
      }
      return null;
    }
  }, [isSecurityEnabled, autoValidateDatabase, validateDatabaseSecurity, showToastOnViolations]);

  const validateAPICall = useCallback(async (endpoint: string, method: string, headers: Record<string, string>) => {
    if (!isSecurityEnabled || !autoValidateAPI) return null;

    try {
      const result = await validateAPIEndpoint(endpoint, method, headers);
      
      if (!result?.isValid && result.riskLevel === 'critical' && showToastOnViolations) {
        toast.error(`Critical API security issue: ${result.violations.join(', ')}`);
      }

      return result;
    } catch (error: any) {
      console.error('API security validation failed:', error);
      return null;
    }
  }, [isSecurityEnabled, autoValidateAPI, validateAPIEndpoint, showToastOnViolations]);

  const validateFileUploadHook = useCallback(async (fileName: string, content: string, size: number) => {
    if (!isSecurityEnabled) return null;

    try {
      const result = await validateFileUpload(fileName, content, size);
      
      if (!result?.isValid && showToastOnViolations) {
        toast.error(`File upload blocked: ${result.violations.join(', ')}`);
      }

      return result;
    } catch (error: any) {
      console.error('File upload validation failed:', error);
      if (showToastOnViolations) {
        toast.error('File upload validation failed');
      }
      return null;
    }
  }, [isSecurityEnabled, validateFileUpload, showToastOnViolations]);

  // Auto-scan on file save
  const handleFileSave = useCallback((fileName: string, content: string, language: string) => {
    if (autoScanOnSave) {
      queueScan(fileName, content, language, 10); // High priority for saves
    }
  }, [autoScanOnSave, queueScan]);

  const getSecuritySummary = useCallback(() => {
    return {
      isSecurityEnabled,
      isMonitoring: monitoringState.isMonitoring,
      activeThreats,
      totalViolations: monitoringState.totalViolations,
      criticalViolations: monitoringState.criticalViolations,
      pendingScans: monitoringState.pendingScans,
      queuedScans: scanQueue.length,
      lastScanTime: monitoringState.lastScanTime,
    };
  }, [
    isSecurityEnabled, 
    monitoringState, 
    activeThreats, 
    scanQueue.length
  ]);

  return {
    // State
    monitoringState,
    scanQueue: scanQueue.length,
    
    // Actions
    startMonitoring,
    stopMonitoring,
    scanFile,
    queueScan,
    validateDatabaseSchema,
    validateAPICall,
    validateFileUpload: validateFileUploadHook,
    handleFileSave,
    
    // Utils
    getSecuritySummary,
    isSecurityEnabled,
  };
}

// Hook for file editor integration
export function useFileSecurityMonitoring() {
  const monitoring = useSecurityMonitoring({
    autoScanOnSave: true,
    showToastOnViolations: true,
  });

  const scanCurrentFile = useCallback(async (fileName: string, content: string, language: string) => {
    return await monitoring.scanFile(fileName, content, language);
  }, [monitoring]);

  const onFileSave = useCallback((fileName: string, content: string, language: string) => {
    monitoring.handleFileSave(fileName, content, language);
  }, [monitoring]);

  const onFileOpen = useCallback((fileName: string, content: string, language: string) => {
    // Queue a lower priority scan for opened files
    monitoring.queueScan(fileName, content, language, 3);
  }, [monitoring]);

  return {
    ...monitoring,
    scanCurrentFile,
    onFileSave,
    onFileOpen,
  };
}

// Hook for API request monitoring
export function useAPISecurityMonitoring() {
  const { validateAPICall } = useSecurityMonitoring({
    autoValidateAPI: true,
    showToastOnViolations: true,
  });

  const validateRequest = useCallback(async (
    url: string, 
    method: string = 'GET', 
    headers: Record<string, string> = {}
  ) => {
    return await validateAPICall(url, method, headers);
  }, [validateAPICall]);

  const secureRequest = useCallback(async (
    url: string,
    options: RequestInit = {}
  ) => {
    const method = options.method || 'GET';
    const headers = (options.headers as Record<string, string>) || {};

    // Validate the request first
    const validation = await validateRequest(url, method, headers);
    
    if (!validation?.isValid && validation.riskLevel === 'critical') {
      throw new Error(`Request blocked by security validation: ${validation.violations.join(', ')}`);
    }

    // Proceed with the request
    return fetch(url, options);
  }, [validateRequest]);

  return {
    validateRequest,
    secureRequest,
  };
}