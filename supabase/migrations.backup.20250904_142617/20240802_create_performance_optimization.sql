-- Create performance metrics table for tracking preview system performance
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT,
  device_type TEXT,
  metric_type TEXT NOT NULL CHECK (metric_type IN (
    'preview_startup',
    'build_time',
    'hot_reload',
    'session_allocation',
    'resource_usage',
    'cache_hit',
    'session_warming'
  )),
  value DECIMAL NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance queries
CREATE INDEX idx_performance_metrics_user_created ON performance_metrics(user_id, created_at DESC);
CREATE INDEX idx_performance_metrics_project_created ON performance_metrics(project_id, created_at DESC);
CREATE INDEX idx_performance_metrics_type_created ON performance_metrics(metric_type, created_at DESC);

-- Create user settings table for optimization preferences
CREATE TABLE IF NOT EXISTS user_settings (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  preview_optimization_config JSONB DEFAULT '{
    "enableSessionWarming": true,
    "warmingPoolSize": 3,
    "preloadThreshold": 0.7,
    "adaptiveQuality": true,
    "cacheStrategy": "balanced"
  }',
  notification_preferences JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create project settings table for build optimizations
CREATE TABLE IF NOT EXISTS project_settings (
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE PRIMARY KEY,
  build_optimizations JSONB DEFAULT '{}',
  preview_settings JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update preview_session_pool to support warm sessions
ALTER TABLE preview_session_pool 
ADD COLUMN IF NOT EXISTS warming_type TEXT CHECK (warming_type IN ('predictive', 'manual', 'scheduled'));

-- Create connection pool stats table
CREATE TABLE IF NOT EXISTS connection_pool_stats (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  total_connections INTEGER NOT NULL,
  active_connections INTEGER NOT NULL,
  idle_connections INTEGER NOT NULL,
  waiting_requests INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create cache entries table for tracking cache performance
CREATE TABLE IF NOT EXISTS cache_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL,
  size INTEGER NOT NULL,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

CREATE INDEX idx_cache_entries_key ON cache_entries(cache_key);
CREATE INDEX idx_cache_entries_expires ON cache_entries(expires_at);

-- Create rate limit logs table
CREATE TABLE IF NOT EXISTS rate_limit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  resource TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rate_limit_logs_user_timestamp ON rate_limit_logs(user_id, timestamp DESC);

-- Create function to calculate cache statistics
CREATE OR REPLACE FUNCTION get_cache_statistics()
RETURNS TABLE (
  total_entries BIGINT,
  total_size BIGINT,
  avg_access_count DECIMAL,
  cache_hit_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_entries,
    SUM(size) as total_size,
    AVG(access_count) as avg_access_count,
    CASE 
      WHEN COUNT(*) > 0 THEN 
        COUNT(*) FILTER (WHERE access_count > 0)::DECIMAL / COUNT(*)
      ELSE 0
    END as cache_hit_rate
  FROM cache_entries
  WHERE expires_at IS NULL OR expires_at > NOW();
END;
$$ LANGUAGE plpgsql;

-- Create function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache_entries()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM cache_entries
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create function to record performance metric with anomaly detection
CREATE OR REPLACE FUNCTION record_performance_metric(
  p_user_id UUID,
  p_project_id UUID,
  p_metric_type TEXT,
  p_value DECIMAL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_metric_id UUID;
  v_avg_value DECIMAL;
  v_std_dev DECIMAL;
  v_z_score DECIMAL;
BEGIN
  -- Insert the metric
  INSERT INTO performance_metrics (
    user_id, project_id, metric_type, value, metadata
  ) VALUES (
    p_user_id, p_project_id, p_metric_type, p_value, p_metadata
  ) RETURNING id INTO v_metric_id;
  
  -- Calculate historical statistics for anomaly detection
  SELECT 
    AVG(value), 
    STDDEV(value) 
  INTO v_avg_value, v_std_dev
  FROM performance_metrics
  WHERE user_id = p_user_id
    AND metric_type = p_metric_type
    AND created_at > NOW() - INTERVAL '7 days';
  
  -- Check for anomalies
  IF v_avg_value IS NOT NULL AND v_std_dev IS NOT NULL AND v_std_dev > 0 THEN
    v_z_score := ABS((p_value - v_avg_value) / v_std_dev);
    
    -- If anomaly detected (z-score > 2), create alert
    IF v_z_score > 2 THEN
      INSERT INTO performance_alerts (
        user_id,
        project_id,
        alert_type,
        severity,
        message,
        metadata
      ) VALUES (
        p_user_id,
        p_project_id,
        'performance_anomaly',
        CASE WHEN v_z_score > 3 THEN 'high' ELSE 'medium' END,
        format('%s performance anomaly detected: %.2f (expected: %.2f ± %.2f)',
          p_metric_type, p_value, v_avg_value, v_std_dev * 2),
        jsonb_build_object(
          'metric_type', p_metric_type,
          'value', p_value,
          'expected_mean', v_avg_value,
          'z_score', v_z_score
        )
      );
    END IF;
  END IF;
  
  RETURN v_metric_id;
END;
$$ LANGUAGE plpgsql;

-- Create performance alerts table
CREATE TABLE IF NOT EXISTS performance_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  acknowledged BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_performance_alerts_user_created ON performance_alerts(user_id, created_at DESC);

-- Create scheduled job for cache cleanup (runs every hour)
SELECT cron.schedule(
  'cleanup-expired-cache',
  '0 * * * *',
  $$SELECT cleanup_expired_cache_entries();$$
);

-- Create scheduled job for session pool warming (runs every 5 minutes)
SELECT cron.schedule(
  'warm-session-pools',
  '*/5 * * * *',
  $$
  UPDATE preview_session_pool
  SET status = 'warm'
  WHERE status = 'idle'
    AND updated_at < NOW() - INTERVAL '5 minutes'
  LIMIT 10;
  $$
);

-- Grant necessary permissions
GRANT ALL ON performance_metrics TO authenticated;
GRANT ALL ON user_settings TO authenticated;
GRANT ALL ON project_settings TO authenticated;
GRANT ALL ON connection_pool_stats TO service_role;
GRANT ALL ON cache_entries TO service_role;
GRANT ALL ON rate_limit_logs TO service_role;
GRANT ALL ON performance_alerts TO authenticated;

-- Add RLS policies
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_alerts ENABLE ROW LEVEL SECURITY;

-- Performance metrics policy
CREATE POLICY "Users can manage their own performance metrics"
  ON performance_metrics
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- User settings policy
CREATE POLICY "Users can manage their own settings"
  ON user_settings
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Project settings policy
CREATE POLICY "Project owners can manage project settings"
  ON project_settings
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_settings.project_id
        AND projects.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = project_settings.project_id
        AND projects.user_id = auth.uid()
    )
  );

-- Performance alerts policy
CREATE POLICY "Users can view their own alerts"
  ON performance_alerts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Add comment
COMMENT ON TABLE performance_metrics IS 'Stores performance metrics for the preview system including startup times, build times, and resource usage';
COMMENT ON TABLE user_settings IS 'User-specific settings including optimization preferences';
COMMENT ON TABLE project_settings IS 'Project-specific settings including build optimizations';
COMMENT ON TABLE performance_alerts IS 'Performance anomaly alerts and notifications';