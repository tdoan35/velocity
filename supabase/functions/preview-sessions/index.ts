import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/database.ts';

interface SessionPoolRequest {
  deviceId: string;
  projectId: string;
  priority?: 'normal' | 'high';
}

interface SessionPoolResponse {
  sessionId: string;
  publicKey: string;
  previewUrl: string;
  fromPool: boolean;
  warmingTime?: number;
}

const APPETIZE_API_KEY = Deno.env.get('APPETIZE_API_KEY') ?? '';
const POOL_SIZE_PER_DEVICE = 3;
const SESSION_TIMEOUT_MS = 3600000; // 1 hour
const WARMING_INTERVAL_MS = 300000; // 5 minutes

// Session pool manager
class SessionPoolManager {
  private warmingQueue: Map<string, Promise<void>> = new Map();

  async getOrCreateSession(
    supabase: any,
    userId: string,
    request: SessionPoolRequest
  ): Promise<SessionPoolResponse> {
    const startTime = Date.now();

    // Try to get a session from the pool first
    const poolSession = await this.getFromPool(supabase, request.deviceId);
    
    if (poolSession) {
      // Reserve the session
      const { error: updateError } = await supabase
        .from('preview_session_pool')
        .update({
          status: 'reserved',
          reserved_by: userId,
          reserved_at: new Date().toISOString(),
          last_used_at: new Date().toISOString(),
        })
        .eq('id', poolSession.id);

      if (!updateError) {
        // Trigger background warming to maintain pool size
        this.triggerWarming(supabase, request.deviceId);

        return {
          sessionId: poolSession.session_id,
          publicKey: poolSession.public_key,
          previewUrl: this.buildPreviewUrl(poolSession.public_key, request.deviceId),
          fromPool: true,
          warmingTime: Date.now() - startTime,
        };
      }
    }

    // If no pool session available, create a new one
    const newSession = await this.createNewSession(request.deviceId);
    
    // Store in user's sessions
    await supabase
      .from('preview_sessions')
      .insert({
        user_id: userId,
        project_id: request.projectId,
        session_id: newSession.sessionId,
        public_key: newSession.publicKey,
        device_id: request.deviceId,
        app_url: '', // Will be set when app is loaded
        preview_url: newSession.previewUrl,
        status: 'active',
        expires_at: new Date(Date.now() + SESSION_TIMEOUT_MS).toISOString(),
      });

    return {
      ...newSession,
      fromPool: false,
      warmingTime: Date.now() - startTime,
    };
  }

  private async getFromPool(supabase: any, deviceId: string) {
    const { data, error } = await supabase
      .from('preview_session_pool')
      .select('*')
      .eq('device_id', deviceId)
      .eq('status', 'available')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    return error ? null : data;
  }

  private async createNewSession(deviceId: string): Promise<SessionPoolResponse> {
    // In a real implementation, this would call Appetize API
    // For now, we'll simulate it
    const sessionId = crypto.randomUUID();
    const publicKey = crypto.randomUUID();

    return {
      sessionId,
      publicKey,
      previewUrl: this.buildPreviewUrl(publicKey, deviceId),
      fromPool: false,
    };
  }

  private buildPreviewUrl(publicKey: string, deviceId: string): string {
    return `https://appetize.io/embed/${publicKey}?device=${deviceId}&scale=75&autoplay=true`;
  }

  private async triggerWarming(supabase: any, deviceId: string) {
    // Avoid duplicate warming for the same device
    if (this.warmingQueue.has(deviceId)) {
      return;
    }

    const warmingPromise = this.warmSessions(supabase, deviceId);
    this.warmingQueue.set(deviceId, warmingPromise);

    warmingPromise.finally(() => {
      this.warmingQueue.delete(deviceId);
    });
  }

  private async warmSessions(supabase: any, deviceId: string) {
    try {
      // Call the warming function
      const { data, error } = await supabase
        .rpc('warm_session_pool', {
          p_device_id: deviceId,
          p_target_count: POOL_SIZE_PER_DEVICE,
        });

      if (error) {
        console.error('Error warming sessions:', error);
        return;
      }

      const sessionsToCreate = data || 0;

      // Create actual sessions for warming entries
      for (let i = 0; i < sessionsToCreate; i++) {
        try {
          const session = await this.createNewSession(deviceId);
          
          await supabase
            .from('preview_session_pool')
            .update({
              session_id: session.sessionId,
              public_key: session.publicKey,
              status: 'available',
              expires_at: new Date(Date.now() + SESSION_TIMEOUT_MS).toISOString(),
            })
            .eq('device_id', deviceId)
            .eq('status', 'warming')
            .order('created_at', { ascending: true })
            .limit(1);
        } catch (error) {
          console.error('Error creating warmed session:', error);
        }
      }
    } catch (error) {
      console.error('Error in warm sessions:', error);
    }
  }
}

const poolManager = new SessionPoolManager();

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/preview-sessions/, '');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseClient(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    switch (path) {
      case '/allocate': {
        if (req.method === 'POST') {
          const request: SessionPoolRequest = await req.json();
          
          // Check user's subscription for session limits
          const { data: subscription } = await supabase
            .from('user_subscriptions')
            .select('tier, preview_sessions_limit, preview_sessions_used')
            .eq('user_id', user.id)
            .single();

          if (subscription && subscription.preview_sessions_used >= subscription.preview_sessions_limit) {
            return new Response(JSON.stringify({ 
              error: 'Preview session limit reached',
              limit: subscription.preview_sessions_limit,
              used: subscription.preview_sessions_used,
            }), {
              status: 429,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          const session = await poolManager.getOrCreateSession(supabase, user.id, request);

          // Update usage count
          if (subscription) {
            await supabase
              .from('user_subscriptions')
              .update({
                preview_sessions_used: subscription.preview_sessions_used + 1,
              })
              .eq('user_id', user.id);
          }

          return new Response(JSON.stringify(session), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }

      case '/release': {
        if (req.method === 'POST') {
          const { sessionId } = await req.json();

          // Mark session as ended
          await supabase
            .from('preview_sessions')
            .update({
              status: 'ended',
              ended_at: new Date().toISOString(),
            })
            .eq('session_id', sessionId)
            .eq('user_id', user.id);

          // Return session to pool if possible
          const { data: poolSession } = await supabase
            .from('preview_session_pool')
            .select('*')
            .eq('session_id', sessionId)
            .single();

          if (poolSession && poolSession.expires_at > new Date().toISOString()) {
            await supabase
              .from('preview_session_pool')
              .update({
                status: 'available',
                reserved_by: null,
                reserved_at: null,
              })
              .eq('id', poolSession.id);
          }

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }

      case '/metrics': {
        if (req.method === 'GET') {
          const projectId = url.searchParams.get('projectId');
          const timeRange = url.searchParams.get('timeRange') || '24h';

          const timeRangeMap: Record<string, string> = {
            '1h': '1 hour',
            '24h': '24 hours',
            '7d': '7 days',
            '30d': '30 days',
          };

          const interval = timeRangeMap[timeRange] || '24 hours';

          const { data: metrics } = await supabase
            .from('preview_session_metrics')
            .select('*')
            .eq('user_id', user.id)
            .eq('project_id', projectId)
            .gte('created_at', `now() - interval '${interval}'`)
            .order('created_at', { ascending: false });

          const summary = {
            totalSessions: metrics?.length || 0,
            totalDuration: metrics?.reduce((sum, m) => sum + (m.duration_seconds || 0), 0) || 0,
            totalHotReloads: metrics?.reduce((sum, m) => sum + (m.hot_reloads_count || 0), 0) || 0,
            averageDuration: 0,
            deviceBreakdown: {} as Record<string, number>,
          };

          if (metrics && metrics.length > 0) {
            summary.averageDuration = summary.totalDuration / metrics.length;
            
            metrics.forEach(metric => {
              if (metric.device_type) {
                summary.deviceBreakdown[metric.device_type] = 
                  (summary.deviceBreakdown[metric.device_type] || 0) + 1;
              }
            });
          }

          return new Response(JSON.stringify({ metrics, summary }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }

      case '/cleanup': {
        if (req.method === 'POST') {
          // This would typically be called by a cron job
          // Check if user has admin privileges
          const { data: adminCheck } = await supabase
            .rpc('is_admin', { user_id: user.id });

          if (!adminCheck) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 403,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          await supabase.rpc('cleanup_expired_preview_sessions');

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }

      default: {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in preview-sessions:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});