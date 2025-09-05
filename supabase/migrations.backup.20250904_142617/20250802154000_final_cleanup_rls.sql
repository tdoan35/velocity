-- Final cleanup to ensure no RLS recursion issues remain

-- Ensure RLS is enabled on all relevant tables
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Add IF NOT EXISTS checks for conversation_messages
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_messages') THEN
        EXECUTE 'ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY';
    END IF;
END $$;

-- Create a helper function to check project access without recursion
CREATE OR REPLACE FUNCTION has_project_access(project_uuid UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- Check if user owns the project
    IF EXISTS (
        SELECT 1 FROM projects 
        WHERE id = project_uuid 
        AND owner_id = auth.uid()
    ) THEN
        RETURN TRUE;
    END IF;
    
    -- Check if user is a collaborator
    IF EXISTS (
        SELECT 1 FROM project_collaborators
        WHERE project_id = project_uuid
        AND user_id = auth.uid()
    ) THEN
        RETURN TRUE;
    END IF;
    
    -- Check if project is public
    IF EXISTS (
        SELECT 1 FROM projects
        WHERE id = project_uuid
        AND is_public = true
    ) THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION has_project_access(UUID) TO authenticated;

-- Log successful migration
DO $$
BEGIN
    RAISE NOTICE 'RLS recursion fixes have been applied successfully';
END $$;