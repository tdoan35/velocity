#!/usr/bin/env node

/**
 * Velocity Preview Container Entrypoint
 * 
 * This script runs inside ephemeral Fly.io machines to provide
 * real-time development environments for Velocity projects.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { spawn } = require('child_process');
const chokidar = require('chokidar');
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const JSZip = require('jszip');
const detectPort = require('detect-port');
const kill = require('tree-kill');
const { v4: uuidv4 } = require('uuid');
const { detectProjectType, getDevCommand } = require('./detect-project-type');
const { createProxyMiddleware } = require('http-proxy-middleware');

// Configuration from environment variables
const PROJECT_ID = process.env.PROJECT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PORT = process.env.PORT || 8080;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Global state
let devServerProcess = null;
let devServerPort = null;
let supabase = null;
let realtimeChannel = null;
let isInitialized = false;
let healthStatus = 'starting';
let connectionRetryCount = 0;
let maxRetryAttempts = 5;
let reconnectTimer = null;

// Project directory where code will be synced
const PROJECT_DIR = '/app/project';

/**
 * Initialize the container
 */
async function initialize() {
  try {
    // Start health check server immediately
    startHealthServer();

    console.log(`🚀 Velocity Preview Container starting for project: ${PROJECT_ID}`);
    console.log(`📊 Environment: ${NODE_ENV}`);
    
    // Validate required environment variables
    if (!PROJECT_ID || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing required environment variables: PROJECT_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
    }

    // Initialize Supabase client
    console.log('🔌 Connecting to Supabase...');
    supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Create project directory
    await fs.ensureDir(PROJECT_DIR);
    console.log(`📁 Created project directory: ${PROJECT_DIR}`);

    // Initial file sync
    console.log('📥 Performing initial file sync...');
    await performInitialFileSync();

    // Start the development server
    console.log('🛠️ Starting development server...');
    await startDevServer();

    // Connect to real-time updates (non-blocking)
    console.log('⚡ Connecting to real-time updates...');
    connectToRealtime(); // Don't await - let it connect in background

    isInitialized = true;
    healthStatus = 'ready';
    console.log('✅ Container initialization complete!');

  } catch (error) {
    console.error('❌ Initialization failed:', error);
    healthStatus = 'error';
    process.exit(1);
  }
}

/**
 * Perform initial file sync from Supabase Storage
 */
async function performInitialFileSync() {
  try {
    // Check if there's a project bundle in Supabase Storage
    const { data: files, error } = await supabase.storage
      .from('project-files')
      .list(`${PROJECT_ID}/`, { limit: 1000 });

    if (error && error.statusCode !== 404) {
      throw error;
    }

    if (!files || files.length === 0) {
      console.log('📄 No existing files found, creating default project structure...');
      await createDefaultProject();
      return;
    }

    console.log(`📦 Found ${files.length} files, downloading...`);
    
    // Download all files
    for (const file of files) {
      if (file.name === '.emptyFolderPlaceholder') continue;
      
      const filePath = `${PROJECT_ID}/${file.name}`;
      const { data, error: downloadError } = await supabase.storage
        .from('project-files')
        .download(filePath);

      if (downloadError) {
        console.warn(`⚠️ Failed to download ${file.name}:`, downloadError);
        continue;
      }

      const localPath = path.join(PROJECT_DIR, file.name);
      await fs.ensureDir(path.dirname(localPath));
      
      const arrayBuffer = await data.arrayBuffer();
      await fs.writeFile(localPath, Buffer.from(arrayBuffer));
      
      console.log(`✅ Downloaded: ${file.name}`);
    }

    console.log('📥 Initial file sync completed');

  } catch (error) {
    console.error('❌ Initial file sync failed:', error);
    // Create default project if sync fails
    await createDefaultProject();
  }
}

/**
 * Create default project structure
 */
async function createDefaultProject() {
  console.log('🏗️ Creating default React Native project structure...');
  
  // Create basic package.json
  const packageJson = {
    name: "velocity-preview-project",
    version: "1.0.0",
    private: true,
    scripts: {
      start: "vite --host 0.0.0.0 --port 3001",
      dev: "vite --host 0.0.0.0 --port 3001 --strictPort",
      build: "vite build",
      preview: "vite preview"
    },
    dependencies: {
      "react": "^18.2.0",
      "react-dom": "^18.2.0"
    },
    devDependencies: {
      "@types/react": "^18.2.15",
      "@types/react-dom": "^18.2.7",
      "@vitejs/plugin-react": "^4.0.3",
      "vite": "^4.4.5"
    }
  };

  await fs.writeJSON(path.join(PROJECT_DIR, 'package.json'), packageJson, { spaces: 2 });

  // Create basic HTML file
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Velocity Preview</title>
</head>
<body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
</body>
</html>`;

  await fs.writeFile(path.join(PROJECT_DIR, 'index.html'), indexHtml);

  // Create src directory and main files
  await fs.ensureDir(path.join(PROJECT_DIR, 'src'));
  
  const mainJsx = `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`;

  await fs.writeFile(path.join(PROJECT_DIR, 'src/main.jsx'), mainJsx);

  const appJsx = `import React from 'react'

function App() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Welcome to Velocity Preview!</h1>
      <p>Your real-time development environment is ready.</p>
      <p>Start editing your code and see changes instantly.</p>
    </div>
  )
}

export default App`;

  await fs.writeFile(path.join(PROJECT_DIR, 'src/App.jsx'), appJsx);

  // Create Vite config
  const viteConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3001,
    strictPort: true,
    cors: true,
    hmr: {
      port: 3001,
      host: '0.0.0.0'
    },
  },
})`;

  await fs.writeFile(path.join(PROJECT_DIR, 'vite.config.js'), viteConfig);

  console.log('✅ Default project structure created');
}

/**
 * Start the development server
 */
async function checkRequiredTools() {
  const tools = ['node', 'npm'];
  const results = {};
  
  for (const tool of tools) {
    try {
      const { execSync } = require('child_process');
      const version = execSync(`${tool} --version`, { encoding: 'utf-8' }).trim();
      results[tool] = { available: true, version };
      console.log(`✅ ${tool}: ${version}`);
    } catch (error) {
      results[tool] = { available: false, error: error.message };
      console.error(`❌ ${tool} is not available: ${error.message}`);
    }
  }
  
  return results;
}

async function startDevServer() {
  try {
    // Check required tools first
    console.log('🔍 Checking required tools...');
    const toolsCheck = await checkRequiredTools();
    
    if (!toolsCheck.node.available || !toolsCheck.npm.available) {
      throw new Error('Required tools (node/npm) are not available in the container');
    }
    
    // Change to project directory
    process.chdir(PROJECT_DIR);
    
    // Detect project type
    console.log('🔍 Detecting project type...');
    const projectType = await detectProjectType(PROJECT_DIR);
    console.log(`📊 Project type: ${projectType.type} (${projectType.framework})`);

    // Install dependencies if needed
    if (projectType.commands.install) {
      console.log('📦 Installing project dependencies...');
      console.log(`📂 Installing in directory: ${PROJECT_DIR}`);
      console.log(`💻 Running command: ${projectType.commands.install}`);
      
      await new Promise((resolve, reject) => {
        const installArgs = projectType.commands.install.split(' ').slice(1); // Remove 'npm'
        const installProcess = spawn('npm', installArgs, {
          stdio: ['inherit', 'pipe', 'pipe'],
          cwd: PROJECT_DIR
        });

        let installOutput = '';
        let installErrors = '';

        installProcess.stdout?.on('data', (data) => {
          const output = data.toString();
          installOutput += output;
          console.log(`[NPM INSTALL] ${output.trim()}`);
        });

        installProcess.stderr?.on('data', (data) => {
          const error = data.toString();
          installErrors += error;
          console.error(`[NPM INSTALL ERROR] ${error.trim()}`);
        });

        installProcess.on('close', async (code) => {
          if (code === 0) {
            console.log('✅ Dependencies installed successfully');
            
            // Verify installation
            const nodeModulesExists = await fs.pathExists(path.join(PROJECT_DIR, 'node_modules'));
            const packageLockExists = await fs.pathExists(path.join(PROJECT_DIR, 'package-lock.json'));
            
            console.log(`📁 node_modules exists: ${nodeModulesExists}`);
            console.log(`📁 package-lock.json exists: ${packageLockExists}`);
            
            if (nodeModulesExists) {
              const nodeModulesContent = await fs.readdir(path.join(PROJECT_DIR, 'node_modules'));
              console.log(`📦 Installed packages: ${nodeModulesContent.length} modules`);
              
              // Check for critical packages
              const criticalPackages = ['vite', '@vitejs/plugin-react', 'react', 'react-dom'];
              for (const pkg of criticalPackages) {
                const exists = await fs.pathExists(path.join(PROJECT_DIR, 'node_modules', pkg));
                console.log(`  - ${pkg}: ${exists ? '✅' : '❌'}`);
              }
            }
            
            resolve();
          } else {
            console.error(`❌ npm install failed with code ${code}`);
            console.error(`Full error output:\n${installErrors}`);
            
            // Check if package.json exists
            const packageJsonExists = await fs.pathExists(path.join(PROJECT_DIR, 'package.json'));
            if (packageJsonExists) {
              const packageJson = await fs.readJSON(path.join(PROJECT_DIR, 'package.json'));
              console.log('📋 package.json content:', JSON.stringify(packageJson, null, 2));
            } else {
              console.error('❌ package.json does not exist!');
            }
            
            reject(new Error(`${projectType.commands.install} failed with code ${code}`));
          }
        });

        installProcess.on('error', (err) => {
          console.error(`❌ Failed to spawn npm install process: ${err.message}`);
          reject(err);
        });
      });
    }

    // Find available port for dev server (prefer 3001, since 8080 is used by health server)
    devServerPort = await detectPort(3001);
    console.log(`🔍 Using port ${devServerPort} for development server`);

    // Get the appropriate dev command
    const devCommand = getDevCommand(projectType, devServerPort);
    console.log(`🛠️ Starting development server: ${devCommand}`);
    console.log(`📂 Working directory: ${PROJECT_DIR}`);
    console.log(`🔧 Environment PORT: ${devServerPort}`);

    // Parse command
    const commandParts = devCommand.split(' ');
    const command = commandParts[0];
    const args = commandParts.slice(1);
    
    console.log(`🚀 Spawning process: ${command} ${args.join(' ')}`);

    // Start the development server
    devServerProcess = spawn(command, args, {
      stdio: 'pipe',
      cwd: PROJECT_DIR,
      env: {
        ...process.env,
        PORT: devServerPort.toString(),
        HOST: '0.0.0.0',
      }
    });

    let serverStarted = false;
    let serverOutput = '';
    let serverErrors = '';

    devServerProcess.stdout.on('data', (data) => {
      const output = data.toString();
      serverOutput += output;
      const lines = output.trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log(`[VITE] ${line}`);
          // Check for successful startup indicators
          if (line.includes('ready in') || line.includes('Local:') || line.includes('Network:')) {
            serverStarted = true;
            console.log('✅ Vite server started successfully!');
          }
        }
      });
    });

    devServerProcess.stderr.on('data', (data) => {
      const error = data.toString();
      serverErrors += error;
      const lines = error.trim().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.error(`[VITE ERROR] ${line}`);
        }
      });
    });

    devServerProcess.on('close', (code) => {
      console.log(`[VITE] Process exited with code ${code}`);
      if (!serverStarted) {
        console.error('❌ Vite server failed to start');
        console.error(`Last output:\n${serverOutput.slice(-500)}`);
        console.error(`Last errors:\n${serverErrors.slice(-500)}`);
      }
      devServerProcess = null;
      if (code !== 0) {
        healthStatus = 'error';
      }
    });

    devServerProcess.on('error', (error) => {
      console.error(`[VITE] Failed to spawn process: ${error.message}`);
      console.error(`Command was: ${command} ${args.join(' ')}`);
      console.error(`Working directory: ${PROJECT_DIR}`);
      healthStatus = 'error';
    });

    // Enhanced Vite health checking
    const checkViteHealth = async () => {
      try {
        // Check if Vite client script is accessible (most reliable indicator)
        const response = await axios.get(`http://localhost:${devServerPort}/@vite/client`, {
          timeout: 2000,
          validateStatus: () => true
        });
        
        // Vite is ready if it serves the client script with JavaScript content-type
        const contentType = response.headers['content-type'] || '';
        const isViteReady = response.status === 200 && contentType.includes('javascript');
        
        if (isViteReady) {
          console.log(`✅ Vite health check passed - @vite/client accessible`);
          return true;
        } else {
          console.log(`⏳ Vite not ready yet - status: ${response.status}, content-type: ${contentType}`);
          return false;
        }
      } catch (error) {
        console.log(`⏳ Vite health check failed: ${error.message}`);
        return false;
      }
    };

    // Wait for server to start with improved health checking
    const startupTimeout = 45000; // 45 seconds (increased for npm install + vite startup)
    const startTime = Date.now();
    let viteReady = false;
    
    console.log(`⏳ Waiting for Vite server to become ready (timeout: ${startupTimeout/1000}s)...`);
    
    while (Date.now() - startTime < startupTimeout) {
      // First check if the process is still alive
      if (!devServerProcess || devServerProcess.killed) {
        console.error('❌ Vite process died unexpectedly');
        throw new Error('Vite process terminated');
      }
      
      // Check Vite health
      viteReady = await checkViteHealth();
      if (viteReady) {
        console.log(`✅ Development server ready on port ${devServerPort} after ${Math.round((Date.now() - startTime) / 1000)}s`);
        healthStatus = 'ready';
        return;
      }
      
      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // If we get here, server didn't start properly
    if (!viteReady) {
      console.error(`❌ Vite server failed to become ready within ${startupTimeout/1000}s`);
      console.log('📋 Last server output:', serverOutput.slice(-500));
      console.log('📋 Last server errors:', serverErrors.slice(-500));
      // Don't throw error, let it continue but mark as unhealthy
      healthStatus = 'degraded';
    }

  } catch (error) {
    console.error('❌ Failed to start development server:', error);
    throw error;
  }
}

/**
 * Connect to Supabase real-time for file updates
 */
async function connectToRealtime() {
  try {
    const channelName = `realtime:project:${PROJECT_ID}`;
    
    // Clear any existing reconnect timer
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
    realtimeChannel = supabase.channel(channelName, {
      config: {
        presence: {
          key: `container-${PROJECT_ID}`,
        },
      },
    })
      .on('broadcast', { event: 'file:update' }, async (payload) => {
        console.log('📝 Received file update:', payload.payload);
        await handleFileUpdate(payload.payload);
      })
      .on('broadcast', { event: 'file:delete' }, async (payload) => {
        console.log('🗑️ Received file delete:', payload.payload);
        await handleFileDelete(payload.payload);
      })
      .on('broadcast', { event: 'file:bulk-update' }, async (payload) => {
        console.log('📦 Received bulk file update:', payload.payload);
        await handleBulkFileUpdate(payload.payload);
      })
      .subscribe((status, error) => {
        console.log(`⚡ Real-time connection status: ${status}`);
        
        switch (status) {
          case 'SUBSCRIBED':
            console.log(`✅ Successfully subscribed to channel: ${channelName}`);
            connectionRetryCount = 0; // Reset retry count on successful connection
            break;
          case 'CHANNEL_ERROR':
            console.error(`❌ Channel error:`, error);
            scheduleReconnect();
            break;
          case 'TIMED_OUT':
            console.warn('⏰ Connection timed out, attempting to reconnect...');
            scheduleReconnect();
            break;
          case 'CLOSED':
            console.warn('🔌 Connection closed, attempting to reconnect...');
            scheduleReconnect();
            break;
        }
      });

    console.log(`🔄 Attempting to connect to real-time channel: ${channelName}`);

  } catch (error) {
    console.error('❌ Failed to connect to real-time:', error);
    scheduleReconnect();
  }
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect() {
  if (connectionRetryCount >= maxRetryAttempts) {
    console.error(`❌ Max retry attempts (${maxRetryAttempts}) reached. Stopping reconnection attempts.`);
    healthStatus = 'error';
    return;
  }

  connectionRetryCount++;
  const delayMs = Math.min(1000 * Math.pow(2, connectionRetryCount), 30000); // Exponential backoff, max 30s
  
  console.log(`🔄 Scheduling reconnection attempt ${connectionRetryCount}/${maxRetryAttempts} in ${delayMs}ms...`);
  
  reconnectTimer = setTimeout(() => {
    console.log(`🔄 Reconnection attempt ${connectionRetryCount}/${maxRetryAttempts}...`);
    connectToRealtime();
  }, delayMs);
}

/**
 * Handle file update from real-time
 */
async function handleFileUpdate({ filePath, content, timestamp }) {
  try {
    const fullPath = path.join(PROJECT_DIR, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    
    // Write the file content
    await fs.writeFile(fullPath, content, 'utf8');
    
    console.log(`✅ Updated file: ${filePath} (${content.length} bytes)`);
    
    // Trigger rebuild notification if this affects build files
    if (shouldTriggerRebuild(filePath)) {
      console.log(`🔄 File change may trigger rebuild: ${filePath}`);
    }
    
  } catch (error) {
    console.error(`❌ Failed to update file ${filePath}:`, error);
    // Send error back to frontend if possible
    await notifyFileUpdateError(filePath, error.message);
  }
}

/**
 * Handle file deletion from real-time
 */
async function handleFileDelete({ filePath, timestamp }) {
  try {
    const fullPath = path.join(PROJECT_DIR, filePath);
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
      console.log(`✅ Deleted file: ${filePath}`);
      
      // Trigger rebuild notification for important files
      if (shouldTriggerRebuild(filePath)) {
        console.log(`🔄 File deletion may trigger rebuild: ${filePath}`);
      }
    } else {
      console.log(`ℹ️ File already deleted: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Failed to delete file ${filePath}:`, error);
    await notifyFileUpdateError(filePath, error.message);
  }
}

/**
 * Handle bulk file updates from real-time
 */
async function handleBulkFileUpdate({ files, timestamp }) {
  try {
    console.log(`📦 Processing bulk update of ${files.length} files...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const file of files) {
      try {
        if (file.action === 'update') {
          await handleFileUpdate({ 
            filePath: file.filePath, 
            content: file.content, 
            timestamp 
          });
          successCount++;
        } else if (file.action === 'delete') {
          await handleFileDelete({ 
            filePath: file.filePath, 
            timestamp 
          });
          successCount++;
        }
      } catch (error) {
        console.error(`❌ Failed to process file ${file.filePath}:`, error);
        errorCount++;
      }
    }
    
    console.log(`📦 Bulk update completed: ${successCount} success, ${errorCount} errors`);
    
  } catch (error) {
    console.error('❌ Failed to process bulk file update:', error);
  }
}

/**
 * Check if file change should trigger a rebuild notification
 */
function shouldTriggerRebuild(filePath) {
  const rebuildTriggers = [
    /package\.json$/,
    /tsconfig\.json$/,
    /vite\.config\.(js|ts)$/,
    /next\.config\.(js|ts)$/,
    /webpack\.config\.(js|ts)$/,
    /\.env/,
    /yarn\.lock$/,
    /package-lock\.json$/
  ];
  
  return rebuildTriggers.some(pattern => pattern.test(filePath));
}

/**
 * Notify frontend of file update errors
 */
async function notifyFileUpdateError(filePath, errorMessage) {
  try {
    if (realtimeChannel) {
      await realtimeChannel.send({
        type: 'broadcast',
        event: 'file:error',
        payload: {
          filePath,
          error: errorMessage,
          timestamp: new Date().toISOString(),
          containerId: PROJECT_ID
        }
      });
    }
  } catch (error) {
    console.error('❌ Failed to notify file update error:', error);
  }
}

/**
 * Start health check server
 */
function startHealthServer() {
  const app = express();
  
  app.use(cors());
  app.use(express.json());

  // Health check endpoint - MUST be registered FIRST
  app.get('/health', async (req, res) => {
    console.log(`🏥 Health check requested - Status: ${healthStatus}, Initialized: ${isInitialized}`);
    
    const healthChecks = {
      database: false,
      devServer: false,
      machineId: process.env.FLY_MACHINE_ID || 'unknown'
    };

    try {
      // Check database connectivity
      if (supabase) {
        const { data, error } = await supabase.from('preview_sessions').select('id').limit(1);
        healthChecks.database = !error && data !== null;
        if (error) {
          console.log(`❌ Health check: database error - ${error.message}`);
        }
      }

      // Check development server with proper Vite health check
      if (devServerPort) {
        try {
          // Check if Vite client script is accessible (same check as startup)
          const response = await axios.get(`http://localhost:${devServerPort}/@vite/client`, { 
            timeout: 2000,
            validateStatus: () => true
          });
          const contentType = response.headers['content-type'] || '';
          healthChecks.devServer = response.status === 200 && contentType.includes('javascript');
          
          if (!healthChecks.devServer) {
            console.log(`❌ Health check: Vite not serving resources correctly on port ${devServerPort} (status: ${response.status}, type: ${contentType})`);
          }
        } catch (error) {
          console.log(`❌ Health check: Vite server check failed - ${error.message}`);
          healthChecks.devServer = false;
        }
      }
      
    } catch (error) {
      console.error(`❌ Health check error:`, error);
    }

    const healthResponse = {
      status: healthStatus,
      timestamp: new Date().toISOString(),
      projectId: PROJECT_ID,
      devServerPort: devServerPort,
      isInitialized: isInitialized,
      uptime: process.uptime(),
      checks: healthChecks,
      websocket: {
        connected: realtimeChannel ? realtimeChannel.state === 'joined' : false,
        retryCount: connectionRetryCount,
        maxRetryAttempts: maxRetryAttempts,
        hasReconnectTimer: !!reconnectTimer
      }
    };

    // Return appropriate HTTP status code based on health status
    if (healthStatus === 'ready') {
      console.log('✅ Health check: returning 200 OK');
      res.status(200).json(healthResponse);
    } else if (healthStatus === 'starting') {
      console.log('⏳ Health check: returning 503 Service Unavailable (still starting)');
      res.status(503).json(healthResponse);
    } else if (healthStatus === 'error') {
      console.log('❌ Health check: returning 500 Internal Server Error');
      res.status(500).json(healthResponse);
    } else {
      console.log('⚠️ Health check: returning 503 Service Unavailable (unknown status)');
      res.status(503).json(healthResponse);
    }
  });

  // Vite status endpoint for debugging
  app.get('/vite-status', async (req, res) => {
    const status = {
      processAlive: devServerProcess && !devServerProcess.killed,
      processPid: devServerProcess?.pid,
      port: devServerPort,
      healthCheck: false,
      viteClientAccessible: false,
      timestamp: new Date().toISOString()
    };
    
    if (devServerPort) {
      try {
        // Check if Vite client is accessible
        const response = await axios.get(`http://localhost:${devServerPort}/@vite/client`, {
          timeout: 2000,
          validateStatus: () => true
        });
        const contentType = response.headers['content-type'] || '';
        status.viteClientAccessible = response.status === 200 && contentType.includes('javascript');
        status.viteResponse = {
          status: response.status,
          contentType: contentType,
          hasContent: response.data ? response.data.length > 0 : false
        };
        status.healthCheck = status.viteClientAccessible;
      } catch (error) {
        status.error = error.message;
      }
    }
    
    res.json(status);
  });

  // Diagnostic endpoint for debugging Vite server issues
  app.get('/debug/status', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    
    res.json({
      timestamp: new Date().toISOString(),
      projectId: PROJECT_ID,
      projectDir: PROJECT_DIR,
      devServerStatus: {
        process: !!devServerProcess,
        port: devServerPort,
        pid: devServerProcess?.pid,
        connected: devServerProcess?.connected,
        killed: devServerProcess?.killed,
        exitCode: devServerProcess?.exitCode
      },
      filesExist: {
        packageJson: fs.existsSync(path.join(PROJECT_DIR, 'package.json')),
        viteConfig: fs.existsSync(path.join(PROJECT_DIR, 'vite.config.js')),
        indexHtml: fs.existsSync(path.join(PROJECT_DIR, 'index.html')),
        mainJsx: fs.existsSync(path.join(PROJECT_DIR, 'src/main.jsx')),
        nodeModules: fs.existsSync(path.join(PROJECT_DIR, 'node_modules')),
        viteModule: fs.existsSync(path.join(PROJECT_DIR, 'node_modules/vite'))
      },
      environment: {
        NODE_ENV: process.env.NODE_ENV,
        PORT: process.env.PORT,
        PROJECT_ID: process.env.PROJECT_ID
      }
    });
  });

  // Diagnostic endpoint for testing proxy paths
  app.get('/debug/test-proxy', async (req, res) => {
    const axios = require('axios');
    const results = {};
    
    // Test direct Vite access
    try {
      const viteResponse = await axios.get(`http://localhost:${devServerPort || 3001}/@vite/client`, {
        timeout: 2000
      });
      results.viteDirect = {
        status: viteResponse.status,
        contentType: viteResponse.headers['content-type'],
        success: true
      };
    } catch (error) {
      results.viteDirect = {
        error: error.message,
        success: false
      };
    }
    
    // Test Express health
    try {
      const healthResponse = await axios.get(`http://localhost:8080/health`, {
        timeout: 2000
      });
      results.expressHealth = {
        status: healthResponse.status,
        success: true
      };
    } catch (error) {
      results.expressHealth = {
        error: error.message,
        success: false
      };
    }
    
    res.json(results);
  });

  // Session routing middleware - MUST be registered AFTER diagnostic endpoints
  app.use('/session/:sessionId', async (req, res, next) => {
    const { sessionId } = req.params;
    console.log(`🎯 Session routing request for: ${sessionId}, My Project ID: ${PROJECT_ID}`);
    
    try {
      // Add connection health check before session lookup
      console.log(`🔍 Performing database health check before session lookup...`);
      const { data: healthCheck, error: healthError } = await supabase
        .from('preview_sessions')
        .select('id')
        .limit(1);
        
      if (healthError) {
        console.error(`❌ Database health check failed:`, healthError);
        return res.status(503).json({ 
          error: 'Database connection failed',
          sessionId,
          timestamp: new Date().toISOString(),
          details: healthError.message || 'Database connection error'
        });
      }
      
      if (!healthCheck) {
        console.error(`❌ Database health check returned no data`);
        return res.status(503).json({ 
          error: 'Database connection failed',
          sessionId,
          timestamp: new Date().toISOString(),
          details: 'Database connection returned no data'
        });
      }
      
      console.log(`✅ Database health check passed`);
      
      // Session lookup with explicit error handling
      let session, error;
      const maxRetries = 5;
      let attempt = 0;

      while (attempt < maxRetries) {
        console.log(`🔄 Session lookup attempt ${attempt + 1}/${maxRetries} for session: ${sessionId}`);
        
        const { data, error: dbError } = await supabase
          .from('preview_sessions')
          .select('container_id, project_id, status')
          .eq('id', sessionId)
          .eq('status', 'active') // Only active sessions
          .single();

        if (dbError && dbError.code !== 'PGRST116') { // PGRST116: 'Not a single row was returned'
          // For other errors, break and handle them
          console.error(`❌ Database error during session lookup:`, dbError);
          error = dbError;
          break;
        }

        if (data) {
          console.log(`✅ Found session ${sessionId} with status: ${data.status}`);
          session = data;
          break;
        }

        attempt++;
        if (attempt < maxRetries) {
          const delay = Math.pow(2, attempt) * 100; // Exponential backoff: 200ms, 400ms, 800ms, 1600ms
          console.log(`Session not found, attempt ${attempt}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (error || !session) {
        console.log(`❌ Session ${sessionId} not found in database after ${maxRetries} attempts`);
        return res.status(404).json({ 
          error: 'Session not found',
          sessionId,
          timestamp: new Date().toISOString(),
          details: error?.message || 'Session does not exist or is not active',
          attempts: maxRetries,
          databaseConnected: true // We know DB is connected because health check passed
        });
      }

      console.log(`📋 Session ${sessionId} should be served by machine: ${session.container_id}`);
      console.log(`🤖 Current machine ID: ${process.env.FLY_MACHINE_ID || 'unknown'}`);

      // Check if this is the correct machine for this session
      const currentMachineId = process.env.FLY_MACHINE_ID;
      if (currentMachineId === session.container_id) {
        console.log(`✅ This is the correct machine for session ${sessionId}`);
        
        // Strip the session prefix from the URL before proxying
        // Convert /session/{id}/path to /path
        const originalUrl = req.url;
        req.url = req.url.replace(`/session/${sessionId}`, '') || '/';
        console.log(`🔗 URL rewrite: ${originalUrl} → ${req.url}`);
        
        // This is the right machine, continue to proxy logic
        return next();
      } else {
        console.log(`🔀 Redirecting session ${sessionId} to correct machine: ${session.container_id}`);
        // Use fly-replay header to redirect to the correct machine
        res.setHeader('fly-replay', `instance=${session.container_id}`);
        return res.status(307).json({ 
          message: 'Redirecting to correct machine',
          targetMachine: session.container_id,
          sessionId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error(`💥 Session routing error for ${sessionId}:`, error);
      return res.status(500).json({ 
        error: 'Session routing failed',
        sessionId,
        timestamp: new Date().toISOString(),
        details: error.message 
      });
    }
  });

  // Create dynamic proxy middleware that checks if dev server is ready
  const viteProxyMiddleware = (req, res, next) => {
    if (!devServerProcess || !devServerPort) {
      // If requesting an HTML page or root, serve a loading page
      if (req.accepts('html') && !req.path.includes('.')) {
        return res.status(503).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Development Server Starting...</title>
            <meta http-equiv="refresh" content="2">
            <style>
              body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
              .message { text-align: center; }
            </style>
          </head>
          <body>
            <div class="message">
              <h2>Development server is starting...</h2>
              <p>This page will automatically refresh when ready.</p>
            </div>
          </body>
          </html>
        `);
      }
      return res.status(503).json({
        error: 'Development server not ready'
      });
    }

    // Create the proxy middleware dynamically with the current port
    const proxy = createProxyMiddleware({
      target: `http://localhost:${devServerPort}`,
      changeOrigin: true,
      ws: true, // Enable WebSocket support for HMR
      logLevel: 'warn',
      onError: (err, req, res) => {
        console.error('Proxy error:', err.message);
        if (res.writeHead) {
          res.writeHead(502, {
            'Content-Type': 'text/plain'
          });
          res.end('Proxy error: ' + err.message);
        }
      },
      onProxyReq: (proxyReq, req, res) => {
        // Log the proxied request for debugging
        const targetUrl = `http://localhost:${devServerPort}${req.url}`;
        console.log(`[PROXY] ${req.method} ${req.originalUrl || req.url} -> ${targetUrl}`);
        
        // Fix headers for proper proxying
        proxyReq.removeHeader('x-forwarded-for');
        proxyReq.removeHeader('x-forwarded-host');
        proxyReq.removeHeader('x-forwarded-proto');
      },
      onProxyRes: (proxyRes, req, res) => {
        // Log successful proxy responses
        const contentType = proxyRes.headers['content-type'] || 'unknown';
        console.log(`[PROXY RESPONSE] ${req.method} ${req.url} - Status: ${proxyRes.statusCode}, Type: ${contentType}`);
      },
      // Don't verify SSL certificates (for local dev)
      secure: false,
    });

    return proxy(req, res, next);
  };

  // Apply proxy to all routes except /health
  app.use((req, res, next) => {
    if (req.path === '/health') {
      return next();
    }
    return viteProxyMiddleware(req, res, next);
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Health server listening on port ${PORT}`);
  });
}

/**
 * Graceful shutdown
 */
function gracefulShutdown() {
  console.log('🛑 Shutting down gracefully...');
  
  healthStatus = 'shutting_down';

  // Clear reconnection timer
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
    console.log('✅ Cancelled reconnection timer');
  }

  // Unsubscribe from real-time channel
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
    console.log('✅ Unsubscribed from real-time channel');
  }

  // Kill development server process
  if (devServerProcess) {
    console.log('🔌 Killing development server...');
    kill(devServerProcess.pid, 'SIGTERM', (err) => {
      if (err) {
        console.error('Error killing dev server:', err);
      } else {
        console.log('✅ Development server stopped');
      }
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
}

// Handle process signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  healthStatus = 'error';
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  healthStatus = 'error';
  gracefulShutdown();
});

// Start the container
initialize().catch((error) => {
  console.error('❌ Fatal error during initialization:', error);
  process.exit(1);
});