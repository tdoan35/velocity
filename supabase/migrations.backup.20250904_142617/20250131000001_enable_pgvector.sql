-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create tables for AI features and vector similarity search

-- Store embeddings for prompts and responses
CREATE TABLE IF NOT EXISTS ai_embeddings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('prompt', 'response', 'code_snippet', 'component', 'pattern')),
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL, -- OpenAI text-embedding-3-small dimensions
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 1,
  
  -- Indexes for performance
  INDEX idx_ai_embeddings_project_id (project_id),
  INDEX idx_ai_embeddings_user_id (user_id),
  INDEX idx_ai_embeddings_created_at (created_at DESC),
  INDEX idx_ai_embeddings_content_type (content_type)
);

-- Create HNSW index for vector similarity search
-- Parameters optimized for production performance
CREATE INDEX idx_ai_embeddings_hnsw ON ai_embeddings 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 32, ef_construction = 400);

-- Conversation history for multi-turn support
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  thread_id UUID DEFAULT gen_random_uuid() NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  message_count INTEGER DEFAULT 0,
  
  -- Indexes
  INDEX idx_ai_conversations_thread_id (thread_id),
  INDEX idx_ai_conversations_user_project (user_id, project_id),
  INDEX idx_ai_conversations_last_message (last_message_at DESC)
);

-- Individual messages in conversations
CREATE TABLE IF NOT EXISTS ai_conversation_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  embedding vector(1536),
  tokens_used INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_ai_messages_conversation (conversation_id, created_at DESC),
  INDEX idx_ai_messages_created_at (created_at DESC)
);

-- Cache for similar queries
CREATE TABLE IF NOT EXISTS ai_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cache_key TEXT NOT NULL,
  query_embedding vector(1536) NOT NULL,
  response TEXT NOT NULL,
  response_embedding vector(1536),
  hit_count INTEGER DEFAULT 0,
  last_hit_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_ai_cache_key (cache_key),
  INDEX idx_ai_cache_expires (expires_at),
  INDEX idx_ai_cache_last_hit (last_hit_at DESC)
);

-- Create HNSW index for cache similarity search
CREATE INDEX idx_ai_cache_hnsw ON ai_cache 
USING hnsw (query_embedding vector_cosine_ops)
WITH (m = 24, ef_construction = 300);

-- Code patterns and templates
CREATE TABLE IF NOT EXISTS ai_code_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_type TEXT NOT NULL CHECK (pattern_type IN ('component', 'api', 'state', 'navigation', 'style', 'utility')),
  name TEXT NOT NULL,
  description TEXT,
  code_template TEXT NOT NULL,
  embedding vector(1536),
  usage_count INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0.00,
  tags TEXT[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_ai_patterns_type (pattern_type),
  INDEX idx_ai_patterns_usage (usage_count DESC),
  INDEX idx_ai_patterns_success (success_rate DESC),
  INDEX idx_ai_patterns_tags USING GIN (tags)
);

-- Create HNSW index for pattern similarity search
CREATE INDEX idx_ai_patterns_hnsw ON ai_code_patterns 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- Design system tokens and components
CREATE TABLE IF NOT EXISTS ai_design_system (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  component_type TEXT NOT NULL,
  component_name TEXT NOT NULL,
  design_tokens JSONB NOT NULL,
  example_code TEXT,
  embedding vector(1536),
  usage_guidelines TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_ai_design_project (project_id),
  INDEX idx_ai_design_type (component_type),
  UNIQUE (project_id, component_name)
);

-- Performance metrics for optimization
CREATE TABLE IF NOT EXISTS ai_performance_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL CHECK (metric_type IN ('cache_hit', 'query_time', 'embedding_time', 'generation_time')),
  value DECIMAL(10,3) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Indexes
  INDEX idx_ai_metrics_project (project_id),
  INDEX idx_ai_metrics_type_time (metric_type, created_at DESC)
);

-- Functions for vector similarity search

-- Find similar embeddings with configurable threshold
CREATE OR REPLACE FUNCTION find_similar_embeddings(
  query_embedding vector(1536),
  similarity_threshold FLOAT DEFAULT 0.92,
  max_results INTEGER DEFAULT 10,
  p_project_id UUID DEFAULT NULL,
  p_content_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  content_type TEXT,
  similarity FLOAT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.content,
    e.content_type,
    1 - (e.embedding <=> query_embedding) as similarity,
    e.metadata
  FROM ai_embeddings e
  WHERE 
    1 - (e.embedding <=> query_embedding) >= similarity_threshold
    AND (p_project_id IS NULL OR e.project_id = p_project_id)
    AND (p_content_type IS NULL OR e.content_type = p_content_type)
  ORDER BY e.embedding <=> query_embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Find cached responses for similar queries
CREATE OR REPLACE FUNCTION find_cached_response(
  query_embedding vector(1536),
  similarity_threshold FLOAT DEFAULT 0.95,
  p_cache_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  response TEXT,
  similarity FLOAT,
  metadata JSONB
) AS $$
BEGIN
  -- First try exact cache key match if provided
  IF p_cache_key IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      c.id,
      c.response,
      1.0::FLOAT as similarity,
      c.metadata
    FROM ai_cache c
    WHERE 
      c.cache_key = p_cache_key
      AND (c.expires_at IS NULL OR c.expires_at > NOW())
    LIMIT 1;
    
    IF FOUND THEN
      -- Update hit count and last hit time
      UPDATE ai_cache 
      SET hit_count = hit_count + 1, last_hit_at = NOW()
      WHERE cache_key = p_cache_key;
      RETURN;
    END IF;
  END IF;
  
  -- Fall back to similarity search
  RETURN QUERY
  SELECT 
    c.id,
    c.response,
    1 - (c.query_embedding <=> query_embedding) as similarity,
    c.metadata
  FROM ai_cache c
  WHERE 
    1 - (c.query_embedding <=> query_embedding) >= similarity_threshold
    AND (c.expires_at IS NULL OR c.expires_at > NOW())
  ORDER BY c.query_embedding <=> query_embedding
  LIMIT 1;
  
  -- Update hit count for the found result
  IF FOUND THEN
    UPDATE ai_cache 
    SET hit_count = hit_count + 1, last_hit_at = NOW()
    WHERE id = (
      SELECT c.id 
      FROM ai_cache c
      WHERE 
        1 - (c.query_embedding <=> query_embedding) >= similarity_threshold
        AND (c.expires_at IS NULL OR c.expires_at > NOW())
      ORDER BY c.query_embedding <=> query_embedding
      LIMIT 1
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Find similar code patterns
CREATE OR REPLACE FUNCTION find_similar_patterns(
  query_embedding vector(1536),
  p_pattern_type TEXT DEFAULT NULL,
  max_results INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  pattern_type TEXT,
  name TEXT,
  code_template TEXT,
  similarity FLOAT,
  success_rate DECIMAL(5,2)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.pattern_type,
    p.name,
    p.code_template,
    1 - (p.embedding <=> query_embedding) as similarity,
    p.success_rate
  FROM ai_code_patterns p
  WHERE 
    p.embedding IS NOT NULL
    AND (p_pattern_type IS NULL OR p.pattern_type = p_pattern_type)
  ORDER BY 
    p.success_rate DESC,
    p.embedding <=> query_embedding
  LIMIT max_results;
END;
$$ LANGUAGE plpgsql;

-- Update function to clean expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM ai_cache
  WHERE expires_at < NOW()
  RETURNING COUNT(*) INTO deleted_count;
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create RLS policies
ALTER TABLE ai_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_code_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_design_system ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_performance_metrics ENABLE ROW LEVEL SECURITY;

-- RLS policies for ai_embeddings
CREATE POLICY "Users can view own embeddings" ON ai_embeddings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own embeddings" ON ai_embeddings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own embeddings" ON ai_embeddings
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for conversations
CREATE POLICY "Users can view own conversations" ON ai_conversations
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations" ON ai_conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations" ON ai_conversations
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS policies for messages
CREATE POLICY "Users can view messages in own conversations" ON ai_conversation_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages in own conversations" ON ai_conversation_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM ai_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- RLS policies for cache (service role only)
CREATE POLICY "Service role only for cache" ON ai_cache
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- RLS policies for code patterns (public read, service write)
CREATE POLICY "Anyone can view code patterns" ON ai_code_patterns
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage patterns" ON ai_code_patterns
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- RLS policies for design system
CREATE POLICY "Users can view project design system" ON ai_design_system
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage project design system" ON ai_design_system
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

-- Performance metrics (users can view own, service can write)
CREATE POLICY "Users can view own metrics" ON ai_performance_metrics
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role can write metrics" ON ai_performance_metrics
  FOR INSERT WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- Create trigger to update accessed_at on embedding access
CREATE OR REPLACE FUNCTION update_embedding_access()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ai_embeddings 
  SET 
    accessed_at = NOW(),
    access_count = access_count + 1
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Triggers on SELECT are not supported, so access tracking would be done in application code

-- Comments for documentation
COMMENT ON TABLE ai_embeddings IS 'Stores vector embeddings for prompts, responses, and code snippets for similarity search';
COMMENT ON TABLE ai_conversations IS 'Manages multi-turn conversation threads between users and AI';
COMMENT ON TABLE ai_cache IS 'Caches AI responses for similar queries to improve performance';
COMMENT ON TABLE ai_code_patterns IS 'Stores successful code patterns and templates for reuse';
COMMENT ON TABLE ai_design_system IS 'Project-specific design system tokens and component definitions';
COMMENT ON COLUMN ai_embeddings.embedding IS 'OpenAI text-embedding-3-small 1536-dimensional vector';
COMMENT ON INDEX idx_ai_embeddings_hnsw IS 'HNSW index optimized for production with m=32, ef_construction=400';