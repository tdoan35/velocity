# Velocity Preview Container

This directory contains the Docker image definition for Velocity's ephemeral preview containers that run on Fly.io.

<!-- Trigger rebuild to fix missing detect-project-type.js module - 2025-09-01 -->

## Container Registry

The preview container is automatically built and pushed to GitHub Container Registry (GHCR) via GitHub Actions.

### Image Information
- **Registry**: GitHub Container Registry (ghcr.io)
- **Repository**: `ghcr.io/tdoan35/velocity/velocity-preview-container`
- **Tags**: 
  - `latest` - Latest stable build from main branch
  - `main-{sha}` - Specific commit builds
  - `pr-{number}` - Pull request builds

### Automated Builds

The container is automatically built and pushed when:
- Changes are made to files in `orchestrator/preview-container/`
- Changes are made to the GitHub Actions workflow
- Manual workflow dispatch is triggered

### Build Process

1. **Multi-platform builds**: Supports both `linux/amd64` and `linux/arm64`
2. **Security scanning**: Trivy vulnerability scanner runs on all builds
3. **Caching**: Uses GitHub Actions cache for faster builds
4. **Auto-versioning**: Images are tagged with branch names and commit SHAs

## Overview

Each preview container is a lightweight, ephemeral environment that:

- Runs user's React/React Native code in real-time
- Synchronizes file changes via Supabase Realtime
- Provides hot module reloading and development server
- Automatically handles project setup and dependency installation

## Architecture

```
┌─────────────────────────────────────────────┐
│              Preview Container              │
│  ┌─────────────────────────────────────────┐│
│  │           entrypoint.js                 ││
│  │  • File sync from Supabase Storage     ││
│  │  • Real-time updates via WebSocket     ││
│  │  • Development server management       ││
│  │  • Health monitoring                   ││
│  └─────────────────────────────────────────┘│
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │         Development Server              ││
│  │  • Vite (React/Vue/Vanilla JS)         ││
│  │  • Webpack Dev Server                  ││
│  │  • Create React App                    ││
│  │  • Expo CLI (React Native)             ││
│  └─────────────────────────────────────────┘│
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │           Project Files                 ││
│  │  /app/project/ - User's code           ││
│  │  • Dynamic file synchronization        ││
│  │  • Hot module reloading                ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

## File Structure

```
preview-container/
├── Dockerfile              # Container image definition
├── package.json            # Container dependencies
├── entrypoint.js           # Main container logic
├── .dockerignore          # Build context exclusions
└── README.md              # This file
```

## Environment Variables

The container expects these environment variables:

- `PROJECT_ID` - Unique identifier for the project
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - Supabase anonymous key for real-time
- `PORT` - Port to expose (default: 8080)
- `NODE_ENV` - Runtime environment (default: production)

## Container Lifecycle

1. **Initialization**
   - Validate environment variables
   - Connect to Supabase
   - Create project directory

2. **File Sync**
   - Download existing files from Supabase Storage
   - Create default project structure if no files exist

3. **Dev Server**
   - Install project dependencies
   - Start appropriate development server (Vite, CRA, etc.)
   - Enable hot module reloading

4. **Real-time Updates**
   - Subscribe to project-specific Supabase channel
   - Handle file update/delete events
   - Sync changes to local filesystem

5. **Health Monitoring**
   - Expose health check endpoint at `/health`
   - Proxy requests to development server
   - Monitor dev server status

## Supported Project Types

- **React** - Via Vite or Create React App
- **Vue.js** - Via Vite
- **Vanilla JavaScript** - Via Vite
- **TypeScript** - Via Vite + TypeScript
- **React Native** - Via Expo CLI (web preview)

## Ports

- `8080` - Main container port (health checks + proxy)
- `3000` - Default development server port (internal)

## Health Checks

The container exposes a health endpoint at `/health`:

```json
{
  "status": "ready",
  "timestamp": "2023-08-30T10:00:00.000Z",
  "projectId": "project-uuid",
  "devServerPort": 3000,
  "isInitialized": true,
  "uptime": 120.5
}
```

Status values:
- `starting` - Container is initializing
- `ready` - Container is fully operational
- `error` - Container encountered an error
- `shutting_down` - Container is gracefully shutting down

## Building the Image

To build the container image:

```bash
# From the preview-container directory
docker build -t ghcr.io/velocity/preview-container:latest .

# Push to GitHub Container Registry
docker push ghcr.io/velocity/preview-container:latest
```

## Local Development

To test the container locally:

```bash
# Set required environment variables
export PROJECT_ID="test-project-123"
export SUPABASE_URL="https://your-project.supabase.co"
export SUPABASE_ANON_KEY="your-anon-key"
export PORT=8080

# Run the entrypoint script
node entrypoint.js
```

## Troubleshooting

### Common Issues

1. **Container fails to start**
   - Check environment variables are set
   - Verify Supabase connectivity
   - Check container logs for specific errors

2. **Development server not responding**
   - Check if npm install completed successfully
   - Verify project has valid package.json
   - Check dev server logs in container output

3. **File sync issues**
   - Verify Supabase Storage permissions
   - Check real-time connection status
   - Ensure project files exist in Storage

### Logs

Container logs are structured with prefixes:
- `🚀` - Initialization messages
- `📦` - Dependency installation
- `⚡` - Real-time connection events
- `📝` - File update events
- `❌` - Error messages
- `✅` - Success messages

## Security Considerations

- Container runs as non-root user (`node`)
- Limited to required system dependencies
- No persistent storage - all data is ephemeral
- Isolated network access via Fly.io private networking
- Resource limits enforced at machine level

## Performance

- **Cold Start**: ~15-30 seconds (including npm install)
- **Memory Usage**: ~256-512MB typical
- **CPU Usage**: Minimal when idle, moderate during builds
- **Network**: Optimized for file sync and hot reloading

## Fly.io Integration

The container is designed specifically for Fly.io Machines:

- Automatic machine destruction when idle
- Health checks for machine readiness
- Graceful shutdown handling
- Resource limits configuration
- Private networking support