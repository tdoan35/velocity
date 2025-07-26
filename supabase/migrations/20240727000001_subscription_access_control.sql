-- Migration: Subscription-based access control system
-- Description: Complete subscription management with tiers, features, usage tracking, and billing

-- Create subscription tiers table
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_yearly DECIMAL(10,2) NOT NULL,
  
  -- Token limits
  tokens_per_month INTEGER NOT NULL,
  tokens_per_day INTEGER,
  max_tokens_per_request INTEGER DEFAULT 4096,
  
  -- Request limits
  requests_per_month INTEGER NOT NULL,
  requests_per_day INTEGER,
  requests_per_minute INTEGER,
  concurrent_requests INTEGER DEFAULT 1,
  
  -- Feature limits
  max_projects INTEGER DEFAULT 1,
  max_team_members INTEGER DEFAULT 1,
  max_file_size_mb INTEGER DEFAULT 10,
  max_context_size_kb INTEGER DEFAULT 50,
  
  -- Feature flags
  features JSONB DEFAULT '{}',
  
  -- Metadata
  badge_color VARCHAR(7),
  priority_support BOOLEAN DEFAULT false,
  sla_hours INTEGER, -- Response time SLA in hours
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default subscription tiers
INSERT INTO subscription_tiers (id, name, display_name, description, price_monthly, price_yearly, 
  tokens_per_month, requests_per_month, features, badge_color) VALUES
  
('free', 'free', 'Free', 'Perfect for trying out Velocity', 0, 0, 
  100000, 100, 
  '{"code_generation": true, "basic_components": true, "preview": true, "export": false, "collaboration": false, "custom_models": false, "priority_generation": false, "advanced_analytics": false}',
  '#6B7280'),

('starter', 'starter', 'Starter', 'For individual developers', 29, 290,
  500000, 1000,
  '{"code_generation": true, "basic_components": true, "advanced_components": true, "preview": true, "export": true, "collaboration": false, "custom_models": false, "priority_generation": false, "advanced_analytics": false, "code_optimization": true}',
  '#3B82F6'),

('pro', 'pro', 'Professional', 'For professional developers and small teams', 99, 990,
  2000000, 5000,
  '{"code_generation": true, "basic_components": true, "advanced_components": true, "preview": true, "export": true, "collaboration": true, "custom_models": true, "priority_generation": true, "advanced_analytics": true, "code_optimization": true, "quality_analysis": true, "team_workspace": true}',
  '#8B5CF6'),

('enterprise', 'enterprise', 'Enterprise', 'For large teams and organizations', 499, 4990,
  -1, -1, -- Unlimited
  '{"all": true}',
  '#DC2626');

-- Update tier-specific limits
UPDATE subscription_tiers SET 
  tokens_per_day = 5000,
  requests_per_day = 10,
  requests_per_minute = 2,
  max_projects = 1,
  max_file_size_mb = 5,
  max_context_size_kb = 25
WHERE id = 'free';

UPDATE subscription_tiers SET
  tokens_per_day = 25000,
  requests_per_day = 50,
  requests_per_minute = 10,
  max_projects = 5,
  max_team_members = 1,
  max_file_size_mb = 25,
  max_context_size_kb = 100,
  concurrent_requests = 3
WHERE id = 'starter';

UPDATE subscription_tiers SET
  tokens_per_day = 100000,
  requests_per_day = 200,
  requests_per_minute = 30,
  max_projects = 20,
  max_team_members = 10,
  max_file_size_mb = 100,
  max_context_size_kb = 500,
  concurrent_requests = 10,
  priority_support = true,
  sla_hours = 24
WHERE id = 'pro';

UPDATE subscription_tiers SET
  tokens_per_day = -1,
  requests_per_day = -1,
  requests_per_minute = 100,
  max_projects = -1,
  max_team_members = -1,
  max_file_size_mb = 500,
  max_context_size_kb = 2000,
  concurrent_requests = 50,
  priority_support = true,
  sla_hours = 4
WHERE id = 'enterprise';

-- Create user subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  subscription_tier VARCHAR(50) REFERENCES subscription_tiers(id) DEFAULT 'free',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'trial', 'suspended', 'cancelled', 'expired')),
  
  -- Billing info
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  payment_method_id VARCHAR(255),
  
  -- Subscription dates
  trial_start_at TIMESTAMPTZ,
  trial_end_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  
  -- Custom limits (for enterprise overrides)
  custom_limits JSONB,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create usage tracking table
CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  -- Period info
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_type VARCHAR(10) CHECK (period_type IN ('daily', 'monthly')),
  
  -- Token usage
  tokens_used INTEGER DEFAULT 0,
  tokens_cached INTEGER DEFAULT 0, -- Tokens saved by caching
  
  -- Request counts
  total_requests INTEGER DEFAULT 0,
  code_generation_requests INTEGER DEFAULT 0,
  optimization_requests INTEGER DEFAULT 0,
  analysis_requests INTEGER DEFAULT 0,
  
  -- Feature usage
  feature_usage JSONB DEFAULT '{}',
  
  -- Costs
  estimated_cost DECIMAL(10,4) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, project_id, period_start, period_type)
);

-- Create feature gates table
CREATE TABLE IF NOT EXISTS feature_gates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key VARCHAR(100) UNIQUE NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(50),
  
  -- Tier requirements
  minimum_tier VARCHAR(50) REFERENCES subscription_tiers(id),
  requires_features TEXT[], -- List of required feature flags
  
  -- Usage limits
  usage_limit_per_day INTEGER,
  usage_limit_per_month INTEGER,
  
  -- Additional checks
  custom_check_function VARCHAR(100), -- Name of RPC function for custom validation
  
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert feature gates
INSERT INTO feature_gates (feature_key, display_name, description, category, minimum_tier) VALUES
('code_generation', 'AI Code Generation', 'Generate React Native code from prompts', 'core', 'free'),
('advanced_components', 'Advanced Components', 'Complex UI components and animations', 'components', 'starter'),
('code_optimization', 'Code Optimization', 'Automatic code quality improvements', 'quality', 'starter'),
('quality_analysis', 'Quality Analysis', 'Deep code quality and security analysis', 'quality', 'pro'),
('team_collaboration', 'Team Collaboration', 'Share projects with team members', 'collaboration', 'pro'),
('custom_ai_models', 'Custom AI Models', 'Use custom-trained AI models', 'advanced', 'pro'),
('priority_generation', 'Priority Queue', 'Skip the queue during high load', 'performance', 'pro'),
('export_production', 'Production Export', 'Export production-ready applications', 'export', 'starter'),
('advanced_analytics', 'Advanced Analytics', 'Detailed usage and performance analytics', 'analytics', 'pro'),
('white_label', 'White Label', 'Remove Velocity branding', 'enterprise', 'enterprise');

-- Create billing events table
CREATE TABLE IF NOT EXISTS billing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'subscription_created', 'subscription_updated', 'subscription_cancelled',
    'payment_succeeded', 'payment_failed', 'invoice_created', 'invoice_paid',
    'trial_started', 'trial_ending', 'trial_ended', 'quota_exceeded'
  )),
  
  -- Event data
  subscription_tier VARCHAR(50),
  previous_tier VARCHAR(50),
  amount DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  
  -- Stripe references
  stripe_event_id VARCHAR(255),
  stripe_invoice_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create quota alerts table
CREATE TABLE IF NOT EXISTS quota_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) CHECK (alert_type IN (
    'tokens_50', 'tokens_80', 'tokens_90', 'tokens_100',
    'requests_50', 'requests_80', 'requests_90', 'requests_100'
  )),
  period_start DATE NOT NULL,
  usage_percent DECIMAL(5,2) NOT NULL,
  notification_sent BOOLEAN DEFAULT false,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, alert_type, period_start)
);

-- Create indexes
CREATE INDEX idx_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_subscriptions_stripe ON user_subscriptions(stripe_customer_id);
CREATE INDEX idx_usage_tracking_user_period ON usage_tracking(user_id, period_start);
CREATE INDEX idx_usage_tracking_project ON usage_tracking(project_id);
CREATE INDEX idx_billing_events_user ON billing_events(user_id);
CREATE INDEX idx_billing_events_type ON billing_events(event_type);
CREATE INDEX idx_quota_alerts_user ON quota_alerts(user_id);

-- Enable RLS
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE quota_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Subscription tiers are publicly readable
CREATE POLICY "Anyone can view subscription tiers" ON subscription_tiers
  FOR SELECT USING (true);

-- Users can view their own subscription
CREATE POLICY "Users can view own subscription" ON user_subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- Service role can manage subscriptions
CREATE POLICY "Service role can manage subscriptions" ON user_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- Users can view their own usage
CREATE POLICY "Users can view own usage" ON usage_tracking
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role can manage usage" ON usage_tracking
  FOR ALL USING (auth.role() = 'service_role');

-- Feature gates are publicly readable
CREATE POLICY "Anyone can view feature gates" ON feature_gates
  FOR SELECT USING (enabled = true);

-- Users can view their own billing events
CREATE POLICY "Users can view own billing events" ON billing_events
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Service role can manage billing events" ON billing_events
  FOR ALL USING (auth.role() = 'service_role');

-- Users can view and acknowledge their own quota alerts
CREATE POLICY "Users can view own quota alerts" ON quota_alerts
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can acknowledge own quota alerts" ON quota_alerts
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Helper functions

-- Function to check feature access
CREATE OR REPLACE FUNCTION check_feature_access(
  p_user_id UUID,
  p_feature_key VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
  v_user_tier VARCHAR;
  v_minimum_tier VARCHAR;
  v_tier_order INTEGER;
  v_minimum_tier_order INTEGER;
  v_custom_limits JSONB;
  v_feature_enabled BOOLEAN;
BEGIN
  -- Get user's subscription tier
  SELECT subscription_tier, custom_limits INTO v_user_tier, v_custom_limits
  FROM user_subscriptions
  WHERE user_id = p_user_id AND status = 'active';
  
  IF v_user_tier IS NULL THEN
    v_user_tier := 'free';
  END IF;
  
  -- Check custom limits first (for enterprise overrides)
  IF v_custom_limits IS NOT NULL AND v_custom_limits->>'features' IS NOT NULL THEN
    v_feature_enabled := (v_custom_limits->'features'->p_feature_key)::boolean;
    IF v_feature_enabled IS NOT NULL THEN
      RETURN v_feature_enabled;
    END IF;
  END IF;
  
  -- Get feature requirements
  SELECT minimum_tier INTO v_minimum_tier
  FROM feature_gates
  WHERE feature_key = p_feature_key AND enabled = true;
  
  IF v_minimum_tier IS NULL THEN
    RETURN false; -- Feature not found or disabled
  END IF;
  
  -- Define tier order
  CASE v_user_tier
    WHEN 'free' THEN v_tier_order := 1;
    WHEN 'starter' THEN v_tier_order := 2;
    WHEN 'pro' THEN v_tier_order := 3;
    WHEN 'enterprise' THEN v_tier_order := 4;
    ELSE v_tier_order := 0;
  END CASE;
  
  CASE v_minimum_tier
    WHEN 'free' THEN v_minimum_tier_order := 1;
    WHEN 'starter' THEN v_minimum_tier_order := 2;
    WHEN 'pro' THEN v_minimum_tier_order := 3;
    WHEN 'enterprise' THEN v_minimum_tier_order := 4;
    ELSE v_minimum_tier_order := 5;
  END CASE;
  
  RETURN v_tier_order >= v_minimum_tier_order;
END;
$$ LANGUAGE plpgsql;

-- Function to track usage
CREATE OR REPLACE FUNCTION track_usage(
  p_user_id UUID,
  p_project_id UUID,
  p_usage_type VARCHAR,
  p_tokens INTEGER DEFAULT 0,
  p_metadata JSONB DEFAULT '{}'
) RETURNS VOID AS $$
BEGIN
  -- Update daily usage
  INSERT INTO usage_tracking (
    user_id,
    project_id,
    period_start,
    period_end,
    period_type,
    tokens_used,
    total_requests
  ) VALUES (
    p_user_id,
    p_project_id,
    CURRENT_DATE,
    CURRENT_DATE,
    'daily',
    p_tokens,
    1
  ) ON CONFLICT (user_id, project_id, period_start, period_type) DO UPDATE SET
    tokens_used = usage_tracking.tokens_used + p_tokens,
    total_requests = usage_tracking.total_requests + 1,
    updated_at = NOW();
  
  -- Update monthly usage
  INSERT INTO usage_tracking (
    user_id,
    project_id,
    period_start,
    period_end,
    period_type,
    tokens_used,
    total_requests
  ) VALUES (
    p_user_id,
    p_project_id,
    date_trunc('month', CURRENT_DATE),
    date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day',
    'monthly',
    p_tokens,
    1
  ) ON CONFLICT (user_id, project_id, period_start, period_type) DO UPDATE SET
    tokens_used = usage_tracking.tokens_used + p_tokens,
    total_requests = usage_tracking.total_requests + 1,
    updated_at = NOW();
  
  -- Update specific request type counter
  CASE p_usage_type
    WHEN 'code_generation' THEN
      UPDATE usage_tracking 
      SET code_generation_requests = code_generation_requests + 1
      WHERE user_id = p_user_id 
        AND project_id = p_project_id 
        AND period_start IN (CURRENT_DATE, date_trunc('month', CURRENT_DATE));
    WHEN 'optimization' THEN
      UPDATE usage_tracking 
      SET optimization_requests = optimization_requests + 1
      WHERE user_id = p_user_id 
        AND project_id = p_project_id 
        AND period_start IN (CURRENT_DATE, date_trunc('month', CURRENT_DATE));
    WHEN 'analysis' THEN
      UPDATE usage_tracking 
      SET analysis_requests = analysis_requests + 1
      WHERE user_id = p_user_id 
        AND project_id = p_project_id 
        AND period_start IN (CURRENT_DATE, date_trunc('month', CURRENT_DATE));
  END CASE;
  
  -- Check and create quota alerts
  PERFORM check_quota_alerts(p_user_id);
END;
$$ LANGUAGE plpgsql;

-- Function to check quota alerts
CREATE OR REPLACE FUNCTION check_quota_alerts(p_user_id UUID) RETURNS VOID AS $$
DECLARE
  v_tier_limits RECORD;
  v_usage RECORD;
  v_token_percent DECIMAL;
  v_request_percent DECIMAL;
BEGIN
  -- Get user's tier limits
  SELECT t.* INTO v_tier_limits
  FROM subscription_tiers t
  JOIN user_subscriptions s ON s.subscription_tier = t.id
  WHERE s.user_id = p_user_id AND s.status = 'active';
  
  IF v_tier_limits IS NULL THEN
    -- Default to free tier
    SELECT * INTO v_tier_limits FROM subscription_tiers WHERE id = 'free';
  END IF;
  
  -- Get current month usage
  SELECT * INTO v_usage
  FROM usage_tracking
  WHERE user_id = p_user_id
    AND period_type = 'monthly'
    AND period_start = date_trunc('month', CURRENT_DATE);
  
  IF v_usage IS NOT NULL AND v_tier_limits.tokens_per_month > 0 THEN
    v_token_percent := (v_usage.tokens_used::DECIMAL / v_tier_limits.tokens_per_month) * 100;
    
    -- Create alerts at 50%, 80%, 90%, and 100%
    IF v_token_percent >= 50 THEN
      INSERT INTO quota_alerts (user_id, alert_type, period_start, usage_percent)
      VALUES (p_user_id, 'tokens_50', v_usage.period_start, v_token_percent)
      ON CONFLICT DO NOTHING;
    END IF;
    
    IF v_token_percent >= 80 THEN
      INSERT INTO quota_alerts (user_id, alert_type, period_start, usage_percent)
      VALUES (p_user_id, 'tokens_80', v_usage.period_start, v_token_percent)
      ON CONFLICT DO NOTHING;
    END IF;
    
    IF v_token_percent >= 90 THEN
      INSERT INTO quota_alerts (user_id, alert_type, period_start, usage_percent)
      VALUES (p_user_id, 'tokens_90', v_usage.period_start, v_token_percent)
      ON CONFLICT DO NOTHING;
    END IF;
    
    IF v_token_percent >= 100 THEN
      INSERT INTO quota_alerts (user_id, alert_type, period_start, usage_percent)
      VALUES (p_user_id, 'tokens_100', v_usage.period_start, v_token_percent)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  
  -- Similar checks for requests
  IF v_usage IS NOT NULL AND v_tier_limits.requests_per_month > 0 THEN
    v_request_percent := (v_usage.total_requests::DECIMAL / v_tier_limits.requests_per_month) * 100;
    
    IF v_request_percent >= 50 THEN
      INSERT INTO quota_alerts (user_id, alert_type, period_start, usage_percent)
      VALUES (p_user_id, 'requests_50', v_usage.period_start, v_request_percent)
      ON CONFLICT DO NOTHING;
    END IF;
    
    -- Add other percentage thresholds...
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get remaining quota
CREATE OR REPLACE FUNCTION get_remaining_quota(
  p_user_id UUID,
  p_quota_type VARCHAR DEFAULT 'tokens'
) RETURNS TABLE (
  limit_value INTEGER,
  used_value INTEGER,
  remaining_value INTEGER,
  percent_used DECIMAL
) AS $$
DECLARE
  v_tier_limits RECORD;
  v_usage RECORD;
BEGIN
  -- Get user's tier limits
  SELECT t.* INTO v_tier_limits
  FROM subscription_tiers t
  JOIN user_subscriptions s ON s.subscription_tier = t.id
  WHERE s.user_id = p_user_id AND s.status = 'active';
  
  IF v_tier_limits IS NULL THEN
    SELECT * INTO v_tier_limits FROM subscription_tiers WHERE id = 'free';
  END IF;
  
  -- Get current month usage
  SELECT * INTO v_usage
  FROM usage_tracking
  WHERE user_id = p_user_id
    AND period_type = 'monthly'
    AND period_start = date_trunc('month', CURRENT_DATE);
  
  IF p_quota_type = 'tokens' THEN
    limit_value := v_tier_limits.tokens_per_month;
    used_value := COALESCE(v_usage.tokens_used, 0);
  ELSIF p_quota_type = 'requests' THEN
    limit_value := v_tier_limits.requests_per_month;
    used_value := COALESCE(v_usage.total_requests, 0);
  END IF;
  
  IF limit_value = -1 THEN -- Unlimited
    remaining_value := -1;
    percent_used := 0;
  ELSE
    remaining_value := GREATEST(0, limit_value - used_value);
    percent_used := CASE 
      WHEN limit_value > 0 THEN (used_value::DECIMAL / limit_value) * 100
      ELSE 100
    END;
  END IF;
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update user_subscriptions updated_at
CREATE OR REPLACE FUNCTION update_subscription_timestamp() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_subscriptions_timestamp
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscription_timestamp();

-- Create default subscription for new users
CREATE OR REPLACE FUNCTION create_default_subscription() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_subscriptions (user_id, subscription_tier, status)
  VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER create_subscription_on_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_subscription();