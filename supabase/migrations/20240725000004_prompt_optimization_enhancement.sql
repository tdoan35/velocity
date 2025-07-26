-- Migration: Enhanced Prompt Optimization System
-- Description: Adds tables for prompt templates, feedback, and context injection

-- Create prompt templates table
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL CHECK (category IN ('screen', 'component', 'navigation', 'api', 'state', 'styling', 'storage', 'animation', 'gesture')),
  description TEXT,
  template_content TEXT NOT NULL,
  pattern_regex TEXT,
  keywords TEXT[],
  components TEXT[],
  imports TEXT[],
  best_practices TEXT[],
  example_usage TEXT,
  token_cost INTEGER DEFAULT 0,
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(3,2) DEFAULT 0.00,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create prompt feedback table
CREATE TABLE IF NOT EXISTS prompt_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt_optimization_id UUID REFERENCES prompt_optimizations(id) ON DELETE CASCADE,
  template_id VARCHAR(100) REFERENCES prompt_templates(template_id),
  feedback_type VARCHAR(50) NOT NULL CHECK (feedback_type IN ('positive', 'negative', 'suggestion', 'error')),
  feedback_text TEXT,
  code_quality_score INTEGER CHECK (code_quality_score >= 1 AND code_quality_score <= 5),
  relevance_score INTEGER CHECK (relevance_score >= 1 AND relevance_score <= 5),
  completeness_score INTEGER CHECK (completeness_score >= 1 AND completeness_score <= 5),
  issues_encountered TEXT[],
  improvements_suggested TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create context injection rules table
CREATE TABLE IF NOT EXISTS context_injection_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name VARCHAR(255) NOT NULL,
  trigger_keywords TEXT[],
  injection_type VARCHAR(50) CHECK (injection_type IN ('prepend', 'append', 'replace', 'wrap')),
  injection_content TEXT NOT NULL,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create template versions table for A/B testing
CREATE TABLE IF NOT EXISTS template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id VARCHAR(100) REFERENCES prompt_templates(template_id),
  version_name VARCHAR(100) NOT NULL,
  template_content TEXT NOT NULL,
  is_control BOOLEAN DEFAULT false,
  usage_count INTEGER DEFAULT 0,
  success_metrics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX idx_prompt_templates_active ON prompt_templates(is_active);
CREATE INDEX idx_prompt_feedback_user ON prompt_feedback(user_id);
CREATE INDEX idx_prompt_feedback_template ON prompt_feedback(template_id);
CREATE INDEX idx_context_rules_active ON context_injection_rules(is_active);

-- Add RLS policies
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_injection_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_versions ENABLE ROW LEVEL SECURITY;

-- Prompt templates are public read
CREATE POLICY "Public can read active templates" ON prompt_templates
  FOR SELECT USING (is_active = true);

-- Only admins can modify templates
CREATE POLICY "Admins can manage templates" ON prompt_templates
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_subscriptions 
      WHERE user_id = auth.uid() 
      AND subscription_tier = 'admin'
    )
  );

-- Users can only see and create their own feedback
CREATE POLICY "Users can manage own feedback" ON prompt_feedback
  FOR ALL USING (user_id = auth.uid());

-- Context rules are public read
CREATE POLICY "Public can read active rules" ON context_injection_rules
  FOR SELECT USING (is_active = true);

-- Template versions follow template permissions
CREATE POLICY "Template versions follow template access" ON template_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM prompt_templates 
      WHERE template_id = template_versions.template_id 
      AND is_active = true
    )
  );

-- Function to update template success metrics
CREATE OR REPLACE FUNCTION update_template_metrics()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.feedback_type = 'positive' THEN
    UPDATE prompt_templates 
    SET 
      usage_count = usage_count + 1,
      success_rate = (
        SELECT AVG(CASE WHEN feedback_type = 'positive' THEN 1 ELSE 0 END)
        FROM prompt_feedback 
        WHERE template_id = NEW.template_id
      )
    WHERE template_id = NEW.template_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_template_metrics_trigger
AFTER INSERT ON prompt_feedback
FOR EACH ROW
EXECUTE FUNCTION update_template_metrics();

-- Add token counting function
CREATE OR REPLACE FUNCTION estimate_token_count(text_content TEXT)
RETURNS INTEGER AS $$
BEGIN
  -- Rough estimation: 1 token ≈ 4 characters
  RETURN CEIL(LENGTH(text_content) / 4.0);
END;
$$ LANGUAGE plpgsql;

-- Add function to get best template for prompt
CREATE OR REPLACE FUNCTION get_best_template(
  p_prompt TEXT,
  p_category VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
  template_id VARCHAR(100),
  name VARCHAR(255),
  category VARCHAR(50),
  template_content TEXT,
  relevance_score FLOAT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    t.template_id,
    t.name,
    t.category,
    t.template_content,
    (
      -- Calculate relevance score based on keyword matches
      (SELECT COUNT(*) FROM unnest(t.keywords) k WHERE p_prompt ILIKE '%' || k || '%')::FLOAT * 2 +
      -- Bonus for category match
      CASE WHEN t.category = p_category THEN 5 ELSE 0 END +
      -- Success rate weight
      t.success_rate * 10
    ) as relevance_score
  FROM prompt_templates t
  WHERE t.is_active = true
    AND (p_category IS NULL OR t.category = p_category)
    AND (
      t.pattern_regex IS NULL 
      OR p_prompt ~ t.pattern_regex
      OR EXISTS (SELECT 1 FROM unnest(t.keywords) k WHERE p_prompt ILIKE '%' || k || '%')
    )
  ORDER BY relevance_score DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Create template improvement tasks table
CREATE TABLE IF NOT EXISTS template_improvement_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id VARCHAR(100) REFERENCES prompt_templates(template_id),
  suggestions TEXT[],
  issues TEXT[],
  reported_by UUID REFERENCES auth.users(id),
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected')),
  resolution_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create optimization patterns table for learning
CREATE TABLE IF NOT EXISTS optimization_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_prompt TEXT NOT NULL,
  optimized_prompt TEXT NOT NULL,
  template_id VARCHAR(100) REFERENCES prompt_templates(template_id),
  user_id UUID REFERENCES auth.users(id),
  success BOOLEAN DEFAULT true,
  pattern_type VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns to prompt_optimizations for enhanced tracking
ALTER TABLE prompt_optimizations 
ADD COLUMN IF NOT EXISTS target_component VARCHAR(50),
ADD COLUMN IF NOT EXISTS patterns TEXT[],
ADD COLUMN IF NOT EXISTS confidence DECIMAL(3,2);

-- Create indexes for new tables
CREATE INDEX idx_improvement_tasks_status ON template_improvement_tasks(status);
CREATE INDEX idx_improvement_tasks_template ON template_improvement_tasks(template_id);
CREATE INDEX idx_optimization_patterns_success ON optimization_patterns(success);
CREATE INDEX idx_optimization_patterns_template ON optimization_patterns(template_id);

-- RLS policies for new tables
ALTER TABLE template_improvement_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE optimization_patterns ENABLE ROW LEVEL SECURITY;

-- Users can see their own improvement tasks
CREATE POLICY "Users can view own improvement tasks" ON template_improvement_tasks
  FOR SELECT USING (reported_by = auth.uid());

-- Admins can manage all improvement tasks
CREATE POLICY "Admins can manage improvement tasks" ON template_improvement_tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM user_subscriptions 
      WHERE user_id = auth.uid() 
      AND subscription_tier = 'admin'
    )
  );

-- Users can see their own optimization patterns
CREATE POLICY "Users can view own patterns" ON optimization_patterns
  FOR SELECT USING (user_id = auth.uid());

-- Function to increment template success
CREATE OR REPLACE FUNCTION increment_template_success(p_template_id VARCHAR(100))
RETURNS VOID AS $$
BEGIN
  UPDATE prompt_templates
  SET 
    usage_count = usage_count + 1,
    success_rate = LEAST(
      (success_rate * usage_count + 1) / (usage_count + 1),
      1.0
    ),
    updated_at = NOW()
  WHERE template_id = p_template_id;
END;
$$ LANGUAGE plpgsql;