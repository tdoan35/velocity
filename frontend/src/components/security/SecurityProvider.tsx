import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { toast } from 'sonner';
import { securityService, type ProjectSecurityConfig, type SecurityValidationResult, type CodeSecurityScan } from '../../services/securityService';

interface SecurityContextType {
  config: ProjectSecurityConfig;
  isSecurityEnabled: boolean;
  activeThreats: number;
  recentScans: CodeSecurityScan[];
  updateConfig: (newConfig: Partial<ProjectSecurityConfig>) => void;
  scanCode: (fileName: string, content: string, language: string) => Promise<CodeSecurityScan>;
  validateDatabaseSecurity: (schema: any) => Promise<SecurityValidationResult>;
  validateAPIEndpoint: (endpoint: string, method: string, headers: Record<string, string>) => Promise<SecurityValidationResult>;
  validateFileUpload: (fileName: string, content: string, size: number) => Promise<SecurityValidationResult>;
  enableSecurity: () => void;
  disableSecurity: () => void;
}

const SecurityContext = createContext<SecurityContextType | null>(null);

interface SecurityProviderProps {
  children: ReactNode;
  projectId: string;
}

export function SecurityProvider({ children, projectId }: SecurityProviderProps) {
  const [config, setConfig] = useState<ProjectSecurityConfig>(securityService.getConfig());
  const [isSecurityEnabled, setIsSecurityEnabled] = useState(true);
  const [activeThreats, setActiveThreats] = useState(0);
  const [recentScans, setRecentScans] = useState<CodeSecurityScan[]>([]);

  useEffect(() => {
    // Initialize security monitoring
    initializeSecurity();
  }, [projectId]);

  const initializeSecurity = async () => {
    try {
      // Load security configuration for project
      const savedConfig = localStorage.getItem(`velocity-security-${projectId}`);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        setConfig(parsedConfig);
        securityService.updateConfig(parsedConfig);
      }

      // Check for existing threats
      await updateThreatCount();
      
      console.log('Security provider initialized for project:', projectId);
    } catch (error: any) {
      console.error('Failed to initialize security:', error);
      toast.error('Failed to initialize security monitoring');
    }
  };

  const updateConfig = (newConfig: Partial<ProjectSecurityConfig>) => {
    const updatedConfig = { ...config, ...newConfig };
    setConfig(updatedConfig);
    securityService.updateConfig(updatedConfig);
    
    // Save to localStorage
    localStorage.setItem(`velocity-security-${projectId}`, JSON.stringify(updatedConfig));
    
    toast.success('Security configuration updated');
  };

  const scanCode = async (fileName: string, content: string, language: string): Promise<CodeSecurityScan> => {
    if (!isSecurityEnabled || !config.enableCodeScanning) {
      return {
        fileName,
        language,
        violations: [],
        riskScore: 0,
      };
    }

    try {
      const scan = await securityService.scanCode(fileName, content, language);
      
      // Update recent scans
      setRecentScans(prev => {
        const filtered = prev.filter(s => s.fileName !== fileName);
        const updated = [scan, ...filtered].slice(0, 10); // Keep last 10 scans
        return updated;
      });

      // Update threat count
      if (scan.violations.some(v => v.severity === 'critical' || v.severity === 'error')) {
        await updateThreatCount();
      }

      return scan;
    } catch (error: any) {
      console.error('Security scan failed:', error);
      throw error;
    }
  };

  const validateDatabaseSecurity = async (schema: any): Promise<SecurityValidationResult> => {
    if (!isSecurityEnabled || !config.enableDatabaseSecurityChecks) {
      return {
        isValid: true,
        violations: [],
        riskLevel: 'low',
      };
    }

    try {
      const result = await securityService.validateDatabaseSecurity(schema);
      
      if (!result.isValid && result.riskLevel === 'critical') {
        toast.error(`Critical database security issues found: ${result.violations.length} violations`);
        await updateThreatCount();
      }

      return result;
    } catch (error: any) {
      console.error('Database security validation failed:', error);
      throw error;
    }
  };

  const validateAPIEndpoint = async (
    endpoint: string, 
    method: string, 
    headers: Record<string, string>
  ): Promise<SecurityValidationResult> => {
    if (!isSecurityEnabled || !config.enableAPISecurityValidation) {
      return {
        isValid: true,
        violations: [],
        riskLevel: 'low',
      };
    }

    try {
      const result = await securityService.validateAPIEndpoint(endpoint, method, headers);
      
      if (!result.isValid && (result.riskLevel === 'high' || result.riskLevel === 'critical')) {
        toast.warning(`API security issues detected for ${endpoint}`);
      }

      return result;
    } catch (error: any) {
      console.error('API security validation failed:', error);
      throw error;
    }
  };

  const validateFileUpload = async (
    fileName: string, 
    content: string, 
    size: number
  ): Promise<SecurityValidationResult> => {
    if (!isSecurityEnabled) {
      return {
        isValid: true,
        violations: [],
        riskLevel: 'low',
      };
    }

    try {
      const result = await securityService.validateFileUpload(fileName, content, size);
      
      if (!result.isValid) {
        toast.error(`File upload blocked: ${result.violations.join(', ')}`);
      }

      return result;
    } catch (error: any) {
      console.error('File upload validation failed:', error);
      throw error;
    }
  };

  const updateThreatCount = async () => {
    try {
      // Count active threats from recent scans
      const threats = recentScans.reduce((count, scan) => {
        return count + scan.violations.filter(v => 
          v.severity === 'critical' || v.severity === 'error'
        ).length;
      }, 0);
      
      setActiveThreats(threats);
    } catch (error) {
      console.error('Failed to update threat count:', error);
    }
  };

  const enableSecurity = () => {
    setIsSecurityEnabled(true);
    toast.success('Security monitoring enabled');
  };

  const disableSecurity = () => {
    setIsSecurityEnabled(false);
    setActiveThreats(0);
    toast.warning('Security monitoring disabled');
  };

  const contextValue: SecurityContextType = {
    config,
    isSecurityEnabled,
    activeThreats,
    recentScans,
    updateConfig,
    scanCode,
    validateDatabaseSecurity,
    validateAPIEndpoint,
    validateFileUpload,
    enableSecurity,
    disableSecurity,
  };

  return (
    <SecurityContext.Provider value={contextValue}>
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity(): SecurityContextType {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurity must be used within a SecurityProvider');
  }
  return context;
}

// Hook for easy security validation in components
export function useSecurityValidation() {
  const { scanCode, validateDatabaseSecurity, validateAPIEndpoint, validateFileUpload, isSecurityEnabled } = useSecurity();

  const validateCode = async (fileName: string, content: string, language: string) => {
    if (!isSecurityEnabled) return null;
    
    try {
      const scan = await scanCode(fileName, content, language);
      const criticalIssues = scan.violations.filter(v => v.severity === 'critical');
      
      if (criticalIssues.length > 0) {
        return {
          hasIssues: true,
          message: `${criticalIssues.length} critical security issue(s) found`,
          violations: criticalIssues,
        };
      }
      
      return { hasIssues: false, message: 'Code passed security validation' };
    } catch (error: any) {
      return {
        hasIssues: true,
        message: `Security validation failed: ${error.message}`,
        error,
      };
    }
  };

  const validateDatabase = async (schema: any) => {
    if (!isSecurityEnabled) return null;
    
    try {
      const result = await validateDatabaseSecurity(schema);
      
      if (!result.isValid) {
        return {
          hasIssues: true,
          message: `Database security issues: ${result.violations.length} violation(s)`,
          violations: result.violations,
          riskLevel: result.riskLevel,
        };
      }
      
      return { hasIssues: false, message: 'Database passed security validation' };
    } catch (error: any) {
      return {
        hasIssues: true,
        message: `Database validation failed: ${error.message}`,
        error,
      };
    }
  };

  const validateAPI = async (endpoint: string, method: string, headers: Record<string, string>) => {
    if (!isSecurityEnabled) return null;
    
    try {
      const result = await validateAPIEndpoint(endpoint, method, headers);
      
      if (!result.isValid) {
        return {
          hasIssues: true,
          message: `API security issues: ${result.violations.length} violation(s)`,
          violations: result.violations,
          riskLevel: result.riskLevel,
        };
      }
      
      return { hasIssues: false, message: 'API endpoint passed security validation' };
    } catch (error: any) {
      return {
        hasIssues: true,
        message: `API validation failed: ${error.message}`,
        error,
      };
    }
  };

  const validateFile = async (fileName: string, content: string, size: number) => {
    if (!isSecurityEnabled) return null;
    
    try {
      const result = await validateFileUpload(fileName, content, size);
      
      if (!result.isValid) {
        return {
          hasIssues: true,
          message: `File upload issues: ${result.violations.length} violation(s)`,
          violations: result.violations,
          riskLevel: result.riskLevel,
        };
      }
      
      return { hasIssues: false, message: 'File passed security validation' };
    } catch (error: any) {
      return {
        hasIssues: true,
        message: `File validation failed: ${error.message}`,
        error,
      };
    }
  };

  return {
    validateCode,
    validateDatabase,
    validateAPI,
    validateFile,
    isSecurityEnabled,
  };
}