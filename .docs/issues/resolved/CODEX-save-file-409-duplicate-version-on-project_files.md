# Issue: 409 duplicate key when saving files (project_files version)

- Report ID: CODEX-save-file-409-duplicate-version-on-project_files
- Date: 2025-09-12
- Reporter: Codex
- Priority: High

## Summary

Saving a file from the Project Editor results in HTTP 409 from Supabase RPC with error code 23505 (unique constraint violation) on `project_files_project_id_file_path_version_key`. The error surfaces as repeated logs like:

- Failed to save file: frontend/App.js
- duplicate key value violates unique constraint "project_files_project_id_file_path_version_key"
- Key (project_id, file_path, version)=(..., frontend/App.js, 1) already exists.

## Reproduction

- Navigate to `/project/<id>/editor`, switch to Code view.
- Edit a file (e.g., `frontend/App.js`) and save.
- Browser console/network shows calls to `.../rest/v1/rpc/insert_project_file` returning 409.

## What’s happening

- The database table `public.project_files` enforces `UNIQUE(project_id, file_path, version)`.
- The `version` column has `DEFAULT 1`.
- A BEFORE INSERT trigger `public.handle_file_versioning()` intends to set `NEW.version` to the next version (MAX(version) + 1) when no version is provided.
- Because of `DEFAULT 1`, `NEW.version` is not NULL during BEFORE INSERT, so the trigger’s “if NEW.version IS NULL then compute next version” never runs.
- Inserts arrive without specifying `version`, and due to the default, always try to insert `version = 1` → second and subsequent saves hit 23505 and bubble to a 409 response.

## Evidence and references

- Unique index and default in schema:
  - `supabase/db-scripts/core_database_schema.sql:260`
  - `supabase/db-scripts/database_schema_with_rls.sql:76`
- Trigger definition that only updates when version is NULL:
  - `supabase/db-scripts/database_triggers_functions.sql:331`
- Trigger attached BEFORE INSERT/UPDATE on project_files:
  - `supabase/db-scripts/database_triggers_functions.sql:692`
- Frontend calls for saving files (unified store):
  - `frontend/src/stores/useUnifiedEditorStore.ts:284` (RPC `upsert_project_file` with `expected_version`)
  - Project editor uses this store and CodeEditor:
    - `frontend/src/pages/ProjectEditor.tsx:496` (CodeEditor onSave → saveFile)
    - `frontend/src/components/editor/code-editor.tsx:120` (Monaco mounted log)
- Browser shows `insert_project_file` RPC endpoint, suggesting at least one RPC path still uses an insert-only function.

## Secondary inconsistencies (likely contributing)

- The trigger uses `NEW.file_hash` while the table column is `content_hash`:
  - Trigger code: `supabase/db-scripts/database_triggers_functions.sql:356`
  - Table column: `supabase/db-scripts/core_database_schema.sql:265`
  - This drift suggests recent refactors didn’t fully update DB scripts.

## Root cause

- Schema/trigger mismatch: `version DEFAULT 1` prevents the versioning trigger from computing the next version for inserts. Any insert without explicit `version` repeats `1`, violating uniqueness.
- RPC pathway mismatch: Client is hitting `insert_project_file` (insert-only semantics) rather than an idempotent/optimistic upsert that increments version. Combined with the default issue, conflicts are guaranteed on second save.

## Impact

- Users cannot reliably save edits; duplicate key 409s occur.
- Auto-save or repeated saves exacerbate the issue (multiple failing attempts).
- Version history and is_current_version maintenance likely incorrect/incomplete.

## Recommended fixes

1) Database schema and trigger
- Remove the default on `version` so BEFORE INSERT can compute proper version.
  - SQL: `ALTER TABLE public.project_files ALTER COLUMN version DROP DEFAULT;`
- Update `handle_file_versioning()` to:
  - Always compute `NEW.version` for INSERT when the row is new for `(project_id, file_path)`.
  - Set `NEW.content_hash` (not `file_hash`).
  - Optionally, for content-unchanged inserts, short-circuit or avoid new versions.
- Ensure previous current version is demoted (`is_current_version = false`) when a new version is inserted, and new row has `is_current_version = true`.

2) RPC function contract
- Provide/standardize a single function `upsert_project_file(project_uuid, p_file_path, p_content, p_file_type, expected_version)` that:
  - Looks up current row for `(project_id, file_path)`.
  - If `expected_version` is provided and mismatches current, return a domain error (e.g., `P0002` with “version conflict”) so the client can refresh and retry.
  - If matches or null, insert a new row with `version = current_version + 1` (computed in SQL), demote previous current, set new row as current.
  - Return the new row (id, version, updated_at, content_hash).
- Deprecate any `insert_project_file` RPC still used by the client.

3) Frontend safeguards
- Ensure only unified store triggers saves on the editor page:
  - `frontend/src/pages/ProjectEditor.tsx` currently uses `useUnifiedEditorStore`.
  - Audit for residual usage of the deprecated store on this page and its children; remove any legacy save paths that might call `insert_project_file`.
- On 409/version conflict, refresh the file from DB and retry once with the new `expected_version`.
  - The current retry helper `frontend/src/utils/retryUtils.ts` supports retryable errors; extend to treat version conflicts as retryable once after a refresh.

## Validation steps (post-fix)

- Apply schema change and updated trigger in local Supabase, restart services if needed.
- Confirm `rest/v1/rpc/upsert_project_file` exists and returns the new version on save.
- From the editor:
  - Edit and save the same file multiple times.
  - Observe `version` increments (1 → 2 → 3) without 409s.
  - Confirm previous rows have `is_current_version = false` and the latest is `true`.
- Confirm network no longer calls `insert_project_file` from the editor flow.

## Notes

- The commit log contains messages implying this drift was recognized (“Fixed duplicate version constraint violations by separating function and trigger responsibilities”), but DB scripts still contain the conflicting default and mismatched column name.
- Removing the `version` default and updating the trigger provides a robust foundation regardless of the exact RPC used.

## Appendix: Key references

- Schema default and unique:
  - supabase/db-scripts/core_database_schema.sql:260
  - supabase/db-scripts/database_schema_with_rls.sql:76
- Trigger and attachment:
  - supabase/db-scripts/database_triggers_functions.sql:331
  - supabase/db-scripts/database_triggers_functions.sql:692
- Frontend save flow:
  - frontend/src/stores/useUnifiedEditorStore.ts:284
  - frontend/src/pages/ProjectEditor.tsx:496
  - frontend/src/components/editor/code-editor.tsx:120


## Consensus and Additional Observations (Claude + Gemini)

- Consensus root cause (multi-layered):
  - Primary: `version DEFAULT 1` blocks the BEFORE INSERT trigger from auto-incrementing, guaranteeing a duplicate on second insert for the same `(project_id, file_path)`.
  - Secondary: Version calculation via `MAX(version) + 1` is non-atomic and risks collisions under concurrency. No demotion of previous `is_current_version` is implemented in DB scripts, so multiple current versions can exist.
  - Tertiary: Client-side state update in `useUnifiedEditorStore.saveFile` uses a stale captured `files` object after `await`, risking incorrect `expected_version` and overwriting concurrent in-flight state updates. A functional `set(state => ...)` form avoids this.
  - Quaternary: Monaco auto-save is debounced to 500ms and already clears the prior timeout, but manual Cmd+S or fast edits can still create closely spaced saves; improved server-side optimistic concurrency remains necessary.

- Clarifications vs. other reports:
  - Duplicate constraints: We did not find two separate unique constraints in repo DB scripts. If observed in a live DB, it’s likely migration drift and should be corrected by dropping the duplicate.
  - RPC endpoint name: Browser network shows `...sert_project_file`; code paths consistently call `upsert_project_file`. The truncated log likely refers to `upsert_project_file`, not `insert_project_file`.

- Additional repo findings:
  - Trigger column mismatch: Trigger writes `NEW.file_hash` while schema defines `content_hash` (see database_triggers_functions.sql:355 vs core_database_schema.sql:265). This should be aligned to `content_hash`.
  - No demotion logic: DB scripts contain `is_current_version boolean DEFAULT true` but no trigger/function to set the previous version’s `is_current_version=false` when inserting a new version.
  - Unified store loads all versions: `useUnifiedEditorStore.initializeProjectFiles` and `refreshProjectFiles` select `*` from `project_files` without filtering `is_current_version=true` or ordering by latest. This can load multiple versions for the same path and lead to non-deterministic “current” content selection.
    - References: frontend/src/stores/useUnifiedEditorStore.ts:56 (schema fields), :84 (files mapping), :169 (refresh), :300 (saveFile expected_version usage).

## Consolidated Action Plan

- Database
  - Drop default on `version` and update trigger to always compute next version; change `file_hash` → `content_hash`.
  - Add logic to demote previous `is_current_version` on new insert and set the new row as current (transactionally safe, e.g., CTE with UPDATE+INSERT).
  - Make version increments atomic (e.g., SELECT … FOR UPDATE on the latest row for the path, or per-file sequences) to prevent race conditions.
  - If a duplicate unique constraint exists in live DB, drop the duplicate to avoid redundant overhead/confusion.

- RPC
  - Ensure `upsert_project_file` enforces optimistic concurrency using `expected_version`, returning a domain error (e.g., code `P0002`) on mismatch so the client can refresh and retry.

- Frontend
  - Refactor `useUnifiedEditorStore.saveFile` to use functional `set(state => ...)` for both “mark saving” and “apply saved” updates, as outlined in Gemini’s fix.
  - In `initializeProjectFiles` and `refreshProjectFiles`, fetch only current versions (`.eq('is_current_version', true)`) or explicitly order by version desc and pick the latest per path.
  - Keep Monaco debounce; do not rely on client debounce alone to ensure correctness—server-side OCC remains the source of truth.

## Implementation Plan (Long‑Term, Robust)

### Goals
- Eliminate duplicate key conflicts on save under all conditions (including concurrency).
- Guarantee single current version per file and correct version increments.
- Prevent no‑op version bumps when content is unchanged.
- Provide clear, retryable error semantics for client conflict resolution.

### Design Overview
- Centralize versioning in a single RPC layer that takes an advisory lock per (project_id, file_path), verifies `expected_version`, deduplicates same‑content saves using `content_hash`, and atomically inserts the next version while demoting the previous current.
- Simplify triggers to compute `content_hash` and `file_size` only. Remove version auto‑increment from triggers.
- Enforce “one current per file” via a partial unique index.

### Database Changes
1) Column and constraint adjustments
- Drop default on `version` to allow server logic to own version assignment:
  - `ALTER TABLE public.project_files ALTER COLUMN version DROP DEFAULT;`
- Enforce single current per file (project, path):
  - `CREATE UNIQUE INDEX IF NOT EXISTS uniq_project_files_current ON public.project_files(project_id, file_path) WHERE is_current_version;`

2) Trigger refactor (public.handle_file_versioning)
- Responsibility: set metadata only; do not assign `version`.
- Compute and store `content_hash` and `file_size` consistently:
  - Replace `NEW.file_hash := encode(sha256(NEW.content::bytea), 'hex');` with `NEW.content_hash := encode(sha256(COALESCE(NEW.content, '')::bytea), 'hex');`
- Keep `updated_at` triggers as‑is.

3) Data hygiene (one‑time migration script)
- Backfill missing `content_hash` where null.
- For any `(project_id, file_path)` groups with multiple `is_current_version=true`, set only the max(version) true, others false.
- Optional: For rows created with `version=1` duplicates, keep the earliest by `created_at` or the one referenced by dependents; demote others and renumber only if necessary (prefer not to renumber versions).

### RPC Functions (Security Definer)
All RPCs should be `SECURITY DEFINER` with RLS‑safe checks and minimal surface.

1) `upsert_project_file(project_uuid uuid, p_file_path text, p_content text, p_file_type text, expected_version int)`
- Steps:
  - `PERFORM pg_advisory_xact_lock(hashtextextended(project_uuid::text || '|' || p_file_path, 0));`
  - Fetch current row (`is_current_version=true`).
  - If `expected_version` is non‑null and mismatches current.version, `RAISE` with `USING ERRCODE = 'P0002'` and message ‘version conflict: expected X, got Y’.
  - Compute `content_hash`; if equals current.content_hash, return current row (no new version).
  - Demote previous current (`UPDATE ... SET is_current_version=false WHERE id=current.id`).
  - Insert new row with `version = current.version + 1` (or 1 if no current), `parent_version_id = current.id`, `is_current_version=true`, and set `created_by/last_modified_by` to `auth.uid()` or the service identity as appropriate.
  - Return the inserted row.

2) `delete_project_file(project_uuid uuid, p_file_path text, expected_version int)`
- Lock on (project_uuid, p_file_path), enforce `expected_version` if provided, delete the current version, and either:
  - Promote the previous version (max(version) remaining) to `is_current_version=true`, or
  - If no versions remain, remove the file entirely.

3) `bulk_upsert_project_files(project_uuid uuid, files jsonb)`
- Iterate with the same per‑file locking semantics and dedupe by content hash.
- Return an array of `{ file_path, version, content_hash }` for client reconciliation.

4) Optional helpers
- `get_current_project_files(project_uuid uuid)` that returns only `is_current_version=true` rows.
- `restore_project_file_version(project_uuid uuid, p_file_path text, target_version int)` to copy content from an old version as a new current version.

### Frontend Changes
1) Zustand store robustness
- Use functional `set(state => ...)` in `saveFile` for both “mark saving” and “apply saved” mutations to avoid stale state overwrites.
- On error code `P0002` or message containing ‘version conflict’, auto‑refresh the single file from DB and retry once with updated `expected_version`.

2) Query only current versions
- In `initializeProjectFiles` and `refreshProjectFiles`, select with `.eq('is_current_version', true)`. If not possible, group by path and keep the max(version) locally.

3) No‑op saves
- If the store knows the current `content_hash` and new content’s hash matches, skip the save call to reduce load.

4) UX improvements
- Surface a subtle toast when a conflict retry happens; if it still fails, show a diff prompt (optional, post‑MVP).

### Orchestrator/Preview Changes
- Wherever the preview container pulls from `project_files`, read only `is_current_version=true`.
- When seeding template files for empty projects, use `bulk_upsert_project_files` so seeds respect versioning and set `is_current_version` correctly.

### Realtime Sync
- Keep existing Realtime subscriptions; when handling `INSERT/UPDATE/DELETE`, re‑fetch only current versions to update the store to a consistent view.

### Testing Strategy
1) Database
- Unit tests for `upsert_project_file`: version increment, no‑op dedupe, conflict error code, demotion of prior current.
- Concurrency tests using two transactions with advisory locks disabled/enabled to validate correctness.

2) Frontend
- Store tests to ensure functional updates preserve concurrent edits and correct version propagation.
- Simulated conflict tests: mock RPC to throw `P0002` on first call, succeed on retry; verify state.

3) E2E (Playwright)
- Rapid save typing test; ensure no 409s, versions increment, preview reflects the latest.
- Two‑tab concurrent edit test to validate OCC UX.

### Rollout Plan
- Create a single SQL migration (timestamped) applying: drop default, trigger refactor, unique partial index, RPC functions, and data hygiene.
- Apply locally (Supabase CLI) and verify with seed data.
- Update frontend store and ship together; verify manual saves and rapid edits.

### Telemetry and Ops
- Log conflict occurrences in RPC (anonymized), include project_id, path, expected vs current version (no content).
- Add Grafana/Logs dashboard panels for error rates post‑deployment.

### Acceptance Criteria
- Saving a file increments version deterministically without 409 conflicts.
- Only one `is_current_version=true` row exists per (project_id, file_path).
- No version bump when content is unchanged.
- Client gracefully retries once on conflicts and updates UI if user intervention is needed.
