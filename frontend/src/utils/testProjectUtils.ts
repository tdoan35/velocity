// Utility functions for testing different project scenarios

/**
 * Test project IDs that demonstrate different scenarios
 */
export const TEST_PROJECT_IDS = {
  // Project that exists in database but has no files
  EMPTY_PROJECT: 'test-empty-project-123',
  
  // Project that doesn't exist in database at all
  NON_EXISTENT: 'test-non-existent-456',
  
  // Project with existing files (like the demo project)
  WITH_FILES: 'demo-project-12345',
  
  // Full-stack project with Supabase connection
  FULL_STACK: 'test-fullstack-789',
} as const;

/**
 * Generate test URLs for different project scenarios
 */
export const getTestUrls = () => ({
  emptyProject: `/project/${TEST_PROJECT_IDS.EMPTY_PROJECT}/editor`,
  nonExistentProject: `/project/${TEST_PROJECT_IDS.NON_EXISTENT}/editor`,
  demoProject: `/project/${TEST_PROJECT_IDS.WITH_FILES}/editor`,
  fullStackProject: `/project/${TEST_PROJECT_IDS.FULL_STACK}/editor`,
});

/**
 * Test scenarios documentation
 */
export const TEST_SCENARIOS = {
  'Empty Project': {
    url: `/project/${TEST_PROJECT_IDS.EMPTY_PROJECT}/editor`,
    description: 'Project exists in database but has no files - should create default files',
    expectedBehavior: 'Should automatically create default project structure and open App.tsx',
  },
  'Non-Existent Project': {
    url: `/project/${TEST_PROJECT_IDS.NON_EXISTENT}/editor`,
    description: 'Project does not exist in database - should create temporary project',
    expectedBehavior: 'Should create temporary project with default files for testing',
  },
  'Demo Project': {
    url: `/project/${TEST_PROJECT_IDS.WITH_FILES}/editor`,
    description: 'Project with existing files - should load normally',
    expectedBehavior: 'Should load existing files and open the first available file',
  },
  'Full-Stack Project': {
    url: `/project/${TEST_PROJECT_IDS.FULL_STACK}/editor`,
    description: 'Project with Supabase connection - should include backend files',
    expectedBehavior: 'Should create both frontend and backend default files',
  },
} as const;

/**
 * Console logging helper for debugging project loading
 */
export const logProjectLoadingStatus = (projectId: string, scenario: string) => {
  console.group(`🚀 Testing Project Loading: ${scenario}`);
  console.log(`Project ID: ${projectId}`);
  console.log(`URL: ${window.location.pathname}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.groupEnd();
};

/**
 * Validate that a project loaded correctly
 */
export const validateProjectLoaded = (projectData: any, files: any) => {
  const validations = {
    hasProjectData: !!projectData,
    hasFiles: Object.keys(files || {}).length > 0,
    hasFrontendFiles: Object.keys(files || {}).some(path => path.startsWith('frontend/')),
    hasMainApp: 'frontend/App.tsx' in (files || {}),
    hasPackageJson: 'frontend/package.json' in (files || {}),
  };

  console.table(validations);
  
  const allValid = Object.values(validations).every(Boolean);
  
  if (allValid) {
    console.log('✅ Project loaded successfully with all expected files');
  } else {
    console.warn('⚠️  Project loaded but some files may be missing');
  }
  
  return validations;
};