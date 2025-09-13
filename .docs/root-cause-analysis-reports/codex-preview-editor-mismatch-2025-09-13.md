Title: Preview iframe shows different app than Code Editor (App.js)
Date: 2025-09-13
Owner: Codex

Summary
- Symptom: On Project Editor page `/project/af219acf-30d5-45c5-83a9-1f70205877ac/editor`, the Code Editor shows a React Native-style `App.js` while the preview iframe renders a Vite React demo page showing “🚀 Velocity Preview Container … Edit src/App.jsx and save to test HMR…”.
- Impact: Users see different sources between editor and running preview. Edits in the editor do not reflect in the container.

Root Cause
- Source-of-truth mismatch between the editor and preview container hydration.
  - Editor files load from the Supabase `project_files` table via `useUnifiedEditorStore`.
    - frontend/src/stores/useUnifiedEditorStore.ts → `initializeProjectFiles()` reads from `project_files` and defaults to a placeholder if empty.
  - Preview container hydrates its filesystem from either:
    1) Snapshot ZIP (feature-flagged), or
    2) Legacy Supabase Storage bucket `project-files/<projectId>/...`.
    - orchestrator/preview-container/entrypoint.js
      - Snapshot path: `hydrateFromSnapshot()` (SNAPSHOT_URL env)
      - Legacy path: `performInitialFileSync()` reads from Storage bucket `project-files`
      - If neither provides files, it creates a default Vite React app (`createDefaultProject()`)
- In the observed session, snapshot hydration was not in effect and no files existed in the `project-files` storage bucket, so the container fell back to a default Vite app which renders the “Velocity Preview Container” page.
- The React Native `App.js` text shown in the editor matches the React Native template that our TemplateService can insert into `project_files` (not the container’s default Vite app template).
  - orchestrator/src/services/template-service.ts → React Native template includes the exact RN `App` code snippet reported.
  - The preview iframe’s exact text matches the subdomain entrypoint’s default Vite page.
    - orchestrator/preview-container/entrypoint-subdomain.js writes `src/App.jsx` with the “🚀 Velocity Preview Container … Edit src/App.jsx…” content.

Evidence
- Editor side (DB-backed files):
  - frontend/src/stores/useUnifiedEditorStore.ts (reads `project_files`, not storage)
- Container side (FS hydration inside container):
  - orchestrator/preview-container/entrypoint.js
    - `hydrateFromSnapshot()` (enabled only when `SNAPSHOT_URL` is provided via feature-flag-driven flow)
    - `performInitialFileSync()` reads from bucket `project-files/${PROJECT_ID}/`
    - `createDefaultProject()` creates default Vite app if no files are found
  - orchestrator/src/services/container-manager.ts
    - FSYNC_SNAPSHOT_HYDRATION check; when enabled, a snapshot ZIP is built via Edge Function and passed to the container as `SNAPSHOT_URL`
  - supabase/functions/build-project-snapshot/index.ts (builds ZIP from `project_files` via RPC `list_current_files`)
- UI text match in iframe:
  - orchestrator/preview-container/entrypoint-subdomain.js shows the same “Velocity Preview Container … Edit src/App.jsx … Session Information … Powered by Velocity” content.

Contributing Factors
- The new unified editor path (ProjectEditor + CodeEditor using useUnifiedEditorStore) does not currently broadcast file updates to the container in real time. The older EnhancedEditorContainer integrates `usePreviewRealtime` to broadcast updates, but it’s deprecated and not used on Project Editor.
- Legacy hydration path expects content in Storage bucket `project-files` rather than the `project_files` table that the editor uses.

Resolution Options
1) Enable snapshot hydration (recommended)
   - Ensure feature flag `FSYNC_SNAPSHOT_HYDRATION` is true for the current user/project (RPC `is_feature_enabled`).
   - Confirm Supabase Edge Function `build-project-snapshot` is deployed and accessible.
   - On session start, `container-manager` already passes `SNAPSHOT_URL` to the container when the flag is enabled. Container will hydrate from the ZIP built from `project_files`, aligning the preview with the editor.

2) Populate the legacy storage bucket
   - As an interim workaround, write current `project_files` into the `project-files/<projectId>/` storage bucket so `performInitialFileSync()` can hydrate the container.

3) Wire up real-time broadcasting in the new editor
   - Integrate `usePreviewRealtime` to broadcast file changes from the unified editor (ProjectEditor + CodeEditor) when `FSYNC_KEEP_CLIENT_BROADCAST` is enabled. This ensures incremental updates after hydration.

4) Longer-term hardening
   - Update the container entrypoint to support directly syncing from `project_files` via RPC (avoids storage coupling in legacy mode).
   - Add a preflight in the Orchestrator to always hydrate either by snapshot or (if disabled) programmatically bundle and upload `project_files` into Storage before the machine boots.

Current Status / Next Steps
- The observed mismatch is expected when snapshot hydration is disabled and the storage bucket is empty. To immediately align preview with editor:
  - Preferred: Enable `FSYNC_SNAPSHOT_HYDRATION` and restart a session.
  - Or: Push files to `project-files/<projectId>/` and restart a session.
  - Optionally: Add client broadcast from the unified editor to keep the container in sync during edits.

