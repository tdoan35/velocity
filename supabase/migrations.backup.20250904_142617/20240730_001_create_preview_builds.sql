-- Create preview_builds table for tracking build processes
CREATE TABLE IF NOT EXISTS public.preview_builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('queued', 'building', 'completed', 'failed', 'cancelled')),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  sdk_version TEXT NOT NULL DEFAULT '50.0.0',
  bundle_url TEXT,
  source_map_url TEXT,
  error TEXT,
  logs JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  build_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT valid_status_timestamps CHECK (
    (status = 'queued' AND started_at IS NULL AND completed_at IS NULL) OR
    (status = 'building' AND started_at IS NOT NULL AND completed_at IS NULL) OR
    (status IN ('completed', 'failed', 'cancelled') AND completed_at IS NOT NULL)
  )
);

-- Create indexes for performance
CREATE INDEX idx_preview_builds_project_id ON public.preview_builds(project_id);
CREATE INDEX idx_preview_builds_user_id ON public.preview_builds(user_id);
CREATE INDEX idx_preview_builds_status ON public.preview_builds(status);
CREATE INDEX idx_preview_builds_created_at ON public.preview_builds(created_at DESC);

-- Create build_cache table for caching frequently used dependencies
CREATE TABLE IF NOT EXISTS public.build_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL, -- Hash of dependencies + SDK version
  dependencies JSONB NOT NULL,
  sdk_version TEXT NOT NULL,
  platform TEXT NOT NULL,
  bundle_url TEXT NOT NULL,
  bundle_size INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  hit_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
);

-- Create index for cache lookups
CREATE INDEX idx_build_cache_key ON public.build_cache(cache_key);
CREATE INDEX idx_build_cache_expires ON public.build_cache(expires_at);

-- Create asset_bundles table for managing bundled assets
CREATE TABLE IF NOT EXISTS public.asset_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  build_id UUID NOT NULL REFERENCES public.preview_builds(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('image', 'font', 'video', 'audio', 'other')),
  original_path TEXT NOT NULL,
  bundle_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for asset lookups
CREATE INDEX idx_asset_bundles_build_id ON public.asset_bundles(build_id);

-- Create storage bucket for preview bundles
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
  'preview-bundles',
  'preview-bundles', 
  true,
  false,
  52428800, -- 50MB limit
  ARRAY['application/javascript', 'application/json', 'text/javascript']
) ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for build assets
INSERT INTO storage.buckets (id, name, public, avif_autodetection, file_size_limit, allowed_mime_types)
VALUES (
  'build-assets',
  'build-assets',
  true,
  true,
  10485760, -- 10MB limit per asset
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'font/ttf', 'font/otf', 'font/woff', 'font/woff2']
) ON CONFLICT (id) DO NOTHING;

-- RLS Policies for preview_builds
ALTER TABLE public.preview_builds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own builds" ON public.preview_builds
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create builds for their projects" ON public.preview_builds
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own builds" ON public.preview_builds
  FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies for build_cache (read-only for users)
ALTER TABLE public.build_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read build cache" ON public.build_cache
  FOR SELECT USING (true);

-- RLS Policies for asset_bundles
ALTER TABLE public.asset_bundles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view assets from their builds" ON public.asset_bundles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.preview_builds
      WHERE id = build_id AND user_id = auth.uid()
    )
  );

-- Function to clean up old builds
CREATE OR REPLACE FUNCTION cleanup_old_builds() RETURNS void AS $$
BEGIN
  -- Delete builds older than 7 days
  DELETE FROM public.preview_builds
  WHERE created_at < NOW() - INTERVAL '7 days'
  AND status IN ('completed', 'failed', 'cancelled');
  
  -- Delete expired cache entries
  DELETE FROM public.build_cache
  WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment cache hit count
CREATE OR REPLACE FUNCTION increment_cache_hit(p_cache_key TEXT) RETURNS void AS $$
BEGIN
  UPDATE public.build_cache
  SET hit_count = hit_count + 1,
      last_accessed_at = NOW()
  WHERE cache_key = p_cache_key;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to calculate build time on completion
CREATE OR REPLACE FUNCTION calculate_build_time() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
    NEW.build_time_ms = EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at)) * 1000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER calculate_build_time_trigger
  BEFORE UPDATE ON public.preview_builds
  FOR EACH ROW
  WHEN (OLD.completed_at IS NULL AND NEW.completed_at IS NOT NULL)
  EXECUTE FUNCTION calculate_build_time();