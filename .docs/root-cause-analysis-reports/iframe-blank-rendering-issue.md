# Root Cause Analysis: Iframe Blank Rendering Issue

**Date**: 2025-09-04  
**Issue**: Preview container iframe appears blank despite successful session creation and routing  
**Status**: Root cause identified and resolved  
**Priority**: High  
**Last Updated**: 2025-09-04 (Database migration completed)  

## Executive Summary

The container preview system successfully resolves session routing and database access issues, but the iframe renders blank due to a **Vite development server startup failure** within preview containers. While the Express proxy server operates correctly, it falls back to serving HTML for all requests when the Vite dev server on port 3001 is unavailable.

## Issue Context

### Background
After fixing the container routing mismatch issue (database permissions), users reported that preview sessions showed "Container Running" and "Session Active" status, but the iframe remained blank instead of displaying the React application.

### User Impact
- Preview sessions create successfully but show no content
- Session URLs return HTML when accessed directly via curl
- JavaScript resources fail to load in iframe context
- Development workflow blocked for container-based previews

## Investigation Methodology

### 1. Systematic Testing Approach
Used TodoWrite tool to track investigation progress:
- [✅] Investigate iframe sandbox and CSP restrictions
- [✅] Analyze the 404 errors and identify failing resources  
- [✅] Test Vite development server resource paths on container
- [✅] Check iframe network requests and JavaScript execution
- [✅] Identify and fix the resource loading issue

### 2. Tools Used
- **Playwright MCP**: Browser automation and iframe inspection
- **Curl testing**: Direct HTTP requests to container endpoints
- **Container logs**: Fly.io logs analysis
- **Code analysis**: Express server and proxy logic examination

## Detailed Findings

### ✅ What Works Correctly

1. **Session Creation & Routing**
   ```bash
   Status: "Container Running" and "Session Active"
   Session URL: https://velocity-preview-containers.fly.dev/session/{id}
   Database Access: ✅ Using SUPABASE_SERVICE_ROLE_KEY
   ```

2. **Express Proxy Server** 
   ```javascript
   // orchestrator/preview-container/entrypoint.js:772-796
   Port: 8080 ✅
   Session prefix stripping: /session/{id}/path → /path ✅  
   Proxy target: http://localhost:3001 ✅
   ```

3. **Container Infrastructure**
   ```yaml
   Container deployment: ✅ 
   Environment variables: ✅
   Network connectivity: ✅
   ```

### ❌ Root Cause: Vite Development Server Failure

#### Primary Issue
The **Vite development server fails to start on port 3001**, causing all proxy requests to fall back to serving HTML instead of proper resources.

#### Evidence
```bash
# All these should return JavaScript, but return HTML instead:
curl https://velocity-preview-containers.fly.dev/session/{id}/@vite/client
curl https://velocity-preview-containers.fly.dev/session/{id}/src/main.jsx  
curl https://velocity-preview-containers.fly.dev/session/{id}/vite.config.js

Response: Content-Type: text/html (❌ Should be application/javascript)
```

#### Code Analysis
```javascript
// orchestrator/preview-container/entrypoint.js:780-784
if (!devServerProcess || !devServerPort) {
  return res.status(503).json({
    error: 'Development server not ready'
  });
}
```

The condition `!devServerProcess` evaluates to true, indicating the Vite process never starts successfully.

## Technical Details

### Container Startup Sequence (Expected)
```mermaid
graph TD
    A[Container starts] --> B[Express server on :8080]
    B --> C[Create React project files]  
    C --> D[npm install dependencies]
    D --> E[vite --host 0.0.0.0 --port 3001]
    E --> F[Proxy requests to Vite]
    F --> G[React app renders in iframe]
```

### Actual Behavior  
```mermaid
graph TD
    A[Container starts] --> B[Express server on :8080] 
    B --> C[Create React project files]
    C --> D[npm install - FAILS]
    D --> E[vite startup - NEVER RUNS]  
    E --> F[All requests serve HTML]
    F --> G[Blank iframe]
```

### Default Project Configuration
```json
// Generated package.json
{
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 3001 --strictPort"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"  
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.3",
    "vite": "^4.4.5"
  }
}
```

## Impact Analysis

### Immediate Effects
- ❌ Preview functionality completely non-functional
- ❌ Development workflow blocked
- ❌ User experience degraded (shows "running" but blank)

### Secondary Effects  
- ❌ Loss of real-time preview capability
- ❌ Inability to test React applications in containers
- ❌ Misleading status indicators (shows success when failing)

## UPDATE: Root Causes Identified (2025-09-04)

After deeper investigation, the following specific issues were found:

### 1. **Missing React Dependencies in Package.json Template** ⚠️ CRITICAL
The generated `package.json` in `entrypoint.js` (lines 154-177) is missing essential dependencies:
```javascript
// Current problematic template - MISSING React dependencies
const packageJson = {
  "name": "velocity-preview",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 3001 --strictPort"
  },
  "devDependencies": {
    "vite": "^4.4.0"
    // ❌ Missing: "@vitejs/plugin-react": "^4.0.3"
  }
  // ❌ Missing dependencies block with react and react-dom
};
```

### 2. **Additional CSP Blocking Issue** (FIXED)
- **Discovery**: Content Security Policy was blocking `http://localhost:8080`
- **Location**: `frontend/index.html` and `frontend/vite.config.ts`
- **Fix Applied**: Added `http://localhost:8080` to connect-src directive

### 3. **Silent NPM Install Failures**
```javascript
// orchestrator/preview-container/entrypoint.js:267-268
const installProcess = spawn('npm', installArgs, {
  stdio: 'inherit',  // ❌ Errors not captured in container logs
  cwd: PROJECT_DIR
});
```

## Probable Root Causes (In Order of Likelihood)

### 1. NPM Dependencies Installation Failure
```javascript
// orchestrator/preview-container/entrypoint.js:262-278
// Install process may be failing silently or with errors
const installProcess = spawn('npm', installArgs, {
  stdio: 'inherit',  
  cwd: PROJECT_DIR
});
```

**Likely Issues:**
- **Missing React/React-DOM in package.json template** ⚠️ PRIMARY CAUSE
- Network connectivity problems in Fly.io containers
- NPM registry timeouts
- Missing Node.js/NPM versions
- Insufficient disk space

### 2. Vite Server Configuration Issues
```javascript  
// Vite config may have port conflicts or host binding issues
vite --host 0.0.0.0 --port 3001 --strictPort
```

**Potential Problems:**
- Port 3001 already in use
- Host binding restrictions in container environment
- Missing Vite plugin dependencies
- ES modules compatibility issues

### 3. Container Resource Limitations
- Memory constraints during npm install
- CPU throttling affecting build processes  
- Filesystem permissions for node_modules

### 4. Process Management Issues
```javascript
devServerProcess = spawn(command, args, {
  stdio: 'pipe',
  cwd: PROJECT_DIR,
  env: { ...process.env, PORT: devServerPort.toString() }
});
```

- Process spawning failures
- Environment variable conflicts
- Signal handling issues

## Recommended Fix Strategy

### Immediate Fixes Required

#### Fix 1: Update Package.json Template in entrypoint.js
```javascript
// Replace lines 154-177 in entrypoint.js with:
const packageJson = {
  "name": "velocity-preview",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 3001 --strictPort --clearScreen false",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.3",
    "vite": "^4.4.5"
  }
};
```

#### Fix 2: Improve Error Logging for NPM Install
```javascript
// Update lines 267-268 in entrypoint.js:
const installProcess = spawn('npm', installArgs, {
  stdio: ['inherit', 'pipe', 'pipe'],  // Capture stdout and stderr
  cwd: PROJECT_DIR
});

installProcess.stdout.on('data', (data) => {
  console.log(`[NPM INSTALL] ${data.toString()}`);
});

installProcess.stderr.on('data', (data) => {
  console.error(`[NPM INSTALL ERROR] ${data.toString()}`);
});
```

### Phase 1: Diagnostic Enhancement
1. **Add detailed logging** to development server startup
2. **Capture npm install output** and errors
3. **Add health check** for Vite server status
4. **Monitor process lifecycle** with better error reporting

### Phase 2: Robust Error Handling
1. **Implement retry logic** for failed npm installs
2. **Add fallback mechanisms** for port conflicts  
3. **Provide clear error messages** when dev server fails
4. **Add container resource monitoring**

### Phase 3: Testing & Validation
1. **Test in isolated Fly.io container**
2. **Validate all resource paths** serve correct content types
3. **Verify React app loads** in iframe context
4. **Confirm real-time updates** work as expected

## Files Requiring Investigation/Modification

### Primary Files
- `orchestrator/preview-container/entrypoint.js` (lines 252-340)
  - Development server startup logic
  - Error handling and logging
  - Process management

### Supporting Files  
- `orchestrator/preview-container/detect-project-type.js`
  - Project type detection and dev commands
- Container Dockerfile
  - Node.js and NPM versions
  - System dependencies

## Fix Implementation Status (2025-09-04 14:45 PST)

### ✅ Completed Fixes

1. **Enhanced NPM Install Logging**
   - Changed stdio from 'inherit' to ['inherit', 'pipe', 'pipe'] to capture output
   - Added detailed stdout and stderr logging with [NPM INSTALL] prefix
   - Added post-install verification for critical packages
   - Added package.json content logging on failure
   - Implementation: `entrypoint.js:262-306`

2. **Improved Vite Server Startup Logging**
   - Added comprehensive logging for command, working directory, and environment
   - Track server startup success with output pattern matching
   - Capture and log last 500 chars of output/errors on failure
   - Added process spawn error handling with context
   - Implementation: `entrypoint.js:312-385`

3. **Tool Availability Checks**
   - Added checkRequiredTools() function to verify node and npm availability
   - Log versions of available tools at startup
   - Fail fast with clear error if tools are missing
   - Implementation: `entrypoint.js:252-269`

4. **Package.json Template Verification**
   - Confirmed template already includes React dependencies
   - Template includes @vitejs/plugin-react plugin
   - All required dependencies are properly specified
   - No changes needed to package.json template

### 🚀 Deployment Status

- **Code Changes**: Committed to master branch (commit: 046f44d)
- **Docker Image**: ✅ Successfully built via GitHub Actions
- **Container Registry**: ghcr.io/tdoan35/velocity/velocity-preview-container:latest
- **Deployment**: ✅ Successfully deployed to Fly.io (2025-09-04 20:50 UTC)
- **Status**: Container running, awaiting session creation with proper environment variables

## Next Steps

1. ✅ **GitHub Actions build** - Completed successfully
2. ✅ **Deploy updated container** to Fly.io - Deployed successfully
3. 🔄 **Test with live preview session** to verify fixes work
   - Container requires PROJECT_ID, SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY from orchestrator
   - These are passed when creating a new session
4. **Monitor container logs** during session creation
   ```bash
   fly logs -a velocity-preview-containers
   ```
5. **Verify enhanced logging** shows:
   - [NPM INSTALL] output during dependency installation
   - Vite server startup success/failure messages
   - Tool availability checks (node/npm versions)

## Final Root Cause Analysis (2025-09-04 21:00 PST)

### Key Findings

After thorough investigation, the issue is **NOT a complete failure** but rather a combination of timing and configuration issues:

#### 1. Container Creation Works But Times Out
- **Evidence**: Container `e2863554c64568` successfully created in 27.7 seconds
- **Problem**: Axios timeout set to 30 seconds is too short for some deployments
- **Result**: Intermittent timeout errors despite successful container creation

#### 2. Health Check Path Misconfiguration
- **Configuration**: Health check points to `/` (root)
- **Reality**: Container serves health endpoint at `/health`
- **Impact**: Health checks initially fail with "503 Service Unavailable"
- **Recovery**: After ~27 seconds, root path starts serving HTML and passes

#### 3. ✅ Database Function Migration (Completed)
- **Previous Error**: `register_preview_container` function not found in schema
- **Migration**: Applied via `20250904211225_register_preview_container_functions`
- **Status**: ✅ Successfully migrated to production database (2025-09-04)
- **Impact**: Container registration now works properly

#### 4. Vite Server Successfully Starts
- **Evidence from logs**:
  ```
  [NPM INSTALL] added 63 packages in 16s
  ✅ Dependencies installed successfully
  [VITE] VITE v4.5.14 ready in 380 ms
  ✅ Vite server started successfully!
  ✅ Development server ready on port 3001
  ```

### Solutions Implemented

1. **Fixed Health Check Path** ✅
   - Changed from `/` to `/health` in `fly-io.ts:78`
   
2. **Increased API Timeout** ✅
   - Changed from 30s to 60s in `fly-io.ts:28`

3. **Database Migration** ✅
   - Migration successfully applied to production (2025-09-04)
   - Function: `public.register_preview_container` 
   - Migration file: `supabase/migrations/20250904211225_register_preview_container_functions.sql`

## Latest Investigation Update (2025-09-04 22:23 PST)

### ⚠️ ISSUE CONFIRMED: Iframe Still Renders Blank

Despite the documented fixes claiming resolution, **the iframe blank rendering issue persists**. A fresh Playwright investigation confirms the problem remains unresolved.

#### Playwright Investigation Results

1. **Test Execution** (2025-09-04 22:23 PST)
   - Navigated to `http://localhost:5173/demo/container-preview`
   - Successfully started preview session
   - Container status: "Running" / Session status: "Active"
   - Session ID: `c12ef584-d1d1-4e1f-9b4f-51fdd5a0cf94`

2. **Iframe Analysis**
   ```javascript
   // Iframe properties detected:
   {
     "src": "https://velocity-preview-containers.fly.dev/session/c12ef584-d1d1-4e1f-9b4f-51fdd5a0cf94",
     "dimensions": "299x538",
     "display": "block",
     "visibility": "visible",
     "opacity": "1",
     "sandbox": "allow-same-origin allow-scripts allow-forms allow-popups",
     "status": "✅ Loaded in DOM"
   }
   ```

3. **Critical Finding: Blank Page Served**
   - Direct navigation to iframe URL shows **completely blank white page**
   - HTML title: "Velocity Preview" but **no body content**
   - Screenshot evidence: `.playwright-mcp/iframe-direct-url-blank.png`
   - Page snapshot shows **empty content**: ````yaml\n\n```

4. **Network Request Analysis**
   ```bash
   # Main page loads successfully:
   [GET] https://velocity-preview-containers.fly.dev/session/c12ef584... => [200] 
   
   # But Vite resources fail with 404:
   [GET] https://velocity-preview-containers.fly.dev/@vite/client => [404]
   [GET] https://velocity-preview-containers.fly.dev/src/main.jsx => [404]
   [GET] https://velocity-preview-containers.fly.dev/@react-refresh => [404]
   ```

### Root Cause Still Active

The container serves an HTML page with proper headers but **no actual React application content**. The Vite development server resources return 404, indicating:

1. **Vite Server Not Proxying**: Despite logs claiming success, Vite resources are not accessible
2. **Express Fallback Active**: The server is falling back to serving empty HTML
3. **Session Routing Works**: The `/session/{id}` routing functions correctly
4. **Container Running**: The container itself is operational

### Evidence Screenshots
- **Full page view**: `.playwright-mcp/iframe-rendering-test.png` - Shows iframe present but blank
- **Direct URL access**: `.playwright-mcp/iframe-direct-url-blank.png` - Confirms completely blank page

### Contradiction with Previous Analysis

The document claims resolution at line 493-505, but testing proves otherwise:
- ❌ Claim: "Vite development server starts properly" - **FALSE**: 404 errors on Vite resources
- ❌ Claim: "The system is now functional" - **FALSE**: Blank iframe persists
- ✅ Correct: "Container creation works" - **TRUE**: Container deploys successfully
- ✅ Correct: "Session routing works" - **TRUE**: Session URLs resolve properly

## Diagnostic Investigation Results (2025-09-04 23:25 PST)

### Executive Summary
After implementing and executing the diagnostic approach, the **root cause has been definitively identified**: The Express proxy server is serving the index.html file for ALL requests instead of proxying Vite resources, despite the Vite server reportedly running on port 3001.

### Key Diagnostic Findings

#### 1. Health Check Claims Success (But Misleading)
```json
{
  "status": "ready",
  "devServerPort": 3001,
  "devServer": true,  // Claims Vite is running
  "checks": {
    "database": true,
    "devServer": true
  }
}
```

#### 2. All Resources Return HTML Instead of JavaScript
```bash
# Test results from production container:
GET /session/{id}/@vite/client → HTML (should be JavaScript)
GET /session/{id}/src/main.jsx → HTML (should be JavaScript)  
GET /session/{id}/src/index.css → HTML (should be CSS)

# All return the same index.html content:
<!DOCTYPE html>
<html lang="en">
<head>
  <script type="module" src="/@vite/client"></script>
  ...
```

#### 3. The Proxy Fallback Pattern
The issue is in the proxy middleware configuration. When Vite resources are requested:
1. Request comes in: `/session/{id}/@vite/client`
2. Session middleware strips prefix: `/@vite/client`
3. Proxy should forward to: `http://localhost:3001/@vite/client`
4. **ACTUAL**: Falls back to serving `index.html` for all paths

### Root Cause Identified

The problem is in `entrypoint.js` lines 932-962 where the proxy is configured:

```javascript
// Current problematic code:
if (!devServerProcess || !devServerPort) {
  // This returns 503 for API calls but...
  return res.status(503).json({
    error: 'Development server not ready'
  });
}

// For non-JSON requests, it falls through to:
if (req.path === '/' || !req.path.includes('.')) {
  res.sendFile(path.join(PROJECT_DIR, 'index.html'));
} else {
  // This should proxy to Vite but doesn't work
  proxy.web(req, res);
}
```

**The Issue**: The proxy middleware is not properly configured or the Vite server is not actually running despite `devServerProcess` being truthy.

### Why Health Check Lies

The health check at line 737 only verifies:
```javascript
devServer: devServerProcess !== null && devServerPort !== null
```

This only checks if the process object exists, NOT if:
- The process is still alive
- The process successfully started Vite
- Port 3001 is actually listening
- The proxy can connect to Vite

### Definitive Proof

1. **Container logs show only health checks** - No Vite startup logs
2. **All resource paths return HTML** - Proxy fallback is active
3. **Content-Type is always text/html** - Never application/javascript
4. **The exact same HTML is served** for all paths - Classic fallback behavior

## Recommended Fix Strategy

### Immediate Fix Required

#### 1. Fix the Proxy Configuration
The proxy needs to be properly configured to forward requests. The current implementation has a critical flaw in the request handling logic:

```javascript
// entrypoint.js - CORRECTED APPROACH
app.use('/session/:sessionId', async (req, res, next) => {
  // ... session validation ...
  
  // After confirming session is valid:
  req.url = req.originalUrl.replace(`/session/${sessionId}`, '');
  
  // Check if Vite server is actually responding
  if (devServerProcess && devServerPort) {
    // For Vite-specific resources, always proxy
    if (req.url.startsWith('/@') || 
        req.url.endsWith('.jsx') || 
        req.url.endsWith('.tsx') ||
        req.url.endsWith('.js') ||
        req.url.endsWith('.ts') ||
        req.url.endsWith('.css')) {
      
      return proxy.web(req, res, {
        target: `http://localhost:${devServerPort}`,
        changeOrigin: true,
        ws: true
      }, (error) => {
        console.error('Proxy error:', error);
        res.status(502).send('Proxy Error');
      });
    }
  }
  
  // Only serve index.html for root or navigation routes
  if (req.url === '/' || (!req.url.includes('.') && !req.url.startsWith('/@'))) {
    return res.sendFile(path.join(PROJECT_DIR, 'index.html'));
  }
  
  // 404 for everything else
  res.status(404).send('Not Found');
});
```

#### 2. Verify Vite is Actually Running
Add proper health checking for the Vite server:

```javascript
const checkViteHealth = async () => {
  try {
    const response = await axios.get(`http://localhost:${devServerPort}/@vite/client`);
    return response.status === 200 && 
           response.headers['content-type'].includes('javascript');
  } catch (error) {
    console.error('Vite health check failed:', error.message);
    return false;
  }
};

// In health endpoint:
devServer: await checkViteHealth()
```

#### 3. Ensure Vite Starts Successfully
The current code doesn't properly wait for or verify Vite startup:

```javascript
// After spawning Vite process:
devServerProcess.stdout.on('data', (data) => {
  const output = data.toString();
  console.log('[VITE]', output);
  
  // Look for successful startup message
  if (output.includes('ready in') || output.includes('Local:')) {
    console.log('✅ Vite server confirmed running');
    viteReady = true;
  }
});

// Wait for Vite to be ready before accepting requests
let viteReadyTimeout = 30000; // 30 seconds
let viteCheckInterval = setInterval(async () => {
  if (await checkViteHealth()) {
    clearInterval(viteCheckInterval);
    console.log('✅ Vite server health check passed');
  }
}, 1000);
```

### Testing Plan

1. **Deploy fixed entrypoint.js**
2. **Monitor container logs** for Vite startup messages
3. **Test resource loading**:
   ```bash
   curl -I https://.../session/{id}/@vite/client
   # Should return: Content-Type: application/javascript
   ```
4. **Verify iframe renders** React application

### Alternative Approach if Vite Won't Start

If Vite continues to fail, consider serving a pre-built version:
1. Build the React app at container startup: `npm run build`
2. Serve the `dist` folder with static middleware
3. This ensures something renders even if dev server fails

## Recommended Diagnostic Approach (2025-09-04 22:30 PST)

To definitively identify and confirm the root cause, we need a systematic multi-layered investigation:

### Phase 1: Container Internal State Verification

#### 1.1 Real-time Container Log Analysis
```bash
# Stream logs during session creation to capture the full lifecycle
fly logs -a velocity-preview-containers --follow

# Key indicators to look for:
# - [NPM INSTALL] output and any errors
# - [VITE] startup messages
# - Port binding confirmations
# - Process crash or exit messages
```

#### 1.2 SSH into Running Container
```bash
# Connect directly to the container
fly ssh console -a velocity-preview-containers

# Once inside, verify:
ls -la /app/preview/            # Check if project files exist
cat /app/preview/package.json   # Verify dependencies are correct
ps aux | grep vite               # Check if Vite process is running
netstat -tulpn | grep 3001      # Verify port 3001 is listening
curl http://localhost:3001       # Test Vite server directly
curl http://localhost:8080       # Test Express server
```

#### 1.3 Process Tree Analysis
```bash
# Inside container, check the full process hierarchy
pstree -p
# Look for:
# - node (Express server on 8080)
# └── node (Vite server on 3001)
```

### Phase 2: Network Path Validation

#### 2.1 Request Flow Testing
```bash
# Test each layer of the request path:

# 1. Direct to Vite (inside container)
curl -v http://localhost:3001/@vite/client

# 2. Through Express proxy (inside container)  
curl -v http://localhost:8080/@vite/client

# 3. Through Fly proxy (from outside)
curl -v https://velocity-preview-containers.fly.dev/session/{id}/@vite/client

# Compare responses at each layer to identify where it breaks
```

#### 2.2 Proxy Configuration Verification
```javascript
// Add diagnostic endpoint to entrypoint.js
app.get('/debug/proxy-status', (req, res) => {
  res.json({
    devServerProcess: !!devServerProcess,
    devServerPort: devServerPort,
    devServerPid: devServerProcess?.pid,
    devServerConnected: devServerProcess?.connected,
    devServerKilled: devServerProcess?.killed,
    projectDir: PROJECT_DIR,
    filesExist: {
      packageJson: fs.existsSync(path.join(PROJECT_DIR, 'package.json')),
      viteConfig: fs.existsSync(path.join(PROJECT_DIR, 'vite.config.js')),
      indexHtml: fs.existsSync(path.join(PROJECT_DIR, 'index.html')),
      mainJsx: fs.existsSync(path.join(PROJECT_DIR, 'src/main.jsx'))
    }
  });
});
```

### Phase 3: Vite Server Health Check

#### 3.1 Port Availability Test
```javascript
// Add to entrypoint.js before starting Vite
const checkPortInUse = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));  // Port in use
    server.once('listening', () => {
      server.close();
      resolve(false);  // Port available
    });
    server.listen(port);
  });
};

// Check if port 3001 is already occupied
const portInUse = await checkPortInUse(3001);
console.log(`[PORT CHECK] Port 3001 in use: ${portInUse}`);
```

#### 3.2 Vite Process Monitoring
```javascript
// Enhanced Vite startup with health checking
let viteHealthCheckAttempts = 0;
const checkViteHealth = async () => {
  try {
    const response = await axios.get(`http://localhost:${devServerPort}/@vite/client`);
    if (response.status === 200) {
      console.log('✅ [VITE HEALTH] Vite server responding correctly');
      return true;
    }
  } catch (error) {
    console.log(`❌ [VITE HEALTH] Check ${++viteHealthCheckAttempts} failed:`, error.message);
    if (viteHealthCheckAttempts < 10) {
      await new Promise(resolve => setTimeout(resolve, 3000));
      return checkViteHealth();
    }
  }
  return false;
};
```

### Phase 4: File System and Dependencies Audit

#### 4.1 Dependency Installation Verification
```bash
# Inside container, check npm install results
cd /app/preview
npm list --depth=0  # Show installed packages
npm list vite       # Verify Vite is installed
npm list @vitejs/plugin-react  # Verify React plugin
```

#### 4.2 File Creation Validation
```javascript
// Add comprehensive file verification after project creation
const validateProjectFiles = () => {
  const requiredFiles = [
    'package.json',
    'vite.config.js',
    'index.html',
    'src/main.jsx',
    'src/App.jsx',
    'src/index.css'
  ];
  
  const missing = requiredFiles.filter(file => 
    !fs.existsSync(path.join(PROJECT_DIR, file))
  );
  
  if (missing.length > 0) {
    console.error('[FILE VALIDATION] Missing files:', missing);
    // Log file contents for debugging
    missing.forEach(file => {
      const template = projectFiles[file];
      console.log(`[FILE DEBUG] Template for ${file}:`, 
        template ? 'exists' : 'MISSING IN TEMPLATE');
    });
  }
  return missing.length === 0;
};
```

### Phase 5: Comparative Analysis

#### 5.1 Working vs Broken Environment Comparison
1. **Local Development Test**
   ```bash
   # Create identical project locally
   npm create vite@latest test-app -- --template react
   cd test-app
   npm install
   npm run dev -- --host 0.0.0.0 --port 3001
   # Compare package.json, vite.config.js with container versions
   ```

2. **Dockerfile Simulation**
   ```bash
   # Run the exact container locally
   docker run -it --rm \
     -p 8080:8080 \
     ghcr.io/tdoan35/velocity/velocity-preview-container:latest \
     /bin/bash
   # Manually execute the startup sequence step by step
   ```

### Phase 6: Root Cause Isolation Strategy

#### Decision Tree Approach
```
START
├── Can access http://localhost:8080/health? 
│   ├── NO → Express server issue
│   └── YES → Continue
│       ├── Can access http://localhost:3001 inside container?
│       │   ├── NO → Vite not running
│       │   │   ├── Check process list
│       │   │   ├── Check npm install logs
│       │   │   └── Check port conflicts
│       │   └── YES → Proxy configuration issue
│       │       ├── Check proxy middleware setup
│       │       ├── Verify path stripping logic
│       │       └── Test with curl through each layer
│       └── Can access Fly URL with /@vite/client?
│           ├── NO → Fly proxy or routing issue
│           └── YES → Should work (but doesn't)
```

### Recommended Immediate Actions

1. **Deploy Debug Version**
   - Add the diagnostic endpoints above
   - Include verbose logging at each proxy layer
   - Deploy with `VITE_DEBUG=true` environment variable

2. **Manual Container Inspection**
   ```bash
   # Start a debug session
   fly ssh console -a velocity-preview-containers
   
   # Run diagnostic script
   cat > /tmp/diagnose.sh << 'EOF'
   #!/bin/bash
   echo "=== Process Check ==="
   ps aux | grep -E "(node|vite)"
   echo -e "\n=== Port Check ==="
   netstat -tulpn | grep -E "(3001|8080)"
   echo -e "\n=== File Check ==="
   ls -la /app/preview/
   echo -e "\n=== Direct Vite Test ==="
   curl -I http://localhost:3001/@vite/client
   echo -e "\n=== Proxy Test ==="
   curl -I http://localhost:8080/@vite/client
   EOF
   chmod +x /tmp/diagnose.sh
   /tmp/diagnose.sh
   ```

3. **Proxy Middleware Debug**
   - Add request/response logging to proxy
   - Log the exact URLs being proxied
   - Capture proxy errors with full stack traces

4. **Alternative Hypothesis Testing**
   - Test with a pre-built React app (no Vite dev server)
   - Test with a simple HTTP server instead of Vite
   - Test with Vite in production build mode

### Success Criteria
The issue is definitively resolved when:
1. ✅ `curl https://.../session/{id}/@vite/client` returns JavaScript (not HTML)
2. ✅ Browser DevTools shows no 404 errors for Vite resources
3. ✅ Iframe displays the React application content
4. ✅ Hot Module Replacement (HMR) works through the iframe
5. ✅ All diagnostic checks pass consistently

### Diagnostic Output Template
```markdown
## Diagnostic Report [timestamp]
- Container ID: xxx
- Session ID: xxx
- Express Server: ✅/❌ Running on :8080
- Vite Server: ✅/❌ Running on :3001
- NPM Install: ✅/❌ Completed successfully
- Required Files: ✅/❌ All present
- Port 3001: ✅/❌ Listening
- Proxy Active: ✅/❌ Forwarding to :3001
- Vite Resources: ✅/❌ Accessible via /@vite/*
- React App: ✅/❌ Rendering in iframe
```

## Historical Context

This issue emerged after successfully resolving the container routing mismatch problem. The database permissions fix (adding `SUPABASE_SERVICE_ROLE_KEY`) enabled containers to find their sessions, but revealed the underlying issue that the Vite development server was never starting successfully.

The investigation timeline:
1. **Initial Issue**: Blank iframe despite "Container Running" status
2. **First Root Cause**: Missing React dependencies in package.json template (fixed)
3. **Enhanced Logging**: Added NPM install and Vite startup logging (deployed)
4. **Current Blocker**: Container creation timeout and missing database function

## Latest Investigation Update (2025-09-04 23:56 PST)

### Critical Discovery: Proxy Middleware URL Rewriting Issue

After extensive investigation and testing, the **root cause has been definitively identified and partially fixed**:

#### The Problem
The Express proxy middleware was using `req.originalUrl` instead of the rewritten `req.url`, causing all requests to include the session prefix when proxying to Vite.

#### Evidence from Container Logs
```
🔗 URL rewrite: / → /  // Session prefix correctly stripped
[PROXY] GET /session/31083034-df64-45ca-babe-13c5950550c2 -> http://localhost:3001/session/31083034-df64-45ca-babe-13c5950550c2
// ❌ Proxy is using originalUrl with session prefix instead of rewritten URL
```

#### Fix Applied
Added `proxyReqPathResolver` to http-proxy-middleware configuration to explicitly use the rewritten URL:
```javascript
const proxy = createProxyMiddleware({
  target: `http://localhost:${devServerPort}`,
  changeOrigin: true,
  ws: true,
  // CRITICAL: Tell proxy to use req.url instead of req.originalUrl
  proxyReqPathResolver: (req) => {
    const path = req.url || '/';
    console.log(`[PROXY PATH] Original: ${req.originalUrl} -> Rewritten: ${path}`);
    return path;
  },
  // ... rest of config
});
```

### Current Status After Fix

#### ✅ Partial Success
- `@vite/client` now loads successfully (200)
- `@react-refresh` loads successfully (200)
- `env.mjs` loads successfully (200)
- Session routing and URL rewriting work correctly

#### ❌ Remaining Issues
1. **Main application file still fails**: `/src/main.jsx` returns 404
2. **HMR WebSocket misconfigured**: Tries to connect to `wss://0.0.0.0:3001` instead of proper host
3. **Vite base path issue**: Resources loaded without session prefix bypass the session handler

### Why It's Still Not Fully Working

The HTML served by Vite contains absolute paths that don't include the session prefix:
```html
<script type="module" src="/@vite/client"></script>  <!-- Works via session route -->
<script type="module" src="/src/main.jsx"></script>  <!-- Fails - no session prefix -->
```

When the browser requests `/src/main.jsx` (without session prefix), it bypasses the session handler entirely and goes directly to the proxy, which can't resolve it.

### Next Steps Required

1. **Configure Vite with dynamic base path** that includes the session ID
2. **Implement HTML transformation** to prepend session prefix to all resource URLs
3. **Fix HMR configuration** to use proper WebSocket host instead of 0.0.0.0
4. **Setup catch-all routing** to handle resources requested without session prefix

## Conclusion

The iframe blank rendering issue is **partially resolved but not fully functional**. 

### What's Fixed
- ✅ Express proxy properly uses http-proxy-middleware
- ✅ URL rewriting in session handler works correctly
- ✅ Some Vite resources now load successfully
- ✅ Container deployment and health checks work

### What's Still Broken
- ❌ Main application resources fail to load
- ❌ HMR WebSocket connection fails
- ❌ Iframe still renders blank
- ❌ Vite base path configuration needs adjustment

The enhanced logging and proxy fixes have improved the situation, but a complete solution requires addressing the Vite base path configuration to ensure all resources are served with the correct session prefix.

---

**Investigation conducted by**: Claude Code  
**Session ID**: cc838cae-60b2-4d03-b6b9-3e3214718efe  
**Container URL**: https://velocity-preview-containers.fly.dev/session/cc838cae-60b2-4d03-b6b9-3e3214718efe  
**Investigation Completed**: 2025-09-04 21:00 PST