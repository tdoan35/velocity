# Preview Container Session Lookup Fix - Implementation Plan

## Executive Summary

**Issue**: Preview container session routing fails with "Session not found" error despite successful container initialization and orchestrator session creation.

**Root Cause**: Database synchronization timing issue between orchestrator service (session creation) and container service (session lookup).

**Impact**: Preview functionality is completely broken - users see `{"error":"Session not found"}` instead of their preview applications.

**Status**: High Priority - Production Issue

---

## Issue Analysis Summary

### Investigation Results (2025-09-03)

**✅ Container Infrastructure Working Correctly:**
- Container creation: ✅ Success
- Vite development server: ✅ Running on port 3001
- Health checks: ✅ Passing
- Proxy setup: ✅ Port 8080 → 3001 working
- Session routing middleware: ✅ Active and receiving requests

**❌ Database Synchronization Failure:**
- Session creation in orchestrator: ✅ Success
- Session lookup in container: ❌ Fails with "Session not found"
- Database timing issue confirmed through container logs

### Technical Evidence

**Container Logs Analysis:**
```
🎯 Session routing request for: 81e64143-8189-4fe7-bd3d-e1ccd377028c
Session not found, attempt 1. Retrying in 200ms...
Session not found, attempt 2. Retrying in 400ms...
Session not found, attempt 3. Retrying in 800ms...
Session not found, attempt 4. Retrying in 1600ms...
❌ Session 81e64143-8189-4fe7-bd3d-e1ccd377028c not found in database after 5 attempts
```

**Database Schema Confirmed:**
- `preview_sessions` table: ✅ 63 rows (sessions are created)
- `projects` table: ✅ Has `template_type` field
- `project_files` table: ❌ 0 rows (no project files exist)

---

## Root Cause Analysis

### Primary Issue: Race Condition in Session Creation Flow

**Current Flow (Broken):**
```
1. Orchestrator creates session record
2. Orchestrator immediately creates container
3. Orchestrator returns container URL to client
4. Container starts and tries to lookup session
5. ❌ Session not yet committed/visible in database
```

**Contributing Factors:**
1. **Timing Issue**: Container receives requests before session fully committed
2. **Missing Verification**: No confirmation that session exists before URL return
3. **Database Transaction Boundaries**: Session creation may not be atomic
4. **Project File Gap**: Demo projects have no files, causing initialization delays

### Eliminated Potential Causes
- ❌ ~~Container initialization failure~~ → Container works perfectly
- ❌ ~~Vite development server issues~~ → Dev server runs correctly  
- ❌ ~~Network/Connection problems~~ → Container connects to Supabase successfully
- ❌ ~~Session routing architecture~~ → Middleware and URL generation working

---

## Implementation Strategy

### Phase 1: Immediate Fix (Critical Priority)
**Goal**: Stop "Session not found" errors

#### 1.1 Transaction-Based Session Creation
**File**: `orchestrator/src/services/container-manager.ts`

```typescript
async startSession(request) {
  try {
    // ATOMIC SESSION CREATION
    const session = await supabase.transaction(async (tx) => {
      // Create session record first
      const sessionRecord = await tx.from('preview_sessions').insert({
        user_id: request.userId,
        project_id: request.projectId,
        status: 'creating',
        tier: 'free',
        resource_limits: {
          cpu: "0.5", disk: "2GB", tier: "free", 
          memory: "1GB", maxDuration: 1800
        }
      }).select().single();
      
      return sessionRecord.data;
    });
    
    // CREATE CONTAINER (after session exists)
    const container = await this.flyService.createMachine(
      request.projectId, 'free', request.customConfig, session.id
    );
    
    // UPDATE SESSION WITH CONTAINER INFO
    await supabase.from('preview_sessions')
      .update({
        container_id: container.machine.id,
        container_url: container.url,
        status: 'active'
      }).eq('id', session.id);
    
    // CRITICAL: VERIFY SESSION EXISTS
    const verification = await supabase.from('preview_sessions')
      .select('id, container_id, container_url')
      .eq('id', session.id)
      .single();
      
    if (!verification.data) {
      throw new Error('Session verification failed');
    }
    
    // Only return URL after verification succeeds
    return {
      sessionId: session.id,
      containerUrl: verification.data.container_url,
      status: 'active'
    };
    
  } catch (error) {
    // Cleanup on failure
    if (session?.id) {
      await supabase.from('preview_sessions')
        .update({ status: 'error', error_message: error.message })
        .eq('id', session.id);
    }
    throw error;
  }
}
```

#### 1.2 Enhanced Container Session Lookup
**File**: `orchestrator/preview-container/entrypoint.js`

```javascript
// Improved session lookup with better error handling
app.use('/session/:sessionId', async (req, res, next) => {
  const { sessionId } = req.params;
  
  try {
    // Add connection health check
    const { data: healthCheck } = await supabase
      .from('preview_sessions')
      .select('id')
      .limit(1);
      
    if (!healthCheck) {
      throw new Error('Database connection failed');
    }
    
    // Session lookup with explicit error handling
    const { data: session, error } = await supabase
      .from('preview_sessions')
      .select('container_id, project_id, status')
      .eq('id', sessionId)
      .eq('status', 'active') // Only active sessions
      .single();

    if (error || !session) {
      console.log(`❌ Session ${sessionId} not found:`, error?.message);
      return res.status(404).json({ 
        error: 'Session not found',
        sessionId,
        timestamp: new Date().toISOString(),
        details: error?.message || 'Session does not exist or is not active'
      });
    }

    // Continue with routing logic...
    const currentMachineId = process.env.FLY_MACHINE_ID;
    
    if (currentMachineId === session.container_id) {
      req.url = req.url.substring(`/session/${sessionId}`.length) || '/';
      return next();
    } else {
      res.setHeader('fly-replay', `instance=${session.container_id}`);
      return res.status(307).json({ 
        message: 'Redirecting to correct machine',
        targetMachine: session.container_id
      });
    }
    
  } catch (error) {
    console.error(`💥 Session routing error for ${sessionId}:`, error);
    return res.status(500).json({ 
      error: 'Session routing failed',
      details: error.message 
    });
  }
});
```

### Phase 2: Project File Management (High Priority)
**Goal**: Ensure demo projects have proper files

#### 2.1 Project Validation and Setup
**File**: `orchestrator/src/services/container-manager.ts`

```typescript
private async ensureProjectReady(projectId: string) {
  // Handle demo project special case
  if (projectId === '550e8400-e29b-41d4-a716-446655440000') {
    return await this.setupDemoProject(projectId);
  }
  
  const project = await supabase.from('projects')
    .select('id, template_type, status')
    .eq('id', projectId)
    .single();
    
  if (!project.data) {
    // Create new project with default template
    const newProject = await this.createProjectWithTemplate(projectId, 'react');
    return { project: newProject, isNew: true };
  }
  
  // Check if project has files
  const fileCount = await supabase.from('project_files')
    .select('id', { count: 'exact' })
    .eq('project_id', projectId);
    
  if (fileCount.count === 0) {
    await this.addTemplateFilesToProject(projectId, project.data.template_type || 'react');
  }
  
  return { project: project.data, isNew: false };
}

private async setupDemoProject(projectId: string) {
  // Create demo project if doesn't exist
  const { data: existingProject } = await supabase.from('projects')
    .select('id')
    .eq('id', projectId)
    .single();
    
  if (!existingProject) {
    await supabase.from('projects').insert({
      id: projectId,
      name: 'Demo Project',
      description: 'Preview container demo project',
      template_type: 'react',
      status: 'active',
      owner_id: '00000000-0000-0000-0000-000000000000' // System user
    });
  }
  
  // Ensure demo project has files
  await this.addTemplateFilesToProject(projectId, 'react');
  
  return { project: { id: projectId, template_type: 'react' }, isNew: false };
}
```

#### 2.2 Template System Implementation
**File**: `orchestrator/src/services/template-service.ts`

```typescript
export class TemplateService {
  getTemplateFiles(templateType: string) {
    const templates = {
      'react': [
        {
          file_path: 'src/App.jsx',
          content: `import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <h1>Welcome to Velocity Preview!</h1>
      <p>This is a demo React application running in a preview container.</p>
      <div className="card">
        <button onClick={() => setCount((count) => count + 1)}>
          count is {count}
        </button>
      </div>
    </div>
  )
}

export default App`,
          file_type: 'javascript'
        },
        {
          file_path: 'src/App.css',
          content: `.App {
  text-align: center;
  padding: 2rem;
}

.card {
  padding: 2em;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background-color: #1a1a1a;
  color: white;
  cursor: pointer;
  transition: border-color 0.25s;
}

button:hover {
  border-color: #646cff;
}`,
          file_type: 'css'
        },
        {
          file_path: 'package.json',
          content: JSON.stringify({
            "name": "velocity-preview",
            "version": "0.0.0",
            "type": "module",
            "scripts": {
              "dev": "vite",
              "build": "vite build",
              "preview": "vite preview"
            },
            "dependencies": {
              "react": "^18.2.0",
              "react-dom": "^18.2.0"
            },
            "devDependencies": {
              "@types/react": "^18.2.15",
              "@vitejs/plugin-react": "^4.0.3",
              "vite": "^4.4.5"
            }
          }, null, 2),
          file_type: 'json'
        }
      ]
    };
    
    return templates[templateType] || templates['react'];
  }
}
```

### Phase 3: Monitoring and Optimization (Medium Priority)
**Goal**: Prevent future issues and improve reliability

#### 3.1 Health Check Integration
**File**: `orchestrator/preview-container/entrypoint.js`

```javascript
// Enhanced health check that verifies session exists
app.get('/health', async (req, res) => {
  try {
    // Check database connectivity
    const { data } = await supabase.from('preview_sessions').select('id').limit(1);
    
    // Check development server
    const devServerHealth = await fetch('http://localhost:3001/').then(r => r.ok).catch(() => false);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      checks: {
        database: data !== null,
        devServer: devServerHealth,
        machineId: process.env.FLY_MACHINE_ID
      }
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});
```

#### 3.2 Session Cleanup and Monitoring
**File**: `orchestrator/src/services/cleanup-service.ts`

```typescript
export class SessionCleanupService {
  async cleanupExpiredSessions() {
    const expiredSessions = await supabase
      .from('preview_sessions')
      .select('id, container_id')
      .lt('expires_at', new Date().toISOString())
      .eq('status', 'active');
      
    for (const session of expiredSessions.data || []) {
      await this.terminateSession(session);
    }
  }
  
  async terminateSession(session: { id: string, container_id?: string }) {
    // Update session status
    await supabase.from('preview_sessions')
      .update({ status: 'ended', ended_at: new Date().toISOString() })
      .eq('id', session.id);
      
    // Terminate container if exists
    if (session.container_id) {
      await this.flyService.destroyMachine(session.container_id);
    }
  }
}
```

---

## Database Schema Considerations

### Current Schema Status
✅ **No migrations required** - existing schema supports the solution:
- `projects.template_type` (text) - for template selection
- `preview_sessions` - has all needed fields
- `project_files` - supports file storage with versioning

### Potential Future Enhancements
```sql
-- Optional: Add session lookup index for performance
CREATE INDEX IF NOT EXISTS idx_preview_sessions_lookup 
ON preview_sessions (id, status, container_id);

-- Optional: Add project files index
CREATE INDEX IF NOT EXISTS idx_project_files_project 
ON project_files (project_id, file_path);
```

---

## Testing Strategy

### Phase 1 Testing
1. **Session Creation Test**: Verify session exists in DB before container URL return
2. **Container Lookup Test**: Confirm containers can find their session records
3. **Demo Project Test**: Ensure demo project ID works correctly
4. **Error Handling Test**: Verify proper error responses for missing sessions

### Phase 2 Testing  
1. **Template System Test**: Verify different project templates create correct files
2. **File Sync Test**: Confirm containers get project files correctly
3. **Performance Test**: Check session creation latency improvements

### Regression Testing
- Verify existing sessions continue to work
- Test session cleanup and expiration
- Confirm real-time updates still function

---

## Deployment Plan

### Phase 1 Deployment (Immediate)
1. Deploy orchestrator changes with session verification
2. Deploy container changes with improved error handling
3. Monitor session success rates
4. Rollback plan: Revert to current version if issues

### Phase 2 Deployment (Follow-up)
1. Deploy template system and project file management
2. Populate demo project with files
3. Test all project template types
4. Monitor container initialization times

### Rollout Strategy
- **Blue-green deployment** for orchestrator service
- **Container image update** with backward compatibility
- **Database changes** are additive (no breaking changes)

---

## Success Metrics

### Immediate Success (Phase 1)
- ❌ → ✅ "Session not found" errors eliminated  
- ❌ → ✅ Preview containers show actual applications
- Target: 99%+ session lookup success rate

### Long-term Success (Phase 2+)
- ✅ All project types have default files
- ✅ Container initialization under 30 seconds
- ✅ Zero manual intervention for demo projects
- ✅ Proper error visibility and debugging

---

## Risk Assessment

### High Risk Items
1. **Database transaction performance** - monitor for slowdowns
2. **Container startup timing** - ensure verification doesn't block too long
3. **Existing session compatibility** - verify no breaking changes

### Mitigation Strategies
- Feature flags for new session verification logic
- Comprehensive monitoring and alerting
- Quick rollback capability
- Gradual rollout with canary testing

---

## Conclusion

This implementation plan addresses the core session synchronization issue through atomic database transactions and proper verification steps, while also solving the underlying project file management problems. The phased approach ensures we can quickly fix the immediate issue while building a more robust long-term solution.

**Priority**: Implement Phase 1 immediately to restore preview functionality.