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

// Configuration from environment variables
const PROJECT_ID = process.env.PROJECT_ID;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
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
    // Add a delay to allow the database to commit the session
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Start health check server immediately
    startHealthServer();

    console.log(`🚀 Velocity Preview Container starting for project: ${PROJECT_ID}`);
    console.log(`📊 Environment: ${NODE_ENV}`);
    
    // Validate required environment variables
    if (!PROJECT_ID || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
      throw new Error('Missing required environment variables: PROJECT_ID, SUPABASE_URL, SUPABASE_ANON_KEY');
    }

    // Initialize Supabase client
    console.log('🔌 Connecting to Supabase...');
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
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
async function startDevServer() {
  try {
    // Change to project directory
    process.chdir(PROJECT_DIR);
    
    // Detect project type
    console.log('🔍 Detecting project type...');
    const projectType = await detectProjectType(PROJECT_DIR);
    console.log(`📊 Project type: ${projectType.type} (${projectType.framework})`);

    // Install dependencies if needed
    if (projectType.commands.install) {
      console.log('📦 Installing project dependencies...');
      await new Promise((resolve, reject) => {
        const installArgs = projectType.commands.install.split(' ').slice(1); // Remove 'npm'
        const installProcess = spawn('npm', installArgs, {
          stdio: 'inherit',
          cwd: PROJECT_DIR
        });

        installProcess.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`${projectType.commands.install} failed with code ${code}`));
          }
        });

        installProcess.on('error', reject);
      });
    }

    // Find available port for dev server (prefer 3001, since 8080 is used by health server)
    devServerPort = await detectPort(3001);
    console.log(`🔍 Using port ${devServerPort} for development server`);

    // Get the appropriate dev command
    const devCommand = getDevCommand(projectType, devServerPort);
    console.log(`🛠️ Starting development server: ${devCommand}`);

    // Parse command
    const commandParts = devCommand.split(' ');
    const command = commandParts[0];
    const args = commandParts.slice(1);

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

    devServerProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[DEV SERVER] ${output}`);
      }
    });

    devServerProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.error(`[DEV SERVER ERROR] ${output}`);
      }
    });

    devServerProcess.on('close', (code) => {
      console.log(`[DEV SERVER] Process exited with code ${code}`);
      devServerProcess = null;
      if (code !== 0) {
        healthStatus = 'error';
      }
    });

    devServerProcess.on('error', (error) => {
      console.error(`[DEV SERVER] Error: ${error}`);
      healthStatus = 'error';
    });

    // Wait for server to start
    const startupTimeout = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (Date.now() - startTime < startupTimeout) {
      try {
        const response = await axios.get(`http://localhost:${devServerPort}`, {
          timeout: 2000,
          validateStatus: () => true
        });
        
        if (response.status < 500) {
          console.log(`✅ Development server ready on port ${devServerPort}`);
          return;
        }
      } catch (error) {
        // Server not ready yet, continue waiting
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log(`⚠️ Development server may not be fully ready, but continuing...`);

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
  app.get('/health', (req, res) => {
    console.log(`🏥 Health check requested - Status: ${healthStatus}, Initialized: ${isInitialized}`);
    
    const healthResponse = {
      status: healthStatus,
      timestamp: new Date().toISOString(),
      projectId: PROJECT_ID,
      devServerPort: devServerPort,
      isInitialized: isInitialized,
      uptime: process.uptime(),
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

  // Session routing middleware - MUST be registered SECOND
  app.use('/session/:sessionId', async (req, res, next) => {
    const { sessionId } = req.params;
    console.log(`🎯 Session routing request for: ${sessionId}, My Project ID: ${PROJECT_ID}`);
    
    try {
      // Query Supabase to find which machine should serve this session
      const { data: session, error } = await supabase
        .from('preview_sessions')
        .select('container_id, project_id')
        .eq('id', sessionId)
        .single();

      if (error || !session) {
        console.log(`❌ Session ${sessionId} not found in database`);
        return res.status(404).json({ error: 'Session not found' });
      }

      console.log(`📋 Session ${sessionId} should be served by machine: ${session.container_id}`);
      console.log(`🤖 Current machine ID: ${process.env.FLY_MACHINE_ID || 'unknown'}`);

      // Check if this is the correct machine for this session
      const currentMachineId = process.env.FLY_MACHINE_ID;
      if (currentMachineId === session.container_id) {
        console.log(`✅ This is the correct machine for session ${sessionId}`);
        // This is the right machine, continue to proxy logic
        return next();
      } else {
        console.log(`🔀 Redirecting session ${sessionId} to correct machine: ${session.container_id}`);
        // Use fly-replay header to redirect to the correct machine
        res.setHeader('fly-replay', `instance=${session.container_id}`);
        return res.status(307).json({ 
          message: 'Redirecting to correct machine',
          targetMachine: session.container_id
        });
      }
    } catch (error) {
      console.error(`❌ Error routing session ${sessionId}:`, error);
      return res.status(500).json({ error: 'Internal routing error' });
    }
  });

  // Proxy to development server - catch-all for non-health requests  
  app.use('*', async (req, res, next) => {
    // Explicitly skip health endpoint - should never reach here due to route order
    if (req.baseUrl === '/health' || req.path === '/health') {
      return next();
    }
    
    // Proxy logic - handle directly in middleware
    if (!devServerProcess || !devServerPort) {
      return res.status(503).json({
        error: 'Development server not ready'
      });
    }

    try {
      // Handle session routing: strip /session/{sessionId} prefix
      let targetPath = req.url;
      const sessionMatch = req.url.match(/^\/session\/[^\/]+(\/.*)?$/);
      if (sessionMatch) {
        targetPath = sessionMatch[1] || '/';
        console.log(`🎯 Stripping session prefix: ${req.url} → ${targetPath}`);
      }

      const targetUrl = `http://localhost:${devServerPort}${targetPath}`;
      console.log(`🔗 Proxying to: ${targetUrl}`);

      const response = await axios({
        method: req.method,
        url: targetUrl,
        data: req.body,
        headers: {
          ...req.headers,
          host: `localhost:${devServerPort}`,
        },
        responseType: 'stream',
        validateStatus: () => true, // Don't throw on any status code
      });

      res.status(response.status);
      Object.keys(response.headers).forEach(key => {
        res.setHeader(key, response.headers[key]);
      });
      
      response.data.pipe(res);
    } catch (error) {
      console.error('Proxy error:', error);
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'Failed to proxy request to development server'
      });
    }
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