-- Supabase Real-time Subscriptions Configuration for Velocity Platform
-- This configures real-time functionality for collaborative features and live updates

-- =====================================================
-- REAL-TIME CONFIGURATION TABLES
-- =====================================================

-- Table to manage real-time channels and subscriptions
CREATE TABLE IF NOT EXISTS public.realtime_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name text UNIQUE NOT NULL,
  channel_type text NOT NULL CHECK (channel_type IN (
    'project_collaboration', 'user_presence', 'system_notifications',
    'build_status', 'file_changes', 'chat_messages', 'code_sync'
  )),
  table_name text,
  event_types text[] DEFAULT ARRAY['INSERT', 'UPDATE', 'DELETE'],
  is_active boolean DEFAULT true,
  access_policy jsonb DEFAULT '{}'::jsonb,
  rate_limit_per_second integer DEFAULT 100,
  max_subscribers integer DEFAULT 1000,
  description text,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- Table to track active real-time subscriptions
CREATE TABLE IF NOT EXISTS public.realtime_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  channel_name text NOT NULL,
  subscription_id text NOT NULL,
  connection_id text,
  client_info jsonb DEFAULT '{}'::jsonb,
  subscribed_at timestamptz DEFAULT NOW(),
  last_activity timestamptz DEFAULT NOW(),
  is_active boolean DEFAULT true,
  
  UNIQUE(user_id, channel_name, subscription_id)
);

-- Table for user presence tracking
CREATE TABLE IF NOT EXISTS public.user_presence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('online', 'away', 'busy', 'offline')),
  last_seen timestamptz DEFAULT NOW(),
  current_page text,
  cursor_position jsonb DEFAULT '{}'::jsonb,
  active_file text,
  client_info jsonb DEFAULT '{}'::jsonb,
  session_id text,
  
  UNIQUE(user_id, project_id)
);

-- Table for broadcast messages and notifications
CREATE TABLE IF NOT EXISTS public.realtime_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_name text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_users uuid[],
  target_projects uuid[],
  priority text DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  expires_at timestamptz,
  delivered_to uuid[] DEFAULT ARRAY[]::uuid[],
  created_at timestamptz DEFAULT NOW()
);

-- =====================================================
-- DEFAULT REAL-TIME CHANNEL CONFIGURATIONS
-- =====================================================

-- Insert default real-time channel configurations
INSERT INTO public.realtime_channels (channel_name, channel_type, table_name, event_types, access_policy, description) VALUES

-- Project collaboration channels
('project_files_changes', 'file_changes', 'project_files', 
 ARRAY['INSERT', 'UPDATE', 'DELETE'], 
 '{"require_project_access": true, "roles": ["owner", "editor", "viewer"]}'::jsonb,
 'Real-time file changes within projects'),

('project_collaborators_updates', 'project_collaboration', 'project_collaborators', 
 ARRAY['INSERT', 'UPDATE', 'DELETE'], 
 '{"require_project_access": true, "roles": ["owner", "editor"]}'::jsonb,
 'Real-time collaborator additions and removals'),

('project_builds_status', 'build_status', 'builds', 
 ARRAY['INSERT', 'UPDATE'], 
 '{"require_project_access": true, "roles": ["owner", "editor", "viewer"]}'::jsonb,
 'Real-time build status updates'),

-- User presence and activity
('user_presence_updates', 'user_presence', 'user_presence', 
 ARRAY['INSERT', 'UPDATE', 'DELETE'], 
 '{"require_authentication": true}'::jsonb,
 'Real-time user presence and activity tracking'),

-- System-wide notifications
('system_notifications', 'system_notifications', NULL, 
 ARRAY[]::text[], 
 '{"require_authentication": true, "broadcast_only": true}'::jsonb,
 'System-wide notifications and announcements'),

-- AI interactions and responses
('ai_interactions_updates', 'project_collaboration', 'ai_interactions', 
 ARRAY['INSERT', 'UPDATE'], 
 '{"require_project_access": true, "roles": ["owner", "editor"]}'::jsonb,
 'Real-time AI interaction results and streaming'),

-- Code synchronization
('code_sync_events', 'code_sync', NULL, 
 ARRAY[]::text[], 
 '{"require_project_access": true, "roles": ["owner", "editor"], "broadcast_only": true}'::jsonb,
 'Real-time code synchronization and collaborative editing')

ON CONFLICT (channel_name) DO UPDATE SET
  channel_type = EXCLUDED.channel_type,
  table_name = EXCLUDED.table_name,
  event_types = EXCLUDED.event_types,
  access_policy = EXCLUDED.access_policy,
  description = EXCLUDED.description,
  updated_at = NOW();

-- =====================================================
-- REAL-TIME FUNCTIONS
-- =====================================================

-- Function to check if user has access to a real-time channel
CREATE OR REPLACE FUNCTION public.check_realtime_channel_access(
  channel_name_param text,
  user_uuid uuid DEFAULT auth.uid(),
  project_uuid uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  channel_config public.realtime_channels;
  access_policy jsonb;
  user_role text;
BEGIN
  -- Get channel configuration
  SELECT * INTO channel_config
  FROM public.realtime_channels
  WHERE channel_name = channel_name_param AND is_active = true;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  access_policy := channel_config.access_policy;
  
  -- Check authentication requirement
  IF (access_policy->>'require_authentication')::boolean = true AND user_uuid IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check project access requirement
  IF (access_policy->>'require_project_access')::boolean = true THEN
    IF project_uuid IS NULL THEN
      RETURN false;
    END IF;
    
    -- Get user's role in the project
    SELECT role INTO user_role
    FROM public.project_collaborators
    WHERE project_id = project_uuid AND user_id = user_uuid;
    
    IF NOT FOUND THEN
      -- Check if user is project owner
      SELECT 'owner' INTO user_role
      FROM public.projects
      WHERE id = project_uuid AND owner_id = user_uuid;
      
      IF NOT FOUND THEN
        RETURN false;
      END IF;
    END IF;
    
    -- Check if user's role is allowed
    IF access_policy ? 'roles' THEN
      IF NOT (user_role = ANY(array(SELECT jsonb_array_elements_text(access_policy->'roles')))) THEN
        RETURN false;
      END IF;
    END IF;
  END IF;
  
  RETURN true;
END;
$$;

-- Function to update user presence
CREATE OR REPLACE FUNCTION public.update_user_presence(
  project_uuid uuid,
  status_param text DEFAULT 'online',
  current_page_param text DEFAULT NULL,
  cursor_position_param jsonb DEFAULT NULL,
  active_file_param text DEFAULT NULL,
  client_info_param jsonb DEFAULT NULL,
  session_id_param text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  
  -- Verify user has access to the project
  IF NOT public.check_realtime_channel_access('user_presence_updates', current_user_id, project_uuid) THEN
    RAISE EXCEPTION 'Access denied to project';
  END IF;
  
  -- Upsert user presence
  INSERT INTO public.user_presence (
    user_id, project_id, status, current_page, cursor_position,
    active_file, client_info, session_id, last_seen
  ) VALUES (
    current_user_id, project_uuid, status_param, current_page_param,
    cursor_position_param, active_file_param, client_info_param,
    session_id_param, NOW()
  )
  ON CONFLICT (user_id, project_id) DO UPDATE SET
    status = EXCLUDED.status,
    current_page = EXCLUDED.current_page,
    cursor_position = EXCLUDED.cursor_position,
    active_file = EXCLUDED.active_file,
    client_info = EXCLUDED.client_info,
    session_id = EXCLUDED.session_id,
    last_seen = NOW();
END;
$$;

-- Function to broadcast message to channel
CREATE OR REPLACE FUNCTION public.broadcast_realtime_message(
  channel_name_param text,
  event_type_param text,
  payload_param jsonb,
  target_users_param uuid[] DEFAULT NULL,
  target_projects_param uuid[] DEFAULT NULL,
  priority_param text DEFAULT 'normal',
  expires_in_seconds integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  broadcast_id uuid;
  expires_at_param timestamptz := NULL;
  sender_user_id uuid;
BEGIN
  sender_user_id := auth.uid();
  
  -- Calculate expiration time if specified
  IF expires_in_seconds IS NOT NULL THEN
    expires_at_param := NOW() + (expires_in_seconds || ' seconds')::interval;
  END IF;
  
  -- Insert broadcast message
  INSERT INTO public.realtime_broadcasts (
    channel_name, event_type, payload, sender_id,
    target_users, target_projects, priority, expires_at
  ) VALUES (
    channel_name_param, event_type_param, payload_param, sender_user_id,
    target_users_param, target_projects_param, priority_param, expires_at_param
  ) RETURNING id INTO broadcast_id;
  
  RETURN broadcast_id;
END;
$$;

-- Function to get active users in a project
CREATE OR REPLACE FUNCTION public.get_project_active_users(project_uuid uuid)
RETURNS TABLE (
  user_id uuid,
  username text,
  avatar_url text,
  status text,
  current_page text,
  active_file text,
  last_seen timestamptz,
  cursor_position jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Check if user has access to the project
  IF NOT public.check_realtime_channel_access('user_presence_updates', auth.uid(), project_uuid) THEN
    RAISE EXCEPTION 'Access denied to project';
  END IF;
  
  RETURN QUERY
  SELECT 
    up.user_id,
    up_profile.username,
    up_profile.avatar_url,
    up.status,
    up.current_page,
    up.active_file,
    up.last_seen,
    up.cursor_position
  FROM public.user_presence up
  JOIN public.user_profiles up_profile ON up.user_id = up_profile.id
  WHERE up.project_id = project_uuid
    AND up.last_seen > NOW() - INTERVAL '5 minutes'
    AND up.status != 'offline'
  ORDER BY up.last_seen DESC;
END;
$$;

-- Function to clean up expired broadcasts and inactive subscriptions
CREATE OR REPLACE FUNCTION public.cleanup_realtime_data(
  days_old integer DEFAULT 7,
  inactive_minutes integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cleanup_stats jsonb := '{"expired_broadcasts": 0, "inactive_subscriptions": 0, "offline_presence": 0}'::jsonb;
  deleted_count integer;
BEGIN
  -- Clean up expired broadcasts
  DELETE FROM public.realtime_broadcasts
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  cleanup_stats := jsonb_set(cleanup_stats, '{expired_broadcasts}', deleted_count::text::jsonb);
  
  -- Clean up old broadcasts (keep for analysis)
  DELETE FROM public.realtime_broadcasts
  WHERE created_at < NOW() - (days_old || ' days')::interval;
  
  -- Clean up inactive subscriptions
  DELETE FROM public.realtime_subscriptions
  WHERE last_activity < NOW() - (inactive_minutes || ' minutes')::interval;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  cleanup_stats := jsonb_set(cleanup_stats, '{inactive_subscriptions}', deleted_count::text::jsonb);
  
  -- Update offline status for inactive users
  UPDATE public.user_presence
  SET status = 'offline'
  WHERE last_seen < NOW() - (inactive_minutes || ' minutes')::interval
    AND status != 'offline';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  cleanup_stats := jsonb_set(cleanup_stats, '{offline_presence}', deleted_count::text::jsonb);
  
  RETURN cleanup_stats;
END;
$$;

-- =====================================================
-- REAL-TIME TRIGGERS
-- =====================================================

-- Function to track subscription activity
CREATE OR REPLACE FUNCTION public.track_subscription_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update last activity timestamp
  UPDATE public.realtime_subscriptions
  SET last_activity = NOW()
  WHERE user_id = auth.uid()
    AND channel_name = TG_ARGV[0]
    AND is_active = true;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Function to automatically update presence on user activity
CREATE OR REPLACE FUNCTION public.auto_update_presence()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update user's last seen timestamp for all their active presence records
  UPDATE public.user_presence
  SET last_seen = NOW()
  WHERE user_id = auth.uid();
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers for automatic presence updates
CREATE TRIGGER update_presence_on_project_activity
  AFTER INSERT OR UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_update_presence();

CREATE TRIGGER update_presence_on_file_activity
  AFTER INSERT OR UPDATE ON public.project_files
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_update_presence();

CREATE TRIGGER update_presence_on_ai_activity
  AFTER INSERT OR UPDATE ON public.ai_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_update_presence();

-- =====================================================
-- REAL-TIME MONITORING VIEWS
-- =====================================================

-- View for active real-time subscriptions
CREATE OR REPLACE VIEW public.active_realtime_subscriptions AS
SELECT 
  rs.channel_name,
  COUNT(*) as subscriber_count,
  array_agg(DISTINCT up.username) as subscribers,
  MAX(rs.last_activity) as last_activity,
  rc.max_subscribers,
  CASE 
    WHEN COUNT(*) > rc.max_subscribers * 0.8 THEN 'high'
    WHEN COUNT(*) > rc.max_subscribers * 0.5 THEN 'medium'
    ELSE 'low'
  END as usage_level
FROM public.realtime_subscriptions rs
JOIN public.user_profiles up ON rs.user_id = up.id
JOIN public.realtime_channels rc ON rs.channel_name = rc.channel_name
WHERE rs.is_active = true 
  AND rs.last_activity > NOW() - INTERVAL '30 minutes'
GROUP BY rs.channel_name, rc.max_subscribers
ORDER BY subscriber_count DESC;

-- View for user presence summary by project
CREATE OR REPLACE VIEW public.project_presence_summary AS
SELECT 
  p.id as project_id,
  p.name as project_name,
  COUNT(*) as active_users,
  array_agg(up_profile.username) as active_usernames,
  array_agg(up.status) as user_statuses,
  MAX(up.last_seen) as last_activity
FROM public.projects p
JOIN public.user_presence up ON p.id = up.project_id
JOIN public.user_profiles up_profile ON up.user_id = up_profile.id
WHERE up.last_seen > NOW() - INTERVAL '5 minutes'
  AND up.status != 'offline'
GROUP BY p.id, p.name
ORDER BY active_users DESC, last_activity DESC;

-- View for real-time broadcast statistics
CREATE OR REPLACE VIEW public.realtime_broadcast_stats AS
SELECT 
  channel_name,
  event_type,
  COUNT(*) as total_broadcasts,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour') as broadcasts_last_hour,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as broadcasts_last_day,
  AVG(array_length(delivered_to, 1)) as avg_delivery_count,
  MAX(created_at) as last_broadcast
FROM public.realtime_broadcasts
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY channel_name, event_type
ORDER BY total_broadcasts DESC;

-- =====================================================
-- RLS POLICIES FOR REAL-TIME TABLES
-- =====================================================

-- Enable RLS on all real-time tables
ALTER TABLE public.realtime_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.realtime_broadcasts ENABLE ROW LEVEL SECURITY;

-- Service role can manage all real-time data
CREATE POLICY "Service role full access realtime_channels" ON public.realtime_channels
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access realtime_subscriptions" ON public.realtime_subscriptions
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access user_presence" ON public.user_presence
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access realtime_broadcasts" ON public.realtime_broadcasts
FOR ALL USING (auth.role() = 'service_role');

-- Users can view active channels they have access to
CREATE POLICY "Users can view accessible channels" ON public.realtime_channels
FOR SELECT USING (
  is_active = true AND
  public.check_realtime_channel_access(channel_name, auth.uid())
);

-- Users can manage their own subscriptions
CREATE POLICY "Users can manage own subscriptions" ON public.realtime_subscriptions
FOR ALL USING (auth.uid() = user_id);

-- Users can view presence in projects they have access to
CREATE POLICY "Users can view project presence" ON public.user_presence
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.project_collaborators pc
    WHERE pc.project_id = user_presence.project_id 
      AND pc.user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = user_presence.project_id 
      AND p.owner_id = auth.uid()
  )
);

-- Users can update their own presence
CREATE POLICY "Users can update own presence" ON public.user_presence
FOR ALL USING (auth.uid() = user_id);

-- Users can view broadcasts targeted to them or their projects
CREATE POLICY "Users can view targeted broadcasts" ON public.realtime_broadcasts
FOR SELECT USING (
  (target_users IS NULL OR auth.uid() = ANY(target_users)) AND
  (target_projects IS NULL OR EXISTS (
    SELECT 1 FROM public.project_collaborators pc
    WHERE pc.user_id = auth.uid() AND pc.project_id = ANY(target_projects)
  ) OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.owner_id = auth.uid() AND p.id = ANY(target_projects)
  ))
);

-- =====================================================
-- GRANTS AND PERMISSIONS
-- =====================================================

-- Grant access to real-time functions
GRANT EXECUTE ON FUNCTION public.check_realtime_channel_access(text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_user_presence(uuid, text, text, jsonb, text, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.broadcast_realtime_message(text, text, jsonb, uuid[], uuid[], text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_active_users(uuid) TO authenticated;

-- Service role permissions for management functions
GRANT EXECUTE ON FUNCTION public.cleanup_realtime_data(integer, integer) TO service_role;

-- Grant access to views
GRANT SELECT ON public.active_realtime_subscriptions TO authenticated;
GRANT SELECT ON public.project_presence_summary TO authenticated;
GRANT SELECT ON public.realtime_broadcast_stats TO service_role;

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Indexes for realtime_broadcasts
CREATE INDEX IF NOT EXISTS idx_realtime_broadcasts_channel_time ON public.realtime_broadcasts(channel_name, created_at);
CREATE INDEX IF NOT EXISTS idx_realtime_broadcasts_target_users ON public.realtime_broadcasts USING GIN(target_users);
CREATE INDEX IF NOT EXISTS idx_realtime_broadcasts_expires_at ON public.realtime_broadcasts(expires_at) WHERE expires_at IS NOT NULL;

-- Additional performance indexes
CREATE INDEX IF NOT EXISTS idx_realtime_subscriptions_user_channel ON public.realtime_subscriptions(user_id, channel_name);
CREATE INDEX IF NOT EXISTS idx_realtime_subscriptions_activity ON public.realtime_subscriptions(last_activity) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_user_presence_project_status ON public.user_presence(project_id, status, last_seen);
CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON public.user_presence(last_seen) WHERE status != 'offline';

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.realtime_channels IS 'Configuration for real-time channels and subscriptions';
COMMENT ON TABLE public.realtime_subscriptions IS 'Active real-time subscriptions tracking';
COMMENT ON TABLE public.user_presence IS 'User presence and activity tracking by project';
COMMENT ON TABLE public.realtime_broadcasts IS 'Broadcast messages and notifications';

COMMENT ON FUNCTION public.check_realtime_channel_access IS 'Check if user has access to real-time channel';
COMMENT ON FUNCTION public.update_user_presence IS 'Update user presence status and activity';
COMMENT ON FUNCTION public.broadcast_realtime_message IS 'Broadcast message to real-time channel';
COMMENT ON FUNCTION public.get_project_active_users IS 'Get list of active users in a project';
COMMENT ON FUNCTION public.cleanup_realtime_data IS 'Clean up expired real-time data';

COMMENT ON VIEW public.active_realtime_subscriptions IS 'Active real-time subscription statistics';
COMMENT ON VIEW public.project_presence_summary IS 'User presence summary by project';
COMMENT ON VIEW public.realtime_broadcast_stats IS 'Real-time broadcast statistics and metrics';