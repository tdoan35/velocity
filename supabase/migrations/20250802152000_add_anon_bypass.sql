-- Add temporary bypass for anonymous/authenticated users to debug the issue

-- First, let's ensure team_members has NO self-referencing policies at all
DROP POLICY IF EXISTS "Users view own memberships only" ON team_members;
DROP POLICY IF EXISTS "Users can join teams" ON team_members;
DROP POLICY IF EXISTS "Users can update own membership" ON team_members;
DROP POLICY IF EXISTS "Users can leave teams" ON team_members;
DROP POLICY IF EXISTS "Service role bypass team_members" ON team_members;

-- Create a single, ultra-simple policy for team_members
CREATE POLICY "Authenticated users basic access" ON team_members
    FOR ALL 
    TO authenticated
    USING (auth.uid() = user_id OR auth.role() = 'service_role')
    WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

-- Also add a specific policy for anon users if needed
CREATE POLICY "Anon bypass for team_members" ON team_members
    FOR SELECT
    TO anon
    USING (false); -- Anon users can't see any team members

-- Ensure RLS is enabled
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Add logging function to help debug
CREATE OR REPLACE FUNCTION log_auth_context()
RETURNS TABLE(
    current_user_id UUID,
    db_role TEXT,
    jwt_role TEXT
)
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        auth.uid() as current_user_id,
        current_setting('role', true) as db_role,
        auth.role() as jwt_role;
$$;

GRANT EXECUTE ON FUNCTION log_auth_context() TO authenticated, anon;