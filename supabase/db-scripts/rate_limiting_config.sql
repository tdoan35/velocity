-- API Rate Limiting Configuration for Velocity Platform
-- This implements database-based rate limiting with tiered limits and monitoring

-- =====================================================
-- RATE LIMITING TABLES
-- =====================================================

-- Rate limiting configuration table
CREATE TABLE IF NOT EXISTS public.rate_limit_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint text NOT NULL,
  method text NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE', 'PATCH')),
  user_role text NOT NULL CHECK (user_role IN ('anon', 'authenticated', 'free', 'pro', 'enterprise', 'service_role')),
  requests_per_minute integer NOT NULL DEFAULT 60,
  requests_per_hour integer NOT NULL DEFAULT 1000,
  requests_per_day integer NOT NULL DEFAULT 10000,
  burst_limit integer NOT NULL DEFAULT 10,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  UNIQUE(endpoint, method, user_role)
);

-- Rate limiting tracking table
CREATE TABLE IF NOT EXISTS public.rate_limit_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address inet,
  endpoint text NOT NULL,
  method text NOT NULL,
  user_role text NOT NULL,
  request_count integer DEFAULT 1,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  window_type text NOT NULL CHECK (window_type IN ('minute', 'hour', 'day')),
  created_at timestamptz DEFAULT NOW()
);

-- Rate limiting violations table
CREATE TABLE IF NOT EXISTS public.rate_limit_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_address inet,
  endpoint text NOT NULL,
  method text NOT NULL,
  user_role text,
  violation_type text NOT NULL CHECK (violation_type IN ('minute_limit', 'hour_limit', 'day_limit', 'burst_limit', 'suspicious_pattern')),
  limit_exceeded integer NOT NULL,
  actual_requests integer NOT NULL,
  time_window timestamptz NOT NULL,
  user_agent text,
  request_headers jsonb DEFAULT '{}'::jsonb,
  additional_context jsonb DEFAULT '{}'::jsonb,
  is_blocked boolean DEFAULT false,
  block_duration_minutes integer DEFAULT 5,
  created_at timestamptz DEFAULT NOW()
);

-- Temporary bans table
CREATE TABLE IF NOT EXISTS public.rate_limit_bans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address inet,
  ban_type text NOT NULL CHECK (ban_type IN ('user', 'ip', 'combined')),
  reason text NOT NULL,
  banned_until timestamptz NOT NULL,
  violation_count integer DEFAULT 1,
  is_permanent boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- =====================================================
-- DEFAULT RATE LIMITING CONFIGURATION
-- =====================================================

-- Insert default rate limiting configurations
INSERT INTO public.rate_limit_config (endpoint, method, user_role, requests_per_minute, requests_per_hour, requests_per_day, burst_limit) VALUES
-- Anonymous users (very restrictive)
('/api/auth/*', 'POST', 'anon', 5, 20, 100, 2),
('/api/public/*', 'GET', 'anon', 10, 100, 500, 5),
('/api/*', 'GET', 'anon', 5, 50, 200, 3),

-- Authenticated users (basic limits)
('/api/auth/*', 'POST', 'authenticated', 10, 60, 300, 5),
('/api/projects/*', 'GET', 'authenticated', 30, 500, 2000, 10),
('/api/projects/*', 'POST', 'authenticated', 5, 30, 100, 3),
('/api/projects/*', 'PUT', 'authenticated', 10, 60, 300, 5),
('/api/projects/*', 'DELETE', 'authenticated', 2, 10, 50, 1),
('/api/files/*', 'GET', 'authenticated', 50, 800, 3000, 15),
('/api/files/*', 'POST', 'authenticated', 10, 100, 500, 5),
('/api/ai/*', 'POST', 'authenticated', 5, 30, 100, 2),
('/api/builds/*', 'GET', 'authenticated', 20, 200, 1000, 8),
('/api/builds/*', 'POST', 'authenticated', 2, 10, 30, 1),

-- Free tier users
('/api/ai/*', 'POST', 'free', 10, 50, 200, 3),
('/api/builds/*', 'POST', 'free', 3, 15, 50, 1),
('/api/projects/*', 'POST', 'free', 10, 50, 200, 5),

-- Pro tier users (higher limits)
('/api/ai/*', 'POST', 'pro', 30, 200, 1000, 10),
('/api/builds/*', 'POST', 'pro', 10, 60, 300, 5),
('/api/projects/*', 'POST', 'pro', 25, 150, 800, 10),
('/api/files/*', 'POST', 'pro', 50, 500, 2000, 20),

-- Enterprise users (highest limits)
('/api/ai/*', 'POST', 'enterprise', 100, 1000, 5000, 30),
('/api/builds/*', 'POST', 'enterprise', 30, 200, 1000, 15),
('/api/projects/*', 'POST', 'enterprise', 100, 500, 2500, 30),
('/api/files/*', 'POST', 'enterprise', 200, 2000, 10000, 50),

-- Service role (unlimited for internal operations)
('/api/*', 'GET', 'service_role', 1000, 50000, 500000, 500),
('/api/*', 'POST', 'service_role', 1000, 50000, 500000, 500),
('/api/*', 'PUT', 'service_role', 1000, 50000, 500000, 500),
('/api/*', 'DELETE', 'service_role', 1000, 50000, 500000, 500)

ON CONFLICT (endpoint, method, user_role) DO UPDATE SET
  requests_per_minute = EXCLUDED.requests_per_minute,
  requests_per_hour = EXCLUDED.requests_per_hour,
  requests_per_day = EXCLUDED.requests_per_day,
  burst_limit = EXCLUDED.burst_limit,
  updated_at = NOW();

-- =====================================================
-- RATE LIMITING FUNCTIONS
-- =====================================================

-- Function to get user's subscription tier
CREATE OR REPLACE FUNCTION public.get_user_rate_limit_tier(user_uuid uuid)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT subscription_tier FROM public.user_profiles WHERE id = user_uuid),
    'authenticated'
  );
$$;

-- Function to check if user/IP is currently banned
CREATE OR REPLACE FUNCTION public.is_banned(user_uuid uuid DEFAULT NULL, client_ip inet DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rate_limit_bans
    WHERE (
      (user_uuid IS NOT NULL AND user_id = user_uuid) OR
      (client_ip IS NOT NULL AND ip_address = client_ip)
    )
    AND (is_permanent = true OR banned_until > NOW())
  );
$$;

-- Function to get rate limit configuration for endpoint
CREATE OR REPLACE FUNCTION public.get_rate_limit_config(
  endpoint_pattern text,
  http_method text,
  user_tier text
)
RETURNS public.rate_limit_config
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  config_row public.rate_limit_config;
BEGIN
  -- Try exact match first
  SELECT * INTO config_row
  FROM public.rate_limit_config
  WHERE endpoint = endpoint_pattern
    AND method = http_method
    AND user_role = user_tier
    AND is_active = true;
  
  IF FOUND THEN
    RETURN config_row;
  END IF;
  
  -- Try wildcard matches
  SELECT * INTO config_row
  FROM public.rate_limit_config
  WHERE endpoint_pattern LIKE (endpoint || '%')
    AND method = http_method
    AND user_role = user_tier
    AND is_active = true
  ORDER BY length(endpoint) DESC
  LIMIT 1;
  
  IF FOUND THEN
    RETURN config_row;
  END IF;
  
  -- Default fallback
  SELECT * INTO config_row
  FROM public.rate_limit_config
  WHERE endpoint = '/api/*'
    AND method = 'GET'
    AND user_role = 'authenticated'
    AND is_active = true;
  
  RETURN config_row;
END;
$$;

-- Function to check rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  user_uuid uuid,
  client_ip inet,
  endpoint_path text,
  http_method text,
  user_agent_string text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  user_tier text;
  config_row public.rate_limit_config;
  current_requests integer;
  is_limited boolean := false;
  violation_type text;
  response jsonb;
  time_windows record;
BEGIN
  -- Check if banned
  IF public.is_banned(user_uuid, client_ip) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'banned',
      'retry_after', 3600
    );
  END IF;
  
  -- Get user tier
  user_tier := public.get_user_rate_limit_tier(user_uuid);
  
  -- Get rate limit configuration
  config_row := public.get_rate_limit_config(endpoint_path, http_method, user_tier);
  
  -- Check minute limit
  SELECT COUNT(*) INTO current_requests
  FROM public.rate_limit_tracking
  WHERE (user_id = user_uuid OR ip_address = client_ip)
    AND endpoint = endpoint_path
    AND method = http_method
    AND window_type = 'minute'
    AND window_end > NOW();
  
  IF current_requests >= config_row.requests_per_minute THEN
    is_limited := true;
    violation_type := 'minute_limit';
  END IF;
  
  -- Check hour limit if minute check passed
  IF NOT is_limited THEN
    SELECT COUNT(*) INTO current_requests
    FROM public.rate_limit_tracking
    WHERE (user_id = user_uuid OR ip_address = client_ip)
      AND endpoint = endpoint_path
      AND method = http_method
      AND window_type = 'hour'
      AND window_end > NOW();
    
    IF current_requests >= config_row.requests_per_hour THEN
      is_limited := true;
      violation_type := 'hour_limit';
    END IF;
  END IF;
  
  -- Check day limit if hour check passed
  IF NOT is_limited THEN
    SELECT COUNT(*) INTO current_requests
    FROM public.rate_limit_tracking
    WHERE (user_id = user_uuid OR ip_address = client_ip)
      AND endpoint = endpoint_path
      AND method = http_method
      AND window_type = 'day'
      AND window_end > NOW();
    
    IF current_requests >= config_row.requests_per_day THEN
      is_limited := true;
      violation_type := 'day_limit';
    END IF;
  END IF;
  
  -- If rate limited, log violation
  IF is_limited THEN
    INSERT INTO public.rate_limit_violations (
      user_id, ip_address, endpoint, method, user_role,
      violation_type, limit_exceeded, actual_requests,
      time_window, user_agent
    ) VALUES (
      user_uuid, client_ip, endpoint_path, http_method, user_tier,
      violation_type, 
      CASE violation_type
        WHEN 'minute_limit' THEN config_row.requests_per_minute
        WHEN 'hour_limit' THEN config_row.requests_per_hour
        WHEN 'day_limit' THEN config_row.requests_per_day
      END,
      current_requests, NOW(), user_agent_string
    );
    
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'rate_limited',
      'violation_type', violation_type,
      'limit', CASE violation_type
        WHEN 'minute_limit' THEN config_row.requests_per_minute
        WHEN 'hour_limit' THEN config_row.requests_per_hour  
        WHEN 'day_limit' THEN config_row.requests_per_day
      END,
      'current_requests', current_requests,
      'retry_after', CASE violation_type
        WHEN 'minute_limit' THEN 60
        WHEN 'hour_limit' THEN 3600
        WHEN 'day_limit' THEN 86400
      END
    );
  END IF;
  
  -- Update tracking (upsert for each time window)
  INSERT INTO public.rate_limit_tracking (
    user_id, ip_address, endpoint, method, user_role,
    request_count, window_start, window_end, window_type
  ) VALUES 
    -- Minute window
    (user_uuid, client_ip, endpoint_path, http_method, user_tier,
     1, date_trunc('minute', NOW()), date_trunc('minute', NOW()) + INTERVAL '1 minute', 'minute'),
    -- Hour window  
    (user_uuid, client_ip, endpoint_path, http_method, user_tier,
     1, date_trunc('hour', NOW()), date_trunc('hour', NOW()) + INTERVAL '1 hour', 'hour'),
    -- Day window
    (user_uuid, client_ip, endpoint_path, http_method, user_tier,
     1, date_trunc('day', NOW()), date_trunc('day', NOW()) + INTERVAL '1 day', 'day')
  ON CONFLICT (user_id, ip_address, endpoint, method, window_start, window_end, window_type)
  DO UPDATE SET
    request_count = rate_limit_tracking.request_count + 1;
  
  RETURN jsonb_build_object(
    'allowed', true,
    'requests_remaining_minute', config_row.requests_per_minute - current_requests,
    'requests_remaining_hour', config_row.requests_per_hour - current_requests,
    'requests_remaining_day', config_row.requests_per_day - current_requests,
    'reset_time_minute', (date_trunc('minute', NOW()) + INTERVAL '1 minute'),
    'reset_time_hour', (date_trunc('hour', NOW()) + INTERVAL '1 hour'),
    'reset_time_day', (date_trunc('day', NOW()) + INTERVAL '1 day')
  );
END;
$$;

-- Function to apply temporary ban
CREATE OR REPLACE FUNCTION public.apply_rate_limit_ban(
  user_uuid uuid DEFAULT NULL,
  client_ip inet DEFAULT NULL,
  ban_reason text DEFAULT 'Rate limit violations',
  duration_minutes integer DEFAULT 60,
  applied_by uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.rate_limit_bans (
    user_id, ip_address, ban_type, reason, banned_until, created_by
  ) VALUES (
    user_uuid, 
    client_ip,
    CASE 
      WHEN user_uuid IS NOT NULL AND client_ip IS NOT NULL THEN 'combined'
      WHEN user_uuid IS NOT NULL THEN 'user'
      ELSE 'ip'
    END,
    ban_reason,
    NOW() + (duration_minutes || ' minutes')::interval,
    applied_by
  );
  
  RETURN true;
END;
$$;

-- Function to clean up old tracking data
CREATE OR REPLACE FUNCTION public.cleanup_rate_limit_data(days_old integer DEFAULT 7)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Clean up old tracking data
  DELETE FROM public.rate_limit_tracking
  WHERE created_at < NOW() - (days_old || ' days')::interval;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Clean up old violations (keep longer for analysis)
  DELETE FROM public.rate_limit_violations
  WHERE created_at < NOW() - ((days_old * 2) || ' days')::interval;
  
  -- Clean up expired bans
  DELETE FROM public.rate_limit_bans
  WHERE banned_until < NOW() AND is_permanent = false;
  
  RETURN deleted_count;
END;
$$;

-- =====================================================
-- MONITORING AND ANALYTICS VIEWS
-- =====================================================

-- Rate limiting statistics view
CREATE OR REPLACE VIEW public.rate_limit_stats AS
SELECT 
  endpoint,
  method,
  user_role,
  COUNT(*) as total_requests,
  COUNT(*) FILTER (WHERE window_type = 'minute') as minute_requests,
  COUNT(*) FILTER (WHERE window_type = 'hour') as hour_requests,
  COUNT(*) FILTER (WHERE window_type = 'day') as day_requests,
  AVG(request_count) as avg_requests_per_window,
  MAX(request_count) as max_requests_per_window,
  MIN(created_at) as first_request,
  MAX(created_at) as last_request
FROM public.rate_limit_tracking
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY endpoint, method, user_role
ORDER BY total_requests DESC;

-- Rate limiting violations summary
CREATE OR REPLACE VIEW public.rate_limit_violation_stats AS
SELECT 
  endpoint,
  method,
  violation_type,
  COUNT(*) as violation_count,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT ip_address) as unique_ips,
  AVG(actual_requests) as avg_requests_when_violated,
  MAX(actual_requests) as max_requests_when_violated,
  DATE_TRUNC('hour', created_at) as violation_hour
FROM public.rate_limit_violations
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY endpoint, method, violation_type, DATE_TRUNC('hour', created_at)
ORDER BY violation_count DESC;

-- Current active bans
CREATE OR REPLACE VIEW public.active_rate_limit_bans AS
SELECT 
  id,
  user_id,
  ip_address,
  ban_type,
  reason,
  banned_until,
  violation_count,
  is_permanent,
  created_at,
  EXTRACT(EPOCH FROM (banned_until - NOW())) / 60 as minutes_remaining
FROM public.rate_limit_bans
WHERE (banned_until > NOW() OR is_permanent = true)
ORDER BY created_at DESC;

-- =====================================================
-- TRIGGERS AND AUTOMATION
-- =====================================================

-- Function to automatically ban repeat violators
CREATE OR REPLACE FUNCTION public.auto_ban_repeat_violators()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  violation_count integer;
  should_ban boolean := false;
  ban_duration integer := 60; -- Start with 1 hour
BEGIN
  -- Count violations in the past hour for this user/IP
  SELECT COUNT(*) INTO violation_count
  FROM public.rate_limit_violations
  WHERE (
    (NEW.user_id IS NOT NULL AND user_id = NEW.user_id) OR
    (NEW.ip_address IS NOT NULL AND ip_address = NEW.ip_address)
  )
  AND created_at > NOW() - INTERVAL '1 hour';
  
  -- Determine if ban is needed and duration
  IF violation_count >= 10 THEN
    should_ban := true;
    ban_duration := 1440; -- 24 hours for heavy violators
  ELSIF violation_count >= 5 THEN
    should_ban := true;
    ban_duration := 240; -- 4 hours for moderate violators
  ELSIF violation_count >= 3 THEN
    should_ban := true;
    ban_duration := 60; -- 1 hour for light violators
  END IF;
  
  -- Apply ban if needed
  IF should_ban THEN
    PERFORM public.apply_rate_limit_ban(
      NEW.user_id,
      NEW.ip_address,
      format('Automatic ban after %s violations in 1 hour', violation_count),
      ban_duration
    );
    
    -- Mark this violation as resulting in a ban
    NEW.is_blocked := true;
    NEW.block_duration_minutes := ban_duration;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for automatic banning
CREATE TRIGGER auto_ban_violators
  BEFORE INSERT ON public.rate_limit_violations
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_ban_repeat_violators();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_rate_limit_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create triggers for timestamp updates
CREATE TRIGGER update_rate_limit_config_timestamp
  BEFORE UPDATE ON public.rate_limit_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rate_limit_timestamps();

CREATE TRIGGER update_rate_limit_bans_timestamp
  BEFORE UPDATE ON public.rate_limit_bans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_rate_limit_timestamps();

-- =====================================================
-- RLS POLICIES FOR RATE LIMITING TABLES
-- =====================================================

-- Enable RLS on all rate limiting tables
ALTER TABLE public.rate_limit_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_bans ENABLE ROW LEVEL SECURITY;

-- Service role can access all rate limiting data
CREATE POLICY "Service role full access rate_limit_config" ON public.rate_limit_config
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access rate_limit_tracking" ON public.rate_limit_tracking
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access rate_limit_violations" ON public.rate_limit_violations
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access rate_limit_bans" ON public.rate_limit_bans
FOR ALL USING (auth.role() = 'service_role');

-- Users can view their own rate limit status
CREATE POLICY "Users can view own rate limit tracking" ON public.rate_limit_tracking
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can view own rate limit violations" ON public.rate_limit_violations
FOR SELECT USING (auth.uid() = user_id);

-- Admin users can view rate limiting data
CREATE POLICY "Admins can view rate limit data" ON public.rate_limit_config
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() AND subscription_tier = 'enterprise'
  )
);

-- =====================================================
-- GRANTS AND PERMISSIONS
-- =====================================================

-- Grant access to rate limiting functions
GRANT EXECUTE ON FUNCTION public.get_user_rate_limit_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned(uuid, inet) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_rate_limit_config(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(uuid, inet, text, text, text) TO authenticated;

-- Service role permissions for management functions
GRANT EXECUTE ON FUNCTION public.apply_rate_limit_ban(uuid, inet, text, integer, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_rate_limit_data(integer) TO service_role;

-- Grant access to views
GRANT SELECT ON public.rate_limit_stats TO authenticated;
GRANT SELECT ON public.rate_limit_violation_stats TO service_role;
GRANT SELECT ON public.active_rate_limit_bans TO service_role;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Indexes for rate_limit_tracking
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracking_user_endpoint ON public.rate_limit_tracking(user_id, endpoint, method, window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracking_ip_endpoint ON public.rate_limit_tracking(ip_address, endpoint, method, window_start, window_end);
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracking_window_end ON public.rate_limit_tracking(window_end);
CREATE INDEX IF NOT EXISTS idx_rate_limit_tracking_cleanup ON public.rate_limit_tracking(created_at);

-- Indexes for rate_limit_violations
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_user_time ON public.rate_limit_violations(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_ip_time ON public.rate_limit_violations(ip_address, created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_endpoint ON public.rate_limit_violations(endpoint, created_at);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_blocked ON public.rate_limit_violations(is_blocked, created_at);

-- Indexes for rate_limit_bans
CREATE INDEX IF NOT EXISTS idx_rate_limit_bans_user_banned_until ON public.rate_limit_bans(user_id, banned_until);
CREATE INDEX IF NOT EXISTS idx_rate_limit_bans_ip_banned_until ON public.rate_limit_bans(ip_address, banned_until);
CREATE INDEX IF NOT EXISTS idx_rate_limit_bans_banned_until_permanent ON public.rate_limit_bans(banned_until, is_permanent);

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.rate_limit_config IS 'Rate limiting configuration by endpoint, method, and user role';
COMMENT ON TABLE public.rate_limit_tracking IS 'Tracks API request counts for rate limiting enforcement';
COMMENT ON TABLE public.rate_limit_violations IS 'Logs rate limit violations for monitoring and analysis';
COMMENT ON TABLE public.rate_limit_bans IS 'Temporary and permanent bans for rate limit violators';

COMMENT ON FUNCTION public.check_rate_limit IS 'Main function to check and enforce rate limits';
COMMENT ON FUNCTION public.apply_rate_limit_ban IS 'Apply temporary or permanent ban for rate limit violations';
COMMENT ON FUNCTION public.cleanup_rate_limit_data IS 'Clean up old rate limiting data for maintenance';

COMMENT ON VIEW public.rate_limit_stats IS 'Rate limiting statistics for monitoring API usage';
COMMENT ON VIEW public.rate_limit_violation_stats IS 'Rate limiting violation statistics for security monitoring';
COMMENT ON VIEW public.active_rate_limit_bans IS 'Currently active rate limiting bans';