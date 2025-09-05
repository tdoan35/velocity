-- Fix infinite recursion in project_collaborators and related tables

-- First, drop the problematic policy on project_collaborators
DROP POLICY IF EXISTS "Users view project collaborators" ON project_collaborators;
DROP POLICY IF EXISTS "Project owners manage collaborators" ON project_collaborators;
DROP POLICY IF EXISTS "Users view own collaborations" ON project_collaborators;
DROP POLICY IF EXISTS "Service role full access project_collaborators" ON project_collaborators;

-- Create simple, non-recursive policies for project_collaborators
-- 1. Users can see their own collaborations
CREATE POLICY "Users view own collaborations" ON project_collaborators
    FOR SELECT USING (auth.uid() = user_id);

-- 2. Project owners can manage all collaborators (via projects table)
CREATE POLICY "Project owners manage collaborators" ON project_collaborators
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = project_collaborators.project_id
            AND p.owner_id = auth.uid()
        )
    );

-- 3. Service role bypass
CREATE POLICY "Service role bypass collaborators" ON project_collaborators
    FOR ALL USING (auth.role() = 'service_role');

-- Also simplify the "Collaborators access projects" policy on projects table
DROP POLICY IF EXISTS "Collaborators access projects" ON projects;

-- Create a simpler version that doesn't cause recursion
CREATE POLICY "Collaborators access projects simple" ON projects
    FOR SELECT USING (
        owner_id = auth.uid() 
        OR is_public = true
        OR EXISTS (
            SELECT 1 FROM project_collaborators pc
            WHERE pc.project_id = projects.id
            AND pc.user_id = auth.uid()
        )
    );

-- Simplify "Project editors can update" policy
DROP POLICY IF EXISTS "Project editors can update" ON projects;

CREATE POLICY "Project editors can update simple" ON projects
    FOR UPDATE USING (
        owner_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM project_collaborators pc
            WHERE pc.project_id = projects.id
            AND pc.user_id = auth.uid()
            AND pc.role IN ('owner', 'editor')
        )
    );

-- Create a function to safely check if users can view collaborators
CREATE OR REPLACE FUNCTION can_view_project_collaborators(project_uuid UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    -- User can view if they're the project owner
    IF EXISTS (
        SELECT 1 FROM projects 
        WHERE id = project_uuid 
        AND owner_id = auth.uid()
    ) THEN
        RETURN TRUE;
    END IF;
    
    -- User can view if they're a collaborator
    IF EXISTS (
        SELECT 1 FROM project_collaborators
        WHERE project_id = project_uuid
        AND user_id = auth.uid()
    ) THEN
        RETURN TRUE;
    END IF;
    
    RETURN FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION can_view_project_collaborators(UUID) TO authenticated;