# Root Cause Analysis: Container Preview Session Persistence Issue

**Date**: 2025-09-05  
**Analyzed By**: Claude Code  
**Issue Type**: Session State Not Persisting Between Stop/Start Cycles  
**Severity**: Medium - Feature Design vs User Expectation Mismatch  
**Status**: Analysis Complete - Design Decision Required  

## Executive Summary

The container preview system creates a new session and container for every "Start" action, rather than reconnecting to existing sessions. This results in complete state loss between stop/start cycles, which conflicts with user expectations of persistent development sessions.

## Issue Description

### Observed Behavior
When using the container preview at `localhost:5173/demo/container-preview`:
1. **First Start**: Creates session `ccd1a725-b162-4327-bc96-8db7c813a7d4`, user interacts (counter = 2)
2. **Stop**: Ends the session
3. **Second Start**: Creates NEW session `538a334f-844c-4fe6-a445-81e2d2d589cf`, counter resets to 0
4. Each start creates a new container with fresh state

### Expected Behavior (User Perspective)
1. **First Start**: Create session and container
2. **Stop**: Pause/disconnect but maintain session
3. **Second Start**: Reconnect to same session, preserve state (counter remains 2)
4. State persists across reconnections for same project

## Technical Analysis

### Current Architecture

#### Session Creation Flow (orchestrator/src/services/container-manager.ts)
```javascript
async createSession(request: CreateSessionRequest): Promise<ContainerSession> {
    const sessionId = uuidv4();  // ALWAYS generates new ID
    // ... 
    // Creates new database record
    // Provisions new Fly.io container
    // Returns new container URL
}
```

**Key Finding**: No code exists to:
- Check for existing active sessions by project ID
- Reuse existing containers
- Implement session reconnection logic

#### Database Evidence
```sql
-- Multiple sessions for same project (550e8400-e29b-41d4-a716-446655440000):
538a334f... | active | 2025-09-05 21:46:29  -- Second start
ccd1a725... | ended  | 2025-09-05 21:44:11  -- First start (stopped)
1ecb3296... | ended  | 2025-09-05 21:43:14  -- Previous test
```

### Missing Functionality

1. **No Session Lookup Logic**
   - No `findActiveSessionByProjectId()` method
   - No `reconnectToSession()` functionality
   - No session state management between connections

2. **Stop Action Behavior**
   - Currently marks session as "ended"
   - Destroys container association
   - No "paused" or "disconnected" state

3. **Frontend Assumptions**
   - `usePreviewSession` hook always calls `/sessions/start`
   - No attempt to check for existing sessions
   - No session recovery mechanism

## Root Cause

**This is a DESIGN DECISION, not a bug.** The system is architected for:
- **Ephemeral, isolated sessions** - Each preview is independent
- **Clean slate testing** - No state contamination
- **Simple resource management** - Clear lifecycle (create → use → destroy)
- **Stateless previews** - Similar to CodeSandbox, StackBlitz models

## Impact Analysis

### Current Design Benefits
- ✅ Predictable behavior - always fresh start
- ✅ No state conflicts between sessions
- ✅ Simple resource cleanup
- ✅ Lower complexity
- ✅ Better security isolation

### Current Design Limitations
- ❌ No state persistence across reconnections
- ❌ Lost work on disconnect/stop
- ❌ Higher container creation overhead
- ❌ More Fly.io API calls
- ❌ Unexpected for development workflow

## Solution Options

### Option 1: Session Reuse (Recommended for Development Workflow)
**Implementation**: Check for and reuse existing active sessions

```javascript
async createOrReuseSession(request): Promise<ContainerSession> {
    // First, check for existing active session
    const existing = await this.findActiveSessionByProject(request.projectId);
    if (existing && !request.forceNew) {
        return this.reconnectToSession(existing);
    }
    // Otherwise create new
    return this.createSession(request);
}
```

**Pros**:
- Preserves state across reconnections
- Reduces container creation overhead
- Better development experience

**Cons**:
- Requires session lifecycle management
- Need cleanup for stale sessions
- Potential for state conflicts

### Option 2: State Persistence Layer
**Implementation**: Save/restore application state between sessions

```javascript
async stopSession(sessionId) {
    const state = await this.captureContainerState(sessionId);
    await this.saveStateToDatabase(sessionId, state);
    await this.destroyContainer(sessionId);
}

async startSession(projectId) {
    const container = await this.createContainer(projectId);
    const previousState = await this.loadStateFromDatabase(projectId);
    await this.restoreContainerState(container, previousState);
}
```

**Pros**:
- Maintains current isolation model
- State persists even across crashes
- Can implement versioning/rollback

**Cons**:
- Complex state serialization
- Storage overhead
- Synchronization challenges

### Option 3: Container Hibernation
**Implementation**: Keep containers allocated but suspended

```javascript
async pauseSession(sessionId) {
    await this.suspendContainerProcesses(sessionId);
    await this.updateSessionStatus(sessionId, 'paused');
    // Container remains allocated
}

async resumeSession(sessionId) {
    await this.resumeContainerProcesses(sessionId);
    await this.updateSessionStatus(sessionId, 'active');
}
```

**Pros**:
- Fastest reconnection
- Perfect state preservation
- No serialization needed

**Cons**:
- Higher resource costs
- Fly.io billing implications
- Complex process management

### Option 4: Hybrid Approach
**Implementation**: User choice between persistent and ephemeral sessions

```javascript
// UI provides options:
// - "Continue Previous Session" (if exists)
// - "Start Fresh Session"
// - "Auto-resume" preference setting
```

## Recommendations

### Immediate Action
1. **Document current behavior** - Update user documentation to clarify ephemeral nature
2. **Add UI indicators** - Show when creating new vs reconnecting
3. **Implement session info display** - Show session ID, creation time, state

### Short-term Solution
Implement **Option 1 (Session Reuse)** with:
- 30-minute idle timeout for auto-cleanup
- "Force new session" button for fresh starts
- Clear UI feedback about session state

### Long-term Considerations
1. **User Research**: Survey users on expected behavior
2. **Tiered Approach**: 
   - Free tier: Ephemeral sessions (current)
   - Paid tier: Persistent sessions with state
3. **Configuration**: Project-level setting for session persistence

## Implementation Plan

### Phase 1: Add Session Discovery (2 hours)
```typescript
// Add to ContainerManager
async findActiveSession(projectId: string, userId: string) {
    const { data } = await this.supabase
        .from('preview_sessions')
        .select('*')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .single();
    return data;
}
```

### Phase 2: Implement Reuse Logic (4 hours)
```typescript
// Modify session creation flow
async startSession(request) {
    if (!request.forceNew) {
        const existing = await this.findActiveSession(
            request.projectId, 
            request.userId
        );
        if (existing) {
            return this.reconnectToSession(existing);
        }
    }
    return this.createNewSession(request);
}
```

### Phase 3: Update Frontend (2 hours)
```typescript
// Add to usePreviewSession hook
const startSession = async (options = {}) => {
    const response = await makeRequest('/sessions/start', {
        method: 'POST',
        body: JSON.stringify({
            projectId,
            forceNew: options.forceNew || false,
            ...
        })
    });
}
```

### Phase 4: Add Cleanup Service (3 hours)
- Implement background job for stale session cleanup
- Add session age monitoring
- Implement grace period before destruction

## Testing Requirements

### Functional Tests
- [ ] Verify session reuse works correctly
- [ ] Test force new session option
- [ ] Validate state persistence
- [ ] Check cleanup of stale sessions

### Edge Cases
- [ ] Multiple simultaneous sessions
- [ ] Session recovery after crash
- [ ] Network interruption handling
- [ ] Container failure recovery

## Monitoring & Metrics

### Key Metrics to Track
- Session reuse rate
- Average session lifetime
- Container creation frequency
- State recovery success rate
- User preference (new vs reuse)

## Related Issues

- `.docs/issues/session-mismatch-container-issue-2025-09-05.md` - Previous session routing issue (resolved)
- `.docs/issues/iframe-cors-issue-2025-09-05.md` - CORS configuration for previews

## Conclusion

The current behavior of creating new sessions for each "Start" action is **intentional design** rather than a bug. However, it doesn't align with typical development workflow expectations where state persistence is valuable. 

Implementing session reuse (Option 1) would provide the best balance of:
- User experience (state persistence)
- Resource efficiency (fewer containers)
- Implementation complexity (moderate)
- Backward compatibility (opt-in via UI)

The decision ultimately depends on the product vision: Is Velocity targeting quick preview testing (current design) or persistent development environments (proposed change)?

---

**Next Steps**: 
1. Get stakeholder input on desired behavior
2. Decide between maintaining current design or implementing persistence
3. If proceeding with change, follow the implementation plan above

**Estimated Effort**: 11 hours for full implementation of Option 1 with testing