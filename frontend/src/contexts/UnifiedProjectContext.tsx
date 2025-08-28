import React, { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useSupabaseConnection, type SupabaseConnectionState } from '../hooks/useSupabaseConnection';
import { type SupabaseCredentials, type ConnectionTestResult } from '../services/supabaseConnection';
import { securityService } from '../services/securityService';
import type { ProjectSecurityConfig, SecurityValidationResult, CodeSecurityScan } from '../services/securityService';
import { useNavigationTracking } from '../utils/performance/navigationMetrics';
import { projectDataCache, cacheUtils, type CachedProjectData } from '../utils/cache/ProjectDataCache';

// Re-export Project interface from original context for compatibility
export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'active' | 'archived';
}

// Unified interface combining both provider functionalities
export interface UnifiedProjectContextType {
  // Project Management (from ProjectProvider)
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  
  // Supabase Connection (from ProjectProvider)
  supabaseConnection: {
    isConnected: boolean;
    isConnecting: boolean;
    isHealthy: boolean;
    projectUrl: string | null;
    lastValidated: Date | null;
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    error: string | null;
  };
  
  // Security (from SecurityProvider)
  security: {
    config: ProjectSecurityConfig;
    isSecurityEnabled: boolean;
    activeThreats: number;
    recentScans: CodeSecurityScan[];
  };
  
  // Build Status
  isBuildReady: boolean;
  
  // Connection Actions
  connectSupabase: (credentials: SupabaseCredentials) => Promise<ConnectionTestResult>;
  disconnectSupabase: () => Promise<{ success: boolean; error?: string }>;
  updateSupabaseConnection: (credentials: SupabaseCredentials) => Promise<{ success: boolean; error?: string }>;
  testSupabaseConnection: () => Promise<ConnectionTestResult>;
  refreshSupabaseConnection: () => Promise<void>;
  
  // Security Actions
  updateSecurityConfig: (newConfig: Partial<ProjectSecurityConfig>) => void;
  scanCode: (fileName: string, content: string, language: string) => Promise<CodeSecurityScan>;
  validateDatabaseSecurity: (schema: any) => Promise<SecurityValidationResult>;
  validateAPIEndpoint: (endpoint: string, method: string, headers: Record<string, string>) => Promise<SecurityValidationResult>;
  validateFileUpload: (fileName: string, content: string, size: number) => Promise<SecurityValidationResult>;
  enableSecurity: () => void;
  disableSecurity: () => void;
  
  // Cache Management
  invalidateProjectCache: () => void;
}

const UnifiedProjectContext = createContext<UnifiedProjectContextType | undefined>(undefined);

interface UnifiedProjectProviderProps {
  children: ReactNode;
  projectId?: string;
}

export function UnifiedProjectProvider({ children, projectId }: UnifiedProjectProviderProps) {
  const { recordComponentRemount } = useNavigationTracking();
  
  // Project state (from ProjectProvider)
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  
  // Security state (from SecurityProvider)
  const [securityConfig, setSecurityConfig] = useState<ProjectSecurityConfig>(securityService.getConfig());
  const [isSecurityEnabled, setIsSecurityEnabled] = useState(true);
  const [activeThreats, setActiveThreats] = useState(0);
  const [recentScans, setRecentScans] = useState<CodeSecurityScan[]>([]);

  // Supabase connection hook (from ProjectProvider)
  const supabaseHook = projectId ? useSupabaseConnection(projectId) : null;
  
  // Default connection state when no project is selected
  const defaultConnectionState: SupabaseConnectionState = {
    isConnected: false,
    isConnecting: false,
    isHealthy: false,
    projectUrl: null,
    lastValidated: null,
    connectionStatus: 'disconnected',
    error: null,
    supabaseClient: null
  };
  
  const connectionState = supabaseHook?.connectionState || defaultConnectionState;

  // Record component remount for performance tracking
  useEffect(() => {
    recordComponentRemount();
  }, [recordComponentRemount]);

  // Initialize project data when projectId changes (with caching)
  useEffect(() => {
    if (projectId) {
      loadProjectData(projectId);
    } else {
      setCurrentProject(null);
      setSecurityConfig(securityService.getConfig());
      setIsSecurityEnabled(true);
      setActiveThreats(0);
      setRecentScans([]);
    }
  }, [projectId]);

  const loadProjectData = async (projectId: string) => {
    try {
      // Check cache first
      const cachedData = cacheUtils.getCachedProject(projectId);
      
      if (cachedData) {
        console.log(`🚀 Loading project ${projectId} from cache`);
        
        // Load from cache immediately
        setCurrentProject(cachedData.project);
        setSecurityConfig(cachedData.security.config);
        setIsSecurityEnabled(cachedData.security.isSecurityEnabled);
        setActiveThreats(cachedData.security.activeThreats);
        setRecentScans(cachedData.security.recentScans);
        
        return; // Skip API calls
      }
      
      console.log(`📡 Loading project ${projectId} from API (cache miss)`);
      
      // Load from API and cache the results
      // TODO: Replace with actual API calls when backend is ready
      // For now, simulate API delay and use mock data
      await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay
      
      const mockProject: Project = {
        id: projectId,
        name: 'My Project',
        description: 'A sample project',
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'active'
      };
      
      const mockSecurityState = {
        config: securityService.getConfig(),
        isSecurityEnabled: true,
        activeThreats: 0,
        recentScans: []
      };
      
      // Update state
      setCurrentProject(mockProject);
      setSecurityConfig(mockSecurityState.config);
      setIsSecurityEnabled(mockSecurityState.isSecurityEnabled);
      setActiveThreats(mockSecurityState.activeThreats);
      setRecentScans(mockSecurityState.recentScans);
      
      // Cache the data for future navigations
      cacheUtils.cacheProject(projectId, mockProject, mockSecurityState);
      
    } catch (error) {
      console.error('Failed to load project data:', error);
      toast.error('Failed to load project data');
    }
  };

  // Cache-aware security configuration update
  const updateCachedSecurity = () => {
    if (!projectId) return;
    
    try {
      // Load security configuration from localStorage (legacy support)
      const savedConfig = localStorage.getItem(`velocity-security-${projectId}`);
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        setSecurityConfig(parsedConfig);
        securityService.updateConfig(parsedConfig);
        
        // Update cache if project is cached
        const cached = projectDataCache.get(projectId);
        if (cached) {
          projectDataCache.update(projectId, {
            security: {
              ...cached.security,
              config: parsedConfig
            }
          });
        }
      }
    } catch (error: any) {
      console.error('Failed to load security config:', error);
    }
  };

  // Load security config on mount (only if not loaded from cache)
  useEffect(() => {
    if (projectId && !projectDataCache.has(projectId)) {
      updateCachedSecurity();
    }
  }, [projectId]);

  // Security methods with cache integration
  const updateSecurityConfig = (newConfig: Partial<ProjectSecurityConfig>) => {
    const updatedConfig = { ...securityConfig, ...newConfig };
    setSecurityConfig(updatedConfig);
    securityService.updateConfig(updatedConfig);
    
    if (projectId) {
      // Update localStorage for backward compatibility
      localStorage.setItem(`velocity-security-${projectId}`, JSON.stringify(updatedConfig));
      
      // Update cache
      const cached = projectDataCache.get(projectId);
      if (cached) {
        projectDataCache.update(projectId, {
          security: {
            ...cached.security,
            config: updatedConfig
          }
        });
      }
    }
    
    toast.success('Security configuration updated');
  };

  const scanCode = async (fileName: string, content: string, language: string): Promise<CodeSecurityScan> => {
    if (!isSecurityEnabled || !securityConfig.enableCodeScanning) {
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
        
        // Update cache with new scan data
        if (projectId) {
          const cached = projectDataCache.get(projectId);
          if (cached) {
            projectDataCache.update(projectId, {
              security: {
                ...cached.security,
                recentScans: updated
              }
            });
          }
        }
        
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
    if (!isSecurityEnabled || !securityConfig.enableDatabaseSecurityChecks) {
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
    if (!isSecurityEnabled || !securityConfig.enableAPISecurityValidation) {
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
      
      // Update cache with new threat count
      if (projectId) {
        const cached = projectDataCache.get(projectId);
        if (cached) {
          projectDataCache.update(projectId, {
            security: {
              ...cached.security,
              activeThreats: threats
            }
          });
        }
      }
    } catch (error) {
      console.error('Failed to update threat count:', error);
    }
  };

  const enableSecurity = () => {
    setIsSecurityEnabled(true);
    
    // Update cache
    if (projectId) {
      const cached = projectDataCache.get(projectId);
      if (cached) {
        projectDataCache.update(projectId, {
          security: {
            ...cached.security,
            isSecurityEnabled: true
          }
        });
      }
    }
    
    toast.success('Security monitoring enabled');
  };

  const disableSecurity = () => {
    setIsSecurityEnabled(false);
    setActiveThreats(0);
    
    // Update cache
    if (projectId) {
      const cached = projectDataCache.get(projectId);
      if (cached) {
        projectDataCache.update(projectId, {
          security: {
            ...cached.security,
            isSecurityEnabled: false,
            activeThreats: 0
          }
        });
      }
    }
    
    toast.warning('Security monitoring disabled');
  };

  // Cache management method for external use
  const invalidateProjectCache = () => {
    if (projectId) {
      cacheUtils.invalidateProject(projectId);
      console.log(`🗑️ Manually invalidated cache for project ${projectId}`);
    }
  };

  // Connection actions (from ProjectProvider)
  const connectSupabase = async (credentials: SupabaseCredentials): Promise<ConnectionTestResult> => {
    if (!supabaseHook) {
      return {
        success: false,
        message: 'No project selected'
      };
    }
    return supabaseHook.connectSupabase(credentials);
  };

  const disconnectSupabase = async (): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseHook) {
      return {
        success: false,
        error: 'No project selected'
      };
    }
    return supabaseHook.disconnectSupabase();
  };

  const updateSupabaseConnection = async (credentials: SupabaseCredentials): Promise<{ success: boolean; error?: string }> => {
    if (!supabaseHook) {
      return {
        success: false,
        error: 'No project selected'
      };
    }
    return supabaseHook.updateConnection(credentials);
  };

  const testSupabaseConnection = async (): Promise<ConnectionTestResult> => {
    if (!supabaseHook) {
      return {
        success: false,
        message: 'No project selected'
      };
    }
    return supabaseHook.checkConnectionHealth();
  };

  const refreshSupabaseConnection = async (): Promise<void> => {
    if (supabaseHook) {
      await supabaseHook.refreshConnection();
    }
  };

  // Calculate build readiness (from ProjectProvider logic)
  const isBuildReady = Boolean(
    currentProject && 
    connectionState.isConnected && 
    connectionState.isHealthy
  );

  // Enhanced setCurrentProject with cache awareness
  const setCurrentProjectWithCache = (project: Project | null) => {
    setCurrentProject(project);
    
    // If setting to null or different project, we might want to invalidate cache
    if (!project && currentProject && projectId) {
      // Optionally invalidate cache when clearing project
      // cacheUtils.invalidateProject(projectId);
    }
  };

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    // Project data
    currentProject,
    setCurrentProject: setCurrentProjectWithCache,
    
    // Supabase connection
    supabaseConnection: {
      isConnected: connectionState.isConnected,
      isConnecting: connectionState.isConnecting,
      isHealthy: connectionState.isHealthy,
      projectUrl: connectionState.projectUrl,
      lastValidated: connectionState.lastValidated,
      connectionStatus: connectionState.connectionStatus,
      error: connectionState.error
    },
    
    // Security
    security: {
      config: securityConfig,
      isSecurityEnabled,
      activeThreats,
      recentScans,
    },
    
    // Build status
    isBuildReady,
    
    // Actions
    connectSupabase,
    disconnectSupabase,
    updateSupabaseConnection,
    testSupabaseConnection,
    refreshSupabaseConnection,
    updateSecurityConfig,
    scanCode,
    validateDatabaseSecurity,
    validateAPIEndpoint,
    validateFileUpload,
    enableSecurity,
    disableSecurity,
    invalidateProjectCache,
  }), [
    currentProject,
    connectionState,
    securityConfig,
    isSecurityEnabled,
    activeThreats,
    recentScans,
    isBuildReady,
    // Don't include functions in dependency array as they're created fresh each render
  ]);

  return (
    <UnifiedProjectContext.Provider value={value}>
      {children}
    </UnifiedProjectContext.Provider>
  );
}

// Hook to use the unified context
export function useUnifiedProjectContext() {
  const context = useContext(UnifiedProjectContext);
  if (!context) {
    throw new Error('useUnifiedProjectContext must be used within a UnifiedProjectProvider');
  }
  return context;
}

// Compatibility hooks for existing code migration
export function useProjectContext() {
  console.warn('useProjectContext is deprecated, use useUnifiedProjectContext instead');
  return useUnifiedProjectContext();
}

export function useSecurity() {
  const { security, updateSecurityConfig, scanCode, validateDatabaseSecurity, validateAPIEndpoint, validateFileUpload, enableSecurity, disableSecurity } = useUnifiedProjectContext();
  return {
    config: security.config,
    isSecurityEnabled: security.isSecurityEnabled,
    activeThreats: security.activeThreats,
    recentScans: security.recentScans,
    updateConfig: updateSecurityConfig,
    scanCode,
    validateDatabaseSecurity,
    validateAPIEndpoint,
    validateFileUpload,
    enableSecurity,
    disableSecurity,
  };
}

// HOC for backward compatibility
export function withUnifiedProjectContext<P extends object>(
  Component: React.ComponentType<P>
): React.FC<P> {
  return function WithUnifiedProjectContextComponent(props: P) {
    return (
      <UnifiedProjectProvider>
        <Component {...props} />
      </UnifiedProjectProvider>
    );
  };
}