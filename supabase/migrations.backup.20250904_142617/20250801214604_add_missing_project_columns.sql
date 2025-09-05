-- Add missing columns that triggers expect
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT ARRAY[]::text[],
ADD COLUMN IF NOT EXISTS embedding_text text,
ADD COLUMN IF NOT EXISTS slug text;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_projects_tags ON public.projects USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON public.projects(slug);

-- Add unique constraint for slug per user (check if exists first)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'unique_project_slug_per_user'
    ) THEN
        ALTER TABLE public.projects 
        ADD CONSTRAINT unique_project_slug_per_user UNIQUE (owner_id, slug);
    END IF;
END $$;

-- Update the handle_project_embedding function to be more robust
CREATE OR REPLACE FUNCTION public.handle_project_embedding()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  search_text text;
BEGIN
  -- Create searchable text from project data
  search_text := COALESCE(NEW.name, '') || ' ' || 
                COALESCE(NEW.description, '') || ' ' ||
                COALESCE(array_to_string(COALESCE(NEW.tags, ARRAY[]::text[]), ' '), '');
  
  -- Set embedding_text for external embedding generation
  NEW.embedding_text := search_text;
  
  -- Initialize empty embedding if not provided
  IF NEW.embedding IS NULL THEN
    NEW.embedding := ARRAY[0]::vector(1536);
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Update the handle_project_slug function to be more robust
CREATE OR REPLACE FUNCTION public.handle_project_slug()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
$function$;