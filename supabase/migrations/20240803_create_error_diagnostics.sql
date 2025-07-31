-- Create preview error logs table
CREATE TABLE IF NOT EXISTS preview_error_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  session_id TEXT,
  error_code TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message TEXT NOT NULL,
  user_message TEXT,
  technical_details JSONB DEFAULT '{}',
  context JSONB DEFAULT '{}',
  diagnostics JSONB DEFAULT '{}',
  can_retry BOOLEAN DEFAULT TRUE,
  recovery_steps TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for error analysis
CREATE INDEX idx_error_logs_user_created ON preview_error_logs(user_id, created_at DESC);
CREATE INDEX idx_error_logs_code_created ON preview_error_logs(error_code, created_at DESC);
CREATE INDEX idx_error_logs_severity ON preview_error_logs(severity, created_at DESC);
CREATE INDEX idx_error_logs_session ON preview_error_logs(session_id) WHERE session_id IS NOT NULL;

-- Create diagnostic reports table
CREATE TABLE IF NOT EXISTS diagnostic_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id TEXT,
  report_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_diagnostic_reports_user ON diagnostic_reports(user_id, created_at DESC);

-- Create resource usage table for monitoring
CREATE TABLE IF NOT EXISTS resource_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  cpu_usage DECIMAL,
  memory_usage DECIMAL,
  disk_usage DECIMAL,
  network_bandwidth DECIMAL,
  active_sessions INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_resource_usage_user_created ON resource_usage(user_id, created_at DESC);

-- Create self-healing logs table
CREATE TABLE IF NOT EXISTS self_healing_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  error_log_id UUID REFERENCES preview_error_logs(id) ON DELETE CASCADE,
  strategy TEXT NOT NULL,
  success BOOLEAN NOT NULL,
  message TEXT,
  duration_ms INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_self_healing_logs_error ON self_healing_logs(error_log_id);
CREATE INDEX idx_self_healing_logs_success ON self_healing_logs(success, created_at DESC);

-- Create function to analyze error patterns
CREATE OR REPLACE FUNCTION analyze_error_patterns(
  p_user_id UUID,
  p_time_window INTERVAL DEFAULT INTERVAL '24 hours'
) RETURNS TABLE (
  error_code TEXT,
  occurrence_count BIGINT,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  avg_interval_seconds DECIMAL,
  severity_distribution JSONB,
  recovery_success_rate DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH error_stats AS (
    SELECT 
      e.error_code,
      COUNT(*) as occurrence_count,
      MIN(e.created_at) as first_seen,
      MAX(e.created_at) as last_seen,
      jsonb_object_agg(e.severity, e.severity_count) as severity_distribution
    FROM (
      SELECT 
        error_code,
        severity,
        created_at,
        COUNT(*) OVER (PARTITION BY error_code, severity) as severity_count
      FROM preview_error_logs
      WHERE user_id = p_user_id
        AND created_at > NOW() - p_time_window
    ) e
    GROUP BY e.error_code
  ),
  interval_stats AS (
    SELECT 
      error_code,
      AVG(EXTRACT(EPOCH FROM (next_occurrence - created_at))) as avg_interval_seconds
    FROM (
      SELECT 
        error_code,
        created_at,
        LEAD(created_at) OVER (PARTITION BY error_code ORDER BY created_at) as next_occurrence
      FROM preview_error_logs
      WHERE user_id = p_user_id
        AND created_at > NOW() - p_time_window
    ) t
    WHERE next_occurrence IS NOT NULL
    GROUP BY error_code
  ),
  recovery_stats AS (
    SELECT 
      pel.error_code,
      COUNT(CASE WHEN shl.success THEN 1 END)::DECIMAL / NULLIF(COUNT(*), 0) as recovery_success_rate
    FROM preview_error_logs pel
    LEFT JOIN self_healing_logs shl ON shl.error_log_id = pel.id
    WHERE pel.user_id = p_user_id
      AND pel.created_at > NOW() - p_time_window
    GROUP BY pel.error_code
  )
  SELECT 
    es.error_code,
    es.occurrence_count,
    es.first_seen,
    es.last_seen,
    COALESCE(i.avg_interval_seconds, 0) as avg_interval_seconds,
    es.severity_distribution,
    COALESCE(rs.recovery_success_rate, 0) as recovery_success_rate
  FROM error_stats es
  LEFT JOIN interval_stats i ON i.error_code = es.error_code
  LEFT JOIN recovery_stats rs ON rs.error_code = es.error_code
  ORDER BY es.occurrence_count DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to detect anomalous error rates
CREATE OR REPLACE FUNCTION detect_error_anomalies()
RETURNS TABLE (
  user_id UUID,
  error_code TEXT,
  current_rate DECIMAL,
  baseline_rate DECIMAL,
  deviation_percent DECIMAL,
  is_anomaly BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  WITH current_window AS (
    SELECT 
      user_id,
      error_code,
      COUNT(*)::DECIMAL / 24 as hourly_rate -- Last 24 hours
    FROM preview_error_logs
    WHERE created_at > NOW() - INTERVAL '24 hours'
    GROUP BY user_id, error_code
  ),
  baseline_window AS (
    SELECT 
      user_id,
      error_code,
      COUNT(*)::DECIMAL / (7 * 24) as hourly_rate -- Previous 7 days
    FROM preview_error_logs
    WHERE created_at > NOW() - INTERVAL '8 days'
      AND created_at <= NOW() - INTERVAL '1 day'
    GROUP BY user_id, error_code
  )
  SELECT 
    c.user_id,
    c.error_code,
    c.hourly_rate as current_rate,
    COALESCE(b.hourly_rate, 0) as baseline_rate,
    CASE 
      WHEN b.hourly_rate > 0 THEN 
        ((c.hourly_rate - b.hourly_rate) / b.hourly_rate * 100)
      ELSE 100
    END as deviation_percent,
    CASE 
      WHEN b.hourly_rate IS NULL OR b.hourly_rate = 0 THEN c.hourly_rate > 5
      ELSE (c.hourly_rate - b.hourly_rate) / b.hourly_rate > 2 -- 200% increase
    END as is_anomaly
  FROM current_window c
  LEFT JOIN baseline_window b ON c.user_id = b.user_id AND c.error_code = b.error_code
  WHERE c.hourly_rate > 1; -- Only consider errors occurring more than once per hour
END;
$$ LANGUAGE plpgsql;

-- Create function to generate error summary
CREATE OR REPLACE FUNCTION get_error_summary(
  p_user_id UUID,
  p_time_range INTERVAL DEFAULT INTERVAL '24 hours'
) RETURNS JSONB AS $$
DECLARE
  v_summary JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_errors', COUNT(*),
    'unique_error_codes', COUNT(DISTINCT error_code),
    'critical_errors', COUNT(*) FILTER (WHERE severity = 'critical'),
    'high_errors', COUNT(*) FILTER (WHERE severity = 'high'),
    'medium_errors', COUNT(*) FILTER (WHERE severity = 'medium'),
    'low_errors', COUNT(*) FILTER (WHERE severity = 'low'),
    'sessions_affected', COUNT(DISTINCT session_id),
    'recovery_attempted', COUNT(DISTINCT error_log_id) FROM self_healing_logs WHERE error_log_id IN (
      SELECT id FROM preview_error_logs WHERE user_id = p_user_id AND created_at > NOW() - p_time_range
    ),
    'recovery_success_rate', (
      SELECT COUNT(*) FILTER (WHERE success)::DECIMAL / NULLIF(COUNT(*), 0)
      FROM self_healing_logs
      WHERE error_log_id IN (
        SELECT id FROM preview_error_logs WHERE user_id = p_user_id AND created_at > NOW() - p_time_range
      )
    ),
    'most_common_errors', (
      SELECT jsonb_agg(jsonb_build_object(
        'code', error_code,
        'count', error_count,
        'severity', severity
      ))
      FROM (
        SELECT error_code, severity, COUNT(*) as error_count
        FROM preview_error_logs
        WHERE user_id = p_user_id AND created_at > NOW() - p_time_range
        GROUP BY error_code, severity
        ORDER BY error_count DESC
        LIMIT 5
      ) t
    )
  ) INTO v_summary
  FROM preview_error_logs
  WHERE user_id = p_user_id
    AND created_at > NOW() - p_time_range;
  
  RETURN v_summary;
END;
$$ LANGUAGE plpgsql;

-- Create scheduled job to clean up old error logs (runs daily)
SELECT cron.schedule(
  'cleanup-old-error-logs',
  '0 2 * * *', -- 2 AM daily
  $$
  DELETE FROM preview_error_logs 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  DELETE FROM diagnostic_reports
  WHERE created_at < NOW() - INTERVAL '7 days';
  
  DELETE FROM resource_usage
  WHERE created_at < NOW() - INTERVAL '7 days';
  $$
);

-- Create scheduled job to detect and alert on anomalies (runs every hour)
SELECT cron.schedule(
  'detect-error-anomalies',
  '0 * * * *', -- Every hour
  $$
  INSERT INTO performance_alerts (user_id, alert_type, severity, message, metadata)
  SELECT 
    user_id,
    'error_anomaly',
    'high',
    format('Unusual error rate detected for %s (%.0f%% increase)', error_code, deviation_percent),
    jsonb_build_object(
      'error_code', error_code,
      'current_rate', current_rate,
      'baseline_rate', baseline_rate,
      'deviation_percent', deviation_percent
    )
  FROM detect_error_anomalies()
  WHERE is_anomaly
    AND NOT EXISTS (
      -- Don't create duplicate alerts within 4 hours
      SELECT 1 FROM performance_alerts
      WHERE user_id = detect_error_anomalies.user_id
        AND metadata->>'error_code' = detect_error_anomalies.error_code
        AND created_at > NOW() - INTERVAL '4 hours'
    );
  $$
);

-- Grant permissions
GRANT ALL ON preview_error_logs TO authenticated;
GRANT ALL ON diagnostic_reports TO authenticated;
GRANT ALL ON resource_usage TO authenticated;
GRANT ALL ON self_healing_logs TO service_role;

-- Add RLS policies
ALTER TABLE preview_error_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagnostic_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE self_healing_logs ENABLE ROW LEVEL SECURITY;

-- Error logs policy
CREATE POLICY "Users can view their own error logs"
  ON preview_error_logs
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all error logs"
  ON preview_error_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Diagnostic reports policy
CREATE POLICY "Users can view their own diagnostic reports"
  ON diagnostic_reports
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Resource usage policy
CREATE POLICY "Users can view their own resource usage"
  ON resource_usage
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage resource usage"
  ON resource_usage
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Self-healing logs policy
CREATE POLICY "Service role can manage self-healing logs"
  ON self_healing_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add comments
COMMENT ON TABLE preview_error_logs IS 'Comprehensive error logging for preview system with diagnostics';
COMMENT ON TABLE diagnostic_reports IS 'Detailed diagnostic reports for troubleshooting';
COMMENT ON TABLE resource_usage IS 'Resource usage monitoring for performance analysis';
COMMENT ON TABLE self_healing_logs IS 'Logs of automatic recovery attempts';
COMMENT ON FUNCTION analyze_error_patterns IS 'Analyzes error patterns to identify recurring issues';
COMMENT ON FUNCTION detect_error_anomalies IS 'Detects anomalous error rates compared to baseline';