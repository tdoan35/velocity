-- Fix infinite recursion in projects table by consolidating policies

-- Drop ALL existing policies on projects table
DROP POLICY IF EXISTS "Collaborators access projects simple" ON projects;
DROP POLICY IF EXISTS "Project editors can update simple" ON projects;
DROP POLICY IF EXISTS "Project owners full access" ON projects;
DROP POLICY IF EXISTS "Public projects viewable" ON projects;
DROP POLICY IF EXISTS "Service role full access projects" ON projects;
DROP POLICY IF EXISTS "Users create own projects" ON projects;
DROP POLICY IF EXISTS "Users delete own projects" ON projects;
DROP POLICY IF EXISTS "Users update own projects" ON projects;
DROP POLICY IF EXISTS "Users view own projects" ON projects;

-- Create consolidated, non-overlapping policies

-- 1. Service role bypass (always first to avoid conflicts)
CREATE POLICY "Service role bypass projects" ON projects
    FOR ALL 
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 2. Owners have full access to their projects
CREATE POLICY "Owners full access" ON projects
    FOR ALL 
    TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- 3. Public projects are viewable by authenticated users
CREATE POLICY "Public projects viewable" ON projects
    FOR SELECT 
    TO authenticated
    USING (is_public = true AND owner_id != auth.uid()); -- Exclude owned projects to avoid overlap

-- 4. Collaborators can access projects (but not owned ones)
CREATE POLICY "Collaborators access" ON projects
    FOR SELECT 
    TO authenticated
    USING (
        owner_id != auth.uid() -- Exclude owned projects
        AND NOT is_public -- Exclude public projects
        AND EXISTS (
            SELECT 1 FROM project_collaborators pc
            WHERE pc.project_id = projects.id
            AND pc.user_id = auth.uid()
        )
    );

-- 5. Collaborators with edit rights can update (but not owned ones)
CREATE POLICY "Collaborators edit" ON projects
    FOR UPDATE 
    TO authenticated
    USING (
        owner_id != auth.uid() -- Exclude owned projects
        AND EXISTS (
            SELECT 1 FROM project_collaborators pc
            WHERE pc.project_id = projects.id
            AND pc.user_id = auth.uid()
            AND pc.role IN ('editor')
        )
    );

-- Ensure RLS is enabled
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;