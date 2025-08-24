/**
 * OAuth2 Flow Hook
 * Manages OAuth2 authorization flow state and operations
 */

import { useState, useCallback } from 'react'
import {
  initiateOAuth2Flow,
  handleOAuth2Callback,
  getUserOrganizations,
  getOrganizationProjects,
  createSupabaseProject,
  checkOAuth2Availability,
  type OAuth2InitiateAPIResponse,
  type OAuth2CallbackAPIResponse,
  type GetOrganizationsAPIResponse,
  type GetProjectsAPIResponse,
  type CreateProjectAPIResponse,
  type SupabaseOrganization,
  type SupabaseProject,
  type CreateSupabaseProjectRequest
} from '@/api/supabase/oauth'

export interface OAuth2FlowState {
  // Flow state
  isInitiating: boolean
  isProcessingCallback: boolean
  isAuthorized: boolean
  
  // Data loading states
  isLoadingOrganizations: boolean
  isLoadingProjects: boolean
  isCreatingProject: boolean
  
  // Data
  organizations: SupabaseOrganization[]
  projects: SupabaseProject[]
  selectedOrganization: SupabaseOrganization | null
  
  // Error handling
  error: string | null
  
  // OAuth2 flow data
  authUrl: string | null
  state: string | null
}

export interface UseOAuth2FlowReturn {
  flowState: OAuth2FlowState
  
  // Flow management
  initiate: (velocityProjectId: string, redirectUri?: string) => Promise<{ success: boolean; authUrl?: string; error?: string }>
  processCallback: (code: string, state: string) => Promise<{ success: boolean; error?: string }>
  reset: () => void
  
  // Data operations
  loadOrganizations: (velocityProjectId: string) => Promise<{ success: boolean; organizations?: SupabaseOrganization[]; error?: string }>
  loadProjects: (velocityProjectId: string, organizationId: string) => Promise<{ success: boolean; projects?: SupabaseProject[]; error?: string }>
  createProject: (velocityProjectId: string, request: CreateSupabaseProjectRequest) => Promise<{ success: boolean; project?: SupabaseProject; error?: string }>
  
  // Selection management
  selectOrganization: (organization: SupabaseOrganization) => void
  clearSelection: () => void
  
  // Utility
  isOAuth2Available: boolean
}

export function useOAuth2Flow(): UseOAuth2FlowReturn {
  const [flowState, setFlowState] = useState<OAuth2FlowState>({
    isInitiating: false,
    isProcessingCallback: false,
    isAuthorized: false,
    isLoadingOrganizations: false,
    isLoadingProjects: false,
    isCreatingProject: false,
    organizations: [],
    projects: [],
    selectedOrganization: null,
    error: null,
    authUrl: null,
    state: null
  })

  // Check OAuth2 availability
  const oauth2Check = checkOAuth2Availability()
  const isOAuth2Available = oauth2Check.available

  // Clear error
  const clearError = useCallback(() => {
    setFlowState(prev => ({ ...prev, error: null }))
  }, [])

  // Initiate OAuth2 flow
  const initiate = useCallback(async (
    velocityProjectId: string,
    redirectUri?: string
  ): Promise<{ success: boolean; authUrl?: string; error?: string }> => {
    if (!isOAuth2Available) {
      const error = oauth2Check.reason || 'OAuth2 is not available'
      setFlowState(prev => ({ ...prev, error }))
      return { success: false, error }
    }

    try {
      setFlowState(prev => ({ ...prev, isInitiating: true, error: null }))

      const response = await initiateOAuth2Flow({
        project_id: velocityProjectId,
        redirect_uri: redirectUri
      })

      if (response.success && response.data) {
        setFlowState(prev => ({
          ...prev,
          isInitiating: false,
          authUrl: response.data!.auth_url,
          state: response.data!.state,
          error: null
        }))

        return {
          success: true,
          authUrl: response.data.auth_url
        }
      } else {
        const error = response.error?.message || 'Failed to initiate OAuth2 flow'
        setFlowState(prev => ({
          ...prev,
          isInitiating: false,
          error
        }))

        return { success: false, error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'OAuth2 initiation failed'
      setFlowState(prev => ({
        ...prev,
        isInitiating: false,
        error: errorMessage
      }))

      return { success: false, error: errorMessage }
    }
  }, [isOAuth2Available, oauth2Check])

  // Process OAuth2 callback
  const processCallback = useCallback(async (
    code: string,
    state: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setFlowState(prev => ({ ...prev, isProcessingCallback: true, error: null }))

      const response = await handleOAuth2Callback({ code, state })

      if (response.success) {
        setFlowState(prev => ({
          ...prev,
          isProcessingCallback: false,
          isAuthorized: true,
          error: null
        }))

        return { success: true }
      } else {
        const error = response.error?.message || 'OAuth2 callback failed'
        setFlowState(prev => ({
          ...prev,
          isProcessingCallback: false,
          error
        }))

        return { success: false, error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'OAuth2 callback processing failed'
      setFlowState(prev => ({
        ...prev,
        isProcessingCallback: false,
        error: errorMessage
      }))

      return { success: false, error: errorMessage }
    }
  }, [])

  // Load user organizations
  const loadOrganizations = useCallback(async (
    velocityProjectId: string
  ): Promise<{ success: boolean; organizations?: SupabaseOrganization[]; error?: string }> => {
    try {
      setFlowState(prev => ({ ...prev, isLoadingOrganizations: true, error: null }))

      const response = await getUserOrganizations({ velocity_project_id: velocityProjectId })

      if (response.success && response.data) {
        const organizations = response.data.organizations
        setFlowState(prev => ({
          ...prev,
          isLoadingOrganizations: false,
          organizations,
          error: null
        }))

        return { success: true, organizations }
      } else {
        const error = response.error?.message || 'Failed to load organizations'
        setFlowState(prev => ({
          ...prev,
          isLoadingOrganizations: false,
          error
        }))

        return { success: false, error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load organizations'
      setFlowState(prev => ({
        ...prev,
        isLoadingOrganizations: false,
        error: errorMessage
      }))

      return { success: false, error: errorMessage }
    }
  }, [])

  // Load organization projects
  const loadProjects = useCallback(async (
    velocityProjectId: string,
    organizationId: string
  ): Promise<{ success: boolean; projects?: SupabaseProject[]; error?: string }> => {
    try {
      setFlowState(prev => ({ ...prev, isLoadingProjects: true, error: null }))

      const response = await getOrganizationProjects({
        velocity_project_id: velocityProjectId,
        organization_id: organizationId
      })

      if (response.success && response.data) {
        const projects = response.data.projects
        setFlowState(prev => ({
          ...prev,
          isLoadingProjects: false,
          projects,
          error: null
        }))

        return { success: true, projects }
      } else {
        const error = response.error?.message || 'Failed to load projects'
        setFlowState(prev => ({
          ...prev,
          isLoadingProjects: false,
          error
        }))

        return { success: false, error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load projects'
      setFlowState(prev => ({
        ...prev,
        isLoadingProjects: false,
        error: errorMessage
      }))

      return { success: false, error: errorMessage }
    }
  }, [])

  // Create new Supabase project
  const createProject = useCallback(async (
    velocityProjectId: string,
    request: CreateSupabaseProjectRequest
  ): Promise<{ success: boolean; project?: SupabaseProject; error?: string }> => {
    try {
      setFlowState(prev => ({ ...prev, isCreatingProject: true, error: null }))

      const response = await createSupabaseProject({
        velocity_project_id: velocityProjectId,
        project_request: request
      })

      if (response.success && response.data) {
        const project = response.data.project as SupabaseProject
        
        // Add the created project to the projects list if it's in the selected organization
        setFlowState(prev => ({
          ...prev,
          isCreatingProject: false,
          projects: prev.selectedOrganization?.id === request.organization_id
            ? [...prev.projects, project]
            : prev.projects,
          error: null
        }))

        return { success: true, project }
      } else {
        const error = response.error?.message || 'Failed to create project'
        setFlowState(prev => ({
          ...prev,
          isCreatingProject: false,
          error
        }))

        return { success: false, error }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project'
      setFlowState(prev => ({
        ...prev,
        isCreatingProject: false,
        error: errorMessage
      }))

      return { success: false, error: errorMessage }
    }
  }, [])

  // Select organization
  const selectOrganization = useCallback((organization: SupabaseOrganization) => {
    setFlowState(prev => ({
      ...prev,
      selectedOrganization: organization,
      projects: [], // Clear projects when changing organization
      error: null
    }))
  }, [])

  // Clear selection
  const clearSelection = useCallback(() => {
    setFlowState(prev => ({
      ...prev,
      selectedOrganization: null,
      projects: [],
      error: null
    }))
  }, [])

  // Reset entire flow state
  const reset = useCallback(() => {
    setFlowState({
      isInitiating: false,
      isProcessingCallback: false,
      isAuthorized: false,
      isLoadingOrganizations: false,
      isLoadingProjects: false,
      isCreatingProject: false,
      organizations: [],
      projects: [],
      selectedOrganization: null,
      error: null,
      authUrl: null,
      state: null
    })
  }, [])

  return {
    flowState,
    
    // Flow management
    initiate,
    processCallback,
    reset,
    
    // Data operations
    loadOrganizations,
    loadProjects,
    createProject,
    
    // Selection management
    selectOrganization,
    clearSelection,
    
    // Utility
    isOAuth2Available
  }
}