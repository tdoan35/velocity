# Editor/Preview Page Architecture Plan

## Overview

This document outlines the comprehensive architecture for implementing the Editor/Preview page in Velocity - the critical bridge between PRD creation and live app development. This page will transform the PRD-driven project design into an interactive coding environment with real-time preview capabilities and integrated Supabase backend development.

## Backend Strategy: Supabase-First Approach

### Philosophy
Velocity prioritizes **user experience over technical flexibility**. For most mobile apps, backend requirements include authentication, database, real-time features, and file storage - all of which Supabase provides out-of-the-box. This eliminates technical decisions that overwhelm non-technical users while providing production-ready infrastructure from day 1.

### User Experience Flow
```
PRD Creation → Config Helper Analysis → Supabase Integration → Instant Backend → Development
```

**Key Benefits:**
- **Zero technical decisions** - AI handles all backend setup
- **30-second backend creation** vs 60+ seconds for containerized alternatives  
- **Production-ready from day 1** - Real auth, database, and deployment
- **Instant gratification** - Working backend APIs immediately available
- **Seamless dev-to-prod** - Same infrastructure, different environment

## Current State Analysis

### ✅ Existing Components (Ready for Integration)

**Project Design Infrastructure:**
- Robust chat interface with AI agents (`ProjectDesign.tsx:492-578`)
- PRD (Product Requirements Document) system with rich text editing
- AI conversation service with context awareness
- Project management with Supabase backend

**Editor Components:**
- Monaco Editor integration with syntax highlighting
- Editor container with tab management (`EditorContainer`)
- Editor state management (`useEditorStore`)
- File system stores and operations

**Preview System:**
- Snack SDK integration for live preview (`SnackPreviewPanel.tsx`)
- Real-time session management with hot reload
- Web/mobile preview tabs with QR code generation
- Snack editor integration for code synchronization

**AI Services:**
- Real-time AI code generation service (`aiService.ts`)
- Streaming code generation with quality analysis
- Context-aware code suggestions
- Config Helper agent for backend requirement analysis

### 🔄 Partially Implemented

**Build System:**
- Build button placeholder (currently disabled at `ProjectDesign.tsx:926-934`)
- Basic project structure management
- Dependency management system

**File Management:**
- Basic file operations
- Editor tab system
- Content synchronization

**Backend Integration:**
- Supabase client integration in place
- Manual Supabase connection flow needs implementation
- Basic backend project setup needs implementation

## Proposed Architecture

### 1. Page Structure & Layout

```
Editor/Preview Page Layout:
┌─────────────────────────────────────────────────────────────┐
│ Header: Project Name | Backend Status | Deploy | Settings   │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┬─────────────────┬─────────────────────┐ │
│ │   File Explorer │      Editor     │   Live Preview      │ │
│ │                 │                 │                     │ │
│ │ Frontend/       │ - Monaco Editor │ - Web/Mobile tabs   │ │
│ │ Backend/        │ - Multiple tabs │ - QR code          │ │
│ │ Database/       │ - Intellisense  │ - API testing      │ │
│ │ - AI generate   │ - Git diff      │ - Share/Download   │ │
│ │                 │                 │ - Error console    │ │
│ └─────────────────┴─────────────────┴─────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │              AI Assistant Panel (Collapsible)          │ │
│ │ - Full-stack code generation                           │ │
│ │ - Backend API suggestions                              │ │
│ │ - Error fixing and optimization                        │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2. Route Integration

**New Route Structure:**
- **Route**: `/project/:id/editor`
- **Component**: `ProjectEditor.tsx`
- **Trigger**: Build button in `ProjectDesign.tsx:932`

**Navigation Flow:**
```
HomePage → ProjectDesign → Editor/Preview → Deploy
```

**Route Protection:**
- Authenticated user required
- Project ownership validation
- PRD completion check (minimum viable PRD)
- Supabase project connection status

### 3. AI-Powered Code Generation Workflow

#### Phase 1: Initial Project Generation
```
PRD Analysis → Manual Supabase Connection → Basic Setup → Frontend Generation
```

**Simplified Integration Process:**
1. **PRD Analysis**: Extract app requirements for frontend structure
2. **Manual Supabase Connection**: User clicks "Connect Supabase" button in ProjectDesign
3. **OAuth Flow**: User authenticates and grants project access to their Supabase account
4. **Basic Project Setup**: Create new Supabase project with default configuration
5. **Frontend Generation**: Generate React Native components with optional Supabase integration
6. **API Layer**: Create basic service layer with Supabase client setup

#### Phase 2: Interactive Development
```
User Request → Context Analysis → Code Generation → Hot Reload Preview → Feedback Loop
```

**Features:**
- Natural language full-stack development requests
- Context-aware suggestions spanning frontend and backend
- Real-time code streaming with live preview updates
- Manual Supabase schema management through editor
- Error detection and AI-powered fixes across the stack

### 4. File System & Project Management

#### Generated Full-Stack Project Structure
```
/project-root
├── frontend/              # React Native application
│   ├── App.js            # Main entry point with Supabase setup
│   ├── package.json      # Dependencies including @supabase/supabase-js
│   ├── app.json         # Expo configuration
│   ├── components/
│   │   ├── screens/     # Screen components (from PRD)
│   │   │   ├── HomeScreen.jsx
│   │   │   ├── ProfileScreen.jsx
│   │   │   └── SettingsScreen.jsx
│   │   ├── ui/          # Reusable UI components
│   │   │   ├── Button.jsx
│   │   │   ├── Input.jsx
│   │   │   └── Card.jsx
│   │   └── auth/        # Authentication components
│   │       ├── LoginScreen.jsx
│   │       └── SignupScreen.jsx
│   ├── navigation/
│   │   ├── AppNavigator.jsx # Main navigation with auth flow
│   │   └── TabNavigator.jsx # Tab-based navigation
│   ├── services/
│   │   ├── supabase.js  # Supabase client configuration
│   │   ├── auth.js      # Authentication service
│   │   ├── database.js  # Database operations
│   │   └── realtime.js  # Real-time subscriptions
│   ├── hooks/
│   │   ├── useAuth.js   # Authentication hook
│   │   └── useSupabase.js # Supabase operations hook
│   └── constants/
│       ├── Colors.js
│       └── Layout.js
├── backend/               # Supabase configuration
│   ├── supabase/
│   │   ├── migrations/   # Database migrations
│   │   │   ├── 001_initial_schema.sql
│   │   │   └── 002_user_profiles.sql
│   │   ├── functions/    # Edge Functions
│   │   │   ├── auth-webhook/
│   │   │   ├── api/
│   │   │   └── notifications/
│   │   └── config.toml   # Supabase configuration
│   ├── schemas/
│   │   ├── database.sql  # Complete database schema
│   │   └── policies.sql  # Row Level Security policies
│   └── seed/
│       └── sample_data.sql # Development seed data
└── shared/               # Shared types and utilities
    ├── types/
    │   ├── database.ts   # Database type definitions
    │   └── api.ts       # API type definitions
    └── utils/
        └── validators.js # Shared validation logic
```

#### File Operations
- **AI-Generated Files**: Full-stack components based on PRD sections
- **Template System**: Pre-built frontend/backend component templates
- **Version Control**: Save points and change tracking
- **Dependency Management**: Automatic package installation for both frontend and backend
- **Supabase Sync**: Real-time synchronization of schema changes and Edge Functions
- **Migration Management**: Automatic database migration generation and deployment

### 5. Enhanced Preview System

#### Building on Existing SnackPreviewPanel with Backend Integration

**Frontend Preview:**
- Embedded Snack web player with Supabase configuration
- Real-time code updates for frontend changes
- Browser-based device simulation with live backend connection

**Backend Testing Panel:**
- **API Explorer**: Test Supabase Edge Functions and database operations
- **Real-time Data Viewer**: Monitor database changes and real-time subscriptions
- **Authentication Testing**: Test login/signup flows with live auth providers
- **Database Browser**: Query and inspect database tables and relationships

**Mobile Preview:**
- QR code generation for Expo Go with backend connectivity
- Device-specific testing with real authentication
- Appetize.io integration for full-stack app testing

**Advanced Features:**
- **Hot Reload**: Instant updates for both frontend and backend changes
- **Full-Stack Error Console**: Track errors across React Native, Supabase, and Edge Functions
- **Performance Monitoring**: Bundle size, API response times, database query performance
- **Debugging Tools**: Console output, network requests, Supabase logs integration

### 6. State Management Strategy

#### New Store Requirements

**ProjectEditorStore:**
```typescript
interface ProjectEditorState {
  projectFiles: Record<string, FileContent>
  buildStatus: 'idle' | 'generating' | 'building' | 'success' | 'error'
  previewSession: SnackSession | null
  aiGenerationQueue: GenerationTask[]
  currentContext: ProjectContext
  projectStructure: FileTree
  selectedFiles: string[]
  supabaseConnection: SupabaseProjectConnection
}
```

**SupabaseIntegrationStore:**
```typescript
interface SupabaseIntegrationState {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error'
  projectConfig: SupabaseProjectConfig | null
  databaseSchema: DatabaseSchema
  edgeFunctions: EdgeFunction[]
  authProviders: AuthProvider[]
  realTimeConnections: RealtimeSubscription[]
  migrationHistory: Migration[]
}
```

**BuildStore:**
```typescript
interface BuildState {
  buildLogs: BuildLog[]
  deploymentStatus: DeploymentStatus
  previewUrl: string | null
  dependencies: Record<string, string>
  buildArtifacts: BuildArtifact[]
  errorDiagnostics: ErrorDiagnostic[]
  supabaseBuildStatus: 'idle' | 'deploying-functions' | 'running-migrations' | 'complete'
}
```

**AIAssistantStore:**
```typescript
interface AIAssistantState {
  activeConversation: string | null
  codeGenerationHistory: GenerationHistory[]
  contextAnalysis: FullStackContextAnalysis
  suggestions: CodeSuggestion[]
  isGenerating: boolean
  configHelperStatus: ConfigHelperStatus
}
```

### 7. Implementation Phases

#### Phase 1: Supabase OAuth Integration (Week 1)
**Goals:**
- Implement Supabase OAuth integration flow
- Create automatic Supabase project setup
- Add simple Supabase connection button in ProjectDesign
- Enable basic backend project creation

**Deliverables:**
- Supabase OAuth connection flow
- Automatic project creation and basic schema setup
- Simple "Connect Supabase" button integration
- Basic backend project initialization

#### Phase 2: Full-Stack Editor Setup (Week 2)
**Goals:**
- Create `/project/:id/editor` route with full-stack support
- Implement enhanced panel system (Frontend | Backend | Database | Preview)
- PRD-to-full-stack project generation
- Basic Supabase integration in editor

**Deliverables:**
- `ProjectEditor.tsx` component with backend support
- Updated routing in `App.tsx`
- Four-panel responsive layout with backend file explorer
- Full-stack project structure generation

#### Phase 3: AI Full-Stack Code Generation (Week 3)
**Goals:**
- AI-powered database schema generation
- Edge Function generation from requirements
- Full-stack code generation (frontend + backend)
- Context-aware suggestions across the stack

**Deliverables:**
- Database schema AI generation
- Edge Function template and generation system
- Full-stack AI code generation service
- Enhanced context analysis for backend integration

#### Phase 4: Enhanced Preview & Backend Testing (Week 4)
**Goals:**
- Backend API testing integration
- Real-time database monitoring
- Hot reload for Edge Functions
- Full-stack error tracking and debugging

**Deliverables:**
- API testing panel integration
- Real-time database browser
- Hot reload for backend changes
- Comprehensive error tracking across frontend and backend

## Critical Implementation Decisions

### 1. PRD to Full-Stack Code Translation Strategy

**Enhanced Approach:**
- Parse PRD sections into discrete app features with backend requirements
- Map sections to React Native components/screens + Supabase backend components
- Generate full-stack component hierarchy including database schema
- Maintain bidirectional PRD ↔ Frontend ↔ Backend relationship

**Technical Implementation:**
- PRD section analysis with backend requirement extraction
- Supabase-specific template-based code generation
- Database schema generation from app requirements
- Edge Function generation for API endpoints
- Full-stack dependency resolution and integration
- Automatic authentication and authorization setup

### 2. Real-time Collaboration Architecture

**Multi-user Support:**
- Extend Supabase real-time for file changes
- Conflict resolution for simultaneous edits
- Shared preview sessions
- User presence indicators

**Technical Considerations:**
- Operational Transform (OT) for concurrent editing
- WebSocket-based real-time updates
- State synchronization across clients
- Offline support with conflict resolution

### 3. Supabase-First Build System Integration

**Supabase + Expo Integration:**
- Leverage Expo CLI for frontend development builds
- Supabase CLI for backend Edge Function deployment
- EAS Build for production mobile app deployments
- Supabase production environment promotion
- Automated full-stack testing pipeline

**Performance Optimization:**
- Lazy loading for heavy components
- Debounced file synchronization with Supabase
- Background processing for database migrations
- Caching strategies for both frontend builds and backend deployments
- Edge Function caching and optimization

### 4. AI Context Management

**Full-Stack Context Sources:**
- PRD content and structure with backend requirements
- Current file and cursor position (frontend and backend)
- Project file structure and dependencies (full-stack)
- Supabase project configuration and schema
- Database relationships and constraints
- Edge Function implementations and API contracts
- User interaction history across frontend and backend
- Full-stack code generation patterns

**Context Optimization:**
- Relevance scoring for context selection across frontend/backend
- Token limit optimization with full-stack context prioritization
- Context caching and reuse for both frontend and backend operations
- Progressive context building with backend-aware suggestions
- Supabase-specific context integration for schema and API awareness

## Integration Points with Existing System

### 1. Project Design Integration with Manual Supabase Connection
- Seamless transition from PRD creation to full-stack code generation
- Simple "Connect Supabase" button in ProjectDesign interface
- Manual Supabase project setup through OAuth flow
- Preserve conversation context and project metadata
- Maintain PRD ↔ Frontend ↔ Backend synchronization

### 2. Enhanced Snack SDK Integration
- Extend existing `SnackPreviewPanel` for Supabase-connected previews
- Leverage `useSnackSession` hook with backend connectivity
- Build on existing hot reload with backend change detection
- Integration of Supabase client configuration in preview environment

### 3. AI Service Integration for Full-Stack Development
- Utilize existing `aiService.generateCode()` streaming for frontend and backend
- Extend conversation service for full-stack development interactions
- Integrate with full-stack project context and file management
- Add Supabase-specific AI assistance and code generation

### 4. Database Schema Extensions for Supabase Integration
- Supabase project configuration and connection storage
- Database schema versioning and migration tracking
- Edge Function deployment history and configuration
- Authentication provider configuration and user management
- Project file storage and versioning (including backend files)
- Build configuration and deployment settings for full-stack apps
- Collaboration and sharing permissions for Supabase resources
- Usage analytics and optimization data for both frontend and backend

## Security and Performance Considerations

### Security
- Code execution sandboxing in preview environment
- Secure Supabase project isolation and access control
- Secure file upload and storage with Supabase Storage integration
- Access control for collaborative features with Row Level Security (RLS)
- API key and secret management for Supabase connections
- Edge Function security and environment variable management
- Database security with automatic RLS policy generation

### Performance
- Code editor virtualization for large files (frontend and backend)
- Preview session optimization and cleanup with Supabase connection pooling
- Build caching and incremental updates for both frontend and backend
- Network optimization for real-time features with Supabase Realtime
- Edge Function cold start optimization and caching
- Database query optimization and connection management
- Efficient schema migration and deployment strategies

## Success Metrics

### User Experience
- Time from PRD completion to working full-stack app preview
- Backend setup success rate and speed (target: <30 seconds)
- Full-stack code generation accuracy and relevance
- Preview loading and update speed with backend connectivity
- User engagement with AI assistance features for full-stack development
- Ease of Supabase integration and configuration

### Technical Performance
- Full-stack build success rate and speed
- Supabase project creation and schema setup reliability
- Preview session stability with backend connections
- Real-time collaboration latency across frontend and backend
- Resource utilization optimization for full-stack development
- Edge Function deployment success rate and speed
- Database migration reliability and performance

## Next Steps

1. **Validate Supabase-First Architecture**: Review full-stack approach with team and stakeholders
2. **Design Supabase Connection UI**: Create "Connect Supabase" button and OAuth flow in ProjectDesign
3. **Set Up Supabase Development Environment**: Configure Supabase CLI and test project creation pipeline
4. **Begin Phase 1 Implementation**: Start with simple Supabase OAuth integration button
5. **Iterative Full-Stack Development**: Regular feedback and architecture refinement with focus on user experience

## Architectural Decision Rationale

**Why Supabase-First with Manual Connection?**
- **User Experience Priority**: Simple button click eliminates complex technical decisions
- **Production Ready**: Real infrastructure from day 1, not development-only containers
- **Speed to Value**: Quick OAuth flow enables instant backend access
- **Ecosystem Integration**: Leverages existing Supabase infrastructure already in Velocity
- **Scaling Path**: Natural progression from development to production deployment
- **User Control**: Manual connection gives users explicit control over backend integration

**Alternative Approach Available**: Advanced users can still opt for containerized backends in future phases. The manual connection approach balances simplicity with user agency, allowing them to decide when and if to add backend functionality.

---

*This document serves as the foundation for the Editor/Preview page implementation with integrated Supabase backend development. It should be regularly updated as requirements evolve and implementation details are refined.*