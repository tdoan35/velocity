// Supabase OAuth Integration Types
// These types correspond to the database schema created in migration 20250122000001

export interface SupabaseConnection {
  id: string;
  user_id: string;
  project_id: string;
  
  // OAuth tokens (will be encrypted)
  supabase_access_token?: string;
  supabase_refresh_token?: string;
  token_expires_at?: string; // ISO date string
  
  // Supabase organization and project details
  supabase_org_id?: string;
  supabase_org_name?: string;
  supabase_project_id?: string;
  supabase_project_name?: string;
  supabase_project_region?: string;
  
  // Connection metadata
  connection_status: 'connected' | 'disconnected' | 'expired' | 'error';
  error_message?: string;
  last_refreshed_at?: string; // ISO date string
  
  // Audit fields
  created_at: string; // ISO date string
  updated_at: string; // ISO date string
}

export interface OAuthState {
  state_token: string;
  user_id: string;
  project_id: string;
  redirect_uri: string;
  created_at: string; // ISO date string
  expires_at: string; // ISO date string
  used: boolean;
}

export interface ProjectSupabaseConfig {
  supabase_project_ref?: string;
  supabase_project_url?: string;
  supabase_anon_key?: string;
  supabase_service_role_key?: string; // Encrypted
  backend_status: 'disconnected' | 'connecting' | 'connected' | 'error';
  backend_config: Record<string, any>;
  // OAuth specific
  connection_id?: string; // Reference to supabase_connections table
  connected_at?: string; // ISO date string
  connected_by?: string; // User who connected
}

export interface SupabaseConnectionStatus {
  is_connected: boolean;
  connection_status: string;
  supabase_project_ref?: string;
  supabase_project_url?: string;
  needs_refresh: boolean;
}

// OAuth flow types
export interface OAuthInitiateRequest {
  project_id: string;
  redirect_uri?: string;
}

export interface OAuthInitiateResponse {
  auth_url: string;
  state: string;
}

export interface OAuthCallbackRequest {
  code: string;
  state: string;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

// Supabase Management API types
export interface SupabaseOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface SupabaseProject {
  id: string;
  organization_id: string;
  name: string;
  region: string;
  created_at: string;
  database: {
    host: string;
    version: string;
  };
  ref: string;
  status: 'ACTIVE_HEALTHY' | 'COMING_UP' | 'INACTIVE' | 'INIT_FAILED' | 'REMOVED' | 'RESTORING' | 'UPGRADING';
  service_api_keys: Array<{
    name: string;
    api_key: string;
  }>;
}

export interface CreateSupabaseProjectRequest {
  organization_id: string;
  name: string;
  region: string;
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  db_pass: string;
  kps_enabled?: boolean;
}

export interface CreateSupabaseProjectResponse extends SupabaseProject {
  api_url: string;
  anon_key: string;
  service_role_key: string;
}

// Error types
export interface SupabaseOAuthError {
  code: 'OAUTH_ERROR' | 'TOKEN_EXPIRED' | 'PROJECT_CREATION_FAILED' | 'NETWORK_ERROR' | 'UNKNOWN_ERROR';
  message: string;
  details?: any;
}