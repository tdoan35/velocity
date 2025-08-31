-- Migration to add monitoring and alerting tables
-- This extends the preview system with comprehensive monitoring capabilities

-- Table for storing system events (errors, warnings, info events)
CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  data JSONB,
  severity TEXT CHECK (severity IN ('info', 'warning', 'error', 'critical')) DEFAULT 'info',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying by type and timestamp
CREATE INDEX IF NOT EXISTS idx_system_events_type ON system_events(type);
CREATE INDEX IF NOT EXISTS idx_system_events_timestamp ON system_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_events_severity ON system_events(severity);

-- Table for storing system alerts
CREATE TABLE IF NOT EXISTS system_alerts (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('warning', 'error', 'critical')) NOT NULL,
  resolved BOOLEAN DEFAULT FALSE,
  data JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying by type, severity, and resolved status
CREATE INDEX IF NOT EXISTS idx_system_alerts_type ON system_alerts(type);
CREATE INDEX IF NOT EXISTS idx_system_alerts_severity ON system_alerts(severity);
CREATE INDEX IF NOT EXISTS idx_system_alerts_resolved ON system_alerts(resolved);
CREATE INDEX IF NOT EXISTS idx_system_alerts_timestamp ON system_alerts(timestamp DESC);

-- Table for storing system metrics (for historical tracking)
CREATE TABLE IF NOT EXISTS system_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  value NUMERIC NOT NULL,
  tags JSONB,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying by metric name and timestamp
CREATE INDEX IF NOT EXISTS idx_system_metrics_name ON system_metrics(name);
CREATE INDEX IF NOT EXISTS idx_system_metrics_timestamp ON system_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_system_metrics_name_timestamp ON system_metrics(name, timestamp DESC);

-- Table for storing container resource usage metrics
CREATE TABLE IF NOT EXISTS container_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES preview_sessions(id) ON DELETE CASCADE,
  container_id TEXT NOT NULL,
  cpu_usage NUMERIC,
  memory_usage NUMERIC,
  disk_usage NUMERIC,
  network_in NUMERIC,
  network_out NUMERIC,
  uptime INTEGER, -- seconds
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient querying by session and timestamp
CREATE INDEX IF NOT EXISTS idx_container_metrics_session ON container_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_container_metrics_container ON container_metrics(container_id);
CREATE INDEX IF NOT EXISTS idx_container_metrics_timestamp ON container_metrics(timestamp DESC);

-- Update the existing preview_sessions table with monitoring fields
ALTER TABLE preview_sessions
  ADD COLUMN IF NOT EXISTS last_health_check TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS health_status TEXT CHECK (health_status IN ('healthy', 'warning', 'critical')) DEFAULT 'healthy',
  ADD COLUMN IF NOT EXISTS resource_warnings TEXT[],
  ADD COLUMN IF NOT EXISTS monitoring_data JSONB;

-- Index for monitoring queries
CREATE INDEX IF NOT EXISTS idx_preview_sessions_health ON preview_sessions(health_status);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_health_check ON preview_sessions(last_health_check);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at for system_alerts
DROP TRIGGER IF EXISTS system_alerts_update_updated_at ON system_alerts;
CREATE TRIGGER system_alerts_update_updated_at
  BEFORE UPDATE ON system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- View for latest system health metrics
CREATE OR REPLACE VIEW system_health_summary AS
SELECT 
  'active_sessions' as metric,
  COUNT(*) as value,
  NOW() as timestamp
FROM preview_sessions 
WHERE status IN ('creating', 'active')

UNION ALL

SELECT 
  'healthy_sessions' as metric,
  COUNT(*) as value,
  NOW() as timestamp
FROM preview_sessions 
WHERE status IN ('creating', 'active') AND health_status = 'healthy'

UNION ALL

SELECT 
  'warning_sessions' as metric,
  COUNT(*) as value,
  NOW() as timestamp
FROM preview_sessions 
WHERE status IN ('creating', 'active') AND health_status = 'warning'

UNION ALL

SELECT 
  'critical_sessions' as metric,
  COUNT(*) as value,
  NOW() as timestamp
FROM preview_sessions 
WHERE status IN ('creating', 'active') AND health_status = 'critical'

UNION ALL

SELECT 
  'total_alerts' as metric,
  COUNT(*) as value,
  NOW() as timestamp
FROM system_alerts 
WHERE NOT resolved

UNION ALL

SELECT 
  'critical_alerts' as metric,
  COUNT(*) as value,
  NOW() as timestamp
FROM system_alerts 
WHERE NOT resolved AND severity = 'critical';

-- View for session monitoring with resource usage
CREATE OR REPLACE VIEW session_monitoring_view AS
SELECT 
  ps.id,
  ps.user_id,
  ps.project_id,
  ps.session_id,
  ps.container_id,
  ps.container_url,
  ps.status,
  ps.tier,
  ps.health_status,
  ps.resource_limits,
  ps.resource_warnings,
  ps.created_at,
  ps.expires_at,
  ps.last_health_check,
  cm.cpu_usage,
  cm.memory_usage,
  cm.disk_usage,
  cm.network_in,
  cm.network_out,
  cm.uptime,
  cm.timestamp as metrics_timestamp
FROM preview_sessions ps
LEFT JOIN LATERAL (
  SELECT * FROM container_metrics 
  WHERE container_id = ps.container_id 
  ORDER BY timestamp DESC 
  LIMIT 1
) cm ON true
WHERE ps.status IN ('creating', 'active')
ORDER BY ps.created_at DESC;

-- Grant permissions for the service role to access monitoring tables
GRANT ALL ON system_events TO service_role;
GRANT ALL ON system_alerts TO service_role;
GRANT ALL ON system_metrics TO service_role;
GRANT ALL ON container_metrics TO service_role;
GRANT SELECT ON system_health_summary TO service_role;
GRANT SELECT ON session_monitoring_view TO service_role;

-- Add comments for documentation
COMMENT ON TABLE system_events IS 'Stores system events including errors, warnings, and informational messages';
COMMENT ON TABLE system_alerts IS 'Stores system alerts that require attention or action';
COMMENT ON TABLE system_metrics IS 'Historical storage of system metrics for trend analysis';
COMMENT ON TABLE container_metrics IS 'Resource usage metrics for individual containers';
COMMENT ON VIEW system_health_summary IS 'Real-time view of key system health metrics';
COMMENT ON VIEW session_monitoring_view IS 'Comprehensive view combining session status with resource metrics';