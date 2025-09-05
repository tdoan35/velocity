-- Migration: Advanced AI Analytics and Logging System
-- Description: Comprehensive analytics schema for tracking AI performance, usage, and optimization

-- Create AI analytics events table (main fact table)
CREATE TABLE IF NOT EXISTS ai_analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'code_generation', 'prompt_optimization', 'context_assembly', 
    'code_analysis', 'code_enhancement', 'conversation', 'cache_hit', 'cache_miss'
  )),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  session_id UUID,
  
  -- Timing metrics
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  duration_ms INTEGER,
  
  -- Performance metrics
  tokens_input INTEGER,
  tokens_output INTEGER,
  tokens_total INTEGER,
  latency_ms INTEGER,
  
  -- Quality metrics
  quality_score DECIMAL(5,2),
  cache_hit BOOLEAN DEFAULT false,
  success BOOLEAN DEFAULT true,
  error_type VARCHAR(100),
  
  -- Request/Response data (for analysis)
  request_size_bytes INTEGER,
  response_size_bytes INTEGER,
  
  -- Metadata
  model_version VARCHAR(100),
  edge_function VARCHAR(100),
  client_version VARCHAR(50),
  platform VARCHAR(20),
  
  -- Denormalized data for fast queries
  hour_bucket TIMESTAMPTZ GENERATED ALWAYS AS (date_trunc('hour', timestamp)) STORED,
  day_bucket DATE GENERATED ALWAYS AS (date_trunc('day', timestamp)::date) STORED,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create cache performance metrics table
CREATE TABLE IF NOT EXISTS cache_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  cache_type VARCHAR(50) CHECK (cache_type IN ('prompt', 'response', 'context', 'embedding')),
  
  -- Performance metrics
  hit_count INTEGER DEFAULT 0,
  miss_count INTEGER DEFAULT 0,
  hit_rate DECIMAL(5,4) GENERATED ALWAYS AS (
    CASE 
      WHEN hit_count + miss_count > 0 
      THEN hit_count::DECIMAL / (hit_count + miss_count)
      ELSE 0
    END
  ) STORED,
  
  -- Size metrics
  cache_size_mb DECIMAL(10,2),
  items_count INTEGER,
  avg_item_size_kb DECIMAL(10,2),
  
  -- Efficiency metrics
  avg_similarity_score DECIMAL(3,2),
  avg_retrieval_time_ms DECIMAL(10,2),
  space_saved_mb DECIMAL(10,2),
  
  -- Time bucket for aggregation
  hour_bucket TIMESTAMPTZ GENERATED ALWAYS AS (date_trunc('hour', timestamp)) STORED,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create usage tracking table
CREATE TABLE IF NOT EXISTS ai_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id),
  subscription_tier VARCHAR(50),
  
  -- Usage metrics
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  
  -- Token usage
  tokens_used INTEGER DEFAULT 0,
  tokens_limit INTEGER,
  
  -- Request counts
  requests_count INTEGER DEFAULT 0,
  requests_limit INTEGER,
  
  -- Feature usage
  code_generations INTEGER DEFAULT 0,
  prompt_optimizations INTEGER DEFAULT 0,
  code_analyses INTEGER DEFAULT 0,
  conversations INTEGER DEFAULT 0,
  
  -- Cost tracking
  estimated_cost DECIMAL(10,4) DEFAULT 0,
  
  -- Constraints
  UNIQUE(user_id, project_id, period_start),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create quality metrics table
CREATE TABLE IF NOT EXISTS ai_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES ai_analytics_events(id) ON DELETE CASCADE,
  
  -- Quality scores
  prompt_clarity_score DECIMAL(3,2),
  response_relevance_score DECIMAL(3,2),
  code_correctness_score DECIMAL(3,2),
  
  -- User feedback
  user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
  feedback_positive BOOLEAN,
  
  -- Automated quality checks
  syntax_valid BOOLEAN,
  best_practices_followed BOOLEAN,
  security_issues_found INTEGER DEFAULT 0,
  performance_issues_found INTEGER DEFAULT 0,
  
  -- Improvement metrics
  enhanced BOOLEAN DEFAULT false,
  enhancement_score_delta DECIMAL(5,2),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create performance alerts table
CREATE TABLE IF NOT EXISTS ai_performance_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR(50) CHECK (alert_type IN (
    'high_latency', 'low_cache_hit', 'error_spike', 'quota_warning', 
    'quality_degradation', 'cost_overrun'
  )),
  severity VARCHAR(20) CHECK (severity IN ('info', 'warning', 'critical')),
  
  -- Alert details
  metric_name VARCHAR(100),
  threshold_value DECIMAL(10,2),
  actual_value DECIMAL(10,2),
  
  -- Context
  user_id UUID REFERENCES auth.users(id),
  project_id UUID REFERENCES projects(id),
  
  -- Status
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved')),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  
  -- Notification
  notification_sent BOOLEAN DEFAULT false,
  notification_channels TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create aggregated metrics views for dashboards
CREATE MATERIALIZED VIEW IF NOT EXISTS ai_metrics_hourly AS
SELECT 
  hour_bucket,
  event_type,
  COUNT(*) as event_count,
  AVG(duration_ms) as avg_duration_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as median_duration_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms) as p95_duration_ms,
  SUM(tokens_total) as total_tokens,
  AVG(quality_score) as avg_quality_score,
  SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) as cache_hit_rate,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) as success_rate
FROM ai_analytics_events
GROUP BY hour_bucket, event_type;

CREATE MATERIALIZED VIEW IF NOT EXISTS ai_metrics_daily AS
SELECT 
  day_bucket,
  COUNT(DISTINCT user_id) as unique_users,
  COUNT(DISTINCT project_id) as unique_projects,
  COUNT(*) as total_events,
  SUM(tokens_total) as total_tokens,
  AVG(duration_ms) as avg_duration_ms,
  AVG(quality_score) as avg_quality_score,
  SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) as cache_hit_rate,
  SUM(CASE WHEN success THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0) as success_rate,
  SUM(tokens_total * 0.00002) as estimated_cost -- Rough cost estimate
FROM ai_analytics_events
GROUP BY day_bucket;

-- Create indexes for performance
CREATE INDEX idx_analytics_events_timestamp ON ai_analytics_events(timestamp);
CREATE INDEX idx_analytics_events_user ON ai_analytics_events(user_id);
CREATE INDEX idx_analytics_events_project ON ai_analytics_events(project_id);
CREATE INDEX idx_analytics_events_type ON ai_analytics_events(event_type);
CREATE INDEX idx_analytics_events_hour ON ai_analytics_events(hour_bucket);
CREATE INDEX idx_analytics_events_day ON ai_analytics_events(day_bucket);
CREATE INDEX idx_cache_metrics_timestamp ON cache_metrics(timestamp);
CREATE INDEX idx_usage_tracking_user ON ai_usage_tracking(user_id);
CREATE INDEX idx_usage_tracking_period ON ai_usage_tracking(period_start);
CREATE INDEX idx_alerts_status ON ai_performance_alerts(status);
CREATE INDEX idx_alerts_type ON ai_performance_alerts(alert_type);

-- Enable RLS
ALTER TABLE ai_analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_quality_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_performance_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can see their own analytics
CREATE POLICY "Users can view own analytics" ON ai_analytics_events
  FOR SELECT USING (user_id = auth.uid());

-- Users can see their own usage tracking
CREATE POLICY "Users can view own usage" ON ai_usage_tracking
  FOR SELECT USING (user_id = auth.uid());

-- Admins can see all analytics
CREATE POLICY "Admins can view all analytics" ON ai_analytics_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_subscriptions 
      WHERE user_id = auth.uid() 
      AND subscription_tier = 'admin'
    )
  );

-- Cache metrics are viewable by authenticated users
CREATE POLICY "Authenticated users can view cache metrics" ON cache_metrics
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Users can see their own quality metrics
CREATE POLICY "Users can view own quality metrics" ON ai_quality_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ai_analytics_events 
      WHERE id = ai_quality_metrics.event_id 
      AND user_id = auth.uid()
    )
  );

-- Users can see their own alerts
CREATE POLICY "Users can view own alerts" ON ai_performance_alerts
  FOR SELECT USING (user_id = auth.uid());

-- Functions for analytics

-- Function to track AI event
CREATE OR REPLACE FUNCTION track_ai_event(
  p_event_type VARCHAR,
  p_user_id UUID,
  p_project_id UUID,
  p_duration_ms INTEGER,
  p_tokens_input INTEGER,
  p_tokens_output INTEGER,
  p_quality_score DECIMAL,
  p_cache_hit BOOLEAN,
  p_metadata JSONB
) RETURNS UUID AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO ai_analytics_events (
    event_type,
    user_id,
    project_id,
    duration_ms,
    tokens_input,
    tokens_output,
    tokens_total,
    quality_score,
    cache_hit,
    model_version,
    edge_function,
    success
  ) VALUES (
    p_event_type,
    p_user_id,
    p_project_id,
    p_duration_ms,
    p_tokens_input,
    p_tokens_output,
    COALESCE(p_tokens_input, 0) + COALESCE(p_tokens_output, 0),
    p_quality_score,
    p_cache_hit,
    p_metadata->>'model_version',
    p_metadata->>'edge_function',
    COALESCE((p_metadata->>'success')::boolean, true)
  ) RETURNING id INTO v_event_id;
  
  -- Update usage tracking
  PERFORM update_usage_tracking(p_user_id, p_project_id, p_event_type, COALESCE(p_tokens_input, 0) + COALESCE(p_tokens_output, 0));
  
  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to update usage tracking
CREATE OR REPLACE FUNCTION update_usage_tracking(
  p_user_id UUID,
  p_project_id UUID,
  p_event_type VARCHAR,
  p_tokens INTEGER
) RETURNS VOID AS $$
BEGIN
  INSERT INTO ai_usage_tracking (
    user_id,
    project_id,
    period_start,
    period_end,
    tokens_used,
    requests_count
  ) VALUES (
    p_user_id,
    p_project_id,
    date_trunc('month', CURRENT_DATE),
    date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day',
    p_tokens,
    1
  ) ON CONFLICT (user_id, project_id, period_start) DO UPDATE SET
    tokens_used = ai_usage_tracking.tokens_used + p_tokens,
    requests_count = ai_usage_tracking.requests_count + 1,
    updated_at = NOW();
    
  -- Update specific feature counters
  CASE p_event_type
    WHEN 'code_generation' THEN
      UPDATE ai_usage_tracking 
      SET code_generations = code_generations + 1
      WHERE user_id = p_user_id 
        AND project_id = p_project_id 
        AND period_start = date_trunc('month', CURRENT_DATE);
    WHEN 'prompt_optimization' THEN
      UPDATE ai_usage_tracking 
      SET prompt_optimizations = prompt_optimizations + 1
      WHERE user_id = p_user_id 
        AND project_id = p_project_id 
        AND period_start = date_trunc('month', CURRENT_DATE);
    WHEN 'code_analysis' THEN
      UPDATE ai_usage_tracking 
      SET code_analyses = code_analyses + 1
      WHERE user_id = p_user_id 
        AND project_id = p_project_id 
        AND period_start = date_trunc('month', CURRENT_DATE);
    WHEN 'conversation' THEN
      UPDATE ai_usage_tracking 
      SET conversations = conversations + 1
      WHERE user_id = p_user_id 
        AND project_id = p_project_id 
        AND period_start = date_trunc('month', CURRENT_DATE);
    ELSE
      -- Do nothing for other event types
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to check performance thresholds and create alerts
CREATE OR REPLACE FUNCTION check_performance_alerts() RETURNS VOID AS $$
DECLARE
  v_avg_latency DECIMAL;
  v_cache_hit_rate DECIMAL;
  v_error_rate DECIMAL;
BEGIN
  -- Check average latency in last hour
  SELECT AVG(duration_ms) INTO v_avg_latency
  FROM ai_analytics_events
  WHERE timestamp >= NOW() - INTERVAL '1 hour';
  
  IF v_avg_latency > 5000 THEN
    INSERT INTO ai_performance_alerts (
      alert_type,
      severity,
      metric_name,
      threshold_value,
      actual_value
    ) VALUES (
      'high_latency',
      CASE WHEN v_avg_latency > 10000 THEN 'critical' ELSE 'warning' END,
      'average_latency_ms',
      5000,
      v_avg_latency
    );
  END IF;
  
  -- Check cache hit rate
  SELECT 
    SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0)
  INTO v_cache_hit_rate
  FROM ai_analytics_events
  WHERE timestamp >= NOW() - INTERVAL '1 hour'
    AND event_type IN ('code_generation', 'prompt_optimization');
  
  IF v_cache_hit_rate < 0.5 THEN
    INSERT INTO ai_performance_alerts (
      alert_type,
      severity,
      metric_name,
      threshold_value,
      actual_value
    ) VALUES (
      'low_cache_hit',
      'warning',
      'cache_hit_rate',
      0.5,
      v_cache_hit_rate
    );
  END IF;
  
  -- Check error rate
  SELECT 
    SUM(CASE WHEN NOT success THEN 1 ELSE 0 END)::FLOAT / NULLIF(COUNT(*), 0)
  INTO v_error_rate
  FROM ai_analytics_events
  WHERE timestamp >= NOW() - INTERVAL '1 hour';
  
  IF v_error_rate > 0.05 THEN
    INSERT INTO ai_performance_alerts (
      alert_type,
      severity,
      metric_name,
      threshold_value,
      actual_value
    ) VALUES (
      'error_spike',
      CASE WHEN v_error_rate > 0.1 THEN 'critical' ELSE 'warning' END,
      'error_rate',
      0.05,
      v_error_rate
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create scheduled job to refresh materialized views
-- Note: This would typically be done with pg_cron or external scheduler
COMMENT ON MATERIALIZED VIEW ai_metrics_hourly IS 'Refresh every hour with: REFRESH MATERIALIZED VIEW CONCURRENTLY ai_metrics_hourly;';
COMMENT ON MATERIALIZED VIEW ai_metrics_daily IS 'Refresh every day with: REFRESH MATERIALIZED VIEW CONCURRENTLY ai_metrics_daily;';