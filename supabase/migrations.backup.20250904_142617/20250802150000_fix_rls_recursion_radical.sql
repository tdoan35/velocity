-- Radical fix for RLS recursion - complete removal of circular references

-- Drop ALL policies that reference team_members
DROP POLICY IF EXISTS "Team members view all members" ON team_members;
DROP POLICY IF EXISTS "Team owners manage members" ON team_members;
DROP POLICY IF EXISTS "Users view own memberships" ON team_members;
DROP POLICY IF EXISTS "Service role full access team_members" ON team_members;
DROP POLICY IF EXISTS "Team members access team projects" ON projects;
DROP POLICY IF EXISTS "Team members can view teams" ON teams;

-- Create ultra-simple policies for team_members without ANY self-references

-- 1. Users can only see their own memberships - no team lookup
CREATE POLICY "Users view own memberships only" ON team_members
    FOR SELECT USING (auth.uid() = user_id);

-- 2. Users can insert their own memberships (for invites/joins)
CREATE POLICY "Users can join teams" ON team_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. Users can update their own memberships
CREATE POLICY "Users can update own membership" ON team_members
    FOR UPDATE USING (auth.uid() = user_id);

-- 4. Users can leave teams (delete their own membership)
CREATE POLICY "Users can leave teams" ON team_members
    FOR DELETE USING (auth.uid() = user_id);

-- 5. Service role bypass
CREATE POLICY "Service role bypass team_members" ON team_members
    FOR ALL USING (auth.role() = 'service_role');

-- For teams table - simple policy without team_members reference
CREATE POLICY "Users can view teams they own" ON teams
    FOR SELECT USING (owner_id = auth.uid());

-- For projects table - simplified without team checks for now
CREATE POLICY "Team projects visible to all authenticated" ON projects
    FOR SELECT USING (
        auth.role() = 'authenticated' 
        AND (
            owner_id = auth.uid() 
            OR is_public = true
            OR team_id IS NOT NULL  -- Temporarily allow viewing all team projects
        )
    );

-- Add a security definer function to handle team member lookups safely
CREATE OR REPLACE FUNCTION get_user_teams(user_uuid UUID)
RETURNS TABLE(team_id UUID, role TEXT)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT tm.team_id, tm.role
    FROM team_members tm
    WHERE tm.user_id = user_uuid;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_teams(UUID) TO authenticated;

-- Add a function to check if users share a team
CREATE OR REPLACE FUNCTION users_share_team(user1_id UUID, user2_id UUID)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1
        FROM team_members tm1
        JOIN team_members tm2 ON tm1.team_id = tm2.team_id
        WHERE tm1.user_id = user1_id
        AND tm2.user_id = user2_id
    );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION users_share_team(UUID, UUID) TO authenticated;