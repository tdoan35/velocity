# Implementation Plan — File System Sync v1 (Codex)

## Overview
- Objective: Implement Codex FS‑sync architecture with DB as source of truth, snapshot‑based container hydration, and server‑authored realtime events.
- Outcomes:
  - Deterministic initial container state
  - Secure, minimal container privileges (no service role)
  - Unified schema and APIs (RPCs) for file operations
  - Clear migration path and rollback

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
- Component: Supabase SQL
- Files: `supabase/migrations/*`
- Details:
  - Create/alter table to match the Decisions schema.
  - Add indexes on `(project_id)`, `(project_id, file_path)`, `(project_id, is_current_version)`.
  - Create `project_files_current` view.
- Acceptance:
  - Migration applies cleanly on empty and seeded DB.
  - `SELECT` from `project_files_current` works.
- Dependencies: None
- Rollback: Drop view; revert table changes migration.

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
- Component: Supabase SQL
- Files: `supabase/migrations/*`
- Details:
  - Enable RLS; owners and editors can write, collaborators can read.
  - SECURITY DEFINER functions will enforce author attribution.
- Acceptance:
  - Authenticated owner can upsert/delete; viewer cannot.
- Dependencies: 0.1
- Rollback: Disable RLS for table (temporary), then fix.

0.3 Create `project-snapshots` bucket and policies
- Component: Supabase Storage
- Files: `supabase/db-scripts/storage_buckets_config.sql`
- Details:
  - Create bucket `project-snapshots`.
  - Write allowed only by service role (Edge Function); read via signed URLs.
- Acceptance:
  - Upload via service role succeeds; public read fails; signed URL read succeeds.
- Dependencies: None
- Rollback: Remove bucket and policies.

0.4 Feature flags/env plumbing
- Component: Frontend, Orchestrator
- Files: `frontend/.env*`, `orchestrator/.env*`, config loaders
- Details:
  - Add `FSYNC_USE_RPC`, `FSYNC_USE_SNAPSHOT_HYDRATION`, `FSYNC_KEEP_CLIENT_BROADCAST`.
  - Thread flags to call-sites but keep OFF by default.
- Acceptance:
  - Flags can be toggled in staging to enable new paths.
- Dependencies: None
- Rollback: Set flags to false.

0.5 Developer documentation update
- Component: Docs
- Files: `.docs/*`
- Details:
  - Document schema, flags, and rollout plan.
- Acceptance: Docs merged and referenced in PRs.
- Dependencies: 0.1–0.4

### Phase 1 — RPCs + Server Broadcasts

1.1 RPC `upsert_project_file`
- Component: Supabase SQL
- Files: `supabase/migrations/*`
- Details:
  - Inputs: `project_uuid, p_file_path, p_content, p_file_type, expected_version (NULLABLE)`.
  - Compute `content_hash`; enforce optimistic concurrency if `expected_version` provided.
  - Insert new row; previous head `is_current_version=false`.
  - Broadcast `file:update` on `realtime:project:{project_uuid}` with `{ file_path, content, content_hash, version, timestamp }`.
- Acceptance:
  - Concurrent writes with stale `expected_version` fail with clear error.
  - Event received by a subscriber test channel.
- Dependencies: 0.1–0.2

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
- Component: Frontend
- Files: `frontend/src/stores/useProjectEditorStore.ts`
- Details:
  - Replace direct `.from('project_files')` upsert/delete with RPC calls.
  - Normalize to `file_path/file_type` mapping; pass `expected_version` if tracked.
  - `generateProjectStructure()`→ `bulk_upsert_project_files`.
- Acceptance:
  - Local saves and deletes succeed; DB rows reflect unified schema.
- Dependencies: 1.1–1.4

1.6 Tests: unit/integration for RPCs + store
- Component: SQL, Frontend
- Files: `supabase/*`, `frontend/src/**/__tests__/**`
- Details: Test versioning conflicts, broadcasts, and store flows.
- Acceptance: Tests green locally and in CI.
- Dependencies: 1.1–1.5

### Phase 2 — Snapshot Hydration

2.1 Edge Function `build-project-snapshot`
- Component: Supabase Edge Functions
- Files: `supabase/functions/build-project-snapshot/index.ts`
- Details:
  - Input `{ projectId }`; call `list_current_files`; zip `{path,content}`; upload to `project-snapshots/{projectId}/{snapshotId}.zip`; return signed URL + manifest.
  - Service role only.
- Acceptance: Function returns valid signed URL and manifest; large files handled.
- Dependencies: 1.3, 0.3

2.2 Orchestrator: integrate snapshot + realtime token
- Component: Orchestrator
- Files: `orchestrator/src/services/container-manager.ts`
- Details:
  - After `ensureProjectReady()`, call snapshot function; request signed URL.
  - Mint ephemeral realtime token scoped to `realtime:project:{projectId}`.
  - Env to container: `PROJECT_ID`, `SESSION_ID`, `SNAPSHOT_URL`, `REALTIME_TOKEN`; remove `SUPABASE_SERVICE_ROLE_KEY`.
- Acceptance: New sessions start with correct files; no service role in container env.
- Dependencies: 2.1

2.3 Container entrypoint: hydrate from snapshot
- Component: Container
- Files: `orchestrator/preview-container/entrypoint.js`
- Details:
  - Download `SNAPSHOT_URL`, unzip to `/app/project` (stream if large), start dev server, connect Realtime using `REALTIME_TOKEN`.
  - Keep `file:update/delete` handlers.
- Acceptance: Cold start yields correct initial file set; subsequent edits apply.
- Dependencies: 2.2

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
- Realtime token scoping limitations → fallback to anon key + DB‑enforced channel ACL; plan custom JWT later.
- Large snapshots → streaming extraction and future manifest/delta optimization.
- Legacy schema divergence → compatibility views and targeted backfills.

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
