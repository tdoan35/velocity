-- Fix the handle_project_embedding function to properly initialize embeddings
CREATE OR REPLACE FUNCTION public.handle_project_embedding()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  search_text text;
  empty_embedding vector(1536);
BEGIN
  -- Create searchable text from project data
  search_text := COALESCE(NEW.name, '') || ' ' || 
                COALESCE(NEW.description, '') || ' ' ||
                COALESCE(array_to_string(COALESCE(NEW.tags, ARRAY[]::text[]), ' '), '');
  
  -- Set embedding_text for external embedding generation
  NEW.embedding_text := search_text;
  
  -- Initialize empty embedding if not provided
  IF NEW.embedding IS NULL THEN
    -- Create a properly sized zero vector with 1536 dimensions
    SELECT array_agg(0::float)::vector(1536) 
    INTO empty_embedding
    FROM generate_series(1, 1536);
    
    NEW.embedding := empty_embedding;
  END IF;
  
  RETURN NEW;
END;
$function$;