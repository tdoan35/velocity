-- Supabase Storage Buckets Configuration
-- This script contains the SQL policies and configuration for storage buckets
-- The actual bucket creation must be done through the Supabase Dashboard

-- =====================================================
-- STORAGE BUCKET RLS POLICIES
-- =====================================================

-- Note: Buckets must be created through Supabase Dashboard first:
-- 1. project_assets - for general project files (React Native code, images, etc.)
-- 2. build_artifacts - for deployment files and APK/IPA files
-- 3. user_uploads - for user-generated content (avatars, profile images)
-- 4. system_files - for application resources and templates

-- =====================================================
-- PROJECT_ASSETS BUCKET POLICIES
-- =====================================================

-- Project owners can manage all assets in their projects
CREATE POLICY "Project owners can manage project assets" ON storage.objects
FOR ALL USING (
  bucket_id = 'project_assets' AND
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id::text = (storage.foldername(name))[1] 
    AND owner_id = auth.uid()
  )
);

-- Project collaborators can read project assets
CREATE POLICY "Project collaborators can read project assets" ON storage.objects
FOR SELECT USING (
  bucket_id = 'project_assets' AND
  EXISTS (
    SELECT 1 FROM public.project_collaborators pc
    JOIN public.projects p ON pc.project_id = p.id
    WHERE p.id::text = (storage.foldername(name))[1] 
    AND pc.user_id = auth.uid()
  )
);

-- Project editors can upload/update project assets
CREATE POLICY "Project editors can upload project assets" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'project_assets' AND
  EXISTS (
    SELECT 1 FROM public.project_collaborators pc
    JOIN public.projects p ON pc.project_id = p.id
    WHERE p.id::text = (storage.foldername(name))[1] 
    AND pc.user_id = auth.uid()
    AND pc.role IN ('owner', 'editor')
  )
);

CREATE POLICY "Project editors can update project assets" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'project_assets' AND
  EXISTS (
    SELECT 1 FROM public.project_collaborators pc
    JOIN public.projects p ON pc.project_id = p.id
    WHERE p.id::text = (storage.foldername(name))[1] 
    AND pc.user_id = auth.uid()
    AND pc.role IN ('owner', 'editor')
  )
);

-- Public project assets are viewable by authenticated users
CREATE POLICY "Public project assets viewable" ON storage.objects
FOR SELECT USING (
  bucket_id = 'project_assets' AND
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id::text = (storage.foldername(name))[1] 
    AND is_public = true
  )
);

-- =====================================================
-- BUILD_ARTIFACTS BUCKET POLICIES
-- =====================================================

-- Project owners can manage build artifacts
CREATE POLICY "Project owners can manage build artifacts" ON storage.objects
FOR ALL USING (
  bucket_id = 'build_artifacts' AND
  EXISTS (
    SELECT 1 FROM public.builds b
    JOIN public.projects p ON b.project_id = p.id
    WHERE b.id::text = (storage.foldername(name))[1]
    AND p.owner_id = auth.uid()
  )
);

-- Project collaborators can read build artifacts
CREATE POLICY "Project collaborators can read build artifacts" ON storage.objects
FOR SELECT USING (
  bucket_id = 'build_artifacts' AND
  EXISTS (
    SELECT 1 FROM public.builds b
    JOIN public.project_collaborators pc ON b.project_id = pc.project_id
    WHERE b.id::text = (storage.foldername(name))[1]
    AND pc.user_id = auth.uid()
  )
);

-- Build system can upload artifacts (service role)
CREATE POLICY "Build system can upload artifacts" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'build_artifacts' AND
  auth.role() = 'service_role'
);

-- =====================================================
-- USER_UPLOADS BUCKET POLICIES
-- =====================================================

-- Users can manage their own uploads
CREATE POLICY "Users can manage own uploads" ON storage.objects
FOR ALL USING (
  bucket_id = 'user_uploads' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read other users' public uploads
CREATE POLICY "Users can read public uploads" ON storage.objects
FOR SELECT USING (
  bucket_id = 'user_uploads' AND
  -- Check if the user profile allows public access to uploads
  EXISTS (
    SELECT 1 FROM public.user_profiles 
    WHERE id::text = (storage.foldername(name))[1]
    AND (metadata->>'allow_public_uploads')::boolean = true
  )
);

-- =====================================================
-- SYSTEM_FILES BUCKET POLICIES
-- =====================================================

-- All authenticated users can read system files
CREATE POLICY "Authenticated users can read system files" ON storage.objects
FOR SELECT USING (
  bucket_id = 'system_files' AND
  auth.role() = 'authenticated'
);

-- Only service role can manage system files
CREATE POLICY "Service role can manage system files" ON storage.objects
FOR ALL USING (
  bucket_id = 'system_files' AND
  auth.role() = 'service_role'
);

-- =====================================================
-- HELPER FUNCTIONS FOR STORAGE
-- =====================================================

-- Function to get file extension
CREATE OR REPLACE FUNCTION public.get_file_extension(filename text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(substring(filename from '\.([^.]*)$'));
$$;

-- Function to validate file types for different buckets
CREATE OR REPLACE FUNCTION public.is_valid_file_type(bucket_name text, filename text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  file_ext text;
  allowed_extensions text[];
BEGIN
  file_ext := public.get_file_extension(filename);
  
  CASE bucket_name
    WHEN 'project_assets' THEN
      allowed_extensions := ARRAY['js', 'jsx', 'ts', 'tsx', 'json', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'css', 'scss', 'less', 'md', 'txt', 'yml', 'yaml', 'xml'];
    WHEN 'build_artifacts' THEN
      allowed_extensions := ARRAY['apk', 'ipa', 'aab', 'zip', 'tar', 'gz', 'tgz', 'json', 'log', 'txt'];
    WHEN 'user_uploads' THEN
      allowed_extensions := ARRAY['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'pdf', 'doc', 'docx', 'txt'];
    WHEN 'system_files' THEN
      allowed_extensions := ARRAY['png', 'jpg', 'jpeg', 'gif', 'svg', 'json', 'js', 'css', 'html', 'xml', 'txt', 'md'];
    ELSE
      RETURN false;
  END CASE;
  
  RETURN file_ext = ANY(allowed_extensions);
END;
$$;

-- Function to get max file size for bucket (in bytes)
CREATE OR REPLACE FUNCTION public.get_max_file_size(bucket_name text)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE bucket_name
    WHEN 'project_assets' THEN 52428800    -- 50MB
    WHEN 'build_artifacts' THEN 524288000  -- 500MB
    WHEN 'user_uploads' THEN 10485760      -- 10MB
    WHEN 'system_files' THEN 5242880       -- 5MB
    ELSE 1048576                           -- 1MB default
  END;
$$;

-- =====================================================
-- STORAGE TRIGGERS AND VALIDATION
-- =====================================================

-- Function to validate uploads
CREATE OR REPLACE FUNCTION public.validate_storage_upload()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Check file type
  IF NOT public.is_valid_file_type(NEW.bucket_id, NEW.name) THEN
    RAISE EXCEPTION 'File type not allowed for bucket %', NEW.bucket_id;
  END IF;
  
  -- Check file size
  IF NEW.metadata->>'size' IS NOT NULL THEN
    IF (NEW.metadata->>'size')::bigint > public.get_max_file_size(NEW.bucket_id) THEN
      RAISE EXCEPTION 'File size exceeds limit for bucket %', NEW.bucket_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for upload validation
CREATE TRIGGER validate_storage_upload_trigger
  BEFORE INSERT ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_storage_upload();

-- =====================================================
-- STORAGE ANALYTICS AND MONITORING
-- =====================================================

-- View for storage usage by bucket
CREATE OR REPLACE VIEW public.storage_usage_by_bucket AS
SELECT 
  bucket_id,
  COUNT(*) as file_count,
  SUM((metadata->>'size')::bigint) as total_size_bytes,
  AVG((metadata->>'size')::bigint) as avg_file_size_bytes,
  MAX((metadata->>'size')::bigint) as max_file_size_bytes,
  MIN(created_at) as first_upload,
  MAX(created_at) as last_upload
FROM storage.objects
GROUP BY bucket_id;

-- View for user storage usage
CREATE OR REPLACE VIEW public.user_storage_usage AS
SELECT 
  (storage.foldername(name))[1]::uuid as user_id,
  bucket_id,
  COUNT(*) as file_count,
  SUM((metadata->>'size')::bigint) as total_size_bytes
FROM storage.objects
WHERE bucket_id = 'user_uploads'
GROUP BY (storage.foldername(name))[1], bucket_id;

-- View for project storage usage
CREATE OR REPLACE VIEW public.project_storage_usage AS
SELECT 
  (storage.foldername(name))[1]::uuid as project_id,
  bucket_id,
  COUNT(*) as file_count,
  SUM((metadata->>'size')::bigint) as total_size_bytes
FROM storage.objects
WHERE bucket_id IN ('project_assets', 'build_artifacts')
GROUP BY (storage.foldername(name))[1], bucket_id;

-- =====================================================
-- CLEANUP AND MAINTENANCE FUNCTIONS
-- =====================================================

-- Function to clean up old build artifacts
CREATE OR REPLACE FUNCTION public.cleanup_old_build_artifacts(days_old integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete build artifacts older than specified days
  DELETE FROM storage.objects
  WHERE bucket_id = 'build_artifacts'
  AND created_at < NOW() - (days_old || ' days')::interval;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- Function to clean up orphaned user uploads
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_uploads()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  -- Delete uploads for users that no longer exist
  DELETE FROM storage.objects
  WHERE bucket_id = 'user_uploads'
  AND NOT EXISTS (
    SELECT 1 FROM auth.users 
    WHERE id::text = (storage.foldername(storage.objects.name))[1]
  );
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  RETURN deleted_count;
END;
$$;

-- =====================================================
-- GRANTS AND PERMISSIONS
-- =====================================================

-- Grant access to storage views
GRANT SELECT ON public.storage_usage_by_bucket TO authenticated;
GRANT SELECT ON public.user_storage_usage TO authenticated;
GRANT SELECT ON public.project_storage_usage TO authenticated;

-- Grant execute permissions on helper functions
GRANT EXECUTE ON FUNCTION public.get_file_extension(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_valid_file_type(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_max_file_size(text) TO authenticated;

-- Grant cleanup functions to service role only
GRANT EXECUTE ON FUNCTION public.cleanup_old_build_artifacts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_uploads() TO service_role;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON FUNCTION public.get_file_extension IS 'Extract file extension from filename';
COMMENT ON FUNCTION public.is_valid_file_type IS 'Validate if file type is allowed for specific bucket';
COMMENT ON FUNCTION public.get_max_file_size IS 'Get maximum allowed file size for bucket in bytes';
COMMENT ON FUNCTION public.cleanup_old_build_artifacts IS 'Clean up build artifacts older than specified days';
COMMENT ON FUNCTION public.cleanup_orphaned_uploads IS 'Clean up uploads for deleted users';

COMMENT ON VIEW public.storage_usage_by_bucket IS 'Storage usage statistics by bucket';
COMMENT ON VIEW public.user_storage_usage IS 'Storage usage by user for user uploads';
COMMENT ON VIEW public.project_storage_usage IS 'Storage usage by project for assets and builds';