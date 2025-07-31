import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'

interface HotReloadEvent {
  projectId: string
  sessionId: string
  type: 'file_change' | 'reload_request' | 'reload_complete' | 'error'
  payload: {
    files?: string[]
    bundleUrl?: string
    error?: string
    timestamp: number
  }
}

interface AppetizeReloadRequest {
  sessionId: string
  bundleUrl: string
  platform: string
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Appetize.io API configuration
const APPETIZE_API_URL = 'https://api.appetize.io/v1'
const APPETIZE_API_KEY = Deno.env.get('APPETIZE_API_KEY')!

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const event: HotReloadEvent = await req.json()

    // Validate project access
    const { data: project } = await supabase
      .from('projects')
      .select('id, user_id')
      .eq('id', event.projectId)
      .single()

    if (!project) {
      throw new Error('Project not found')
    }

    // Log hot reload event
    await supabase
      .from('hot_reload_events')
      .insert({
        project_id: event.projectId,
        session_id: event.sessionId,
        event_type: event.type,
        payload: event.payload,
        created_at: new Date().toISOString()
      })

    switch (event.type) {
      case 'file_change':
        // Handle file change event
        await handleFileChange(event)
        break

      case 'reload_request':
        // Trigger reload on Appetize.io session
        await triggerAppetizeReload(event)
        break

      case 'reload_complete':
        // Update session status
        await updateSessionStatus(event.sessionId, 'active', event.payload.bundleUrl)
        break

      case 'error':
        // Log error and update session
        await updateSessionStatus(event.sessionId, 'error', null, event.payload.error)
        break
    }

    // Broadcast event to connected clients via Realtime
    await broadcastHotReloadEvent(event)

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Hot reload event processed: ${event.type}` 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )

  } catch (error) {
    console.error('Hot reload sync error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to process hot reload event' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

async function handleFileChange(event: HotReloadEvent) {
  // Check if auto-reload is enabled for the project
  const { data: settings } = await supabase
    .from('project_settings')
    .select('hot_reload_enabled, hot_reload_delay_ms')
    .eq('project_id', event.projectId)
    .single()

  if (!settings?.hot_reload_enabled) {
    return
  }

  // Schedule a reload after the configured delay
  const delay = settings.hot_reload_delay_ms || 1000
  
  setTimeout(async () => {
    // Check if there are active Appetize sessions
    const { data: sessions } = await supabase
      .from('preview_sessions')
      .select('*')
      .eq('project_id', event.projectId)
      .eq('status', 'active')

    if (sessions && sessions.length > 0) {
      // Trigger reload for each active session
      for (const session of sessions) {
        await triggerAppetizeReload({
          ...event,
          sessionId: session.public_id
        })
      }
    }
  }, delay)
}

async function triggerAppetizeReload(event: HotReloadEvent) {
  // Get session details
  const { data: session } = await supabase
    .from('preview_sessions')
    .select('*')
    .eq('public_id', event.sessionId)
    .single()

  if (!session) {
    throw new Error('Session not found')
  }

  // Get latest bundle URL
  const { data: build } = await supabase
    .from('preview_builds')
    .select('bundle_url')
    .eq('project_id', event.projectId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single()

  if (!build?.bundle_url) {
    throw new Error('No completed build found')
  }

  try {
    // Send reload command to Appetize.io
    const response = await fetch(`${APPETIZE_API_URL}/sessions/${session.public_id}/reload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APPETIZE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        bundleUrl: build.bundle_url,
        // Additional Appetize reload options
        clearCache: true,
        resetState: false
      })
    })

    if (!response.ok) {
      throw new Error(`Appetize reload failed: ${response.statusText}`)
    }

    // Update session with new bundle URL
    await updateSessionStatus(event.sessionId, 'active', build.bundle_url)

    // Log successful reload
    await supabase
      .from('hot_reload_events')
      .insert({
        project_id: event.projectId,
        session_id: event.sessionId,
        event_type: 'reload_success',
        payload: {
          bundleUrl: build.bundle_url,
          timestamp: Date.now()
        },
        created_at: new Date().toISOString()
      })

  } catch (error) {
    console.error('Appetize reload error:', error)
    await updateSessionStatus(event.sessionId, 'error', null, error.message)
    throw error
  }
}

async function updateSessionStatus(
  sessionId: string, 
  status: string, 
  bundleUrl?: string | null,
  error?: string | null
) {
  const updateData: any = {
    status,
    last_activity_at: new Date().toISOString()
  }

  if (bundleUrl) {
    updateData.bundle_url = bundleUrl
  }

  if (error) {
    updateData.error = error
  }

  await supabase
    .from('preview_sessions')
    .update(updateData)
    .eq('public_id', sessionId)
}

async function broadcastHotReloadEvent(event: HotReloadEvent) {
  // Broadcast to project-specific channel
  const channel = supabase.channel(`hot-reload:${event.projectId}`)
  
  await channel.send({
    type: 'broadcast',
    event: 'hot_reload_update',
    payload: {
      sessionId: event.sessionId,
      type: event.type,
      payload: event.payload,
      timestamp: Date.now()
    }
  })
}