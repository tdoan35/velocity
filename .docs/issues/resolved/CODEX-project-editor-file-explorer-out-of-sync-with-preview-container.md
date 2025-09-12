Title: Project Editor file explorer and editor out-of-sync with preview container files

Summary
- Symptom: On the ProjectEditor page, after fixing the Monaco autosave revert issue, the files shown in the file explorer and the code shown in the editor do not reflect the code that the preview session container is actually running.
- Scope for this investigation: Synchronization between the file explorer/editor (frontend store) and the preview container/back-end file state. No code changes made; this is a findings report.

What “should” be happening
- Source of truth: Supabase `project_files` current versions.
- Container hydration: Orchestrator optionally builds a snapshot via `build-project-snapshot` Edge Function which calls RPC `list_current_files` for the project, then hydrates the container (Fly.io) with those files (container-manager.ts Phase 0.7).
- Frontend explorer/editor: `useProjectEditorStore.initializeProject()` should load the project’s current files into in-memory file trees (`frontendFiles`, `backendFiles`, `sharedFiles`) so the explorer and editor mirror back-end state. Edits should persist via `saveFile()` and, if realtime is enabled, the container/HMR should reflect them.

What actually happens (key observations)
1) Frontend has no live subscription to back-end or container file changes
   - `FullStackFileExplorer` and `EnhancedEditorContainer` rely on `useProjectEditorStore` state and only load files on initialization or after explicit actions. There is no realtime subscription to `project_files` (Postgres changes) nor handling of inbound `file:update` broadcasts to refresh the store.
   - Result: Once initialized, the explorer/editor can become stale if the container or another client updates files, or if the back-end state changes (e.g., snapshot created, server-side changes).

2) Feature flag gating can disable client broadcasts to the container
   - `usePreviewRealtime.broadcastFileUpdate` checks `FSYNC_KEEP_CLIENT_BROADCAST`. If disabled (default on errors), no client broadcasts are sent, so the container may not receive incremental changes after startup unless another bridging path exists.
   - Conversely, even when the container applies changes (e.g., via another source), the frontend does not consume inbound updates to keep the explorer in sync.

3) Legacy initialization path in `useProjectEditorStore.initializeProject` is inconsistent with container hydration and contains a field-mapping bug
   - When `FSYNC_USE_RPC` is true: files are loaded via `list_current_files` RPC and mapped to the expected format; this aligns with snapshot hydration.
   - When `FSYNC_USE_RPC` is false or the RPC call fails: the store falls back to a direct query `from('project_files').select('*').eq('project_id', projectId)`, but then it incorrectly references `file.path` and `file.type` instead of `file.file_path` and `file.file_type` when constructing file tree entries. This can lead to incorrect or empty file paths in the store and an explorer that doesn’t match the DB/container files.
   - Additionally, the legacy fallback does not filter to `is_current_version = true`, so it may hydrate stale/non-current versions, while the container snapshot uses current versions. This creates a direct divergence even if the field mapping bug didn’t bite.

4) Possible startup race between project file creation and preview auto-start
   - ProjectEditor auto-starts the preview ~1.5s after initialization. If defaults are being inserted into `project_files` during initialization (first project/open), the container snapshot could be taken before these writes complete, resulting in different files in the container than in the explorer state.
   - Logs show initialization and auto-start are decoupled; there is no explicit gating that snapshot builds only after the DB reflects the latest set.

Evidence (code references)
- Frontend store initialization and legacy fallback:
  - `frontend/src/stores/useProjectEditorStore.ts:191` (initializeProject), RPC usage at `:212`, fallback direct query at `:239`, file hydration using `file.path` and `file.type` at `:400`+ (incorrect for fallback which returns `file_path/file_type`).
- Container snapshot hydration:
  - `orchestrator/src/services/container-manager.ts:95-118` (feature flag check); `:104-116` calls Edge Function to build snapshot via `list_current_files`.
  - `supabase/functions/build-project-snapshot/index.ts:54-63` (reads `list_current_files` and zips files).
- Frontend realtime broadcast (client → container):
  - `frontend/src/hooks/usePreviewRealtime.ts:140-170` (flag-gated broadcast, no inbound store updates).
- Missing frontend inbound sync:
  - No subscription in frontend to `project_files` changes or to a `file:update` consumer that updates `useProjectEditorStore`.

Root Causes
- Primary: Lack of a bidirectional sync mechanism between container/back-end and the file explorer/editor state. The frontend loads files once and does not refresh from back-end or consume realtime updates, while the container is hydrated independently and may diverge.
- Secondary: Inconsistent legacy code path in `initializeProject()`
  - Field mapping bug in fallback path (`file.path` vs `file.file_path`, `file.type` vs `file.file_type`).
  - No `is_current_version` filtering in fallback path, diverging from snapshot hydration (which uses current versions via RPC).
- Contributing: Potential timing race where preview auto-start snapshot is built before default files are fully persisted.

Impacts
- Explorer/editor may show a different set of files and contents than the preview container, confusing users and causing incorrect assumptions about HMR and “live” state.
- In environments where FSYNC_USE_RPC is disabled or RPCs fail, the legacy path bug can result in empty or mis-keyed file entries in the store.

Validation suggestions (non-invasive)
- Add temporary logging:
  - In `initializeProject()`: log whether RPC or fallback path used, the count of files in each tree, and a few sample paths. Already partially present (`[ProjectEditor] Using RPC path:`, `File distribution`). Confirm values at runtime.
  - In `saveFile()`: log normalized path, new version (from RPC), and whether DB write succeeded.
  - On session start: log that snapshot hydration is enabled/disabled and compare snapshot manifest count to store count.
- Manually compare DB current files vs. store:
  - Query `project_files` filtered by `is_current_version = true` and compare to `useProjectEditorStore` keys.
  - If fallback path is active, confirm the field mapping mismatch.
- Check FSYNC feature flags in the environment: `FSYNC_USE_RPC`, `FSYNC_SNAPSHOT_HYDRATION`, `FSYNC_KEEP_CLIENT_BROADCAST`, and whether RPC functions are deployed.

Recommendations (for subsequent work; not implemented here)
- Frontend sync improvements:
  - Subscribe to `project_files` Postgres changes for the current project and update `useProjectEditorStore` accordingly (de-duplicate by path+version; respect `is_current_version`).
  - Optionally, consume inbound `file:update` broadcasts to update the store when the preview container (or other clients) sends changes.
  - Add a manual “Refresh from backend” action to force re-pull of current files via RPC.
- Fix legacy initialization path:
  - Use correct columns (`file.file_path`, `file.file_type`).
  - Filter to `is_current_version = true` to match container snapshot semantics.
- Session start ordering:
  - Ensure initialization and default file insertion complete (and are visible via RPC) before building the snapshot and starting the container (or add a small poll to confirm file presence).
- Feature flags:
  - Decide defaults so local development prefers RPC + broadcasts enabled; log clearly when flags disable critical paths.

Notes
- This report focuses on explorer ↔ container/back-end sync only, as requested. It does not address editor buffering or Monaco behaviors beyond noting the prior autosave fix.

