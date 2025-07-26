-- AI Integration Database Schema for Velocity
-- This script creates tables for AI code generation, caching, and conversation management

-- Enable pgvector extension for similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Table for storing AI-generated code cache with embeddings
CREATE TABLE IF NOT EXISTS ai_cache (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    context JSONB DEFAULT '{}',
    embedding vector(1536), -- OpenAI ada-002 embeddings dimension
    token_count INTEGER,
    model_version VARCHAR(50) DEFAULT 'claude-3-5-sonnet-20241022',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    accessed_at TIMESTAMPTZ DEFAULT NOW(),
    access_count INTEGER DEFAULT 1,
    
    -- Indexes for performance
    CONSTRAINT prompt_length CHECK (char_length(prompt) <= 10000),
    CONSTRAINT response_length CHECK (char_length(response) <= 50000)
);

-- Indexes for AI cache
CREATE INDEX idx_ai_cache_user_id ON ai_cache(user_id);
CREATE INDEX idx_ai_cache_created_at ON ai_cache(created_at);
CREATE INDEX idx_ai_cache_embedding ON ai_cache USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Table for prompt optimization cache
CREATE TABLE IF NOT EXISTS prompt_optimizations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    original_prompt TEXT NOT NULL,
    optimized_prompt TEXT NOT NULL,
    template_id VARCHAR(50),
    embedding vector(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    used_count INTEGER DEFAULT 0,
    
    CONSTRAINT original_prompt_length CHECK (char_length(original_prompt) <= 5000),
    CONSTRAINT optimized_prompt_length CHECK (char_length(optimized_prompt) <= 10000)
);

-- Indexes for prompt optimizations
CREATE INDEX idx_prompt_opt_user_id ON prompt_optimizations(user_id);
CREATE INDEX idx_prompt_opt_template ON prompt_optimizations(template_id);
CREATE INDEX idx_prompt_opt_embedding ON prompt_optimizations USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Table for conversation management
CREATE TABLE IF NOT EXISTS conversations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(255),
    context JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{
        "model": "claude-3-5-sonnet-20241022",
        "totalTokens": 0
    }',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT title_length CHECK (char_length(title) <= 255)
);

-- Indexes for conversations
CREATE INDEX idx_conversations_user_id ON conversations(user_id);
CREATE INDEX idx_conversations_project_id ON conversations(project_id);
CREATE INDEX idx_conversations_updated_at ON conversations(updated_at);

-- Table for conversation messages
CREATE TABLE IF NOT EXISTS conversation_messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    token_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT content_length CHECK (char_length(content) <= 100000)
);

-- Indexes for conversation messages
CREATE INDEX idx_conv_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX idx_conv_messages_created_at ON conversation_messages(created_at);

-- Table for rate limiting logs
CREATE TABLE IF NOT EXISTS rate_limit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    resource VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for rate limiting
CREATE INDEX idx_rate_limit_user_id ON rate_limit_logs(user_id);
CREATE INDEX idx_rate_limit_resource ON rate_limit_logs(resource);
CREATE INDEX idx_rate_limit_created_at ON rate_limit_logs(created_at);

-- Clean up old rate limit logs periodically
CREATE INDEX idx_rate_limit_cleanup ON rate_limit_logs(created_at) WHERE created_at < NOW() - INTERVAL '7 days';

-- Table for Edge Function logs
CREATE TABLE IF NOT EXISTS edge_function_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    function_name VARCHAR(50) NOT NULL,
    level VARCHAR(20) NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
    message TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for edge function logs
CREATE INDEX idx_edge_logs_function ON edge_function_logs(function_name);
CREATE INDEX idx_edge_logs_level ON edge_function_logs(level);
CREATE INDEX idx_edge_logs_created_at ON edge_function_logs(created_at);

-- Function to search similar prompts using pgvector
CREATE OR REPLACE FUNCTION search_similar_prompts(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.8,
    match_count INT DEFAULT 5,
    user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    original_prompt TEXT,
    optimized_prompt TEXT,
    template_id VARCHAR(50),
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        po.id,
        po.original_prompt,
        po.optimized_prompt,
        po.template_id,
        1 - (po.embedding <=> query_embedding) AS similarity
    FROM prompt_optimizations po
    WHERE 
        (user_id IS NULL OR po.user_id = user_id)
        AND 1 - (po.embedding <=> query_embedding) >= match_threshold
    ORDER BY po.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Function to search cached AI responses
CREATE OR REPLACE FUNCTION search_cached_responses(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.85,
    match_count INT DEFAULT 5,
    user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    prompt TEXT,
    response TEXT,
    context JSONB,
    similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ac.id,
        ac.prompt,
        ac.response,
        ac.context,
        1 - (ac.embedding <=> query_embedding) AS similarity
    FROM ai_cache ac
    WHERE 
        (user_id IS NULL OR ac.user_id = user_id)
        AND 1 - (ac.embedding <=> query_embedding) >= match_threshold
    ORDER BY ac.embedding <=> query_embedding
    LIMIT match_count;
    
    -- Update access count and timestamp for cache hits
    UPDATE ai_cache
    SET 
        access_count = access_count + 1,
        accessed_at = NOW()
    WHERE id IN (
        SELECT ac.id
        FROM ai_cache ac
        WHERE 
            (user_id IS NULL OR ac.user_id = user_id)
            AND 1 - (ac.embedding <=> query_embedding) >= match_threshold
        ORDER BY ac.embedding <=> query_embedding
        LIMIT 1
    );
END;
$$;

-- Function to clean up old cache entries
CREATE OR REPLACE FUNCTION cleanup_old_cache_entries()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete cache entries older than 30 days with low access count
    DELETE FROM ai_cache
    WHERE 
        created_at < NOW() - INTERVAL '30 days'
        AND access_count < 5;
    
    -- Delete old rate limit logs
    DELETE FROM rate_limit_logs
    WHERE created_at < NOW() - INTERVAL '7 days';
    
    -- Delete old edge function logs
    DELETE FROM edge_function_logs
    WHERE created_at < NOW() - INTERVAL '14 days';
END;
$$;

-- Create a scheduled job to run cleanup (requires pg_cron extension)
-- This would be set up separately in Supabase dashboard or via API

-- RLS Policies for AI tables
ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_optimizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_logs ENABLE ROW LEVEL SECURITY;

-- AI Cache policies
CREATE POLICY "Users can view their own cache entries"
    ON ai_cache FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all cache entries"
    ON ai_cache FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Prompt optimization policies
CREATE POLICY "Users can view their own prompt optimizations"
    ON prompt_optimizations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all prompt optimizations"
    ON prompt_optimizations FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Conversation policies
CREATE POLICY "Users can view their own conversations"
    ON conversations FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations"
    ON conversations FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
    ON conversations FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations"
    ON conversations FOR DELETE
    USING (auth.uid() = user_id);

-- Conversation messages policies
CREATE POLICY "Users can view messages from their conversations"
    ON conversation_messages FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversations c
            WHERE c.id = conversation_messages.conversation_id
            AND c.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all conversation messages"
    ON conversation_messages FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Rate limit logs policies
CREATE POLICY "Service role can manage rate limit logs"
    ON rate_limit_logs FOR ALL
    USING (auth.jwt()->>'role' = 'service_role');

-- Add triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();