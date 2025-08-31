-- Content Security Policy Configuration for Velocity Platform
-- This implements comprehensive CSP headers for XSS protection and enhanced security

-- =====================================================
-- CSP CONFIGURATION TABLE
-- =====================================================

-- Table to store CSP policies and configurations
CREATE TABLE IF NOT EXISTS public.csp_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name text NOT NULL,
  directive_type text NOT NULL CHECK (directive_type IN (
    'default-src', 'script-src', 'style-src', 'img-src', 'connect-src', 
    'font-src', 'object-src', 'media-src', 'frame-src', 'child-src',
    'worker-src', 'manifest-src', 'frame-ancestors', 'form-action',
    'upgrade-insecure-requests', 'block-all-mixed-content'
  )),
  directive_value text NOT NULL,
  environment text NOT NULL DEFAULT 'production' CHECK (environment IN ('development', 'staging', 'production')),
  is_active boolean DEFAULT true,
  description text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  UNIQUE(policy_name, directive_type, environment)
);

-- =====================================================
-- CSP VIOLATION REPORTS TABLE
-- =====================================================

-- Table to store CSP violation reports
CREATE TABLE IF NOT EXISTS public.csp_violation_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_agent text,
  ip_address inet,
  document_uri text NOT NULL,
  referrer text,
  blocked_uri text NOT NULL,
  effective_directive text NOT NULL,
  original_policy text NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('enforce', 'report')),
  status_code integer,
  script_sample text,
  line_number integer,
  column_number integer,
  source_file text,
  violation_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT NOW()
);

-- =====================================================
-- DEFAULT CSP POLICIES
-- =====================================================

-- Insert comprehensive CSP policies for production environment
INSERT INTO public.csp_policies (policy_name, directive_type, directive_value, environment, description) VALUES

-- Production Environment Policies
('velocity_production', 'default-src', '''self''', 'production', 'Allow resources from same origin only'),
('velocity_production', 'script-src', '''self'' ''unsafe-inline'' ''unsafe-eval'' https://cdn.jsdelivr.net https://unpkg.com https://cdn.supabase.co', 'production', 'Allow scripts from trusted CDNs and inline scripts for React Native'),
('velocity_production', 'style-src', '''self'' ''unsafe-inline'' https://fonts.googleapis.com https://cdn.jsdelivr.net', 'production', 'Allow styles from trusted sources and inline styles'),
('velocity_production', 'img-src', '''self'' data: https: blob:', 'production', 'Allow images from any HTTPS source, data URIs, and blob URLs'),
('velocity_production', 'connect-src', '''self'' https://*.supabase.co https://api.openai.com https://api.anthropic.com https://api.github.com https://api.google.com wss://*.supabase.co', 'production', 'Allow connections to API endpoints and WebSocket'),
('velocity_production', 'font-src', '''self'' https://fonts.gstatic.com https://cdn.jsdelivr.net data:', 'production', 'Allow fonts from trusted sources'),
('velocity_production', 'object-src', '''none''', 'production', 'Block all object, embed, and applet elements'),
('velocity_production', 'media-src', '''self'' blob: data:', 'production', 'Allow media from same origin and blob URLs'),
('velocity_production', 'frame-src', '''self'' https://*.fly.dev', 'production', 'Allow frames from Fly.io containers for mobile previews'),
('velocity_production', 'worker-src', '''self'' blob:', 'production', 'Allow workers from same origin and blob URLs'),
('velocity_production', 'manifest-src', '''self''', 'production', 'Allow manifest from same origin'),
('velocity_production', 'frame-ancestors', '''none''', 'production', 'Prevent embedding in frames (clickjacking protection)'),
('velocity_production', 'form-action', '''self''', 'production', 'Allow form submissions to same origin only'),
('velocity_production', 'upgrade-insecure-requests', '', 'production', 'Upgrade HTTP requests to HTTPS'),
('velocity_production', 'block-all-mixed-content', '', 'production', 'Block mixed content'),

-- Development Environment Policies (more permissive)
('velocity_development', 'default-src', '''self''', 'development', 'Allow resources from same origin'),
('velocity_development', 'script-src', '''self'' ''unsafe-inline'' ''unsafe-eval'' localhost:* http://localhost:* https://localhost:* https://cdn.jsdelivr.net https://unpkg.com https://cdn.supabase.co', 'development', 'Allow local development servers and inline scripts'),
('velocity_development', 'style-src', '''self'' ''unsafe-inline'' localhost:* http://localhost:* https://localhost:* https://fonts.googleapis.com', 'development', 'Allow local styles and hot reloading'),
('velocity_development', 'img-src', '''self'' data: https: http: blob:', 'development', 'Allow images from any source in development'),
('velocity_development', 'connect-src', '''self'' localhost:* http://localhost:* https://localhost:* ws://localhost:* wss://localhost:* https://*.supabase.co https://api.openai.com https://api.anthropic.com wss://*.supabase.co', 'development', 'Allow local development connections'),
('velocity_development', 'font-src', '''self'' data: localhost:* http://localhost:* https://localhost:* https://fonts.gstatic.com', 'development', 'Allow local fonts and development servers'),
('velocity_development', 'object-src', '''none''', 'development', 'Block object elements'),
('velocity_development', 'media-src', '''self'' blob: data: localhost:* http://localhost:*', 'development', 'Allow media from local sources'),
('velocity_development', 'frame-src', '''self'' localhost:* http://localhost:* https://localhost:* https://*.fly.dev', 'development', 'Allow local frames and Fly.io containers'),
('velocity_development', 'worker-src', '''self'' blob: localhost:* http://localhost:*', 'development', 'Allow local workers'),
('velocity_development', 'manifest-src', '''self'' localhost:* http://localhost:*', 'development', 'Allow local manifests'),
('velocity_development', 'frame-ancestors', '''self'' localhost:* http://localhost:*', 'development', 'Allow local frame embedding'),
('velocity_development', 'form-action', '''self'' localhost:* http://localhost:*', 'development', 'Allow local form submissions'),

-- Staging Environment Policies (balanced)
('velocity_staging', 'default-src', '''self''', 'staging', 'Allow resources from same origin'),
('velocity_staging', 'script-src', '''self'' ''unsafe-inline'' ''unsafe-eval'' https://staging.velocity-app.dev https://cdn.jsdelivr.net https://unpkg.com https://cdn.supabase.co', 'staging', 'Allow staging domain and trusted CDNs'),
('velocity_staging', 'style-src', '''self'' ''unsafe-inline'' https://staging.velocity-app.dev https://fonts.googleapis.com', 'staging', 'Allow staging styles'),
('velocity_staging', 'img-src', '''self'' data: https: blob:', 'staging', 'Allow HTTPS images and data URIs'),
('velocity_staging', 'connect-src', '''self'' https://staging.velocity-app.dev https://*.supabase.co https://api.openai.com https://api.anthropic.com wss://*.supabase.co', 'staging', 'Allow staging API connections'),
('velocity_staging', 'font-src', '''self'' https://fonts.gstatic.com data:', 'staging', 'Allow trusted font sources'),
('velocity_staging', 'object-src', '''none''', 'staging', 'Block object elements'),
('velocity_staging', 'media-src', '''self'' blob: data:', 'staging', 'Allow media from staging sources'),
('velocity_staging', 'frame-src', '''self'' https://*.fly.dev', 'staging', 'Allow staging frames and Fly.io containers'),
('velocity_staging', 'worker-src', '''self'' blob:', 'staging', 'Allow staging workers'),
('velocity_staging', 'manifest-src', '''self''', 'staging', 'Allow staging manifests'),
('velocity_staging', 'frame-ancestors', '''none''', 'staging', 'Prevent frame embedding'),
('velocity_staging', 'form-action', '''self''', 'staging', 'Allow staging form submissions'),
('velocity_staging', 'upgrade-insecure-requests', '', 'staging', 'Upgrade to HTTPS'),
('velocity_staging', 'block-all-mixed-content', '', 'staging', 'Block mixed content')

ON CONFLICT (policy_name, directive_type, environment) DO UPDATE SET
  directive_value = EXCLUDED.directive_value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- =====================================================
-- CSP FUNCTIONS
-- =====================================================

-- Function to generate CSP header string for specific environment
CREATE OR REPLACE FUNCTION public.generate_csp_header(env_name text DEFAULT 'production')
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  csp_header text := '';
  policy_record record;
BEGIN
  -- Build CSP header from active policies
  FOR policy_record IN
    SELECT directive_type, directive_value
    FROM public.csp_policies
    WHERE environment = env_name AND is_active = true
    ORDER BY directive_type
  LOOP
    IF csp_header != '' THEN
      csp_header := csp_header || '; ';
    END IF;
    
    csp_header := csp_header || policy_record.directive_type;
    
    IF policy_record.directive_value != '' THEN
      csp_header := csp_header || ' ' || policy_record.directive_value;
    END IF;
  END LOOP;
  
  RETURN csp_header;
END;
$$;

-- Function to log CSP violations
CREATE OR REPLACE FUNCTION public.log_csp_violation(
  violation_report jsonb,
  user_agent_string text DEFAULT NULL,
  client_ip inet DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  violation_id uuid;
  current_user_id uuid;
BEGIN
  -- Get current user if authenticated
  current_user_id := auth.uid();
  
  -- Insert violation report
  INSERT INTO public.csp_violation_reports (
    user_id,
    user_agent,
    ip_address,
    document_uri,
    referrer,
    blocked_uri,
    effective_directive,
    original_policy,
    disposition,
    status_code,
    script_sample,
    line_number,
    column_number,
    source_file,
    violation_data
  ) VALUES (
    current_user_id,
    user_agent_string,
    client_ip,
    violation_report->>'document-uri',
    violation_report->>'referrer',
    violation_report->>'blocked-uri',
    violation_report->>'effective-directive',
    violation_report->>'original-policy',
    violation_report->>'disposition',
    (violation_report->>'status-code')::integer,
    violation_report->>'script-sample',
    (violation_report->>'line-number')::integer,
    (violation_report->>'column-number')::integer,
    violation_report->>'source-file',
    violation_report
  ) RETURNING id INTO violation_id;
  
  RETURN violation_id;
END;
$$;

-- Function to get CSP violation statistics
CREATE OR REPLACE FUNCTION public.get_csp_violation_stats(
  days_back integer DEFAULT 7,
  env_name text DEFAULT 'production'
)
RETURNS TABLE (
  directive text,
  violation_count bigint,
  unique_users bigint,
  unique_ips bigint,
  most_common_blocked_uri text,
  first_seen timestamptz,
  last_seen timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cvr.effective_directive,
    COUNT(*)::bigint as violation_count,
    COUNT(DISTINCT cvr.user_id)::bigint as unique_users,
    COUNT(DISTINCT cvr.ip_address)::bigint as unique_ips,
    MODE() WITHIN GROUP (ORDER BY cvr.blocked_uri) as most_common_blocked_uri,
    MIN(cvr.created_at) as first_seen,
    MAX(cvr.created_at) as last_seen
  FROM public.csp_violation_reports cvr
  WHERE cvr.created_at > NOW() - (days_back || ' days')::interval
  GROUP BY cvr.effective_directive
  ORDER BY violation_count DESC;
END;
$$;

-- Function to clean up old violation reports
CREATE OR REPLACE FUNCTION public.cleanup_csp_violation_reports(days_old integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete old violation reports
  DELETE FROM public.csp_violation_reports
  WHERE created_at < NOW() - (days_old || ' days')::interval;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- =====================================================
-- CSP MONITORING VIEWS
-- =====================================================

-- View for recent CSP violations
CREATE OR REPLACE VIEW public.recent_csp_violations AS
SELECT 
  id,
  user_id,
  document_uri,
  blocked_uri,
  effective_directive,
  disposition,
  ip_address,
  user_agent,
  created_at
FROM public.csp_violation_reports
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- View for CSP violation summary by directive
CREATE OR REPLACE VIEW public.csp_violation_summary AS
SELECT 
  effective_directive,
  COUNT(*) as total_violations,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT ip_address) as unique_ips,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as violations_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as violations_7d,
  MAX(created_at) as last_violation
FROM public.csp_violation_reports
GROUP BY effective_directive
ORDER BY total_violations DESC;

-- View for blocked URI analysis
CREATE OR REPLACE VIEW public.csp_blocked_uri_analysis AS
SELECT 
  blocked_uri,
  effective_directive,
  COUNT(*) as violation_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT ip_address) as unique_ips,
  array_agg(DISTINCT document_uri) as affected_pages,
  MIN(created_at) as first_seen,
  MAX(created_at) as last_seen
FROM public.csp_violation_reports
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY blocked_uri, effective_directive
HAVING COUNT(*) > 1
ORDER BY violation_count DESC;

-- =====================================================
-- RLS POLICIES FOR CSP TABLES
-- =====================================================

-- Enable RLS on CSP tables
ALTER TABLE public.csp_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.csp_violation_reports ENABLE ROW LEVEL SECURITY;

-- Service role can manage all CSP data
CREATE POLICY "Service role full access csp_policies" ON public.csp_policies
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access csp_violation_reports" ON public.csp_violation_reports
FOR ALL USING (auth.role() = 'service_role');

-- Admin users can view CSP configuration
CREATE POLICY "Admins can view csp policies" ON public.csp_policies
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() AND subscription_tier = 'enterprise'
  )
);

-- Users can view their own violation reports
CREATE POLICY "Users can view own violations" ON public.csp_violation_reports
FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- TRIGGERS AND AUTOMATION
-- =====================================================

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_csp_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create trigger for timestamp updates
CREATE TRIGGER update_csp_policies_timestamp
  BEFORE UPDATE ON public.csp_policies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_csp_timestamps();

-- Function to detect suspicious CSP violations
CREATE OR REPLACE FUNCTION public.detect_csp_attack_patterns()
RETURNS TABLE (
  alert_type text,
  details jsonb,
  severity text
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- High volume of violations from single IP
  RETURN QUERY
  SELECT 
    'high_violation_rate_ip'::text,
    jsonb_build_object(
      'ip_address', ip_address,
      'violations_per_hour', COUNT(*),
      'unique_directives', COUNT(DISTINCT effective_directive),
      'blocked_uris', array_agg(DISTINCT blocked_uri)
    ),
    'high'::text
  FROM public.csp_violation_reports
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY ip_address
  HAVING COUNT(*) > 50;
  
  -- Suspicious script injection attempts
  RETURN QUERY
  SELECT 
    'script_injection_attempt'::text,
    jsonb_build_object(
      'blocked_uri', blocked_uri,
      'violation_count', COUNT(*),
      'unique_ips', COUNT(DISTINCT ip_address),
      'sample_violations', array_agg(script_sample) FILTER (WHERE script_sample IS NOT NULL)
    ),
    'critical'::text
  FROM public.csp_violation_reports
  WHERE created_at > NOW() - INTERVAL '10 minutes'
    AND effective_directive = 'script-src'
    AND (blocked_uri ~* 'javascript:|data:text/html|vbscript:' OR script_sample IS NOT NULL)
  GROUP BY blocked_uri
  HAVING COUNT(*) > 5;
END;
$$;

-- =====================================================
-- GRANTS AND PERMISSIONS
-- =====================================================

-- Grant access to CSP functions
GRANT EXECUTE ON FUNCTION public.generate_csp_header(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.log_csp_violation(jsonb, text, inet) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_csp_violation_stats(integer, text) TO authenticated;

-- Service role permissions for management functions
GRANT EXECUTE ON FUNCTION public.cleanup_csp_violation_reports(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_csp_attack_patterns() TO service_role;

-- Grant access to views
GRANT SELECT ON public.recent_csp_violations TO authenticated;
GRANT SELECT ON public.csp_violation_summary TO authenticated;
GRANT SELECT ON public.csp_blocked_uri_analysis TO service_role;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Indexes for csp_policies
CREATE INDEX IF NOT EXISTS idx_csp_policies_environment_active ON public.csp_policies(environment, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_csp_policies_policy_name ON public.csp_policies(policy_name);

-- Indexes for csp_violation_reports
CREATE INDEX IF NOT EXISTS idx_csp_violations_user_time ON public.csp_violation_reports(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_csp_violations_ip_time ON public.csp_violation_reports(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_csp_violations_blocked_uri_time ON public.csp_violation_reports(blocked_uri, created_at);
CREATE INDEX IF NOT EXISTS idx_csp_violations_directive_time ON public.csp_violation_reports(effective_directive, created_at);
CREATE INDEX IF NOT EXISTS idx_csp_violations_disposition ON public.csp_violation_reports(disposition, created_at);

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.csp_policies IS 'Content Security Policy configuration by environment';
COMMENT ON TABLE public.csp_violation_reports IS 'CSP violation reports for security monitoring';

COMMENT ON FUNCTION public.generate_csp_header IS 'Generate CSP header string for specific environment';
COMMENT ON FUNCTION public.log_csp_violation IS 'Log CSP violation report for analysis';
COMMENT ON FUNCTION public.get_csp_violation_stats IS 'Get CSP violation statistics for monitoring';
COMMENT ON FUNCTION public.cleanup_csp_violation_reports IS 'Clean up old CSP violation reports';

COMMENT ON VIEW public.recent_csp_violations IS 'Recent CSP violations for immediate attention';
COMMENT ON VIEW public.csp_violation_summary IS 'CSP violation summary by directive type';
COMMENT ON VIEW public.csp_blocked_uri_analysis IS 'Analysis of blocked URIs for security review';