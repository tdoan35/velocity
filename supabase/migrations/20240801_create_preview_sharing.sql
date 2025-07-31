-- Preview Sharing Tables

-- Shared preview links
CREATE TABLE IF NOT EXISTS public.shared_preview_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  title TEXT NOT NULL,
  description TEXT,
  access_level TEXT NOT NULL DEFAULT 'viewer' CHECK (access_level IN ('viewer', 'commenter', 'editor')),
  password_hash TEXT, -- Optional password protection
  expires_at TIMESTAMPTZ,
  max_views INTEGER,
  view_count INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  requires_auth BOOLEAN DEFAULT false,
  allowed_emails TEXT[], -- Whitelist of allowed email addresses
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Shared preview sessions
CREATE TABLE IF NOT EXISTS public.shared_preview_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES public.shared_preview_links(id) ON DELETE CASCADE,
  preview_session_id UUID NOT NULL REFERENCES public.preview_sessions(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false, -- Primary session for collaborative viewing
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Preview viewers
CREATE TABLE IF NOT EXISTS public.preview_viewers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES public.shared_preview_links(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- NULL for anonymous viewers
  viewer_email TEXT,
  viewer_name TEXT,
  viewer_ip INET,
  viewer_session_id TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  access_granted_at TIMESTAMPTZ DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  permissions JSONB DEFAULT '{"can_comment": true}'::jsonb,
  user_agent TEXT,
  location JSONB -- GeoIP data
);

-- Viewer comments
CREATE TABLE IF NOT EXISTS public.preview_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES public.shared_preview_links(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES public.preview_viewers(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.preview_comments(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  timestamp_ms INTEGER, -- Timestamp in the preview session
  screen_x DECIMAL(5,2), -- X coordinate on screen (percentage)
  screen_y DECIMAL(5,2), -- Y coordinate on screen (percentage)
  is_resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Viewer reactions
CREATE TABLE IF NOT EXISTS public.preview_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES public.shared_preview_links(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES public.preview_viewers(id) ON DELETE CASCADE,
  reaction_type TEXT NOT NULL CHECK (reaction_type IN ('👍', '👎', '❤️', '🎉', '😕', '💡')),
  timestamp_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(viewer_id, share_link_id, reaction_type)
);

-- Session recordings
CREATE TABLE IF NOT EXISTS public.preview_recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES public.shared_preview_links(id) ON DELETE CASCADE,
  preview_session_id UUID NOT NULL REFERENCES public.preview_sessions(id) ON DELETE CASCADE,
  recording_url TEXT,
  recording_storage_path TEXT,
  duration_ms INTEGER,
  file_size_bytes BIGINT,
  format TEXT DEFAULT 'webm' CHECK (format IN ('webm', 'mp4')),
  resolution TEXT,
  fps INTEGER DEFAULT 30,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'recording', 'processing', 'completed', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Viewer activity log
CREATE TABLE IF NOT EXISTS public.preview_viewer_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viewer_id UUID NOT NULL REFERENCES public.preview_viewers(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'joined', 'left', 'commented', 'reacted', 'navigated', 
    'interacted', 'shared_screen', 'started_recording', 'stopped_recording'
  )),
  activity_data JSONB DEFAULT '{}'::jsonb,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Notification preferences
CREATE TABLE IF NOT EXISTS public.preview_share_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_link_id UUID NOT NULL REFERENCES public.shared_preview_links(id) ON DELETE CASCADE,
  notify_on_view BOOLEAN DEFAULT true,
  notify_on_comment BOOLEAN DEFAULT true,
  notify_on_reaction BOOLEAN DEFAULT false,
  email_notifications BOOLEAN DEFAULT true,
  push_notifications BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, share_link_id)
);

-- Create indexes
CREATE INDEX idx_shared_preview_links_token ON public.shared_preview_links(share_token) WHERE is_active = true;
CREATE INDEX idx_shared_preview_links_project ON public.shared_preview_links(project_id);
CREATE INDEX idx_shared_preview_links_created_by ON public.shared_preview_links(created_by);
CREATE INDEX idx_preview_viewers_share_link ON public.preview_viewers(share_link_id);
CREATE INDEX idx_preview_viewers_session ON public.preview_viewers(viewer_session_id);
CREATE INDEX idx_preview_comments_share_link ON public.preview_comments(share_link_id);
CREATE INDEX idx_preview_recordings_share_link ON public.preview_recordings(share_link_id);
CREATE INDEX idx_preview_viewer_activity_viewer ON public.preview_viewer_activity(viewer_id);

-- RLS Policies
ALTER TABLE public.shared_preview_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own shared links" ON public.shared_preview_links
  FOR SELECT USING (
    auth.uid() = created_by OR
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create shared links for their projects" ON public.shared_preview_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own shared links" ON public.shared_preview_links
  FOR UPDATE USING (auth.uid() = created_by);

CREATE POLICY "Users can delete their own shared links" ON public.shared_preview_links
  FOR DELETE USING (auth.uid() = created_by);

-- RLS for viewers (public access with token)
ALTER TABLE public.preview_viewers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Viewers can be created with valid token" ON public.preview_viewers
  FOR INSERT WITH CHECK (true); -- Validated at API level

CREATE POLICY "Viewers can view their own record" ON public.preview_viewers
  FOR SELECT USING (
    auth.uid() = viewer_id OR
    EXISTS (
      SELECT 1 FROM public.shared_preview_links spl
      WHERE spl.id = share_link_id AND spl.created_by = auth.uid()
    )
  );

-- Functions

-- Function to validate and access shared preview
CREATE OR REPLACE FUNCTION access_shared_preview(
  p_token TEXT,
  p_password TEXT DEFAULT NULL,
  p_viewer_email TEXT DEFAULT NULL,
  p_viewer_name TEXT DEFAULT NULL,
  p_viewer_ip INET DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
) RETURNS TABLE (
  success BOOLEAN,
  share_link_id UUID,
  viewer_session_id TEXT,
  access_level TEXT,
  project_id UUID,
  message TEXT
) AS $$
DECLARE
  v_link RECORD;
  v_viewer_id UUID;
  v_session_id TEXT;
BEGIN
  -- Find the shared link
  SELECT * INTO v_link
  FROM public.shared_preview_links
  WHERE share_token = p_token
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW());

  -- Check if link exists
  IF v_link.id IS NULL THEN
    RETURN QUERY SELECT 
      false::BOOLEAN,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::UUID,
      'Invalid or expired share link'::TEXT;
    RETURN;
  END IF;

  -- Check view count limit
  IF v_link.max_views IS NOT NULL AND v_link.view_count >= v_link.max_views THEN
    RETURN QUERY SELECT 
      false::BOOLEAN,
      NULL::UUID,
      NULL::TEXT,
      NULL::TEXT,
      NULL::UUID,
      'View limit exceeded'::TEXT;
    RETURN;
  END IF;

  -- Check password if required
  IF v_link.password_hash IS NOT NULL THEN
    IF p_password IS NULL OR NOT check_password(p_password, v_link.password_hash) THEN
      RETURN QUERY SELECT 
        false::BOOLEAN,
        NULL::UUID,
        NULL::TEXT,
        NULL::TEXT,
        NULL::UUID,
        'Invalid password'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Check email whitelist
  IF array_length(v_link.allowed_emails, 1) > 0 THEN
    IF p_viewer_email IS NULL OR NOT (p_viewer_email = ANY(v_link.allowed_emails)) THEN
      RETURN QUERY SELECT 
        false::BOOLEAN,
        NULL::UUID,
        NULL::TEXT,
        NULL::TEXT,
        NULL::UUID,
        'Email not authorized'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Create viewer record
  v_session_id := encode(gen_random_bytes(16), 'hex');
  
  INSERT INTO public.preview_viewers (
    share_link_id,
    viewer_id,
    viewer_email,
    viewer_name,
    viewer_ip,
    viewer_session_id,
    user_agent
  ) VALUES (
    v_link.id,
    auth.uid(),
    p_viewer_email,
    p_viewer_name,
    p_viewer_ip,
    v_session_id,
    p_user_agent
  ) RETURNING id INTO v_viewer_id;

  -- Log activity
  INSERT INTO public.preview_viewer_activity (
    viewer_id,
    activity_type,
    activity_data
  ) VALUES (
    v_viewer_id,
    'joined',
    jsonb_build_object(
      'ip', p_viewer_ip::TEXT,
      'user_agent', p_user_agent
    )
  );

  -- Increment view count
  UPDATE public.shared_preview_links
  SET view_count = view_count + 1,
      updated_at = NOW()
  WHERE id = v_link.id;

  -- Return success
  RETURN QUERY SELECT 
    true::BOOLEAN,
    v_link.id,
    v_session_id,
    v_link.access_level,
    v_link.project_id,
    'Access granted'::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to record viewer activity
CREATE OR REPLACE FUNCTION record_viewer_activity(
  p_viewer_session_id TEXT,
  p_activity_type TEXT,
  p_activity_data JSONB DEFAULT '{}'::jsonb
) RETURNS VOID AS $$
DECLARE
  v_viewer_id UUID;
BEGIN
  -- Get viewer ID
  SELECT id INTO v_viewer_id
  FROM public.preview_viewers
  WHERE viewer_session_id = p_viewer_session_id
    AND is_active = true;

  IF v_viewer_id IS NULL THEN
    RAISE EXCEPTION 'Invalid viewer session';
  END IF;

  -- Update last activity
  UPDATE public.preview_viewers
  SET last_activity_at = NOW()
  WHERE id = v_viewer_id;

  -- Log activity
  INSERT INTO public.preview_viewer_activity (
    viewer_id,
    activity_type,
    activity_data
  ) VALUES (
    v_viewer_id,
    p_activity_type,
    p_activity_data
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get active viewers
CREATE OR REPLACE FUNCTION get_active_viewers(p_share_link_id UUID)
RETURNS TABLE (
  viewer_id UUID,
  viewer_name TEXT,
  viewer_email TEXT,
  is_authenticated BOOLEAN,
  joined_at TIMESTAMPTZ,
  last_activity TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pv.id,
    pv.viewer_name,
    pv.viewer_email,
    pv.viewer_id IS NOT NULL as is_authenticated,
    pv.access_granted_at,
    pv.last_activity_at
  FROM public.preview_viewers pv
  WHERE pv.share_link_id = p_share_link_id
    AND pv.is_active = true
    AND pv.last_activity_at > NOW() - INTERVAL '5 minutes'
  ORDER BY pv.access_granted_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check password (placeholder - implement bcrypt)
CREATE OR REPLACE FUNCTION check_password(p_password TEXT, p_hash TEXT) 
RETURNS BOOLEAN AS $$
BEGIN
  -- In production, use proper bcrypt comparison
  -- This is a placeholder
  RETURN p_password = p_hash;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update timestamps
CREATE TRIGGER update_shared_preview_links_timestamp
  BEFORE UPDATE ON public.shared_preview_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_preview_comments_timestamp
  BEFORE UPDATE ON public.preview_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();