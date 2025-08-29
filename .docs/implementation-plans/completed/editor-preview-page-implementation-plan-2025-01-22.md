# Editor/Preview Page Implementation Plan

**Document Version**: 1.0  
**Created**: 2025-01-22  
**Status**: Planning Phase  
**Architecture Reference**: `docs/feature-plans/editor-preview-page-architecture.md`  
**Dependency**: `docs/implementation-plans/supabase-oauth-integration-plan-2025-01-22.md`

## Overview

This document provides a comprehensive implementation plan for creating the Editor/Preview page in Velocity - the full-stack development environment that transforms PRD-driven projects into interactive coding experiences with real-time preview capabilities and integrated Supabase backend development.

## Goals & Objectives

### Primary Goals
1. **Full-Stack Editor Environment**: Create unified development interface for frontend and backend code
2. **Real-Time Preview Integration**: Seamless hot reload for both frontend and backend changes
3. **Supabase Backend Integration**: Leverage connected Supabase projects for full-stack development
4. **AI-Powered Development**: Context-aware code generation spanning frontend and backend
5. **Production-Ready Pipeline**: Direct path from development to deployment

### Success Metrics
- Page load time < 2 seconds for editor initialization
- Hot reload response time < 1 second for code changes
- 99.5% uptime for preview sessions
- Code generation accuracy > 85% for full-stack requests
- User session retention > 80% after 10 minutes

## Technical Requirements Analysis

### Current Codebase Assets

#### ✅ Existing Components (Ready for Integration)
**Editor Infrastructure**:
- `EditorContainer` (`frontend/src/components/editor/editor-container.tsx`): Multi-tab editor with save functionality
- `CodeEditor` (`frontend/src/components/editor/code-editor.tsx`): Monaco Editor integration
- `EditorTabs` (`frontend/src/components/editor/editor-tabs.tsx`): Tab management system
- `useEditorStore` (`frontend/src/stores/useEditorStore.ts`): Editor state management

**Preview System**:
- `SnackPreviewPanel` (`frontend/src/components/preview/SnackPreviewPanel.tsx`): Web/mobile preview with QR codes
- `useSnackSession` (`frontend/src/hooks/useSnackSession.ts`): Session management
- `SnackWebPlayer` (`frontend/src/components/preview/SnackWebPlayer.tsx`): Embedded preview player

**File Management**:
- `FileExplorer` (`frontend/src/components/file-explorer/file-explorer.tsx`): File tree with operations
- `useFileSystemStore` (`frontend/src/stores/useFileSystemStore.ts`): File system state
- File operations (create, delete, rename, move)

**Layout System**:
- `ResponsiveMonacoWrapper` (`frontend/src/components/layout/responsive-monaco-wrapper.tsx`): Responsive editor
- `ResizablePanel` components: Panel management for layout

#### 🔄 Dependencies from Supabase OAuth Integration
**Required for Full-Stack Development**:
- Supabase connection state from `useSupabaseConnectionStore`
- Project configuration and backend details
- Authentication and authorization for backend operations
- Database schema and Edge Function management

### New Components Required

#### 1. Project Editor Page
**Location**: `frontend/src/pages/ProjectEditor.tsx`
**Purpose**: Main editor page container with full-stack layout

#### 2. Backend File Management
**Location**: `frontend/src/components/backend/`
**Components**:
- `BackendFileExplorer.tsx`: Supabase-specific file tree
- `DatabaseSchemaEditor.tsx`: Visual database schema editor
- `EdgeFunctionEditor.tsx`: Edge Function code editor
- `MigrationManager.tsx`: Database migration interface

#### 3. Enhanced Preview System
**Location**: `frontend/src/components/preview/enhanced/`
**Components**:
- `FullStackPreviewPanel.tsx`: Preview with backend integration
- `APITestingPanel.tsx`: REST/GraphQL API testing interface
- `DatabaseBrowser.tsx`: Real-time database inspection
- `LogsConsole.tsx`: Unified frontend/backend logging

#### 4. AI Integration Components
**Location**: `frontend/src/components/ai/`
**Components**:
- `FullStackAIAssistant.tsx`: AI panel for full-stack development
- `BackendCodeGenerator.tsx`: Supabase-specific code generation
- `SchemaGenerator.tsx`: AI-powered database schema creation

## Architecture Integration Points

### Route Structure
```typescript
// Add to App.tsx
<Route path="/project/:id/editor" element={<ProjectEditor />} />

// Route protection
interface ProjectEditorGuard {
  - Authenticated user required
  - Project ownership validation
  - Supabase connection verification
  - PRD completion check (minimum viable)
}
```

### State Management Extensions

#### Enhanced Editor Store
**File**: `frontend/src/stores/useProjectEditorStore.ts`
```typescript
interface ProjectEditorState extends EditorState {
  // Project Context
  projectId: string
  projectType: 'frontend-only' | 'full-stack'
  supabaseProject: SupabaseProject | null
  
  // File Structure
  frontendFiles: FileTree
  backendFiles: FileTree
  sharedFiles: FileTree
  
  // Build State
  buildStatus: 'idle' | 'generating' | 'building' | 'success' | 'error'
  deploymentStatus: 'ready' | 'deploying' | 'deployed' | 'failed'
  
  // Preview Integration
  previewSession: SnackSession | null
  backendEndpoint: string | null
  databaseConnection: DatabaseConnection | null
  
  // Actions
  initializeProject(): Promise<void>
  generateProjectStructure(): Promise<void>
  syncWithSupabase(): Promise<void>
  deployProject(): Promise<void>
}
```

#### Backend Integration Store
**File**: `frontend/src/stores/useBackendEditorStore.ts`
```typescript
interface BackendEditorState {
  // Supabase Integration
  edgeFunctions: EdgeFunction[]
  databaseSchema: DatabaseSchema
  migrations: Migration[]
  authProviders: AuthProvider[]
  
  // Development State
  functionDeployStatus: Record<string, DeploymentStatus>
  migrationStatus: 'up-to-date' | 'pending' | 'running' | 'error'
  schemaValidation: SchemaValidationResult[]
  
  // Real-time Updates
  functionLogs: LogEntry[]
  databaseActivity: DatabaseActivity[]
  
  // Actions
  deployFunction(functionId: string): Promise<void>
  runMigration(migrationId: string): Promise<void>
  updateSchema(schema: DatabaseSchema): Promise<void>
  testFunction(functionId: string, testData: any): Promise<any>
}
```

## Implementation Phases

### Phase 1: Core Editor Infrastructure (Week 1-2)

#### 1.1 Project Editor Page Setup
**Files to Create**:
- `frontend/src/pages/ProjectEditor.tsx`
- `frontend/src/stores/useProjectEditorStore.ts`

**Integration Points**:
- Route setup in `App.tsx`
- Navigation from ProjectDesign page (Build button)
- Authentication and project ownership validation

**Layout Implementation**:
```tsx
// ProjectEditor.tsx structure
<div className="h-screen flex flex-col">
  {/* Header */}
  <ProjectEditorHeader 
    projectId={projectId}
    projectName={projectName}
    buildStatus={buildStatus}
    deploymentUrl={deploymentUrl}
  />
  
  {/* Main Content */}
  <ResizablePanelGroup direction="horizontal" className="flex-1">
    {/* File Explorer */}
    <ResizablePanel defaultSize={20} minSize={15}>
      <FullStackFileExplorer 
        projectId={projectId}
        showBackend={isSupabaseConnected}
      />
    </ResizablePanel>
    
    {/* Editor */}
    <ResizablePanel defaultSize={50} minSize={30}>
      <EnhancedEditorContainer 
        projectType={projectType}
        onSave={handleFileSave}
      />
    </ResizablePanel>
    
    {/* Preview */}
    <ResizablePanel defaultSize={30} minSize={20}>
      <FullStackPreviewPanel 
        sessionId={sessionId}
        backendEndpoint={backendEndpoint}
        showAPITesting={isSupabaseConnected}
      />
    </ResizablePanel>
  </ResizablePanelGroup>
  
  {/* AI Assistant Panel (Collapsible) */}
  <CollapsiblePanel>
    <FullStackAIAssistant 
      projectContext={projectContext}
      currentFile={activeFile}
    />
  </CollapsiblePanel>
</div>
```

#### 1.2 Enhanced File Explorer
**Files to Modify**:
- `frontend/src/components/file-explorer/file-explorer.tsx`
- `frontend/src/stores/useFileSystemStore.ts`

**New Components**:
- `frontend/src/components/file-explorer/FullStackFileExplorer.tsx`
- `frontend/src/components/backend/BackendFileTree.tsx`

**Features**:
- Frontend/ Backend/ Database/ folder structure
- Context-aware file operations
- Supabase-specific file types (migrations, functions, schemas)
- Real-time sync with Supabase project

#### 1.3 Enhanced Editor Container
**Files to Create**:
- `frontend/src/components/editor/EnhancedEditorContainer.tsx`
- `frontend/src/components/editor/BackendCodeEditor.tsx`

**Extensions to Existing Components**:
- Multi-language support for backend files
- Supabase-specific IntelliSense and auto-completion
- Database schema validation and highlighting
- Edge Function debugging integration

### Phase 2: Supabase Backend Integration (Week 2-3)

#### 2.1 Backend File Management System
**Files to Create**:
- `frontend/src/components/backend/DatabaseSchemaEditor.tsx`
- `frontend/src/components/backend/EdgeFunctionEditor.tsx`
- `frontend/src/components/backend/MigrationManager.tsx`
- `frontend/src/services/supabaseProjectService.ts`

**Backend File Operations**:
```typescript
interface BackendFileOperations {
  // Edge Functions
  createEdgeFunction(name: string, template?: string): Promise<EdgeFunction>
  updateEdgeFunction(id: string, code: string): Promise<void>
  deployEdgeFunction(id: string): Promise<DeploymentResult>
  testEdgeFunction(id: string, payload: any): Promise<TestResult>
  
  // Database Schema
  updateSchema(schema: DatabaseSchema): Promise<void>
  generateMigration(schemaChanges: SchemaChange[]): Promise<Migration>
  runMigration(migrationId: string): Promise<MigrationResult>
  
  // File Sync
  syncWithSupabase(): Promise<SyncResult>
  pushChanges(): Promise<PushResult>
  pullChanges(): Promise<PullResult>
}
```

#### 2.2 Database Integration
**Files to Create**:
- `frontend/src/components/database/DatabaseBrowser.tsx`
- `frontend/src/components/database/SchemaVisualizer.tsx`
- `frontend/src/components/database/QueryEditor.tsx`
- `frontend/src/hooks/useSupabaseDatabase.ts`

**Database Features**:
- Real-time table browsing
- Query execution and results
- Schema visualization and editing
- RLS policy management

#### 2.3 API Testing Integration
**Files to Create**:
- `frontend/src/components/api/APITestingPanel.tsx`
- `frontend/src/components/api/RequestBuilder.tsx`
- `frontend/src/components/api/ResponseViewer.tsx`
- `frontend/src/hooks/useAPITesting.ts`

**API Testing Features**:
- REST endpoint testing
- GraphQL query building
- Authentication testing
- Real-time API monitoring

### Phase 3: Enhanced Preview System (Week 3-4)

#### 3.1 Full-Stack Preview Integration
**Files to Create**:
- `frontend/src/components/preview/FullStackPreviewPanel.tsx`
- `frontend/src/components/preview/BackendPreview.tsx`
- `frontend/src/hooks/useFullStackPreview.ts`

**Extensions to Existing Preview**:
```tsx
// Enhanced SnackPreviewPanel integration
interface FullStackPreviewProps extends SnackPreviewPanelProps {
  backendEndpoint: string
  databaseConnection: DatabaseConnection
  onBackendError: (error: BackendError) => void
  onAPIResponse: (response: APIResponse) => void
}
```

**Preview Features**:
- Frontend preview with live backend connectivity
- Real-time backend logs integration
- API response monitoring
- Database change tracking

#### 3.2 Hot Reload Enhancement
**Files to Modify**:
- `frontend/src/hooks/useSnackSession.ts`
- `frontend/src/hooks/useHotReload.ts`

**New Files**:
- `frontend/src/hooks/useFullStackHotReload.ts`
- `frontend/src/services/hotReloadService.ts`

**Hot Reload Features**:
```typescript
interface FullStackHotReload {
  // Frontend Hot Reload (existing)
  reloadFrontend(): Promise<void>
  
  // Backend Hot Reload (new)
  reloadBackend(): Promise<void>
  deployFunction(functionId: string): Promise<void>
  runMigration(): Promise<void>
  
  // Coordinated Reload
  fullStackReload(): Promise<void>
  
  // Real-time Updates
  onFrontendChange: (callback: () => void) => void
  onBackendChange: (callback: () => void) => void
  onSchemaChange: (callback: () => void) => void
}
```

#### 3.3 Error Handling and Debugging
**Files to Create**:
- `frontend/src/components/debug/ErrorConsole.tsx`
- `frontend/src/components/debug/LogsViewer.tsx`
- `frontend/src/components/debug/PerformanceMonitor.tsx`
- `frontend/src/services/debuggingService.ts`

**Debugging Features**:
- Unified error tracking (frontend + backend)
- Real-time log streaming
- Performance metrics monitoring
- Network request inspection

### Phase 4: AI-Powered Full-Stack Development (Week 4-5)

#### 4.1 AI Assistant Integration
**Files to Create**:
- `frontend/src/components/ai/FullStackAIAssistant.tsx`
- `frontend/src/components/ai/ContextAnalyzer.tsx`
- `frontend/src/services/fullStackAIService.ts`

**AI Features**:
```typescript
interface FullStackAICapabilities {
  // Code Generation
  generateFrontendComponent(requirement: string): Promise<ComponentCode>
  generateBackendFunction(requirement: string): Promise<EdgeFunctionCode>
  generateDatabaseSchema(requirement: string): Promise<DatabaseSchema>
  
  // Cross-Stack Generation
  generateFullFeature(requirement: string): Promise<FullStackFeature>
  
  // Context Analysis
  analyzeProjectContext(): Promise<ProjectContext>
  suggestImprovements(): Promise<Improvement[]>
  detectIssues(): Promise<Issue[]>
}
```

#### 4.2 Code Generation Templates
**Files to Create**:
- `frontend/src/templates/frontend/` (React Native component templates)
- `frontend/src/templates/backend/` (Edge Function templates)
- `frontend/src/templates/database/` (Schema templates)
- `frontend/src/services/templateService.ts`

**Template System**:
- Pre-built component templates
- Supabase integration patterns
- Authentication flow templates
- CRUD operation generators

## Security & Performance Considerations

### Security Implementation

#### Code Security
```typescript
interface CodeSecurityService {
  // Code Scanning
  scanForVulnerabilities(code: string): Promise<SecurityIssue[]>
  validateEnvironmentVariables(env: Record<string, string>): SecurityValidation
  
  // Access Control
  validateUserAccess(userId: string, projectId: string): Promise<boolean>
  auditCodeChanges(change: CodeChange): Promise<void>
  
  // Secret Management
  maskSecrets(code: string): string
  validateSecretUsage(code: string): SecurityValidation[]
}
```

#### Database Security
- Automatic RLS policy generation
- Schema change validation
- Query sanitization
- Access pattern monitoring

### Performance Optimization

#### Editor Performance
```typescript
interface EditorOptimization {
  // Code Editor
  enableVirtualization: boolean
  lazyLoadLanguageSupport: boolean
  debounceChanges: number // milliseconds
  
  // File System
  virtualFileSystem: boolean
  fileCaching: boolean
  incrementalSync: boolean
  
  // Preview
  previewThrottling: number
  backgroundPreloading: boolean
  resourceOptimization: boolean
}
```

#### Network Optimization
- Debounced API calls
- Request batching
- WebSocket optimization
- CDN integration for assets

## Testing Strategy

### Unit Tests
**Test Files to Create**:
- `frontend/src/__tests__/editor/project-editor.test.ts`
- `frontend/src/__tests__/backend/supabase-integration.test.ts`
- `frontend/src/__tests__/preview/full-stack-preview.test.ts`
- `frontend/src/__tests__/ai/code-generation.test.ts`

### Integration Tests
**Test Scenarios**:
1. Complete project creation and setup flow
2. Frontend-backend communication
3. Real-time preview updates
4. Database schema modifications
5. Edge Function deployment and testing

### E2E Tests (Playwright)
**Test Files**:
- `tests/e2e/editor/full-stack-development.spec.ts`
- `tests/e2e/preview/real-time-updates.spec.ts`
- `tests/e2e/deployment/production-pipeline.spec.ts`

**Test Scenarios**:
```typescript
// E2E Test Example
test('Full-Stack Development Flow', async ({ page }) => {
  // Navigate to editor
  await page.goto('/project/123/editor')
  
  // Create frontend component
  await page.click('[data-testid="create-component"]')
  await page.fill('[data-testid="component-name"]', 'UserProfile')
  
  // Generate backend API
  await page.click('[data-testid="ai-assistant"]')
  await page.fill('[data-testid="ai-prompt"]', 'Create user profile API')
  
  // Verify preview updates
  await expect(page.locator('[data-testid="preview-frame"]')).toBeVisible()
  
  // Test API endpoint
  await page.click('[data-testid="api-testing"]')
  await page.click('[data-testid="test-endpoint"]')
  
  // Verify deployment
  await page.click('[data-testid="deploy-button"]')
  await expect(page.locator('[data-testid="deployment-success"]')).toBeVisible()
})
```

## Deployment & Monitoring

### Feature Flags
```typescript
interface EditorFeatureFlags {
  enableFullStackEditor: boolean
  enableBackendIntegration: boolean
  enableAIAssistant: boolean
  enableRealTimeCollaboration: boolean
  enableAdvancedDebugging: boolean
  maxConcurrentSessions: number
}
```

### Performance Monitoring
```typescript
interface EditorMetrics {
  // Load Times
  editorInitializationTime: number
  previewLoadTime: number
  hotReloadTime: number
  
  // User Engagement
  sessionDuration: number
  codeGenerationUsage: number
  deploymentSuccessRate: number
  
  // System Performance
  memoryUsage: number
  cpuUsage: number
  networkLatency: number
  errorRate: number
}
```

### Rollback Strategy
1. **Component-Level Rollback**: Individual component feature flags
2. **Store State Backup**: Automatic state snapshots
3. **Code Recovery**: Version control integration
4. **Session Preservation**: User work protection during rollbacks

## Migration Strategy

### From Existing Components
```typescript
interface MigrationPlan {
  // Phase 1: Compatibility Layer
  wrapExistingComponents(): void
  maintainExistingAPI(): void
  
  // Phase 2: Enhanced Features
  addBackendSupport(): void
  enhancePreviewSystem(): void
  
  // Phase 3: Full Integration
  replaceWithNewComponents(): void
  removeCompatibilityLayer(): void
}
```

### User Data Migration
- Preserve existing projects and sessions
- Migrate editor state and preferences
- Convert file structures to new format
- Maintain preview session continuity

## Success Criteria & KPIs

### Functional Requirements
- [ ] Users can edit frontend and backend code in unified interface
- [ ] Real-time preview works with live backend connectivity
- [ ] Hot reload updates both frontend and backend changes < 1 second
- [ ] AI assistant generates accurate full-stack code
- [ ] Database schema editor integrates seamlessly with Supabase
- [ ] API testing panel works with live Edge Functions
- [ ] Deployment pipeline functions end-to-end

### User Experience Requirements
- [ ] Editor loads completely in < 2 seconds
- [ ] No data loss during session transitions
- [ ] Intuitive navigation between frontend/backend code
- [ ] Clear visual feedback for all operations
- [ ] Responsive design works on all supported screen sizes

### Technical Requirements
- [ ] 99.5% uptime for editor sessions
- [ ] < 100ms response time for code operations
- [ ] Handles projects up to 1000 files efficiently
- [ ] Supports concurrent collaborative editing
- [ ] Zero security vulnerabilities in audit

## Risk Assessment & Mitigation

### High-Risk Areas

#### 1. State Management Complexity
- **Risk**: Complex state synchronization between frontend/backend
- **Mitigation**: Comprehensive state management testing, atomic operations

#### 2. Real-Time Performance
- **Risk**: Lag in hot reload and preview updates
- **Mitigation**: Performance monitoring, optimization strategies, fallback modes

#### 3. Supabase Integration Reliability
- **Risk**: Dependency on external Supabase services
- **Mitigation**: Robust error handling, offline mode, retry logic

### Medium-Risk Areas
1. **Browser Compatibility**: Advanced editor features
2. **Memory Management**: Large project handling
3. **Network Connectivity**: Real-time features during poor connections

## Post-Implementation Roadmap

### Immediate Enhancements (Next Sprint)
1. **Collaborative Editing**: Real-time multi-user collaboration
2. **Advanced Debugging**: Breakpoints and step-through debugging
3. **Performance Optimization**: Advanced caching and virtualization

### Future Enhancements (Next Quarter)
1. **Mobile Editor**: Touch-optimized mobile editing
2. **Visual Database Designer**: Drag-and-drop schema creation
3. **Advanced AI**: Context-aware refactoring and optimization
4. **Integration Marketplace**: Third-party service integrations

## Implementation Timeline

### Week 1-2: Foundation
- Project editor page infrastructure
- Enhanced file explorer with backend support
- Basic Supabase integration

### Week 2-3: Backend Integration
- Database schema editor
- Edge Function development environment
- API testing integration

### Week 3-4: Preview Enhancement
- Full-stack preview with backend connectivity
- Hot reload for backend changes
- Unified error handling and debugging

### Week 4-5: AI Integration
- Full-stack AI assistant
- Context-aware code generation
- Template system integration

### Week 5-6: Testing & Optimization
- Comprehensive testing suite
- Performance optimization
- Security audit and hardening

## References

- **Architecture Plan**: `docs/feature-plans/editor-preview-page-architecture.md`
- **Supabase OAuth Plan**: `docs/implementation-plans/supabase-oauth-integration-plan-2025-01-22.md`
- **Monaco Editor Documentation**: https://microsoft.github.io/monaco-editor/
- **Supabase Edge Functions**: https://supabase.com/docs/guides/functions
- **React Hot Reload**: https://webpack.js.org/concepts/hot-module-replacement/

---

**Document Maintenance**:
- Weekly progress reviews against implementation phases
- Monthly architecture alignment checks
- Quarterly feature roadmap updates
- Continuous performance metrics tracking

*This implementation plan serves as the definitive guide for building the Editor/Preview page with full-stack Supabase integration. All development should follow this plan, with any deviations documented and approved through proper change management.*