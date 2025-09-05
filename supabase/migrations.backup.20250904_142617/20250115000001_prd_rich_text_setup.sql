-- PRD Rich Text Content Setup Migration
-- Date: 2025-01-15
-- Purpose: Ensure PRD sections support rich text content structure

-- Since this is a pre-launch implementation, we're setting up the schema correctly from the start
-- No data migration needed as there's no production data yet

-- Add index for better performance on sections JSONB content searches
-- This helps with queries that filter or search within the sections array
CREATE INDEX IF NOT EXISTS idx_prds_sections_gin 
ON prds USING gin (sections);

-- Add index specifically for section content text searches
-- This allows efficient full-text search across PRD content
CREATE INDEX IF NOT EXISTS idx_prds_sections_content_text 
ON prds USING gin ((sections::text) gin_trgm_ops);

-- Create a function to validate section content structure
CREATE OR REPLACE FUNCTION validate_prd_section_content()
RETURNS trigger AS $$
BEGIN
  -- Check if sections exist and are properly structured
  IF NEW.sections IS NOT NULL THEN
    -- Validate each section has required fields
    FOR i IN 0..jsonb_array_length(NEW.sections) - 1 LOOP
      -- Check for required fields
      IF NOT (NEW.sections->i ? 'id' AND 
              NEW.sections->i ? 'title' AND
              NEW.sections->i ? 'content' AND
              NEW.sections->i ? 'status') THEN
        RAISE EXCEPTION 'Invalid section structure at index %', i;
      END IF;
      
      -- Validate content structure (should have html and text)
      IF NEW.sections->i->'content' IS NOT NULL AND 
         jsonb_typeof(NEW.sections->i->'content') = 'object' THEN
        IF NOT (NEW.sections->i->'content' ? 'html' AND 
                NEW.sections->i->'content' ? 'text') THEN
          -- Log warning but don't fail - allows gradual migration
          RAISE NOTICE 'Section % missing html/text content structure', i;
        END IF;
      END IF;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for content validation (disabled by default for flexibility)
-- Uncomment to enable strict validation
-- CREATE TRIGGER validate_prd_sections_trigger
-- BEFORE INSERT OR UPDATE ON prds
-- FOR EACH ROW
-- EXECUTE FUNCTION validate_prd_section_content();

-- Add helpful comments to document the schema
COMMENT ON COLUMN prds.sections IS 
'Array of PRD sections with rich text content. Expected structure:
{
  "id": "string",
  "title": "string",
  "order": number,
  "agent": "string",
  "required": boolean,
  "content": {
    "html": "string - HTML formatted content",
    "text": "string - Plain text version"
  },
  "status": "pending|in_progress|completed",
  "isCustom": boolean,
  "description": "string (optional)",
  "template": {
    "html": "string",
    "text": "string"
  } (optional)
}';

-- Create a view for easier querying of PRD sections with content
CREATE OR REPLACE VIEW prd_sections_expanded AS
SELECT 
  p.id as prd_id,
  p.project_id,
  p.user_id,
  p.title as prd_title,
  p.status as prd_status,
  s.value->>'id' as section_id,
  s.value->>'title' as section_title,
  (s.value->>'order')::int as section_order,
  s.value->>'agent' as agent,
  (s.value->>'required')::boolean as required,
  s.value->'content'->>'html' as content_html,
  s.value->'content'->>'text' as content_text,
  s.value->>'status' as section_status,
  (s.value->>'isCustom')::boolean as is_custom,
  s.value->>'description' as section_description,
  s.value->'template'->>'html' as template_html,
  s.value->'template'->>'text' as template_text,
  p.created_at,
  p.updated_at
FROM 
  prds p,
  LATERAL jsonb_array_elements(p.sections) s(value)
WHERE 
  p.sections IS NOT NULL;

-- Grant appropriate permissions
GRANT SELECT ON prd_sections_expanded TO authenticated;
GRANT SELECT ON prd_sections_expanded TO service_role;

-- Create function to search PRD content
CREATE OR REPLACE FUNCTION search_prd_content(
  search_query text,
  user_id_filter uuid DEFAULT NULL
)
RETURNS TABLE (
  prd_id uuid,
  project_id uuid,
  prd_title text,
  section_id text,
  section_title text,
  content_preview text,
  relevance real
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.prd_id,
    p.project_id,
    p.prd_title,
    p.section_id,
    p.section_title,
    CASE 
      WHEN length(p.content_text) > 200 
      THEN substring(p.content_text from 1 for 200) || '...'
      ELSE p.content_text
    END as content_preview,
    ts_rank(
      to_tsvector('english', coalesce(p.content_text, '') || ' ' || coalesce(p.section_title, '')),
      plainto_tsquery('english', search_query)
    ) as relevance
  FROM prd_sections_expanded p
  WHERE 
    (user_id_filter IS NULL OR p.user_id = user_id_filter) AND
    (
      p.content_text ILIKE '%' || search_query || '%' OR
      p.section_title ILIKE '%' || search_query || '%'
    )
  ORDER BY relevance DESC
  LIMIT 20;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on search function
GRANT EXECUTE ON FUNCTION search_prd_content TO authenticated;

-- Create function to get PRD completion stats
CREATE OR REPLACE FUNCTION get_prd_completion_stats(
  prd_id_param uuid
)
RETURNS TABLE (
  total_sections bigint,
  required_sections bigint,
  completed_sections bigint,
  completed_required bigint,
  completion_percentage integer
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*) as total_sections,
    COUNT(*) FILTER (WHERE (s.value->>'required')::boolean = true) as required_sections,
    COUNT(*) FILTER (WHERE s.value->>'status' = 'completed') as completed_sections,
    COUNT(*) FILTER (WHERE (s.value->>'required')::boolean = true AND s.value->>'status' = 'completed') as completed_required,
    CASE 
      WHEN COUNT(*) FILTER (WHERE (s.value->>'required')::boolean = true) > 0
      THEN (COUNT(*) FILTER (WHERE (s.value->>'required')::boolean = true AND s.value->>'status' = 'completed')::numeric / 
            COUNT(*) FILTER (WHERE (s.value->>'required')::boolean = true)::numeric * 100)::integer
      ELSE 0
    END as completion_percentage
  FROM 
    prds p,
    LATERAL jsonb_array_elements(p.sections) s(value)
  WHERE 
    p.id = prd_id_param AND
    p.sections IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission on stats function
GRANT EXECUTE ON FUNCTION get_prd_completion_stats TO authenticated;

-- Add RLS policies for the new view
ALTER TABLE prds ENABLE ROW LEVEL SECURITY;

-- Policy for users to see their own PRDs
CREATE POLICY "Users can view own PRDs" ON prds
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy for users to update their own PRDs
CREATE POLICY "Users can update own PRDs" ON prds
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy for users to insert their own PRDs
CREATE POLICY "Users can insert own PRDs" ON prds
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Create an index on project_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_prds_project_id ON prds(project_id);

-- Create an index on user_id for faster user-specific queries
CREATE INDEX IF NOT EXISTS idx_prds_user_id ON prds(user_id);

-- Create a composite index for user and status queries
CREATE INDEX IF NOT EXISTS idx_prds_user_status ON prds(user_id, status);

-- Add performance hint for large JSONB operations
ALTER TABLE prds SET (toast_tuple_target = 8160);

-- Log successful migration
DO $$
BEGIN
  RAISE NOTICE 'PRD Rich Text Schema Setup completed successfully';
  RAISE NOTICE 'Indexes created for optimal performance';
  RAISE NOTICE 'Helper functions and views created for easier querying';
  RAISE NOTICE 'RLS policies configured for security';
END $$;