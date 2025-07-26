# Supabase Real-time Subscriptions Setup Guide

## Overview

This guide provides comprehensive setup instructions for implementing Supabase real-time subscriptions in the Velocity platform for collaborative features, live updates, and real-time user interactions.

## Real-time Architecture

### Core Components
- **Channel Management** - Centralized configuration for real-time channels
- **Subscription Tracking** - Monitor active real-time connections
- **User Presence** - Track user activity and status by project
- **Broadcast System** - Send targeted messages and notifications
- **Security Policies** - Role-based access control for real-time features

### Supported Real-time Features
1. **Project Collaboration** - File changes, collaborator updates, build status
2. **User Presence** - Online status, cursor positions, active files
3. **System Notifications** - Broadcasts and announcements
4. **AI Interactions** - Streaming responses and real-time updates
5. **Code Synchronization** - Collaborative editing and live updates

## Step 1: Apply Database Schema

### 1.1 Execute Real-time Configuration SQL
1. Go to **Supabase Dashboard → SQL Editor**
2. Copy the entire contents of `realtime_subscriptions_config.sql`
3. Execute the script to create tables, functions, and policies
4. Verify successful execution

### 1.2 Verify Real-time Tables
Run this query to confirm tables were created:

```sql
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'realtime_%' OR table_name = 'user_presence'
ORDER BY table_name;
```

Expected tables:
- `realtime_channels`
- `realtime_subscriptions` 
- `user_presence`
- `realtime_broadcasts`

## Step 2: Enable Real-time in Supabase Dashboard

### 2.1 Enable Real-time API
1. Go to **Supabase Dashboard → Settings → API**
2. Scroll to **Real-time API** section
3. Toggle **Enable Real-time** to ON
4. Note the Real-time API endpoint URL

### 2.2 Configure Real-time Settings
1. Go to **Database → Replication**
2. Enable replication for tables you want real-time updates:
   - `projects`
   - `project_files` 
   - `project_collaborators`
   - `builds`
   - `ai_interactions`
   - `user_presence`

### 2.3 Set Real-time Row Level Security
Ensure RLS is enabled for all real-time tables (already handled in SQL script).

## Step 3: Client Integration Examples

### 3.1 React/Next.js Integration

```javascript
// hooks/useRealtimeSubscription.js
import { useEffect, useState } from 'react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';

export function useRealtimeSubscription(channelName, eventTypes = ['*']) {
  const [data, setData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const supabase = useSupabaseClient();
  const user = useUser();

  useEffect(() => {
    if (!user || !channelName) return;

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public',
          table: channelName.split('_')[0] // Extract table name
        }, 
        (payload) => {
          console.log('Real-time update:', payload);
          setData(payload);
        }
      )
      .on('broadcast', 
        { event: '*' }, 
        (payload) => {
          console.log('Broadcast received:', payload);
          setData(payload);
        }
      )
      .subscribe((status) => {
        console.log('Subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      channel.unsubscribe();
    };
  }, [user, channelName, supabase]);

  return { data, isConnected };
}

// hooks/useUserPresence.js
import { useEffect, useCallback } from 'react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';

export function useUserPresence(projectId) {
  const [activeUsers, setActiveUsers] = useState([]);
  const supabase = useSupabaseClient();
  const user = useUser();

  const updatePresence = useCallback(async (status = 'online', metadata = {}) => {
    if (!user || !projectId) return;

    try {
      await supabase.rpc('update_user_presence', {
        project_uuid: projectId,
        status_param: status,
        current_page_param: metadata.currentPage,
        cursor_position_param: metadata.cursorPosition,
        active_file_param: metadata.activeFile,
        client_info_param: metadata.clientInfo,
        session_id_param: metadata.sessionId
      });
    } catch (error) {
      console.error('Error updating presence:', error);
    }
  }, [user, projectId, supabase]);

  const getActiveUsers = useCallback(async () => {
    if (!user || !projectId) return;

    try {
      const { data, error } = await supabase.rpc('get_project_active_users', {
        project_uuid: projectId
      });

      if (error) throw error;
      setActiveUsers(data || []);
    } catch (error) {
      console.error('Error fetching active users:', error);
    }
  }, [user, projectId, supabase]);

  useEffect(() => {
    if (!user || !projectId) return;

    // Initial presence update
    updatePresence('online', {
      currentPage: window.location.pathname,
      sessionId: `session_${Date.now()}`
    });

    // Set up real-time subscription for presence updates
    const channel = supabase
      .channel(`presence_${projectId}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_presence',
          filter: `project_id=eq.${projectId}`
        },
        () => {
          getActiveUsers();
        }
      )
      .subscribe();

    // Update presence periodically
    const presenceInterval = setInterval(() => {
      updatePresence('online', {
        currentPage: window.location.pathname
      });
    }, 30000); // Every 30 seconds

    // Cleanup on unmount
    return () => {
      updatePresence('offline');
      clearInterval(presenceInterval);
      channel.unsubscribe();
    };
  }, [user, projectId, updatePresence, getActiveUsers, supabase]);

  return { activeUsers, updatePresence };
}

// components/RealtimeCollaboration.jsx
import React from 'react';
import { useRealtimeSubscription, useUserPresence } from '../hooks';

export function RealtimeCollaboration({ projectId }) {
  const { data: fileChanges } = useRealtimeSubscription('project_files_changes');
  const { data: buildUpdates } = useRealtimeSubscription('project_builds_status');
  const { activeUsers, updatePresence } = useUserPresence(projectId);

  const handleFileActivity = (fileName) => {
    updatePresence('online', {
      activeFile: fileName,
      currentPage: '/editor'
    });
  };

  return (
    <div className="realtime-collaboration">
      {/* Active Users Display */}
      <div className="active-users">
        <h3>Active Users ({activeUsers.length})</h3>
        {activeUsers.map(user => (
          <div key={user.user_id} className="user-presence">
            <img src={user.avatar_url} alt={user.username} />
            <span className={`status ${user.status}`}>{user.username}</span>
            {user.active_file && (
              <small>Editing: {user.active_file}</small>
            )}
          </div>
        ))}
      </div>

      {/* File Changes Notifications */}
      {fileChanges && (
        <div className="file-change-notification">
          File updated: {fileChanges.new?.name || fileChanges.old?.name}
        </div>
      )}

      {/* Build Status Updates */}
      {buildUpdates && (
        <div className="build-status-notification">
          Build {buildUpdates.new?.status}: {buildUpdates.new?.id}
        </div>
      )}
    </div>
  );
}
```

### 3.2 React Native Integration

```javascript
// hooks/useRealtimeRN.js
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useRealtimeRN(channelName, tableName) {
  const [data, setData] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: tableName
        },
        (payload) => {
          setData(payload);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      channel.unsubscribe();
    };
  }, [channelName, tableName]);

  return { data, isConnected };
}

// components/CollaborativeEditor.jsx
import React, { useEffect } from 'react';
import { View, Text, TextInput } from 'react-native';
import { useRealtimeRN } from '../hooks/useRealtimeRN';

export function CollaborativeEditor({ projectId, fileId }) {
  const [code, setCode] = useState('');
  const { data: fileChanges } = useRealtimeRN('file_sync', 'project_files');

  useEffect(() => {
    if (fileChanges && fileChanges.new?.id === fileId) {
      setCode(fileChanges.new.content);
    }
  }, [fileChanges, fileId]);

  const handleCodeChange = async (newCode) => {
    setCode(newCode);
    
    // Broadcast code changes to other collaborators
    await supabase
      .channel(`file_${fileId}`)
      .send({
        type: 'broadcast',
        event: 'code_change',
        payload: {
          fileId,
          content: newCode,
          userId: user.id,
          timestamp: new Date().toISOString()
        }
      });
  };

  return (
    <View>
      <TextInput
        multiline
        value={code}
        onChangeText={handleCodeChange}
        style={{ height: 400, borderWidth: 1 }}
      />
    </View>
  );
}
```

### 3.3 Broadcast Messaging System

```javascript
// utils/realtimeBroadcast.js
export class RealtimeBroadcast {
  constructor(supabase) {
    this.supabase = supabase;
  }

  // Send system notification to all users
  async sendSystemNotification(message, priority = 'normal') {
    return await this.supabase.rpc('broadcast_realtime_message', {
      channel_name_param: 'system_notifications',
      event_type_param: 'system_message',
      payload_param: {
        message,
        timestamp: new Date().toISOString()
      },
      priority_param: priority
    });
  }

  // Send project-specific notification
  async sendProjectNotification(projectId, message, targetUsers = null) {
    return await this.supabase.rpc('broadcast_realtime_message', {
      channel_name_param: 'project_notifications',
      event_type_param: 'project_message',
      payload_param: {
        projectId,
        message,
        timestamp: new Date().toISOString()
      },
      target_users_param: targetUsers,
      target_projects_param: [projectId]
    });
  }

  // Send AI streaming response
  async streamAIResponse(interactionId, chunk, isComplete = false) {
    return await this.supabase
      .channel(`ai_interaction_${interactionId}`)
      .send({
        type: 'broadcast',
        event: 'ai_stream',
        payload: {
          interactionId,
          chunk,
          isComplete,
          timestamp: new Date().toISOString()
        }
      });
  }

  // Listen for broadcasts
  subscribeToBroadcasts(channelName, callback) {
    return this.supabase
      .channel(channelName)
      .on('broadcast', { event: '*' }, callback)
      .subscribe();
  }
}

// Usage example
const broadcast = new RealtimeBroadcast(supabase);

// Send system notification
await broadcast.sendSystemNotification(
  'Scheduled maintenance in 10 minutes',
  'high'
);

// Listen for system notifications
const channel = broadcast.subscribeToBroadcasts(
  'system_notifications',
  (payload) => {
    console.log('System notification:', payload.payload.message);
    // Show toast/notification in UI
  }
);
```

## Step 4: Advanced Real-time Features

### 4.1 Collaborative Cursor Tracking

```javascript
// hooks/useCursorTracking.js
import { useEffect, useState } from 'react';
import { useSupabaseClient, useUser } from '@supabase/auth-helpers-react';

export function useCursorTracking(projectId, fileId) {
  const [cursors, setCursors] = useState(new Map());
  const supabase = useSupabaseClient();
  const user = useUser();

  const updateCursorPosition = async (position) => {
    if (!user || !projectId) return;

    await supabase.rpc('update_user_presence', {
      project_uuid: projectId,
      status_param: 'online',
      active_file_param: fileId,
      cursor_position_param: {
        line: position.line,
        column: position.column,
        selection: position.selection
      }
    });
  };

  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`cursors_${projectId}`)
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'user_presence',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          if (payload.new.user_id !== user?.id && 
              payload.new.active_file === fileId) {
            setCursors(prev => new Map(prev.set(
              payload.new.user_id,
              {
                username: payload.new.username,
                position: payload.new.cursor_position,
                color: `hsl(${payload.new.user_id.slice(-6)}, 70%, 50%)`
              }
            )));
          }
        }
      )
      .subscribe();

    return () => channel.unsubscribe();
  }, [projectId, fileId, user, supabase]);

  return { cursors, updateCursorPosition };
}
```

### 4.2 Real-time Build Status

```javascript
// hooks/useBuildStatus.js
import { useEffect, useState } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

export function useBuildStatus(projectId) {
  const [builds, setBuilds] = useState([]);
  const [activeBuild, setActiveBuild] = useState(null);
  const supabase = useSupabaseClient();

  useEffect(() => {
    const channel = supabase
      .channel(`builds_${projectId}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'builds',
          filter: `project_id=eq.${projectId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setBuilds(prev => [payload.new, ...prev]);
            if (payload.new.status === 'building') {
              setActiveBuild(payload.new);
            }
          } else if (payload.eventType === 'UPDATE') {
            setBuilds(prev => prev.map(build => 
              build.id === payload.new.id ? payload.new : build
            ));
            
            if (payload.new.id === activeBuild?.id) {
              setActiveBuild(payload.new);
              
              // Build completed
              if (['completed', 'failed', 'cancelled'].includes(payload.new.status)) {
                setActiveBuild(null);
              }
            }
          }
        }
      )
      .subscribe();

    return () => channel.unsubscribe();
  }, [projectId, activeBuild, supabase]);

  return { builds, activeBuild };
}
```

## Step 5: Performance Optimization

### 5.1 Connection Management

```javascript
// utils/realtimeManager.js
export class RealtimeConnectionManager {
  constructor(supabase) {
    this.supabase = supabase;
    this.channels = new Map();
    this.heartbeatInterval = null;
  }

  subscribe(channelName, options = {}) {
    if (this.channels.has(channelName)) {
      return this.channels.get(channelName);
    }

    const channel = this.supabase
      .channel(channelName, {
        config: {
          broadcast: { self: true },
          presence: { key: options.presenceKey }
        }
      });

    this.channels.set(channelName, channel);
    return channel;
  }

  unsubscribe(channelName) {
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.unsubscribe();
      this.channels.delete(channelName);
    }
  }

  unsubscribeAll() {
    this.channels.forEach((channel, name) => {
      channel.unsubscribe();
    });
    this.channels.clear();
  }

  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.channels.forEach((channel) => {
        channel.send({
          type: 'broadcast',
          event: 'heartbeat',
          payload: { timestamp: Date.now() }
        });
      });
    }, 30000); // Every 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
```

### 5.2 Data Throttling and Debouncing

```javascript
// utils/realtimeThrottle.js
import { throttle, debounce } from 'lodash';

export class RealtimeThrottle {
  constructor(supabase) {
    this.supabase = supabase;
    
    // Throttled functions
    this.throttledPresenceUpdate = throttle(
      this.updatePresence.bind(this), 
      1000
    );
    
    this.debouncedCodeSync = debounce(
      this.syncCode.bind(this), 
      500
    );
  }

  updatePresence(projectId, data) {
    return this.supabase.rpc('update_user_presence', {
      project_uuid: projectId,
      ...data
    });
  }

  syncCode(fileId, content) {
    return this.supabase
      .channel(`file_${fileId}`)
      .send({
        type: 'broadcast',
        event: 'code_sync',
        payload: { fileId, content, timestamp: Date.now() }
      });
  }
}
```

## Step 6: Monitoring and Analytics

### 6.1 Real-time Metrics Dashboard

```sql
-- Monitor active subscriptions
SELECT * FROM public.active_realtime_subscriptions;

-- Check project presence
SELECT * FROM public.project_presence_summary 
WHERE active_users > 0;

-- View broadcast statistics
SELECT * FROM public.realtime_broadcast_stats 
WHERE broadcasts_last_hour > 0;

-- Performance monitoring
SELECT 
  channel_name,
  subscriber_count,
  usage_level,
  CASE 
    WHEN usage_level = 'high' THEN 'Consider scaling'
    WHEN usage_level = 'medium' THEN 'Monitor closely'
    ELSE 'Normal operation'
  END as recommendation
FROM public.active_realtime_subscriptions;
```

### 6.2 Automated Cleanup

```sql
-- Run daily cleanup
SELECT public.cleanup_realtime_data(7, 30);

-- Monitor cleanup results
WITH cleanup_results AS (
  SELECT public.cleanup_realtime_data(7, 30) as stats
)
SELECT 
  (stats->>'expired_broadcasts')::int as expired_broadcasts,
  (stats->>'inactive_subscriptions')::int as inactive_subscriptions,
  (stats->>'offline_presence')::int as offline_presence
FROM cleanup_results;
```

## Step 7: Security Best Practices

### 7.1 Channel Access Control

```javascript
// Verify channel access before subscribing
const verifyChannelAccess = async (channelName, projectId = null) => {
  const { data, error } = await supabase.rpc(
    'check_realtime_channel_access',
    {
      channel_name_param: channelName,
      project_uuid: projectId
    }
  );

  if (error || !data) {
    throw new Error('Access denied to channel');
  }

  return data;
};

// Usage
try {
  await verifyChannelAccess('project_files_changes', projectId);
  // Proceed with subscription
} catch (error) {
  console.error('Channel access denied:', error);
}
```

### 7.2 Rate Limiting for Real-time Events

```javascript
// Rate-limited real-time operations
export class RateLimitedRealtime {
  constructor(supabase, maxEventsPerSecond = 10) {
    this.supabase = supabase;
    this.eventQueue = [];
    this.maxEventsPerSecond = maxEventsPerSecond;
    this.lastEventTime = 0;
  }

  async sendEvent(channelName, event, payload) {
    const now = Date.now();
    const timeSinceLastEvent = now - this.lastEventTime;
    const minInterval = 1000 / this.maxEventsPerSecond;

    if (timeSinceLastEvent < minInterval) {
      // Queue the event
      return new Promise((resolve) => {
        setTimeout(() => {
          this.sendEvent(channelName, event, payload).then(resolve);
        }, minInterval - timeSinceLastEvent);
      });
    }

    this.lastEventTime = now;
    
    return this.supabase
      .channel(channelName)
      .send({
        type: 'broadcast',
        event,
        payload
      });
  }
}
```

## Step 8: Testing Real-time Features

### 8.1 Manual Testing Checklist

✅ **Real-time Subscriptions:**
- [ ] Multiple users can join the same channel
- [ ] Database changes trigger real-time updates
- [ ] Broadcast messages are received by subscribers
- [ ] Disconnections are handled gracefully
- [ ] Reconnections work automatically

✅ **User Presence:**
- [ ] User status updates in real-time
- [ ] Cursor positions sync between users
- [ ] Inactive users are marked offline
- [ ] Presence data persists across page refreshes

✅ **Security:**
- [ ] Unauthorized users cannot access restricted channels
- [ ] RLS policies prevent data leakage
- [ ] Rate limiting prevents abuse
- [ ] Invalid payloads are rejected

### 8.2 Automated Testing

```javascript
// __tests__/realtime.test.js
import { createClient } from '@supabase/supabase-js';

describe('Real-time Features', () => {
  let supabase;
  let testProjectId;

  beforeAll(async () => {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  });

  test('should subscribe to project updates', async () => {
    const updates = [];
    
    const channel = supabase
      .channel('test_project_updates')
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'projects',
          filter: `id=eq.${testProjectId}`
        },
        (payload) => {
          updates.push(payload);
        }
      )
      .subscribe();

    // Trigger an update
    await supabase
      .from('projects')
      .update({ name: 'Updated Project' })
      .eq('id', testProjectId);

    // Wait for real-time update
    await new Promise(resolve => setTimeout(resolve, 1000));

    expect(updates).toHaveLength(1);
    expect(updates[0].new.name).toBe('Updated Project');

    channel.unsubscribe();
  });

  test('should track user presence', async () => {
    await supabase.rpc('update_user_presence', {
      project_uuid: testProjectId,
      status_param: 'online',
      current_page_param: '/editor'
    });

    const { data } = await supabase.rpc('get_project_active_users', {
      project_uuid: testProjectId
    });

    expect(data).toContainEqual(
      expect.objectContaining({
        status: 'online',
        current_page: '/editor'
      })
    );
  });
});
```

## Next Steps

After successful real-time implementation:

1. ✅ Database schema and functions deployed
2. ✅ Real-time API enabled in Supabase
3. ✅ Channel configurations and security policies
4. ✅ Client integration examples implemented
5. ✅ Performance optimization strategies
6. ✅ Monitoring and analytics set up
7. 🚀 Real-time collaborative features active

The real-time subscription system provides comprehensive live collaboration capabilities including user presence tracking, file synchronization, build status updates, and system-wide notifications with enterprise-grade security and performance optimization.