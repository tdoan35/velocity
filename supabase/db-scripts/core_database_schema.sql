-- =====================================================
-- VELOCITY PLATFORM - CORE DATABASE SCHEMA
-- =====================================================
-- Comprehensive database schema for all core entities with
-- proper relationships, constraints, and optimized indexes
-- Includes RLS policies and vector search capabilities

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =====================================================
-- USER PROFILES TABLE
-- =====================================================

-- Core user profiles with metadata and preferences
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  display_name text,
  avatar_url text,
  bio text,
  website_url text,
  github_username text,
  subscription_tier text NOT NULL DEFAULT 'free' CHECK (
    subscription_tier IN ('free', 'pro', 'enterprise')
  ),
  subscription_expires_at timestamptz,
  subscription_features jsonb DEFAULT '{}'::jsonb,
  
  -- User preferences
  preferences jsonb DEFAULT '{
    "theme": "system",
    "language": "en",
    "notifications": {
      "email": true,
      "push": true,
      "project_updates": true,
      "build_notifications": true,
      "collaboration_requests": true
    },
    "editor": {
      "font_size": 14,
      "tab_size": 2,
      "word_wrap": true,
      "auto_save": true
    },
    "privacy": {
      "profile_visibility": "public",
      "project_visibility": "public"
    }
  }'::jsonb,
  
  -- Activity and engagement metrics
  projects_created integer DEFAULT 0,
  total_builds integer DEFAULT 0,
  last_active_at timestamptz DEFAULT NOW(),
  onboarding_completed boolean DEFAULT false,
  onboarding_step integer DEFAULT 0,
  
  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_username CHECK (username ~ '^[a-zA-Z0-9_-]{3,30}$'),
  CONSTRAINT valid_display_name CHECK (char_length(display_name) >= 1 AND char_length(display_name) <= 100),
  CONSTRAINT valid_bio CHECK (char_length(bio) <= 500),
  CONSTRAINT valid_github_username CHECK (github_username ~ '^[a-zA-Z0-9_-]{1,39}$' OR github_username IS NULL)
);

-- =====================================================
-- TEAMS TABLE
-- =====================================================

-- Teams for collaborative project management
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  description text,
  avatar_url text,
  
  -- Team settings
  visibility text NOT NULL DEFAULT 'private' CHECK (
    visibility IN ('public', 'private', 'invite_only')
  ),
  max_members integer DEFAULT 10,
  subscription_tier text NOT NULL DEFAULT 'free' CHECK (
    subscription_tier IN ('free', 'pro', 'enterprise')
  ),
  
  -- Team features and permissions
  features jsonb DEFAULT '{
    "private_projects": false,
    "advanced_builds": false,
    "custom_domains": false,
    "priority_support": false,
    "api_access": false
  }'::jsonb,
  
  permissions jsonb DEFAULT '{
    "project_creation": "members",
    "member_invites": "admins",
    "settings_management": "owners",
    "billing_management": "owners"
  }'::jsonb,
  
  -- Ownership and management
  owner_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  member_count integer DEFAULT 1,
  project_count integer DEFAULT 0,
  
  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_team_name CHECK (char_length(name) >= 2 AND char_length(name) <= 100),
  CONSTRAINT valid_team_slug CHECK (slug ~ '^[a-z0-9_-]{2,50}$'),
  CONSTRAINT valid_description CHECK (char_length(description) <= 500),
  CONSTRAINT valid_max_members CHECK (max_members > 0 AND max_members <= 1000)
);

-- Team membership table
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  
  role text NOT NULL DEFAULT 'member' CHECK (
    role IN ('owner', 'admin', 'member', 'viewer')
  ),
  
  -- Permissions and access
  permissions jsonb DEFAULT '{
    "can_create_projects": true,
    "can_manage_members": false,
    "can_manage_settings": false,
    "can_manage_billing": false,
    "can_delete_projects": false
  }'::jsonb,
  
  -- Invitation management
  invited_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  invitation_accepted_at timestamptz,
  last_activity_at timestamptz DEFAULT NOW(),
  
  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(team_id, user_id)
);

-- =====================================================
-- PROJECTS TABLE
-- =====================================================

-- Core projects with vector embeddings for search
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  
  -- Project organization
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  owner_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  
  -- Project configuration
  visibility text NOT NULL DEFAULT 'private' CHECK (
    visibility IN ('public', 'private', 'team_only')
  ),
  
  template_id uuid, -- Self-reference for project templates
  framework text NOT NULL DEFAULT 'react-native' CHECK (
    framework IN ('react-native', 'flutter', 'ionic', 'cordova', 'custom')
  ),
  
  -- Project structure and content
  project_config jsonb DEFAULT '{
    "target_platforms": ["ios", "android"],
    "build_configuration": {
      "development": {
        "bundle_id": "",
        "app_name": "",
        "version": "1.0.0"
      },
      "production": {
        "bundle_id": "",
        "app_name": "",
        "version": "1.0.0"
      }
    },
    "features": {
      "push_notifications": false,
      "analytics": false,
      "crash_reporting": false,
      "deep_linking": false
    }
  }'::jsonb,
  
  -- AI and search capabilities
  embedding vector(1536), -- OpenAI embedding dimensions
  ai_context jsonb DEFAULT '{
    "project_summary": "",
    "key_features": [],
    "technology_stack": [],
    "user_requirements": "",
    "development_status": "planning"
  }'::jsonb,
  
  -- Project metrics and status
  status text NOT NULL DEFAULT 'active' CHECK (
    status IN ('active', 'archived', 'deleted', 'template')
  ),
  
  build_count integer DEFAULT 0,
  collaborator_count integer DEFAULT 1,
  file_count integer DEFAULT 0,
  last_build_at timestamptz,
  last_activity_at timestamptz DEFAULT NOW(),
  
  -- Deployment and hosting
  deployment_config jsonb DEFAULT '{
    "auto_deploy": false,
    "production_url": "",
    "staging_url": "",
    "custom_domain": "",
    "ssl_enabled": true
  }'::jsonb,
  
  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_project_name CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
  CONSTRAINT valid_project_slug CHECK (slug ~ '^[a-z0-9_-]{1,50}$'),
  CONSTRAINT valid_description CHECK (char_length(description) <= 1000),
  CONSTRAINT unique_team_project_slug UNIQUE(team_id, slug),
  CONSTRAINT unique_user_project_slug UNIQUE(owner_id, slug) 
    DEFERRABLE INITIALLY DEFERRED
);

-- =====================================================
-- PROJECT FILES TABLE
-- =====================================================

-- Project files with version tracking and content management
CREATE TABLE IF NOT EXISTS public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- File identification
  file_path text NOT NULL, -- Full path within project (e.g., 'src/components/Button.js')
  file_name text NOT NULL, -- Just the filename (e.g., 'Button.js')
  file_type text NOT NULL, -- MIME type or file extension
  file_size bigint DEFAULT 0,
  
  -- File content and metadata
  content text, -- File content for code files
  content_hash text, -- SHA-256 hash for change detection
  encoding text DEFAULT 'utf-8',
  
  -- Version control
  version integer DEFAULT 1,
  parent_version_id uuid REFERENCES public.project_files(id) ON DELETE SET NULL,
  is_current_version boolean DEFAULT true,
  
  -- File organization
  directory_path text, -- Directory path (e.g., 'src/components/')
  is_directory boolean DEFAULT false,
  is_binary boolean DEFAULT false,
  
  -- AI and analysis
  embedding vector(1536), -- For file content search
  ai_analysis jsonb DEFAULT '{
    "file_purpose": "",
    "dependencies": [],
    "exports": [],
    "complexity_score": 0,
    "suggestions": []
  }'::jsonb,
  
  -- Access and permissions
  created_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  last_modified_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  
  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_file_path CHECK (char_length(file_path) >= 1 AND char_length(file_path) <= 500),
  CONSTRAINT valid_file_name CHECK (char_length(file_name) >= 1 AND char_length(file_name) <= 255),
  CONSTRAINT valid_file_size CHECK (file_size >= 0),
  CONSTRAINT valid_version CHECK (version > 0),
  UNIQUE(project_id, file_path, version)
);

-- =====================================================
-- AI INTERACTIONS TABLE
-- =====================================================

-- AI interactions with context and history
CREATE TABLE IF NOT EXISTS public.ai_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  
  -- Interaction details
  interaction_type text NOT NULL CHECK (
    interaction_type IN (
      'code_generation', 'code_review', 'debugging', 'explanation',
      'refactoring', 'testing', 'documentation', 'feature_request',
      'optimization', 'security_analysis'
    )
  ),
  
  -- Content and context
  user_prompt text NOT NULL,
  ai_response text NOT NULL,
  context_data jsonb DEFAULT '{}'::jsonb,
  
  -- File and location context
  file_references uuid[] DEFAULT ARRAY[]::uuid[], -- References to project_files
  code_context text, -- Relevant code snippets
  line_numbers integer[], -- Specific line references
  
  -- AI model and metadata
  ai_model text NOT NULL DEFAULT 'claude-3.5-sonnet',
  model_version text,
  token_usage jsonb DEFAULT '{
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
  }'::jsonb,
  
  -- Interaction quality and feedback
  user_rating integer CHECK (user_rating >= 1 AND user_rating <= 5),
  user_feedback text,
  is_helpful boolean,
  
  -- Processing and status
  processing_time_ms integer,
  status text NOT NULL DEFAULT 'completed' CHECK (
    status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')
  ),
  error_message text,
  
  -- Search and categorization
  embedding vector(1536), -- For semantic search of interactions
  tags text[] DEFAULT ARRAY[]::text[],
  
  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_user_prompt CHECK (char_length(user_prompt) >= 1 AND char_length(user_prompt) <= 10000),
  CONSTRAINT valid_ai_response CHECK (char_length(ai_response) >= 1 AND char_length(ai_response) <= 50000),
  CONSTRAINT valid_processing_time CHECK (processing_time_ms >= 0)
);

-- =====================================================
-- PROJECT COLLABORATORS TABLE
-- =====================================================

-- Project collaborators with real-time permissions
CREATE TABLE IF NOT EXISTS public.project_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  
  -- Role and permissions
  role text NOT NULL DEFAULT 'viewer' CHECK (
    role IN ('owner', 'editor', 'viewer', 'commenter')
  ),
  
  permissions jsonb DEFAULT '{
    "can_edit_files": false,
    "can_create_files": false,
    "can_delete_files": false,
    "can_manage_builds": false,
    "can_manage_settings": false,
    "can_invite_collaborators": false,
    "can_view_analytics": false,
    "can_access_ai": false
  }'::jsonb,
  
  -- Access restrictions
  file_access_pattern text DEFAULT '*', -- Glob pattern for file access
  branch_restrictions text[] DEFAULT ARRAY[]::text[],
  
  -- Invitation and access management
  invited_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  invitation_token text,
  invitation_expires_at timestamptz,
  invitation_accepted_at timestamptz,
  
  -- Activity tracking
  last_active_at timestamptz DEFAULT NOW(),
  last_file_accessed text,
  total_contributions integer DEFAULT 0,
  
  -- Real-time collaboration
  is_online boolean DEFAULT false,
  current_file_path text,
  cursor_position jsonb DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(project_id, user_id),
  CONSTRAINT valid_invitation_token CHECK (
    char_length(invitation_token) >= 32 OR invitation_token IS NULL
  )
);

-- =====================================================
-- BUILDS TABLE
-- =====================================================

-- Build artifacts and deployment status
CREATE TABLE IF NOT EXISTS public.builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  triggered_by uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  
  -- Build identification
  build_number integer NOT NULL,
  build_type text NOT NULL DEFAULT 'development' CHECK (
    build_type IN ('development', 'staging', 'production', 'preview')
  ),
  
  -- Build configuration
  target_platforms text[] NOT NULL DEFAULT ARRAY['android', 'ios']::text[],
  build_config jsonb NOT NULL DEFAULT '{
    "environment": "development",
    "optimization": false,
    "minification": false,
    "source_maps": true,
    "debug_symbols": true
  }'::jsonb,
  
  -- Build process
  status text NOT NULL DEFAULT 'queued' CHECK (
    status IN (
      'queued', 'building', 'testing', 'deploying', 
      'completed', 'failed', 'cancelled', 'expired'
    )
  ),
  
  -- Timing information
  queued_at timestamptz DEFAULT NOW(),
  started_at timestamptz,
  completed_at timestamptz,
  build_duration_ms integer,
  
  -- Build results and artifacts
  artifacts jsonb DEFAULT '{
    "android": {
      "apk_url": "",
      "aab_url": "",
      "size_mb": 0,
      "version_code": 1
    },
    "ios": {
      "ipa_url": "",
      "app_url": "",
      "size_mb": 0,
      "build_number": 1
    }
  }'::jsonb,
  
  -- Build logs and debugging
  build_logs text,
  error_logs text,
  warning_count integer DEFAULT 0,
  error_count integer DEFAULT 0,
  
  -- Testing and quality
  test_results jsonb DEFAULT '{
    "unit_tests": {
      "total": 0,
      "passed": 0,
      "failed": 0,
      "skipped": 0
    },
    "integration_tests": {
      "total": 0,
      "passed": 0,
      "failed": 0,
      "skipped": 0
    },
    "code_coverage": 0
  }'::jsonb,
  
  -- Deployment information
  deployment_url text,
  deployment_status text CHECK (
    deployment_status IN ('pending', 'deploying', 'deployed', 'failed', 'rolled_back')
  ),
  expires_at timestamptz,
  
  -- Source control
  git_commit_sha text,
  git_branch text DEFAULT 'main',
  git_commit_message text,
  
  -- Build environment
  build_agent text,
  build_environment jsonb DEFAULT '{
    "node_version": "",
    "react_native_version": "",
    "build_tools_version": "",
    "os": ""
  }'::jsonb,
  
  -- Metadata
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_build_number CHECK (build_number > 0),
  CONSTRAINT valid_build_duration CHECK (build_duration_ms >= 0),
  CONSTRAINT valid_warning_count CHECK (warning_count >= 0),
  CONSTRAINT valid_error_count CHECK (error_count >= 0),
  UNIQUE(project_id, build_number)
);

-- =====================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- =====================================================

-- User profiles indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON public.user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription ON public.user_profiles(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_active ON public.user_profiles(last_active_at DESC);

-- Teams indexes
CREATE INDEX IF NOT EXISTS idx_teams_slug ON public.teams(slug);
CREATE INDEX IF NOT EXISTS idx_teams_owner ON public.teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_visibility ON public.teams(visibility);

-- Team members indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON public.team_members(team_id, role);

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_owner ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_team ON public.projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_slug ON public.projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_visibility ON public.projects(visibility);
CREATE INDEX IF NOT EXISTS idx_projects_framework ON public.projects(framework);
CREATE INDEX IF NOT EXISTS idx_projects_last_activity ON public.projects(last_activity_at DESC);

-- Vector similarity search index for projects
CREATE INDEX IF NOT EXISTS idx_projects_embedding ON public.projects 
USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Project files indexes
CREATE INDEX IF NOT EXISTS idx_project_files_project ON public.project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_path ON public.project_files(project_id, file_path);
CREATE INDEX IF NOT EXISTS idx_project_files_type ON public.project_files(file_type);
CREATE INDEX IF NOT EXISTS idx_project_files_current ON public.project_files(project_id, is_current_version);
CREATE INDEX IF NOT EXISTS idx_project_files_directory ON public.project_files(project_id, directory_path);
CREATE INDEX IF NOT EXISTS idx_project_files_creator ON public.project_files(created_by);

-- Vector similarity search index for project files
CREATE INDEX IF NOT EXISTS idx_project_files_embedding ON public.project_files 
USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- AI interactions indexes
CREATE INDEX IF NOT EXISTS idx_ai_interactions_project ON public.ai_interactions(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_user ON public.ai_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_type ON public.ai_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_created ON public.ai_interactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_status ON public.ai_interactions(status);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_rating ON public.ai_interactions(user_rating DESC);

-- Vector similarity search index for AI interactions
CREATE INDEX IF NOT EXISTS idx_ai_interactions_embedding ON public.ai_interactions 
USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Project collaborators indexes
CREATE INDEX IF NOT EXISTS idx_project_collaborators_project ON public.project_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_user ON public.project_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_role ON public.project_collaborators(project_id, role);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_active ON public.project_collaborators(last_active_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_online ON public.project_collaborators(is_online);

-- Builds indexes
CREATE INDEX IF NOT EXISTS idx_builds_project ON public.builds(project_id);
CREATE INDEX IF NOT EXISTS idx_builds_user ON public.builds(triggered_by);
CREATE INDEX IF NOT EXISTS idx_builds_status ON public.builds(status);
CREATE INDEX IF NOT EXISTS idx_builds_type ON public.builds(build_type);
CREATE INDEX IF NOT EXISTS idx_builds_created ON public.builds(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_builds_completed ON public.builds(completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_builds_number ON public.builds(project_id, build_number DESC);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.builds ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- ROW LEVEL SECURITY POLICIES
-- =====================================================

-- User profiles policies
CREATE POLICY "Users can view their own profile" ON public.user_profiles
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.user_profiles
FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Public profiles are viewable by all authenticated users" ON public.user_profiles
FOR SELECT USING (
  auth.role() = 'authenticated' 
  AND (preferences->>'privacy'->>'profile_visibility' = 'public' OR preferences->>'privacy'->>'profile_visibility' IS NULL)
);

-- Teams policies
CREATE POLICY "Team members can view their teams" ON public.teams
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = teams.id AND user_id = auth.uid()
  )
);

CREATE POLICY "Team owners can manage their teams" ON public.teams
FOR ALL USING (auth.uid() = owner_id);

-- Team members policies
CREATE POLICY "Team members can view team membership" ON public.team_members
FOR SELECT USING (
  user_id = auth.uid() OR 
  EXISTS (
    SELECT 1 FROM public.team_members tm 
    WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid()
  )
);

-- Projects policies
CREATE POLICY "Project owners can manage their projects" ON public.projects
FOR ALL USING (auth.uid() = owner_id);

CREATE POLICY "Project collaborators can view projects" ON public.projects
FOR SELECT USING (
  auth.uid() = owner_id OR
  EXISTS (
    SELECT 1 FROM public.project_collaborators 
    WHERE project_id = projects.id AND user_id = auth.uid()
  )
);

CREATE POLICY "Public projects are viewable by all" ON public.projects
FOR SELECT USING (visibility = 'public');

-- Project files policies
CREATE POLICY "Project collaborators can access files" ON public.project_files
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    LEFT JOIN public.project_collaborators pc ON p.id = pc.project_id
    WHERE p.id = project_files.project_id 
    AND (p.owner_id = auth.uid() OR pc.user_id = auth.uid())
  )
);

CREATE POLICY "Project editors can modify files" ON public.project_files
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    LEFT JOIN public.project_collaborators pc ON p.id = pc.project_id
    WHERE p.id = project_files.project_id 
    AND (
      p.owner_id = auth.uid() OR 
      (pc.user_id = auth.uid() AND pc.role IN ('owner', 'editor'))
    )
  )
);

-- AI interactions policies
CREATE POLICY "Users can view their own AI interactions" ON public.ai_interactions
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Project collaborators can view project AI interactions" ON public.ai_interactions
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    LEFT JOIN public.project_collaborators pc ON p.id = pc.project_id
    WHERE p.id = ai_interactions.project_id 
    AND (p.owner_id = auth.uid() OR pc.user_id = auth.uid())
  )
);

CREATE POLICY "Users can create AI interactions for accessible projects" ON public.ai_interactions
FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (
    SELECT 1 FROM public.projects p
    LEFT JOIN public.project_collaborators pc ON p.id = pc.project_id
    WHERE p.id = project_id 
    AND (p.owner_id = auth.uid() OR pc.user_id = auth.uid())
  )
);

-- Project collaborators policies
CREATE POLICY "Project collaborators can view collaboration data" ON public.project_collaborators
FOR SELECT USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_collaborators.project_id AND owner_id = auth.uid()
  )
);

CREATE POLICY "Project owners can manage collaborators" ON public.project_collaborators
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_collaborators.project_id AND owner_id = auth.uid()
  )
);

-- Builds policies
CREATE POLICY "Project collaborators can view builds" ON public.builds
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    LEFT JOIN public.project_collaborators pc ON p.id = pc.project_id
    WHERE p.id = builds.project_id 
    AND (p.owner_id = auth.uid() OR pc.user_id = auth.uid())
  )
);

CREATE POLICY "Project editors can create builds" ON public.builds
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.projects p
    LEFT JOIN public.project_collaborators pc ON p.id = pc.project_id
    WHERE p.id = project_id 
    AND (
      p.owner_id = auth.uid() OR 
      (pc.user_id = auth.uid() AND pc.role IN ('owner', 'editor'))
    )
  )
);

-- =====================================================
-- UTILITY FUNCTIONS
-- =====================================================

-- Function to generate unique project slug
CREATE OR REPLACE FUNCTION public.generate_project_slug(project_name text, owner_id uuid, team_id uuid DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  base_slug text;
  final_slug text;
  counter integer := 0;
BEGIN
  -- Convert name to URL-friendly slug
  base_slug := lower(regexp_replace(project_name, '[^a-zA-Z0-9]+', '-', 'g'));
  base_slug := trim(base_slug, '-');
  
  -- Ensure minimum length
  IF length(base_slug) < 3 THEN
    base_slug := base_slug || '-project';
  END IF;
  
  final_slug := base_slug;
  
  -- Check for uniqueness
  WHILE EXISTS (
    SELECT 1 FROM public.projects 
    WHERE slug = final_slug 
    AND (
      (team_id IS NULL AND projects.owner_id = generate_project_slug.owner_id) OR
      (team_id IS NOT NULL AND projects.team_id = generate_project_slug.team_id)
    )
  ) LOOP
    counter := counter + 1;
    final_slug := base_slug || '-' || counter::text;
  END LOOP;
  
  RETURN final_slug;
END;
$$;

-- Function to calculate project file count
CREATE OR REPLACE FUNCTION public.update_project_file_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.projects 
    SET file_count = file_count + 1,
        updated_at = NOW()
    WHERE id = NEW.project_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.projects 
    SET file_count = GREATEST(file_count - 1, 0),
        updated_at = NOW()
    WHERE id = OLD.project_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Function to update project activity timestamp
CREATE OR REPLACE FUNCTION public.update_project_activity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.projects 
  SET last_activity_at = NOW(),
      updated_at = NOW()
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger to update file count on project_files changes
CREATE TRIGGER trigger_update_project_file_count
  AFTER INSERT OR DELETE ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION public.update_project_file_count();

-- Trigger to update project activity on file changes
CREATE TRIGGER trigger_update_project_activity_files
  AFTER INSERT OR UPDATE OR DELETE ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION public.update_project_activity();

-- Trigger to update project activity on AI interactions
CREATE TRIGGER trigger_update_project_activity_ai
  AFTER INSERT ON public.ai_interactions
  FOR EACH ROW EXECUTE FUNCTION public.update_project_activity();

-- Trigger to update project activity on builds
CREATE TRIGGER trigger_update_project_activity_builds
  AFTER INSERT ON public.builds
  FOR EACH ROW EXECUTE FUNCTION public.update_project_activity();

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply updated_at trigger to all tables
CREATE TRIGGER trigger_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_team_members_updated_at
  BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_project_files_updated_at
  BEFORE UPDATE ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_ai_interactions_updated_at
  BEFORE UPDATE ON public.ai_interactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_project_collaborators_updated_at
  BEFORE UPDATE ON public.project_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trigger_builds_updated_at
  BEFORE UPDATE ON public.builds
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- GRANTS AND PERMISSIONS
-- =====================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

-- Grant table permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;

-- Grant sequence permissions
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant function permissions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.user_profiles IS 'User profiles with preferences and subscription information';
COMMENT ON TABLE public.teams IS 'Teams for collaborative project management';
COMMENT ON TABLE public.team_members IS 'Team membership with roles and permissions';
COMMENT ON TABLE public.projects IS 'Core projects with AI capabilities and vector search';
COMMENT ON TABLE public.project_files IS 'Project files with version control and content management';
COMMENT ON TABLE public.ai_interactions IS 'AI interactions with context and conversation history';
COMMENT ON TABLE public.project_collaborators IS 'Project collaboration with real-time permissions';
COMMENT ON TABLE public.builds IS 'Build artifacts and deployment tracking';

COMMENT ON FUNCTION public.generate_project_slug IS 'Generate unique URL-friendly slug for projects';
COMMENT ON FUNCTION public.update_project_file_count IS 'Maintain accurate file count for projects';
COMMENT ON FUNCTION public.update_project_activity IS 'Update project last activity timestamp';
COMMENT ON FUNCTION public.update_updated_at_column IS 'Auto-update updated_at timestamp on row changes';