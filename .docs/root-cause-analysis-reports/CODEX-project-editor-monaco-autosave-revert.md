Title: ProjectEditor Monaco autosave reverts code to original — Root Cause Analysis

Summary

- Issue: While connected to a preview session, editing code in the ProjectEditor’s Monaco editor appears to work until autosave triggers; after autosave, the editor reverts to the original file content.
- Scope: Frontend (Vite + React + TS) — ProjectEditor page, EnhancedEditorContainer, useProjectEditorStore, realtime/preview hooks. No code changes were made; this is an investigation report.

Reproduction (as reported)

- Open ProjectEditor for a project and start/auto‑start a preview session.
- Switch to the Code view, open a file, edit it.
- Wait for autosave debounce to fire; editor content reverts to original content after autosave.

System Overview (relevant pieces)

- Page: `frontend/src/pages/ProjectEditor.tsx` uses `EnhancedEditorContainer` for the editor and `FullStackPreviewPanelContainer` for preview.
- Editor: `frontend/src/components/editor/EnhancedEditorContainer.tsx` integrates Monaco directly and wires:
  - State: `useProjectEditorStore()` for `openTabs`, `activeFile`, and file trees; `saveFile` used for persist.
  - Autosave: `useDebounceValue(editorContent, 1000)` → on change, calls `handleAutoSave()` → `saveFile()` and then (if connected) broadcasts via `usePreviewRealtime().broadcastFileUpdate`.
  - Content application effect: whenever `activeFile` or any of `frontendFiles/backendFiles/sharedFiles` change, it does `editorRef.setValue(fileContent)` and sets language.
- Save path: `frontend/src/stores/useProjectEditorStore.ts`
  - `saveFile(filePath, content)` normalizes path, determines `fileType`, and either:
    - RPC path (flag FSYNC_USE_RPC): calls `upsert_project_file` and updates local store with returned version/hash; or
    - Legacy path: upserts to `project_files` and updates local store.
  - `initializeProject(projectId)` loads files from DB. RPC path uses `list_current_files`; legacy path selects all rows (note: without `is_current_version` filter).
- Realtime: `frontend/src/hooks/usePreviewRealtime.ts` connects to `realtime:project:${projectId}`. It broadcasts `file:update` on save but does not modify local state on inbound events (only logs).
- Preview sessions: both ProjectEditor and EnhancedEditorContainer instantiate `usePreviewSession` separately (two instances).

Key Findings

1. Editor content reset trigger exists

   - EnhancedEditorContainer sets Monaco content unconditionally whenever any of `activeFile`, `frontendFiles`, `backendFiles`, or `sharedFiles` change:
     - File: `frontend/src/components/editor/EnhancedEditorContainer.tsx`
     - Effect: “Load file content when active file changes” calls `editorRef.current.setValue(fileContent)` on any file tree change.
   - This means any store update (including autosave writes, or unrelated updates touching file trees) re-applies the file’s content from store into the editor model.

2. Autosave write → store update → editor overwrite cycle

   - Autosave flow:
     - User types → `editorContent` updates → debounce(1s) → `handleAutoSave()` → `saveFile()` updates store.
     - On store update, the “Load file content…” effect runs and sets Monaco content to `getCurrentFileContent()`.
   - If the store content is stale/older than the editor’s current text, this effect will overwrite Monaco’s current buffer with older content, matching the observed “revert”.

3. Where can stale/older content come from?

   - Path normalization mismatch: `saveFile()` normalizes paths (e.g., adding `frontend/` prefix) before writing. If an opened file were unnormalized, the store/keys could diverge. However, `openFile()` normalizes paths before setting `activeFile`, so this is unlikely in the current UI path (explorer uses normalized paths).
   - Legacy initialization path: `initializeProject()` legacy code (when FSYNC_USE_RPC is disabled) loads all rows from `project_files` without filtering to current versions. That can hydrate the store with older file versions. While it explains stale initial content, it does not by itself explain a revert triggered precisely at autosave time unless some other code rehydrates or refreshes file trees.
   - Duplicate preview sessions: both the page and the editor create `usePreviewSession` instances. While these control preview containers and realtime tokens, there is no frontend code that hydrates file trees from preview events to overwrite the store. So a direct overwrite due to preview sessions is not evidenced in code.
   - Realtime inbound events: current `usePreviewRealtime()` only logs inbound `file:update`; it does not write to store. So realtime isn’t overwriting the file trees.

4. Most plausible mechanism of the “revert”
   - The unconditional “apply store content to Monaco” effect will always reset the editor’s model to the store version whenever file trees change.
   - On autosave, `saveFile()` updates the store, which triggers that effect. If the store value used by the effect is not the current editor content (e.g., because of a race or because a separate source put “original” content into the store), the editor gets reset.
   - Concretely, two contributing risks exist:
     a) The effect is too coarse: it runs on any change to file trees, not only on `activeFile` change, and it sets value unconditionally instead of comparing model value first.
     b) Versioning/legacy hydration: if the project loaded files via the legacy path without version filtering at startup (or a subsequent refresh), the in-memory store may contain the “original” file content. Autosave triggers store update sequencing that momentarily uses that stale content in the effect, reapplying it to Monaco.

Additional Observations (less likely root causes)

- Two preview sessions (page + editor) may create redundant network activity and duplicate status toasts, but there’s no code path that writes file content from preview back to the editor store on the frontend.
- Security monitoring hooks (`useFileSecurityMonitoring`) only queue scans and don’t mutate file trees.
- Realtime broadcast flags (FSYNC flags) exist, but the frontend does not currently use server broadcasts to hydrate file content.

Evidence (file references)

- ProjectEditor: `frontend/src/pages/ProjectEditor.tsx:144`
- EnhancedEditorContainer (Monaco + autosave + overwrite effect): `frontend/src/components/editor/EnhancedEditorContainer.tsx:93`, `:140`, `:174`, `:189`
- Store save logic: `frontend/src/stores/useProjectEditorStore.ts:604`, `:629`, `:646`, `:678`
- Store initialization/hydration: `frontend/src/stores/useProjectEditorStore.ts:191`, `:212`, `:239`
- Realtime hook (broadcast only): `frontend/src/hooks/usePreviewRealtime.ts:78`, `:140`

Root Cause (current best assessment)

- The editor unconditionally re-applies the store’s file content to Monaco on any file tree change. When autosave triggers a store update (or another store mutation occurs), that effect runs and sets the Monaco buffer from the store. If the store content at that moment differs from the current editor buffer (for example due to legacy hydration or any discrepancy), the editor appears to “revert” to the store’s version.

Why it manifests “after autosave”

- Autosave is the most consistent trigger for a file tree change (via `saveFile()`), which then runs the unconditional setValue effect. This makes the revert consistently coincide with autosave timing even if the initial source of the stale content was earlier.

Recommendations (no implementation done yet)

1. Narrow the “apply store content” effect

   - Only set editor value when `activeFile` changes, or when the store value actually differs from the editor model:
     - Compare `editorRef.current.getValue()` to `fileContent` before calling `setValue`.
     - Alternatively, gate on a dedicated state (e.g., `lastLoadedFilePath`) to avoid setting value during save‑driven store updates.

2. Confirm feature flags and hydration path

   - Check FSYNC_USE_RPC. If false, legacy `initializeProject()` should filter to `is_current_version = true` to avoid loading stale versions.
   - Verify RPC `upsert_project_file` returns updated version metadata and that the store is not later rehydrated from an older snapshot.

3. Avoid duplicate preview sessions

   - Consider using only the page‑level `usePreviewSession` and passing state down to the editor to reduce side‑effects and simplify debugging.

4. Add targeted debug logging (temporarily)
   - Log in `saveFile()` with normalized path, expected/current version, and a snippet/hash of content before/after store update.
   - Log in the editor’s “apply store content” effect the current model value hash vs. store value hash and why it decides to call `setValue`.

Next Steps to Validate

- Reproduce locally with console logs added as above to confirm the overwrite effect fires at autosave and that store content differs at that moment.
- If legacy path is active, switch to RPC or add `is_current_version=true` filter and re‑test.
- Once confirmed, implement the minimal guard in the editor effect to prevent unnecessary `setValue` calls that overwrite unsaved edits.

Notes

- No code changes were performed per request. This report documents findings and probable causes with code references to accelerate the fix.
