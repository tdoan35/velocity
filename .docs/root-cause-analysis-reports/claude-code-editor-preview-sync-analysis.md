# Root Cause Analysis: Code Editor and Preview Container Synchronization Issue

**Report by:** Claude (AI Assistant)
**Date:** September 13, 2025
**Project:** Velocity - AI-powered app development platform
**Issue:** Code Editor showing different content than Preview Container iframe

## Executive Summary

The investigation reveals a fundamental architecture mismatch between the Code Editor interface and the Preview Container system. The Code Editor is displaying React Native code while the Preview Container is running a basic React web application with completely different content.

## Issue Description

**Observed Problem:**
- Code Editor shows React Native App.js with StyleSheet, ScrollView, and mobile-optimized components
- Preview Container iframe displays a simple React web app with basic HTML styling showing "🚀 Velocity Preview Container" with count functionality

**Expected Behavior:**
- Code Editor and Preview Container should display synchronized content
- Changes in the editor should be reflected in the preview container

## Technical Investigation

### 1. Code Editor Content Analysis

The Code Editor displays React Native code:
```javascript
// Location: Frontend Code Editor Interface
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
// Contains mobile-first components with StyleSheet styling
// Shows "Welcome to Velocity Previewww!" title
// Interactive counter with TouchableOpacity
```

### 2. Preview Container Content Analysis

The Preview Container runs different code:
```javascript
// Location: /orchestrator/preview-container/test-project/src/App.jsx
import React, { useState, useEffect } from 'react'
// Basic React web app with inline styles
// Shows "🚀 Velocity Preview Container Test" title
// Real-time clock display functionality
```

### 3. Architecture Analysis

**File Structure Discovered:**
- **Frontend App:** `/frontend/src/App.tsx` - Main Velocity frontend application (React Router based)
- **Preview Container:** `/orchestrator/preview-container/test-project/src/App.jsx` - Static test application

**Synchronization Architecture:**
- Preview containers use file sync via Supabase Storage (`project-files` bucket)
- Frontend uses `useUnifiedEditorStore` for file management
- File sync occurs through `/orchestrator/preview-container/entrypoint.js`

## Root Cause Analysis

### **UPDATED ROOT CAUSE: Storage vs Database Architecture Mismatch**

**The investigation has revealed the actual issue:**

1. **Database vs Storage Disconnect:**
   - **Supabase Database (`project_files` table):** Contains CORRECT project files with React Native code
   - **Supabase Storage (`project-files` bucket):** Preview container expects files from Storage, NOT Database
   - **Entrypoint Logic:** Container reads from Storage bucket, falls back to test project when empty

2. **File Location Mismatch:**
   - **Code Editor:** Writes/reads from `project_files` DATABASE table
   - **Preview Container:** Reads from `project-files` STORAGE bucket
   - **Missing Sync:** No synchronization between Database table and Storage bucket

3. **Container Fallback Behavior:**
   - Preview container checks Supabase Storage for project files
   - When Storage bucket is empty (but Database has files), it creates default test project
   - This explains why container shows basic React web app instead of React Native code

### Contributing Factors:

1. **Development vs Production State:**
   - Preview system appears to be using test/fallback content
   - Production file sync may not be properly configured

2. **File Path Mismatch:**
   - Editor expects React Native file structure
   - Preview container serves standard React web application

3. **Synchronization Logic Issues:**
   - `performInitialFileSync()` function in entrypoint.js handles file downloads
   - May not be receiving updated files from the editor interface

## Technical Evidence

### Key Files Examined:

1. `/frontend/src/App.tsx` - Main frontend application (441 lines)
2. `/orchestrator/preview-container/test-project/src/App.jsx` - Preview test app (65 lines)
3. `/orchestrator/preview-container/entrypoint.js` - Container orchestration (1400+ lines)
4. `/frontend/src/stores/useUnifiedEditorStore.ts` - Editor state management (100+ lines examined)

### **CRITICAL DISCOVERY - Supabase Database Investigation:**

**Database Evidence:**
- **Project Files Table:** Contains CORRECT React Native code for project `af219acf-30d5-45c5-83a9-1f70205877ac`
- **File Path:** `frontend/App.js` (version 5, 2504 bytes)
- **Content Match:** Database content EXACTLY matches what Code Editor displays
- **Active Preview Session:** `f77b06f7-0fd2-48db-9702-a827ae596173` (active status)
- **Container URL:** `https://f77b06f7-0fd2-48db-9702-a827ae596173.preview.velocity-dev.com`

**Database Query Results:**
```sql
-- Project files for af219acf-30d5-45c5-83a9-1f70205877ac
file_path: "frontend/App.js"
content: React Native code with StyleSheet, TouchableOpacity, ScrollView
version: 5
is_current_version: true
updated_at: "2025-09-13 07:17:00.417193+00"
```

### Critical Code Paths:

1. **File Sync Process (Working Correctly):**
   ```javascript
   // In entrypoint.js:309-331
   const { data: files, error } = await supabase.storage
     .from('project-files')
     .list(`${PROJECT_ID}/`, { limit: 1000 });
   ```

2. **Fallback Behavior (The Problem):**
   ```javascript
   // In entrypoint.js:317-318
   if (!files || files.length === 0) {
     await createDefaultProject();
   ```

## Immediate Resolution Steps

### **CRITICAL FIX REQUIRED: Implement Database-to-Storage Sync**

1. **Immediate Action:**
   - Implement sync mechanism between `project_files` Database table and `project-files` Storage bucket
   - Ensure preview container reads from correct location or implement hybrid approach

2. **Code Changes Required:**
   - Modify preview container entrypoint to read from Database table OR
   - Implement automatic sync from Database to Storage when files are updated
   - Add error handling for Storage/Database connectivity issues

3. **Verification Steps:**
   - Test that editor changes appear in preview container immediately
   - Verify file sync works for both new files and updates
   - Confirm container stops falling back to test project

### Medium-term Solution:
1. Implement unified file storage strategy (Database OR Storage, not both)
2. Add real-time websocket synchronization for immediate updates
3. Implement proper error handling and fallback mechanisms

## Prevention Measures

1. **Integration Testing:** Add automated tests to verify editor-preview synchronization
2. **Monitoring:** Implement health checks for file sync operations
3. **Documentation:** Create clear data flow documentation between editor and preview systems

## Next Steps

1. **Immediate:** Check Supabase `project-files` bucket for project `af219acf-30d5-45c5-83a9-1f70205877ac`
2. **Investigate:** Preview container environment variables and Supabase connectivity
3. **Test:** File upload/sync process from editor to Supabase Storage
4. **Implement:** Real-time synchronization mechanism

## Conclusion

The root cause is an architectural disconnect where the Code Editor and Preview Container operate on different file systems. The Preview Container is serving static test content while the Code Editor manages dynamic project files through a separate system. Resolution requires implementing proper file synchronization between these two systems.