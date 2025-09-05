-- Create the register_preview_container function for realtime container management
CREATE OR REPLACE FUNCTION public.register_preview_container(
  container_id_param uuid,
  container_url_param text,
  project_uuid text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Log the registration attempt
  RAISE INFO 'Registering container: ID=%, URL=%, Project=%', 
    container_id_param, container_url_param, project_uuid;

  -- Update or insert container status
  INSERT INTO public.preview_sessions (
    id,
    project_id,
    container_id,
    container_url,
    status,
    created_at,
    updated_at,
    last_activity,
    session_metadata
  )
  VALUES (
    container_id_param,
    COALESCE(project_uuid::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
    container_id_param::text,
    container_url_param,
    'active',
    NOW(),
    NOW(),
    NOW(),
    jsonb_build_object(
      'container_registered', true,
      'registration_time', NOW(),
      'container_url', container_url_param
    )
  )
  ON CONFLICT (id) DO UPDATE SET
    container_url = EXCLUDED.container_url,
    status = 'active',
    updated_at = NOW(),
    last_activity = NOW(),
    session_metadata = COALESCE(
      preview_sessions.session_metadata, 
      '{}'::jsonb
    ) || jsonb_build_object(
      'container_registered', true,
      'registration_time', NOW(),
      'container_url', EXCLUDED.container_url
    );

  -- Return success with container info
  result := jsonb_build_object(
    'success', true,
    'container_id', container_id_param,
    'container_url', container_url_param,
    'project_id', project_uuid,
    'registered_at', NOW()
  );

  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return failure
    RAISE WARNING 'Failed to register container: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'container_id', container_id_param
    );
END;
$$ LANGUAGE plpgsql;

-- Create the unregister_preview_container function
CREATE OR REPLACE FUNCTION public.unregister_preview_container(
  container_id_param uuid,
  project_uuid text DEFAULT NULL
)
RETURNS jsonb
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Log the unregistration attempt
  RAISE INFO 'Unregistering container: ID=%, Project=%', 
    container_id_param, project_uuid;

  -- Update container status to stopped
  UPDATE public.preview_sessions
  SET 
    status = 'stopped',
    updated_at = NOW(),
    session_metadata = COALESCE(session_metadata, '{}'::jsonb) || 
      jsonb_build_object(
        'container_unregistered', true,
        'unregistration_time', NOW()
      )
  WHERE id = container_id_param
    AND (project_uuid IS NULL OR project_id = project_uuid::uuid);

  -- Check if update was successful
  IF FOUND THEN
    result := jsonb_build_object(
      'success', true,
      'container_id', container_id_param,
      'unregistered_at', NOW()
    );
  ELSE
    result := jsonb_build_object(
      'success', false,
      'error', 'Container not found',
      'container_id', container_id_param
    );
  END IF;

  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return failure
    RAISE WARNING 'Failed to unregister container: %', SQLERRM;
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'container_id', container_id_param
    );
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.register_preview_container(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unregister_preview_container(uuid, text) TO service_role;

-- Add comments
COMMENT ON FUNCTION public.register_preview_container IS 'Register a preview container for real-time communication';
COMMENT ON FUNCTION public.unregister_preview_container IS 'Unregister a preview container from real-time communication';