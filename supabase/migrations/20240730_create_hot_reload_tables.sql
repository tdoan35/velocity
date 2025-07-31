-- Create hot_reload_events table for tracking reload events
CREATE TABLE IF NOT EXISTS public.hot_reload_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'file_change', 
    'reload_request', 
    'reload_complete', 
    'reload_success',
    'error',
    'connection_established',
    'connection_lost'
  )),
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_hot_reload_events_project_id ON public.hot_reload_events(project_id);
CREATE INDEX idx_hot_reload_events_session_id ON public.hot_reload_events(session_id);
CREATE INDEX idx_hot_reload_events_created_at ON public.hot_reload_events(created_at DESC);

-- Create project_settings table for hot reload configuration
CREATE TABLE IF NOT EXISTS public.project_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID UNIQUE NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  hot_reload_enabled BOOLEAN DEFAULT true,
  hot_reload_delay_ms INTEGER DEFAULT 1000 CHECK (hot_reload_delay_ms >= 100 AND hot_reload_delay_ms <= 10000),
  auto_save_enabled BOOLEAN DEFAULT true,
  auto_save_delay_ms INTEGER DEFAULT 2000,
  preview_platform TEXT DEFAULT 'ios' CHECK (preview_platform IN ('ios', 'android', 'web')),
  theme_preference TEXT DEFAULT 'system' CHECK (theme_preference IN ('light', 'dark', 'system')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create websocket_connections table for tracking active connections
CREATE TABLE IF NOT EXISTS public.websocket_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id TEXT UNIQUE NOT NULL,
  channel_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('connected', 'disconnected', 'error')),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  disconnected_at TIMESTAMPTZ,
  last_ping_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes
CREATE INDEX idx_websocket_connections_project_id ON public.websocket_connections(project_id);
CREATE INDEX idx_websocket_connections_user_id ON public.websocket_connections(user_id);
CREATE INDEX idx_websocket_connections_status ON public.websocket_connections(status);

-- RLS Policies for hot_reload_events
ALTER TABLE public.hot_reload_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view hot reload events for their projects" ON public.hot_reload_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create hot reload events for their projects" ON public.hot_reload_events
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

-- RLS Policies for project_settings
ALTER TABLE public.project_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view settings for their projects" ON public.project_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage settings for their projects" ON public.project_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.projects 
      WHERE id = project_id AND user_id = auth.uid()
    )
  );

-- RLS Policies for websocket_connections
ALTER TABLE public.websocket_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own connections" ON public.websocket_connections
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own connections" ON public.websocket_connections
  FOR ALL USING (auth.uid() = user_id);

-- Function to clean up stale connections
CREATE OR REPLACE FUNCTION cleanup_stale_connections() RETURNS void AS $$
BEGIN
  -- Mark connections as disconnected if no ping for 5 minutes
  UPDATE public.websocket_connections
  SET status = 'disconnected',
      disconnected_at = NOW()
  WHERE status = 'connected'
    AND last_ping_at < NOW() - INTERVAL '5 minutes';
  
  -- Delete old disconnected connections
  DELETE FROM public.websocket_connections
  WHERE status = 'disconnected'
    AND disconnected_at < NOW() - INTERVAL '1 day';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update last activity timestamp
CREATE OR REPLACE FUNCTION update_last_activity() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for project_settings
CREATE TRIGGER update_project_settings_timestamp
  BEFORE UPDATE ON public.project_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_last_activity();

-- Function to initialize project settings
CREATE OR REPLACE FUNCTION initialize_project_settings() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.project_settings (project_id)
  VALUES (NEW.id)
  ON CONFLICT (project_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-create settings for new projects
CREATE TRIGGER create_project_settings_on_project_create
  AFTER INSERT ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION initialize_project_settings();

-- Analytics view for hot reload performance
CREATE OR REPLACE VIEW hot_reload_analytics AS
SELECT 
  p.id as project_id,
  p.name as project_name,
  COUNT(DISTINCT hre.session_id) as unique_sessions,
  COUNT(CASE WHEN hre.event_type = 'reload_request' THEN 1 END) as total_reloads,
  COUNT(CASE WHEN hre.event_type = 'reload_success' THEN 1 END) as successful_reloads,
  COUNT(CASE WHEN hre.event_type = 'error' THEN 1 END) as failed_reloads,
  AVG(CASE 
    WHEN hre.event_type = 'reload_success' 
    AND hre.payload->>'duration' IS NOT NULL 
    THEN (hre.payload->>'duration')::numeric 
  END) as avg_reload_time_ms,
  MAX(hre.created_at) as last_reload_at
FROM public.projects p
LEFT JOIN public.hot_reload_events hre ON p.id = hre.project_id
WHERE hre.created_at > NOW() - INTERVAL '7 days'
GROUP BY p.id, p.name;