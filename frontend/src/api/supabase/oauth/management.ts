/**
 * Supabase Management API Integration
 * Handles organization and project management via Supabase Management API
 */

import { supabaseOAuth2ConnectionService } from '@/services/supabaseOAuth2ConnectionService'
import type {
  SupabaseOrganization,
  SupabaseProject,
  CreateSupabaseProjectRequest,
  CreateSupabaseProjectResponse
} from '@/types/supabase-oauth'

export interface GetOrganizationsAPIRequest {
  velocity_project_id: string
}

export interface GetOrganizationsAPIResponse {
  success: boolean
  data?: {
    organizations: SupabaseOrganization[]
    message: string
  }
  error?: {
    code: string
    message: string
  }
}

/**
 * Get user's organizations from Supabase Management API
 */
export async function getUserOrganizations(request: GetOrganizationsAPIRequest): Promise<GetOrganizationsAPIResponse> {
  try {
    if (!request.velocity_project_id?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Velocity project ID is required'
        }
      }
    }

    const organizations = await supabaseOAuth2ConnectionService.getUserOrganizations(request.velocity_project_id)
    
    return {
      success: true,
      data: {
        organizations,
        message: `Retrieved ${organizations.length} organizations`
      }
    }
  } catch (error) {
    console.error('Get organizations error:', error)
    
    let errorCode = 'MANAGEMENT_API_ERROR'
    let errorMessage = 'Failed to retrieve organizations'
    
    if (error instanceof Error) {
      errorMessage = error.message
      
      if (error.message.includes('not authenticated') || error.message.includes('unauthorized')) {
        errorCode = 'UNAUTHORIZED'
      } else if (error.message.includes('connection')) {
        errorCode = 'NO_CONNECTION'
      } else if (error.message.includes('expired')) {
        errorCode = 'TOKEN_EXPIRED'
      } else if (error.message.includes('rate limit')) {
        errorCode = 'RATE_LIMITED'
      }
    }
    
    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage
      }
    }
  }
}

export interface GetProjectsAPIRequest {
  velocity_project_id: string
  organization_id: string
}

export interface GetProjectsAPIResponse {
  success: boolean
  data?: {
    projects: SupabaseProject[]
    message: string
  }
  error?: {
    code: string
    message: string
  }
}

/**
 * Get organization's projects from Supabase Management API
 */
export async function getOrganizationProjects(request: GetProjectsAPIRequest): Promise<GetProjectsAPIResponse> {
  try {
    if (!request.velocity_project_id?.trim() || !request.organization_id?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Velocity project ID and organization ID are required'
        }
      }
    }

    const projects = await supabaseOAuth2ConnectionService.getOrganizationProjects(
      request.velocity_project_id,
      request.organization_id
    )
    
    return {
      success: true,
      data: {
        projects,
        message: `Retrieved ${projects.length} projects for organization`
      }
    }
  } catch (error) {
    console.error('Get projects error:', error)
    
    let errorCode = 'MANAGEMENT_API_ERROR'
    let errorMessage = 'Failed to retrieve organization projects'
    
    if (error instanceof Error) {
      errorMessage = error.message
      
      if (error.message.includes('not authenticated') || error.message.includes('unauthorized')) {
        errorCode = 'UNAUTHORIZED'
      } else if (error.message.includes('connection')) {
        errorCode = 'NO_CONNECTION'
      } else if (error.message.includes('expired')) {
        errorCode = 'TOKEN_EXPIRED'
      } else if (error.message.includes('rate limit')) {
        errorCode = 'RATE_LIMITED'
      } else if (error.message.includes('organization') && error.message.includes('not found')) {
        errorCode = 'ORGANIZATION_NOT_FOUND'
      }
    }
    
    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage
      }
    }
  }
}

export interface CreateProjectAPIRequest {
  velocity_project_id: string
  project_request: CreateSupabaseProjectRequest
}

export interface CreateProjectAPIResponse {
  success: boolean
  data?: {
    project: CreateSupabaseProjectResponse
    message: string
  }
  error?: {
    code: string
    message: string
  }
}

/**
 * Create new Supabase project via Management API
 */
export async function createSupabaseProject(request: CreateProjectAPIRequest): Promise<CreateProjectAPIResponse> {
  try {
    if (!request.velocity_project_id?.trim() || !request.project_request) {
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Velocity project ID and project creation request are required'
        }
      }
    }

    // Validate project creation request
    const { organization_id, name, region, plan, db_pass } = request.project_request
    if (!organization_id?.trim() || !name?.trim() || !region?.trim() || !plan || !db_pass?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Organization ID, name, region, plan, and database password are required'
        }
      }
    }

    // Validate database password strength (basic validation)
    if (db_pass.length < 8) {
      return {
        success: false,
        error: {
          code: 'WEAK_PASSWORD',
          message: 'Database password must be at least 8 characters long'
        }
      }
    }

    const project = await supabaseOAuth2ConnectionService.createSupabaseProject(
      request.velocity_project_id,
      request.project_request
    )
    
    return {
      success: true,
      data: {
        project: project as CreateSupabaseProjectResponse,
        message: `Successfully created Supabase project: ${project.name}`
      }
    }
  } catch (error) {
    console.error('Create project error:', error)
    
    let errorCode = 'PROJECT_CREATION_FAILED'
    let errorMessage = 'Failed to create Supabase project'
    
    if (error instanceof Error) {
      errorMessage = error.message
      
      if (error.message.includes('not authenticated') || error.message.includes('unauthorized')) {
        errorCode = 'UNAUTHORIZED'
      } else if (error.message.includes('connection')) {
        errorCode = 'NO_CONNECTION'
      } else if (error.message.includes('expired')) {
        errorCode = 'TOKEN_EXPIRED'
      } else if (error.message.includes('rate limit')) {
        errorCode = 'RATE_LIMITED'
      } else if (error.message.includes('quota') || error.message.includes('limit')) {
        errorCode = 'QUOTA_EXCEEDED'
      } else if (error.message.includes('name') && error.message.includes('exists')) {
        errorCode = 'PROJECT_NAME_EXISTS'
      } else if (error.message.includes('organization') && error.message.includes('not found')) {
        errorCode = 'ORGANIZATION_NOT_FOUND'
      } else if (error.message.includes('region')) {
        errorCode = 'INVALID_REGION'
      } else if (error.message.includes('plan')) {
        errorCode = 'INVALID_PLAN'
      }
    }
    
    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage
      }
    }
  }
}

export interface ConnectProjectAPIRequest {
  velocity_project_id: string
  supabase_project: SupabaseProject
  organization: SupabaseOrganization
}

export interface ConnectProjectAPIResponse {
  success: boolean
  data?: {
    connection: any // OAuth2ConnectionData
    message: string
  }
  error?: {
    code: string
    message: string
  }
}

/**
 * Connect to an existing Supabase project via OAuth2
 * This would typically be called after user selects a project from the list
 */
export async function connectToSupabaseProject(request: ConnectProjectAPIRequest): Promise<ConnectProjectAPIResponse> {
  try {
    if (!request.velocity_project_id?.trim() || !request.supabase_project || !request.organization) {
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Velocity project ID, Supabase project, and organization are required'
        }
      }
    }

    // This would require implementing the connection logic in the OAuth2 connection service
    // For now, return a placeholder response
    
    return {
      success: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'OAuth2 project connection is not yet fully implemented'
      }
    }
    
    // TODO: Implement actual connection logic
    // const result = await supabaseOAuth2ConnectionService.connectToProject(
    //   request.velocity_project_id,
    //   request.supabase_project,
    //   request.organization
    // )
    
    // return {
    //   success: result.success,
    //   data: result.success ? {
    //     connection: result.connection,
    //     message: `Successfully connected to Supabase project: ${request.supabase_project.name}`
    //   } : undefined,
    //   error: result.success ? undefined : {
    //     code: 'CONNECTION_FAILED',
    //     message: result.error || 'Failed to connect to Supabase project'
    //   }
    // }
  } catch (error) {
    console.error('Connect project error:', error)
    
    return {
      success: false,
      error: {
        code: 'CONNECTION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to connect to Supabase project'
      }
    }
  }
}