-- Force refresh all policies by disabling and re-enabling RLS

-- Temporarily disable RLS on all affected tables
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE project_collaborators DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE conversations DISABLE ROW LEVEL SECURITY;

-- Force clear any cached plans
SELECT pg_stat_clear_snapshot();

-- Re-enable RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Also create a temporary function to test the insert
CREATE OR REPLACE FUNCTION test_project_insert(
    p_name TEXT,
    p_description TEXT,
    p_owner_id UUID
)
RETURNS UUID
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_project_id UUID;
BEGIN
    INSERT INTO projects (
        name,
        description,
        owner_id,
        team_id,
        status,
        is_public,
        is_template
    ) VALUES (
        p_name,
        p_description,
        p_owner_id,
        NULL,
        'active',
        false,
        false
    ) RETURNING id INTO v_project_id;
    
    RETURN v_project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION test_project_insert(TEXT, TEXT, UUID) TO authenticated;

-- Add a diagnostic function
CREATE OR REPLACE FUNCTION check_policy_conflicts()
RETURNS TABLE(
    table_name TEXT,
    policy_count BIGINT,
    has_overlapping_policies BOOLEAN
)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.tablename::TEXT,
        COUNT(*)::BIGINT,
        (COUNT(*) FILTER (WHERE p.cmd = 'ALL') > 0 
         AND COUNT(*) FILTER (WHERE p.cmd != 'ALL') > 0)::BOOLEAN
    FROM pg_policies p
    WHERE p.schemaname = 'public'
    AND p.tablename IN ('projects', 'project_collaborators', 'team_members', 'conversations')
    GROUP BY p.tablename;
END;
$$;

GRANT EXECUTE ON FUNCTION check_policy_conflicts() TO authenticated;