# File Save Error: Duplicate Key Violation on `project_files`

**ID:** GEMINI-file-save-duplicate-version-issue
**Status:** Resolved
**Author:** Gemini
**Date:** 2025-09-12

## Summary

When saving a file in the code editor, a "duplicate key value violates unique constraint" error occurs on the `project_files` table. The full error is `duplicate key value violates unique constraint "project_files_project_id_file_path_version_key"`. This happens because the client-side state management is not correctly updating the version of the file after a successful save, leading to a subsequent save attempt with a stale version number.

## Root Cause Analysis

The root cause of this issue is a race condition within the `saveFile` function of the `useUnifiedEditorStore` Zustand store (`frontend/src/stores/useUnifiedEditorStore.ts`).

The `saveFile` function is an `async` function. It fetches the `files` object and the specific `file` being saved from the store at the beginning of the function. It then proceeds to make an asynchronous RPC call to Supabase to `upsert_project_file`.

After the `await` for the RPC call completes, it calls `set` to update the Zustand store. However, it uses the `files` and `file` variables that were captured *before* the `await`. If any other part of the application has modified the `files` state while the RPC call was in flight, that modification is overwritten because the `set` call is using a stale version of the state.

Specifically, the new `version` number for the file, returned by the successful `upsert_project_file` RPC call, is applied to a stale state object. If another save happens quickly, the store may not have been updated correctly, and the `expected_version` sent to the database will be incorrect, causing the unique constraint violation.

### Problematic Code (`useUnifiedEditorStore.ts`):

```typescript
saveFile: async (filePath: string) => {
  const { files, projectId } = get(); // `files` is captured here
  const file = files[filePath];
  
  if (!file || !projectId || file.isSaving) return;

  set({ /* ... */ }); // Intermediate state update

  try {
    const { data, error } = await supabase.rpc('upsert_project_file', {
      // ... params
    });

    if (error) throw error;

    // BUG: This `set` uses the stale `files` and `file` objects from the top of the function.
    set({
      files: {
        ...files, // Overwrites any changes that happened during the `await`
        [filePath]: {
          ...file,
          isDirty: false,
          isSaving: false,
          lastModified: new Date(data?.updated_at || new Date()),
          version: data?.version || file.version, // Version update is lost if state was updated elsewhere
        },
      },
    });
  } catch (error) {
    // ...
  }
},
```

## Solution

The solution is to refactor the `saveFile` function to use the functional update form of Zustand's `set` method. Instead of passing an object to `set`, we pass a function that receives the latest state (`state => ({...})`). This guarantees that the update is always applied to the most current state, eliminating the race condition.

The `isSaving` flag updates and the final state update in both the `try` and `catch` blocks were modified to use this functional approach.

### Corrected Code (`useUnifiedEditorStore.ts`):

```typescript
saveFile: async (filePath: string) => {
  const { projectId } = get();
  const fileToSave = get().files[filePath];

  if (!fileToSave || !projectId || fileToSave.isSaving) return;

  // Use functional update for marking as saving
  set(state => ({
    files: {
      ...state.files,
      [filePath]: { ...state.files[filePath], isSaving: true },
    },
  }));

  try {
    const { data, error } = await supabase.rpc('upsert_project_file', {
      project_uuid: projectId,
      p_file_path: filePath,
      p_content: fileToSave.content,
      p_file_type: fileToSave.type,
      expected_version: fileToSave.version || null,
    });

    if (error) throw error;

    // Use functional update to apply the new version correctly
    set(state => {
      const currentFile = state.files[filePath];
      return {
        files: {
          ...state.files,
          [filePath]: {
            ...currentFile,
            isDirty: false,
            isSaving: false,
            lastModified: new Date(data?.updated_at || new Date()),
            version: data?.version || currentFile.version,
          },
        },
      };
    });

    console.log(`File ${filePath} saved successfully`);
  } catch (error) {
    console.error(`Failed to save file: ${filePath}`, error);

    // Use functional update for error handling
    set(state => ({
      files: {
        ...state.files,
        [filePath]: { ...state.files[filePath], isSaving: false },
      },
      error: error instanceof Error ? error.message : 'Failed to save file',
    }));
  }
},
```

---

## Addendum: Consensus from Multi-Agent Analysis

**Date:** 2025-09-12

After reviewing reports from agents Claude and Codex, a broader consensus on the root cause has been formed. The issue is a multi-layered problem with distinct but interacting bugs at the database, backend, and client-side levels.

### Consolidated Root Cause

1.  **Primary Cause (Database Schema Flaw - per Codex):** The most critical and deterministic bug is a `DEFAULT 1` constraint on the `version` column in the `project_files` table. This prevents the version-incrementing trigger (`handle_file_versioning`) from running on inserts, as the trigger only activates if the version is `NULL`. This flaw guarantees a "duplicate key" error on the second save of any file.

2.  **Secondary Cause (Database Race Condition - per Claude):** The database trigger `handle_file_versioning` uses a non-atomic `SELECT MAX(version) + 1` operation to generate new version numbers. This creates a classic race condition where concurrent save operations can read the same max version, calculate the same new version, and cause a conflict when the second transaction attempts to insert the duplicate.

3.  **Tertiary Cause (Client-Side Race Condition - per Gemini):** The `saveFile` function in the `useUnifiedEditorStore` client-side state manager contains a race condition. It captures a stale copy of the application state before an asynchronous operation and uses it to perform a state update afterward. This can cause the client's state (including the file `version`) to become out of sync with the database, leading to failed optimistic locking checks on subsequent saves.

### Conclusion

While my initial analysis and fix correctly address the client-side state inconsistency, the reports from Claude and Codex reveal more severe, underlying bugs in the database schema and logic. A complete and robust solution requires addressing all three identified issues:

1.  **Database Schema:** Remove the `DEFAULT 1` constraint from the `version` column.
2.  **Database Logic:** Refactor the versioning trigger to use an atomic operation (e.g., `SELECT ... FOR UPDATE` or a sequence) to prevent race conditions.
3.  **Client-Side Logic:** Implement the functional state update in the Zustand store to prevent client-side race conditions (as completed in the initial fix).

---

## Implementation Plan: Robust, Long-Term Solution

This plan outlines the steps to create an architecturally sound and resilient file versioning system by centralizing logic within the database.

### Phase 1: Database Overhaul (Atomic-First Approach)

This phase replaces the faulty trigger and schema defaults with a single, atomic RPC function that will be the sole entry point for file modifications.

1.  **Create New Supabase Migration:**
    *   A new migration file will be created at `supabase/migrations/YYYYMMDDHHMMSS_robust_file_versioning.sql`.

2.  **Implement Schema Cleanup in Migration:**
    *   The migration will contain the SQL to remove the flawed artifacts:
        ```sql
        -- Remove the problematic default value that prevents version incrementing
        ALTER TABLE public.project_files ALTER COLUMN version DROP DEFAULT;

        -- Remove the old trigger, as its logic is non-atomic and is being replaced
        DROP TRIGGER IF EXISTS handle_file_versioning ON public.project_files;

        -- (Optional but recommended) Remove the function called by the trigger
        DROP FUNCTION IF EXISTS public.handle_file_versioning();

        -- Remove the duplicate unique constraint identified by Claude
        ALTER TABLE public.project_files DROP CONSTRAINT IF EXISTS unique_project_file_version;
        ```

3.  **Create the New Centralized RPC Function (`upsert_project_file_v2`):**
    *   This function will be added to the same migration file. It is designed to be atomic and idempotent.
        ```sql
        CREATE OR REPLACE FUNCTION public.upsert_project_file_v2(
          p_project_uuid uuid,
          p_file_path text,
          p_content text,
          p_file_type text,
          p_expected_version integer DEFAULT NULL
        )
        RETURNS project_files AS $$
        DECLARE
          current_version integer;
          current_hash text;
          new_hash text;
          new_file_record project_files;
        BEGIN
          -- Lock the file path within this project to prevent concurrent updates
          PERFORM * FROM public.project_files
          WHERE project_id = p_project_uuid AND file_path = p_file_path
          FOR UPDATE;

          -- Get the current version and content hash
          SELECT version, content_hash INTO current_version, current_hash
          FROM public.project_files
          WHERE project_id = p_project_uuid AND file_path = p_file_path AND is_current_version = true;

          -- 1. Optimistic Locking Check
          IF current_version IS NOT NULL AND p_expected_version IS NOT NULL AND current_version != p_expected_version THEN
            RAISE EXCEPTION 'VERSION_CONFLICT';
          END IF;

          -- 2. Idempotency Check: If content is unchanged, do nothing.
          new_hash := extensions.digest(p_content, 'sha256');
          IF new_hash = current_hash THEN
            SELECT * INTO new_file_record FROM public.project_files WHERE project_id = p_project_uuid AND file_path = p_file_path AND version = current_version;
            RETURN new_file_record;
          END IF;

          -- 3. Create New Version
          -- De-activate the old version
          UPDATE public.project_files
          SET is_current_version = false
          WHERE project_id = p_project_uuid AND file_path = p_file_path AND is_current_version = true;

          -- Insert the new version, safely incrementing because of the lock
          INSERT INTO public.project_files (project_id, file_path, content, file_type, version, content_hash, is_current_version)
          VALUES (p_project_uuid, p_file_path, p_content, p_file_type, COALESCE(current_version, 0) + 1, new_hash, true)
          RETURNING * INTO new_file_record;

          RETURN new_file_record;
        END;
        $$ LANGUAGE plpgsql;
        ```

### Phase 2: Frontend Integration

This phase updates the client-side application to use the new, robust database function and handle its responses correctly.

1.  **Update Store to Call New RPC:**
    *   In `frontend/src/stores/useUnifiedEditorStore.ts`, the `saveFile` function will be modified to call the new `'upsert_project_file_v2'` RPC.

2.  **Implement Specific Error Handling:**
    *   The `catch` block within the `saveFile` function will be enhanced to detect the custom `VERSION_CONFLICT` error.
        ```typescript
        // In useUnifiedEditorStore.ts -> saveFile -> catch(error)
        if (error.message.includes('VERSION_CONFLICT')) {
          console.warn('Version conflict detected. Refreshing file content.');
          toast.error('This file was updated elsewhere. Refreshing your editor.');
          // Trigger a refresh of the file from the server
          get().refreshProjectFiles(projectId);
        } else {
          // Handle other errors
        }
        ```

### Phase 3: Deprecation and Cleanup

1.  **Deprecate Old RPC:**
    *   The original `upsert_project_file` function should be marked as deprecated or removed in a subsequent migration to prevent accidental usage.

2.  **Verification:**
    *   Manually test the application by rapidly typing and saving to confirm that no 409 Conflict errors occur.
    *   Verify in the database that file versions are incrementing correctly and atomically, with only one version marked as `is_current_version = true` per file.
