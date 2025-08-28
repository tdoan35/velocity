import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { toast } from 'sonner'
import { useSupabaseConnection, type SupabaseConnectionState } from '../hooks/useSupabaseConnection'
import { type SupabaseCredentials, type ConnectionTestResult } from '../services/supabaseConnection'
import { securityService } from '../services/securityService'
import type { ProjectSecurityConfig, SecurityValidationResult, CodeSecurityScan } from '../services/securityService'
import { projectDataCache, cacheUtils, type CachedProjectData } from '../utils/cache/ProjectDataCache'
import { projectService } from '../services/projectService'
// Note: AppNotification type is now only used in AppStore

// Re-export Project interface for compatibility
export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'active' | 'archived';
  template?: string;
}

// Security state interface
interface SecurityState {
  config: ProjectSecurityConfig;
  isSecurityEnabled: boolean;
  activeThreats: number;
  recentScans: CodeSecurityScan[];
}

// Supabase connection interface (simplified from hook)
interface SupabaseConnection {
  isConnected: boolean;
  isConnecting: boolean;
  isHealthy: boolean;
  projectUrl: string | null;
  lastValidated: Date | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: string | null;
}

// Main project store interface
interface ProjectState {
  // Project Management
  currentProject: Project | null;
  projects: Project[];
  
  // Supabase Connection State
  supabaseConnection: SupabaseConnection;
  
  // Security State
  security: SecurityState;
  
  // Build Status
  isBuildReady: boolean;
  
  // Cache Management
  projectCache: Map<string, CachedProjectData>;
  
  // UI State
  isLoading: boolean;
  
  // Note: General app notifications are handled by AppStore
  
  // Project Actions
  setCurrentProject: (project: Project | null) => void;
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  loadProject: (projectId: string) => Promise<void>;
  
  // Supabase Connection Actions
  connectSupabase: (projectId: string, credentials: SupabaseCredentials) => Promise<ConnectionTestResult>;
  disconnectSupabase: (projectId: string) => Promise<{ success: boolean; error?: string }>;
  updateSupabaseConnection: (projectId: string, credentials: SupabaseCredentials) => Promise<{ success: boolean; error?: string }>;
  testSupabaseConnection: (projectId: string) => Promise<ConnectionTestResult>;
  refreshSupabaseConnection: (projectId: string) => Promise<void>;
  
  // Security Actions
  updateSecurityConfig: (projectId: string, newConfig: Partial<ProjectSecurityConfig>) => void;
  scanCode: (projectId: string, fileName: string, content: string, language: string) => Promise<CodeSecurityScan>;
  validateDatabaseSecurity: (projectId: string, schema: any) => Promise<SecurityValidationResult>;
  validateAPIEndpoint: (projectId: string, endpoint: string, method: string, headers: Record<string, string>) => Promise<SecurityValidationResult>;
  validateFileUpload: (projectId: string, fileName: string, content: string, size: number) => Promise<SecurityValidationResult>;
  enableSecurity: (projectId: string) => void;
  disableSecurity: (projectId: string) => void;
  
  // Cache Management Actions
  invalidateProjectCache: (projectId: string) => void;
  clearAllCache: () => void;
  
  // Note: Notification actions are handled by AppStore
  
  // Internal utility actions
  setLoading: (loading: boolean) => void;
  updateSupabaseConnectionState: (projectId: string, connection: Partial<SupabaseConnection>) => void;
  updateSecurityState: (projectId: string, security: Partial<SecurityState>) => void;
}

// Default states
const defaultSupabaseConnection: SupabaseConnection = {
  isConnected: false,
  isConnecting: false,
  isHealthy: false,
  projectUrl: null,
  lastValidated: null,
  connectionStatus: 'disconnected',
  error: null
};

const defaultSecurityState: SecurityState = {
  config: securityService.getConfig(),
  isSecurityEnabled: true,
  activeThreats: 0,
  recentScans: []
};

export const useProjectStore = create<ProjectState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // Initial state
      currentProject: null,
      projects: [],
      supabaseConnection: defaultSupabaseConnection,
      security: defaultSecurityState,
      isBuildReady: false,
      projectCache: new Map(),
      isLoading: false,
      
      // Project actions
      setCurrentProject: (project) => {
        set({ currentProject: project });
        
        // Update build readiness
        const { supabaseConnection } = get();
        const isBuildReady = Boolean(
          project && 
          supabaseConnection.isConnected && 
          supabaseConnection.isHealthy
        );
        set({ isBuildReady });
      },
      
      setProjects: (projects) => set({ projects }),
      
      addProject: (project) => 
        set((state) => ({ projects: [project, ...state.projects] })),
      
      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
          ),
          currentProject:
            state.currentProject?.id === id
              ? { ...state.currentProject, ...updates, updatedAt: new Date() }
              : state.currentProject,
        })),
      
      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProject:
            state.currentProject?.id === id ? null : state.currentProject,
        })),
      
      loadProject: async (projectId: string) => {
        const { setLoading, setCurrentProject, updateSecurityState } = get();
        
        try {
          setLoading(true);
          
          // Check cache first
          const cachedData = cacheUtils.getCachedProject(projectId);
          
          if (cachedData) {
            console.log(`🚀 Loading project ${projectId} from cache`);
            
            // Load from cache immediately
            setCurrentProject(cachedData.project);
            updateSecurityState(projectId, cachedData.security);
            setLoading(false);
            
            return;
          }
          
          console.log(`📡 Loading project ${projectId} from API (cache miss)`);
          
          // Try to fetch real project data from the API
          const { project: projectData, error: projectError } = await projectService.getProject(projectId);
          
          let loadedProject: Project;
          
          if (projectError || !projectData) {
            console.warn('Failed to load project from API, trying fallback from projects list:', projectError);
            
            // Fallback: Try to find the project in the current projects list
            const { projects } = get();
            const fallbackProject = projects.find(p => p.id === projectId);
            
            if (fallbackProject) {
              console.log(`📋 Using fallback project data for ${projectId}: ${fallbackProject.name}`);
              loadedProject = fallbackProject;
            } else {
              console.error('Failed to load project: not found in API or projects list');
              toast.error('Failed to load project data');
              return;
            }
          } else {
            // Transform the database project to our Project interface
            loadedProject = {
              id: projectData.id,
              name: projectData.name,
              description: projectData.description || '',
              createdAt: new Date(projectData.created_at),
              updatedAt: new Date(projectData.updated_at),
              status: projectData.status || 'active',
              template: projectData.template_type
            };
          }
          
          const mockSecurityState = {
            config: securityService.getConfig(),
            isSecurityEnabled: true,
            activeThreats: 0,
            recentScans: []
          };
          
          // Update state
          setCurrentProject(loadedProject);
          updateSecurityState(projectId, mockSecurityState);
          
          // Cache the data for future navigations
          cacheUtils.cacheProject(projectId, loadedProject, mockSecurityState);
          
        } catch (error) {
          console.error('Failed to load project data:', error);
          toast.error('Failed to load project data');
        } finally {
          setLoading(false);
        }
      },
      
      // Supabase connection actions (stubs - will be implemented with actual connection logic)
      connectSupabase: async (projectId: string, credentials: SupabaseCredentials) => {
        // TODO: Implement actual connection logic
        return { success: false, message: 'Not implemented' };
      },
      
      disconnectSupabase: async (projectId: string) => {
        // TODO: Implement actual disconnection logic
        return { success: false, error: 'Not implemented' };
      },
      
      updateSupabaseConnection: async (projectId: string, credentials: SupabaseCredentials) => {
        // TODO: Implement actual update logic
        return { success: false, error: 'Not implemented' };
      },
      
      testSupabaseConnection: async (projectId: string) => {
        // TODO: Implement actual test logic
        return { success: false, message: 'Not implemented' };
      },
      
      refreshSupabaseConnection: async (projectId: string) => {
        // TODO: Implement actual refresh logic
      },
      
      // Security actions with cache integration
      updateSecurityConfig: (projectId: string, newConfig: Partial<ProjectSecurityConfig>) => {
        const { security } = get();
        const updatedConfig = { ...security.config, ...newConfig };
        
        set((state) => ({
          security: {
            ...state.security,
            config: updatedConfig
          }
        }));
        
        securityService.updateConfig(updatedConfig);
        
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
        
        toast.success('Security configuration updated');
      },
      
      scanCode: async (projectId: string, fileName: string, content: string, language: string) => {
        const { security } = get();
        
        if (!security.isSecurityEnabled || !security.config.enableCodeScanning) {
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
          set((state) => ({
            security: {
              ...state.security,
              recentScans: [scan, ...state.security.recentScans.filter(s => s.fileName !== fileName)].slice(0, 10)
            }
          }));
          
          // Update cache with new scan data
          const cached = projectDataCache.get(projectId);
          if (cached) {
            const updatedScans = [scan, ...cached.security.recentScans.filter(s => s.fileName !== fileName)].slice(0, 10);
            projectDataCache.update(projectId, {
              security: {
                ...cached.security,
                recentScans: updatedScans
              }
            });
          }
          
          // Update threat count if critical violations found
          if (scan.violations.some(v => v.severity === 'critical' || v.severity === 'error')) {
            const { updateThreatCount } = get() as any;
            updateThreatCount?.(projectId);
          }
          
          return scan;
        } catch (error: any) {
          console.error('Security scan failed:', error);
          throw error;
        }
      },
      
      validateDatabaseSecurity: async (projectId: string, schema: any) => {
        const { security } = get();
        
        if (!security.isSecurityEnabled || !security.config.enableDatabaseSecurityChecks) {
          return {
            isValid: true,
            violations: [],
            riskLevel: 'low' as const,
          };
        }
        
        try {
          const result = await securityService.validateDatabaseSecurity(schema);
          
          if (!result.isValid && result.riskLevel === 'critical') {
            toast.error(`Critical database security issues found: ${result.violations.length} violations`);
          }
          
          return result;
        } catch (error: any) {
          console.error('Database security validation failed:', error);
          throw error;
        }
      },
      
      validateAPIEndpoint: async (projectId: string, endpoint: string, method: string, headers: Record<string, string>) => {
        const { security } = get();
        
        if (!security.isSecurityEnabled || !security.config.enableAPISecurityValidation) {
          return {
            isValid: true,
            violations: [],
            riskLevel: 'low' as const,
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
      },
      
      validateFileUpload: async (projectId: string, fileName: string, content: string, size: number) => {
        const { security } = get();
        
        if (!security.isSecurityEnabled) {
          return {
            isValid: true,
            violations: [],
            riskLevel: 'low' as const,
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
      },
      
      enableSecurity: (projectId: string) => {
        set((state) => ({
          security: {
            ...state.security,
            isSecurityEnabled: true
          }
        }));
        
        // Update cache
        const cached = projectDataCache.get(projectId);
        if (cached) {
          projectDataCache.update(projectId, {
            security: {
              ...cached.security,
              isSecurityEnabled: true
            }
          });
        }
        
        toast.success('Security monitoring enabled');
      },
      
      disableSecurity: (projectId: string) => {
        set((state) => ({
          security: {
            ...state.security,
            isSecurityEnabled: false,
            activeThreats: 0
          }
        }));
        
        // Update cache
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
        
        toast.warning('Security monitoring disabled');
      },
      
      // Cache management actions
      invalidateProjectCache: (projectId: string) => {
        cacheUtils.invalidateProject(projectId);
        console.log(`🗑️ Manually invalidated cache for project ${projectId}`);
      },
      
      clearAllCache: () => {
        projectDataCache.clear();
        set({ projectCache: new Map() });
        console.log('🗑️ Cleared all project cache');
      },
      
      // Note: Notifications are handled by AppStore for general app notifications
      
      // Internal utility actions
      setLoading: (loading) => set({ isLoading: loading }),
      
      updateSupabaseConnectionState: (projectId: string, connection: Partial<SupabaseConnection>) => {
        set((state) => ({
          supabaseConnection: { ...state.supabaseConnection, ...connection }
        }));
        
        // Update build readiness
        const { currentProject, supabaseConnection } = get();
        const isBuildReady = Boolean(
          currentProject && 
          supabaseConnection.isConnected && 
          supabaseConnection.isHealthy
        );
        set({ isBuildReady });
      },
      
      updateSecurityState: (projectId: string, security: Partial<SecurityState>) => {
        set((state) => ({
          security: { ...state.security, ...security }
        }));
      },
    })),
    {
      name: 'project-store',
    }
  )
)

// Convenience hooks for specific functionality
export const useProject = () => {
  const store = useProjectStore();
  return {
    currentProject: store.currentProject,
    projects: store.projects,
    isLoading: store.isLoading,
    setCurrentProject: store.setCurrentProject,
    setProjects: store.setProjects,
    addProject: store.addProject,
    updateProject: store.updateProject,
    deleteProject: store.deleteProject,
    loadProject: store.loadProject,
  };
};

export const useProjectSecurity = () => {
  const store = useProjectStore();
  return {
    security: store.security,
    updateSecurityConfig: store.updateSecurityConfig,
    scanCode: store.scanCode,
    validateDatabaseSecurity: store.validateDatabaseSecurity,
    validateAPIEndpoint: store.validateAPIEndpoint,
    validateFileUpload: store.validateFileUpload,
    enableSecurity: store.enableSecurity,
    disableSecurity: store.disableSecurity,
  };
};

export const useSupabaseProject = () => {
  const store = useProjectStore();
  return {
    supabaseConnection: store.supabaseConnection,
    isBuildReady: store.isBuildReady,
    connectSupabase: store.connectSupabase,
    disconnectSupabase: store.disconnectSupabase,
    updateSupabaseConnection: store.updateSupabaseConnection,
    testSupabaseConnection: store.testSupabaseConnection,
    refreshSupabaseConnection: store.refreshSupabaseConnection,
  };
};