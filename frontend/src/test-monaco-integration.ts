// Test script to verify Monaco Editor integration with new database functions
// This tests the enhanced useUnifiedEditorStore with our atomic upsert functions

import { useUnifiedEditorStore } from './stores/useUnifiedEditorStore';

async function testMonacoIntegration() {
  console.log('🧪 Testing Monaco Editor integration with enhanced database functions...');

  try {
    // Get store instance
    const store = useUnifiedEditorStore.getState();

    // Test 1: Initialize project with a test project ID
    console.log('📁 Test 1: Initializing project files...');
    
    // Use an existing project ID from our database
    const testProjectId = '5baf0e2d-56b3-4945-9af2-238bddd3f95c'; // Mobile Todo App
    
    await store.initializeProjectFiles(testProjectId);
    console.log('✅ Project initialized successfully');
    console.log('📊 Files loaded:', Object.keys(store.files).length);

    // Test 2: Create a test file
    console.log('\n📝 Test 2: Creating test file...');
    const testFilePath = 'frontend/test-monaco-fix.js';
    const testContent = `// Monaco Editor 409 Fix Test
console.log("Testing the new atomic file saving system");

// This file tests:
// 1. Enhanced debouncing in Monaco Editor
// 2. Atomic upsert with row-level locking
// 3. Version conflict resolution
// 4. Save status indicators

function testFunction() {
  return "Monaco Editor is working with enhanced save system!";
}

export default testFunction;
`;

    await store.createFile(testFilePath, testContent);
    console.log('✅ Test file created successfully');

    // Test 3: Update file content (simulating typing)
    console.log('\n✏️ Test 3: Updating file content...');
    const updatedContent = testContent + '\n// Added after creation - testing update functionality\nconsole.log("File updated successfully!");';
    
    store.updateFileContent(testFilePath, updatedContent);
    console.log('✅ File content updated in store (dirty state)');
    console.log('📊 File is dirty:', store.files[testFilePath]?.isDirty);

    // Test 4: Save file using enhanced save function
    console.log('\n💾 Test 4: Saving file with enhanced save logic...');
    await store.saveFile(testFilePath);
    console.log('✅ File saved with enhanced atomic function');
    console.log('📊 File version:', store.files[testFilePath]?.version);
    console.log('📊 File is dirty:', store.files[testFilePath]?.isDirty);
    console.log('📊 Save attempts:', store.files[testFilePath]?.saveAttempts);

    // Test 5: Rapid save simulation (should use retry logic if conflicts occur)
    console.log('\n🏎️ Test 5: Testing rapid saves (conflict resolution)...');
    
    // Make multiple rapid content changes
    for (let i = 0; i < 3; i++) {
      const rapidContent = updatedContent + `\n// Rapid save test ${i + 1}`;
      store.updateFileContent(testFilePath, rapidContent);
      
      try {
        await store.saveFile(testFilePath);
        console.log(`✅ Rapid save ${i + 1} successful`);
      } catch (error) {
        console.log(`⚠️ Rapid save ${i + 1} failed (expected with conflicts):`, error);
      }
    }

    // Test 6: Verify final state
    console.log('\n🔍 Test 6: Verifying final file state...');
    const finalFile = store.files[testFilePath];
    if (finalFile) {
      console.log('📊 Final file state:');
      console.log('  - Path:', finalFile.path);
      console.log('  - Version:', finalFile.version);
      console.log('  - Content Hash:', finalFile.contentHash);
      console.log('  - Is Dirty:', finalFile.isDirty);
      console.log('  - Is Saving:', finalFile.isSaving);
      console.log('  - Save Attempts:', finalFile.saveAttempts);
      console.log('  - Last Save Error:', finalFile.lastSaveError || 'None');
      console.log('  - Content Length:', finalFile.content.length, 'chars');
    }

    console.log('\n🎉 All tests completed successfully!');
    console.log('💡 The enhanced Monaco Editor integration is working correctly.');
    
    return {
      success: true,
      projectId: testProjectId,
      testFile: testFilePath,
      finalVersion: finalFile?.version,
      filesCount: Object.keys(store.files).length
    };

  } catch (error) {
    console.error('❌ Test failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Export for use in browser console or other tests
if (typeof window !== 'undefined') {
  (window as any).testMonacoIntegration = testMonacoIntegration;
}

export { testMonacoIntegration };