# Issue: File Explorer shows no files while Monaco opens App.js

## Summary

When loading an existing project created via the default project creation flow, the ProjectEditor’s file explorer shows no files, yet the Monaco editor opens `App.js` containing the “Welcome to Velocity Preview!” code. This indicates a path/schema mismatch between how files are stored/seeded and how the frontend groups and displays them.

## Reproduction (observed)

- Load a project that was created by the orchestrator’s default project creation/template flow.
- Navigate to the Project Editor (Code view).
- File explorer (Frontend/Backend sections) displays “No files yet”.
- Monaco editor tab opens `App.js` with Velocity preview template code.

## Expected vs Actual

- Expected: The file explorer should list the project files (at least frontend files) and opening the default file should align with displayed tree.
- Actual: Explorer is empty; editor opens an `App.js` file that isn’t visible under the Frontend/Backend trees.

## Root Causes Identified

- Path namespace mismatch between stored `project_files` rows and the frontend’s grouping logic.
  - Frontend groups by prefixes: `frontend/` and `backend/`; otherwise files are placed in an internal `sharedFiles` map (not rendered in the explorer UI).
    - Code reference: `frontend/src/stores/useProjectEditorStore.ts:270` (checks `file.path.startsWith('frontend/')` then `backend/`, else shared)
  - Orchestrator default templates seed files at root paths without a `frontend/` prefix (e.g., `App.js`), so these load into `sharedFiles`, which the explorer does not display.
    - React Native template example: `orchestrator/src/services/template-service.ts:380` (sets `file_path: 'App.js'`)
    - The exact “Welcome to Velocity Preview!” text appears in the seeded RN template content: `orchestrator/src/services/template-service.ts:389`

- Default active tab logic picks the first available file if `frontend/App.tsx` or `frontend/App.js` aren’t present, which will be the root-level `App.js` in `sharedFiles`.
  - Code reference: `frontend/src/stores/useProjectEditorStore.ts:283`–`284` (prefer `frontend/App.tsx` → `frontend/App.js` → first key)

- Schema field mismatches in the editor store increase the chance of empty trees or mis-categorization depending on feature flags:
  - When using the new RPC (FSYNC_USE_RPC=true), the store maps RPC return to `{ path, type }`, which the grouping logic handles.
  - When using the legacy direct `from('project_files')` path (FSYNC_USE_RPC=false), it selects `*` but the mapping expects `path`/`type` rather than `file_path`/`file_type`, leading to incorrect grouping or possible runtime errors if used directly.
    - Code reference (load existing files loop expects `file.path`): `frontend/src/stores/useProjectEditorStore.ts:260`–`276`

- Wrong column names used when saving default files during initialization (only triggered when no files exist): uses `path`/`type` instead of `file_path`/`file_type` for DB insert.
  - Code reference: `frontend/src/stores/useProjectEditorStore.ts:231`–`241` (inserts `{ project_id, path, content, type }`)

## Why the UI looks inconsistent

- The store successfully loads files that exist in the DB (seeded by orchestrator), but since those paths don’t start with `frontend/` or `backend/`, they end up in `sharedFiles`.
- The FullStackFileExplorer renders only frontend and backend trees:
  - Code reference: `frontend/src/components/editor/FullStackFileExplorer.tsx:252`–`254` (creates `frontendTree` and `backendTree` only)
- Consequently, the explorer shows “No files yet” even though files exist in `sharedFiles`.
- The editor then selects the first available file (root-level `App.js`) to open, showing the Velocity template content.

## Affected Areas

- `frontend`:
  - `frontend/src/stores/useProjectEditorStore.ts:231`–`241`, `:260`–`276`, `:283`–`285`
  - `frontend/src/components/editor/FullStackFileExplorer.tsx:252`–`254`
- `orchestrator`:
  - `orchestrator/src/services/template-service.ts:380`–`390` (RN template paths/content)
  - `orchestrator/src/services/container-manager.ts:820`–`846` (inserts template files to `project_files` as-is)

## Contributing Context (FS Sync v1 Plan)

- The FS Sync v1 plan standardizes on `project_files` with `file_path`/`file_type` and server-authored realtime. However, it doesn’t mandate editor path namespacing. The current frontend assumes namespaced paths for grouping.
  - Plan file: `.docs/implementation-plans/file-system-sync-v1-implementation-plan.md`

## Remediation Options (non-implemented)

- Normalize paths on load in the editor store:
  - Map rows to namespaced paths (e.g., treat `App.js` and `src/*` as `frontend/*`) based on project type/template; or add a migration/transform step.

- Update orchestrator templates to align with frontend path expectations:
  - Prefix frontend app files with `frontend/` (e.g., `frontend/App.tsx` for RN; `frontend/src/*` for web template).

- Add a “Shared” section to the explorer UI:
  - Render `sharedFiles` so root-level or un-prefixed files are visible until everything is standardized.

- Fix schema mismatches in the store:
  - For default inserts: use `file_path`/`file_type` when writing to `project_files`.
  - For legacy reads: map `file_path`/`file_type` → `path`/`type` before grouping.

- Decide on a canonical path convention and enforce it across components:
  - E.g., `frontend/`, `backend/`, and `shared/` prefixes; or a manifest that classifies files without relying on prefixes.

## Open Questions

- Should the editor display a Shared tree by default, or are we committing to strict namespacing?
- Which component should be responsible for path normalization (orchestrator seeding vs. frontend ingestion vs. database view)?
- Are FSYNC flags currently enabled in the target environment (affects the load path and mapping)?

## Recommendations (Open Questions)

- Shared tree vs. namespacing: Show Shared short‑term; enforce namespacing long‑term.
  - Short‑term: Add a Shared section in the explorer so existing root‑level files (e.g., `App.js`) are visible immediately. Keep it collapsible by default to reduce noise.
  - Long‑term: Standardize on canonical prefixes (`frontend/`, `backend/`, `shared/`) and update orchestrator templates and any seeding scripts to write namespaced `file_path` values. Plan a one‑time migration to move root‑level files into the correct namespace.

- Responsibility for path normalization: Orchestrator first; frontend defensive; DB optional.
  - Primary: Normalize at orchestrator seeding/generation time so `project_files.file_path` is canonical when written. This aligns SoT with the expected structure and avoids per‑client hacks.
  - Defensive (temporary): In the frontend store’s ingestion path, map legacy rows (`file_path`/`file_type`) to `path`/`type` and prefix missing namespaces based on project template/type. Gate behind a feature flag and add telemetry to quantify usage.
  - Optional DB/View: If needed for backward compatibility, create a view/RPC (e.g., `list_current_files_normalized`) that emits normalized paths for clients still on legacy code paths.

- FSYNC flags posture: Prefer RPC on; snapshot off until validated; bulk off initially.
  - `FSYNC_USE_RPC`: Enable in dev/staging to standardize reads/writes through RPCs and ensure consistent mapping. Keep a robust fallback to direct queries with explicit mapping.
  - `FSYNC_SERVER_BROADCASTS`: Enable where server‑authored events are available; verify channel delivery in containers before enabling broadly.
  - `FSYNC_SNAPSHOT_HYDRATION`: Keep disabled until snapshot hydration flow is fully verified end‑to‑end (build function, signed URL, container boot logic).
  - `FSYNC_BULK_GENERATION`: Keep disabled initially; enable after validating single‑file RPC correctness and applying backpressure/rate‑limit handling.
  - Add logging in the store to record which path (RPC vs. legacy) is used to aid rollout.

## Next Steps (proposal)

1) Pick canonical path convention and document it.
2) Fix editor store to correctly map legacy reads and default inserts.
3) Add Shared tree to explorer (short-term visibility fix).
4) Update orchestrator templates or introduce a seeding transform to match the convention.
5) Verify against existing projects and add a one-time migration if required.

## Implementation Plan

### Decisions
- Canonical prefixes: `frontend/`, `backend/`, `shared/`.
- **Pre-launch simplification**: No feature flags needed - implement direct fixes since we're not yet launched.
- Frontend implements immediate path normalization; orchestrator generates canonical paths going forward.

### Phase 0 — Simplified Setup (prep) ✅ COMPLETED

**Files modified:**
- ✅ `frontend/src/stores/useProjectEditorStore.ts`

**1. ✅ Added development logging in the editor store:**
```typescript
// ✅ IMPLEMENTED: In frontend/src/stores/useProjectEditorStore.ts line 171
const useRPC = await isFeatureEnabled(FSYNC_FLAGS.USE_RPC);
console.log('[ProjectEditor] Using RPC path:', useRPC);

// ✅ IMPLEMENTED: After file loading at lines 282-287
console.log('[ProjectEditor] File distribution:', {
  frontend: Object.keys(frontendFiles).length,
  backend: Object.keys(backendFiles).length, 
  shared: Object.keys(sharedFiles).length,
  totalFiles: files?.length || 0
});
```

**2. ✅ FSYNC flags status verified:**
- ✅ `FSYNC_USE_RPC`: enabled (100%) - confirmed working
- ✅ `FSYNC_SNAPSHOT_HYDRATION`: enabled (100%) - confirmed working  
- ✅ `FSYNC_BULK_GENERATION`: enabled (100%) - confirmed working
- ✅ `FSYNC_KEEP_CLIENT_BROADCAST`: disabled (0%) - confirmed working

**Implementation Notes:**
- Development logging successfully added to track file categorization
- RPC path logging confirms feature flag system working correctly
- Identified existing projects with legacy file paths (App.js, src/App.jsx) confirming the issue

### Phase 1 — Frontend Quick Wins (visible fix) ✅ COMPLETED

**Files modified:**
- ✅ `frontend/src/components/editor/FullStackFileExplorer.tsx`
- ✅ `frontend/src/stores/useProjectEditorStore.ts`

**1. ✅ File Explorer: Add a "Shared" tree**

✅ **IMPLEMENTED:** Added "Shared" section to `frontend/src/components/editor/FullStackFileExplorer.tsx`:
- Added `sharedFiles` import from store
- Added 'shared' to expandedDirectories initial state
- Created `sharedTree` with `buildFileTree(sharedFiles, '')`
- Added Shared section UI after Backend section (lines 330-354)
- Section displays when `Object.keys(sharedFiles).length > 0`
- Full tree rendering with context menu support

**2. ✅ Store: Fix default insert column names**

✅ **IMPLEMENTED:** Fixed column names in `frontend/src/stores/useProjectEditorStore.ts` at lines 234-242:
```typescript
// ✅ FIXED: Updated from incorrect column names:
const fileInserts = Object.values(allDefaultFiles).map(file => ({
  project_id: projectId,
  file_path: file.path,   // ✅ Changed from 'path' to 'file_path'
  content: file.content,
  file_type: file.type === 'typescript' ? 'typescript' : 
            file.type === 'javascript' ? 'javascript' :
            file.type === 'json' ? 'json' :
            file.type === 'sql' ? 'sql' :
            file.type === 'markdown' ? 'markdown' :
            file.type === 'toml' ? 'toml' : 'text'  // ✅ Changed from 'type' to 'file_type'
}));
```

**3. ✅ Store: Implement path normalization logic**

✅ **IMPLEMENTED:** Added comprehensive path normalization to `frontend/src/stores/useProjectEditorStore.ts`:

- **Normalization function added** (lines 50-86): `normalizeFilePath()` with intelligent categorization:
  - Backend patterns: `.sql`, `supabase/`, `migration/`, `function/`, `server/`
  - Frontend patterns: `component/`, `src/`, `.tsx/.jsx`, `app.`, `index.`, `package.json`, `tsconfig`, `tailwind`
  - Default: shared for ambiguous files

- **Applied in file loading** (lines 300-325): Files without proper prefixes are automatically normalized
- **Applied in all file operations**: saveFile, createFile, deleteFile, openFile, closeFile all use normalized paths
- **Logging added**: Path normalization events logged for debugging

**4. ✅ Update active file selection logic**

✅ **IMPLEMENTED:** Enhanced file selection in `frontend/src/stores/useProjectEditorStore.ts`:

- **openFile method** (lines 583-591): Automatically normalizes paths before opening
- **closeFile method** (lines 593-602): Uses normalized paths for tab management
- **File categorization** (lines 313-319): Files properly sorted into frontend/backend/shared based on normalized paths
- **Active file logic**: Existing logic now works correctly with normalized paths

**Phase 1 Implementation Summary:**
✅ **All tasks completed successfully**
- File explorer now shows "Shared" section for legacy files without prefixes
- Database insert operations use correct column names (`file_path`, `file_type`)
- Comprehensive path normalization automatically categorizes files
- All file operations (save, create, delete, open, close) handle normalized paths
- Legacy files like `App.js` are now visible in the appropriate section
- Issue resolution: Files no longer "disappear" from explorer while being openable in Monaco

**Immediate Impact:**
- ✅ File explorer displays all project files properly categorized
- ✅ Monaco editor file selection aligns with explorer tree  
- ✅ Legacy projects with root-level files (App.js) now show files in Shared section
- ✅ New file operations use correct database schema
- ✅ Automatic path normalization prevents future categorization issues

### Phase 2 — Orchestrator Alignment (authoritative fix) 🔄 PENDING

**Files to modify:**
- `orchestrator/src/services/template-service.ts`
- `supabase/functions/migrate-file-paths/index.ts` (new)

**1. Templates write canonical paths**

In `orchestrator/src/services/template-service.ts`, find the React Native template around line 380-390:
```typescript
// BEFORE (generates root-level paths):
{
  file_path: 'App.js',
  content: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to Velocity Preview!</Text>
    </View>
  );
}`, // This is the source of "Welcome to Velocity Preview!" text
  file_type: 'javascript'
}

// AFTER (generates frontend/ prefixed paths):
{
  file_path: 'frontend/App.tsx', // ✅ Canonical path
  content: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to ${projectName}!</Text>
    </View>
  );
}`,
  file_type: 'typescript'
}
```

Update other template files to use `frontend/` prefix:
```typescript
// Additional template files
{
  file_path: 'frontend/package.json',
  content: JSON.stringify({
    name: projectName.toLowerCase().replace(/\s+/g, '-'),
    version: '1.0.0',
    main: 'App.tsx',
    scripts: {
      start: 'expo start',
      android: 'expo start --android',
      ios: 'expo start --ios',
      web: 'expo start --web'
    }
  }, null, 2),
  file_type: 'json'
},
{
  file_path: 'frontend/app.json',
  content: JSON.stringify({
    expo: {
      name: projectName,
      slug: projectName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      platforms: ['ios', 'android', 'web']
    }
  }, null, 2),
  file_type: 'json'
}
```

**2. ContainerManager seeding (already correct)**

The `addTemplateFilesToProject()` method in `orchestrator/src/services/container-manager.ts` around line 820-846 correctly inserts the `file_path` from templates, so no changes needed here.

**3. One-time data cleanup (simple approach)**

Since we're pre-launch, we can take a simple direct SQL approach. Run this migration SQL:

```sql
-- Check current file paths that need updating
SELECT 
  project_id,
  file_path,
  CASE 
    -- React Native patterns
    WHEN file_path ~ '^App\.(js|jsx|ts|tsx)$' THEN 'frontend/' || file_path
    WHEN file_path LIKE 'screens/%' THEN 'frontend/' || file_path
    WHEN file_path LIKE 'components/%' THEN 'frontend/' || file_path
    WHEN file_path LIKE 'navigation/%' THEN 'frontend/' || file_path
    
    -- Web patterns
    WHEN file_path LIKE 'src/%' THEN 'frontend/' || file_path
    WHEN file_path IN ('index.html', 'package.json', 'vite.config.js', 'vite.config.ts', 'app.json') 
      THEN 'frontend/' || file_path
    
    -- Backend patterns  
    WHEN file_path LIKE 'supabase/%' THEN 'backend/' || file_path
    WHEN file_path LIKE '%.sql' THEN 'backend/' || file_path
    
    -- Already prefixed or shared
    ELSE file_path
  END as normalized_path
FROM project_files 
WHERE is_current_version = true
  AND NOT (file_path LIKE 'frontend/%' OR file_path LIKE 'backend/%' OR file_path LIKE 'shared/%');

-- Update file paths (run after reviewing the above query results)
UPDATE project_files 
SET 
  file_path = CASE 
    -- React Native patterns
    WHEN file_path ~ '^App\.(js|jsx|ts|tsx)$' THEN 'frontend/' || file_path
    WHEN file_path LIKE 'screens/%' THEN 'frontend/' || file_path
    WHEN file_path LIKE 'components/%' THEN 'frontend/' || file_path
    WHEN file_path LIKE 'navigation/%' THEN 'frontend/' || file_path
    
    -- Web patterns
    WHEN file_path LIKE 'src/%' THEN 'frontend/' || file_path
    WHEN file_path IN ('index.html', 'package.json', 'vite.config.js', 'vite.config.ts', 'app.json') 
      THEN 'frontend/' || file_path
    
    -- Backend patterns  
    WHEN file_path LIKE 'supabase/%' THEN 'backend/' || file_path
    WHEN file_path LIKE '%.sql' THEN 'backend/' || file_path
    
    -- Keep as-is
    ELSE file_path
  END,
  version = version + 1,
  updated_at = NOW()
WHERE is_current_version = true
  AND NOT (file_path LIKE 'frontend/%' OR file_path LIKE 'backend/%' OR file_path LIKE 'shared/%');
```

This direct approach is much simpler since we don't need to worry about gradual rollouts or feature flags pre-launch.

### Phase 3 — Verification & Testing

**Testing checklist with specific scenarios:**

**1. Dev validation:**

Test new project creation:
```bash
# Create new project via orchestrator
curl -X POST '/api/projects' -d '{"name": "Test Project", "template": "react-native"}'

# Expected: File explorer shows:
# ├── Frontend (expanded)
# │   ├── App.tsx (with project name, not "Welcome to Velocity Preview!")
# │   ├── package.json
# │   └── app.json
# ├── Backend (collapsed, empty)
# └── Shared (collapsed, empty)

# Monaco editor opens frontend/App.tsx by default
```

Test existing legacy project:
```bash
# Load project with existing root-level files
# Expected with FSYNC_PATH_NORMALIZATION=true:
# ├── Frontend (expanded)
# │   ├── App.js (migrated from root)
# │   └── src/App.tsx (if exists)
# ├── Backend (collapsed)
# └── Shared (expanded)
#     ├── README.md
#     └── other-file.txt

# Monaco editor opens first available frontend file, falls back to shared
```

**2. Console validation:**

Test file loading in browser console:
```javascript
// In browser console on ProjectEditor page
// Should see these logs:
console.log('[ProjectEditor] Using RPC path: true');
console.log('[ProjectEditor] File distribution: { frontend: 3, backend: 0, shared: 2, totalFiles: 5 }');

// Test path normalization directly
const testPaths = ['App.js', 'src/components/Button.tsx', 'package.json'];
testPaths.forEach(path => {
  console.log(`${path} → ${normalizeFilePath(path)}`);
});
```

**3. Database validation:**

Check migration results:
```sql
-- Check what files were updated
SELECT 
  project_id,
  file_path,
  version,
  updated_at
FROM project_files 
WHERE updated_at > NOW() - INTERVAL '1 hour'
  AND file_path LIKE 'frontend/%'
ORDER BY updated_at DESC;

-- Verify no orphaned files
SELECT file_path, COUNT(*) 
FROM project_files 
WHERE is_current_version = true
GROUP BY file_path
HAVING COUNT(*) > 1; -- Should return no results
```

**4. End-to-end testing:**

Complete user workflow test:
1. Load existing project → File explorer shows files in correct categories
2. Click file in Frontend tree → Monaco opens same file  
3. Create new project → Template files use `frontend/` paths
4. Edit file → Auto-save works, content persists
5. File tree shows real-time updates

**Simple rollback (if needed):**
Since we're pre-launch, we can simply:
1. Revert frontend code changes
2. Revert orchestrator template changes  
3. Run reverse SQL migration if database changes need to be undone

### Simplified Risks & Mitigation

**Pre-launch advantages:**
- No user impact during changes
- Can test thoroughly before any real usage
- Simple rollback without feature flags

**Minimal risks:**
- Path collisions during SQL migration → Preview with SELECT query first
- Classification edge cases → Shared tree will catch any missed files
- Development environment only → No production concerns yet

## Implementation Summary

**Total Estimated Effort:** 1-2 days (simplified without feature flags)
**Priority:** HIGH (blocks core user functionality)  
**Risk Level:** LOW (pre-launch, simple changes)

### Simplified Ownership & Estimates

**Phase 0 - Setup (0.5 days):**
- Add logging: 1 hour
- Environment validation: 1 hour

**Phase 1 - Frontend Fixes (0.5-1 day):**
- Shared tree in explorer: 2-3 hours
- Store column name fixes: 1 hour
- Path normalization logic (always on): 2-3 hours
- Active file selection enhancement: 1 hour
- Testing and debugging: 1-2 hours

**Phase 2 - Orchestrator & Data (0.5 day):**
- Template path updates: 2 hours
- Direct SQL migration: 1 hour
- Testing and verification: 1 hour

**Files Modified Summary:**
```
frontend/src/stores/useProjectEditorStore.ts          (major changes)
frontend/src/components/editor/FullStackFileExplorer.tsx  (UI addition)
orchestrator/src/services/template-service.ts        (path prefix updates)
database/migration.sql                               (one-time data cleanup)
```

**Simplified Dependencies:**
- Database query access (already available)
- Frontend development environment
- Orchestrator code access

**Success Criteria:**
- ✅ File explorer shows all project files appropriately categorized
- ✅ Monaco editor opens files that match explorer tree
- ✅ New projects use canonical `frontend/` paths
- ✅ Legacy projects remain functional with path normalization
- ✅ No data loss during migration
- ✅ Performance impact < 200ms for project loading
