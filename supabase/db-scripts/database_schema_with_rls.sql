-- Velocity Database Schema with Row Level Security (RLS) Policies
-- Apply this SQL script through the Supabase Dashboard SQL Editor

-- =====================================================
-- CORE DATABASE TABLES
-- =====================================================

-- 1. User Profiles Table
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  full_name text,
  avatar_url text,
  bio text,
  preferences jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  subscription_tier text DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- 2. Teams Table
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settings jsonb DEFAULT '{}'::jsonb,
  subscription_tier text DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  UNIQUE(name, owner_id)
);

-- 3. Team Members Table (for role-based permissions)
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'editor', 'viewer', 'member')),
  permissions jsonb DEFAULT '{}'::jsonb,
  joined_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  UNIQUE(team_id, user_id)
);

-- 4. Projects Table (with vector embeddings for search)
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  template_type text DEFAULT 'blank',
  app_config jsonb DEFAULT '{}'::jsonb,
  build_config jsonb DEFAULT '{}'::jsonb,
  embedding vector(1536), -- OpenAI embeddings dimension
  is_public boolean DEFAULT false,
  is_template boolean DEFAULT false,
  status text DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- 5. Project Files Table (with version tracking)
CREATE TABLE IF NOT EXISTS public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_path text NOT NULL,
  content text,
  file_type text,
  size_bytes integer,
  version integer DEFAULT 1,
  parent_version_id uuid REFERENCES public.project_files(id),
  checksum text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW(),
  
  UNIQUE(project_id, file_path, version)
);

-- 6. AI Interactions Table (with context and history)
CREATE TABLE IF NOT EXISTS public.ai_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  session_id uuid,
  prompt text NOT NULL,
  response text,
  context jsonb DEFAULT '{}'::jsonb,
  model_used text,
  tokens_used integer,
  cost_usd decimal(10,6),
  feedback_rating integer CHECK (feedback_rating BETWEEN 1 AND 5),
  created_at timestamptz DEFAULT NOW()
);

-- 7. Project Collaborators Table (with real-time permissions)
CREATE TABLE IF NOT EXISTS public.project_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  permissions jsonb DEFAULT '{}'::jsonb,
  invited_by uuid REFERENCES auth.users(id),
  invited_at timestamptz DEFAULT NOW(),
  accepted_at timestamptz,
  last_accessed_at timestamptz,
  
  UNIQUE(project_id, user_id)
);

-- 8. Builds Table (with artifacts and deployment status)
CREATE TABLE IF NOT EXISTS public.builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  initiated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  build_number integer NOT NULL,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  status text DEFAULT 'queued' CHECK (status IN ('queued', 'building', 'success', 'failed', 'cancelled')),
  build_config jsonb DEFAULT '{}'::jsonb,
  logs text,
  artifacts jsonb DEFAULT '{}'::jsonb,
  error_details text,
  build_time_seconds integer,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT NOW(),
  
  UNIQUE(project_id, build_number)
);

-- =====================================================
-- INDEXES FOR QUERY OPTIMIZATION
-- =====================================================

-- User profiles indexes
CREATE INDEX IF NOT EXISTS idx_user_profiles_username ON public.user_profiles(username);
CREATE INDEX IF NOT EXISTS idx_user_profiles_subscription ON public.user_profiles(subscription_tier);

-- Teams indexes
CREATE INDEX IF NOT EXISTS idx_teams_owner ON public.teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_name ON public.teams(name);

-- Team members indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON public.team_members(role);

-- Projects indexes
CREATE INDEX IF NOT EXISTS idx_projects_owner ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_team ON public.projects(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_public ON public.projects(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_projects_template ON public.projects(is_template) WHERE is_template = true;
CREATE INDEX IF NOT EXISTS idx_projects_status ON public.projects(status);

-- Vector similarity search index (HNSW for better performance)
CREATE INDEX IF NOT EXISTS idx_projects_embedding ON public.projects 
USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Project files indexes
CREATE INDEX IF NOT EXISTS idx_project_files_project ON public.project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_path ON public.project_files(project_id, file_path);
CREATE INDEX IF NOT EXISTS idx_project_files_version ON public.project_files(project_id, file_path, version);

-- AI interactions indexes
CREATE INDEX IF NOT EXISTS idx_ai_interactions_user ON public.ai_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_project ON public.ai_interactions(project_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_session ON public.ai_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_interactions_created ON public.ai_interactions(created_at);

-- Project collaborators indexes
CREATE INDEX IF NOT EXISTS idx_project_collaborators_project ON public.project_collaborators(project_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_user ON public.project_collaborators(user_id);
CREATE INDEX IF NOT EXISTS idx_project_collaborators_role ON public.project_collaborators(role);

-- Builds indexes
CREATE INDEX IF NOT EXISTS idx_builds_project ON public.builds(project_id);
CREATE INDEX IF NOT EXISTS idx_builds_user ON public.builds(initiated_by);
CREATE INDEX IF NOT EXISTS idx_builds_status ON public.builds(status);
CREATE INDEX IF NOT EXISTS idx_builds_platform ON public.builds(platform);
CREATE INDEX IF NOT EXISTS idx_builds_created ON public.builds(created_at);

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
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
-- USER PROFILES RLS POLICIES
-- =====================================================

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON public.user_profiles
FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile" ON public.user_profiles
FOR UPDATE USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" ON public.user_profiles
FOR INSERT WITH CHECK (auth.uid() = id);

-- Public profiles are viewable by authenticated users
CREATE POLICY "Public profiles viewable" ON public.user_profiles
FOR SELECT USING (
  auth.role() = 'authenticated' AND 
  (metadata->>'is_public')::boolean = true
);

-- =====================================================
-- TEAMS RLS POLICIES
-- =====================================================

-- Team owners can view/manage their teams
CREATE POLICY "Team owners full access" ON public.teams
FOR ALL USING (auth.uid() = owner_id);

-- Team members can view teams they belong to
CREATE POLICY "Team members can view teams" ON public.teams
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = teams.id AND user_id = auth.uid()
  )
);

-- =====================================================
-- TEAM MEMBERS RLS POLICIES
-- =====================================================

-- Team owners can manage team members
CREATE POLICY "Team owners manage members" ON public.team_members
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.teams 
    WHERE id = team_members.team_id AND owner_id = auth.uid()
  )
);

-- Team admins can manage team members
CREATE POLICY "Team admins manage members" ON public.team_members
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_members.team_id 
    AND tm.user_id = auth.uid() 
    AND tm.role IN ('owner', 'admin')
  )
);

-- Team members can view other team members
CREATE POLICY "Team members view members" ON public.team_members
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.team_id = team_members.team_id AND tm.user_id = auth.uid()
  )
);

-- Users can view their own team memberships
CREATE POLICY "Users view own memberships" ON public.team_members
FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- PROJECTS RLS POLICIES
-- =====================================================

-- Project owners have full access
CREATE POLICY "Project owners full access" ON public.projects
FOR ALL USING (auth.uid() = owner_id);

-- Team members can access team projects
CREATE POLICY "Team members access team projects" ON public.projects
FOR SELECT USING (
  team_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = projects.team_id AND user_id = auth.uid()
  )
);

-- Project collaborators can access projects
CREATE POLICY "Collaborators access projects" ON public.projects
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.project_collaborators 
    WHERE project_id = projects.id AND user_id = auth.uid()
  )
);

-- Public projects are viewable by authenticated users
CREATE POLICY "Public projects viewable" ON public.projects
FOR SELECT USING (auth.role() = 'authenticated' AND is_public = true);

-- Project editors can update projects
CREATE POLICY "Project editors can update" ON public.projects
FOR UPDATE USING (
  auth.uid() = owner_id OR
  EXISTS (
    SELECT 1 FROM public.project_collaborators 
    WHERE project_id = projects.id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'editor')
  )
);

-- =====================================================
-- PROJECT FILES RLS POLICIES
-- =====================================================

-- Project owners can manage all files
CREATE POLICY "Project owners manage files" ON public.project_files
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_files.project_id AND owner_id = auth.uid()
  )
);

-- Project editors can manage files
CREATE POLICY "Project editors manage files" ON public.project_files
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.project_collaborators 
    WHERE project_id = project_files.project_id 
    AND user_id = auth.uid() 
    AND role IN ('owner', 'editor')
  )
);

-- Project viewers can read files
CREATE POLICY "Project viewers read files" ON public.project_files
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.project_collaborators 
    WHERE project_id = project_files.project_id AND user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_files.project_id AND is_public = true
  )
);

-- =====================================================
-- AI INTERACTIONS RLS POLICIES
-- =====================================================

-- Users can manage their own AI interactions
CREATE POLICY "Users manage own AI interactions" ON public.ai_interactions
FOR ALL USING (auth.uid() = user_id);

-- Project collaborators can view project AI interactions
CREATE POLICY "Collaborators view project AI interactions" ON public.ai_interactions
FOR SELECT USING (
  project_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM public.project_collaborators 
    WHERE project_id = ai_interactions.project_id AND user_id = auth.uid()
  )
);

-- =====================================================
-- PROJECT COLLABORATORS RLS POLICIES
-- =====================================================

-- Project owners can manage collaborators
CREATE POLICY "Project owners manage collaborators" ON public.project_collaborators
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_collaborators.project_id AND owner_id = auth.uid()
  )
);

-- Users can view collaborators of projects they have access to
CREATE POLICY "Users view project collaborators" ON public.project_collaborators
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.project_collaborators pc
    WHERE pc.project_id = project_collaborators.project_id AND pc.user_id = auth.uid()
  ) OR
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_collaborators.project_id AND owner_id = auth.uid()
  )
);

-- Users can view their own collaborations
CREATE POLICY "Users view own collaborations" ON public.project_collaborators
FOR SELECT USING (auth.uid() = user_id);

-- =====================================================
-- BUILDS RLS POLICIES
-- =====================================================

-- Project owners can manage builds
CREATE POLICY "Project owners manage builds" ON public.builds
FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = builds.project_id AND owner_id = auth.uid()
  )
);

-- Project collaborators can view builds
CREATE POLICY "Collaborators view builds" ON public.builds
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.project_collaborators 
    WHERE project_id = builds.project_id AND user_id = auth.uid()
  )
);

-- Users can view builds they initiated
CREATE POLICY "Users view own builds" ON public.builds
FOR SELECT USING (auth.uid() = initiated_by);

-- =====================================================
-- ADMIN BYPASS POLICIES (for service role)
-- =====================================================

-- Service role can access all data (for admin operations)
CREATE POLICY "Service role full access user_profiles" ON public.user_profiles
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access teams" ON public.teams
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access team_members" ON public.team_members
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access projects" ON public.projects
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access project_files" ON public.project_files
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access ai_interactions" ON public.ai_interactions
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access project_collaborators" ON public.project_collaborators
FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access builds" ON public.builds
FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- FUNCTIONS AND TRIGGERS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Create triggers for updated_at timestamp management
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.project_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Function to automatically create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

-- Create trigger for automatic user profile creation
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- SECURITY VALIDATION FUNCTIONS
-- =====================================================

-- Function to check if user is project owner
CREATE OR REPLACE FUNCTION public.is_project_owner(project_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects 
    WHERE id = project_uuid AND owner_id = auth.uid()
  );
$$;

-- Function to check if user is team member
CREATE OR REPLACE FUNCTION public.is_team_member(team_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members 
    WHERE team_id = team_uuid AND user_id = auth.uid()
  );
$$;

-- Function to check project access level
CREATE OR REPLACE FUNCTION public.get_project_access_level(project_uuid uuid)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    CASE 
      WHEN EXISTS (SELECT 1 FROM public.projects WHERE id = project_uuid AND owner_id = auth.uid()) THEN 'owner'
      WHEN EXISTS (SELECT 1 FROM public.project_collaborators WHERE project_id = project_uuid AND user_id = auth.uid() AND role = 'editor') THEN 'editor'
      WHEN EXISTS (SELECT 1 FROM public.project_collaborators WHERE project_id = project_uuid AND user_id = auth.uid() AND role = 'viewer') THEN 'viewer'
      WHEN EXISTS (SELECT 1 FROM public.projects WHERE id = project_uuid AND is_public = true) THEN 'public'
      ELSE 'none'
    END;
$$;

-- =====================================================
-- GRANTS AND PERMISSIONS
-- =====================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Grant access to tables for authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Grant access to sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE public.user_profiles IS 'User profile information and preferences';
COMMENT ON TABLE public.teams IS 'Team/organization entities for collaborative work';
COMMENT ON TABLE public.team_members IS 'Team membership with role-based permissions';
COMMENT ON TABLE public.projects IS 'Mobile app projects with vector search capabilities';
COMMENT ON TABLE public.project_files IS 'Project files with version control';
COMMENT ON TABLE public.ai_interactions IS 'AI conversation history and context';
COMMENT ON TABLE public.project_collaborators IS 'Project-level collaboration permissions';
COMMENT ON TABLE public.builds IS 'Build artifacts and deployment tracking';

COMMENT ON FUNCTION public.is_project_owner IS 'Check if current user owns the specified project';
COMMENT ON FUNCTION public.is_team_member IS 'Check if current user is member of specified team';
COMMENT ON FUNCTION public.get_project_access_level IS 'Get current user access level for project';
COMMENT ON FUNCTION public.handle_updated_at IS 'Automatically update updated_at timestamp';
COMMENT ON FUNCTION public.handle_new_user IS 'Create user profile when new user signs up';