# File System Sync — Codex Architecture Recommendation

This document proposes a robust, scalable, security‑minded architecture for end‑to‑end file synchronization between the frontend editor, Supabase, and preview containers. It addresses the current gaps (storage vs DB mismatch, initial hydration, schema inconsistencies, realtime flows) and lays out a migration path from today’s code to a long‑term solution.

## Goals

- Single, authoritative source of truth for project files and versions
- Deterministic initial container hydration with fast startup
- Low‑latency live updates while editing
- Strong authN/authZ (no service role in containers)
- Horizontal scalability to 100k+ concurrent sessions
- Clear observability and failure recovery

## Non‑Goals

- Full CRDT/OT collaborative editing in the first iteration (design hooks included for future)
- Git‑style branching/merging (future enhancement)

## Design Principles

- DB is the canonical record of current and historical file contents and metadata
- Storage is for large artifacts and ephemeral delivery (snapshots/bundles)
- Event‑driven propagation, with idempotent, replayable operations
- Strict separation of privileges: containers do not have service‑role access
- Backwards‑compatible, staged rollout with measurable checkpoints

## Source of Truth

PostgreSQL (`project_files`) is the source of truth for code files. Supabase Storage is used for:
- Project snapshots for initial container hydration (`project-snapshots` bucket)
- Bundles/assets for previews (`preview-bundles`, already present)
- Binary assets (images/fonts) in `project-assets`

Rationale: DB offers transactional writes, versioning, auditing, and immediate fan‑out via Realtime. Storage is optimized for static artifact distribution and large payloads.

## Data Model & Schema

Standardize on a single `project_files` schema across all codepaths (frontend, orchestrator, functions). Recommended shape (merge of existing variants):

```
project_files (
  id uuid PK DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  file_path text NOT NULL,              -- e.g. 'frontend/src/App.tsx'
  file_type text NOT NULL,              -- 'typescript' | 'javascript' | 'json' | 'markdown' | 'sql' | 'text' | ...
  content text,                         -- code files content (NULL for binary)
  content_hash text,                    -- sha256 for change detection & concurrency
  version integer NOT NULL DEFAULT 1,
  parent_version_id uuid REFERENCES project_files(id),
  is_current_version boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES user_profiles(id),
  last_modified_by uuid REFERENCES user_profiles(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(project_id, file_path, version)
)
```

Add a view for quick “current” reads:

```
CREATE VIEW project_files_current AS
SELECT * FROM project_files WHERE is_current_version = true;
```

Indexes: `(project_id)`, `(project_id, file_path)`, `(project_id, is_current_version)`.

Note on binaries: For binary assets, store metadata rows in `project_files` with `is_current_version=true` and the binary in `project-assets` storage; `content` is NULL and `content_hash` refers to the storage object.

## Server‑Side RPC API (Postgres functions)

Centralize file mutations in RPC functions to enforce versioning, hashing, RLS, and broadcasting:

- `upsert_project_file(project_uuid uuid, p_file_path text, p_content text, p_file_type text, expected_version int DEFAULT NULL)`
  - Validates project access via RLS
  - Computes `content_hash`
  - If `expected_version` provided, enforces optimistic concurrency; else last‑write‑wins with version bump
  - Sets previous row `is_current_version=false`, inserts new version row, returns new head
  - Broadcasts `file:update` to `realtime:project:{project_id}`

- `delete_project_file(project_uuid uuid, p_file_path text, expected_version int DEFAULT NULL)`
  - Inserts a tombstone version (or marks deleted in metadata) and broadcasts `file:delete`

- `list_current_files(project_uuid uuid)`
  - Returns `(file_path, file_type, content, content_hash, version, updated_at)` from `project_files_current`

- `create_project_snapshot(project_uuid uuid) RETURNS jsonb` (or background job)
  - Materializes current files into a zip, uploads to `project-snapshots/{project_id}/{snapshot_id}.zip`, returns signed URL + manifest

These RPCs become the single entry points for writes. Frontend and orchestrator call them instead of raw `insert/upsert` to the table.

## Realtime Event Model

Use one channel per project: `realtime:project:{project_id}`.

Events:
- `file:update`: `{ file_path, content, content_hash, version, timestamp, sender }`
- `file:delete`: `{ file_path, version, timestamp, sender }`
- `bulk:apply`: `{ files: [{ action: 'update'|'delete', file_path, content? }], timestamp }` (optional for migrations)
- `snapshot:ready`: `{ snapshot_url, manifest, timestamp }` (optional if orchestrator manages directly)

Origin of truth for events should be server‑side (RPC/trigger). The frontend may optimistically broadcast to reduce latency, but server broadcasts are authoritative.

## Container Lifecycle & Sync Flow

1) Session start (orchestrator)
- Validate project, ensure files exist (may auto‑template for new projects)
- Call `create_project_snapshot(project_id)` to generate a zip of current files
- Upload to `project-snapshots/{project_id}/{session_id}.zip`, get a short‑lived signed URL
- Provision Fly machine with:
  - `PROJECT_ID`, `SESSION_ID`
  - `SNAPSHOT_URL` (signed), no service role key
  - `REALTIME_TOKEN` (ephemeral, scoped to `realtime:project:{project_id}`)

2) Container initialization
- Download and expand `SNAPSHOT_URL` into local `/app/project`
- Start dev server (e.g., Vite) and connect to realtime channel using `REALTIME_TOKEN`
- Apply incremental events (`file:update`, `file:delete`) to the FS in real time

3) Runtime updates
- Frontend saves file → calls RPC `upsert_project_file(...)`
  - DB updates version/head, server broadcasts `file:update`
  - Container receives event and writes to FS

4) Session end
- Container stops; no data written back from container to DB (source of truth remains DB)

Notes:
- Remove `SUPABASE_SERVICE_ROLE_KEY` from container env to minimize blast radius
- If snapshot is large, allow streaming extraction; otherwise keep it simple

## AuthN/AuthZ

- Frontend uses user session (anon key) with RLS
- Orchestrator uses service role (server‑side only)
- Container uses:
  - One ephemeral, scoped realtime token (WS only), minted by orchestrator
  - One pre‑signed URL for snapshot download, expires in minutes
- RLS ensures only authorized users can write project files

## Failure Handling & Idempotency

- All RPCs must be idempotent on `correlation_id` (optional), or via `content_hash + expected_version`
- Container startup fallback:
  - If snapshot download fails → retry with backoff; if repeated failures → orchestrator regenerates snapshot
  - If realtime connection fails → exponential backoff, surface degraded status
- Event application in container should be idempotent (skip if `content_hash` unchanged)

## Performance & Scalability

- Caching:
  - Cache project manifests (paths + hashes) in Redis to speed snapshot generation
  - Cache signed snapshot URLs in orchestrator for quick restarts
- Batch operations:
  - For bulk inserts (AI generation, template), use bulk RPC that writes in a single transaction and emits a single `bulk:apply` event (optional)
- Realtime throughput:
  - Debounce UI broadcasts; server broadcasts as authoritative
  - Rate limit per channel at DB function level (as needed)
- Storage layout:
  - `project-snapshots/{project_id}/{session_id}.zip`
  - `project-assets/{project_id}/...`

## Observability

- Structured logs with `project_id`, `session_id`, `event_type`
- Metrics: snapshot build latency, session start time, event lag, container health
- Audit: DB retains full version history in `project_files`

## Migration Plan (Phased)

Phase 0 — Prep (0.5–1 day)
- Align on final `project_files` schema; add `project_files_current` view
- Create buckets: `project-snapshots`, confirm `preview-bundles`, `project-assets`
- Introduce feature flags for new flows

Phase 1 — RPC + Server Broadcasts (1–2 days)
- Implement RPCs: `upsert_project_file`, `delete_project_file`, `list_current_files`
- Add server‑side broadcasting in RPCs; editor can keep client broadcast for UX but it’s optional
- Update frontend store to call RPC for saves/deletes

Phase 2 — Container Snapshot Hydration (1–2 days)
- Implement `create_project_snapshot` (server job) and signed URL delivery
- Update orchestrator to pass `SNAPSHOT_URL` + `REALTIME_TOKEN` to containers; remove service role from env
- Update container entrypoint to download snapshot instead of reading storage directly

Phase 3 — Bulk Generation & Initial Broadcast (0.5–1 day)
- When generating defaults/AI files, call bulk RPC and optionally emit `bulk:apply`
- Ensure editor reloads local state from `list_current_files` after generation

Phase 4 — Hardening & Cleanup (1–2 days)
- Rate limiting, backpressure, retries
- Health checks and detailed metrics
- Deprecate legacy storage‑based initial sync path

## Implementation Notes (Code Touchpoints)

- Frontend
  - `useProjectEditorStore`: switch raw `upsert/delete` to RPC calls; standardize on `file_path`/`file_type`
  - Optionally keep optimistic client broadcast but rely on server broadcast for containers

- Orchestrator
  - `ContainerManager.createSession`: call snapshot RPC/job, upload to `project-snapshots`, mint `REALTIME_TOKEN`, pass to container
  - Remove hardcoded use of storage bucket `project-files`

- Container
  - Replace `SUPABASE_SERVICE_ROLE_KEY` usage with `REALTIME_TOKEN` and `SNAPSHOT_URL`
  - Apply events idempotently using `content_hash`

- Supabase (SQL)
  - Consolidate `project_files` schema and RLS
  - Implement RPCs with server broadcasts
  - Add indexes and the `project_files_current` view

## Future Enhancements

- Partial updates (patches/diffs) to reduce payload sizes
- OT/CRDT for multi‑user concurrent edits
- Background snapshot compaction and delta snapshots
- Kafka/NATS bridge for multi‑region fan‑out at extreme scale

## Open Questions

- Do we need bi‑directional edits from container to DB (e.g., codegen running inside container)? If yes, add a minimal, scoped write token flow.
- How big can projects get before snapshot streaming is required? Baseline implementation can switch to streaming easily.

---

This architecture eliminates the DB/Storage mismatch, removes privileged keys from containers, centralizes invariants in RPCs, and scales through snapshot hydration plus server‑authored realtime broadcasts. It provides a clear path from the current code to a production‑grade system.

