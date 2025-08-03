-- Create preview_sessions table for tracking Appetize.io sessions
CREATE TABLE IF NOT EXISTS preview_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  session_id TEXT,
  public_key TEXT,
  device_id TEXT NOT NULL,
  app_url TEXT NOT NULL,
  preview_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('creating', 'active', 'ended', 'error')),
  error_message TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

-- Create indexes for preview_sessions
CREATE INDEX IF NOT EXISTS idx_preview_sessions_user_id ON preview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_project_id ON preview_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_session_id ON preview_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_status ON preview_sessions(status);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_created_at ON preview_sessions(created_at DESC);

-- Create preview_session_metrics table for usage tracking
CREATE TABLE IF NOT EXISTS preview_session_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL,
  duration_seconds INTEGER,
  device_type TEXT,
  hot_reloads_count INTEGER DEFAULT 0,
  errors_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for preview_session_metrics
CREATE INDEX IF NOT EXISTS idx_preview_metrics_session_id ON preview_session_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_preview_metrics_user_id ON preview_session_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_preview_metrics_project_id ON preview_session_metrics(project_id);

-- Create preview_sharing table for public preview links
CREATE TABLE IF NOT EXISTS preview_sharing (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::TEXT,
  session_id TEXT,
  permissions TEXT[] DEFAULT ARRAY['view'],
  access_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ
);

-- Create indexes for preview_sharing
CREATE INDEX IF NOT EXISTS idx_preview_sharing_share_token ON preview_sharing(share_token);
CREATE INDEX IF NOT EXISTS idx_preview_sharing_project_id ON preview_sharing(project_id);
CREATE INDEX IF NOT EXISTS idx_preview_sharing_expires_at ON preview_sharing(expires_at);

-- Create session pool for resource optimization
CREATE TABLE IF NOT EXISTS preview_session_pool (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  public_key TEXT,
  session_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('available', 'reserved', 'warming', 'expired')),
  reserved_by UUID REFERENCES auth.users(id),
  reserved_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Create indexes for preview_session_pool
CREATE INDEX IF NOT EXISTS idx_session_pool_status ON preview_session_pool(status);
CREATE INDEX IF NOT EXISTS idx_session_pool_device_id ON preview_session_pool(device_id);
CREATE INDEX IF NOT EXISTS idx_session_pool_reserved_by ON preview_session_pool(reserved_by);

-- Enable RLS
ALTER TABLE preview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE preview_session_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE preview_sharing ENABLE ROW LEVEL SECURITY;
ALTER TABLE preview_session_pool ENABLE ROW LEVEL SECURITY;

-- RLS Policies for preview_sessions
CREATE POLICY "Users can view their own preview sessions" ON preview_sessions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own preview sessions" ON preview_sessions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preview sessions" ON preview_sessions
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for preview_session_metrics
CREATE POLICY "Users can view their own metrics" ON preview_session_metrics
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own metrics" ON preview_session_metrics
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for preview_sharing
CREATE POLICY "Users can view their own shares" ON preview_sharing
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view public shares" ON preview_sharing
  FOR SELECT USING (expires_at IS NULL OR expires_at > NOW());

CREATE POLICY "Users can create shares for their projects" ON preview_sharing
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shares" ON preview_sharing
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shares" ON preview_sharing
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for preview_session_pool
CREATE POLICY "Users can view available sessions" ON preview_session_pool
  FOR SELECT USING (status = 'available' OR reserved_by = auth.uid());

CREATE POLICY "System can manage session pool" ON preview_session_pool
  FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_preview_sessions()
RETURNS void AS $$
BEGIN
  -- Mark expired active sessions as ended
  UPDATE preview_sessions
  SET status = 'ended', ended_at = NOW()
  WHERE status = 'active' 
    AND expires_at < NOW();

  -- Clean up expired pool sessions
  UPDATE preview_session_pool
  SET status = 'expired'
  WHERE status IN ('available', 'reserved')
    AND expires_at < NOW();

  -- Remove old expired pool sessions
  DELETE FROM preview_session_pool
  WHERE status = 'expired'
    AND expires_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql;

-- Function to warm session pool
CREATE OR REPLACE FUNCTION warm_session_pool(
  p_device_id TEXT,
  p_target_count INTEGER DEFAULT 3
)
RETURNS INTEGER AS $$
DECLARE
  current_count INTEGER;
  sessions_to_create INTEGER;
BEGIN
  -- Count current available sessions
  SELECT COUNT(*) INTO current_count
  FROM preview_session_pool
  WHERE device_id = p_device_id
    AND status = 'available'
    AND (expires_at IS NULL OR expires_at > NOW());

  -- Calculate how many sessions to create
  sessions_to_create := p_target_count - current_count;

  -- Create warming entries (actual warming happens in Edge Function)
  IF sessions_to_create > 0 THEN
    INSERT INTO preview_session_pool (device_id, status)
    SELECT p_device_id, 'warming'
    FROM generate_series(1, sessions_to_create);
  END IF;

  RETURN sessions_to_create;
END;
$$ LANGUAGE plpgsql;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_preview_sessions_active 
  ON preview_sessions(project_id, status) 
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_session_pool_available 
  ON preview_session_pool(device_id, status) 
  WHERE status = 'available';