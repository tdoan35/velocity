-- Final fix - ensure NO overlapping policies whatsoever

-- Drop ALL existing policies on projects
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'projects' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON projects', pol.policyname);
    END LOOP;
END $$;

-- Create completely separate, non-overlapping policies
-- Each policy is for exactly ONE operation and ONE role

-- Authenticated users - separate policies for each operation
CREATE POLICY "auth_insert" ON projects
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "auth_select" ON projects
    FOR SELECT TO authenticated
    USING (auth.uid() = owner_id);

CREATE POLICY "auth_update" ON projects
    FOR UPDATE TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "auth_delete" ON projects
    FOR DELETE TO authenticated
    USING (auth.uid() = owner_id);

-- Service role - separate policies for each operation  
CREATE POLICY "service_insert" ON projects
    FOR INSERT TO service_role
    WITH CHECK (true);

CREATE POLICY "service_select" ON projects
    FOR SELECT TO service_role
    USING (true);

CREATE POLICY "service_update" ON projects
    FOR UPDATE TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_delete" ON projects
    FOR DELETE TO service_role
    USING (true);

-- Also fix team_members overlapping policies
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'team_members' 
        AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON team_members', pol.policyname);
    END LOOP;
END $$;

-- Simple team_members policies
CREATE POLICY "tm_auth_all" ON team_members
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tm_service_all" ON team_members
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Ensure RLS is enabled
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;