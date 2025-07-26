-- Comprehensive Security Testing Framework for Velocity Platform
-- This implements security testing, monitoring, and protection mechanisms

-- =====================================================
-- SECURITY CONFIGURATION TABLE
-- =====================================================

-- Table to store security configurations and policies
CREATE TABLE IF NOT EXISTS public.security_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key text UNIQUE NOT NULL,
  config_value jsonb NOT NULL,
  config_type text NOT NULL CHECK (config_type IN (
    'brute_force_protection', 'account_lockout', 'session_security',
    'password_policy', 'csrf_protection', 'security_headers',
    'vulnerability_scanning', 'monitoring_rules'
  )),
  is_active boolean DEFAULT true,
  description text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- =====================================================
-- SECURITY INCIDENTS AND ALERTS
-- =====================================================

-- Table to log security incidents and threats
CREATE TABLE IF NOT EXISTS public.security_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type text NOT NULL CHECK (incident_type IN (
    'sql_injection_attempt', 'xss_attempt', 'brute_force_attack',
    'csrf_attack', 'privilege_escalation', 'data_breach_attempt',
    'suspicious_activity', 'account_takeover', 'ddos_attack'
  )),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  title text NOT NULL,
  description text NOT NULL,
  attack_vector text,
  source_ip inet,
  user_agent text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_headers jsonb DEFAULT '{}'::jsonb,
  request_payload jsonb DEFAULT '{}'::jsonb,
  detection_method text,
  is_blocked boolean DEFAULT false,
  response_action text,
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT NOW()
);

-- Table for brute force protection tracking
CREATE TABLE IF NOT EXISTS public.brute_force_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL,
  email text,
  attempt_type text NOT NULL CHECK (attempt_type IN ('login', 'signup', 'password_reset')),
  failed_attempts integer DEFAULT 1,
  is_blocked boolean DEFAULT false,
  blocked_until timestamptz,
  first_attempt timestamptz DEFAULT NOW(),
  last_attempt timestamptz DEFAULT NOW(),
  user_agent text,
  
  UNIQUE(ip_address, email, attempt_type)
);

-- Table for account lockout tracking
CREATE TABLE IF NOT EXISTS public.account_lockouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lockout_reason text NOT NULL,
  locked_until timestamptz NOT NULL,
  attempt_count integer DEFAULT 0,
  is_permanent boolean DEFAULT false,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  unlock_token text,
  created_at timestamptz DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- =====================================================
-- DEFAULT SECURITY CONFIGURATIONS
-- =====================================================

-- Insert default security configurations
INSERT INTO public.security_config (config_key, config_value, config_type, description) VALUES

-- Brute force protection settings
('brute_force_login_threshold', '{"max_attempts": 5, "window_minutes": 15, "lockout_minutes": 30}', 'brute_force_protection',
 'Maximum login attempts before temporary lockout'),

('brute_force_signup_threshold', '{"max_attempts": 3, "window_minutes": 60, "lockout_minutes": 120}', 'brute_force_protection',
 'Maximum signup attempts from same IP before lockout'),

('brute_force_password_reset_threshold', '{"max_attempts": 3, "window_minutes": 30, "lockout_minutes": 60}', 'brute_force_protection',
 'Maximum password reset attempts before lockout'),

-- Account lockout policies
('account_lockout_policy', '{"max_failed_logins": 10, "lockout_duration_minutes": 60, "escalation_factor": 2}', 'account_lockout',
 'Account lockout policy for repeated failed authentication'),

-- Session security settings
('session_security', '{"max_concurrent_sessions": 5, "idle_timeout_minutes": 60, "absolute_timeout_hours": 24}', 'session_security',
 'Session management and timeout policies'),

-- Password policy requirements
('password_policy', '{"min_length": 12, "require_uppercase": true, "require_lowercase": true, "require_numbers": true, "require_symbols": true, "prevent_common": true}', 'password_policy',
 'Password complexity and security requirements'),

-- CSRF protection settings
('csrf_protection', '{"token_lifetime_minutes": 60, "strict_referer_check": true, "samesite_cookies": "strict"}', 'csrf_protection',
 'Cross-Site Request Forgery protection configuration'),

-- Security headers configuration
('security_headers', '{"hsts_max_age": 31536000, "content_type_nosniff": true, "frame_options": "DENY", "xss_protection": "1; mode=block"}', 'security_headers',
 'HTTP security headers configuration'),

-- Vulnerability scanning rules
('vulnerability_scan_rules', '{"sql_injection_patterns": ["UNION", "SELECT.*FROM", "DROP TABLE", "INSERT INTO", "UPDATE.*SET"], "xss_patterns": ["<script", "javascript:", "onload=", "onerror="]}', 'vulnerability_scanning',
 'Patterns to detect common vulnerability attempts'),

-- Security monitoring rules
('monitoring_rules', '{"failed_login_threshold": 20, "suspicious_ip_threshold": 100, "privilege_escalation_patterns": ["admin", "root", "service_role"]}', 'monitoring_rules',
 'Security monitoring and alerting thresholds')

ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = NOW();

-- =====================================================
-- SECURITY TESTING FUNCTIONS
-- =====================================================

-- Function to test SQL injection vulnerability
CREATE OR REPLACE FUNCTION public.test_sql_injection_protection(
  test_input text,
  test_context text DEFAULT 'general'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_vulnerable boolean := false;
  detected_patterns text[] := ARRAY[]::text[];
  sql_patterns text[];
  pattern text;
  test_result jsonb;
BEGIN
  -- Get SQL injection patterns from config
  SELECT (config_value->>'sql_injection_patterns')::text[] INTO sql_patterns
  FROM public.security_config
  WHERE config_key = 'vulnerability_scan_rules';
  
  -- Test for SQL injection patterns
  FOREACH pattern IN ARRAY sql_patterns LOOP
    IF test_input ~* pattern THEN
      is_vulnerable := true;
      detected_patterns := array_append(detected_patterns, pattern);
    END IF;
  END LOOP;
  
  -- Log potential SQL injection attempt
  IF is_vulnerable THEN
    INSERT INTO public.security_incidents (
      incident_type,
      severity,
      title,
      description,
      attack_vector,
      detection_method
    ) VALUES (
      'sql_injection_attempt',
      'high',
      'SQL Injection Attempt Detected',
      format('Potential SQL injection detected in %s context', test_context),
      test_input,
      'automated_testing'
    );
  END IF;
  
  -- Return test results
  test_result := jsonb_build_object(
    'is_vulnerable', is_vulnerable,
    'detected_patterns', to_jsonb(detected_patterns),
    'test_input', test_input,
    'test_context', test_context,
    'timestamp', NOW()
  );
  
  RETURN test_result;
END;
$$;

-- Function to test XSS vulnerability
CREATE OR REPLACE FUNCTION public.test_xss_protection(
  test_input text,
  test_context text DEFAULT 'general'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  is_vulnerable boolean := false;
  detected_patterns text[] := ARRAY[]::text[];
  xss_patterns text[];
  pattern text;
  test_result jsonb;
BEGIN
  -- Get XSS patterns from config
  SELECT (config_value->>'xss_patterns')::text[] INTO xss_patterns
  FROM public.security_config
  WHERE config_key = 'vulnerability_scan_rules';
  
  -- Test for XSS patterns
  FOREACH pattern IN ARRAY xss_patterns LOOP
    IF test_input ~* pattern THEN
      is_vulnerable := true;
      detected_patterns := array_append(detected_patterns, pattern);
    END IF;
  END LOOP;
  
  -- Log potential XSS attempt
  IF is_vulnerable THEN
    INSERT INTO public.security_incidents (
      incident_type,
      severity,
      title,
      description,
      attack_vector,
      detection_method
    ) VALUES (
      'xss_attempt',
      'high',
      'XSS Attempt Detected',
      format('Potential XSS attack detected in %s context', test_context),
      test_input,
      'automated_testing'
    );
  END IF;
  
  test_result := jsonb_build_object(
    'is_vulnerable', is_vulnerable,
    'detected_patterns', to_jsonb(detected_patterns),
    'test_input', test_input,
    'test_context', test_context,
    'timestamp', NOW()
  );
  
  RETURN test_result;
END;
$$;

-- Function to check brute force protection
CREATE OR REPLACE FUNCTION public.check_brute_force_protection(
  client_ip inet,
  email_param text DEFAULT NULL,
  attempt_type_param text DEFAULT 'login'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  config_data jsonb;
  max_attempts integer;
  window_minutes integer;
  lockout_minutes integer;
  current_attempts integer;
  is_blocked boolean := false;
  blocked_until_time timestamptz;
  result jsonb;
BEGIN
  -- Get brute force configuration
  SELECT config_value INTO config_data
  FROM public.security_config
  WHERE config_key = format('brute_force_%s_threshold', attempt_type_param);
  
  IF config_data IS NULL THEN
    config_data := '{"max_attempts": 5, "window_minutes": 15, "lockout_minutes": 30}'::jsonb;
  END IF;
  
  max_attempts := (config_data->>'max_attempts')::integer;
  window_minutes := (config_data->>'window_minutes')::integer;
  lockout_minutes := (config_data->>'lockout_minutes')::integer;
  
  -- Check current attempts
  SELECT 
    failed_attempts,
    blocked_until > NOW() as is_currently_blocked,
    blocked_until
  INTO current_attempts, is_blocked, blocked_until_time
  FROM public.brute_force_attempts
  WHERE ip_address = client_ip
    AND email = COALESCE(email_param, email)
    AND attempt_type = attempt_type_param
    AND last_attempt > NOW() - (window_minutes || ' minutes')::interval;
  
  current_attempts := COALESCE(current_attempts, 0);
  
  -- Update or insert attempt record
  INSERT INTO public.brute_force_attempts (
    ip_address, email, attempt_type, failed_attempts,
    is_blocked, blocked_until, last_attempt
  ) VALUES (
    client_ip, email_param, attempt_type_param, 1,
    current_attempts >= max_attempts,
    CASE WHEN current_attempts >= max_attempts 
         THEN NOW() + (lockout_minutes || ' minutes')::interval 
         ELSE NULL END,
    NOW()
  )
  ON CONFLICT (ip_address, email, attempt_type) DO UPDATE SET
    failed_attempts = brute_force_attempts.failed_attempts + 1,
    is_blocked = brute_force_attempts.failed_attempts + 1 >= max_attempts,
    blocked_until = CASE WHEN brute_force_attempts.failed_attempts + 1 >= max_attempts 
                        THEN NOW() + (lockout_minutes || ' minutes')::interval 
                        ELSE brute_force_attempts.blocked_until END,
    last_attempt = NOW();
  
  result := jsonb_build_object(
    'is_blocked', is_blocked OR (current_attempts >= max_attempts),
    'attempts_remaining', GREATEST(0, max_attempts - current_attempts - 1),
    'blocked_until', blocked_until_time,
    'current_attempts', current_attempts + 1,
    'max_attempts', max_attempts
  );
  
  RETURN result;
END;
$$;

-- Function to test privilege escalation
CREATE OR REPLACE FUNCTION public.test_privilege_escalation(
  user_uuid uuid,
  requested_action text,
  target_resource text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  user_role text;
  is_suspicious boolean := false;
  escalation_patterns text[];
  pattern text;
  test_result jsonb;
BEGIN
  -- Get user's current role/tier
  SELECT subscription_tier INTO user_role
  FROM public.user_profiles
  WHERE id = user_uuid;
  
  -- Get privilege escalation patterns
  SELECT (config_value->>'privilege_escalation_patterns')::text[] INTO escalation_patterns
  FROM public.security_config
  WHERE config_key = 'monitoring_rules';
  
  -- Check for suspicious privilege escalation patterns
  FOREACH pattern IN ARRAY escalation_patterns LOOP
    IF requested_action ~* pattern OR target_resource ~* pattern THEN
      is_suspicious := true;
      EXIT;
    END IF;
  END LOOP;
  
  -- Log suspicious privilege escalation attempt
  IF is_suspicious THEN
    INSERT INTO public.security_incidents (
      incident_type,
      severity,
      title,
      description,
      user_id,
      detection_method
    ) VALUES (
      'privilege_escalation',
      'high',
      'Privilege Escalation Attempt',
      format('User attempted suspicious action: %s on resource: %s', requested_action, target_resource),
      user_uuid,
      'automated_testing'
    );
  END IF;
  
  test_result := jsonb_build_object(
    'is_suspicious', is_suspicious,
    'user_role', user_role,
    'requested_action', requested_action,
    'target_resource', target_resource,
    'timestamp', NOW()
  );
  
  RETURN test_result;
END;
$$;

-- =====================================================
-- SECURITY MONITORING FUNCTIONS
-- =====================================================

-- Function to generate security report
CREATE OR REPLACE FUNCTION public.generate_security_report(
  days_back integer DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  report jsonb;
  incident_stats jsonb;
  brute_force_stats jsonb;
  lockout_stats jsonb;
BEGIN
  -- Get incident statistics
  SELECT jsonb_object_agg(incident_type, incident_count) INTO incident_stats
  FROM (
    SELECT 
      incident_type,
      COUNT(*) as incident_count
    FROM public.security_incidents
    WHERE created_at > NOW() - (days_back || ' days')::interval
    GROUP BY incident_type
  ) sub;
  
  -- Get brute force statistics
  SELECT jsonb_build_object(
    'total_attempts', COUNT(*),
    'blocked_ips', COUNT(*) FILTER (WHERE is_blocked = true),
    'unique_ips', COUNT(DISTINCT ip_address),
    'most_targeted_emails', (
      SELECT array_agg(email ORDER BY attempt_count DESC)
      FROM (
        SELECT email, COUNT(*) as attempt_count
        FROM public.brute_force_attempts
        WHERE last_attempt > NOW() - (days_back || ' days')::interval
          AND email IS NOT NULL
        GROUP BY email
        LIMIT 5
      ) top_emails
    )
  ) INTO brute_force_stats
  FROM public.brute_force_attempts
  WHERE last_attempt > NOW() - (days_back || ' days')::interval;
  
  -- Get account lockout statistics
  SELECT jsonb_build_object(
    'total_lockouts', COUNT(*),
    'active_lockouts', COUNT(*) FILTER (WHERE locked_until > NOW()),
    'permanent_lockouts', COUNT(*) FILTER (WHERE is_permanent = true)
  ) INTO lockout_stats
  FROM public.account_lockouts
  WHERE created_at > NOW() - (days_back || ' days')::interval;
  
  -- Compile full report
  report := jsonb_build_object(
    'report_period_days', days_back,
    'generated_at', NOW(),
    'incident_statistics', COALESCE(incident_stats, '{}'::jsonb),
    'brute_force_statistics', COALESCE(brute_force_stats, '{}'::jsonb),
    'lockout_statistics', COALESCE(lockout_stats, '{}'::jsonb),
    'security_score', public.calculate_security_score()
  );
  
  RETURN report;
END;
$$;

-- Function to calculate security score
CREATE OR REPLACE FUNCTION public.calculate_security_score()
RETURNS integer
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  base_score integer := 100;
  critical_incidents integer;
  high_incidents integer;
  medium_incidents integer;
  active_lockouts integer;
  security_score integer;
BEGIN
  -- Count incidents in last 24 hours
  SELECT 
    COUNT(*) FILTER (WHERE severity = 'critical'),
    COUNT(*) FILTER (WHERE severity = 'high'),
    COUNT(*) FILTER (WHERE severity = 'medium')
  INTO critical_incidents, high_incidents, medium_incidents
  FROM public.security_incidents
  WHERE created_at > NOW() - INTERVAL '24 hours';
  
  -- Count active lockouts
  SELECT COUNT(*) INTO active_lockouts
  FROM public.account_lockouts
  WHERE locked_until > NOW();
  
  -- Calculate security score
  security_score := base_score 
    - (critical_incidents * 20)
    - (high_incidents * 10)
    - (medium_incidents * 5)
    - (active_lockouts * 2);
  
  -- Ensure score is between 0 and 100
  security_score := GREATEST(0, LEAST(100, security_score));
  
  RETURN security_score;
END;
$$;

-- Function to detect anomalous security patterns
CREATE OR REPLACE FUNCTION public.detect_security_anomalies()
RETURNS TABLE (
  anomaly_type text,
  severity text,
  description text,
  data jsonb,
  detected_at timestamptz
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- Detect high frequency attacks from single IP
  RETURN QUERY
  SELECT 
    'high_frequency_attack'::text,
    'high'::text,
    format('IP %s has made %s security violations in 1 hour', source_ip, violation_count),
    jsonb_build_object('ip_address', source_ip, 'violation_count', violation_count),
    NOW()
  FROM (
    SELECT 
      source_ip,
      COUNT(*) as violation_count
    FROM public.security_incidents
    WHERE created_at > NOW() - INTERVAL '1 hour'
      AND source_ip IS NOT NULL
    GROUP BY source_ip
    HAVING COUNT(*) > 10
  ) high_freq;
  
  -- Detect coordinated attacks (multiple IPs, similar patterns)
  RETURN QUERY
  SELECT 
    'coordinated_attack'::text,
    'critical'::text,
    format('Detected coordinated %s attack from %s unique IPs', incident_type, ip_count),
    jsonb_build_object('incident_type', incident_type, 'unique_ips', ip_count),
    NOW()
  FROM (
    SELECT 
      incident_type,
      COUNT(DISTINCT source_ip) as ip_count
    FROM public.security_incidents
    WHERE created_at > NOW() - INTERVAL '10 minutes'
      AND source_ip IS NOT NULL
    GROUP BY incident_type
    HAVING COUNT(DISTINCT source_ip) > 5 AND COUNT(*) > 20
  ) coordinated;
  
  -- Detect privilege escalation attempts
  RETURN QUERY
  SELECT 
    'privilege_escalation_spike'::text,
    'high'::text,
    format('Unusual spike in privilege escalation attempts: %s in last hour', attempt_count),
    jsonb_build_object('attempt_count', attempt_count),
    NOW()
  FROM (
    SELECT COUNT(*) as attempt_count
    FROM public.security_incidents
    WHERE incident_type = 'privilege_escalation'
      AND created_at > NOW() - INTERVAL '1 hour'
  ) priv_esc
  WHERE attempt_count > 5;
END;
$$;

-- =====================================================
-- SECURITY RESPONSE FUNCTIONS
-- =====================================================

-- Function to automatically respond to security threats
CREATE OR REPLACE FUNCTION public.auto_security_response()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response_actions jsonb := '[]'::jsonb;
  action_result jsonb;
  anomaly_record record;
BEGIN
  -- Process detected anomalies
  FOR anomaly_record IN 
    SELECT * FROM public.detect_security_anomalies()
  LOOP
    -- Auto-block high frequency attackers
    IF anomaly_record.anomaly_type = 'high_frequency_attack' THEN
      -- Block the IP in brute force table
      INSERT INTO public.brute_force_attempts (
        ip_address, attempt_type, failed_attempts, is_blocked, blocked_until
      ) VALUES (
        (anomaly_record.data->>'ip_address')::inet,
        'security_violation',
        999,
        true,
        NOW() + INTERVAL '24 hours'
      )
      ON CONFLICT (ip_address, email, attempt_type) DO UPDATE SET
        is_blocked = true,
        blocked_until = NOW() + INTERVAL '24 hours';
      
      action_result := jsonb_build_object(
        'action', 'ip_blocked',
        'ip_address', anomaly_record.data->>'ip_address',
        'duration', '24 hours'
      );
      
      response_actions := response_actions || action_result;
    END IF;
    
    -- Create incident record for all anomalies
    INSERT INTO public.security_incidents (
      incident_type,
      severity,
      title,
      description,
      detection_method,
      response_action
    ) VALUES (
      anomaly_record.anomaly_type,
      anomaly_record.severity,
      'Automated Security Detection',
      anomaly_record.description,
      'automated_monitoring',
      'auto_response_triggered'
    );
  END LOOP;
  
  RETURN jsonb_build_object(
    'timestamp', NOW(),
    'actions_taken', response_actions,
    'total_actions', jsonb_array_length(response_actions)
  );
END;
$$;

-- Function to cleanup old security data
CREATE OR REPLACE FUNCTION public.cleanup_security_data(
  days_to_keep integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleanup_stats jsonb := '{}'::jsonb;
  deleted_count integer;
BEGIN
  -- Clean up old security incidents
  DELETE FROM public.security_incidents
  WHERE created_at < NOW() - (days_to_keep || ' days')::interval
    AND resolved_at IS NOT NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  cleanup_stats := jsonb_set(cleanup_stats, '{security_incidents}', deleted_count::text::jsonb);
  
  -- Clean up old brute force attempts (keep blocked ones longer)
  DELETE FROM public.brute_force_attempts
  WHERE last_attempt < NOW() - (days_to_keep || ' days')::interval
    AND (is_blocked = false OR blocked_until < NOW());
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  cleanup_stats := jsonb_set(cleanup_stats, '{brute_force_attempts}', deleted_count::text::jsonb);
  
  -- Clean up resolved account lockouts
  DELETE FROM public.account_lockouts
  WHERE created_at < NOW() - (days_to_keep || ' days')::interval
    AND locked_until < NOW()
    AND is_permanent = false;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  cleanup_stats := jsonb_set(cleanup_stats, '{account_lockouts}', deleted_count::text::jsonb);
  
  RETURN cleanup_stats;
END;
$$;

-- =====================================================
-- SECURITY MONITORING VIEWS
-- =====================================================

-- View for recent security incidents
CREATE OR REPLACE VIEW public.recent_security_incidents AS
SELECT 
  incident_type,
  severity,
  title,
  source_ip,
  user_id,
  is_blocked,
  created_at
FROM public.security_incidents
WHERE created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- View for security dashboard metrics
CREATE OR REPLACE VIEW public.security_dashboard AS
SELECT 
  'incidents_24h' as metric,
  COUNT(*)::text as value
FROM public.security_incidents
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'critical_incidents_24h' as metric,
  COUNT(*)::text as value
FROM public.security_incidents
WHERE created_at > NOW() - INTERVAL '24 hours'
  AND severity = 'critical'

UNION ALL

SELECT 
  'blocked_ips' as metric,
  COUNT(DISTINCT ip_address)::text as value
FROM public.brute_force_attempts
WHERE is_blocked = true AND blocked_until > NOW()

UNION ALL

SELECT 
  'active_lockouts' as metric,
  COUNT(*)::text as value
FROM public.account_lockouts
WHERE locked_until > NOW()

UNION ALL

SELECT 
  'security_score' as metric,
  public.calculate_security_score()::text as value;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Indexes for security_incidents
CREATE INDEX IF NOT EXISTS idx_security_incidents_type_time ON public.security_incidents(incident_type, created_at);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity_time ON public.security_incidents(severity, created_at);
CREATE INDEX IF NOT EXISTS idx_security_incidents_source_ip ON public.security_incidents(source_ip, created_at);
CREATE INDEX IF NOT EXISTS idx_security_incidents_user_id ON public.security_incidents(user_id, created_at);

-- Indexes for brute_force_attempts
CREATE INDEX IF NOT EXISTS idx_brute_force_ip_type ON public.brute_force_attempts(ip_address, attempt_type);
CREATE INDEX IF NOT EXISTS idx_brute_force_blocked ON public.brute_force_attempts(is_blocked, blocked_until);
CREATE INDEX IF NOT EXISTS idx_brute_force_last_attempt ON public.brute_force_attempts(last_attempt);

-- Indexes for account_lockouts
CREATE INDEX IF NOT EXISTS idx_account_lockouts_user_active ON public.account_lockouts(user_id, locked_until);
CREATE INDEX IF NOT EXISTS idx_account_lockouts_locked_until ON public.account_lockouts(locked_until);

-- =====================================================
-- RLS POLICIES FOR SECURITY TABLES
-- =====================================================

-- Enable RLS on security tables
ALTER TABLE public.security_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brute_force_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_lockouts ENABLE ROW LEVEL SECURITY;

-- Service role can access all security data
CREATE POLICY "Service role full access security_config" ON public.security_config
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access security_incidents" ON public.security_incidents
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access brute_force_attempts" ON public.brute_force_attempts
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access account_lockouts" ON public.account_lockouts
FOR ALL USING (auth.role() = 'service_role');

-- Admin users can view security data
CREATE POLICY "Admins can view security incidents" ON public.security_incidents
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() AND subscription_tier = 'enterprise'
  )
);

-- Users can view their own security incidents
CREATE POLICY "Users can view own security incidents" ON public.security_incidents
FOR SELECT USING (auth.uid() = user_id);

-- Users can view their own account lockout status
CREATE POLICY "Users can view own lockout status" ON public.account_lockouts
FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- GRANTS AND PERMISSIONS
-- =====================================================

-- Grant access to security testing functions
GRANT EXECUTE ON FUNCTION public.test_sql_injection_protection(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_xss_protection(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_brute_force_protection(inet, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.test_privilege_escalation(uuid, text, text) TO authenticated;

-- Service role permissions for security functions
GRANT EXECUTE ON FUNCTION public.generate_security_report(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.calculate_security_score() TO service_role;
GRANT EXECUTE ON FUNCTION public.detect_security_anomalies() TO service_role;
GRANT EXECUTE ON FUNCTION public.auto_security_response() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_security_data(integer) TO service_role;

-- Grant access to security views
GRANT SELECT ON public.recent_security_incidents TO authenticated;
GRANT SELECT ON public.security_dashboard TO authenticated;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.security_config IS 'Security configuration and policy settings';
COMMENT ON TABLE public.security_incidents IS 'Security incidents and threat detection logs';
COMMENT ON TABLE public.brute_force_attempts IS 'Brute force attack tracking and protection';
COMMENT ON TABLE public.account_lockouts IS 'Account lockout tracking and management';

COMMENT ON FUNCTION public.test_sql_injection_protection IS 'Test input for SQL injection vulnerabilities';
COMMENT ON FUNCTION public.test_xss_protection IS 'Test input for XSS vulnerabilities';
COMMENT ON FUNCTION public.check_brute_force_protection IS 'Check and enforce brute force protection';
COMMENT ON FUNCTION public.test_privilege_escalation IS 'Detect privilege escalation attempts';
COMMENT ON FUNCTION public.generate_security_report IS 'Generate comprehensive security report';
COMMENT ON FUNCTION public.calculate_security_score IS 'Calculate overall security health score';
COMMENT ON FUNCTION public.detect_security_anomalies IS 'Detect anomalous security patterns';
COMMENT ON FUNCTION public.auto_security_response IS 'Automated response to security threats';
COMMENT ON FUNCTION public.cleanup_security_data IS 'Clean up old security data';

COMMENT ON VIEW public.recent_security_incidents IS 'Recent security incidents for monitoring';
COMMENT ON VIEW public.security_dashboard IS 'Security metrics for dashboard display';