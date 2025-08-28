import React, { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { useProjectStore, type Project, useProject, useProjectSecurity, useSupabaseProject } from '../stores/useProjectStore';
import { useNavigationTracking } from '../utils/performance/navigationMetrics';

// Main context interface that mirrors the store but adds route-aware functionality
export interface ProjectContextType {
  // Project Management
  currentProject: Project | null;
  projects: Project[];
  isLoading: boolean;
  
  // Supabase Connection
  supabaseConnection: {
    isConnected: boolean;
    isConnecting: boolean;
    isHealthy: boolean;
    projectUrl: string | null;
    lastValidated: Date | null;
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    error: string | null;
  };
  
  // Security
  security: {
    config: any;
    isSecurityEnabled: boolean;
    activeThreats: number;
    recentScans: any[];
  };
  
  // Build Status
  isBuildReady: boolean;
  
  // Route Context
  currentProjectId: string | null;
  isProjectRoute: boolean;
  
  // Project Actions
  setCurrentProject: (project: Project | null) => void;
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;
  loadProject: (projectId: string) => Promise<void>;
  
  // Connection Actions
  connectSupabase: (credentials: any) => Promise<any>;
  disconnectSupabase: () => Promise<{ success: boolean; error?: string }>;
  updateSupabaseConnection: (credentials: any) => Promise<{ success: boolean; error?: string }>;
  testSupabaseConnection: () => Promise<any>;
  refreshSupabaseConnection: () => Promise<void>;
  
  // Security Actions
  updateSecurityConfig: (newConfig: any) => void;
  scanCode: (fileName: string, content: string, language: string) => Promise<any>;
  validateDatabaseSecurity: (schema: any) => Promise<any>;
  validateAPIEndpoint: (endpoint: string, method: string, headers: Record<string, string>) => Promise<any>;
  validateFileUpload: (fileName: string, content: string, size: number) => Promise<any>;
  enableSecurity: () => void;
  disableSecurity: () => void;
  
  // Cache Management
  invalidateProjectCache: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

interface ProjectProviderProps {
  children: ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const { recordComponentRemount } = useNavigationTracking();
  const location = useLocation();
  const params = useParams<{ id: string }>();
  
  // Get route context
  // Extract project ID directly from pathname since nested Routes may not pass params correctly
  const isProjectRoute = location.pathname.startsWith('/project/');
  const currentProjectId = isProjectRoute 
    ? location.pathname.split('/')[2] || null 
    : null;
  
  // Get store hooks
  const projectHooks = useProject();
  const securityHooks = useProjectSecurity();
  const supabaseHooks = useSupabaseProject();
  const store = useProjectStore();

  // Record component remount for performance tracking
  useEffect(() => {
    recordComponentRemount();
  }, [recordComponentRemount]);

  // Auto-load project when route changes
  useEffect(() => {
    if (currentProjectId && isProjectRoute) {
      // Check if we need to load this project
      if (!projectHooks.currentProject || projectHooks.currentProject.id !== currentProjectId) {
        console.log(`🔄 Auto-loading project ${currentProjectId} due to route change`);
        projectHooks.loadProject(currentProjectId);
      }
    } else if (!isProjectRoute && projectHooks.currentProject) {
      // Clear current project when navigating away from project routes
      projectHooks.setCurrentProject(null);
    }
  }, [currentProjectId, isProjectRoute, projectHooks.currentProject?.id, projectHooks.loadProject, projectHooks.setCurrentProject]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo((): ProjectContextType => ({
    // Project data
    currentProject: projectHooks.currentProject,
    projects: projectHooks.projects,
    isLoading: projectHooks.isLoading,
    
    // Supabase connection
    supabaseConnection: supabaseHooks.supabaseConnection,
    isBuildReady: supabaseHooks.isBuildReady,
    
    // Security
    security: securityHooks.security,
    
    // Route context
    currentProjectId,
    isProjectRoute,
    
    // Project actions
    setCurrentProject: projectHooks.setCurrentProject,
    setProjects: projectHooks.setProjects,
    addProject: projectHooks.addProject,
    updateProject: projectHooks.updateProject,
    deleteProject: projectHooks.deleteProject,
    loadProject: projectHooks.loadProject,
    
    // Connection actions (with current project context)
    connectSupabase: (credentials: any) => 
      currentProjectId ? supabaseHooks.connectSupabase(currentProjectId, credentials) : 
      Promise.resolve({ success: false, message: 'No project selected' }),
    
    disconnectSupabase: () => 
      currentProjectId ? supabaseHooks.disconnectSupabase(currentProjectId) : 
      Promise.resolve({ success: false, error: 'No project selected' }),
    
    updateSupabaseConnection: (credentials: any) => 
      currentProjectId ? supabaseHooks.updateSupabaseConnection(currentProjectId, credentials) : 
      Promise.resolve({ success: false, error: 'No project selected' }),
    
    testSupabaseConnection: () => 
      currentProjectId ? supabaseHooks.testSupabaseConnection(currentProjectId) : 
      Promise.resolve({ success: false, message: 'No project selected' }),
    
    refreshSupabaseConnection: () => 
      currentProjectId ? supabaseHooks.refreshSupabaseConnection(currentProjectId) : Promise.resolve(),
    
    // Security actions (with current project context)
    updateSecurityConfig: (newConfig: any) => 
      currentProjectId && securityHooks.updateSecurityConfig(currentProjectId, newConfig),
    
    scanCode: (fileName: string, content: string, language: string) => 
      currentProjectId ? securityHooks.scanCode(currentProjectId, fileName, content, language) : 
      Promise.resolve({ fileName, language, violations: [], riskScore: 0 }),
    
    validateDatabaseSecurity: (schema: any) => 
      currentProjectId ? securityHooks.validateDatabaseSecurity(currentProjectId, schema) : 
      Promise.resolve({ isValid: true, violations: [], riskLevel: 'low' as const }),
    
    validateAPIEndpoint: (endpoint: string, method: string, headers: Record<string, string>) => 
      currentProjectId ? securityHooks.validateAPIEndpoint(currentProjectId, endpoint, method, headers) : 
      Promise.resolve({ isValid: true, violations: [], riskLevel: 'low' as const }),
    
    validateFileUpload: (fileName: string, content: string, size: number) => 
      currentProjectId ? securityHooks.validateFileUpload(currentProjectId, fileName, content, size) : 
      Promise.resolve({ isValid: true, violations: [], riskLevel: 'low' as const }),
    
    enableSecurity: () => 
      currentProjectId && securityHooks.enableSecurity(currentProjectId),
    
    disableSecurity: () => 
      currentProjectId && securityHooks.disableSecurity(currentProjectId),
    
    // Cache management
    invalidateProjectCache: () => 
      currentProjectId && store.invalidateProjectCache(currentProjectId),
      
  }), [
    projectHooks.currentProject,
    projectHooks.projects,
    projectHooks.isLoading,
    supabaseHooks.supabaseConnection,
    supabaseHooks.isBuildReady,
    securityHooks.security,
    currentProjectId,
    isProjectRoute,
    // Don't include function references as they're stable from hooks
  ]);

  return (
    <ProjectContext.Provider value={contextValue}>
      {children}
    </ProjectContext.Provider>
  );
}

// Hook to use the project context
export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
}

// Convenience hooks that work with context
export function useCurrentProject() {
  const { currentProject, setCurrentProject, loadProject, isLoading } = useProjectContext();
  return { currentProject, setCurrentProject, loadProject, isLoading };
}

export function useProjectList() {
  const { projects, setProjects, addProject, updateProject, deleteProject } = useProjectContext();
  return { projects, setProjects, addProject, updateProject, deleteProject };
}

export function useProjectSecurityContext() {
  const { 
    security, 
    updateSecurityConfig, 
    scanCode, 
    validateDatabaseSecurity, 
    validateAPIEndpoint, 
    validateFileUpload, 
    enableSecurity, 
    disableSecurity 
  } = useProjectContext();
  
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

export function useProjectSupabase() {
  const { 
    supabaseConnection,
    isBuildReady,
    connectSupabase, 
    disconnectSupabase, 
    updateSupabaseConnection, 
    testSupabaseConnection, 
    refreshSupabaseConnection 
  } = useProjectContext();
  
  return {
    supabaseConnection,
    isBuildReady,
    connectSupabase,
    disconnectSupabase,
    updateSupabaseConnection,
    testSupabaseConnection,
    refreshSupabaseConnection,
  };
}

// HOC for backward compatibility
export function withProjectContext<P extends object>(
  Component: React.ComponentType<P>
): React.FC<P> {
  return function WithProjectContextComponent(props: P) {
    return (
      <ProjectProvider>
        <Component {...props} />
      </ProjectProvider>
    );
  };
}

// Re-export for convenience
export { useProjectStore } from '../stores/useProjectStore';