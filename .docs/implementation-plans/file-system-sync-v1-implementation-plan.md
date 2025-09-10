# Implementation Plan — File System Sync v1 (Codex)

## Overview

- Objective: Implement Codex FS‑sync architecture with DB as source of truth, snapshot‑based container hydration, and server‑authored realtime events.
- Outcomes:
  - Deterministic initial container state
  - Secure, minimal container privileges (no service role)
  - Unified schema and APIs (RPCs) for file operations
  - Clear migration path and rollback

## Project Structure Context

```
velocity/
├── supabase/                              # Database schema and migrations
│   ├── migrations/                        # SQL migration files
│   ├── functions/                         # Edge Functions
│   └── config.toml                        # Supabase configuration
├── orchestrator/                          # Container management service
│   ├── src/services/container-manager.ts  # Container lifecycle management
│   └── preview-container/                 # Container runtime environment
│       └── entrypoint.js                  # Container initialization script
├── frontend/                              # React Native frontend
│   └── src/stores/                        # State management
│       └── useProjectEditorStore.ts       # File operations store
└── .docs/                                 # Documentation
```

## Current System Analysis

Based on the codebase structure and architectural analysis:

1. **Current Storage Approach**: Mixed DB/Storage pattern causing synchronization issues
2. **Container Security Issue**: Service role keys exposed in container environment  
3. **Schema Inconsistency**: Multiple file schema variants across components
4. **Initial Hydration Problem**: Unreliable container startup state

## Decisions

- Canonical source: PostgreSQL `project_files` with server‑authored Realtime events.
- Container bootstrap: signed snapshot from `project-snapshots` bucket, then realtime deltas.
- No service role in containers; use ephemeral, scoped realtime tokens.
- Standardized `project_files` schema (to implement via migration):

```
project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_type text NOT NULL,             -- 'typescript' | 'javascript' | 'json' | 'markdown' | 'sql' | 'text' | ...
  content text,                        -- NULL for binaries stored in storage
  content_hash text,                   -- sha256 for change detection
  version integer NOT NULL DEFAULT 1,
  parent_version_id uuid REFERENCES project_files(id) ON DELETE SET NULL,
  is_current_version boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  last_modified_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, file_path, version)
)

VIEW project_files_current AS
  SELECT * FROM project_files WHERE is_current_version = true;
```

## Scope

- Supabase SQL (schema, RLS, RPCs, storage policies)
- Supabase Edge Functions (snapshot builder)
- Orchestrator (session flow, token minting, snapshot handoff)
- Container (entrypoint hydration, realtime only)
- Frontend (store saves/deletes via RPCs; optional optimistic broadcast)
- Tests, metrics, and feature flags

## Phased Task List (Detailed)

### Phase 0 — Preparation

0.1 Finalize `project_files` schema and migration

- **Component**: Supabase SQL
- **Files**: `supabase/migrations/YYYYMMDDHHMMSS_create_project_files_v2.sql`
- **Implementation Context**:
  - Check existing schema: `supabase/migrations/` for current `project_files` table
  - Review `supabase/config.toml` for database connection settings
  - Use Supabase CLI: `npx supabase migration new create_project_files_v2`
- **Details**:
  - Create/alter table to match the Decisions schema.
  - Add indexes on `(project_id)`, `(project_id, file_path)`, `(project_id, is_current_version)`.
  - Create `project_files_current` view.
- **SQL Implementation**:
  ```sql
  -- Drop existing table if needed and recreate with new schema
  CREATE INDEX CONCURRENTLY idx_project_files_project_id ON project_files(project_id);
  CREATE INDEX CONCURRENTLY idx_project_files_project_path ON project_files(project_id, file_path);
  CREATE INDEX CONCURRENTLY idx_project_files_current ON project_files(project_id, is_current_version);
  ```
- **Acceptance**:
  - Migration applies cleanly: `npx supabase db reset` succeeds
  - `SELECT` from `project_files_current` works in Supabase dashboard
- **Dependencies**: None
- **Rollback**: `npx supabase migration new revert_project_files_v2`

  0.1.1 Backward compatibility and data backfill

- Component: Supabase SQL
- Files: `supabase/migrations/*`
- Details:
  - If existing rows use `path/type`, migrate to `file_path/file_type`.
  - Backfill `created_by` using project owner where missing.
  - Provide a temporary compatibility view if needed (`legacy_project_files`).
- Acceptance:
  - No NULLs in required columns for current rows.
  - Existing frontend can still read through temporary view if used.
- Dependencies: 0.1
- Rollback: Restore previous columns/view.

0.2 RLS policies for `project_files`

- **Component**: Supabase SQL
- **Files**: `supabase/migrations/YYYYMMDDHHMMSS_add_project_files_rls.sql`
- **Implementation Context**:
  - Review existing RLS patterns in `supabase/migrations/` 
  - Check `public.projects` table structure for project ownership model
  - Reference user authentication flow in frontend
- **Details**:
  - Enable RLS; owners and editors can write, collaborators can read.
  - SECURITY DEFINER functions will enforce author attribution.
- **SQL Implementation**:
  ```sql
  ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
  CREATE POLICY project_files_owner_full_access ON project_files
    FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));
  ```
- **Acceptance**:
  - Test with `npx supabase test db` if test suite exists
  - Manual verification: authenticated owner can upsert/delete; viewer cannot
- **Dependencies**: 0.1
- **Rollback**: `ALTER TABLE project_files DISABLE ROW LEVEL SECURITY;`

0.3 Create `project-snapshots` bucket and policies

- **Component**: Supabase Storage
- **Files**: `supabase/migrations/YYYYMMDDHHMMSS_create_project_snapshots_bucket.sql`
- **Implementation Context**:
  - Check existing storage buckets: `supabase/migrations/` for bucket creation patterns
  - Review `preview-bundles` bucket configuration for reference
  - Verify service role permissions in `supabase/config.toml`
- **Details**:
  - Create bucket `project-snapshots`.
  - Write allowed only by service role (Edge Function); read via signed URLs.
- **SQL Implementation**:
  ```sql
  INSERT INTO storage.buckets (id, name, public) VALUES ('project-snapshots', 'project-snapshots', false);
  CREATE POLICY service_role_upload ON storage.objects FOR INSERT
    USING (bucket_id = 'project-snapshots' AND auth.role() = 'service_role');
  ```
- **Acceptance**:
  - Verify in Supabase dashboard: Storage > Settings shows new bucket
  - Test upload via service role succeeds; public read fails; signed URL read succeeds
- **Dependencies**: None
- **Rollback**: `DELETE FROM storage.buckets WHERE id = 'project-snapshots';`

0.4 Feature flags/env plumbing

- **Component**: Frontend, Orchestrator
- **Files**: 
  - `frontend/.env.example`, `frontend/src/config/env.ts`
  - `orchestrator/.env.example`, `orchestrator/src/config/env.ts`
- **Implementation Context**:
  - Review existing environment variable patterns in both services
  - Check for existing feature flag infrastructure
  - Ensure development and production environment separation
- **Details**:
  - Add `FSYNC_USE_RPC`, `FSYNC_USE_SNAPSHOT_HYDRATION`, `FSYNC_KEEP_CLIENT_BROADCAST`.
  - Thread flags to call-sites but keep OFF by default.
- **Code Implementation**:
  ```typescript
  // In config/env.ts
  export const FEATURE_FLAGS = {
    FSYNC_USE_RPC: process.env.FSYNC_USE_RPC === 'true',
    FSYNC_USE_SNAPSHOT_HYDRATION: process.env.FSYNC_USE_SNAPSHOT_HYDRATION === 'true',
    FSYNC_KEEP_CLIENT_BROADCAST: process.env.FSYNC_KEEP_CLIENT_BROADCAST === 'true',
  } as const;
  ```
- **Acceptance**:
  - Flags can be toggled in staging to enable new paths
  - No runtime errors when flags are false (default behavior)
- **Dependencies**: None
- **Rollback**: Set all flags to false in environment files

  0.5 Developer documentation update

- Component: Docs
- Files: `.docs/*`
- Details:
  - Document schema, flags, and rollout plan.
- Acceptance: Docs merged and referenced in PRs.
- Dependencies: 0.1–0.4

### Phase 1 — RPCs + Server Broadcasts

1.1 RPC `upsert_project_file`

- **Component**: Supabase SQL
- **Files**: `supabase/migrations/YYYYMMDDHHMMSS_create_file_rpcs.sql`
- **Implementation Context**:
  - Review existing RPC functions in `supabase/migrations/` for patterns
  - Check Realtime configuration in `supabase/config.toml`
  - Understand SHA256 hashing in PostgreSQL: `digest(content, 'sha256')`
- **Details**:
  - Inputs: `project_uuid, p_file_path, p_content, p_file_type, expected_version (NULLABLE)`.
  - Compute `content_hash`; enforce optimistic concurrency if `expected_version` provided.
  - Insert new row; previous head `is_current_version=false`.
  - Broadcast `file:update` on `realtime:project:{project_uuid}` with `{ file_path, content, content_hash, version, timestamp }`.
- **SQL Implementation**:
  ```sql
  CREATE OR REPLACE FUNCTION upsert_project_file(
    project_uuid uuid,
    p_file_path text,
    p_content text,
    p_file_type text,
    expected_version integer DEFAULT NULL
  ) RETURNS project_files
  SECURITY DEFINER
  LANGUAGE plpgsql AS $$
  DECLARE
    new_version integer;
    content_hash text;
    result project_files;
  BEGIN
    -- Compute hash and determine version
    content_hash := encode(digest(p_content, 'sha256'), 'hex');
    
    -- Optimistic concurrency check if expected_version provided
    IF expected_version IS NOT NULL THEN
      -- Check current version matches expected
    END IF;
    
    -- Mark previous versions as not current
    UPDATE project_files SET is_current_version = false 
    WHERE project_id = project_uuid AND file_path = p_file_path AND is_current_version = true;
    
    -- Insert new version
    INSERT INTO project_files (...) VALUES (...) RETURNING * INTO result;
    
    -- Broadcast realtime event
    PERFORM pg_notify('realtime:project:' || project_uuid::text, 
      json_build_object('type', 'file:update', 'data', result)::text);
    
    RETURN result;
  END;
  $$;
  ```
- **Testing**:
  - Test via Supabase SQL editor or `psql`
  - Create test subscriber with `supabase realtime subscribe`
- **Acceptance**:
  - Concurrent writes with stale `expected_version` fail with clear error.
  - Event received by a subscriber test channel.
- **Dependencies**: 0.1–0.2

  1.2 RPC `delete_project_file`

- Component: Supabase SQL
- Files: `supabase/migrations/*`
- Details:
  - Inputs: `project_uuid, p_file_path, expected_version (NULLABLE)`.
  - Insert tombstone (or mark deleted) with version bump.
  - Broadcast `file:delete` with `{ file_path, version, timestamp }`.
- Acceptance: Delete reflects in `project_files_current`; event received.
- Dependencies: 0.1–0.2

  1.3 RPC `list_current_files`

- Component: Supabase SQL
- Files: `supabase/migrations/*`
- Details:
  - Returns `(file_path, file_type, content, content_hash, version, updated_at)` from view.
- Acceptance: Returns current head for seeded test project.
- Dependencies: 0.1

  1.4 RPC `bulk_upsert_project_files` (optional but recommended)

- Component: Supabase SQL
- Files: `supabase/migrations/*`
- Details:
  - Input: `files jsonb` array of `{ file_path, file_type, content }`.
  - Atomic transaction; single broadcast `bulk:apply` with manifest.
- Acceptance: All‑or‑nothing semantics; single broadcast observed.
- Dependencies: 1.1, 1.3

1.5 Frontend: switch store writes to RPCs

- **Component**: Frontend
- **Files**: `frontend/src/stores/useProjectEditorStore.ts`
- **Implementation Context**:
  - Review current file operations in the store (search for `.from('project_files')`)
  - Check Supabase client configuration: `frontend/src/lib/supabase.ts`
  - Understand current file structure and state management patterns
  - Review TypeScript types: look for existing file interfaces
- **Details**:
  - Replace direct `.from('project_files')` upsert/delete with RPC calls.
  - Normalize to `file_path/file_type` mapping; pass `expected_version` if tracked.
  - `generateProjectStructure()`→ `bulk_upsert_project_files`.
- **Code Implementation**:
  ```typescript
  // In useProjectEditorStore.ts
  const saveFile = async (filePath: string, content: string, fileType: string) => {
    if (FEATURE_FLAGS.FSYNC_USE_RPC) {
      const { data, error } = await supabase.rpc('upsert_project_file', {
        project_uuid: projectId,
        p_file_path: filePath,
        p_content: content,
        p_file_type: fileType,
        expected_version: files[filePath]?.version
      });
      if (error) throw error;
      return data;
    } else {
      // Legacy path...
    }
  };
  ```
- **Testing**:
  - Unit tests in `frontend/src/stores/__tests__/`
  - Integration tests with real Supabase instance
- **Acceptance**:
  - Local saves and deletes succeed; DB rows reflect unified schema.
  - Feature flag allows rollback to legacy behavior
- **Dependencies**: 1.1–1.4

  1.6 Tests: unit/integration for RPCs + store

- Component: SQL, Frontend
- Files: `supabase/*`, `frontend/src/**/__tests__/**`
- Details: Test versioning conflicts, broadcasts, and store flows.
- Acceptance: Tests green locally and in CI.
- Dependencies: 1.1–1.5

### Phase 2 — Snapshot Hydration

2.1 Edge Function `build-project-snapshot`

- **Component**: Supabase Edge Functions
- **Files**: `supabase/functions/build-project-snapshot/index.ts`
- **Implementation Context**:
  - Review existing Edge Functions: `supabase/functions/` for patterns
  - Check Edge Function deployment: `npx supabase functions list`
  - Understand JSZip usage for creating zip files in Deno
  - Review storage upload patterns in existing functions
- **Details**:
  - Input `{ projectId }`; call `list_current_files`; zip `{path,content}`; upload to `project-snapshots/{projectId}/{snapshotId}.zip`; return signed URL + manifest.
  - Service role only.
- **Code Implementation**:
  ```typescript
  // In supabase/functions/build-project-snapshot/index.ts
  import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
  import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
  import JSZip from 'https://esm.sh/jszip@3'
  
  serve(async (req) => {
    const { projectId } = await req.json()
    
    // Create Supabase client with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    
    // Get current files via RPC
    const { data: files } = await supabase.rpc('list_current_files', { project_uuid: projectId })
    
    // Create zip and upload to storage
    const zip = new JSZip()
    files.forEach(file => zip.file(file.file_path, file.content))
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    
    // Upload and return signed URL
    // ...
  })
  ```
- **Testing**:
  - Deploy function: `npx supabase functions deploy build-project-snapshot`
  - Test via HTTP request or Supabase dashboard
- **Acceptance**: Function returns valid signed URL and manifest; large files handled.
- **Dependencies**: 1.3, 0.3

2.2 Orchestrator: integrate snapshot + realtime token

- **Component**: Orchestrator
- **Files**: `orchestrator/src/services/container-manager.ts`
- **Implementation Context**:
  - Review current container provisioning logic in `container-manager.ts`
  - Check existing environment variable passing to containers
  - Understand Fly.io machine creation patterns
  - Review current `ensureProjectReady()` implementation
- **Details**:
  - After `ensureProjectReady()`, call snapshot function; request signed URL.
  - Mint ephemeral realtime token scoped to `realtime:project:{projectId}`.
  - Env to container: `PROJECT_ID`, `SESSION_ID`, `SNAPSHOT_URL`, `REALTIME_TOKEN`; remove `SUPABASE_SERVICE_ROLE_KEY`.
- **Code Implementation**:
  ```typescript
  // In container-manager.ts
  async createSession(projectId: string) {
    await this.ensureProjectReady(projectId)
    
    if (FEATURE_FLAGS.FSYNC_USE_SNAPSHOT_HYDRATION) {
      // Call snapshot Edge Function
      const snapshotResponse = await this.supabase.functions.invoke('build-project-snapshot', {
        body: { projectId }
      })
      
      // Mint realtime token (implementation depends on Supabase client)
      const realtimeToken = await this.mintRealtimeToken(projectId)
      
      return this.provisionContainer({
        PROJECT_ID: projectId,
        SESSION_ID: sessionId,
        SNAPSHOT_URL: snapshotResponse.data.signedUrl,
        REALTIME_TOKEN: realtimeToken,
        // Remove: SUPABASE_SERVICE_ROLE_KEY
      })
    } else {
      // Legacy path...
    }
  }
  ```
- **Acceptance**: New sessions start with correct files; no service role in container env.
- **Dependencies**: 2.1

2.3 Container entrypoint: hydrate from snapshot

- **Component**: Container
- **Files**: `orchestrator/preview-container/entrypoint.js`
- **Implementation Context**:
  - Review current container initialization in `entrypoint.js`
  - Check existing realtime connection setup
  - Understand container file system layout (`/app/project`)
  - Review current file sync mechanisms
- **Details**:
  - Download `SNAPSHOT_URL`, unzip to `/app/project` (stream if large), start dev server, connect Realtime using `REALTIME_TOKEN`.
  - Keep `file:update/delete` handlers.
- **Code Implementation**:
  ```javascript
  // In entrypoint.js
  const fs = require('fs')
  const path = require('path')
  const https = require('https')
  const unzipper = require('unzipper')
  
  async function hydrateFromSnapshot() {
    if (!process.env.SNAPSHOT_URL) {
      console.log('No snapshot URL, skipping hydration')
      return
    }
    
    console.log('Downloading snapshot...')
    const response = await fetch(process.env.SNAPSHOT_URL)
    const arrayBuffer = await response.arrayBuffer()
    
    // Extract to /app/project
    await extractZipToDirectory(Buffer.from(arrayBuffer), '/app/project')
    console.log('Snapshot hydration complete')
  }
  
  // Call before starting dev server
  await hydrateFromSnapshot()
  ```
- **Acceptance**: Cold start yields correct initial file set; subsequent edits apply.
- **Dependencies**: 2.2

  2.4 E2E test: deterministic hydration

- Component: E2E
- Files: `playwright.config.js`, tests under `e2e/`
- Details: Start preview for seeded project; verify initial files, then apply edit and observe container update.
- Acceptance: Test passes in CI.
- Dependencies: 2.3

### Phase 3 — Bulk Generation & Initial Broadcast

3.1 Server bulk upsert optimization

- Component: Supabase SQL
- Files: `supabase/migrations/*`
- Details: Ensure `bulk_upsert_project_files` emits a single `bulk:apply` with file list.
- Acceptance: One broadcast per bulk op; container applies in loop.
- Dependencies: 1.4

  3.2 Frontend generation via bulk RPC

- Component: Frontend
- Files: `frontend/src/stores/useProjectEditorStore.ts`
- Details: Route `generateProjectStructure()` to bulk RPC; refresh store from DB if needed.
- Acceptance: Generated projects hydrate correctly on next session start; no local mismatches.
- Dependencies: 3.1

  3.3 Optional client broadcast gating

- Component: Frontend
- Files: `frontend/src/hooks/usePreviewRealtime.ts`
- Details: Gate client‑authored broadcasts behind `FSYNC_KEEP_CLIENT_BROADCAST`; server remains authoritative.
- Acceptance: With flag off, only server broadcasts are used; edits still sync.
- Dependencies: 1.5

### Phase 4 — Hardening & Cleanup

4.1 Rate limiting + retries

- Component: Supabase SQL, Orchestrator, Container
- Details: Lightweight rate limit in RPCs; backoffs on network errors.
- Acceptance: Flood of edits is throttled without breaking flows.

  4.2 Observability & metrics

- Component: All
- Details: Log `project_id`, `session_id`, `event_type`; metrics for snapshot build time, start latency, event lag.
- Acceptance: Dashboards show green KPIs; alerts configured.

  4.3 Remove legacy paths

- Component: Orchestrator, Container
- Details: Remove storage‑first code paths (e.g., `project-files` bucket reads); update docs.
- Acceptance: Codebase free of dead paths; tests still green.

  4.4 RLS verification + security review

- Component: Supabase
- Details: Verify least‑privilege; ensure SECURITY DEFINER RPCs safe; no service role in containers.
- Acceptance: Checklist signed off.

  4.5 Snapshot performance improvements (optional)

- Component: Edge Function, Container
- Details: Add streaming extraction, manifests, or delta snapshots if needed.
- Acceptance: Startup times improved for large projects.

  4.6 Rollout plan & rollback

- Component: All
- Details: Enable flags in staging; monitor; gradual prod rollout; documented rollback steps (flip flags, revert env).
- Acceptance: Stable prod with flags ON.

## Acceptance Criteria (Global)

- Preview starts hydrate from snapshot and reach “running” in < 15s for small projects.
- Edits persist via RPC and apply to containers in < 500ms median.
- Containers have no service role credentials; realtime uses scoped tokens.
- Frontend uses unified schema and passes unit/E2E tests.

## Risks & Mitigations

- **Realtime token scoping limitations** → fallback to anon key + DB‑enforced channel ACL; plan custom JWT later.
- **Large snapshots** → streaming extraction and future manifest/delta optimization.
- **Legacy schema divergence** → compatibility views and targeted backfills.
- **Feature flag complexity** → Keep flags simple; document rollback procedures clearly.
- **Container startup failures** → Implement retry logic with exponential backoff.
- **Database migration conflicts** → Test migrations on staging with production data volume.

## Development Setup Requirements

Before starting implementation:

1. **Local Supabase**: `npx supabase start` (requires Docker)
2. **Database access**: Ensure you have admin access to development instance
3. **Storage permissions**: Verify bucket creation permissions
4. **Edge Function environment**: Deno runtime for local testing
5. **Container testing**: Docker environment for container entrypoint testing

## Key Files to Review First

Understanding these files is crucial before implementation:

1. **Current schema**: `supabase/migrations/` - understand existing `project_files` structure
2. **Store implementation**: `frontend/src/stores/useProjectEditorStore.ts` - current file operations
3. **Container manager**: `orchestrator/src/services/container-manager.ts` - session creation flow
4. **Container entrypoint**: `orchestrator/preview-container/entrypoint.js` - initialization logic
5. **Realtime setup**: Search for existing realtime patterns in frontend and orchestrator

## Debugging and Monitoring

- **Supabase Logs**: Monitor Edge Function execution in Supabase dashboard
- **Realtime Events**: Use browser dev tools to monitor websocket connections
- **Container Logs**: Monitor Fly.io machine logs during development
- **Database Activity**: Use Supabase SQL editor to monitor RPC execution
- **Feature Flag Status**: Create admin interface to toggle flags safely

## Estimates

- Phase 0: 0.5–1 day
- Phase 1: 1–2 days
- Phase 2: 1–2 days
- Phase 3: 0.5–1 day
- Phase 4: 1–2 days

## Task Seeds (for Tracking)

- SQL: Schema + RLS + view
- SQL: RPC upsert/delete/list (+ bulk)
- Edge Function: build‑project‑snapshot
- Orchestrator: snapshot URL + realtime token
- Container: hydrate from snapshot; remove service role
- Frontend: RPC migration; bulk generation path
- CI/E2E: coverage for hydration + deltas
- Observability: metrics + logs
