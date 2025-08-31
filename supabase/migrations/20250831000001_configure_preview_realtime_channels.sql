-- Migration: Configure Supabase Realtime channels for real-time preview system
-- Date: August 31, 2025
-- Description: Set up proper channel configuration, authentication, and policies for preview container communication

BEGIN;

-- =====================================================
-- PREVIEW-SPECIFIC REALTIME CHANNELS
-- =====================================================

-- Insert preview-specific channel configurations
INSERT INTO public.realtime_channels (channel_name, channel_type, access_policy, rate_limit_per_second, max_subscribers, description) VALUES

-- Project file changes channel (used by containers and frontend)
('realtime:project:files', 'file_changes', 
 '{"require_project_access": true, "roles": ["owner", "editor"], "broadcast_only": true, "allow_containers": true}'::jsonb,
 50, -- 50 messages per second limit  
 100, -- Max 100 subscribers (containers + frontend users)
 'Real-time file changes between frontend editor and preview containers'),

-- Project preview session management
('realtime:preview:session', 'system_notifications',
 '{"require_project_access": true, "roles": ["owner", "editor"], "broadcast_only": true}'::jsonb,
 10, -- Lower rate limit for session management
 50, -- Fewer subscribers needed
 'Preview session lifecycle events and container status updates'),

-- Container health and status monitoring  
('realtime:container:health', 'system_notifications',
 '{"require_authentication": true, "broadcast_only": true}'::jsonb,
 5, -- Very low rate limit for health checks
 20, -- Only orchestrator + monitoring systems
 'Container health status and diagnostic information')

ON CONFLICT (channel_name) DO UPDATE SET
  channel_type = EXCLUDED.channel_type,
  access_policy = EXCLUDED.access_policy,
  rate_limit_per_second = EXCLUDED.rate_limit_per_second,
  max_subscribers = EXCLUDED.max_subscribers,
  description = EXCLUDED.description,
  updated_at = NOW();

-- =====================================================
-- ENHANCED CHANNEL ACCESS FUNCTION FOR PREVIEW SYSTEM
-- =====================================================

-- Enhanced function to support container-based channel access
CREATE OR REPLACE FUNCTION public.check_preview_channel_access(
  channel_pattern text,
  project_uuid uuid,
  user_uuid uuid DEFAULT auth.uid(),
  container_token text DEFAULT NULL
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
  is_container_request boolean := false;
BEGIN
  -- Determine if this is a container request
  is_container_request := (container_token IS NOT NULL);
  
  -- Get base channel configuration (using pattern matching)
  SELECT * INTO channel_config
  FROM public.realtime_channels
  WHERE channel_name = channel_pattern OR channel_name LIKE split_part(channel_pattern, ':', 1) || ':' || split_part(channel_pattern, ':', 2) || ':%'
  AND is_active = true
  ORDER BY length(channel_name) DESC -- Prefer more specific matches
  LIMIT 1;
  
  IF NOT FOUND THEN
    -- Fallback to generic project channel pattern
    SELECT * INTO channel_config
    FROM public.realtime_channels
    WHERE channel_name = 'realtime:project:files' AND is_active = true;
    
    IF NOT FOUND THEN
      RETURN false;
    END IF;
  END IF;
  
  access_policy := channel_config.access_policy;
  
  -- Handle container requests with special authorization
  IF is_container_request THEN
    -- Check if containers are allowed for this channel
    IF (access_policy->>'allow_containers')::boolean != true THEN
      RETURN false;
    END IF;
    
    -- Verify container token is valid (basic validation)
    -- In production, this would verify against container registry or orchestrator
    IF length(container_token) < 10 THEN
      RETURN false;
    END IF;
    
    -- For containers, verify the project exists and container has access
    IF NOT EXISTS (SELECT 1 FROM public.preview_sessions WHERE project_id = project_uuid AND status = 'active') THEN
      RETURN false;
    END IF;
    
    RETURN true;
  END IF;
  
  -- Handle regular user requests
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

-- =====================================================
-- PREVIEW CHANNEL MANAGEMENT FUNCTIONS
-- =====================================================

-- Function to register a preview container with a project channel
CREATE OR REPLACE FUNCTION public.register_preview_container(
  project_uuid uuid,
  container_id_param text,
  container_url_param text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  channel_name_result text;
  registration_info jsonb;
BEGIN
  -- Verify container is associated with an active preview session
  IF NOT EXISTS (
    SELECT 1 FROM public.preview_sessions 
    WHERE project_id = project_uuid 
    AND container_id = container_id_param 
    AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Container not associated with active preview session';
  END IF;
  
  -- Generate channel name for this project
  channel_name_result := 'realtime:project:' || project_uuid::text;
  
  -- Insert subscription record for tracking
  INSERT INTO public.realtime_subscriptions (
    user_id, channel_name, subscription_id, connection_id, client_info, is_active
  ) VALUES (
    NULL, -- No user for container subscriptions
    channel_name_result,
    'container:' || container_id_param,
    container_id_param,
    jsonb_build_object(
      'type', 'preview_container',
      'container_id', container_id_param,
      'container_url', container_url_param,
      'project_id', project_uuid
    ),
    true
  ) ON CONFLICT (user_id, channel_name, subscription_id) 
  DO UPDATE SET 
    connection_id = EXCLUDED.connection_id,
    client_info = EXCLUDED.client_info,
    last_activity = NOW(),
    is_active = true;
  
  -- Return registration information
  registration_info := jsonb_build_object(
    'channel_name', channel_name_result,
    'container_id', container_id_param,
    'access_token', 'container:' || container_id_param, -- Simple token for demo
    'registered_at', NOW()
  );
  
  -- Broadcast container registration event
  PERFORM public.broadcast_realtime_message(
    'realtime:container:health',
    'container:registered',
    jsonb_build_object(
      'project_id', project_uuid,
      'container_id', container_id_param,
      'container_url', container_url_param,
      'status', 'active'
    ),
    NULL, -- No specific users
    ARRAY[project_uuid], -- Target project
    'normal'
  );
  
  RETURN registration_info;
END;
$$;

-- Function to unregister a preview container
CREATE OR REPLACE FUNCTION public.unregister_preview_container(
  project_uuid uuid,
  container_id_param text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  channel_name_result text;
BEGIN
  channel_name_result := 'realtime:project:' || project_uuid::text;
  
  -- Mark subscription as inactive
  UPDATE public.realtime_subscriptions
  SET is_active = false, last_activity = NOW()
  WHERE channel_name = channel_name_result 
  AND subscription_id = 'container:' || container_id_param;
  
  -- Broadcast container unregistration event
  PERFORM public.broadcast_realtime_message(
    'realtime:container:health',
    'container:unregistered',
    jsonb_build_object(
      'project_id', project_uuid,
      'container_id', container_id_param,
      'status', 'ended'
    ),
    NULL,
    ARRAY[project_uuid],
    'normal'
  );
  
  RETURN true;
END;
$$;

-- Function to broadcast file updates with rate limiting
CREATE OR REPLACE FUNCTION public.broadcast_file_update(
  project_uuid uuid,
  file_path text,
  file_content text,
  sender_type text DEFAULT 'user' -- 'user' or 'container'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  broadcast_id uuid;
  channel_name_result text;
  sender_user_id uuid;
BEGIN
  sender_user_id := auth.uid();
  channel_name_result := 'realtime:project:' || project_uuid::text;
  
  -- Rate limiting check (simple implementation)
  -- In production, this would use more sophisticated rate limiting
  IF EXISTS (
    SELECT 1 FROM public.realtime_broadcasts 
    WHERE channel_name = channel_name_result
    AND sender_id = sender_user_id
    AND created_at > NOW() - INTERVAL '1 second'
    AND payload->>'file_path' = file_path
  ) THEN
    RAISE EXCEPTION 'Rate limit exceeded for file updates';
  END IF;
  
  -- Insert broadcast message
  INSERT INTO public.realtime_broadcasts (
    channel_name, event_type, payload, sender_id, target_projects, priority
  ) VALUES (
    channel_name_result,
    'file:update', 
    jsonb_build_object(
      'file_path', file_path,
      'content', file_content,
      'timestamp', NOW()::text,
      'sender_type', sender_type,
      'project_id', project_uuid
    ),
    sender_user_id,
    ARRAY[project_uuid],
    'normal'
  ) RETURNING id INTO broadcast_id;
  
  RETURN broadcast_id;
END;
$$;

-- =====================================================
-- REALTIME POLICIES FOR PREVIEW CHANNELS
-- =====================================================

-- Allow authenticated users to access preview channel configurations
CREATE POLICY "Users can access preview channel configs" ON public.realtime_channels
FOR SELECT USING (
  is_active = true AND
  channel_type IN ('file_changes', 'system_notifications') AND
  (channel_name LIKE 'realtime:project:%' OR 
   channel_name LIKE 'realtime:preview:%' OR 
   channel_name LIKE 'realtime:container:%')
);

-- Allow users to manage subscriptions for their accessible projects
CREATE POLICY "Users can manage project subscriptions" ON public.realtime_subscriptions
FOR ALL USING (
  auth.uid() = user_id OR 
  (user_id IS NULL AND subscription_id LIKE 'container:%')
);

-- Allow viewing broadcasts for accessible projects
CREATE POLICY "Users can view project broadcasts" ON public.realtime_broadcasts
FOR SELECT USING (
  target_projects IS NULL OR 
  EXISTS (
    SELECT 1 FROM public.project_collaborators pc
    WHERE pc.user_id = auth.uid() AND pc.project_id = ANY(target_projects)
  ) OR
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.owner_id = auth.uid() AND p.id = ANY(target_projects)
  )
);

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for channel pattern matching
CREATE INDEX IF NOT EXISTS idx_realtime_channels_pattern ON public.realtime_channels(channel_type, channel_name);

-- Index for container subscriptions
CREATE INDEX IF NOT EXISTS idx_realtime_subscriptions_container ON public.realtime_subscriptions(subscription_id) 
WHERE subscription_id LIKE 'container:%';

-- Index for project-specific broadcasts
CREATE INDEX IF NOT EXISTS idx_realtime_broadcasts_project_time ON public.realtime_broadcasts(target_projects, created_at);

-- =====================================================
-- GRANTS AND PERMISSIONS
-- =====================================================

-- Grant access to preview functions
GRANT EXECUTE ON FUNCTION public.check_preview_channel_access(text, uuid, uuid, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.register_preview_container(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unregister_preview_container(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.broadcast_file_update(uuid, text, text, text) TO authenticated;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON FUNCTION public.check_preview_channel_access IS 'Enhanced channel access check supporting both users and containers';
COMMENT ON FUNCTION public.register_preview_container IS 'Register a preview container for real-time communication';
COMMENT ON FUNCTION public.unregister_preview_container IS 'Unregister a preview container from real-time communication';
COMMENT ON FUNCTION public.broadcast_file_update IS 'Broadcast file updates with rate limiting and validation';

COMMIT;