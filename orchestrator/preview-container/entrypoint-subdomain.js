#!/usr/bin/env node

/**
 * Velocity Preview Container Entrypoint - Subdomain Version
 * 
 * Simplified version for subdomain-based routing.
 * No path rewriting needed - everything works naturally!
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const JSZip = require('jszip');

// Configuration
const PORT = 8080;
const VITE_PORT = 3001;
const PROJECT_DIR = '/app/project';

// Environment variables
const SESSION_ID = process.env.SESSION_ID;
const PROJECT_ID = process.env.PROJECT_ID;
const PREVIEW_DOMAIN = process.env.PREVIEW_DOMAIN;
const USE_SUBDOMAIN = process.env.USE_SUBDOMAIN === 'true';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SNAPSHOT_URL = process.env.SNAPSHOT_URL;
const REALTIME_TOKEN = process.env.REALTIME_TOKEN;

// Global state
let viteProcess = null;
let supabase = null;
let viteReady = false;
let realtimeChannel = null;
let connectionRetryCount = 0;
const maxRetryAttempts = 5;
let reconnectTimer = null;

// Express app
const app = express();

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    sessionId: SESSION_ID,
    projectId: PROJECT_ID,
    domain: PREVIEW_DOMAIN,
    vite: viteReady ? 'running' : 'starting',
    subdomain: USE_SUBDOMAIN
  });
});

/**
 * Session validation middleware
 * If the request is for a different session, use fly-replay to redirect
 * to the correct Fly.io machine instead of returning a 404.
 */
app.use(async (req, res, next) => {
  // Skip validation for health checks
  if (req.path === '/health') {
    return next();
  }

  // Flexible session validation that works for both subdomain and path-based access
  if (USE_SUBDOMAIN) {
    const requestHost = req.get('host');
    const requestPath = req.path;

    // For subdomain mode, check if host contains session ID OR path contains session ID (for transition period)
    const isValidSubdomain = requestHost && requestHost.includes(SESSION_ID);
    const isValidPath = requestPath && requestPath.includes(SESSION_ID);

    if (!isValidSubdomain && !isValidPath) {
      // Extract the session ID from the subdomain (e.g., "abc123.preview.velocity-dev.com" -> "abc123")
      const requestedSessionId = requestHost ? requestHost.split('.')[0] : null;

      if (requestedSessionId && supabase) {
        try {
          // Look up the correct container for this session
          const { data: session, error } = await supabase
            .from('preview_sessions')
            .select('container_id')
            .eq('id', requestedSessionId)
            .eq('status', 'active')
            .single();

          if (!error && session && session.container_id) {
            console.log(`🔀 Replaying request to correct machine: ${session.container_id} (session: ${requestedSessionId})`);
            res.setHeader('fly-replay', `instance=${session.container_id}`);
            return res.status(307).send();
          }
        } catch (err) {
          console.error('❌ Failed to look up session for replay:', err.message);
        }
      }

      console.warn(`Invalid session request: host="${requestHost}", path="${requestPath}", expected session="${SESSION_ID}"`);
      return res.status(404).json({
        error: 'Invalid session',
        expected: SESSION_ID,
        received: {
          host: requestHost,
          path: requestPath
        }
      });
    }

    // Log access type for debugging
    if (isValidSubdomain) {
      console.log(`✅ Subdomain access: ${requestHost}`);
    } else if (isValidPath) {
      console.log(`🔄 Path-based access (transition): ${requestPath}`);
    }
  }

  next();
});

/**
 * Direct proxy to Vite - no path manipulation needed!
 */
const proxy = createProxyMiddleware({
  target: `http://localhost:${VITE_PORT}`,
  changeOrigin: true,
  ws: true, // WebSocket support works naturally with subdomains
  logLevel: 'debug',
  
  // Simple error handling
  onError: (err, req, res) => {
    console.error('[PROXY ERROR]', err);
    
    // If Vite is not ready, show a loading page
    if (!viteReady) {
      res.status(503).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Loading...</title>
          <meta http-equiv="refresh" content="2">
          <style>
            body { 
              font-family: system-ui; 
              display: flex; 
              align-items: center; 
              justify-content: center; 
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container { text-align: center; }
            .spinner {
              border: 3px solid rgba(255,255,255,0.3);
              border-radius: 50%;
              border-top: 3px solid white;
              width: 40px;
              height: 40px;
              animation: spin 1s linear infinite;
              margin: 0 auto 20px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="spinner"></div>
            <h2>Starting development server...</h2>
            <p>Your preview will be ready in a moment</p>
          </div>
        </body>
        </html>
      `);
    } else {
      res.status(502).json({
        error: 'Development server error',
        details: err.message
      });
    }
  },

  // Log proxy requests for debugging
  onProxyReq: (proxyReq, req, res) => {
    console.log(`[PROXY] ${req.method} ${req.url} -> ${proxyReq.path}`);
  },

  // Handle WebSocket upgrade
  onProxyReqWs: (proxyReq, req, socket, options, head) => {
    console.log(`[PROXY WS] WebSocket connection: ${req.url}`);
  }
});

// Use proxy for all non-health requests
app.use((req, res, next) => {
  if (req.path === '/health') {
    return next();
  }
  proxy(req, res, next);
});

/**
 * Initialize Supabase client
 */
async function initSupabase() {
  console.log('🔌 Connecting to Supabase...');

  const useSnapshotHydration = !!SNAPSHOT_URL;
  let supabaseKey;

  if (useSnapshotHydration && REALTIME_TOKEN) {
    try {
      const tokenData = JSON.parse(Buffer.from(REALTIME_TOKEN, 'base64').toString());
      supabaseKey = tokenData.token;
      console.log('✅ Using scoped realtime token for project:', tokenData.scope);
    } catch (error) {
      console.warn('⚠️ Failed to decode realtime token, using service role key:', error.message);
      supabaseKey = SUPABASE_SERVICE_ROLE_KEY;
    }
  } else {
    supabaseKey = SUPABASE_SERVICE_ROLE_KEY;
  }

  supabase = createClient(SUPABASE_URL, supabaseKey);
  console.log('✅ Supabase connected');
}

/**
 * Hydrate project files from snapshot ZIP
 */
async function hydrateFromSnapshot() {
  try {
    if (!SNAPSHOT_URL) {
      console.log('📁 No snapshot URL provided, falling back to legacy sync');
      await syncProjectFiles();
      return;
    }

    console.log('📥 Downloading snapshot from:', SNAPSHOT_URL);

    // Download the snapshot with retry logic
    let zipData;
    let lastError;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const response = await axios.get(SNAPSHOT_URL, {
          responseType: 'arraybuffer',
          timeout: 30000,
          maxContentLength: 100 * 1024 * 1024,
        });

        if (response.status !== 200) {
          throw new Error(`Failed to download snapshot: HTTP ${response.status}`);
        }

        zipData = Buffer.from(response.data);
        console.log(`✅ Snapshot downloaded: ${zipData.length} bytes`);
        break;
      } catch (error) {
        lastError = error;
        if (attempt === 5) break;
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
        console.warn(`Snapshot download failed (attempt ${attempt}/5): ${error.message}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    if (!zipData) {
      throw lastError || new Error('Failed to download snapshot after 5 attempts');
    }

    // Extract the ZIP using JSZip
    console.log('📦 Extracting snapshot...');
    const zip = new JSZip();
    const zipContents = await zip.loadAsync(zipData);

    let extractedFiles = 0;
    const entries = Object.entries(zipContents.files);

    for (const [filename, zipEntry] of entries) {
      if (zipEntry.dir) continue;

      const content = await zipEntry.async('text');
      const localPath = path.join(PROJECT_DIR, filename);

      await fs.ensureDir(path.dirname(localPath));
      await fs.writeFile(localPath, content, 'utf8');
      extractedFiles++;

      console.log(`✅ Extracted: ${filename} (${content.length} bytes)`);
    }

    console.log(`📸 Snapshot hydration complete: ${extractedFiles} files extracted`);

    // Verify critical files exist
    const packageJsonExists = await fs.pathExists(path.join(PROJECT_DIR, 'package.json'));
    if (!packageJsonExists) {
      console.warn('⚠️ Critical file missing after extraction: package.json');
    }

  } catch (error) {
    console.error('❌ Snapshot hydration failed:', error.message);
    console.log('📁 Falling back to legacy file sync...');
    await syncProjectFiles();
  }
}

/**
 * Perform initial file sync from Supabase storage, with DB table fallback
 */
async function syncProjectFiles() {
  try {
    console.log('📥 Syncing project files from Supabase...');

    // Create project directory
    await fs.ensureDir(PROJECT_DIR);

    // Check if there are files in storage
    const { data: files, error } = await supabase.storage
      .from('project-files')
      .list(`${PROJECT_ID}/`, { limit: 1000 });

    if (error && error.statusCode !== 404) {
      throw error;
    }

    if (!files || files.length === 0) {
      // Storage bucket is empty - try the project_files DB table via list_current_files RPC
      console.log('📄 No files in storage bucket, querying project_files DB table...');
      const filesFromDb = await syncFromDatabase();
      if (filesFromDb) return;

      console.log('📄 No files found in DB either, creating default project...');
      await createDefaultProject();
      return;
    }

    console.log(`📦 Found ${files.length} files in storage, downloading...`);

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

    console.log('📥 File sync completed');

  } catch (error) {
    console.error('❌ File sync failed:', error);
    // Last resort: try DB before creating default project
    const filesFromDb = await syncFromDatabase().catch(() => false);
    if (!filesFromDb) {
      await createDefaultProject();
    }
  }
}

/**
 * Sync files from the project_files database table via list_current_files RPC
 * Returns true if files were found and written, false otherwise
 */
async function syncFromDatabase() {
  try {
    const { data: dbFiles, error: dbError } = await supabase.rpc('list_current_files', {
      project_uuid: PROJECT_ID
    });

    if (dbError) {
      console.error('❌ list_current_files RPC failed:', dbError.message);
      return false;
    }

    if (!dbFiles || dbFiles.length === 0) {
      console.log('📄 No files found in project_files DB table');
      return false;
    }

    console.log(`📦 Found ${dbFiles.length} files in DB, writing to disk...`);

    let writtenCount = 0;
    for (const file of dbFiles) {
      if (!file.content) continue;

      const localPath = path.join(PROJECT_DIR, file.file_path);
      await fs.ensureDir(path.dirname(localPath));
      await fs.writeFile(localPath, file.content, 'utf8');
      writtenCount++;

      console.log(`✅ Written from DB: ${file.file_path} (${file.content.length} bytes)`);
    }

    console.log(`📥 DB file sync completed: ${writtenCount} files written`);
    return writtenCount > 0;

  } catch (error) {
    console.error('❌ DB file sync failed:', error);
    return false;
  }
}

/**
 * Connect to Supabase realtime for live file sync
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
        console.log(`⚡ Realtime connection status: ${status}`);

        switch (status) {
          case 'SUBSCRIBED':
            console.log(`✅ Subscribed to channel: ${channelName}`);
            connectionRetryCount = 0;
            break;
          case 'CHANNEL_ERROR':
            console.error('❌ Channel error:', error);
            scheduleReconnect();
            break;
          case 'TIMED_OUT':
            console.warn('⏰ Connection timed out, reconnecting...');
            scheduleReconnect();
            break;
          case 'CLOSED':
            console.warn('🔌 Connection closed, reconnecting...');
            scheduleReconnect();
            break;
        }
      });

    console.log(`🔄 Connecting to realtime channel: ${channelName}`);

  } catch (error) {
    console.error('❌ Failed to connect to realtime:', error);
    scheduleReconnect();
  }
}

/**
 * Schedule reconnection with exponential backoff
 */
function scheduleReconnect() {
  if (connectionRetryCount >= maxRetryAttempts) {
    console.error(`❌ Max retry attempts (${maxRetryAttempts}) reached. Stopping reconnection.`);
    return;
  }

  connectionRetryCount++;
  const delayMs = Math.min(1000 * Math.pow(2, connectionRetryCount), 30000);

  console.log(`🔄 Scheduling reconnection attempt ${connectionRetryCount}/${maxRetryAttempts} in ${delayMs}ms...`);

  reconnectTimer = setTimeout(() => {
    console.log(`🔄 Reconnection attempt ${connectionRetryCount}/${maxRetryAttempts}...`);
    connectToRealtime();
  }, delayMs);
}

/**
 * Handle file update from realtime
 */
async function handleFileUpdate({ filePath, content, timestamp }) {
  try {
    const fullPath = path.join(PROJECT_DIR, filePath);
    await fs.ensureDir(path.dirname(fullPath));
    await fs.writeFile(fullPath, content, 'utf8');
    console.log(`✅ Updated file: ${filePath} (${content.length} bytes)`);
  } catch (error) {
    console.error(`❌ Failed to update file ${filePath}:`, error);
  }
}

/**
 * Handle file deletion from realtime
 */
async function handleFileDelete({ filePath, timestamp }) {
  try {
    const fullPath = path.join(PROJECT_DIR, filePath);
    if (await fs.pathExists(fullPath)) {
      await fs.remove(fullPath);
      console.log(`✅ Deleted file: ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Failed to delete file ${filePath}:`, error);
  }
}

/**
 * Handle bulk file updates from realtime
 */
async function handleBulkFileUpdate({ files, timestamp }) {
  try {
    console.log(`📦 Processing bulk update of ${files.length} files...`);

    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
      try {
        if (file.action === 'update') {
          await handleFileUpdate({ filePath: file.filePath, content: file.content, timestamp });
          successCount++;
        } else if (file.action === 'delete') {
          await handleFileDelete({ filePath: file.filePath, timestamp });
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
 * Create a default React project
 */
async function createDefaultProject() {
  console.log('🎨 Creating default React project...');
  
  // Create package.json
  const packageJson = {
    name: 'velocity-preview',
    version: '1.0.0',
    scripts: {
      dev: 'vite --host 0.0.0.0 --port 3001',
      build: 'vite build',
      preview: 'vite preview'
    },
    dependencies: {
      'react': '^18.2.0',
      'react-dom': '^18.2.0'
    },
    devDependencies: {
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      '@vitejs/plugin-react': '^4.2.0',
      'vite': '^5.0.0'
    }
  };
  
  await fs.writeJSON(path.join(PROJECT_DIR, 'package.json'), packageJson, { spaces: 2 });
  
  // Create vite.config.js with proper subdomain configuration
  const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: ${VITE_PORT},
    strictPort: true,
    hmr: {
      // HMR will work naturally with subdomain
      protocol: 'wss',
      host: '${PREVIEW_DOMAIN || 'localhost'}',
      clientPort: 443
    }
  }
});`;
  
  await fs.writeFile(path.join(PROJECT_DIR, 'vite.config.js'), viteConfig);
  
  // Create index.html
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Velocity Preview</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`;
  
  await fs.writeFile(path.join(PROJECT_DIR, 'index.html'), indexHtml);
  
  // Create src directory
  await fs.ensureDir(path.join(PROJECT_DIR, 'src'));
  
  // Create main.jsx
  const mainJsx = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;
  
  await fs.writeFile(path.join(PROJECT_DIR, 'src', 'main.jsx'), mainJsx);
  
  // Create App.jsx
  const appJsx = `import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [count, setCount] = useState(0);
  const [sessionInfo, setSessionInfo] = useState(null);

  useEffect(() => {
    // Display session information
    setSessionInfo({
      sessionId: '${SESSION_ID}',
      projectId: '${PROJECT_ID}',
      domain: '${PREVIEW_DOMAIN}',
      subdomain: ${USE_SUBDOMAIN}
    });
  }, []);

  return (
    <div className="App">
      <header>
        <h1>🚀 Velocity Preview Container</h1>
        <p>Your development environment is ready!</p>
      </header>
      
      <main>
        <div className="card">
          <button onClick={() => setCount(count + 1)}>
            Count: {count}
          </button>
          <p>
            Edit <code>src/App.jsx</code> and save to test HMR
          </p>
        </div>
        
        {sessionInfo && (
          <div className="info">
            <h3>Session Information</h3>
            <pre>{JSON.stringify(sessionInfo, null, 2)}</pre>
          </div>
        )}
      </main>
      
      <footer>
        <p>Powered by Velocity</p>
      </footer>
    </div>
  );
}

export default App;`;
  
  await fs.writeFile(path.join(PROJECT_DIR, 'src', 'App.jsx'), appJsx);
  
  // Create App.css
  const appCss = `.App {
  max-width: 1280px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
  font-family: system-ui, -apple-system, sans-serif;
}

header h1 {
  font-size: 3em;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  margin-bottom: 0.5em;
}

.card {
  padding: 2em;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  margin: 2em 0;
}

.card button {
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: transform 0.2s;
}

.card button:hover {
  transform: scale(1.05);
}

.info {
  margin-top: 2em;
  padding: 1.5em;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 8px;
  text-align: left;
}

.info h3 {
  margin-top: 0;
}

.info pre {
  background: rgba(0, 0, 0, 0.2);
  padding: 1em;
  border-radius: 4px;
  overflow-x: auto;
}

footer {
  margin-top: 3em;
  opacity: 0.7;
}`;
  
  await fs.writeFile(path.join(PROJECT_DIR, 'src', 'App.css'), appCss);
  
  // Create index.css
  const indexCss = `:root {
  color-scheme: dark;
  color: rgba(255, 255, 255, 0.87);
  background: #242424;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  display: flex;
  place-items: center;
}

#root {
  width: 100%;
}`;
  
  await fs.writeFile(path.join(PROJECT_DIR, 'src', 'index.css'), indexCss);
  
  console.log('✅ Default project created');
}

/**
 * Install npm dependencies
 */
async function installDependencies() {
  return new Promise((resolve, reject) => {
    console.log('📦 Installing npm dependencies...');
    
    const npm = spawn('npm', ['install', '--no-fund', '--no-audit'], {
      cwd: PROJECT_DIR,
      stdio: 'inherit'
    });
    
    npm.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`npm install failed with code ${code}`));
      } else {
        console.log('✅ Dependencies installed');
        resolve();
      }
    });
    
    npm.on('error', reject);
  });
}

/**
 * Start Vite development server
 */
async function startVite() {
  return new Promise((resolve, reject) => {
    console.log('🚀 Starting Vite development server...');
    
    viteProcess = spawn('npm', ['run', 'dev'], {
      cwd: PROJECT_DIR,
      env: {
        ...process.env,
        // Vite will use the subdomain naturally
        VITE_HMR_HOST: PREVIEW_DOMAIN,
        VITE_HMR_PROTOCOL: 'wss',
        VITE_HMR_PORT: '443'
      },
      stdio: 'inherit'
    });
    
    viteProcess.on('error', (err) => {
      console.error('❌ Failed to start Vite:', err);
      reject(err);
    });
    
    viteProcess.on('exit', (code) => {
      if (code !== null && code !== 0) {
        console.error(`❌ Vite process exited with code ${code}`);
        viteReady = false;
        // Attempt restart after 5 seconds
        setTimeout(startVite, 5000);
      }
    });
    
    // Wait for Vite to be ready
    const checkInterval = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:${VITE_PORT}`);
        if (response.ok) {
          clearInterval(checkInterval);
          console.log('✅ Vite is ready!');
          viteReady = true;
          resolve();
        }
      } catch (err) {
        // Still waiting...
      }
    }, 1000);
    
    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      if (!viteReady) {
        console.log('⚠️ Vite took longer than expected to start, but continuing...');
        viteReady = true; // Optimistically set to true
        resolve();
      }
    }, 30000);
  });
}

/**
 * Main initialization
 */
async function main() {
  try {
    console.log('🚀 Velocity Preview Container starting...');
    console.log(`📍 Session ID: ${SESSION_ID}`);
    console.log(`📍 Project ID: ${PROJECT_ID}`);
    console.log(`🌐 Preview Domain: ${PREVIEW_DOMAIN}`);
    console.log(`🔧 Subdomain Mode: ${USE_SUBDOMAIN}`);
    console.log(`📸 Snapshot Mode: ${!!SNAPSHOT_URL}`);

    // Initialize Supabase
    await initSupabase();

    // Sync project files - use snapshot if available, otherwise legacy
    if (SNAPSHOT_URL) {
      console.log('📸 Performing snapshot hydration...');
      await hydrateFromSnapshot();
    } else {
      console.log('📁 Performing legacy file sync...');
      await syncProjectFiles();
    }

    // Install dependencies
    await installDependencies();

    // Start Vite (don't wait for it to be fully ready)
    startVite().catch(err => {
      console.error('⚠️ Vite startup error (non-fatal):', err);
    });

    // Connect to realtime for live file sync (non-blocking)
    console.log('⚡ Connecting to realtime updates...');
    connectToRealtime();

    // Start Express server immediately
    app.listen(PORT, () => {
      console.log(`✅ Express server listening on port ${PORT}`);
      if (USE_SUBDOMAIN) {
        console.log(`🌐 Preview available at: https://${PREVIEW_DOMAIN}`);
      } else {
        console.log(`🌐 Preview available at: https://${process.env.FLY_APP_NAME}.fly.dev/session/${SESSION_ID}`);
      }
    });
    
  } catch (error) {
    console.error('❌ Fatal error during initialization:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
function gracefulShutdown(signal) {
  console.log(`📛 ${signal} received, shutting down gracefully...`);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (realtimeChannel) {
    realtimeChannel.unsubscribe();
    console.log('✅ Unsubscribed from realtime channel');
  }
  if (viteProcess) {
    viteProcess.kill();
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start the container
main();