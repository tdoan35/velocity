# Live Preview and Code Editor Architecture Analysis  

**Date:** August 28, 2025  

---

## 1. Introduction  

This document provides a detailed analysis of the current architecture for the live code preview feature within the Project Editor. It outlines the existing design, identifies its limitations regarding the goal of real-time hot reloading, and proposes a robust, scalable, container-based architecture to achieve near-instantaneous preview updates.  

---

## 2. Analysis of Current Architecture  

The current system is a "build-on-demand" service that operates as a batch process. It is not a real-time system.  

### 2.1 Workflow  

The preview generation follows these steps:  

1. **Client Request:** The frontend editor gathers all project files (HTML, CSS, JS, etc.) and sends them via an API call to the `build-preview` Supabase Edge Function.  
2. **Backend Bundling:** The `build-preview` function receives the files and executes the following tasks:  
   - Writes all the code to a temporary directory on the server.  
   - Dynamically creates a `package.json` and a `metro.config.js`.  
   - Executes the `react-native bundle` command using `npx` to create a production JavaScript bundle.  
   - Uploads the resulting bundle and assets to the `preview-bundles` Supabase Storage bucket.  
3. **Client Display:** The function returns the public URL of the newly created bundle. The frontend then loads this bundle, likely within an iframe or a webview, to display the preview.  

### 2.2 Data and Storage  

- **`project_files` Table:** File content is stored directly in a `text` column in the Supabase database. This provides fast access but is not ideal for large files or binary assets.  
- **Storage Buckets:**  
  - `build-artifacts` (or `preview-bundles`) is used to store the output of the build process.  
  - `project-assets` appears intended for user-uploaded static assets.  

### 2.3 Key Limitations  

1. **High Latency:** The entire process is a high-latency, asynchronous operation. The time required to spin up the function, write files, run the bundler, and upload the artifact makes real-time feedback impossible. A user might wait several seconds to see the result of a simple change.  
2. **No Hot Reloading:** This design does not support hot reloading. Every change, no matter how small, requires a full rebundle of the entire application. This is inefficient and provides a poor developer experience.  
3. **Scalability Concerns:** While Supabase Edge Functions are scalable, the current approach of running a full build process on every preview request is resource-intensive and may become costly and slow under concurrent use.  
4. **Environment Rigidity:** The `build-preview` function is hardcoded to use a specific version of the React Native bundler (Metro). It does not easily support different frameworks (e.g., Node.js, Next.js, Vite) or custom build configurations, limiting the platform's flexibility.  

---

## 3. Recommended Architecture: A Container-Based Real-Time Solution  

To achieve the goal of instant, hot-reloading previews, a fundamental shift from a stateless, build-on-demand model to a stateful, persistent environment model is required. The intuition to use a container-based approach is correct.  

### Core Principles  

1. **Persistent Preview Environments:** A dedicated, isolated container is spun up for each active project editing session.  
2. **Real-Time Communication:** A WebSocket connection is used to sync file changes between the editor and the preview container instantly.  

### 3.1 Proposed Workflow  

1. **Session Start:** When a user enters a `ProjectEditor` page, the frontend sends a request to a new backend service (the *Orchestrator*).  
2. **Container Provisioning:** The Orchestrator spins up a new, dedicated Docker container for the session from a pre-built image. This container runs a standard Node.js environment with a file watcher and a development server (e.g., Expo CLI, Vite, `nodemon`).  
3. **Initial Sync:** Upon startup, the container pulls the complete set of project files from the `project_files` table or the `project-assets` storage bucket.  
4. **Real-Time Connection:**  
   - The preview container establishes a WebSocket connection, subscribing to a project-specific channel (e.g., using Supabase Realtime).  
   - The frontend editor also connects to the same WebSocket channel.  
5. **Hot Reloading in Action:**  
   - As the user types in the editor, the frontend sends `file-updated` events through the WebSocket channel. The payload contains the file path and the new content.  
   - The server inside the preview container listens for these events and immediately writes the new content to the corresponding file in its filesystem.  
   - The running development server (e.g., Expo) detects the file change and triggers its built-in hot-reloading mechanism, pushing the update to the preview.  
6. **Preview Display:** The frontend `iframe` points directly to the URL of the development server running inside the dedicated container.  

### 3.2 System Components  

- **Frontend Editor:** Largely unchanged, but updated to sync changes via WebSockets instead of HTTP calls.  
- **Supabase Realtime:** Acts as the WebSocket broker, providing the real-time communication channel between the editor and the preview container.  
- **Preview Container:** A Docker container running a lightweight OS and a Node.js environment. It includes a small server to handle WebSocket events and write file changes to disk, plus the necessary development server for the project’s framework.  
- **Orchestrator Service:** A backend service responsible for managing the lifecycle of preview containers (starting, stopping, assigning ports/subdomains). This could be a simple server or built on Docker Swarm, Kubernetes, Fly.io, or Railway.  

### 3.3 Advantages of the New Architecture  

1. **Instant Previews:** By eliminating the build step and using WebSockets, changes appear in the preview almost instantaneously.  
2. **True Hot Reloading:** Leverages the native hot-reloading capabilities of modern development servers.  
3. **Framework Agnostic:** The container image can support any framework (Expo, Next.js, Vite, Express, etc.).  
4. **Improved Scalability:** The Orchestrator can manage a pool of containers, scaling them up or down based on demand.  
5. **Full Environment Control:** Containers provide an isolated Linux environment, allowing for custom dependencies, environment variables, and backend processes—improving flexibility over Expo Snack or bundler-only approaches.  

---

## 4. High-Level Implementation Plan  

1. **Develop a Preview Container Image:** Create a `Dockerfile` for the preview environment, including Node.js, a generic file-watching script, and common dev servers.  
2. **Build the Orchestrator Service:** Create a service to start and stop Docker containers on demand and manage mappings between sessions and container URLs.  
3. **Integrate Supabase Realtime:**  
   - Modify the frontend editor to broadcast `file-updated` events on the project’s channel.  
   - In the container, subscribe to these events and write the file changes to disk.  
4. **Update the Frontend:**  
   - Update `ProjectEditor` to request a preview container from the Orchestrator on load.  
   - Point the preview `iframe` to the container URL.  
   - Decommission the old `build-preview` API call.  

---

## 5. Conclusion  

The current preview architecture does not meet the requirements for a modern, real-time development experience. By adopting a container-based approach with a real-time communication channel, we can deliver the instant hot-reloading feature that users expect, while also building a more scalable, flexible, and powerful platform.  
