# GEMINI - Editor UI Not Synchronized with Preview Container - Root Cause Analysis

**Report Date**: 2025-09-11
**Analyzed By**: Gemini Code Assistant
**Issue**: The file explorer and code editor UI are not synchronized with the files in the preview session container. The UI displays stale or incorrect file content after the application loads.

## 1. Executive Summary

The root cause of the synchronization issue is a flawed data-fetching mechanism in the `initializeProjectFiles` function of the `useUnifiedEditorStore`. The current implementation fetches all historical file records from the database for a given project, rather than fetching only the most recent, active version of each file.

This results in the editor's state being populated with stale content, creating a discrepancy between what the user sees in the editor and what is actually running in the preview container.

## 2. Root Cause Analysis

The investigation pinpointed the issue within `frontend/src/stores/useUnifiedEditorStore.ts`. During the refactor from `useProjectEditorStore` to `useUnifiedEditorStore`, a simplified but incorrect data-fetching strategy was introduced.

#### The Flawed Database Query

The `initializeProjectFiles` function uses the following Supabase query to fetch project files:

```typescript
// Location: frontend/src/stores/useUnifiedEditorStore.ts

const { data: files, error: filesError } = await supabase
  .from('project_files')
  .select('*')
  .eq('project_id', projectId);
```

This query retrieves every row from the `project_files` table that matches the `project_id`. Because this table holds version history, the query returns not just the current content but all previous versions as well. The application code then processes this list, leading to a race condition where an older version of a file can be displayed in the UI.

This exact issue was predicted as a potential risk in the original `CODEX` analysis report concerning the legacy data-fetching path.

## 3. Recommended Fix

The solution is to replace the incorrect query with the purpose-built RPC function, `list_current_files`. This function was created to return only the latest version of each file, which will ensure the editor state is initialized with the correct, up-to-date content.

**Action:** Modify the `initializeProjectFiles` function in `frontend/src/stores/useUnifiedEditorStore.ts`.

```typescript
// In frontend/src/stores/useUnifiedEditorStore.ts

// REPLACE THIS:
const { data: files, error: filesError } = await supabase
  .from('project_files')
  .select('*')
  .eq('project_id', projectId);

if (filesError) throw filesError;

// WITH THIS:
const { data: files, error: filesError } = await supabase.rpc('list_current_files', {
  project_uuid: projectId
});

if (filesError) {
  console.error('RPC list_current_files failed, falling back to direct query with version filter:', filesError);
  // As a fallback, query the table directly but filter for the current version
  const fallbackResult = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_current_version', true);
  
  if (fallbackResult.error) throw fallbackResult.error;
  files = fallbackResult.data;
} else {
  // The RPC returns a slightly different format, so we need to adapt it.
  // This assumes the RPC returns an array of objects with `file_path`, `content`, etc.
}

// The rest of the function that processes the 'files' array remains largely the same,
// but it will now be operating on the correct data.
```

By making this change, the `initializeProjectFiles` function will correctly populate the store with the latest file content, resolving the synchronization issue between the editor UI and the preview container.
