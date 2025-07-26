# Database Triggers and Functions Setup Guide

## Overview

This guide provides comprehensive setup instructions for implementing PostgreSQL triggers and functions in the Velocity platform for automated workflows, data integrity, audit logging, and operational efficiency.

## Architecture Overview

### Core Components
- **Timestamp Management** - Automatic created_at and updated_at handling
- **Audit Logging System** - Complete change tracking for critical tables
- **User Profile Automation** - Automatic profile creation on signup
- **Project Management** - Slug generation, embedding preparation, activity tracking
- **Team Management** - Role management and ownership transitions
- **File Versioning** - Automatic version control and integrity checking
- **Build Lifecycle** - Status tracking and notification generation
- **Notification System** - User notifications and system messages
- **Vector Operations** - Similarity search and embedding utilities
- **Maintenance Functions** - Automated cleanup and ranking updates

## Step 1: Apply Database Schema

### 1.1 Execute Triggers and Functions SQL
1. Go to **Supabase Dashboard → SQL Editor**
2. Copy the entire contents of `database_triggers_functions.sql`
3. Execute the script to create all triggers, functions, and tables
4. Verify successful execution

### 1.2 Verify Installation
Run these queries to confirm successful installation:

```sql
-- Check functions are created
SELECT routine_name, routine_type 
FROM information_schema.routines 
WHERE routine_schema = 'public' 
  AND routine_name LIKE '%handle%' OR routine_name LIKE '%create%'
ORDER BY routine_name;

-- Check triggers are created
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Check new tables
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('audit_logs', 'notifications')
ORDER BY table_name;
```

## Step 2: Core Functionality Overview

### 2.1 Automatic Timestamp Management

All tables automatically maintain `created_at` and `updated_at` timestamps:

```sql
-- Example: Creating a project automatically sets timestamps
INSERT INTO public.projects (name, description, owner_id) 
VALUES ('My Project', 'Project description', auth.uid());

-- Updating automatically updates the timestamp
UPDATE public.projects 
SET description = 'Updated description' 
WHERE id = 'project-uuid';
```

### 2.2 User Profile Automation

User profiles are automatically created when users sign up:

```javascript
// When a user signs up via OAuth or email
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password'
});

// Trigger automatically creates user profile with:
// - Unique username based on display name
// - Avatar URL from OAuth provider
// - Metadata from authentication provider
```

### 2.3 Project Slug Generation

Project slugs are automatically generated and ensured to be unique:

```sql
-- Creating a project with a name automatically generates slug
INSERT INTO public.projects (name, owner_id) 
VALUES ('My Awesome Project!', auth.uid());
-- Results in slug: 'my-awesome-project'

-- Duplicate names get numbered suffixes
INSERT INTO public.projects (name, owner_id) 
VALUES ('My Awesome Project!', auth.uid());
-- Results in slug: 'my-awesome-project-1'
```

## Step 3: Audit Logging System

### 3.1 Automatic Audit Trail

Critical tables automatically log all changes:

```sql
-- View audit logs for a specific record
SELECT 
  action,
  changed_fields,
  old_values,
  new_values,
  user_email,
  created_at
FROM public.audit_logs 
WHERE table_name = 'projects' AND record_id = 'project-uuid'
ORDER BY created_at DESC;

-- View recent changes by a user
SELECT 
  table_name,
  record_id,
  action,
  changed_fields,
  created_at
FROM public.audit_logs 
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC
LIMIT 20;
```

### 3.2 Audit Log Analysis

```sql
-- Most active users (by changes made)
SELECT 
  user_email,
  COUNT(*) as change_count,
  COUNT(DISTINCT table_name) as tables_modified,
  MAX(created_at) as last_activity
FROM public.audit_logs 
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY user_email, user_id
ORDER BY change_count DESC
LIMIT 10;

-- Most modified records
SELECT 
  table_name,
  record_id,
  COUNT(*) as modification_count,
  COUNT(DISTINCT user_id) as unique_users,
  MAX(created_at) as last_modified
FROM public.audit_logs 
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY table_name, record_id
HAVING COUNT(*) > 5
ORDER BY modification_count DESC;
```

## Step 4: Notification System

### 4.1 Creating Notifications

```sql
-- Create a custom notification
SELECT public.create_notification(
  'user-uuid'::uuid,
  'system_announcement',
  'New Feature Available',
  'We have released a new collaborative editing feature!',
  '{"feature": "collaborative_editing", "version": "1.2.0"}'::jsonb,
  48 -- Expires in 48 hours
);
```

### 4.2 Notification Management

```javascript
// Frontend: Fetch user notifications
const { data: notifications } = await supabase
  .from('notifications')
  .select('*')
  .eq('user_id', user.id)
  .eq('is_read', false)
  .order('created_at', { ascending: false });

// Mark notification as read
const { error } = await supabase
  .from('notifications')
  .update({ 
    is_read: true, 
    read_at: new Date().toISOString() 
  })
  .eq('id', notificationId);

// Real-time notification subscription
const channel = supabase
  .channel('user_notifications')
  .on('postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${user.id}`
    },
    (payload) => {
      console.log('New notification:', payload.new);
      // Show toast notification
    }
  )
  .subscribe();
```

## Step 5: Vector Search Operations

### 5.1 Project Similarity Search

```javascript
// Find similar projects based on vector embedding
const { data: similarProjects } = await supabase.rpc(
  'find_similar_projects',
  {
    query_embedding: projectEmbedding, // vector(1536)
    similarity_threshold: 0.7,
    max_results: 5
  }
);

console.log('Similar projects:', similarProjects);
```

### 5.2 Embedding Preparation

Projects automatically prepare embedding text:

```sql
-- When inserting/updating a project
INSERT INTO public.projects (name, description, tags, owner_id) 
VALUES (
  'React Native Chat App',
  'A real-time chat application built with React Native',
  ARRAY['react-native', 'chat', 'real-time'],
  auth.uid()
);

-- Trigger automatically sets embedding_text to:
-- "React Native Chat App A real-time chat application built with React Native react-native chat real-time"
```

## Step 6: Build Lifecycle Management

### 6.1 Automatic Build Tracking

Build status changes are automatically tracked:

```sql
-- Starting a build
UPDATE public.builds 
SET status = 'building' 
WHERE id = 'build-uuid';
-- Trigger automatically sets started_at = NOW()

-- Completing a build
UPDATE public.builds 
SET status = 'completed' 
WHERE id = 'build-uuid';
-- Trigger automatically sets:
-- - completed_at = NOW()
-- - duration_seconds = calculated duration
-- - Creates notification for project owner
```

### 6.2 Build Notifications

```javascript
// Build notifications are automatically created
// Listen for build notifications
const { data: buildNotifications } = await supabase
  .from('notifications')
  .select('*')
  .eq('user_id', user.id)
  .in('type', ['build_complete', 'build_failed'])
  .order('created_at', { ascending: false });
```

## Step 7: Team Management Automation

### 7.1 Ownership Transfers

Team ownership transfers are automatically handled:

```sql
-- Promoting a member to owner automatically demotes previous owner
UPDATE public.team_members 
SET role = 'owner' 
WHERE team_id = 'team-uuid' AND user_id = 'new-owner-uuid';
-- Previous owner is automatically changed to 'admin'
```

### 7.2 Team Activity Tracking

```sql
-- View team activity
SELECT 
  tm.role,
  up.username,
  tm.updated_at as role_changed_at
FROM public.team_members tm
JOIN public.user_profiles up ON tm.user_id = up.id
WHERE tm.team_id = 'team-uuid'
ORDER BY tm.updated_at DESC;
```

## Step 8: Maintenance Operations

### 8.1 Automated Cleanup

```sql
-- Clean up expired notifications (run daily)
SELECT public.cleanup_expired_notifications();

-- Clean up old audit logs (run weekly)
SELECT public.cleanup_old_audit_logs(90); -- Keep 90 days

-- Update project rankings (run daily)
SELECT public.update_project_rankings();
```

### 8.2 Scheduled Maintenance

Set up scheduled jobs for maintenance:

```javascript
// Example: Supabase Edge Function for daily maintenance
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Run maintenance functions
    const { data: cleanupResults } = await supabase.rpc('cleanup_expired_notifications');
    await supabase.rpc('cleanup_old_audit_logs', { days_to_keep: 90 });
    await supabase.rpc('update_project_rankings');

    return new Response(JSON.stringify({
      success: true,
      cleanup_results: cleanupResults,
      timestamp: new Date().toISOString()
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});
```

## Step 9: Performance Monitoring

### 9.1 Trigger Performance

```sql
-- Monitor trigger execution time
SELECT 
  schemaname,
  tablename,
  attname,
  n_tup_ins,
  n_tup_upd,
  n_tup_del
FROM pg_stat_user_tables 
WHERE schemaname = 'public'
ORDER BY n_tup_upd + n_tup_ins + n_tup_del DESC;

-- Check for slow queries involving triggers
SELECT 
  query,
  calls,
  total_time,
  mean_time,
  rows
FROM pg_stat_statements 
WHERE query LIKE '%trigger%' OR query LIKE '%FUNCTION%'
ORDER BY mean_time DESC
LIMIT 10;
```

### 9.2 Audit Log Growth

```sql
-- Monitor audit log growth
SELECT 
  table_name,
  COUNT(*) as log_count,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as last_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as last_7d,
  pg_size_pretty(pg_total_relation_size('public.audit_logs')) as table_size
FROM public.audit_logs 
GROUP BY table_name
ORDER BY log_count DESC;
```

## Step 10: Security Considerations

### 10.1 Audit Log Security

```sql
-- Check audit log access patterns
SELECT 
  user_email,
  COUNT(*) as audit_queries,
  array_agg(DISTINCT table_name) as tables_accessed
FROM public.audit_logs al
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY user_email
HAVING COUNT(*) > 100  -- Flag high access users
ORDER BY audit_queries DESC;
```

### 10.2 Notification Security

Notifications are automatically secured by RLS policies:

```javascript
// Users can only see their own notifications
const { data } = await supabase
  .from('notifications')
  .select('*'); // Automatically filtered by RLS to current user

// Service role can manage all notifications for system operations
```

## Step 11: Testing and Validation

### 11.1 Test Triggers

```sql
-- Test user profile creation
-- (Sign up a new user and verify profile is created)

-- Test project slug generation
INSERT INTO public.projects (name, owner_id) VALUES ('Test Project!!!', auth.uid());
SELECT slug FROM public.projects WHERE name = 'Test Project!!!';

-- Test audit logging
UPDATE public.projects SET name = 'Updated Test Project' WHERE name = 'Test Project!!!';
SELECT * FROM public.audit_logs WHERE table_name = 'projects' ORDER BY created_at DESC LIMIT 1;

-- Test notification creation
SELECT public.create_notification(
  auth.uid(),
  'system_announcement',
  'Test Notification',
  'This is a test notification'
);
SELECT * FROM public.notifications WHERE user_id = auth.uid() ORDER BY created_at DESC LIMIT 1;
```

### 11.2 Performance Testing

```sql
-- Bulk insert test to verify trigger performance
INSERT INTO public.projects (name, description, owner_id)
SELECT 
  'Test Project ' || generate_series,
  'Description for project ' || generate_series,
  auth.uid()
FROM generate_series(1, 1000);

-- Check trigger execution time
SELECT COUNT(*) FROM public.audit_logs WHERE table_name = 'projects';
```

## Step 12: Troubleshooting

### Common Issues and Solutions

**Issue**: Triggers not firing
**Solution**: Check if triggers are enabled and functions exist

```sql
-- Check trigger status
SELECT 
  trigger_name, 
  event_object_table, 
  trigger_schema,
  action_statement
FROM information_schema.triggers 
WHERE trigger_schema = 'public';
```

**Issue**: Performance degradation
**Solution**: Monitor trigger execution and optimize slow functions

```sql
-- Check function performance
SELECT 
  funcname,
  calls,
  total_time,
  self_time,
  mean_time
FROM pg_stat_user_functions 
WHERE schemaname = 'public'
ORDER BY mean_time DESC;
```

**Issue**: Audit logs growing too large
**Solution**: Implement regular cleanup and archiving

```sql
-- Archive old audit logs before deletion
CREATE TABLE public.audit_logs_archive AS 
SELECT * FROM public.audit_logs 
WHERE created_at < NOW() - INTERVAL '1 year';

-- Then run cleanup
SELECT public.cleanup_old_audit_logs(365);
```

## Next Steps

After successful triggers and functions implementation:

1. ✅ All triggers and functions deployed and active
2. ✅ Automatic timestamp management working
3. ✅ Audit logging capturing all changes
4. ✅ User profile automation functional
5. ✅ Project management automation active
6. ✅ Notification system operational
7. ✅ Vector search utilities available
8. ✅ Maintenance functions scheduled
9. 🚀 Complete database automation active

The database triggers and functions system provides comprehensive automation for data integrity, user experience, and operational efficiency with enterprise-grade audit trails and performance optimization.