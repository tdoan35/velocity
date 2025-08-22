# Supabase OAuth Integration Implementation Plan

**Document Version**: 1.0  
**Created**: 2025-01-22  
**Status**: Planning Phase  
**Architecture Reference**: `docs/feature-plans/editor-preview-page-architecture.md`

## Overview

This document provides a comprehensive implementation plan for integrating Supabase OAuth functionality into Velocity's ProjectDesign page. The implementation follows a simplified, user-controlled approach where users manually connect their Supabase accounts via a "Connect Supabase" button, establishing the foundation for full-stack development capabilities.

## Goals & Objectives

### Primary Goals
1. **Enable Supabase Integration**: Allow users to connect their existing Supabase accounts
2. **Automated Project Setup**: Create new Supabase projects with basic configuration
3. **Seamless UX**: Provide intuitive OAuth flow within ProjectDesign interface
4. **Foundation for Full-Stack**: Establish backend infrastructure for editor integration

### Success Metrics
- Successful OAuth connection rate > 95%
- Project creation time < 30 seconds
- User abandonment rate during flow < 10%
- Zero authentication security vulnerabilities

## Technical Requirements

### Frontend Dependencies
- **React Router** (existing): For OAuth callback handling
- **Zustand** (existing): State management for Supabase connection status
- **@supabase/supabase-js** (existing): Supabase client library
- **React Hook Form** (if needed): For configuration forms

### Backend Dependencies
- **Supabase Management API**: For programmatic project creation
- **Supabase CLI Integration**: For project configuration and deployment
- **OAuth Providers**: Supabase OAuth for account access

### Environment Variables Required
```env
# Existing (already configured)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# New (to be added)
VITE_SUPABASE_MANAGEMENT_API_URL=https://api.supabase.com/v1
SUPABASE_ACCESS_TOKEN= # For server-side project creation
SUPABASE_OAUTH_CLIENT_ID= # For OAuth integration
SUPABASE_OAUTH_CLIENT_SECRET= # For OAuth integration
```

### Database Schema Extensions
```sql
-- Add to existing projects table
ALTER TABLE projects ADD COLUMN IF NOT EXISTS supabase_project_ref TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS supabase_project_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS supabase_anon_key TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS backend_status TEXT DEFAULT 'disconnected';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS backend_config JSONB DEFAULT '{}';

-- Add Supabase connections tracking
CREATE TABLE IF NOT EXISTS supabase_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  supabase_access_token TEXT, -- Encrypted
  supabase_refresh_token TEXT, -- Encrypted
  supabase_org_id TEXT,
  connection_status TEXT DEFAULT 'connected',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(user_id, project_id)
);

-- RLS Policies
ALTER TABLE supabase_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own Supabase connections" 
ON supabase_connections FOR ALL 
USING (auth.uid() = user_id);
```

## Architecture Analysis

### Existing Codebase Integration Points

#### 1. ProjectDesign.tsx (`frontend/src/pages/ProjectDesign.tsx`)
**Current State**: 
- Line 926-934: Disabled "Build" button ready for activation
- Footer card structure perfect for adding Supabase connection

**Integration Point**: 
- Add "Connect Supabase" button alongside "Build" button
- Modify footer to show connection status

#### 2. Supabase Client (`frontend/src/lib/supabase.ts`)
**Current State**: 
- Basic Supabase client configuration
- Auth persistence and real-time setup

**Extension Needed**:
- Add management API client for project operations
- OAuth flow configuration

#### 3. Auth Store (`frontend/src/stores/useAuthStore.ts`)
**Current State**: 
- User authentication state management
- Auth service integration

**Extension Needed**:
- Add Supabase connection state management
- OAuth token storage

#### 4. App Routing (`frontend/src/App.tsx`)
**Current State**: 
- React Router setup with AuthCallback
- Authenticated layout structure

**Extension Needed**:
- Add Supabase OAuth callback route
- Handle OAuth state management

### New Components to Create

#### 1. SupabaseConnection Store
**Location**: `frontend/src/stores/useSupabaseConnectionStore.ts`
**Purpose**: Manage Supabase OAuth state and project connections

#### 2. Supabase Service
**Location**: `frontend/src/services/supabaseManagementService.ts`
**Purpose**: Handle Supabase Management API operations

#### 3. OAuth Components
**Location**: `frontend/src/components/supabase/`
**Components**: 
- `SupabaseConnectButton.tsx`
- `SupabaseConnectionStatus.tsx`
- `SupabaseOAuthCallback.tsx`

## Implementation Phases

### Phase 1: Core OAuth Infrastructure (Week 1)

#### 1.1 Environment Setup
**Files to Modify**:
- `frontend/.env.example`
- `frontend/src/config/env.ts`

**Tasks**:
1. Add Supabase Management API environment variables
2. Configure OAuth client credentials
3. Update environment validation

**Implementation**:
```typescript
// frontend/src/config/env.ts additions
export const SUPABASE_MANAGEMENT_API_URL = import.meta.env.VITE_SUPABASE_MANAGEMENT_API_URL || 'https://api.supabase.com/v1'
export const SUPABASE_OAUTH_CLIENT_ID = import.meta.env.VITE_SUPABASE_OAUTH_CLIENT_ID || ''
```

#### 1.2 Database Schema Updates
**Files to Create**:
- `supabase/migrations/20250122000001_supabase_integration.sql`

**Tasks**:
1. Add Supabase connection tracking tables
2. Extend projects table with backend fields
3. Set up RLS policies

#### 1.3 OAuth Service Layer
**Files to Create**:
- `frontend/src/services/supabaseManagementService.ts`
- `frontend/src/types/supabase-management.ts`

**Core Functions**:
```typescript
interface SupabaseManagementService {
  initiateOAuth(): Promise<{ url: string; state: string }>
  handleOAuthCallback(code: string, state: string): Promise<OAuthTokens>
  createProject(name: string, orgId: string): Promise<SupabaseProject>
  listOrganizations(): Promise<SupabaseOrganization[]>
  getProjectDetails(projectRef: string): Promise<SupabaseProject>
}
```

#### 1.4 State Management
**Files to Create**:
- `frontend/src/stores/useSupabaseConnectionStore.ts`

**State Interface**:
```typescript
interface SupabaseConnectionState {
  // Connection State
  isConnected: boolean
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  currentProject: SupabaseProject | null
  organizations: SupabaseOrganization[]
  
  // OAuth State
  oauthState: string | null
  isAuthenticating: boolean
  
  // Actions
  initiateConnection(): Promise<void>
  handleOAuthSuccess(tokens: OAuthTokens): Promise<void>
  createNewProject(name: string, orgId: string): Promise<void>
  disconnectSupabase(): Promise<void>
  
  // Error Handling
  error: string | null
  clearError(): void
}
```

### Phase 2: UI Integration (Week 2)

#### 2.1 Connection Button Component
**Files to Create**:
- `frontend/src/components/supabase/SupabaseConnectButton.tsx`

**Features**:
- Responsive design matching existing UI
- Loading states and error handling
- Tooltip with connection benefits

**Implementation**:
```tsx
interface SupabaseConnectButtonProps {
  projectId: string
  onConnectionSuccess?: (project: SupabaseProject) => void
  className?: string
}

export function SupabaseConnectButton({ projectId, onConnectionSuccess, className }: SupabaseConnectButtonProps) {
  // Button with OAuth initiation
  // Loading states
  // Error handling
  // Success feedback
}
```

#### 2.2 Connection Status Component
**Files to Create**:
- `frontend/src/components/supabase/SupabaseConnectionStatus.tsx`

**Features**:
- Real-time connection status
- Project information display
- Disconnect functionality

#### 2.3 ProjectDesign Integration
**Files to Modify**:
- `frontend/src/pages/ProjectDesign.tsx` (lines 926-936)

**Changes**:
```tsx
// Replace existing footer (lines 926-936)
<CardFooter className="p-4">
  <div className="flex gap-2 w-full">
    <Button
      variant="outline"
      size="sm"
      className="flex-1"
      onClick={() => setShowPRD(!showPRD)}
    >
      <FileText className="w-4 h-4 mr-2" />
      {showPRD ? 'Show Chat' : 'View PRD'}
      {hasPRD && !showPRD && (
        <div className="ml-auto w-2 h-2 rounded-full bg-green-500" />
      )}
    </Button>
    
    {/* New Supabase Connection Button */}
    <SupabaseConnectButton 
      projectId={projectId} 
      className="flex-1"
      onConnectionSuccess={(project) => {
        // Enable build button
        // Show success notification
      }}
    />
    
    <Button
      variant="outline"
      size="sm"
      className="flex-1"
      disabled={!isSupabaseConnected} // Enable when connected
      onClick={() => navigateToEditor()}
    >
      <Code2 className="w-4 h-4 mr-2" />
      Build
    </Button>
  </div>
  
  {/* Connection Status */}
  {isSupabaseConnected && (
    <SupabaseConnectionStatus 
      projectId={projectId}
      className="mt-2"
    />
  )}
</CardFooter>
```

### Phase 3: OAuth Flow Implementation (Week 2-3)

#### 3.1 OAuth Callback Handler
**Files to Create**:
- `frontend/src/components/supabase/SupabaseOAuthCallback.tsx`
- `frontend/src/pages/SupabaseCallback.tsx`

**Routing Update**:
```tsx
// Add to App.tsx routes
<Route path="/auth/supabase/callback" element={<SupabaseCallback />} />
```

#### 3.2 Project Creation Flow
**Files to Create**:
- `frontend/src/components/supabase/ProjectCreationWizard.tsx`

**Features**:
- Organization selection
- Project naming
- Configuration options
- Progress tracking

#### 3.3 Error Handling & Recovery
**Error States to Handle**:
- OAuth token expiration
- Invalid organization access
- Project creation failures
- Network connectivity issues
- Rate limiting

### Phase 4: Backend Integration (Week 3-4)

#### 4.1 Edge Function for Project Management
**Files to Create**:
- `supabase/functions/supabase-project-management/index.ts`

**Functions**:
```typescript
// Handle secure project creation
POST /supabase-project-management/create
{
  "name": "string",
  "organization_id": "string",
  "user_tokens": "encrypted_tokens"
}

// Get project status
GET /supabase-project-management/status/:project_ref

// Update project configuration
PUT /supabase-project-management/configure/:project_ref
```

#### 4.2 Token Security & Storage
**Security Measures**:
- Encrypt OAuth tokens before database storage
- Implement token refresh logic
- Secure token transmission
- Audit trail for project access

#### 4.3 Webhook Integration
**Files to Create**:
- `supabase/functions/supabase-webhooks/index.ts`

**Purpose**:
- Handle Supabase project status updates
- Sync project configuration changes
- Monitor project health

## Security Considerations

### OAuth Security
1. **State Parameter Validation**: Prevent CSRF attacks
2. **Token Encryption**: Encrypt stored OAuth tokens
3. **Scope Limitation**: Request minimal required permissions
4. **Token Rotation**: Implement refresh token rotation

### API Security
1. **Rate Limiting**: Implement API rate limiting
2. **Authentication**: Verify user ownership of projects
3. **Audit Logging**: Log all project operations
4. **Error Handling**: Avoid information disclosure

### Data Protection
```typescript
// Token encryption service
interface TokenEncryption {
  encrypt(token: string): Promise<string>
  decrypt(encryptedToken: string): Promise<string>
  rotateKeys(): Promise<void>
}
```

## Testing Strategy

### Unit Tests
**Files to Create**:
- `frontend/src/__tests__/supabase-connection.test.ts`
- `frontend/src/__tests__/oauth-flow.test.ts`
- `frontend/src/__tests__/project-creation.test.ts`

### Integration Tests
**Test Scenarios**:
1. Complete OAuth flow end-to-end
2. Project creation with various configurations
3. Error handling and recovery flows
4. Token refresh and expiration handling

### E2E Tests
**Playwright Tests**:
- User connects Supabase account
- Project creation workflow
- Connection status updates
- Build button activation

## Performance Considerations

### Optimization Strategies
1. **Lazy Loading**: Load Supabase components only when needed
2. **Caching**: Cache organization and project data
3. **Background Sync**: Update project status in background
4. **Debouncing**: Debounce API calls during user interactions

### Monitoring
```typescript
// Performance tracking
interface SupabaseMetrics {
  connectionTime: number
  projectCreationTime: number
  apiResponseTimes: Record<string, number>
  errorRates: Record<string, number>
}
```

## Deployment Strategy

### Environment Rollout
1. **Development**: Full OAuth integration testing
2. **Staging**: End-to-end workflow validation
3. **Production**: Gradual user rollout with feature flags

### Feature Flags
```typescript
// Feature flag configuration
interface SupabaseFeatureFlags {
  enableSupabaseConnection: boolean
  enableProjectCreation: boolean
  enableAdvancedConfiguration: boolean
  maxProjectsPerUser: number
}
```

### Rollback Plan
1. **Disable Feature Flags**: Immediate rollback capability
2. **Database Migration Rollback**: Reversible schema changes
3. **Frontend Fallback**: Graceful degradation to original UI

## Success Criteria

### Functional Requirements
- [ ] Users can connect Supabase accounts via OAuth
- [ ] Projects are created automatically with correct configuration
- [ ] Build button activates after successful connection
- [ ] Connection status is clearly visible and accurate
- [ ] Error states provide clear user guidance

### Non-Functional Requirements
- [ ] OAuth flow completes in < 30 seconds
- [ ] 99.9% uptime for connection service
- [ ] Zero security vulnerabilities in security audit
- [ ] Responsive design works on all supported devices
- [ ] Comprehensive error logging and monitoring

### User Experience Requirements
- [ ] Intuitive connection flow requiring minimal user knowledge
- [ ] Clear visual feedback during all operations
- [ ] Helpful error messages with recovery suggestions
- [ ] Consistent with existing Velocity design patterns

## Risk Assessment & Mitigation

### High-Risk Areas
1. **OAuth Token Security**: 
   - Risk: Token theft or misuse
   - Mitigation: Encryption, short expiry, audit logging

2. **Project Creation Failures**: 
   - Risk: Users unable to create projects
   - Mitigation: Retry logic, fallback options, clear error messages

3. **API Rate Limiting**: 
   - Risk: Users hitting Supabase API limits
   - Mitigation: Request batching, intelligent retry, usage monitoring

### Medium-Risk Areas
1. **Browser Compatibility**: OAuth popup handling
2. **Network Connectivity**: Offline/slow connection handling
3. **User Experience**: Complex flow abandonment

## Post-Implementation Roadmap

### Immediate Enhancements (Next Sprint)
1. **Config Helper Integration**: AI-powered requirement analysis
2. **Advanced Project Templates**: Pre-configured project types
3. **Bulk Project Operations**: Manage multiple projects

### Future Enhancements (Next Quarter)
1. **Team Collaboration**: Shared Supabase projects
2. **Advanced Configuration**: Database schema customization
3. **Monitoring Dashboard**: Project health and usage analytics

## References

- **Architecture Plan**: `docs/feature-plans/editor-preview-page-architecture.md`
- **Supabase Management API**: https://supabase.com/docs/guides/platform/api
- **OAuth 2.0 Security**: https://tools.ietf.org/html/rfc6749
- **React OAuth Patterns**: https://auth0.com/blog/react-authentication-patterns/

---

**Document Maintenance**:
- Review monthly for accuracy
- Update with implementation feedback
- Track progress against success criteria
- Document lessons learned and optimizations

*This implementation plan serves as the definitive guide for implementing Supabase OAuth integration in Velocity. All implementation should follow this plan, with deviations documented and approved through the standard change management process.*