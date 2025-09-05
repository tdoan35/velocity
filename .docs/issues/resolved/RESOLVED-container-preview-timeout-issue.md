Container Preview Timeout Issue - Technical Summary

  Problem Statement

  Container preview demo fails with 60-second timeout error:
  Preview Error: Server error: Failed to create preview session: Failed to create preview container: Error: Machine [id] did not become ready within
  60000ms

  Architecture Context

  - System: Velocity mobile app development platform
  - Container Orchestration: Fly.io Machines API (orchestrator/src/services/fly-io.ts:49)
  - Preview Containers: Custom Docker containers for real-time development (orchestrator/preview-container/)
  - Health Check: Fly.io requires /health endpoint responding within 60 seconds (orchestrator/preview-container/Dockerfile:54-55)

  Root Cause Analysis Timeline

  Issue 1: Missing Module ✅ FIXED

  - Error: Cannot find module './detect-project-type'
  - Cause: Stale GitHub Actions Docker cache
  - Fix: Modified orchestrator/preview-container/Dockerfile to invalidate cache
  - File: orchestrator/preview-container/.rebuild-trigger (created to force rebuilds)

  Issue 2: Environment Variables ✅ FIXED

  - Error: Missing PROJECT_ID, SUPABASE_URL, SUPABASE_ANON_KEY
  - Fix: Added to orchestrator/src/services/fly-io.ts:50-55
  - Memory: Increased from 256MB to 512MB (fly-io.ts:59)

  Issue 3: Development Dependencies ✅ FIXED

  - Error: Vite module not found during container startup
  - Cause: NODE_ENV=production skipped devDependencies in npm install
  - Fix: Changed to NODE_ENV=development in fly-io.ts:51

  Issue 4: Real-time Connection Blocking ✅ FIXED

  - Error: 60-second timeout during initialization
  - Cause: connectToRealtime() was blocking container startup
  - Fix: Made real-time connection non-blocking in orchestrator/preview-container/entrypoint.js:~400

  Issue 5: Express Routing ✅ FIXED

  - Error: Health endpoint /health returning 404
  - Cause: Catch-all middleware app.use('*') intercepting before app.get('/health')
  - Fix: Reordered routes in entrypoint.js:~450-480 - health endpoint before catch-all
  - Reference: Used Context7 to lookup Express.js documentation for routing precedence

  Issue 6: Missing Process Management ✅ FIXED

  - Error: Error: spawn ps ENOENT causing container crashes
  - Cause: tree-kill npm package requires ps command for graceful shutdown
  - Fix: Added procps package to orchestrator/preview-container/Dockerfile:17

  Issue 7: Health Check HTTP Status Codes ✅ INVESTIGATED

  - Investigation: Container health endpoint returned HTTP 200 even when still starting
  - Discovery: Fly.io uses `curl -f` which requires proper status codes (200=ready, 503=starting)
  - Fix Attempted: Modified entrypoint.js to return 503 when starting, 200 when ready
  - Result: Container still timed out despite fix

  Issue 8: Orchestrator Timeout Logic ✅ FINAL ROOT CAUSE IDENTIFIED

  **Root Cause Discovery**:
  Through comprehensive debug logging in orchestrator/src/services/fly-io.ts waitForMachineReady():
  - ✅ Container starts successfully in ~16-18 seconds (created → started)
  - ✅ Machine state becomes 'started' properly
  - ❌ **No health checks registered via Fly.io Machines API** (`Checks: 0`)
  - ❌ Code required health checks to exist AND pass, causing infinite timeout

  **Key Finding**: Docker HEALTHCHECK in Dockerfile ≠ Fly.io API health checks
  Fly.io machines created from containers with Dockerfile health checks don't always register those checks via the Machines API.

  **The Fix** (orchestrator/src/services/fly-io.ts:204-217):
  ```typescript
  // BEFORE - Required health checks to exist and pass
  if (machine.state === 'started' && machine.checks?.every(check => check.status === 'passing')) {
    return; // Ready
  }
  
  // AFTER - Handle machines with or without health checks
  const hasHealthChecks = machine.checks && machine.checks.length > 0;
  const allChecksPass = hasHealthChecks ? 
    machine.checks!.every(check => check.status === 'passing') : true;
    
  if (machine.state === 'started' && allChecksPass) {
    return; // Ready - works both scenarios
  }
  ```

  Current State: ✅ RESOLVED

  - Container preview demo now works successfully
  - Containers ready in ~16-20 seconds instead of 60-second timeout
  - Robust health check handling for both scenarios (with/without API health checks)
  - Debug logging retained for future troubleshooting

  Key Files Modified

  1. orchestrator/src/services/fly-io.ts:173-222 - Fixed waitForMachineReady logic with comprehensive debug logging
  2. orchestrator/preview-container/entrypoint.js:~200-250 - Improved health endpoint with proper HTTP status codes (supporting fix)

  Debug Process

  1. **Container logs analysis** - Verified containers initialized properly (18s)
  2. **Health endpoint fixes** - Implemented proper HTTP status codes (200/503/500)
  3. **Comprehensive debug logging** - Added step-by-step polling logs to identify exact failure point
  4. **Root cause discovery** - Found machines show `Checks: 0` despite Dockerfile HEALTHCHECK
  5. **Logic fix** - Modified readiness condition to handle missing health checks

  Commands Used

  - fly logs --app velocity-orchestrator - Orchestrator service logs with debug output
  - fly logs --app velocity-preview-containers - Container runtime logs  
  - Container testing: http://localhost:5173/demo/container-preview

  Critical Insight

  The final root cause was **architectural mismatch**: Docker HEALTHCHECK commands in Dockerfiles don't automatically create health checks accessible via Fly.io's Machines API. The orchestrator was waiting for API-level health checks that were never going to exist.

  **Solution**: Trust machine state ('started') as primary readiness indicator, with health checks as optional validation when they exist.