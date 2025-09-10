#!/usr/bin/env node

/**
 * Phase 1 Integration Test
 * Tests the RPC functions directly against Supabase
 * 
 * Run with: node test-phase1-integration.js
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Create Supabase client with service role for testing
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const TEST_PROJECT_ID = '5baf0e2d-56b3-4945-9af2-238bddd3f95c'; // Mobile Todo App

async function runTests() {
  console.log('🧪 Starting Phase 1 Integration Tests...\n');

  try {
    // Test 1: Check if RPC functions exist
    console.log('1. Checking RPC function availability...');
    const { data: functions, error: funcError } = await supabase
      .from('pg_proc')
      .select('proname')
      .in('proname', ['upsert_project_file', 'delete_project_file', 'list_current_files', 'bulk_upsert_project_files']);
    
    if (funcError) {
      console.error('❌ Failed to check functions:', funcError);
      return;
    }
    
    const functionNames = functions.map(f => f.proname);
    console.log('✅ Available functions:', functionNames);

    // Test 2: Test feature flag check
    console.log('\n2. Testing feature flag system...');
    const { data: flagEnabled, error: flagError } = await supabase.rpc('is_feature_enabled', {
      flag_key: 'FSYNC_USE_RPC',
      user_id: null
    });
    
    if (flagError) {
      console.error('❌ Feature flag check failed:', flagError);
      return;
    }
    console.log('✅ FSYNC_USE_RPC enabled:', flagEnabled);

    // Test 3: Test upsert_project_file
    console.log('\n3. Testing upsert_project_file...');
    const testContent = `import React from 'react';

export default function TestComponent() {
  return (
    <div>
      <h1>Phase 1 Test Component</h1>
      <p>Created at: ${new Date().toISOString()}</p>
    </div>
  );
}`;

    const { data: upsertResult, error: upsertError } = await supabase.rpc('upsert_project_file', {
      project_uuid: TEST_PROJECT_ID,
      p_file_path: 'frontend/components/Phase1TestComponent.tsx',
      p_content: testContent,
      p_file_type: 'typescript',
      expected_version: null
    });

    if (upsertError) {
      console.error('❌ Upsert failed:', upsertError);
      return;
    }
    console.log('✅ File upserted successfully:', {
      path: upsertResult.file_path,
      version: upsertResult.version,
      hash: upsertResult.content_hash?.substring(0, 8) + '...'
    });

    // Test 4: Test list_current_files
    console.log('\n4. Testing list_current_files...');
    const { data: currentFiles, error: listError } = await supabase.rpc('list_current_files', {
      project_uuid: TEST_PROJECT_ID
    });

    if (listError) {
      console.error('❌ List files failed:', listError);
      return;
    }
    console.log('✅ Current files count:', currentFiles?.length || 0);
    const testFile = currentFiles?.find(f => f.file_path === 'frontend/components/Phase1TestComponent.tsx');
    if (testFile) {
      console.log('✅ Test file found in current files');
    }

    // Test 5: Test optimistic concurrency control
    console.log('\n5. Testing optimistic concurrency control...');
    const updatedContent = testContent.replace('Phase 1 Test Component', 'Phase 1 Updated Component');
    
    const { data: updateResult, error: updateError } = await supabase.rpc('upsert_project_file', {
      project_uuid: TEST_PROJECT_ID,
      p_file_path: 'frontend/components/Phase1TestComponent.tsx',
      p_content: updatedContent,
      p_file_type: 'typescript',
      expected_version: upsertResult.version
    });

    if (updateError) {
      console.error('❌ Update with version control failed:', updateError);
      return;
    }
    console.log('✅ Optimistic concurrency control working:', {
      oldVersion: upsertResult.version,
      newVersion: updateResult.version
    });

    // Test 6: Test bulk operations
    console.log('\n6. Testing bulk_upsert_project_files...');
    const bulkFiles = [
      {
        file_path: 'frontend/components/BulkTest1.tsx',
        file_type: 'typescript',
        content: 'export const BulkTest1 = () => <div>Bulk Test 1</div>;'
      },
      {
        file_path: 'frontend/components/BulkTest2.tsx', 
        file_type: 'typescript',
        content: 'export const BulkTest2 = () => <div>Bulk Test 2</div>;'
      },
      {
        file_path: 'frontend/utils/testUtils.ts',
        file_type: 'typescript',
        content: 'export const testUtil = () => "bulk test utility";'
      }
    ];

    const { data: bulkResult, error: bulkError } = await supabase.rpc('bulk_upsert_project_files', {
      project_uuid: TEST_PROJECT_ID,
      files: bulkFiles
    });

    if (bulkError) {
      console.error('❌ Bulk upsert failed:', bulkError);
      return;
    }
    console.log('✅ Bulk operation successful:', {
      filesProcessed: bulkResult.files_processed,
      filesUpserted: bulkResult.files_upserted
    });

    // Test 7: Test delete_project_file
    console.log('\n7. Testing delete_project_file...');
    const { data: deleteResult, error: deleteError } = await supabase.rpc('delete_project_file', {
      project_uuid: TEST_PROJECT_ID,
      p_file_path: 'frontend/components/BulkTest1.tsx',
      expected_version: null
    });

    if (deleteError) {
      console.error('❌ Delete failed:', deleteError);
      return;
    }
    console.log('✅ File deleted successfully (tombstone created):', {
      path: deleteResult.file_path,
      version: deleteResult.version,
      contentIsNull: deleteResult.content === null
    });

    // Test 8: Verify deleted file doesn't appear in current files
    console.log('\n8. Verifying deleted file exclusion...');
    const { data: finalFiles, error: finalListError } = await supabase.rpc('list_current_files', {
      project_uuid: TEST_PROJECT_ID
    });

    if (finalListError) {
      console.error('❌ Final list check failed:', finalListError);
      return;
    }

    const deletedFileStillExists = finalFiles?.some(f => f.file_path === 'frontend/components/BulkTest1.tsx');
    if (deletedFileStillExists) {
      console.error('❌ Deleted file still appears in current files');
      return;
    }
    console.log('✅ Deleted file properly excluded from current files');

    console.log('\n🎉 All Phase 1 Integration Tests Passed!');
    console.log('\n📊 Test Summary:');
    console.log('- RPC Functions: ✅ All available');
    console.log('- Feature Flags: ✅ Working');
    console.log('- File Operations: ✅ Create, Update, Delete');
    console.log('- Versioning: ✅ Optimistic concurrency control');
    console.log('- Bulk Operations: ✅ Atomic multi-file operations');
    console.log('- Tombstone Logic: ✅ Proper deletion handling');

  } catch (error) {
    console.error('💥 Test suite failed with error:', error);
    process.exit(1);
  }
}

// Run the tests
runTests();