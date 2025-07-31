-- Session Pool Management Tables

-- Session pool configuration
CREATE TABLE IF NOT EXISTS public.session_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_type TEXT NOT NULL,
  min_sessions INTEGER DEFAULT 2,
  max_sessions INTEGER DEFAULT 10,
  target_utilization DECIMAL(3,2) DEFAULT 0.75,
  scale_up_threshold DECIMAL(3,2) DEFAULT 0.80,
  scale_down_threshold DECIMAL(3,2) DEFAULT 0.30,
  session_timeout_minutes INTEGER DEFAULT 30,
  idle_timeout_minutes INTEGER DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session instances in the pool
CREATE TABLE IF NOT EXISTS public.session_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES public.session_pools(id) ON DELETE CASCADE,
  appetize_session_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'initializing',
    'ready',
    'allocated',
    'hibernated',
    'terminating',
    'terminated',
    'error'
  )),
  health_status TEXT DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'degraded', 'unhealthy')),
  allocated_to UUID REFERENCES public.preview_sessions(id) ON DELETE SET NULL,
  last_health_check TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  terminated_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Session allocation history
CREATE TABLE IF NOT EXISTS public.session_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_instance_id UUID NOT NULL REFERENCES public.session_instances(id) ON DELETE CASCADE,
  preview_session_id UUID NOT NULL REFERENCES public.preview_sessions(id) ON DELETE CASCADE,
  allocated_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  allocation_type TEXT CHECK (allocation_type IN ('new', 'reused', 'awakened')),
  release_reason TEXT CHECK (release_reason IN ('completed', 'timeout', 'error', 'forced'))
);

-- Session metrics for optimization
CREATE TABLE IF NOT EXISTS public.session_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id UUID NOT NULL REFERENCES public.session_pools(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  total_sessions INTEGER NOT NULL,
  active_sessions INTEGER NOT NULL,
  idle_sessions INTEGER NOT NULL,
  hibernated_sessions INTEGER NOT NULL,
  utilization_rate DECIMAL(5,2),
  average_wait_time_ms INTEGER,
  allocation_failures INTEGER DEFAULT 0,
  cost_per_hour DECIMAL(10,2)
);

-- Session cost tracking
CREATE TABLE IF NOT EXISTS public.session_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_instance_id UUID NOT NULL REFERENCES public.session_instances(id) ON DELETE CASCADE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  runtime_minutes DECIMAL(10,2) NOT NULL,
  cost_usd DECIMAL(10,4) NOT NULL,
  cost_breakdown JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User session quotas
CREATE TABLE IF NOT EXISTS public.user_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT DEFAULT 'free' CHECK (plan_type IN ('free', 'pro', 'enterprise')),
  monthly_minutes_limit INTEGER DEFAULT 300,
  monthly_minutes_used DECIMAL(10,2) DEFAULT 0,
  concurrent_sessions_limit INTEGER DEFAULT 1,
  quota_reset_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX idx_session_instances_pool_status ON public.session_instances(pool_id, status);
CREATE INDEX idx_session_instances_allocated_to ON public.session_instances(allocated_to) WHERE allocated_to IS NOT NULL;
CREATE INDEX idx_session_allocations_preview_session ON public.session_allocations(preview_session_id);
CREATE INDEX idx_session_allocations_allocated_at ON public.session_allocations(allocated_at DESC);
CREATE INDEX idx_session_metrics_pool_timestamp ON public.session_metrics(pool_id, timestamp DESC);
CREATE INDEX idx_session_costs_instance_period ON public.session_costs(session_instance_id, period_start);
CREATE INDEX idx_user_quotas_user_id ON public.user_quotas(user_id);

-- RLS Policies for session_pools
ALTER TABLE public.session_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can manage session pools" ON public.session_pools
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'admin'
    )
  );

-- RLS Policies for session_instances
ALTER TABLE public.session_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their allocated sessions" ON public.session_instances
  FOR SELECT USING (
    allocated_to IN (
      SELECT id FROM public.preview_sessions 
      WHERE project_id IN (
        SELECT id FROM public.projects WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for session_allocations
ALTER TABLE public.session_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their session allocations" ON public.session_allocations
  FOR SELECT USING (
    preview_session_id IN (
      SELECT id FROM public.preview_sessions 
      WHERE project_id IN (
        SELECT id FROM public.projects WHERE user_id = auth.uid()
      )
    )
  );

-- RLS Policies for user_quotas
ALTER TABLE public.user_quotas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own quotas" ON public.user_quotas
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "System can manage user quotas" ON public.user_quotas
  FOR ALL USING (auth.uid() = user_id OR auth.jwt()->>'role' = 'service_role');

-- Functions for session management

-- Function to allocate a session from the pool
CREATE OR REPLACE FUNCTION allocate_session_from_pool(
  p_pool_id UUID,
  p_preview_session_id UUID,
  p_priority TEXT DEFAULT 'normal'
) RETURNS UUID AS $$
DECLARE
  v_session_id UUID;
  v_user_id UUID;
  v_quota RECORD;
BEGIN
  -- Get user ID from preview session
  SELECT ps.user_id INTO v_user_id
  FROM public.preview_sessions ps
  WHERE ps.id = p_preview_session_id;

  -- Check user quota
  SELECT * INTO v_quota
  FROM public.user_quotas
  WHERE user_id = v_user_id;

  IF v_quota.monthly_minutes_used >= v_quota.monthly_minutes_limit THEN
    RAISE EXCEPTION 'Monthly quota exceeded';
  END IF;

  -- Try to find an available session
  SELECT id INTO v_session_id
  FROM public.session_instances
  WHERE pool_id = p_pool_id
    AND status = 'ready'
    AND health_status = 'healthy'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF v_session_id IS NULL THEN
    -- Try to wake up a hibernated session
    SELECT id INTO v_session_id
    FROM public.session_instances
    WHERE pool_id = p_pool_id
      AND status = 'hibernated'
      AND health_status = 'healthy'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
    
    IF v_session_id IS NOT NULL THEN
      -- Wake up the session
      UPDATE public.session_instances
      SET status = 'allocated',
          allocated_to = p_preview_session_id
      WHERE id = v_session_id;
      
      -- Record allocation
      INSERT INTO public.session_allocations (
        session_instance_id,
        preview_session_id,
        allocation_type
      ) VALUES (
        v_session_id,
        p_preview_session_id,
        'awakened'
      );
      
      RETURN v_session_id;
    END IF;
  ELSE
    -- Allocate the ready session
    UPDATE public.session_instances
    SET status = 'allocated',
        allocated_to = p_preview_session_id
    WHERE id = v_session_id;
    
    -- Record allocation
    INSERT INTO public.session_allocations (
      session_instance_id,
      preview_session_id,
      allocation_type
    ) VALUES (
      v_session_id,
      p_preview_session_id,
      'reused'
    );
    
    RETURN v_session_id;
  END IF;

  -- No available sessions
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to release a session back to pool
CREATE OR REPLACE FUNCTION release_session_to_pool(
  p_session_id UUID,
  p_reason TEXT DEFAULT 'completed'
) RETURNS VOID AS $$
DECLARE
  v_allocation RECORD;
  v_duration INTEGER;
  v_cost DECIMAL;
BEGIN
  -- Get allocation info
  SELECT * INTO v_allocation
  FROM public.session_allocations
  WHERE session_instance_id = p_session_id
    AND released_at IS NULL
  ORDER BY allocated_at DESC
  LIMIT 1;

  IF v_allocation.id IS NOT NULL THEN
    -- Calculate duration
    v_duration := EXTRACT(EPOCH FROM (NOW() - v_allocation.allocated_at));
    
    -- Update allocation record
    UPDATE public.session_allocations
    SET released_at = NOW(),
        duration_seconds = v_duration,
        release_reason = p_reason
    WHERE id = v_allocation.id;
    
    -- Update user quota
    UPDATE public.user_quotas uq
    SET monthly_minutes_used = monthly_minutes_used + (v_duration / 60.0)
    FROM public.preview_sessions ps
    WHERE ps.id = v_allocation.preview_session_id
      AND uq.user_id = ps.user_id;
  END IF;

  -- Return session to pool
  UPDATE public.session_instances
  SET status = 'ready',
      allocated_to = NULL
  WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to hibernate idle sessions
CREATE OR REPLACE FUNCTION hibernate_idle_sessions() RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE public.session_instances si
  SET status = 'hibernated'
  FROM public.session_pools sp
  WHERE si.pool_id = sp.id
    AND si.status = 'ready'
    AND si.allocated_to IS NULL
    AND si.created_at < NOW() - (sp.idle_timeout_minutes || ' minutes')::INTERVAL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate pool metrics
CREATE OR REPLACE FUNCTION calculate_pool_metrics(p_pool_id UUID) RETURNS VOID AS $$
DECLARE
  v_metrics RECORD;
BEGIN
  SELECT 
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE status = 'allocated') as active,
    COUNT(*) FILTER (WHERE status = 'ready') as idle,
    COUNT(*) FILTER (WHERE status = 'hibernated') as hibernated
  INTO v_metrics
  FROM public.session_instances
  WHERE pool_id = p_pool_id
    AND status NOT IN ('terminated', 'error');

  INSERT INTO public.session_metrics (
    pool_id,
    total_sessions,
    active_sessions,
    idle_sessions,
    hibernated_sessions,
    utilization_rate
  ) VALUES (
    p_pool_id,
    v_metrics.total,
    v_metrics.active,
    v_metrics.idle,
    v_metrics.hibernated,
    CASE 
      WHEN v_metrics.total > 0 THEN 
        (v_metrics.active::DECIMAL / v_metrics.total::DECIMAL) * 100
      ELSE 0
    END
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-scale pool
CREATE OR REPLACE FUNCTION auto_scale_pool(p_pool_id UUID) RETURNS TEXT AS $$
DECLARE
  v_pool RECORD;
  v_metrics RECORD;
  v_action TEXT := 'none';
BEGIN
  -- Get pool configuration
  SELECT * INTO v_pool
  FROM public.session_pools
  WHERE id = p_pool_id;

  -- Get latest metrics
  SELECT * INTO v_metrics
  FROM public.session_metrics
  WHERE pool_id = p_pool_id
  ORDER BY timestamp DESC
  LIMIT 1;

  -- Scale up if needed
  IF v_metrics.utilization_rate > (v_pool.scale_up_threshold * 100) 
     AND v_metrics.total_sessions < v_pool.max_sessions THEN
    -- Signal to create new session
    v_action := 'scale_up';
  
  -- Scale down if needed
  ELSIF v_metrics.utilization_rate < (v_pool.scale_down_threshold * 100)
        AND v_metrics.total_sessions > v_pool.min_sessions
        AND v_metrics.idle_sessions > 0 THEN
    -- Terminate an idle session
    UPDATE public.session_instances
    SET status = 'terminating'
    WHERE id = (
      SELECT id FROM public.session_instances
      WHERE pool_id = p_pool_id
        AND status = 'ready'
        AND allocated_to IS NULL
      ORDER BY created_at ASC
      LIMIT 1
    );
    v_action := 'scale_down';
  END IF;

  RETURN v_action;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_session_pools_timestamp
  BEFORE UPDATE ON public.session_pools
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_quotas_timestamp
  BEFORE UPDATE ON public.user_quotas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Create default session pools
INSERT INTO public.session_pools (name, platform, device_type) VALUES
  ('iOS Pool - iPhone 15 Pro', 'ios', 'iphone15pro'),
  ('iOS Pool - iPad Pro', 'ios', 'ipadpro11'),
  ('Android Pool - Pixel 8', 'android', 'pixel8pro'),
  ('Android Pool - Galaxy S23', 'android', 'galaxys23');

-- Create view for session pool status
CREATE OR REPLACE VIEW session_pool_status AS
SELECT 
  sp.id,
  sp.name,
  sp.platform,
  sp.device_type,
  COUNT(si.id) as total_sessions,
  COUNT(si.id) FILTER (WHERE si.status = 'allocated') as active_sessions,
  COUNT(si.id) FILTER (WHERE si.status = 'ready') as ready_sessions,
  COUNT(si.id) FILTER (WHERE si.status = 'hibernated') as hibernated_sessions,
  COUNT(si.id) FILTER (WHERE si.status = 'error') as error_sessions,
  CASE 
    WHEN COUNT(si.id) > 0 THEN 
      ROUND((COUNT(si.id) FILTER (WHERE si.status = 'allocated')::DECIMAL / COUNT(si.id)::DECIMAL) * 100, 2)
    ELSE 0
  END as utilization_percentage
FROM public.session_pools sp
LEFT JOIN public.session_instances si ON sp.id = si.pool_id
GROUP BY sp.id, sp.name, sp.platform, sp.device_type;