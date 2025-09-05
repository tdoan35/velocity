-- Radical fix for projects table recursion - remove ALL policies and start fresh

-- First, drop ALL policies on projects table
DROP POLICY IF EXISTS "Owners full access" ON projects;
DROP POLICY IF EXISTS "Service role bypass projects" ON projects;
DROP POLICY IF EXISTS "Collaborators access" ON projects;
DROP POLICY IF EXISTS "Public projects viewable" ON projects;
DROP POLICY IF EXISTS "Collaborators edit" ON projects;

-- Create the absolute simplest policies possible

-- 1. Users can insert their own projects only
CREATE POLICY "Insert own projects only" ON projects
    FOR INSERT 
    TO authenticated
    WITH CHECK (auth.uid() = owner_id);

-- 2. Users can select their own projects only  
CREATE POLICY "Select own projects only" ON projects
    FOR SELECT
    TO authenticated
    USING (auth.uid() = owner_id);

-- 3. Users can update their own projects only
CREATE POLICY "Update own projects only" ON projects
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- 4. Users can delete their own projects only
CREATE POLICY "Delete own projects only" ON projects
    FOR DELETE
    TO authenticated
    USING (auth.uid() = owner_id);

-- 5. Service role bypass
CREATE POLICY "Service bypass" ON projects
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Also temporarily simplify project_collaborators to avoid any cascade issues
DROP POLICY IF EXISTS "Project owners manage collaborators" ON project_collaborators;
DROP POLICY IF EXISTS "Users view own collaborations" ON project_collaborators;
DROP POLICY IF EXISTS "Service role bypass collaborators" ON project_collaborators;

-- Just allow users to see their own collaborations
CREATE POLICY "Own collaborations only" ON project_collaborators
    FOR ALL
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service bypass collaborators" ON project_collaborators
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Ensure RLS is enabled
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;