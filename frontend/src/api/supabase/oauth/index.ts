/**
 * OAuth2 API Exports
 * Central export point for all OAuth2 API functions
 */

// OAuth2 Flow Management
export {
  initiateOAuth2Flow,
  checkOAuth2Availability,
  type OAuth2InitiateAPIRequest,
  type OAuth2InitiateAPIResponse
} from './initiate'

export {
  handleOAuth2Callback,
  refreshOAuth2Token,
  type OAuth2CallbackAPIRequest,
  type OAuth2CallbackAPIResponse,
  type RefreshTokenAPIRequest,
  type RefreshTokenAPIResponse
} from './callback'

// Management API Integration
export {
  getUserOrganizations,
  getOrganizationProjects,
  createSupabaseProject,
  connectToSupabaseProject,
  type GetOrganizationsAPIRequest,
  type GetOrganizationsAPIResponse,
  type GetProjectsAPIRequest,
  type GetProjectsAPIResponse,
  type CreateProjectAPIRequest,
  type CreateProjectAPIResponse,
  type ConnectProjectAPIRequest,
  type ConnectProjectAPIResponse
} from './management'

// Re-export service types for convenience
export type {
  SupabaseOrganization,
  SupabaseProject,
  CreateSupabaseProjectRequest,
  CreateSupabaseProjectResponse,
  OAuthTokens,
  SupabaseOAuthError
} from '@/types/supabase-oauth'