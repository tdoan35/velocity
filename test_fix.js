// Simple test to verify our fallback file generation works
const { getSnackFallbackFiles } = require('./frontend/src/utils/snackFallbackFiles.ts');

console.log('Testing fallback file generation...');

try {
  const files = getSnackFallbackFiles('Test Project');
  console.log('✅ Fallback files generated successfully');
  console.log('📁 Generated files:', Object.keys(files));
  console.log('📄 App.tsx content length:', files['frontend/App.tsx']?.content?.length || 0, 'characters');
  
  if (Object.keys(files).length > 0) {
    console.log('✅ Test passed: Files were generated');
  } else {
    console.log('❌ Test failed: No files generated');
  }
} catch (error) {
  console.error('❌ Test failed with error:', error.message);
}