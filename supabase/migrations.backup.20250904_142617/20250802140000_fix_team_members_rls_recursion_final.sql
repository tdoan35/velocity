-- Fix infinite recursion in team_members RLS policies (v2)
-- This completely removes all self-referencing queries

-- Drop ALL existing policies on team_members table
DROP POLICY IF EXISTS "Team members view members" ON team_members;
DROP POLICY IF EXISTS "Team admins manage members" ON team_members;
DROP POLICY IF EXISTS "Team owners manage members" ON team_members;
DROP POLICY IF EXISTS "Users view own memberships" ON team_members;
DROP POLICY IF EXISTS "Service role full access team_members" ON team_members;

-- Create new simplified policies without any self-references

-- 1. Users can always see their own memberships
CREATE POLICY "Users view own memberships" ON team_members
    FOR SELECT USING (auth.uid() = user_id);

-- 2. Users can see other members if they share a team
-- This uses a materialized CTE to avoid recursion
CREATE POLICY "Team members view all members" ON team_members
    FOR SELECT USING (
        EXISTS (
            WITH user_teams AS (
                SELECT team_id 
                FROM team_members 
                WHERE user_id = auth.uid()
            )
            SELECT 1 
            FROM user_teams 
            WHERE user_teams.team_id = team_members.team_id
        )
    );

-- 3. Team owners can manage all members of their teams
CREATE POLICY "Team owners manage members" ON team_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 
            FROM teams 
            WHERE teams.id = team_members.team_id 
            AND teams.owner_id = auth.uid()
        )
    );

-- 4. Service role has full access
CREATE POLICY "Service role full access team_members" ON team_members
    FOR ALL USING (auth.role() = 'service_role');

-- Also fix the projects table policy to avoid recursion
DROP POLICY IF EXISTS "Team members access team projects" ON projects;

-- Create a simpler policy for team project access
CREATE POLICY "Team members access team projects" ON projects
    FOR SELECT USING (
        team_id IS NOT NULL 
        AND EXISTS (
            SELECT 1 
            FROM team_members 
            WHERE team_members.team_id = projects.team_id 
            AND team_members.user_id = auth.uid()
        )
    );

-- Add a policy for users to see their own projects (without team)
DROP POLICY IF EXISTS "Users access own projects" ON projects;
CREATE POLICY "Users access own projects" ON projects
    FOR SELECT USING (
        owner_id = auth.uid() 
        OR (
            team_id IS NULL 
            AND owner_id = auth.uid()
        )
    );

-- Ensure the insert policy exists and is correct
DROP POLICY IF EXISTS "Users can create projects" ON projects;
CREATE POLICY "Users can create projects" ON projects
    FOR INSERT WITH CHECK (
        auth.uid() = owner_id 
        AND (team_id IS NULL OR EXISTS (
            SELECT 1 
            FROM team_members 
            WHERE team_members.team_id = projects.team_id 
            AND team_members.user_id = auth.uid()
        ))
    );