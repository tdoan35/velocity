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

  Current State: STILL FAILING

  Despite all fixes, container still times out after 60 seconds. Latest Fly.io logs show:
  - ✅ Container initializes successfully
  - ✅ Development server starts on port 3000
  - ✅ Health server starts on port 8080
  - ❌ Still fails health checks within 60-second window

  Key Files for Investigation

  1. orchestrator/preview-container/entrypoint.js - Main container logic, health endpoint, real-time connection
  2. orchestrator/src/services/fly-io.ts - Container creation, environment variables, memory allocation
  3. orchestrator/preview-container/Dockerfile - Container build, system dependencies, health check configuration
  4. orchestrator/fly.toml - Fly.io app configuration for orchestrator service

  Next Investigation Areas

  1. Health Check Validation: Test /health endpoint directly from within container
  2. Network Connectivity: Verify port 8080 accessibility from Fly.io health checker
  3. Timing Analysis: Measure actual startup time vs 60-second limit
  4. Real-time Connection: Check if Supabase connection issues are still affecting health status
  5. Container Resources: Monitor if 512MB memory is sufficient during startup

  Commands Used

  - fly logs --app velocity-preview-containers - Container runtime logs
  - task-master list - Track development tasks
  - Container testing: http://localhost:5173/demo/container-preview

  Critical Insight

  User feedback emphasized fixing root causes rather than workarounds: "No, let's fix why Github Actions is missing the current build" - this approach        
  should continue for the remaining timeout issue.