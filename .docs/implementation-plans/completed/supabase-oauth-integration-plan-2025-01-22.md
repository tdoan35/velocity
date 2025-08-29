# Supabase Direct Connection Implementation Plan - User's Own Projects

**Document Version**: 2.0  
**Created**: 2025-01-22  
**Updated**: 2025-01-22  
**Status**: Implementation Phase  
**Architecture Reference**: `docs/feature-plans/editor-preview-page-architecture.md`

## Overview

This document provides a comprehensive implementation plan for integrating Supabase direct connection functionality into Velocity's ProjectDesign page. The implementation allows users to connect their own existing Supabase projects by providing their project credentials (URL and anon key), maintaining full ownership and control over their backend infrastructure, data, and billing. Users bring their own Supabase accounts and projects, with Velocity acting as a frontend development environment that connects to user-owned backends through a simple, secure credential-based connection.

## Goals & Objectives

### Primary Goals
1. **Enable User's Supabase Integration**: Allow users to connect their own existing Supabase projects
2. **Data Sovereignty**: Users maintain full ownership and control over their backend infrastructure
3. **Simple Connection Flow**: Provide intuitive credential-based connection without OAuth complexity
4. **User-Controlled Backend**: Users manage their own Supabase projects, billing, and resources
5. **Privacy-First**: No third-party access, credentials stored encrypted, full user control

### Success Metrics
- Successful connection rate > 95%
- Connection establishment time < 10 seconds
- User abandonment rate during flow < 5%
- Zero credential security vulnerabilities
- 100% user data sovereignty maintained
- No external API dependencies for connection

## Technical Requirements

### Frontend Dependencies
- **React Router** (existing): For OAuth callback handling
- **Zustand** (existing): State management for Supabase connection status
- **@supabase/supabase-js** (existing): Supabase client library
- **React Hook Form** (if needed): For configuration forms

### Backend Dependencies
- **@supabase/supabase-js**: For connecting to user projects
- **Crypto Module**: For credential encryption/decryption
- **No External APIs**: Direct connection using user-provided credentials

### Environment Variables Required
```env
# Velocity's Supabase (for user auth and app data)
VITE_SUPABASE_URL= # Velocity's Supabase project
VITE_SUPABASE_ANON_KEY= # Velocity's anon key

# Direct Connection Configuration
VITE_SUPABASE_DIRECT_CONNECTION_ENABLED=true
CREDENTIAL_ENCRYPTION_KEY= # 32-byte encryption key
CREDENTIAL_ENCRYPTION_IV= # 16-byte initialization vector
```

### Database Schema Extensions
```sql
-- Add to existing projects table (connection metadata only)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS supabase_project_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS backend_status TEXT DEFAULT 'disconnected';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS backend_connected_at TIMESTAMP WITH TIME ZONE;

-- User's Supabase connections (encrypted credentials)
CREATE TABLE IF NOT EXISTS supabase_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  encrypted_url TEXT NOT NULL, -- Encrypted project URL
  encrypted_anon_key TEXT NOT NULL, -- Encrypted anon key
  encrypted_service_key TEXT, -- Optional encrypted service role key
  connection_status TEXT DEFAULT 'connected',
  connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_tested TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(project_id) -- One Supabase connection per Velocity project
);

-- Connection test logs
CREATE TABLE IF NOT EXISTS connection_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id UUID REFERENCES supabase_connections(id) ON DELETE CASCADE,
  test_status TEXT NOT NULL, -- 'success' or 'failed'
  error_message TEXT,
  tested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE supabase_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own Supabase connections" 
ON supabase_connections FOR ALL 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view their connection tests" 
ON connection_tests FOR SELECT 
USING (connection_id IN (
  SELECT id FROM supabase_connections WHERE user_id = auth.uid()
));
```

## Architecture Analysis

### Existing Codebase Integration Points

#### 1. ProjectDesign.tsx (`frontend/src/pages/ProjectDesign.tsx`)
**Current State**: 
- Line 926-934: Disabled "Build" button ready for activation
- Top section has "Open Editor" button ready for replacement

**Integration Point**: 
- Replace the "Open Editor" button at the top of the Project Design page with "Connect Supabase" button
- Footer to show connection status and additional actions

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
- `supabase/migrations/20250122000001_supabase_direct_connection.sql`

**Tasks**:
1. Add Supabase connection tracking tables with encrypted fields
2. Extend projects table with backend status fields
3. Set up RLS policies for secure access
4. Create connection test logging table

#### 1.3 Connection Service Layer
**Files to Create**:
- `frontend/src/services/supabaseConnectionService.ts`
- `frontend/src/types/supabase-connection.ts`

**Core Functions**:
```typescript
interface SupabaseConnectionService {
  validateCredentials(url: string, anonKey: string): Promise<boolean>
  testConnection(url: string, anonKey: string): Promise<ConnectionTestResult>
  saveConnection(projectId: string, credentials: SupabaseCredentials): Promise<void>
  getConnection(projectId: string): Promise<SupabaseConnection | null>
  disconnectProject(projectId: string): Promise<void>
  encryptCredentials(credentials: SupabaseCredentials): EncryptedCredentials
  decryptCredentials(encrypted: EncryptedCredentials): SupabaseCredentials
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
  connectionStatus: 'disconnected' | 'testing' | 'connecting' | 'connected' | 'error'
  projectUrl: string | null
  isTestingConnection: boolean
  
  // Credentials (never stored in state, only in encrypted DB)
  tempCredentials: {
    url: string
    anonKey: string
    serviceKey?: string
  } | null
  
  // Actions
  setTempCredentials(credentials: SupabaseCredentials): void
  testConnection(): Promise<ConnectionTestResult>
  saveConnection(projectId: string): Promise<void>
  loadConnection(projectId: string): Promise<void>
  disconnectProject(projectId: string): Promise<void>
  clearTempCredentials(): void
  
  // User Control
  isUserOwned: true // Always true - users own their projects
  canDisconnect: true // Users can always disconnect
  
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
- `frontend/src/pages/ProjectDesign.tsx` (top section and footer)

**Changes**:

1. **Replace "Open Editor" button at the top of the page**:
```tsx
// Replace existing "Open Editor" button in the top section
<Button
  variant="outline"
  size="sm"
  onClick={handleUserSupabaseConnection}
  disabled={isUserSupabaseConnected}
>
  {isUserSupabaseConnected ? (
    <>
      <Check className="w-4 h-4 mr-2" />
      Connected: {userProject.name}
    </>
  ) : (
    <>
      <Database className="w-4 h-4 mr-2" />
      Connect Your Supabase
    </>
  )}
</Button>
```

2. **Update footer for status and additional actions**:
```tsx
// Update footer (lines 926-936)
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

#### 3.2 User Project Selection Flow
**Files to Create**:
- `frontend/src/components/supabase/UserProjectSelector.tsx`

**Features**:
- Display user's existing Supabase projects
- Project selection interface
- Show project details (name, region, plan)
- Connection confirmation
- No project creation - users manage their own projects

#### 3.3 Error Handling & Recovery
**Error States to Handle**:
- OAuth token expiration
- Invalid organization access
- Project creation failures
- Network connectivity issues
- Rate limiting

### Phase 4: Backend Integration (Week 3-4)

#### 4.1 Edge Function for User Project Connection
**Files to Create**:
- `supabase/functions/user-supabase-connection/index.ts`

**Functions**:
```typescript
// List user's Supabase projects
GET /user-supabase-connection/projects
Authorization: Bearer <oauth-token>

// Store user project connection
POST /user-supabase-connection/connect
{
  "velocity_project_id": "string",
  "supabase_project_id": "string",
  "supabase_project_name": "string"
}

// Get connection status
GET /user-supabase-connection/status/:velocity_project_id

// Disconnect user's project
DELETE /user-supabase-connection/disconnect/:velocity_project_id
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

### OAuth Security & User Privacy
1. **State Parameter Validation**: Prevent CSRF attacks
2. **Minimal Data Storage**: Store only connection metadata, no API keys
3. **Minimal Scope**: Use read:projects scope only - no write access
4. **User Control**: Users can revoke access at any time
5. **Data Sovereignty**: User data remains in their own Supabase projects

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
- [ ] Users can connect their own existing Supabase projects via OAuth
- [ ] Users can select from their available Supabase projects
- [ ] Build button activates after successful user project connection
- [ ] User's project name and ownership is clearly displayed
- [ ] Users can disconnect and revoke access at any time
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
1. **User Data Privacy**: 
   - Risk: Accessing user's sensitive project data
   - Mitigation: Minimal OAuth scopes (read:projects only), no API key storage

2. **User Project Access**: 
   - Risk: Users unable to connect their projects
   - Mitigation: Clear error messages, support documentation, OAuth retry

3. **Data Sovereignty Concerns**: 
   - Risk: Users worried about data control
   - Mitigation: Clear messaging about user ownership, easy disconnect option

### Medium-Risk Areas
1. **Browser Compatibility**: OAuth popup handling
2. **Network Connectivity**: Offline/slow connection handling
3. **User Experience**: Complex flow abandonment

## Post-Implementation Roadmap

### Immediate Enhancements (Next Sprint)
1. **Multi-Project Support**: Allow users to connect multiple Supabase projects
2. **Project Switching**: Easy switching between connected user projects
3. **Connection Health Monitoring**: Show user's project status

### Future Enhancements (Next Quarter)
1. **Team Collaboration**: Share Velocity projects (users keep their own Supabase)
2. **Project Templates**: Export/import configurations for user's projects
3. **Usage Analytics**: Help users track their Supabase usage

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