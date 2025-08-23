-- Supabase OAuth Integration Schema
-- This migration adds tables and functions for managing Supabase OAuth connections
-- and project integrations for the Velocity platform

-- Add Supabase integration columns to existing projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS supabase_project_ref TEXT,
ADD COLUMN IF NOT EXISTS supabase_project_url TEXT,
ADD COLUMN IF NOT EXISTS supabase_anon_key TEXT,
ADD COLUMN IF NOT EXISTS supabase_service_role_key TEXT, -- Will be encrypted
ADD COLUMN IF NOT EXISTS backend_status TEXT DEFAULT 'disconnected' 
  CHECK (backend_status IN ('disconnected', 'connecting', 'connected', 'error')),
ADD COLUMN IF NOT EXISTS backend_config JSONB DEFAULT '{}';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_supabase_project_ref 
  ON public.projects(supabase_project_ref) 
  WHERE supabase_project_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_backend_status 
  ON public.projects(backend_status);

-- Create Supabase connections tracking table
CREATE TABLE IF NOT EXISTS public.supabase_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- OAuth tokens (encrypted in application layer)
  supabase_access_token TEXT, -- Encrypted
  supabase_refresh_token TEXT, -- Encrypted
  token_expires_at TIMESTAMP WITH TIME ZONE,
  
  -- Supabase organization and project details
  supabase_org_id TEXT,
  supabase_org_name TEXT,
  supabase_project_id TEXT,
  supabase_project_name TEXT,
  supabase_project_region TEXT,
  
  -- Connection metadata
  connection_status TEXT DEFAULT 'connected' 
    CHECK (connection_status IN ('connected', 'disconnected', 'expired', 'error')),
  error_message TEXT,
  last_refreshed_at TIMESTAMP WITH TIME ZONE,
  
  -- Audit fields
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure one connection per user-project pair
  UNIQUE(user_id, project_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_supabase_connections_user_id 
  ON public.supabase_connections(user_id);

CREATE INDEX IF NOT EXISTS idx_supabase_connections_project_id 
  ON public.supabase_connections(project_id);

CREATE INDEX IF NOT EXISTS idx_supabase_connections_status 
  ON public.supabase_connections(connection_status);

CREATE INDEX IF NOT EXISTS idx_supabase_connections_expires 
  ON public.supabase_connections(token_expires_at) 
  WHERE token_expires_at IS NOT NULL;

-- Enable Row Level Security (RLS)
ALTER TABLE public.supabase_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for supabase_connections
-- Users can only manage their own Supabase connections
CREATE POLICY "Users can view their own Supabase connections" 
  ON public.supabase_connections 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own Supabase connections" 
  ON public.supabase_connections 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own Supabase connections" 
  ON public.supabase_connections 
  FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own Supabase connections" 
  ON public.supabase_connections 
  FOR DELETE 
  USING (auth.uid() = user_id);

-- OAuth state tracking table for CSRF prevention
CREATE TABLE IF NOT EXISTS public.oauth_states (
  state_token TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  redirect_uri TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '10 minutes'),
  used BOOLEAN DEFAULT FALSE
);

-- Create index for cleanup of expired states
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires 
  ON public.oauth_states(expires_at) 
  WHERE used = FALSE;

-- Enable RLS for oauth_states
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

-- RLS Policies for oauth_states
CREATE POLICY "Users can view their own OAuth states" 
  ON public.oauth_states 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own OAuth states" 
  ON public.oauth_states 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own OAuth states" 
  ON public.oauth_states 
  FOR UPDATE 
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to clean up expired OAuth states
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_states()
RETURNS void AS $$
BEGIN
  DELETE FROM public.oauth_states 
  WHERE expires_at < NOW() AND used = FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at on supabase_connections
DROP TRIGGER IF EXISTS update_supabase_connections_updated_at ON public.supabase_connections;
CREATE TRIGGER update_supabase_connections_updated_at
  BEFORE UPDATE ON public.supabase_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Function to validate and mark OAuth state as used
CREATE OR REPLACE FUNCTION validate_oauth_state(
  p_state_token TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  is_valid BOOLEAN,
  project_id UUID,
  redirect_uri TEXT
) AS $$
DECLARE
  v_project_id UUID;
  v_redirect_uri TEXT;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_used BOOLEAN;
  v_state_user_id UUID;
BEGIN
  -- Get state details
  SELECT 
    os.project_id,
    os.redirect_uri,
    os.expires_at,
    os.used,
    os.user_id
  INTO 
    v_project_id,
    v_redirect_uri,
    v_expires_at,
    v_used,
    v_state_user_id
  FROM public.oauth_states os
  WHERE os.state_token = p_state_token;
  
  -- Check if state exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Check if state belongs to the user
  IF v_state_user_id != p_user_id THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Check if state is expired
  IF v_expires_at < NOW() THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Check if state was already used
  IF v_used = TRUE THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Mark state as used
  UPDATE public.oauth_states 
  SET used = TRUE 
  WHERE state_token = p_state_token;
  
  -- Return valid result
  RETURN QUERY SELECT TRUE::BOOLEAN, v_project_id, v_redirect_uri;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get Supabase connection status for a project
CREATE OR REPLACE FUNCTION get_supabase_connection_status(
  p_project_id UUID,
  p_user_id UUID
)
RETURNS TABLE (
  is_connected BOOLEAN,
  connection_status TEXT,
  supabase_project_ref TEXT,
  supabase_project_url TEXT,
  needs_refresh BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    CASE 
      WHEN sc.connection_status = 'connected' AND p.supabase_project_ref IS NOT NULL 
      THEN TRUE 
      ELSE FALSE 
    END AS is_connected,
    COALESCE(sc.connection_status, 'disconnected') AS connection_status,
    p.supabase_project_ref,
    p.supabase_project_url,
    CASE 
      WHEN sc.token_expires_at IS NOT NULL AND sc.token_expires_at < NOW() + INTERVAL '5 minutes'
      THEN TRUE
      ELSE FALSE
    END AS needs_refresh
  FROM public.projects p
  LEFT JOIN public.supabase_connections sc 
    ON sc.project_id = p.id AND sc.user_id = p_user_id
  WHERE p.id = p_project_id 
    AND p.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment documentation
COMMENT ON TABLE public.supabase_connections IS 'Stores Supabase OAuth connection details for projects';
COMMENT ON TABLE public.oauth_states IS 'Temporary storage for OAuth state tokens to prevent CSRF attacks';
COMMENT ON FUNCTION validate_oauth_state IS 'Validates an OAuth state token and marks it as used';
COMMENT ON FUNCTION get_supabase_connection_status IS 'Gets the current Supabase connection status for a project';
COMMENT ON FUNCTION cleanup_expired_oauth_states IS 'Removes expired OAuth state tokens from the database';