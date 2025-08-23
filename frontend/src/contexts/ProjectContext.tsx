import React, { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { useSupabaseConnection, type SupabaseConnectionState } from '../hooks/useSupabaseConnection';
import { type SupabaseCredentials, type ConnectionTestResult } from '../services/supabaseConnection';

export interface Project {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'active' | 'archived';
  // Add more project fields as needed
}

export interface ProjectContextType {
  // Project data
  currentProject: Project | null;
  setCurrentProject: (project: Project | null) => void;
  
  // Supabase connection
  supabaseConnection: {
    isConnected: boolean;
    isConnecting: boolean;
    isHealthy: boolean;
    projectUrl: string | null;
    lastValidated: Date | null;
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
    error: string | null;
  };
  
  // Connection actions
  connectSupabase: (credentials: SupabaseCredentials) => Promise<ConnectionTestResult>;
  disconnectSupabase: () => Promise<{ success: boolean; error?: string }>;
  updateSupabaseConnection: (credentials: SupabaseCredentials) => Promise<{ success: boolean; error?: string }>;
  testSupabaseConnection: () => Promise<ConnectionTestResult>;
  refreshSupabaseConnection: () => Promise<void>;
  
  // Build readiness
  isBuildReady: boolean;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export function useProjectContext() {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectContext must be used within a ProjectProvider');
  }
  return context;
}

interface ProjectProviderProps {
  children: ReactNode;
  projectId?: string;
}

export function ProjectProvider({ children, projectId }: ProjectProviderProps) {
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  
  // Use the Supabase connection hook if we have a project ID
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
  
  // Determine if build is ready (project exists and Supabase is connected)
  const isBuildReady = Boolean(
    currentProject && 
    connectionState.isConnected && 
    connectionState.isHealthy
  );
  
  // Load project data when projectId changes
  useEffect(() => {
    if (projectId) {
      // TODO: Load project data from your backend
      // For now, using mock data
      setCurrentProject({
        id: projectId,
        name: 'My Project',
        description: 'A sample project',
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'active'
      });
    } else {
      setCurrentProject(null);
    }
  }, [projectId]);
  
  // Connection actions with fallbacks for when no project is selected
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
  
  const value: ProjectContextType = {
    currentProject,
    setCurrentProject,
    supabaseConnection: {
      isConnected: connectionState.isConnected,
      isConnecting: connectionState.isConnecting,
      isHealthy: connectionState.isHealthy,
      projectUrl: connectionState.projectUrl,
      lastValidated: connectionState.lastValidated,
      connectionStatus: connectionState.connectionStatus,
      error: connectionState.error
    },
    connectSupabase,
    disconnectSupabase,
    updateSupabaseConnection,
    testSupabaseConnection,
    refreshSupabaseConnection,
    isBuildReady
  };
  
  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

// Optional: Export a HOC for wrapping components
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