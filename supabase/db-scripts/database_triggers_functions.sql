-- Database Triggers and Functions for Velocity Platform
-- This implements automated workflows, data integrity, and operational functions

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to generate UUID v4
CREATE OR REPLACE FUNCTION public.generate_uuid()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT gen_random_uuid();
$$;

-- Function to generate slug from text
CREATE OR REPLACE FUNCTION public.generate_slug(input_text text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN lower(
    regexp_replace(
      regexp_replace(
        regexp_replace(input_text, '[^a-zA-Z0-9\s-]', '', 'g'),
        '\s+', '-', 'g'
      ),
      '-+', '-', 'g'
    )
  );
END;
$$;

-- Function to get current timestamp in ISO format
CREATE OR REPLACE FUNCTION public.current_timestamp_iso()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
$$;

-- =====================================================
-- TIMESTAMP MANAGEMENT TRIGGERS
-- =====================================================

-- Generic function to update timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Function to set created_at and updated_at on insert
CREATE OR REPLACE FUNCTION public.handle_timestamps()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_at = COALESCE(NEW.created_at, NOW());
  NEW.updated_at = COALESCE(NEW.updated_at, NOW());
  RETURN NEW;
END;
$$;

-- =====================================================
-- USER PROFILE AUTOMATION
-- =====================================================

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  display_name text;
  username_base text;
  final_username text;
  counter integer := 0;
BEGIN
  -- Extract display name from metadata or use email
  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  
  -- Generate username base
  username_base := public.generate_slug(display_name);
  final_username := username_base;
  
  -- Ensure username is unique
  WHILE EXISTS (SELECT 1 FROM public.user_profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := username_base || '-' || counter::text;
  END LOOP;
  
  -- Insert user profile
  INSERT INTO public.user_profiles (
    id,
    email,
    username,
    display_name,
    avatar_url,
    metadata
  ) VALUES (
    NEW.id,
    NEW.email,
    final_username,
    display_name,
    NEW.raw_user_meta_data->>'avatar_url',
    jsonb_build_object(
      'provider', NEW.app_metadata->>'provider',
      'providers', NEW.app_metadata->'providers',
      'email_verified', NEW.email_confirmed_at IS NOT NULL,
      'created_via', 'auto_signup'
    )
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for new user profile creation
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- AUDIT LOGGING SYSTEM
-- =====================================================

-- Audit log table for tracking important changes
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values jsonb,
  new_values jsonb,
  changed_fields text[],
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  ip_address inet,
  user_agent text,
  session_id text,
  created_at timestamptz DEFAULT NOW()
);

-- Function to create audit log entries
CREATE OR REPLACE FUNCTION public.create_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  old_data jsonb := NULL;
  new_data jsonb := NULL;
  changed_fields text[] := ARRAY[]::text[];
  current_user_id uuid;
  current_user_email text;
  field_name text;
BEGIN
  -- Get current user information
  current_user_id := auth.uid();
  
  IF current_user_id IS NOT NULL THEN
    SELECT email INTO current_user_email 
    FROM auth.users 
    WHERE id = current_user_id;
  END IF;
  
  -- Handle different operations
  IF TG_OP = 'DELETE' THEN
    old_data := to_jsonb(OLD);
    
  ELSIF TG_OP = 'UPDATE' THEN
    old_data := to_jsonb(OLD);
    new_data := to_jsonb(NEW);
    
    -- Find changed fields
    FOR field_name IN SELECT jsonb_object_keys(new_data) LOOP
      IF old_data->field_name IS DISTINCT FROM new_data->field_name THEN
        changed_fields := array_append(changed_fields, field_name);
      END IF;
    END LOOP;
    
  ELSIF TG_OP = 'INSERT' THEN
    new_data := to_jsonb(NEW);
  END IF;
  
  -- Insert audit log
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    old_values,
    new_values,
    changed_fields,
    user_id,
    user_email
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    old_data,
    new_data,
    changed_fields,
    current_user_id,
    current_user_email
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================
-- PROJECT MANAGEMENT AUTOMATION
-- =====================================================

-- Function to handle project slug generation
CREATE OR REPLACE FUNCTION public.handle_project_slug()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  -- Generate slug from project name if not provided
  IF NEW.slug IS NULL OR NEW.slug = '' THEN
    base_slug := public.generate_slug(NEW.name);
    final_slug := base_slug;
    
    -- Ensure slug is unique for the user
    WHILE EXISTS (
      SELECT 1 FROM public.projects 
      WHERE slug = final_slug AND owner_id = NEW.owner_id AND id != NEW.id
    ) LOOP
      counter := counter + 1;
      final_slug := base_slug || '-' || counter::text;
    END LOOP;
    
    NEW.slug := final_slug;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to initialize project vector embedding
CREATE OR REPLACE FUNCTION public.handle_project_embedding()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  search_text text;
BEGIN
  -- Create searchable text from project data
  search_text := COALESCE(NEW.name, '') || ' ' || 
                COALESCE(NEW.description, '') || ' ' ||
                COALESCE(array_to_string(NEW.tags, ' '), '');
  
  -- Set embedding_text for external embedding generation
  NEW.embedding_text := search_text;
  
  -- Initialize empty embedding if not provided
  IF NEW.embedding IS NULL THEN
    NEW.embedding := ARRAY[0]::vector(1536);
  END IF;
  
  RETURN NEW;
END;
$$;

-- Function to update project activity timestamp
CREATE OR REPLACE FUNCTION public.update_project_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update last_activity_at for the project
  UPDATE public.projects 
  SET last_activity_at = NOW()
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- =====================================================
-- TEAM MANAGEMENT AUTOMATION
-- =====================================================

-- Function to handle team member role changes
CREATE OR REPLACE FUNCTION public.handle_team_member_changes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- If user is being promoted to owner, demote previous owner
  IF NEW.role = 'owner' AND (OLD IS NULL OR OLD.role != 'owner') THEN
    UPDATE public.team_members 
    SET role = 'admin', updated_at = NOW()
    WHERE team_id = NEW.team_id AND role = 'owner' AND user_id != NEW.user_id;
  END IF;
  
  -- Update team's updated_at timestamp
  UPDATE public.teams 
  SET updated_at = NOW()
  WHERE id = NEW.team_id;
  
  RETURN NEW;
END;
$$;

-- =====================================================
-- FILE VERSIONING AUTOMATION
-- =====================================================

-- Function to handle file version creation
CREATE OR REPLACE FUNCTION public.handle_file_versioning()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  version_number integer;
BEGIN
  -- Auto-increment version number if not provided
  IF NEW.version IS NULL THEN
    SELECT COALESCE(MAX(version), 0) + 1 
    INTO version_number
    FROM public.project_files 
    WHERE project_id = NEW.project_id AND file_path = NEW.file_path;
    
    NEW.version := version_number;
  END IF;
  
  -- Set file size if content is provided
  IF NEW.content IS NOT NULL AND NEW.file_size IS NULL THEN
    NEW.file_size := octet_length(NEW.content);
  END IF;
  
  -- Generate file hash for integrity checking
  IF NEW.content IS NOT NULL THEN
    NEW.file_hash := encode(sha256(NEW.content::bytea), 'hex');
  END IF;
  
  RETURN NEW;
END;
$$;

-- =====================================================
-- BUILD AUTOMATION
-- =====================================================

-- Function to handle build lifecycle
CREATE OR REPLACE FUNCTION public.handle_build_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Set started_at when status changes to 'building'
  IF NEW.status = 'building' AND (OLD IS NULL OR OLD.status != 'building') THEN
    NEW.started_at := NOW();
  END IF;
  
  -- Set completed_at when build finishes
  IF NEW.status IN ('completed', 'failed', 'cancelled') AND 
     (OLD IS NULL OR OLD.status NOT IN ('completed', 'failed', 'cancelled')) THEN
    NEW.completed_at := NOW();
    
    -- Calculate build duration
    IF NEW.started_at IS NOT NULL THEN
      NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at));
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- =====================================================
-- NOTIFICATION SYSTEM
-- =====================================================

-- Notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'project_invite', 'build_complete', 'build_failed', 'comment_mention',
    'team_invite', 'system_announcement', 'security_alert'
  )),
  title text NOT NULL,
  message text NOT NULL,
  data jsonb DEFAULT '{}'::jsonb,
  is_read boolean DEFAULT false,
  read_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz DEFAULT NOW()
);

-- Function to create notifications
CREATE OR REPLACE FUNCTION public.create_notification(
  user_uuid uuid,
  notification_type text,
  notification_title text,
  notification_message text,
  notification_data jsonb DEFAULT '{}'::jsonb,
  expires_in_hours integer DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  notification_id uuid;
  expires_at_param timestamptz := NULL;
BEGIN
  -- Calculate expiration time if specified
  IF expires_in_hours IS NOT NULL THEN
    expires_at_param := NOW() + (expires_in_hours || ' hours')::interval;
  END IF;
  
  -- Insert notification
  INSERT INTO public.notifications (
    user_id, type, title, message, data, expires_at
  ) VALUES (
    user_uuid, notification_type, notification_title, 
    notification_message, notification_data, expires_at_param
  ) RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$;

-- Function to create build notifications
CREATE OR REPLACE FUNCTION public.handle_build_notifications()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  project_name text;
  project_owner_id uuid;
BEGIN
  -- Get project information
  SELECT name, owner_id INTO project_name, project_owner_id
  FROM public.projects 
  WHERE id = NEW.project_id;
  
  -- Notify on build completion
  IF NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN
    PERFORM public.create_notification(
      project_owner_id,
      'build_complete',
      'Build Completed Successfully',
      format('Your build for project "%s" has completed successfully.', project_name),
      jsonb_build_object(
        'project_id', NEW.project_id,
        'build_id', NEW.id,
        'build_number', NEW.build_number
      ),
      24 -- Expire in 24 hours
    );
  END IF;
  
  -- Notify on build failure
  IF NEW.status = 'failed' AND (OLD IS NULL OR OLD.status != 'failed') THEN
    PERFORM public.create_notification(
      project_owner_id,
      'build_failed',
      'Build Failed',
      format('Your build for project "%s" has failed. Check the logs for details.', project_name),
      jsonb_build_object(
        'project_id', NEW.project_id,
        'build_id', NEW.id,
        'build_number', NEW.build_number,
        'error_message', NEW.error_message
      ),
      72 -- Expire in 72 hours
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- =====================================================
-- VECTOR EMBEDDING UTILITIES
-- =====================================================

-- Function to calculate cosine similarity between vectors
CREATE OR REPLACE FUNCTION public.cosine_similarity(a vector, b vector)
RETURNS float
LANGUAGE sql
IMMUTABLE STRICT
AS $$
  SELECT (a <#> b) * -1;
$$;

-- Function to find similar projects
CREATE OR REPLACE FUNCTION public.find_similar_projects(
  query_embedding vector(1536),
  user_uuid uuid DEFAULT auth.uid(),
  similarity_threshold float DEFAULT 0.5,
  max_results integer DEFAULT 10
)
RETURNS TABLE (
  project_id uuid,
  name text,
  description text,
  similarity_score float,
  owner_username text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.name,
    p.description,
    public.cosine_similarity(p.embedding, query_embedding) as similarity_score,
    up.username as owner_username
  FROM public.projects p
  JOIN public.user_profiles up ON p.owner_id = up.id
  WHERE p.is_public = true
    AND p.embedding IS NOT NULL
    AND public.cosine_similarity(p.embedding, query_embedding) > similarity_threshold
  ORDER BY similarity_score DESC
  LIMIT max_results;
END;
$$;

-- =====================================================
-- MAINTENANCE AND CLEANUP FUNCTIONS
-- =====================================================

-- Function to clean up expired notifications
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete expired notifications
  DELETE FROM public.notifications
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Also delete old read notifications (older than 30 days)
  DELETE FROM public.notifications
  WHERE is_read = true AND read_at < NOW() - INTERVAL '30 days';
  
  RETURN deleted_count;
END;
$$;

-- Function to clean up old audit logs
CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(days_to_keep integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.audit_logs
  WHERE created_at < NOW() - (days_to_keep || ' days')::interval;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Function to update project search rankings
CREATE OR REPLACE FUNCTION public.update_project_rankings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update project popularity based on activity, collaborators, and builds
  UPDATE public.projects 
  SET 
    popularity_score = (
      -- Base score from collaborator count
      COALESCE((
        SELECT COUNT(*) * 10 
        FROM public.project_collaborators 
        WHERE project_id = projects.id
      ), 0) +
      -- Score from recent activity
      CASE 
        WHEN last_activity_at > NOW() - INTERVAL '7 days' THEN 20
        WHEN last_activity_at > NOW() - INTERVAL '30 days' THEN 10
        WHEN last_activity_at > NOW() - INTERVAL '90 days' THEN 5
        ELSE 0
      END +
      -- Score from successful builds
      COALESCE((
        SELECT COUNT(*) * 5 
        FROM public.builds 
        WHERE project_id = projects.id AND status = 'completed'
      ), 0)
    ),
    updated_at = NOW()
  WHERE is_public = true;
END;
$$;

-- =====================================================
-- CREATE ALL TRIGGERS
-- =====================================================

-- Timestamp triggers for all main tables
CREATE OR REPLACE TRIGGER update_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER update_project_files_updated_at
  BEFORE UPDATE ON public.project_files
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE TRIGGER update_builds_updated_at
  BEFORE UPDATE ON public.builds
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Project-specific triggers
CREATE OR REPLACE TRIGGER handle_project_slug_trigger
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_project_slug();

CREATE OR REPLACE TRIGGER handle_project_embedding_trigger
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_project_embedding();

-- Activity tracking triggers
CREATE OR REPLACE TRIGGER update_project_activity_from_files
  AFTER INSERT OR UPDATE OR DELETE ON public.project_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_activity();

CREATE OR REPLACE TRIGGER update_project_activity_from_builds
  AFTER INSERT OR UPDATE ON public.builds
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_activity();

CREATE OR REPLACE TRIGGER update_project_activity_from_ai
  AFTER INSERT OR UPDATE ON public.ai_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_project_activity();

-- Team management triggers
CREATE OR REPLACE TRIGGER handle_team_member_changes_trigger
  AFTER INSERT OR UPDATE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_team_member_changes();

-- File versioning triggers
CREATE OR REPLACE TRIGGER handle_file_versioning_trigger
  BEFORE INSERT OR UPDATE ON public.project_files
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_file_versioning();

-- Build lifecycle triggers
CREATE OR REPLACE TRIGGER handle_build_lifecycle_trigger
  BEFORE UPDATE ON public.builds
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_build_lifecycle();

CREATE OR REPLACE TRIGGER handle_build_notifications_trigger
  AFTER UPDATE ON public.builds
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_build_notifications();

-- Audit logging triggers (for critical tables)
CREATE OR REPLACE TRIGGER audit_user_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.create_audit_log();

CREATE OR REPLACE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.create_audit_log();

CREATE OR REPLACE TRIGGER audit_teams
  AFTER INSERT OR UPDATE OR DELETE ON public.teams
  FOR EACH ROW
  EXECUTE FUNCTION public.create_audit_log();

CREATE OR REPLACE TRIGGER audit_team_members
  AFTER INSERT OR UPDATE OR DELETE ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.create_audit_log();

CREATE OR REPLACE TRIGGER audit_project_collaborators
  AFTER INSERT OR UPDATE OR DELETE ON public.project_collaborators
  FOR EACH ROW
  EXECUTE FUNCTION public.create_audit_log();

-- =====================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================

-- Audit logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON public.audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time ON public.audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs(created_at);

-- Notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_expires_at ON public.notifications(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_type_created ON public.notifications(type, created_at);

-- =====================================================
-- RLS POLICIES FOR NEW TABLES
-- =====================================================

-- Enable RLS on new tables
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Service role can access all audit data
CREATE POLICY "Service role full access audit_logs" ON public.audit_logs
FOR ALL USING (auth.role() = 'service_role');

-- Admins can view audit logs
CREATE POLICY "Admins can view audit logs" ON public.audit_logs
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id = auth.uid() AND subscription_tier = 'enterprise'
  )
);

-- Users can view their own audit logs
CREATE POLICY "Users can view own audit logs" ON public.audit_logs
FOR SELECT USING (auth.uid() = user_id);

-- Users can manage their own notifications
CREATE POLICY "Users can manage own notifications" ON public.notifications
FOR ALL USING (auth.uid() = user_id);

-- Service role can manage all notifications
CREATE POLICY "Service role full access notifications" ON public.notifications
FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- GRANTS AND PERMISSIONS
-- =====================================================

-- Grant access to utility functions
GRANT EXECUTE ON FUNCTION public.generate_uuid() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.generate_slug(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_timestamp_iso() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cosine_similarity(vector, vector) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_similar_projects(vector, uuid, float, integer) TO authenticated;

-- Grant access to notification functions
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, jsonb, integer) TO authenticated;

-- Service role permissions for maintenance functions
GRANT EXECUTE ON FUNCTION public.cleanup_expired_notifications() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_project_rankings() TO service_role;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.audit_logs IS 'Audit trail for tracking important data changes';
COMMENT ON TABLE public.notifications IS 'User notifications and system messages';

COMMENT ON FUNCTION public.handle_new_user IS 'Automatically create user profile on signup';
COMMENT ON FUNCTION public.create_audit_log IS 'Create audit log entries for data changes';
COMMENT ON FUNCTION public.handle_project_slug IS 'Generate unique project slugs';
COMMENT ON FUNCTION public.handle_project_embedding IS 'Prepare project data for vector embedding';
COMMENT ON FUNCTION public.update_project_activity IS 'Update project last activity timestamp';
COMMENT ON FUNCTION public.handle_build_lifecycle IS 'Manage build status transitions and timing';
COMMENT ON FUNCTION public.create_notification IS 'Create user notifications';
COMMENT ON FUNCTION public.find_similar_projects IS 'Find projects with similar embeddings';
COMMENT ON FUNCTION public.cleanup_expired_notifications IS 'Remove expired and old notifications';
COMMENT ON FUNCTION public.cleanup_old_audit_logs IS 'Remove old audit log entries';
COMMENT ON FUNCTION public.update_project_rankings IS 'Update project popularity scores';