# Row Level Security (RLS) Testing and Validation Guide

## Overview

This guide provides comprehensive step-by-step testing procedures for validating the Row Level Security policies implemented in the Velocity database schema.

## Prerequisites Setup

### Step 1: Apply Database Schema
1. Open Supabase Dashboard → SQL Editor
2. Copy the entire contents of `database_schema_with_rls.sql` 
3. Paste into SQL Editor and click "Run"
4. Verify successful execution (should see "Success. No rows returned")

### Step 2: Create Test Users
You'll need multiple test users to validate RLS policies. Create them through:

**Option A: Through Supabase Auth (Recommended)**
1. Go to Supabase Dashboard → Authentication → Users
2. Click "Add user" and create:
   - User A: `testa@velocity.dev` PW: 12345 UID: 9ef4ba49-a89e-4e86-819d-463ea0c88b83
   - User B: `testb@velocity.dev` PW: 12345 UID: 5d93c621-0b01-4b8d-8b77-ed77f3e00ec5
   - User C: `testc@velocity.dev` PW: 12345 UID: 2037d35a-af6b-4b28-a6c1-bcaf78e7ec36
3. Note down their User IDs from the dashboard

**Option B: Through Application Signup Flow**
1. Use your authentication flow to create test accounts
2. Note the User IDs from auth.users table

### Step 3: Get User Context Information
Run this query to get your test user IDs:
```sql
SELECT id, email FROM auth.users WHERE email LIKE '%test%@velocity.dev';
```

Copy the UUIDs - you'll need them for testing.

## Step-by-Step RLS Testing

### Test 1: User Profiles RLS Testing

**What we're testing**: Users can only access their own profiles and public profiles

#### Step 1.1: Test Own Profile Access ✅
```sql
-- Replace 'USER_A_UUID' with actual User A ID from Step 3
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

-- This should return 1 row (User A's profile)
SELECT id, username, full_name FROM user_profiles WHERE id = 'USER_A_UUID';
```
**Expected Result**: Returns User A's profile data
**If Failed**: RLS policy "Users can view own profile" is not working

# TEST RESULT: PASS ✅

#### Step 1.2: Test Cannot Access Other Private Profiles ✅
```sql
-- Still as User A, try to access User B's profile
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

-- This should return 0 rows (cannot see other user's private profile)
SELECT id, username, full_name FROM user_profiles WHERE id = 'USER_B_UUID';
```
**Expected Result**: Returns 0 rows
**If Failed**: Data leakage - users can see other private profiles

#### Step 1.3: Test Public Profile Access ✅
```sql
-- First, make User B's profile public (as User B)
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';
UPDATE user_profiles SET metadata = '{"is_public": true}' WHERE id = 'USER_B_UUID';

-- Now as User A, try to access User B's public profile
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';
SELECT id, username, full_name FROM user_profiles WHERE id = 'USER_B_UUID';
```
**Expected Result**: Returns User B's profile (now public)
**If Failed**: Public profile policy not working

#### Step 1.4: Test Profile Update Restrictions ✅
```sql
-- As User A, try to update User B's profile (should fail)
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';
UPDATE user_profiles SET bio = 'Hacked!' WHERE id = 'USER_B_UUID';

-- Check if update succeeded (should not have changed)
SELECT bio FROM user_profiles WHERE id = 'USER_B_UUID';
```
**Expected Result**: Update should fail, bio unchanged
**If Failed**: Users can modify other users' profiles

### Test 2: Teams RLS Testing

**What we're testing**: Team access control and membership-based visibility

#### Step 2.1: Create Test Team ✅
```sql
-- As User A, create a team
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

INSERT INTO teams (name, description, owner_id) 
VALUES ('Test Team Alpha', 'Testing team access', 'USER_A_UUID')
RETURNING id;
```
**Expected Result**: Team created successfully, note down the team ID
**If Failed**: Team creation policy not working

#### Step 2.2: Test Team Owner Access ✅
```sql
-- As User A (owner), should see the team
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

SELECT id, name, owner_id FROM teams WHERE owner_id = 'USER_A_UUID';
```
**Expected Result**: Returns the team User A owns
**If Failed**: Team owner access policy not working

#### Step 2.3: Test Non-Member Cannot Access Team ✅
```sql
-- As User B (not a member), should not see User A's team
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

SELECT id, name, owner_id FROM teams WHERE id = 'TEAM_ID_FROM_STEP_2_1';
```
**Expected Result**: Returns 0 rows
**If Failed**: Non-members can see teams they shouldn't access

#### Step 2.4: Add Team Member and Test Access ✅
```sql
-- As User A (owner), add User B as team member
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

INSERT INTO team_members (team_id, user_id, role)
VALUES ('TEAM_ID_FROM_STEP_2_1', 'USER_B_UUID', 'member');

-- Now as User B, should be able to see the team
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

SELECT t.id, t.name, t.owner_id FROM teams t
JOIN team_members tm ON t.id = tm.team_id 
WHERE tm.user_id = 'USER_B_UUID';
```
**Expected Result**: User B can now see the team
**If Failed**: Team member access policy not working

#### Step 2.5: Test Team Member Cannot Modify Team ✅
```sql
-- As User B (member), try to update the team (should fail)
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

UPDATE teams SET description = 'Hacked team!' WHERE id = 'TEAM_ID_FROM_STEP_2_1';

-- Check if update succeeded (should not have changed)
SELECT description FROM teams WHERE id = 'TEAM_ID_FROM_STEP_2_1';
```
**Expected Result**: Update should fail, description unchanged
**If Failed**: Team members can modify teams they shouldn't

### Test 3: Projects RLS Testing

**What we're testing**: Project access control based on ownership, collaboration, and public/private settings

#### Step 3.1: Create Private Project ✅
```sql
-- As User A, create a private project
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

INSERT INTO projects (name, description, owner_id, is_public) 
VALUES ('Secret Project', 'Testing project access', 'USER_A_UUID', false)
RETURNING id;
```
**Expected Result**: Project created successfully, note down the project ID
**If Failed**: Project creation policy not working

#### Step 3.2: Test Project Owner Access ✅
```sql
-- As User A (owner), should see the project
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

SELECT id, name, owner_id, is_public FROM projects WHERE owner_id = 'USER_A_UUID';
```
**Expected Result**: Returns User A's project
**If Failed**: Project owner access policy not working

#### Step 3.3: Test Non-Collaborator Cannot Access Private Project ✅
```sql
-- As User B (not a collaborator), should not see User A's private project
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

SELECT id, name, owner_id FROM projects WHERE id = 'PROJECT_ID_FROM_STEP_3_1';
```
**Expected Result**: Returns 0 rows
**If Failed**: Private projects visible to non-collaborators

#### Step 3.4: Add Collaborator and Test Access ✅
```sql
-- As User A (owner), add User B as viewer
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

INSERT INTO project_collaborators (project_id, user_id, role)
VALUES ('PROJECT_ID_FROM_STEP_3_1', 'USER_B_UUID', 'viewer');

-- Now as User B, should be able to see the project
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

SELECT p.id, p.name, p.owner_id FROM projects p
JOIN project_collaborators pc ON p.id = pc.project_id
WHERE pc.user_id = 'USER_B_UUID';
```
**Expected Result**: User B can now see the project
**If Failed**: Project collaborator access policy not working

#### Step 3.5: Test Public Project Access ✅
```sql
-- As User A, create a public project
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

INSERT INTO projects (name, description, owner_id, is_public) 
VALUES ('Public Demo', 'Public project for testing', 'USER_A_UUID', true)
RETURNING id;

-- As User C (not related to project), should see public project
SET LOCAL "request.jwt.claims" = '{"sub": "USER_C_UUID", "role": "authenticated"}';

SELECT id, name, is_public FROM projects WHERE is_public = true;
```
**Expected Result**: User C can see public projects
**If Failed**: Public project policy not working

#### Step 3.6: Test Viewer Cannot Edit Project ✅
```sql
-- As User B (viewer), try to update the project (should fail)
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

UPDATE projects SET description = 'Hacked project!' WHERE id = 'PROJECT_ID_FROM_STEP_3_1';

-- Check if update succeeded (should not have changed)
SELECT description FROM projects WHERE id = 'PROJECT_ID_FROM_STEP_3_1';
```
**Expected Result**: Update should fail, description unchanged
**If Failed**: Viewers can modify projects they shouldn't

#### Step 3.7: Test Team Project Access ✅
```sql
-- As User A, create a team project
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

INSERT INTO projects (name, description, owner_id, team_id, is_public) 
VALUES ('Team Project', 'Testing team project access', 'USER_A_UUID', 'TEAM_ID_FROM_STEP_2_1', false)
RETURNING id;

-- As User B (team member), should see team project
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

SELECT p.id, p.name, p.team_id FROM projects p
WHERE p.team_id = 'TEAM_ID_FROM_STEP_2_1';
```
**Expected Result**: User B can see team projects
**If Failed**: Team project access policy not working

### Test 4: Project Files RLS Testing

**What we're testing**: File access based on project permissions and user roles

#### Step 4.1: Create Project File ✅
```sql
-- As User A (project owner), create a file
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

INSERT INTO project_files (project_id, file_path, content, file_type)
VALUES ('PROJECT_ID_FROM_STEP_3_1', '/src/App.tsx', 'import React from "react";', 'tsx')
RETURNING id;
```
**Expected Result**: File created successfully, note down the file ID
**If Failed**: File creation policy not working

#### Step 4.2: Test Project Owner Can Access Files ✅
```sql
-- As User A (owner), should see all project files
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

SELECT id, file_path, content FROM project_files WHERE project_id = 'PROJECT_ID_FROM_STEP_3_1';
```
**Expected Result**: Returns the project file
**If Failed**: Project owner file access not working

#### Step 4.3: Test Viewer Can Read Files ✅
```sql
-- As User B (viewer), should be able to read files
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

SELECT id, file_path, content FROM project_files WHERE project_id = 'PROJECT_ID_FROM_STEP_3_1';
```
**Expected Result**: User B can read the file
**If Failed**: Viewer file access not working

#### Step 4.4: Test Viewer Cannot Modify Files ✅
```sql
-- As User B (viewer), try to update file content (should fail)
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

UPDATE project_files SET content = 'console.log("hacked");' 
WHERE project_id = 'PROJECT_ID_FROM_STEP_3_1';

-- Check if update succeeded (should not have changed)
SELECT content FROM project_files WHERE project_id = 'PROJECT_ID_FROM_STEP_3_1';
```
**Expected Result**: Update should fail, content unchanged
**If Failed**: Viewers can modify files they shouldn't

#### Step 4.5: Test Editor Can Modify Files ✅
```sql
-- As User A (owner), change User B to editor role
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

UPDATE project_collaborators SET role = 'editor' 
WHERE project_id = 'PROJECT_ID_FROM_STEP_3_1' AND user_id = 'USER_B_UUID';

-- Now as User B (editor), should be able to modify files
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

UPDATE project_files SET content = 'export default function App() { return <div>Hello</div>; }' 
WHERE project_id = 'PROJECT_ID_FROM_STEP_3_1';
```
**Expected Result**: Update should succeed
**If Failed**: Editors cannot modify files

#### Step 4.6: Test Non-Collaborator Cannot Access Files ✅
```sql
-- As User C (not a collaborator), should not see project files
SET LOCAL "request.jwt.claims" = '{"sub": "USER_C_UUID", "role": "authenticated"}';

SELECT id, file_path FROM project_files WHERE project_id = 'PROJECT_ID_FROM_STEP_3_1';
```
**Expected Result**: Returns 0 rows
**If Failed**: Non-collaborators can access private project files

### Test 5: AI Interactions RLS Testing

**What we're testing**: AI interaction privacy and project-context sharing

#### Step 5.1: Create Personal AI Interaction ✅
```sql
-- As User A, create a personal AI interaction
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

INSERT INTO ai_interactions (user_id, prompt, response, context)
VALUES ('USER_A_UUID', 'Help me with React hooks', 'Here is how to use useState...', '{"type": "personal"}')
RETURNING id;
```
**Expected Result**: AI interaction created successfully, note down the interaction ID
**If Failed**: AI interaction creation policy not working

#### Step 5.2: Test User Can Access Own AI Interactions ✅
```sql
-- As User A, should see own interactions
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

SELECT id, prompt, response FROM ai_interactions WHERE user_id = 'USER_A_UUID';
```
**Expected Result**: Returns User A's AI interactions
**If Failed**: Users cannot access their own AI interactions

#### Step 5.3: Test Cannot Access Other Users' Personal AI Interactions ✅
```sql
-- As User B, should not see User A's personal interactions
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

SELECT id, prompt, response FROM ai_interactions WHERE user_id = 'USER_A_UUID';
```
**Expected Result**: Returns 0 rows
**If Failed**: Users can access other users' private AI interactions

#### Step 5.4: Test Project-Context AI Interaction Sharing ✅
```sql
-- As User A, create a project-related AI interaction
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

INSERT INTO ai_interactions (user_id, project_id, prompt, response, context)
VALUES ('USER_A_UUID', 'PROJECT_ID_FROM_STEP_3_1', 'Generate a login component', 'Here is a login component...', '{"type": "project", "feature": "auth"}')
RETURNING id;

-- As User B (project collaborator), should see project-related interactions
SET LOCAL "request.jwt.claims" = '{"sub": "USER_B_UUID", "role": "authenticated"}';

SELECT ai.id, ai.prompt, ai.response FROM ai_interactions ai
JOIN project_collaborators pc ON ai.project_id = pc.project_id
WHERE pc.user_id = 'USER_B_UUID' AND ai.project_id = 'PROJECT_ID_FROM_STEP_3_1';
```
**Expected Result**: User B can see project-related AI interactions
**If Failed**: Project collaborators cannot access shared AI context

### Test 6: Security Edge Cases and Admin Testing

**What we're testing**: Service role access and privilege escalation protection

#### Step 6.1: Test Service Role Admin Bypass ✅
```sql
-- Test service role can access all data (admin operations)
SET LOCAL "request.jwt.claims" = '{"sub": "admin-service", "role": "service_role"}';

-- Should return all user profiles
SELECT COUNT(*) FROM user_profiles;

-- Should return all teams
SELECT COUNT(*) FROM teams;

-- Should return all projects
SELECT COUNT(*) FROM projects;
```
**Expected Result**: Returns all records from each table
**If Failed**: Service role admin bypass not working

#### Step 6.2: Test Malicious User Cannot Escalate Privileges ✅
```sql
-- Create a malicious user context
SET LOCAL "request.jwt.claims" = '{"sub": "malicious-user-uuid", "role": "authenticated"}';

-- Try to access other users' teams (should fail)
SELECT id, name, owner_id FROM teams WHERE owner_id != 'malicious-user-uuid';

-- Try to access private projects (should fail)
SELECT id, name, owner_id FROM projects 
WHERE owner_id != 'malicious-user-uuid' AND is_public = false;

-- Try to access other users' AI interactions (should fail)
SELECT id, prompt, user_id FROM ai_interactions WHERE user_id != 'malicious-user-uuid';
```
**Expected Result**: All queries should return 0 rows
**If Failed**: RLS policies are not preventing unauthorized access

#### Step 6.3: Test Anonymous User Access ✅
```sql
-- Test anonymous access (should be very limited)
SET LOCAL "request.jwt.claims" = '{"role": "anon"}';

-- Should not see any user profiles
SELECT COUNT(*) FROM user_profiles;

-- Should not see any teams
SELECT COUNT(*) FROM teams;

-- Should only see public projects
SELECT COUNT(*) FROM projects WHERE is_public = true;
```
**Expected Result**: Only public data should be accessible
**If Failed**: Anonymous users can access private data

#### Step 6.4: Test Invalid Role ✅
```sql
-- Test with invalid role
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "invalid_role"}';

-- Should not access any data
SELECT COUNT(*) FROM user_profiles;
SELECT COUNT(*) FROM teams;
SELECT COUNT(*) FROM projects;
```
**Expected Result**: Should return 0 rows for all queries
**If Failed**: Invalid roles can access data

### Test 7: Performance and Vector Search Testing

**What we're testing**: RLS doesn't break performance or vector search functionality

#### Step 7.1: Test Vector Search with RLS ✅
```sql
-- As User A, create a project with vector embedding
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

UPDATE projects SET embedding = '[0.1,0.2,0.3,0.4]'::vector 
WHERE id = 'PROJECT_ID_FROM_STEP_3_1';

-- Test vector similarity search respects RLS
SELECT id, name, embedding <-> '[0.1,0.2,0.3,0.4]'::vector as distance
FROM projects 
WHERE embedding IS NOT NULL
ORDER BY distance 
LIMIT 5;
```
**Expected Result**: Returns only projects User A can access, ordered by similarity
**If Failed**: Vector search doesn't respect RLS policies

#### Step 7.2: Test Query Performance with RLS ✅
```sql
-- Test that RLS doesn't severely impact performance
SET LOCAL "request.jwt.claims" = '{"sub": "USER_A_UUID", "role": "authenticated"}';

EXPLAIN (ANALYZE, BUFFERS) 
SELECT p.id, p.name FROM projects p
JOIN project_collaborators pc ON p.id = pc.project_id
WHERE pc.user_id = 'USER_A_UUID';
```
**Expected Result**: Query should complete reasonably fast with index usage
**If Failed**: RLS policies are causing severe performance issues

## Automated Testing Script

Create this test function in your database:

```sql
CREATE OR REPLACE FUNCTION test_rls_policies()
RETURNS TABLE (
  test_name text,
  passed boolean,
  details text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  test_user_1 uuid := gen_random_uuid();
  test_user_2 uuid := gen_random_uuid();
  test_team_id uuid;
  test_project_id uuid;
  result_count integer;
BEGIN
  -- Setup test data
  INSERT INTO auth.users (id, email) VALUES 
    (test_user_1, 'test1@example.com'),
    (test_user_2, 'test2@example.com');
  
  INSERT INTO user_profiles (id, username) VALUES 
    (test_user_1, 'testuser1'),
    (test_user_2, 'testuser2');
  
  -- Test 1: User can access own profile
  PERFORM set_config('request.jwt.claims', json_build_object('sub', test_user_1, 'role', 'authenticated')::text, true);
  
  SELECT COUNT(*) INTO result_count FROM user_profiles WHERE id = test_user_1;
  
  RETURN QUERY SELECT 
    'User can access own profile'::text,
    result_count = 1,
    format('Expected 1, got %s', result_count);
  
  -- Test 2: User cannot access other user's profile
  SELECT COUNT(*) INTO result_count FROM user_profiles WHERE id = test_user_2;
  
  RETURN QUERY SELECT 
    'User cannot access other profile'::text,
    result_count = 0,
    format('Expected 0, got %s', result_count);
  
  -- Add more tests as needed...
  
  -- Cleanup
  DELETE FROM user_profiles WHERE id IN (test_user_1, test_user_2);
  DELETE FROM auth.users WHERE id IN (test_user_1, test_user_2);
END;
$$;

-- Run the test
SELECT * FROM test_rls_policies();
```

## Performance Testing

### Vector Search with RLS:
```sql
-- Test vector similarity search with RLS
SET LOCAL "request.jwt.claims" = '{"sub": "user-uuid", "role": "authenticated"}';

SELECT id, name, embedding <-> '[0.1,0.2,0.3,...]'::vector as distance
FROM projects 
WHERE embedding IS NOT NULL
ORDER BY distance 
LIMIT 10;
```

### Query Performance Analysis:
```sql
-- Analyze query plans for RLS policies
EXPLAIN (ANALYZE, BUFFERS) 
SELECT * FROM projects WHERE owner_id = 'user-uuid';

EXPLAIN (ANALYZE, BUFFERS)
SELECT p.* FROM projects p
JOIN project_collaborators pc ON p.id = pc.project_id
WHERE pc.user_id = 'user-uuid';
```

## Security Validation Checklist

- [ ] No data leakage between users
- [ ] Proper team isolation
- [ ] Project access controls working
- [ ] Public/private project distinction
- [ ] File access restricted properly
- [ ] AI interaction privacy maintained
- [ ] Admin bypass policies functional
- [ ] Performance acceptable with RLS
- [ ] Vector search respects RLS
- [ ] All triggers functioning

## Common Issues and Solutions

### Issue 1: RLS Policy Not Working
**Solution**: Check if RLS is enabled on the table:
```sql
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public';
```

### Issue 2: Performance Degradation
**Solution**: Ensure proper indexes on columns used in RLS policies:
```sql
-- Add indexes for RLS performance
CREATE INDEX IF NOT EXISTS idx_projects_owner_rls ON projects(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collaborators_user_rls ON project_collaborators(user_id, project_id);
```

### Issue 3: Complex Permission Logic
**Solution**: Use helper functions for complex permission checks:
```sql
-- Example: Check if user has project access
SELECT public.get_project_access_level('project-uuid');
```

## Monitoring and Alerts

Set up monitoring for:
- Failed authorization attempts
- Unusual data access patterns  
- Performance degradation from RLS
- Policy violations in logs

## Test Summary and Cleanup

### Quick Test Checklist
After running all tests above, verify these results:

- [ ] ✅ Users can only access their own profiles
- [ ] ✅ Public profiles are accessible to authenticated users
- [ ] ✅ Team owners have full control over their teams
- [ ] ✅ Team members can see teams they belong to
- [ ] ✅ Non-members cannot access teams
- [ ] ✅ Project owners have full access to their projects
- [ ] ✅ Collaborators have appropriate access based on their role
- [ ] ✅ Private projects are hidden from non-collaborators
- [ ] ✅ Public projects are visible to authenticated users
- [ ] ✅ File access follows project permissions
- [ ] ✅ AI interactions maintain privacy except for project context
- [ ] ✅ Service role can bypass RLS for admin operations
- [ ] ✅ Malicious users cannot escalate privileges
- [ ] ✅ Vector search works with RLS
- [ ] ✅ Performance is acceptable

### Cleanup Test Data
After testing, clean up the test data:

```sql
-- Clean up test data (as service role or through Supabase dashboard)
SET LOCAL "request.jwt.claims" = '{"role": "service_role"}';

-- Delete test interactions
DELETE FROM ai_interactions WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%test%@velocity.dev'
);

-- Delete test files
DELETE FROM project_files WHERE project_id IN (
  SELECT id FROM projects WHERE name LIKE '%Test%' OR name LIKE '%Secret%'
);

-- Delete test collaborators
DELETE FROM project_collaborators WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%test%@velocity.dev'
);

-- Delete test projects
DELETE FROM projects WHERE name LIKE '%Test%' OR name LIKE '%Secret%' OR name LIKE '%Public Demo%';

-- Delete test team members
DELETE FROM team_members WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE '%test%@velocity.dev'
);

-- Delete test teams
DELETE FROM teams WHERE name LIKE '%Test%';

-- Delete test user profiles
DELETE FROM user_profiles WHERE id IN (
  SELECT id FROM auth.users WHERE email LIKE '%test%@velocity.dev'
);

-- Delete test users (if created through SQL)
DELETE FROM auth.users WHERE email LIKE '%test%@velocity.dev';
```

### Next Steps

After successful RLS testing:
1. ✅ All RLS policies are working correctly
2. 📊 Performance benchmarks are acceptable  
3. 🔒 Security audit completed
4. 📚 Update project documentation
5. 👥 Train team on RLS concepts and limitations
6. 🚀 Ready for application development

### Troubleshooting Common Issues

**Issue**: RLS policy not working  
**Solution**: Check if RLS is enabled: `SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';`

**Issue**: Performance degradation  
**Solution**: Ensure indexes exist on RLS policy columns: `CREATE INDEX IF NOT EXISTS idx_table_user_id ON table_name(user_id);`

**Issue**: Complex permission logic failing  
**Solution**: Use the helper functions: `SELECT public.get_project_access_level('project-uuid');`

**Issue**: Service role cannot access data  
**Solution**: Verify service role policies exist for all tables

**Issue**: Vector search not working with RLS  
**Solution**: Check that vector indexes are created and RLS policies don't interfere with similarity queries