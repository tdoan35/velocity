-- Migration: Code Quality Analysis System
-- Description: Adds tables and functions for analyzing and tracking code quality metrics

-- Create code quality analysis results table
CREATE TABLE IF NOT EXISTS code_quality_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  code_generation_id UUID,
  code_content TEXT NOT NULL,
  file_path VARCHAR(500),
  language VARCHAR(50) DEFAULT 'typescript',
  
  -- Quality scores (0-100)
  overall_score INTEGER CHECK (overall_score >= 0 AND overall_score <= 100),
  readability_score INTEGER CHECK (readability_score >= 0 AND readability_score <= 100),
  maintainability_score INTEGER CHECK (maintainability_score >= 0 AND maintainability_score <= 100),
  performance_score INTEGER CHECK (performance_score >= 0 AND performance_score <= 100),
  security_score INTEGER CHECK (security_score >= 0 AND security_score <= 100),
  
  -- Issue counts
  error_count INTEGER DEFAULT 0,
  warning_count INTEGER DEFAULT 0,
  info_count INTEGER DEFAULT 0,
  
  -- Analysis metadata
  analysis_duration_ms INTEGER,
  analyzer_version VARCHAR(20),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create code issues table
CREATE TABLE IF NOT EXISTS code_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_result_id UUID REFERENCES code_quality_results(id) ON DELETE CASCADE,
  
  -- Issue details
  severity VARCHAR(20) CHECK (severity IN ('error', 'warning', 'info', 'suggestion')),
  category VARCHAR(50) CHECK (category IN ('security', 'performance', 'style', 'bestpractice', 'accessibility', 'typescript', 'react-native')),
  rule_id VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  
  -- Location in code
  line_start INTEGER,
  line_end INTEGER,
  column_start INTEGER,
  column_end INTEGER,
  
  -- Fix information
  is_fixable BOOLEAN DEFAULT false,
  fix_suggestion TEXT,
  auto_fixable BOOLEAN DEFAULT false,
  fix_code TEXT,
  
  -- Additional metadata
  react_native_specific BOOLEAN DEFAULT false,
  platform VARCHAR(20) CHECK (platform IN ('ios', 'android', 'both', 'web')),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create security vulnerabilities table
CREATE TABLE IF NOT EXISTS security_vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_result_id UUID REFERENCES code_quality_results(id) ON DELETE CASCADE,
  
  -- Vulnerability details
  vulnerability_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  cwe_id VARCHAR(20),
  owasp_category VARCHAR(50),
  
  -- Details
  description TEXT NOT NULL,
  impact TEXT,
  remediation TEXT NOT NULL,
  
  -- Location
  file_path VARCHAR(500),
  line_number INTEGER,
  code_snippet TEXT,
  
  -- Risk assessment
  exploitability_score DECIMAL(3,1) CHECK (exploitability_score >= 0 AND exploitability_score <= 10),
  impact_score DECIMAL(3,1) CHECK (impact_score >= 0 AND impact_score <= 10),
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create performance issues table
CREATE TABLE IF NOT EXISTS performance_issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_result_id UUID REFERENCES code_quality_results(id) ON DELETE CASCADE,
  
  -- Issue details
  issue_type VARCHAR(100) NOT NULL,
  severity VARCHAR(20) CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  category VARCHAR(50) CHECK (category IN ('rendering', 'memory', 'network', 'computation', 'storage')),
  
  -- Performance impact
  estimated_impact_ms INTEGER,
  affected_component VARCHAR(255),
  
  -- Details
  description TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  code_snippet TEXT,
  optimized_code TEXT,
  
  -- React Native specific
  platform_specific BOOLEAN DEFAULT false,
  affected_platforms TEXT[],
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create code quality rules table
CREATE TABLE IF NOT EXISTS quality_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  severity VARCHAR(20) DEFAULT 'warning',
  
  -- Rule details
  description TEXT NOT NULL,
  rationale TEXT,
  examples JSONB,
  
  -- React Native specific
  react_native_only BOOLEAN DEFAULT false,
  platforms TEXT[],
  min_rn_version VARCHAR(20),
  
  -- Configuration
  is_active BOOLEAN DEFAULT true,
  is_auto_fixable BOOLEAN DEFAULT false,
  fix_function VARCHAR(255),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create code enhancement suggestions table
CREATE TABLE IF NOT EXISTS code_enhancements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_result_id UUID REFERENCES code_quality_results(id) ON DELETE CASCADE,
  
  -- Suggestion details
  enhancement_type VARCHAR(50) CHECK (enhancement_type IN ('refactor', 'optimize', 'modernize', 'accessibility', 'testing')),
  priority VARCHAR(20) CHECK (priority IN ('high', 'medium', 'low')),
  
  -- Enhancement details
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  current_code TEXT NOT NULL,
  suggested_code TEXT NOT NULL,
  
  -- Impact assessment
  readability_improvement INTEGER,
  performance_improvement INTEGER,
  maintainability_improvement INTEGER,
  
  -- Metadata
  estimated_effort VARCHAR(20) CHECK (estimated_effort IN ('trivial', 'easy', 'medium', 'hard')),
  breaking_change BOOLEAN DEFAULT false,
  requires_testing BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create quality metrics history table
CREATE TABLE IF NOT EXISTS quality_metrics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  
  -- Aggregated metrics
  avg_overall_score DECIMAL(5,2),
  avg_security_score DECIMAL(5,2),
  avg_performance_score DECIMAL(5,2),
  total_issues_fixed INTEGER DEFAULT 0,
  total_vulnerabilities_fixed INTEGER DEFAULT 0,
  
  -- Time period
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add indexes
CREATE INDEX idx_quality_results_user ON code_quality_results(user_id);
CREATE INDEX idx_quality_results_project ON code_quality_results(project_id);
CREATE INDEX idx_quality_results_score ON code_quality_results(overall_score);
CREATE INDEX idx_code_issues_severity ON code_issues(severity);
CREATE INDEX idx_code_issues_category ON code_issues(category);
CREATE INDEX idx_security_vulnerabilities_severity ON security_vulnerabilities(severity);
CREATE INDEX idx_performance_issues_severity ON performance_issues(severity);
CREATE INDEX idx_quality_rules_active ON quality_rules(is_active);
CREATE INDEX idx_quality_metrics_project ON quality_metrics_history(project_id);

-- Enable RLS
ALTER TABLE code_quality_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_vulnerabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_enhancements ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_metrics_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can see their own quality results
CREATE POLICY "Users can view own quality results" ON code_quality_results
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Users can create own quality results" ON code_quality_results
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Issues, vulnerabilities, and performance issues follow quality results access
CREATE POLICY "Issues follow quality results access" ON code_issues
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM code_quality_results 
      WHERE id = code_issues.quality_result_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Vulnerabilities follow quality results access" ON security_vulnerabilities
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM code_quality_results 
      WHERE id = security_vulnerabilities.quality_result_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Performance issues follow quality results access" ON performance_issues
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM code_quality_results 
      WHERE id = performance_issues.quality_result_id 
      AND user_id = auth.uid()
    )
  );

CREATE POLICY "Enhancements follow quality results access" ON code_enhancements
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM code_quality_results 
      WHERE id = code_enhancements.quality_result_id 
      AND user_id = auth.uid()
    )
  );

-- Quality rules are public read
CREATE POLICY "Public can read active rules" ON quality_rules
  FOR SELECT USING (is_active = true);

-- Users can see their project metrics
CREATE POLICY "Users can view project metrics" ON quality_metrics_history
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM project_members 
      WHERE project_id = quality_metrics_history.project_id 
      AND user_id = auth.uid()
    )
  );

-- Functions for code quality analysis

-- Calculate overall code quality score
CREATE OR REPLACE FUNCTION calculate_quality_score(
  p_readability INTEGER,
  p_maintainability INTEGER,
  p_performance INTEGER,
  p_security INTEGER
)
RETURNS INTEGER AS $$
BEGIN
  -- Weighted average: security 35%, performance 25%, maintainability 25%, readability 15%
  RETURN ROUND(
    (p_security * 0.35) + 
    (p_performance * 0.25) + 
    (p_maintainability * 0.25) + 
    (p_readability * 0.15)
  );
END;
$$ LANGUAGE plpgsql;

-- Get quality trend for a project
CREATE OR REPLACE FUNCTION get_quality_trend(
  p_project_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
  date DATE,
  avg_score DECIMAL(5,2),
  total_analyses INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(created_at) as date,
    AVG(overall_score)::DECIMAL(5,2) as avg_score,
    COUNT(*)::INTEGER as total_analyses
  FROM code_quality_results
  WHERE project_id = p_project_id
    AND created_at >= CURRENT_DATE - INTERVAL '1 day' * p_days
  GROUP BY DATE(created_at)
  ORDER BY date;
END;
$$ LANGUAGE plpgsql;

-- Insert default React Native quality rules
INSERT INTO quality_rules (rule_id, name, category, severity, description, react_native_only) VALUES
  ('rn-no-inline-styles', 'No Inline Styles', 'style', 'warning', 'Avoid inline styles in React Native components. Use StyleSheet.create() instead.', true),
  ('rn-platform-specific', 'Platform Specific Code', 'bestpractice', 'info', 'Use Platform.select() or Platform.OS for platform-specific code.', true),
  ('rn-image-source', 'Image Source Validation', 'performance', 'warning', 'Ensure image sources are properly optimized and have correct dimensions.', true),
  ('rn-list-performance', 'List Performance', 'performance', 'warning', 'Use FlatList or SectionList instead of ScrollView for long lists.', true),
  ('rn-accessibility', 'Accessibility Props', 'accessibility', 'warning', 'Include accessibility props in interactive components.', true),
  ('ts-no-any', 'No Any Type', 'typescript', 'error', 'Avoid using "any" type in TypeScript.', false),
  ('sec-no-eval', 'No Eval', 'security', 'error', 'Avoid using eval() or similar dynamic code execution.', false),
  ('sec-no-hardcoded-secrets', 'No Hardcoded Secrets', 'security', 'critical', 'Do not hardcode API keys, passwords, or secrets.', false)
ON CONFLICT (rule_id) DO NOTHING;