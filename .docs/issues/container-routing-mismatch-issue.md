# Container Routing Mismatch Issue

## Executive Summary

**CRITICAL DISCOVERY**: The preview container session lookup issue is **NOT** a database timing problem as previously documented. The root cause is a **container routing mismatch** where sessions are being routed to incorrect Fly.io machines.

**Status**: **ACTIVE BUG** - Confirmed via live reproduction on 2025-09-04  
**Severity**: **HIGH** - Complete preview functionality failure  
**Previous Diagnosis**: **INCORRECT** - Database synchronization timing issue  
**Actual Root Cause**: **Container ID mismatch between session record and handling container**

---

## Issue Reproduction Results (2025-09-04 03:03-03:04 UTC)

### Test Environment
- **URL**: http://localhost:5173/demo/container-preview
- **Project ID**: 550e8400-e29b-41d4-a716-446655440000
- **Generated Session**: 807efe44-d63e-4a24-88f5-dbe96112830a
- **Session URL**: https://velocity-preview-containers.fly.dev/session/807efe44-d63e-4a24-88f5-dbe96112830a

### Observed Error
```json
{
  "error": "Session not found",
  "sessionId": "807efe44-d63e-4a24-88f5-dbe96112830a",
  "timestamp": "2025-09-04T03:04:22.366Z", 
  "details": "Session does not exist or is not active",
  "attempts": 5,
  "databaseConnected": true
}
```

---

## Root Cause Analysis

### Database Investigation Results

**Session Record Query**:
```sql
SELECT * FROM preview_sessions WHERE id = '807efe44-d63e-4a24-88f5-dbe96112830a';
```

**CRITICAL FINDING**: **The session record EXISTS and is ACTIVE**

```json
{
  "id": "807efe44-d63e-4a24-88f5-dbe96112830a",
  "user_id": "98358dd4-039d-4115-adee-188b1d010a9d", 
  "project_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "807efe44-d63e-4a24-88f5-dbe96112830a",
  "container_url": "https://velocity-preview-containers.fly.dev/session/807efe44-d63e-4a24-88f5-dbe96112830a",
  "status": "active",                    // ✅ ACTIVE STATUS
  "expires_at": "2025-09-04 05:03:51.837+00",
  "created_at": "2025-09-04 03:03:51.909618+00",
  "ended_at": null,
  "container_id": "e2863555a91708",      // ⚠️ ASSIGNED CONTAINER ID
  "updated_at": "2025-09-04 03:04:17.419525+00",
  "resource_limits": {"cpu_cores": 1, "memory_mb": 256, "max_duration_hours": 2},
  "tier": "free"
}
```

### Container Routing Analysis

**Expected Container**: `e2863555a91708` (from session record)  
**Actual Handling Container**: `56837ddda10348` (from Fly.io logs)

**Container Mismatch Confirmed**:
- The session was assigned to container `e2863555a91708`
- The request is being handled by container `56837ddda10348` 
- Container `56837ddda10348` correctly cannot find the session (it's not assigned to this machine)

---

## Revised Root Cause

### ❌ **Previous Incorrect Diagnosis**
- Database synchronization timing issue
- Race condition between orchestrator and container
- Session creation/commit delays

### ✅ **Actual Root Cause: Container Routing Failure**

**The issue is in the Fly.io machine routing/assignment logic:**

1. **Session Creation**: Orchestrator creates session and assigns it to container `e2863555a91708`
2. **Container Creation**: New container `e2863555a91708` should be created/started
3. **Routing Failure**: Requests to the session URL are being routed to existing container `56837ddda10348` instead
4. **Lookup Failure**: Container `56837ddda10348` correctly reports "session not found" because it's not assigned to handle this session

---

## Technical Analysis

### Container Assignment Logic Issues

The problem lies in one of these areas:

#### 1. **Container Creation Failure**
- Container `e2863555a91708` may not have started successfully
- Fly.io falls back to routing to existing healthy container `56837ddda10348`
- No error surfaced to orchestrator about failed container creation

#### 2. **Load Balancer Routing Issue**  
- Both containers exist but Fly.io load balancer routes incorrectly
- Session-specific routing `/session/{sessionId}` not working as designed
- `fly-replay` headers not being honored properly

#### 3. **Session Routing Middleware Issue**
- Container `56837ddda10348` should detect the session belongs to different machine
- Should respond with `fly-replay` header: `instance=e2863555a91708`
- Client should be redirected automatically to correct container

### Expected vs Actual Flow

**Expected Flow**:
```
1. Client → https://velocity-preview-containers.fly.dev/session/{sessionId}
2. Fly.io → Routes to container e2863555a91708 (session owner)  
3. Container e2863555a91708 → Serves session content
```

**Actual Flow**:
```  
1. Client → https://velocity-preview-containers.fly.dev/session/{sessionId}
2. Fly.io → Routes to container 56837ddda10348 (wrong container)
3. Container 56837ddda10348 → "Session not found" (correctly, it's not this container's session)
```

---

## Container Logs Analysis

From Fly.io logs (`fly logs -a velocity-preview-containers`):

**Existing Container Activity**: `56837ddda10348`
- Running continuously with regular health check proxying
- Handling session routing requests  
- Correctly reporting sessions not found (they belong to other containers)

**Missing Container Activity**: `e2863555a91708`  
- **No logs visible for container e2863555a91708**
- Container may not have started successfully
- Or container started but logs not visible in current stream

---

## Impact Assessment

### User Experience
- ❌ **Preview functionality completely broken**
- ❌ **Users see JSON error instead of preview applications** 
- ❌ **No error recovery or retry mechanism for end users**

### System Reliability  
- ❌ **Container orchestration failing**
- ❌ **Session assignment logic unreliable**
- ❌ **No monitoring/alerting for container routing failures**

### Development Impact
- ❌ **Demo functionality non-functional**
- ❌ **Unable to test preview features**
- ❌ **Misleading error messages hiding actual issue**

---

## Diagnostic Steps for Resolution

### 1. Container Status Investigation
- Check if container `e2863555a91708` exists in Fly.io
- Verify container health and startup status
- Review container creation logs from orchestrator

### 2. Fly.io Routing Configuration
- Verify Fly.io app routing configuration
- Test session-specific URL routing logic
- Check if `fly-replay` headers are working

### 3. Session Assignment Logic  
- Review orchestrator container creation flow
- Verify session-to-container assignment logic
- Test container ID consistency between orchestrator and database

### 4. Container Routing Middleware
- Test session routing middleware on both containers
- Verify `fly-replay` header generation
- Check container self-identification logic

---

## Immediate Actions Required

### Priority 1: Container Investigation
1. **Check container e2863555a91708 status**:
   ```bash
   fly status -a velocity-preview-containers
   fly machine status e2863555a91708 -a velocity-preview-containers
   ```

2. **Review container creation in orchestrator logs**:
   - Check if container creation succeeded
   - Verify session-to-container assignment logic

### Priority 2: Routing Validation
1. **Test session routing manually**:
   ```bash
   curl -v https://velocity-preview-containers.fly.dev/session/807efe44-d63e-4a24-88f5-dbe96112830a
   ```

2. **Verify fly-replay headers**:
   - Check if wrong container returns proper redirect headers
   - Test if redirect actually routes to correct container

### Priority 3: Monitoring Implementation
1. **Add container creation monitoring**
2. **Implement session routing health checks**  
3. **Add alerting for container assignment failures**

---

## Historical Context

### Previous Implementation Efforts (September 2025)
The extensive implementation documented in `fix-preview-container-session-lookup.md` was based on the incorrect assumption of database timing issues. While the implemented fixes (enhanced error handling, retry logic, session verification) are valuable, they don't address the actual container routing problem.

**Implemented but Irrelevant Fixes**:
- ✅ Enhanced session creation with verification
- ✅ Improved error handling with retry logic  
- ✅ Database connectivity validation
- ✅ Session cleanup services
- ✅ Template system for project files

**Still Needed**:
- ❌ Container routing reliability  
- ❌ Session-to-container assignment validation
- ❌ Container creation monitoring
- ❌ Fly.io routing configuration verification

---

## Conclusion

This investigation reveals that the preview container system's core infrastructure (database, session creation, container applications) is working correctly. The failure occurs in the **container orchestration and routing layer**, where sessions are not being properly routed to their assigned containers.

The previous diagnosis of database timing issues was incorrect, and the implemented fixes, while improving system robustness, do not resolve the actual problem. The focus should shift to **container creation reliability** and **Fly.io routing configuration** to restore preview functionality.

**Next Steps**: Investigate container `e2863555a91708` status and implement proper container routing validation to ensure sessions reach their assigned containers.