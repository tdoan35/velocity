-- OAuth2 Management API Enhancement Foundation
-- Extending existing OAuth schema with Management API specific fields
-- Based on official Supabase OAuth2 and Management API documentation

-- Extend supabase_connections table for OAuth2 enhancements
ALTER TABLE public.supabase_connections 
ADD COLUMN IF NOT EXISTS connection_method TEXT DEFAULT 'direct' 
  CHECK (connection_method IN ('direct', 'oauth')),
ADD COLUMN IF NOT EXISTS oauth_organization_id TEXT,
ADD COLUMN IF NOT EXISTS oauth_organization_slug TEXT,
ADD COLUMN IF NOT EXISTS oauth_access_token TEXT, -- Encrypted
ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT, -- Encrypted  
ADD COLUMN IF NOT EXISTS oauth_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS oauth_scopes TEXT[],
ADD COLUMN IF NOT EXISTS encrypted_anon_key TEXT, -- For direct connections
ADD COLUMN IF NOT EXISTS encryption_iv VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_validated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS api_quota_remaining INTEGER,
ADD COLUMN IF NOT EXISTS quota_reset_time TIMESTAMP WITH TIME ZONE;

-- Create indexes for new OAuth2 fields
CREATE INDEX IF NOT EXISTS idx_supabase_connections_method 
  ON public.supabase_connections(connection_method);

CREATE INDEX IF NOT EXISTS idx_supabase_connections_oauth_org 
  ON public.supabase_connections(oauth_organization_id) 
  WHERE oauth_organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supabase_connections_oauth_expires 
  ON public.supabase_connections(oauth_expires_at) 
  WHERE oauth_expires_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_supabase_connections_quota_reset 
  ON public.supabase_connections(quota_reset_time) 
  WHERE quota_reset_time IS NOT NULL;

-- Extend oauth_states table for PKCE support
ALTER TABLE public.oauth_states 
ADD COLUMN IF NOT EXISTS code_verifier TEXT,
ADD COLUMN IF NOT EXISTS code_challenge TEXT,
ADD COLUMN IF NOT EXISTS code_challenge_method TEXT DEFAULT 'S256' 
  CHECK (code_challenge_method IN ('S256', 'plain'));

-- Create Management API rate limiting table
CREATE TABLE IF NOT EXISTS public.management_api_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.supabase_connections(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  quota_remaining INTEGER,
  quota_reset_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for rate limiting cleanup
CREATE INDEX IF NOT EXISTS idx_management_api_requests_created_at 
  ON public.management_api_requests(created_at);

CREATE INDEX IF NOT EXISTS idx_management_api_requests_user_id 
  ON public.management_api_requests(user_id);

-- Enable RLS for new table
ALTER TABLE public.management_api_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies for management_api_requests
CREATE POLICY "Users can view their own API requests" 
  ON public.management_api_requests 
  FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own API requests" 
  ON public.management_api_requests 
  FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Function to generate PKCE code verifier and challenge
CREATE OR REPLACE FUNCTION generate_pkce_challenge()
RETURNS TABLE (
  code_verifier TEXT,
  code_challenge TEXT
) AS $$
DECLARE
  v_code_verifier TEXT;
  v_code_challenge TEXT;
BEGIN
  -- Generate a cryptographically random code verifier (43-128 characters)
  v_code_verifier := encode(gen_random_bytes(32), 'base64');
  v_code_verifier := translate(v_code_verifier, '+/=', '-_');
  
  -- Generate SHA256 hash of code verifier for challenge
  v_code_challenge := encode(digest(v_code_verifier, 'sha256'), 'base64');
  v_code_challenge := translate(v_code_challenge, '+/=', '-_');
  
  RETURN QUERY SELECT v_code_verifier, v_code_challenge;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create OAuth2 state with PKCE
CREATE OR REPLACE FUNCTION create_oauth2_state_with_pkce(
  p_user_id UUID,
  p_project_id UUID,
  p_redirect_uri TEXT
)
RETURNS TABLE (
  state_token TEXT,
  code_verifier TEXT,
  code_challenge TEXT
) AS $$
DECLARE
  v_state_token TEXT;
  v_code_verifier TEXT;
  v_code_challenge TEXT;
BEGIN
  -- Generate PKCE challenge
  SELECT * INTO v_code_verifier, v_code_challenge FROM generate_pkce_challenge();
  
  -- Generate cryptographically secure state token
  v_state_token := encode(gen_random_bytes(32), 'hex');
  
  -- Store OAuth state with PKCE parameters
  INSERT INTO public.oauth_states (
    state_token,
    user_id,
    project_id,
    redirect_uri,
    code_verifier,
    code_challenge,
    code_challenge_method
  ) VALUES (
    v_state_token,
    p_user_id,
    p_project_id,
    p_redirect_uri,
    v_code_verifier,
    v_code_challenge,
    'S256'
  );
  
  RETURN QUERY SELECT v_state_token, v_code_verifier, v_code_challenge;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to validate OAuth2 state with PKCE
CREATE OR REPLACE FUNCTION validate_oauth2_state_with_pkce(
  p_state_token TEXT,
  p_user_id UUID
)
RETURNS TABLE (
  is_valid BOOLEAN,
  project_id UUID,
  redirect_uri TEXT,
  code_verifier TEXT
) AS $$
DECLARE
  v_project_id UUID;
  v_redirect_uri TEXT;
  v_code_verifier TEXT;
  v_expires_at TIMESTAMP WITH TIME ZONE;
  v_used BOOLEAN;
  v_state_user_id UUID;
BEGIN
  -- Get state details including PKCE verifier
  SELECT 
    os.project_id,
    os.redirect_uri,
    os.code_verifier,
    os.expires_at,
    os.used,
    os.user_id
  INTO 
    v_project_id,
    v_redirect_uri,
    v_code_verifier,
    v_expires_at,
    v_used,
    v_state_user_id
  FROM public.oauth_states os
  WHERE os.state_token = p_state_token;
  
  -- Check if state exists
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Check if state belongs to the user
  IF v_state_user_id != p_user_id THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Check if state is expired
  IF v_expires_at < NOW() THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Check if state was already used
  IF v_used = TRUE THEN
    RETURN QUERY SELECT FALSE::BOOLEAN, NULL::UUID, NULL::TEXT, NULL::TEXT;
    RETURN;
  END IF;
  
  -- Mark state as used
  UPDATE public.oauth_states 
  SET used = TRUE 
  WHERE state_token = p_state_token;
  
  -- Return valid result with code verifier
  RETURN QUERY SELECT TRUE::BOOLEAN, v_project_id, v_redirect_uri, v_code_verifier;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record Management API request for rate limiting
CREATE OR REPLACE FUNCTION record_management_api_request(
  p_user_id UUID,
  p_connection_id UUID,
  p_endpoint TEXT,
  p_method TEXT,
  p_status_code INTEGER,
  p_response_time_ms INTEGER,
  p_quota_remaining INTEGER,
  p_quota_reset_time TIMESTAMP WITH TIME ZONE
)
RETURNS void AS $$
BEGIN
  INSERT INTO public.management_api_requests (
    user_id,
    connection_id,
    endpoint,
    method,
    status_code,
    response_time_ms,
    quota_remaining,
    quota_reset_time
  ) VALUES (
    p_user_id,
    p_connection_id,
    p_endpoint,
    p_method,
    p_status_code,
    p_response_time_ms,
    p_quota_remaining,
    p_quota_reset_time
  );
  
  -- Update connection quota information
  UPDATE public.supabase_connections
  SET 
    api_quota_remaining = p_quota_remaining,
    quota_reset_time = p_quota_reset_time
  WHERE id = p_connection_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to cleanup old API request records (keep only last 7 days)
CREATE OR REPLACE FUNCTION cleanup_old_api_requests()
RETURNS void AS $$
BEGIN
  DELETE FROM public.management_api_requests 
  WHERE created_at < NOW() - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get user's API rate limit status
CREATE OR REPLACE FUNCTION get_api_rate_limit_status(
  p_user_id UUID,
  p_connection_id UUID
)
RETURNS TABLE (
  requests_in_last_hour INTEGER,
  quota_remaining INTEGER,
  quota_reset_time TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::INTEGER AS requests_in_last_hour,
    sc.api_quota_remaining,
    sc.quota_reset_time
  FROM public.management_api_requests mar
  RIGHT JOIN public.supabase_connections sc ON sc.id = p_connection_id
  WHERE mar.user_id = p_user_id 
    AND mar.connection_id = p_connection_id
    AND mar.created_at > NOW() - INTERVAL '1 hour'
  GROUP BY sc.api_quota_remaining, sc.quota_reset_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for new functions
COMMENT ON FUNCTION generate_pkce_challenge IS 'Generates PKCE code verifier and challenge for OAuth2 PKCE flow';
COMMENT ON FUNCTION create_oauth2_state_with_pkce IS 'Creates OAuth2 state token with PKCE parameters';
COMMENT ON FUNCTION validate_oauth2_state_with_pkce IS 'Validates OAuth2 state token and returns PKCE verifier';
COMMENT ON FUNCTION record_management_api_request IS 'Records Management API request for rate limiting tracking';
COMMENT ON FUNCTION cleanup_old_api_requests IS 'Removes old API request records to maintain performance';
COMMENT ON FUNCTION get_api_rate_limit_status IS 'Gets current API rate limit status for a user connection';
COMMENT ON TABLE public.management_api_requests IS 'Tracks Management API requests for rate limiting and monitoring';