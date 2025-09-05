-- Migration: Performance optimization tables
-- Description: Cache entries, rate limiting, and performance tracking

-- Create cache entries table
CREATE TABLE IF NOT EXISTS cache_entries (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB NOT NULL,
  compressed BOOLEAN DEFAULT false,
  ttl INTEGER NOT NULL DEFAULT 3600,
  tags TEXT[] DEFAULT '{}',
  dependencies TEXT[] DEFAULT '{}',
  priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  size INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 0
);

-- Create indexes for cache performance
CREATE INDEX idx_cache_tags ON cache_entries USING GIN (tags);
CREATE INDEX idx_cache_created ON cache_entries(created_at);
CREATE INDEX idx_cache_priority ON cache_entries(priority);
CREATE INDEX idx_cache_last_accessed ON cache_entries(last_accessed_at);

-- Create rate limit logs table
CREATE TABLE IF NOT EXISTS rate_limit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  resource VARCHAR(100) NOT NULL,
  weight INTEGER DEFAULT 1,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'
);

-- Create indexes for rate limiting
CREATE INDEX idx_rate_limit_user_resource ON rate_limit_logs(user_id, resource);
CREATE INDEX idx_rate_limit_timestamp ON rate_limit_logs(timestamp);

-- Create connection pool stats table
CREATE TABLE IF NOT EXISTS connection_pool_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_name VARCHAR(100) NOT NULL,
  active_connections INTEGER DEFAULT 0,
  idle_connections INTEGER DEFAULT 0,
  waiting_requests INTEGER DEFAULT 0,
  total_connections INTEGER DEFAULT 0,
  max_connections INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create performance metrics table
CREATE TABLE IF NOT EXISTS performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name VARCHAR(100) NOT NULL,
  operation VARCHAR(100) NOT NULL,
  duration_ms INTEGER NOT NULL,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance metrics
CREATE INDEX idx_perf_metrics_function ON performance_metrics(function_name);
CREATE INDEX idx_perf_metrics_operation ON performance_metrics(operation);
CREATE INDEX idx_perf_metrics_created ON performance_metrics(created_at);
CREATE INDEX idx_perf_metrics_duration ON performance_metrics(duration_ms);

-- Create batch processing queue table
CREATE TABLE IF NOT EXISTS batch_processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  items JSONB NOT NULL,
  priority INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  retry_count INTEGER DEFAULT 0,
  result JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Create indexes for batch processing
CREATE INDEX idx_batch_status ON batch_processing_queue(status);
CREATE INDEX idx_batch_priority ON batch_processing_queue(priority DESC);
CREATE INDEX idx_batch_created ON batch_processing_queue(created_at);

-- Create response compression stats table
CREATE TABLE IF NOT EXISTS compression_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint VARCHAR(255) NOT NULL,
  original_size INTEGER NOT NULL,
  compressed_size INTEGER NOT NULL,
  compression_ratio DECIMAL(5,2) GENERATED ALWAYS AS (
    CASE 
      WHEN original_size > 0 
      THEN ROUND((1.0 - compressed_size::DECIMAL / original_size) * 100, 2)
      ELSE 0
    END
  ) STORED,
  compression_time_ms INTEGER NOT NULL,
  algorithm VARCHAR(20) DEFAULT 'gzip',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE cache_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_pool_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE batch_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE compression_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Cache entries are isolated per user
CREATE POLICY "Service role can manage all cache entries" ON cache_entries
  FOR ALL USING (auth.role() = 'service_role');

-- Rate limit logs are user-specific
CREATE POLICY "Users can view own rate limit logs" ON rate_limit_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role can manage rate limit logs" ON rate_limit_logs
  FOR ALL USING (auth.role() = 'service_role');

-- Other tables are service-role only
CREATE POLICY "Service role only" ON connection_pool_stats
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role only" ON performance_metrics
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role only" ON batch_processing_queue
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role only" ON compression_stats
  FOR ALL USING (auth.role() = 'service_role');

-- Functions for performance optimization

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache() RETURNS void AS $$
BEGIN
  DELETE FROM cache_entries
  WHERE created_at + (ttl || ' seconds')::INTERVAL < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to get cache statistics
CREATE OR REPLACE FUNCTION get_cache_statistics() RETURNS TABLE (
  total_entries BIGINT,
  total_size_mb DECIMAL,
  avg_ttl INTEGER,
  hit_rate DECIMAL,
  tags_distribution JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_entries,
    ROUND(SUM(size)::DECIMAL / 1048576, 2) as total_size_mb,
    ROUND(AVG(ttl))::INTEGER as avg_ttl,
    ROUND(AVG(CASE WHEN access_count > 0 THEN 1.0 ELSE 0.0 END), 2) as hit_rate,
    jsonb_object_agg(tag, tag_count) as tags_distribution
  FROM (
    SELECT 
      size, 
      ttl, 
      access_count,
      unnest(tags) as tag
    FROM cache_entries
  ) t
  LEFT JOIN LATERAL (
    SELECT COUNT(*) as tag_count
    FROM cache_entries
    WHERE tag = ANY(tags)
  ) tc ON true
  GROUP BY tag;
END;
$$ LANGUAGE plpgsql;

-- Function to get rate limit status for a user
CREATE OR REPLACE FUNCTION get_rate_limit_status(
  p_user_id UUID,
  p_resource VARCHAR,
  p_window_seconds INTEGER
) RETURNS TABLE (
  request_count BIGINT,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as request_count,
    NOW() - (p_window_seconds || ' seconds')::INTERVAL as window_start,
    NOW() as window_end
  FROM rate_limit_logs
  WHERE user_id = p_user_id
    AND resource = p_resource
    AND timestamp >= NOW() - (p_window_seconds || ' seconds')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to record performance metric
CREATE OR REPLACE FUNCTION record_performance_metric(
  p_function_name VARCHAR,
  p_operation VARCHAR,
  p_duration_ms INTEGER,
  p_success BOOLEAN DEFAULT true,
  p_error_message TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
  v_metric_id UUID;
BEGIN
  INSERT INTO performance_metrics (
    function_name,
    operation,
    duration_ms,
    success,
    error_message,
    metadata
  ) VALUES (
    p_function_name,
    p_operation,
    p_duration_ms,
    p_success,
    p_error_message,
    p_metadata
  ) RETURNING id INTO v_metric_id;
  
  RETURN v_metric_id;
END;
$$ LANGUAGE plpgsql;

-- Create scheduled job to clean cache (requires pg_cron extension)
-- SELECT cron.schedule('cleanup-cache', '0 * * * *', 'SELECT cleanup_expired_cache();');

-- Create materialized view for performance dashboard
CREATE MATERIALIZED VIEW IF NOT EXISTS performance_summary AS
SELECT 
  function_name,
  operation,
  COUNT(*) as total_calls,
  COUNT(CASE WHEN success THEN 1 END) as successful_calls,
  COUNT(CASE WHEN NOT success THEN 1 END) as failed_calls,
  ROUND(AVG(duration_ms)) as avg_duration_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as median_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration_ms,
  PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration_ms) as p99_duration_ms,
  MIN(duration_ms) as min_duration_ms,
  MAX(duration_ms) as max_duration_ms,
  DATE_TRUNC('hour', MIN(created_at)) as first_seen,
  DATE_TRUNC('hour', MAX(created_at)) as last_seen
FROM performance_metrics
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY function_name, operation;

-- Create index on materialized view
CREATE INDEX idx_perf_summary_function ON performance_summary(function_name);

-- Refresh materialized view periodically
-- SELECT cron.schedule('refresh-performance-summary', '*/15 * * * *', 'REFRESH MATERIALIZED VIEW CONCURRENTLY performance_summary;');