-- Context Assembly System Database Schema
-- Tables for user interaction history, preferences, and pattern tracking

-- User interaction history table
CREATE TABLE IF NOT EXISTS user_interactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('prompt', 'code_generation', 'refinement', 'error_fix', 'explanation')),
    data JSONB NOT NULL DEFAULT '{}',
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Indexes for performance
    CONSTRAINT data_size CHECK (pg_column_size(data) <= 65536), -- 64KB limit
    CONSTRAINT metadata_size CHECK (pg_column_size(metadata) <= 16384) -- 16KB limit
);

-- Indexes for user interactions
CREATE INDEX idx_interactions_user_project ON user_interactions(user_id, project_id);
CREATE INDEX idx_interactions_type ON user_interactions(type);
CREATE INDEX idx_interactions_created_at ON user_interactions(created_at DESC);
CREATE INDEX idx_interactions_data_patterns ON user_interactions USING gin ((data->'patterns'));

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL DEFAULT '{
        "codeStyle": "balanced",
        "commentLevel": "minimal",
        "errorHandling": "comprehensive",
        "testingApproach": "unit",
        "language": "typescript"
    }',
    learnings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint
    UNIQUE(user_id, project_id)
);

-- Indexes for user preferences
CREATE INDEX idx_preferences_user_project ON user_preferences(user_id, project_id);

-- Pattern usage tracking
CREATE TABLE IF NOT EXISTS pattern_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    pattern_name VARCHAR(100) NOT NULL,
    pattern_category VARCHAR(50),
    used_at TIMESTAMPTZ DEFAULT NOW(),
    context JSONB DEFAULT '{}'
);

-- Indexes for pattern usage
CREATE INDEX idx_pattern_usage_user_project ON pattern_usage(user_id, project_id);
CREATE INDEX idx_pattern_usage_pattern ON pattern_usage(pattern_name);
CREATE INDEX idx_pattern_usage_used_at ON pattern_usage(used_at DESC);
CREATE INDEX idx_pattern_usage_category ON pattern_usage(pattern_category);

-- User statistics aggregation
CREATE TABLE IF NOT EXISTS user_statistics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    total_interactions INTEGER DEFAULT 0,
    total_generations INTEGER DEFAULT 0,
    successful_interactions INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    average_session_duration INTEGER DEFAULT 0,
    last_interaction TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint
    UNIQUE(user_id, project_id)
);

-- Indexes for user statistics
CREATE INDEX idx_user_stats_user_project ON user_statistics(user_id, project_id);
CREATE INDEX idx_user_stats_last_interaction ON user_statistics(last_interaction DESC);

-- User learnings from refinements
CREATE TABLE IF NOT EXISTS user_learnings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    original_context JSONB DEFAULT '{}',
    refinement_prompt TEXT,
    outcome JSONB DEFAULT '{}',
    learned_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for user learnings
CREATE INDEX idx_learnings_user_project ON user_learnings(user_id, project_id);
CREATE INDEX idx_learnings_type ON user_learnings(type);
CREATE INDEX idx_learnings_learned_at ON user_learnings(learned_at DESC);

-- Project file analysis cache
CREATE TABLE IF NOT EXISTS file_analysis_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    file_hash VARCHAR(64) NOT NULL, -- SHA256 hash of file content
    analysis JSONB NOT NULL DEFAULT '{}',
    language VARCHAR(50),
    imports TEXT[],
    exports TEXT[],
    components TEXT[],
    patterns TEXT[],
    embedding vector(1536), -- For semantic search
    analyzed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint on project + file
    UNIQUE(project_id, file_path)
);

-- Indexes for file analysis cache
CREATE INDEX idx_file_analysis_project ON file_analysis_cache(project_id);
CREATE INDEX idx_file_analysis_path ON file_analysis_cache(file_path);
CREATE INDEX idx_file_analysis_hash ON file_analysis_cache(file_hash);
CREATE INDEX idx_file_analysis_language ON file_analysis_cache(language);
CREATE INDEX idx_file_analysis_patterns ON file_analysis_cache USING gin (patterns);
CREATE INDEX idx_file_analysis_embedding ON file_analysis_cache USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Function to increment user statistics
CREATE OR REPLACE FUNCTION increment_user_stats(
    p_user_id UUID,
    p_project_id UUID,
    p_stats JSONB
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO user_statistics (
        user_id,
        project_id,
        total_interactions,
        total_generations,
        successful_interactions,
        total_tokens,
        last_interaction
    ) VALUES (
        p_user_id,
        p_project_id,
        COALESCE((p_stats->>'total_interactions')::INTEGER, 0),
        COALESCE((p_stats->>'total_generations')::INTEGER, 0),
        COALESCE((p_stats->>'successful_interactions')::INTEGER, 0),
        COALESCE((p_stats->>'total_tokens')::INTEGER, 0),
        COALESCE((p_stats->>'last_interaction')::TIMESTAMPTZ, NOW())
    )
    ON CONFLICT (user_id, project_id) DO UPDATE
    SET
        total_interactions = user_statistics.total_interactions + COALESCE((p_stats->>'total_interactions')::INTEGER, 0),
        total_generations = user_statistics.total_generations + COALESCE((p_stats->>'total_generations')::INTEGER, 0),
        successful_interactions = user_statistics.successful_interactions + COALESCE((p_stats->>'successful_interactions')::INTEGER, 0),
        total_tokens = user_statistics.total_tokens + COALESCE((p_stats->>'total_tokens')::INTEGER, 0),
        last_interaction = COALESCE((p_stats->>'last_interaction')::TIMESTAMPTZ, NOW()),
        updated_at = NOW();
END;
$$;

-- Function to get relevant files based on similarity
CREATE OR REPLACE FUNCTION get_relevant_files(
    p_project_id UUID,
    p_query_embedding vector(1536),
    p_similarity_threshold FLOAT DEFAULT 0.7,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    file_path TEXT,
    analysis JSONB,
    patterns TEXT[],
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        fac.file_path,
        fac.analysis,
        fac.patterns,
        1 - (fac.embedding <=> p_query_embedding) AS similarity
    FROM file_analysis_cache fac
    WHERE 
        fac.project_id = p_project_id
        AND fac.embedding IS NOT NULL
        AND 1 - (fac.embedding <=> p_query_embedding) >= p_similarity_threshold
    ORDER BY fac.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$;

-- Function to analyze pattern usage trends
CREATE OR REPLACE FUNCTION analyze_pattern_trends(
    p_user_id UUID,
    p_project_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    pattern_name VARCHAR(100),
    usage_count BIGINT,
    last_used TIMESTAMPTZ,
    trend VARCHAR(20)
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH recent_usage AS (
        SELECT 
            pattern_name,
            COUNT(*) as usage_count,
            MAX(used_at) as last_used
        FROM pattern_usage
        WHERE 
            user_id = p_user_id
            AND project_id = p_project_id
            AND used_at >= NOW() - INTERVAL '1 day' * p_days
        GROUP BY pattern_name
    ),
    previous_usage AS (
        SELECT 
            pattern_name,
            COUNT(*) as usage_count
        FROM pattern_usage
        WHERE 
            user_id = p_user_id
            AND project_id = p_project_id
            AND used_at >= NOW() - INTERVAL '1 day' * (p_days * 2)
            AND used_at < NOW() - INTERVAL '1 day' * p_days
        GROUP BY pattern_name
    )
    SELECT 
        r.pattern_name,
        r.usage_count,
        r.last_used,
        CASE 
            WHEN r.usage_count > COALESCE(p.usage_count, 0) THEN 'increasing'
            WHEN r.usage_count < COALESCE(p.usage_count, 0) THEN 'decreasing'
            ELSE 'stable'
        END as trend
    FROM recent_usage r
    LEFT JOIN previous_usage p ON r.pattern_name = p.pattern_name
    ORDER BY r.usage_count DESC;
END;
$$;

-- RLS Policies
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_analysis_cache ENABLE ROW LEVEL SECURITY;

-- User interactions policies
CREATE POLICY "Users can view their own interactions"
    ON user_interactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all interactions"
    ON user_interactions FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- User preferences policies
CREATE POLICY "Users can manage their own preferences"
    ON user_preferences FOR ALL
    USING (auth.uid() = user_id);

-- Pattern usage policies
CREATE POLICY "Users can view their own pattern usage"
    ON pattern_usage FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all pattern usage"
    ON pattern_usage FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- User statistics policies
CREATE POLICY "Users can view their own statistics"
    ON user_statistics FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all statistics"
    ON user_statistics FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- User learnings policies
CREATE POLICY "Users can view their own learnings"
    ON user_learnings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all learnings"
    ON user_learnings FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- File analysis cache policies
CREATE POLICY "Users can view file analysis for their projects"
    ON file_analysis_cache FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = file_analysis_cache.project_id
            AND p.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all file analysis"
    ON file_analysis_cache FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Triggers for updated_at
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_statistics_updated_at BEFORE UPDATE ON user_statistics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();