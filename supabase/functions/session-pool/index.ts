import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'

interface SessionRequest {
  action: 'allocate' | 'release' | 'health_check' | 'scale' | 'metrics'
  projectId?: string
  sessionId?: string
  poolId?: string
  priority?: 'low' | 'normal' | 'high'
  deviceType?: string
  platform?: string
}

interface SessionResponse {
  success: boolean
  sessionId?: string
  sessionUrl?: string
  publicKey?: string
  error?: string
  metrics?: any
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Appetize.io configuration
const APPETIZE_API_URL = 'https://api.appetize.io/v1'
const APPETIZE_API_KEY = Deno.env.get('APPETIZE_API_KEY')!

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const request: SessionRequest = await req.json()

    switch (request.action) {
      case 'allocate':
        return await handleAllocateSession(request)
      
      case 'release':
        return await handleReleaseSession(request)
      
      case 'health_check':
        return await handleHealthCheck(request)
      
      case 'scale':
        return await handleAutoScale(request)
      
      case 'metrics':
        return await handleGetMetrics(request)
      
      default:
        throw new Error(`Unknown action: ${request.action}`)
    }

  } catch (error) {
    console.error('Session pool error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Session pool operation failed' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

async function handleAllocateSession(request: SessionRequest): Promise<Response> {
  const { projectId, deviceType = 'iphone15pro', platform = 'ios', priority = 'normal' } = request

  if (!projectId) {
    throw new Error('Project ID is required')
  }

  // Get appropriate pool
  const { data: pool } = await supabase
    .from('session_pools')
    .select('id')
    .eq('platform', platform)
    .eq('device_type', deviceType)
    .single()

  if (!pool) {
    throw new Error(`No pool found for ${platform}/${deviceType}`)
  }

  // Check user quota
  const { data: project } = await supabase
    .from('projects')
    .select('user_id')
    .eq('id', projectId)
    .single()

  if (!project) {
    throw new Error('Project not found')
  }

  const { data: quota } = await supabase
    .from('user_quotas')
    .select('*')
    .eq('user_id', project.user_id)
    .single()

  if (quota && quota.monthly_minutes_used >= quota.monthly_minutes_limit) {
    throw new Error('Monthly quota exceeded')
  }

  // Try to allocate from pool
  const { data: allocatedSession } = await supabase
    .rpc('allocate_session_from_pool', {
      p_pool_id: pool.id,
      p_preview_session_id: projectId,
      p_priority: priority
    })

  if (allocatedSession) {
    // Get session details
    const { data: session } = await supabase
      .from('session_instances')
      .select('*')
      .eq('id', allocatedSession)
      .single()

    return new Response(
      JSON.stringify({
        success: true,
        sessionId: session.id,
        sessionUrl: `https://appetize.io/app/${session.public_key}`,
        publicKey: session.public_key
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  }

  // No available sessions, create a new one
  const newSession = await createNewSession(pool.id, deviceType, platform)
  
  // Allocate the new session
  await supabase
    .from('session_instances')
    .update({
      status: 'allocated',
      allocated_to: projectId
    })
    .eq('id', newSession.id)

  // Record allocation
  await supabase
    .from('session_allocations')
    .insert({
      session_instance_id: newSession.id,
      preview_session_id: projectId,
      allocation_type: 'new'
    })

  return new Response(
    JSON.stringify({
      success: true,
      sessionId: newSession.id,
      sessionUrl: `https://appetize.io/app/${newSession.public_key}`,
      publicKey: newSession.public_key
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

async function createNewSession(poolId: string, deviceType: string, platform: string) {
  // Create session on Appetize.io
  const response = await fetch(`${APPETIZE_API_URL}/apps`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${APPETIZE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      platform,
      device: deviceType,
      osVersion: 'latest',
      // Placeholder app URL - will be replaced when app is loaded
      url: 'https://velocity.dev/placeholder.app',
      note: `Pool session for ${platform}/${deviceType}`
    })
  })

  if (!response.ok) {
    throw new Error(`Failed to create Appetize session: ${response.statusText}`)
  }

  const appetizeData = await response.json()

  // Store session in database
  const { data: session, error } = await supabase
    .from('session_instances')
    .insert({
      pool_id: poolId,
      appetize_session_id: appetizeData.publicKey,
      public_key: appetizeData.publicKey,
      status: 'ready',
      metadata: {
        platform,
        device: deviceType,
        created_from: 'auto_scale'
      }
    })
    .select()
    .single()

  if (error) throw error

  return session
}

async function handleReleaseSession(request: SessionRequest): Promise<Response> {
  const { sessionId } = request

  if (!sessionId) {
    throw new Error('Session ID is required')
  }

  // Release session back to pool
  await supabase.rpc('release_session_to_pool', {
    p_session_id: sessionId,
    p_reason: 'completed'
  })

  // Calculate and record session cost
  await calculateSessionCost(sessionId)

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Session released successfully'
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

async function handleHealthCheck(request: SessionRequest): Promise<Response> {
  const { poolId } = request

  // Get all sessions that need health check
  const { data: sessions } = await supabase
    .from('session_instances')
    .select('*')
    .eq(poolId ? 'pool_id' : '', poolId || '')
    .lt('last_health_check', new Date(Date.now() - 5 * 60 * 1000).toISOString()) // 5 minutes
    .in('status', ['ready', 'allocated', 'hibernated'])

  const results = []

  for (const session of sessions || []) {
    try {
      // Check session health with Appetize
      const response = await fetch(`${APPETIZE_API_URL}/apps/${session.public_key}`, {
        headers: {
          'Authorization': `Bearer ${APPETIZE_API_KEY}`
        }
      })

      const healthStatus = response.ok ? 'healthy' : 'unhealthy'

      // Update health status
      await supabase
        .from('session_instances')
        .update({
          health_status: healthStatus,
          last_health_check: new Date().toISOString()
        })
        .eq('id', session.id)

      results.push({
        sessionId: session.id,
        status: healthStatus
      })

    } catch (error) {
      // Mark session as unhealthy
      await supabase
        .from('session_instances')
        .update({
          health_status: 'unhealthy',
          last_health_check: new Date().toISOString()
        })
        .eq('id', session.id)

      results.push({
        sessionId: session.id,
        status: 'unhealthy',
        error: error.message
      })
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      checked: results.length,
      results
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

async function handleAutoScale(request: SessionRequest): Promise<Response> {
  const { poolId } = request

  const pools = poolId 
    ? [{ id: poolId }]
    : await supabase.from('session_pools').select('id').then(r => r.data || [])

  const results = []

  for (const pool of pools) {
    // Calculate metrics
    await supabase.rpc('calculate_pool_metrics', {
      p_pool_id: pool.id
    })

    // Check if scaling needed
    const { data: scaleAction } = await supabase.rpc('auto_scale_pool', {
      p_pool_id: pool.id
    })

    if (scaleAction === 'scale_up') {
      // Get pool details
      const { data: poolDetails } = await supabase
        .from('session_pools')
        .select('*')
        .eq('id', pool.id)
        .single()

      // Create new session
      await createNewSession(
        pool.id,
        poolDetails.device_type,
        poolDetails.platform
      )

      results.push({
        poolId: pool.id,
        action: 'scaled_up',
        message: 'Added new session to pool'
      })
    } else if (scaleAction === 'scale_down') {
      // Terminate sessions marked for termination
      const { data: terminatingSessions } = await supabase
        .from('session_instances')
        .select('*')
        .eq('pool_id', pool.id)
        .eq('status', 'terminating')

      for (const session of terminatingSessions || []) {
        await terminateSession(session.id, session.public_key)
      }

      results.push({
        poolId: pool.id,
        action: 'scaled_down',
        message: `Terminated ${terminatingSessions?.length || 0} sessions`
      })
    } else {
      results.push({
        poolId: pool.id,
        action: 'no_change',
        message: 'Pool size optimal'
      })
    }
  }

  // Hibernate idle sessions
  const hibernatedCount = await supabase.rpc('hibernate_idle_sessions')

  return new Response(
    JSON.stringify({
      success: true,
      results,
      hibernatedSessions: hibernatedCount.data || 0
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

async function terminateSession(sessionId: string, publicKey: string) {
  try {
    // Delete from Appetize
    await fetch(`${APPETIZE_API_URL}/apps/${publicKey}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${APPETIZE_API_KEY}`
      }
    })
  } catch (error) {
    console.error('Failed to delete Appetize session:', error)
  }

  // Update database
  await supabase
    .from('session_instances')
    .update({
      status: 'terminated',
      terminated_at: new Date().toISOString()
    })
    .eq('id', sessionId)
}

async function calculateSessionCost(sessionId: string) {
  // Get session allocation history
  const { data: allocations } = await supabase
    .from('session_allocations')
    .select('*')
    .eq('session_instance_id', sessionId)
    .gte('allocated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours

  if (!allocations || allocations.length === 0) return

  // Calculate total runtime
  const totalMinutes = allocations.reduce((acc, alloc) => {
    return acc + ((alloc.duration_seconds || 0) / 60)
  }, 0)

  // Appetize.io pricing (example: $0.05 per minute)
  const costPerMinute = 0.05
  const totalCost = totalMinutes * costPerMinute

  // Record cost
  await supabase
    .from('session_costs')
    .insert({
      session_instance_id: sessionId,
      period_start: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      period_end: new Date().toISOString(),
      runtime_minutes: totalMinutes,
      cost_usd: totalCost,
      cost_breakdown: {
        runtime_cost: totalCost,
        base_rate: costPerMinute,
        allocations: allocations.length
      }
    })
}

async function handleGetMetrics(request: SessionRequest): Promise<Response> {
  const { poolId } = request

  // Get pool status
  const { data: poolStatus } = await supabase
    .from('session_pool_status')
    .select('*')
    .eq(poolId ? 'id' : '', poolId || '')

  // Get recent metrics
  const { data: metrics } = await supabase
    .from('session_metrics')
    .select('*')
    .eq(poolId ? 'pool_id' : '', poolId || '')
    .gte('timestamp', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
    .order('timestamp', { ascending: false })
    .limit(12) // One per 5 minutes

  // Get cost summary
  const { data: costs } = await supabase
    .from('session_costs')
    .select('cost_usd')
    .gte('period_start', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())

  const totalCost = costs?.reduce((acc, c) => acc + c.cost_usd, 0) || 0

  return new Response(
    JSON.stringify({
      success: true,
      metrics: {
        pools: poolStatus,
        history: metrics,
        cost: {
          last24Hours: totalCost,
          estimatedMonthly: totalCost * 30
        }
      }
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}