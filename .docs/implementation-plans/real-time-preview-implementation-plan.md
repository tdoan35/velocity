# Implementation Plan: Real-Time Preview Architecture

**Date:** August 28, 2025
**Status:** Approved

## 1. Overview & Goals

This document provides a detailed implementation plan for transitioning from the current batch-based preview system to a real-time, container-based architecture.

The primary goal is to provide users with an instantaneous, hot-reloading preview of their application as they edit their code, creating a seamless and modern development experience.

## 2. Proposed Architecture

The architecture consists of four main components: the **Frontend Client**, a new **Orchestrator Service**, ephemeral **Preview Containers**, and the **Real-Time Communication Layer**.

```
+------------------+      (1) Request Session      +-----------------------+
|                  | ---------------------------> |                       |
| Frontend Client  |      (2) Returns URL         |  Orchestrator Service |
| (Project Editor) | <--------------------------- |      (on Fly.io)      |
|                  |                              |                       |
+--------^---------+      (3) Provisions/Starts   +-----------+-----------+
         |
         | (5) WebSocket Connection                            | (4) Pulls Files
         |
+--------+---------------------------------------------+       |
|                                                      |       |
|               Supabase Realtime (WebSocket)          <-------+
|                                                      |       |
+--------^---------------------------------------------+
         |
         | (6) File changes pushed to container
         |
+--------+---------+      (7) Writes file to disk
|                  | ---------------------------> +--------------------+ 
| Preview Iframe   |      (8) Dev server HMR      |                    |
| (src=fly.dev)    | <--------------------------- |  Preview Container |
|                  |                              | (Fly Machine)      |
+------------------+                              +--------------------+
```

## 3. Recommended Project Structure

To maintain a clean and scalable codebase, the new Orchestrator service and its related components will be housed in a new top-level `orchestrator` directory. This follows the project's existing convention of separating major services.

```
C:\Users\Ty\Desktop\Velocity\
├───frontend\
├───supabase\
├───.docs\
│
├───orchestrator\           <-- New top-level directory for the entire preview service
│   │
│   ├───src\                <-- Source code for the Orchestrator Node.js service
│   │   ├───index.js        # Main server file, sets up Express/Fastify, routes, etc.
│   │   ├───api\            # Route definitions for the service's API
│   │   │   └───session.js  # Handles /sessions/start and /sessions/stop
│   │   └───services\       # Business logic
│   │       └───fly-io.js   # A dedicated module for all interactions with the Fly.io API
│   │
│   ├───preview-container\          <-- All assets for building the Preview Container image
│   │   ├───Dockerfile      # Defines the Preview Container environment
│   │   ├───entrypoint.js   # Script that runs inside every Preview Container
│   │   └───package.json    # Dependencies needed ONLY for the entrypoint.js script
│   │
│   ├───fly.toml            # Configuration for deploying the Orchestrator service to Fly.io
│   ├───package.json        # Dependencies for the Orchestrator service (express, fly-sdk, etc.)
│   └───.dockerignore       # To optimize the Preview Container build context
│
└───... (other existing root files: package.json, .gitignore, etc.)
```

## 4. Component Deep-Dive

### 4.1. Orchestrator Service

This new backend service is the brain of the system, responsible for managing the lifecycle of Preview Containers.

*   **Technology:** Node.js with a lightweight web framework (e.g., Express), using the `fly-machines` SDK to interact with the Fly.io API.
*   **Deployment:** **Fly.io**. The service will be deployed as a standard, long-running Fly App.
*   **Core Responsibilities:**
    *   Expose an API to start, stop, and get the status of preview sessions.
    *   Use the Fly.io Machines API to launch, manage, and destroy Preview Containers (Fly Machines).
    *   Handle cleanup of expired or terminated sessions.

*   **API Endpoints:**
    *   `POST /sessions/start`
        *   **Body:** `{ "projectId": "uuid" }`
        *   **Action:** Calls the Fly.io API to launch a new Machine from the designated GHCR image. Creates a record in the `preview_sessions` table with status `creating`, then updates to `active` when container is ready.
        *   **Returns:** `{ "sessionId": "uuid", "containerUrl": "https://some-machine-name.fly.dev" }`
    *   `POST /sessions/stop`
        *   **Body:** `{ "sessionId": "uuid" }`
        *   **Action:** Calls the Fly.io API to stop and destroy the associated Machine. Updates the session's status to `ended` and sets `ended_at` timestamp.
        *   **Returns:** `{ "status": "ok" }`
    *   `GET /sessions/:sessionId/status`
        *   **Action:** Returns the current status of a preview session.
        *   **Returns:** `{ "sessionId": "uuid", "status": "active", "containerUrl": "...", "containerId": "..." }`

### 4.2. Preview Container

This is the ephemeral environment where the user's code runs, deployed as a Fly Machine.

*   **Image Storage:** **GitHub Container Registry (GHCR)**. Images will be built and pushed via GitHub Actions. The image name will be `ghcr.io/<your-org>/preview-container:latest`.
*   **Technology:** A custom Docker image based on `node:18-slim`.
*   **Key Software:**
    *   Node.js and `npm`/`yarn`.
    *   Pre-installed common dev servers (`vite`, `expo-cli`, `nodemon`).
    *   A custom `entrypoint.js` script.
    *   Supabase client library for real-time communication.

*   **`Dockerfile` (Example):**
    ```dockerfile
    FROM node:18-slim

    # Install global dependencies for dev servers
    RUN npm install -g vite expo-cli nodemon

    # Copy the container's internal logic
    WORKDIR /app
    COPY ./entrypoint.js .
    COPY ./package.json .

    # Install dependencies for the entrypoint script
    RUN npm install

    # Expose a default port that Fly.io will map
    EXPOSE 8080

    # The entrypoint script will be started by Fly.io
    CMD ["node", "entrypoint.js"]
    ```

*   **`entrypoint.js` Logic:**
    1.  **Initialization:** Reads environment variables passed by the Orchestrator (`PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`).
    2.  **Initial File Sync:** Fetches all files for the given `PROJECT_ID` from Supabase Storage and writes them to the container's local filesystem (`/app/project`).
    3.  **Start Dev Server:** Spawns a child process for the appropriate dev server (e.g., `vite --port 8080`) within the `/app/project` directory.
    4.  **Connect to Real-Time:** Initializes the Supabase client and subscribes to the project-specific channel (e.g., `realtime:project:<project_id>`).
    5.  **Listen for Changes:** Listens for `file:update` events. On receiving an event, it writes the new file content to the correct path within `/app/project`. The running dev server's file watcher will detect this change and trigger hot-reloading.

### 4.3. Frontend Client (`ProjectEditor.tsx`)

*   **State Management (`useProjectEditorStore`):**
    *   Add new state variables: `previewSessionId`, `previewUrl`, `previewStatus ('idle' | 'starting' | 'running' | 'error')`.
*   **Lifecycle:**
    1.  **On Mount:** Call a new hook, `usePreviewSession`, which sends a request to the Orchestrator's `/sessions/start` endpoint.
    2.  **On Response:** Store the `sessionId` and `previewUrl` in the state. Set the preview `iframe`'s `src` to this `previewUrl`.
    3.  **On Unmount:** Send a request to `/sessions/stop` to terminate the container and clean up resources.
*   **Editor Integration:**
    *   The code editor's `onChange` handler will be modified. Instead of a simple state update, it will (after a debounce) broadcast a `file:update` event via the Supabase Realtime client.

### 4.4. Real-Time Communication Layer

*   **Technology:** Supabase Realtime.
*   **Channel:** A unique channel per project: `realtime:project:<project_id>`.
*   **Message Format:**
    ```json
    {
      "event": "file:update",
      "payload": {
        "filePath": "src/components/Button.tsx",
        "content": "..."
      }
    }
    ```

## 5. Database Schema Changes

The existing `preview_sessions` table needs to be modified to support the container-based approach, removing Appetize.io-specific columns and adding container-specific fields.

**Migration Strategy:** The migration should be executed during a maintenance window to ensure data consistency. Any active Appetize.io sessions will be terminated as part of the migration to the container-based system.

*   **Migration: Update `preview_sessions` table**
    ```sql
    -- Add new container-specific columns
    ALTER TABLE public.preview_sessions 
    ADD COLUMN IF NOT EXISTS container_id text, -- ID from the Fly.io Machines API
    ADD COLUMN IF NOT EXISTS container_url text; -- URL of the running container

    -- Remove Appetize.io-specific columns
    ALTER TABLE public.preview_sessions 
    DROP COLUMN IF EXISTS device_id,
    DROP COLUMN IF EXISTS public_key,
    DROP COLUMN IF EXISTS app_url;

    -- Update status constraint to support container lifecycle
    ALTER TABLE public.preview_sessions 
    DROP CONSTRAINT IF EXISTS preview_sessions_status_check;
    
    ALTER TABLE public.preview_sessions 
    ADD CONSTRAINT preview_sessions_status_check 
    CHECK (status IN ('creating', 'active', 'ended', 'error'));

    -- Rename preview_url to be more generic (optional)
    ALTER TABLE public.preview_sessions 
    RENAME COLUMN preview_url TO container_url;

    -- Add updated_at column if it doesn't exist
    ALTER TABLE public.preview_sessions 
    ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

    -- Add indexes for performance
    CREATE INDEX IF NOT EXISTS idx_preview_sessions_project ON public.preview_sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_preview_sessions_user ON public.preview_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_preview_sessions_status ON public.preview_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_preview_sessions_container ON public.preview_sessions(container_id);
    ```

*   **Updated Table Schema:**
    ```sql
    -- Final table structure after migration
    public.preview_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES auth.users(id),
      project_id uuid NOT NULL, -- Foreign key to projects table
      session_id text NULL, -- Keep for session tracking
      container_id text NULL, -- Fly.io Machine ID
      container_url text NULL, -- URL of the running container
      status text NOT NULL CHECK (status IN ('creating', 'active', 'ended', 'error')),
      error_message text NULL,
      expires_at timestamptz NULL, -- For cleanup of orphaned containers
      created_at timestamptz DEFAULT NOW(),
      ended_at timestamptz NULL,
      updated_at timestamptz DEFAULT NOW()
    );
    ```

## 6. Phased Implementation Plan

### Phase 1: Backend Foundation (2-3 weeks)

*   [ ] **Task 1.1:** Execute database migration to update the existing `preview_sessions` table for container-based approach.
*   [ ] **Task 1.2:** Finalize and implement the `Orchestrator Service` API with updated endpoints.
*   [ ] **Task 1.3:** Implement the service's logic for starting/stopping Fly Machines using the `fly-machines` SDK.
*   [ ] **Task 1.4:** Create the `preview-container/` directory structure in the repository root with `Dockerfile`, `package.json`, and `entrypoint.js`.
*   [ ] **Task 1.5:** Implement the `entrypoint.js` script, including initial file sync and the dev server process.
*   [ ] **Task 1.6:** Update any existing code/services that reference the old `preview_sessions` table schema.
*   [ ] **Task 1.7:** Manually test the Orchestrator by calling its API and verifying that Fly Machines are created and destroyed.

### Phase 2: Real-Time Integration (1-2 weeks)

*   [ ] **Task 2.1:** Implement the WebSocket listening logic in the `entrypoint.js` script to handle `file:update` events.
*   [ ] **Task 2.2:** Refactor the frontend `ProjectEditor` to broadcast `file:update` events on code changes.
*   [ ] **Task 2.3:** Establish the Supabase Realtime channel connection on both the frontend and in the container.
*   [ ] **Task 2.4:** End-to-end test: ensure a code change in the editor is reflected in the running Fly Machine's file system.

### Phase 3: Frontend & Deployment (2 weeks)

*   [ ] **Task 3.1:** Implement the full session lifecycle on the frontend (`creating`, `active`, `ended`).
*   [ ] **Task 3.2:** Update the `iframe` to correctly display the `containerUrl`.
*   [ ] **Task 3.3:** Deploy the Orchestrator service to Fly.io as a persistent app.
*   [ ] **Task 3.4:** Create a GitHub Actions workflow to automatically build and push the Preview Container image to GitHub Container Registry (GHCR).
*   [ ] **Task 3.5:** Remove Appetize.io integration from frontend components and services.
*   [ ] **Task 3.6:** Decommission any Appetize.io-related Supabase functions and clean up unused code.

### Phase 4: Security & Polish (1 week)

*   [ ] **Task 4.1:** Configure Fly Machine resource limits (CPU, memory) when launching Preview Containers to prevent abuse.
*   [ ] **Task 4.2:** Leverage Fly.io private networking and firewall rules to ensure containers are isolated and can only communicate with required services.
*   [ ] **Task 4.3:** Implement a cron job or background worker that cleans up orphaned Fly Machines based on the `expires_at` field in `preview_sessions`.

## 7. Security Considerations

*   **Container Isolation:** Fly.io Machines provide strong VM-level isolation.
*   **Network Policies:** Use Fly.io's built-in networking features to restrict traffic. Outbound traffic should be restricted to a whitelist (e.g., Supabase domains, npm registry).
*   **Resource Limiting:** Define CPU and memory limits in the Orchestrator when launching a new Machine to prevent denial-of-service or runaway processes.
*   **Authentication:** The Orchestrator API must be protected. Since it's a Fly App, we can use a secret token for authentication that the frontend's gateway/BFF can use.
