import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import * as bcrypt from "https://deno.land/x/bcrypt@v0.4.1/mod.ts"

interface ShareRequest {
  action: 'create' | 'access' | 'update' | 'revoke' | 'get_viewers'
  projectId?: string
  shareToken?: string
  title?: string
  description?: string
  accessLevel?: 'viewer' | 'commenter' | 'editor'
  password?: string
  expiresIn?: number // Hours
  maxViews?: number
  requiresAuth?: boolean
  allowedEmails?: string[]
  viewerInfo?: {
    email?: string
    name?: string
  }
}

interface ShareResponse {
  success: boolean
  shareLink?: string
  shareToken?: string
  viewerSessionId?: string
  projectId?: string
  accessLevel?: string
  viewers?: any[]
  error?: string
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

// Base URL for share links
const SHARE_BASE_URL = Deno.env.get('SHARE_BASE_URL') || 'https://share.velocity.dev'

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const request: ShareRequest = await req.json()
    
    // Get client IP for tracking
    const clientIp = req.headers.get('x-forwarded-for') || 
                    req.headers.get('x-real-ip') || 
                    'unknown'

    switch (request.action) {
      case 'create':
        return await handleCreateShareLink(request)
      
      case 'access':
        return await handleAccessShareLink(request, clientIp, req.headers.get('user-agent'))
      
      case 'update':
        return await handleUpdateShareLink(request)
      
      case 'revoke':
        return await handleRevokeShareLink(request)
      
      case 'get_viewers':
        return await handleGetViewers(request)
      
      default:
        throw new Error(`Unknown action: ${request.action}`)
    }

  } catch (error) {
    console.error('Preview sharing error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Preview sharing operation failed' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

async function handleCreateShareLink(request: ShareRequest): Promise<Response> {
  const {
    projectId,
    title = 'Shared Preview',
    description,
    accessLevel = 'viewer',
    password,
    expiresIn,
    maxViews,
    requiresAuth = false,
    allowedEmails = []
  } = request

  if (!projectId) {
    throw new Error('Project ID is required')
  }

  // Verify user has access to project
  const { data: project } = await supabase
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single()

  if (!project) {
    throw new Error('Project not found')
  }

  // Get authenticated user
  const authHeader = request.headers?.get('Authorization')
  if (!authHeader) {
    throw new Error('Authentication required')
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )

  if (authError || !user || user.id !== project.user_id) {
    throw new Error('Unauthorized')
  }

  // Generate secure token
  const shareToken = generateSecureToken()

  // Hash password if provided
  let passwordHash = null
  if (password) {
    passwordHash = await bcrypt.hash(password)
  }

  // Calculate expiration
  let expiresAt = null
  if (expiresIn) {
    expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + expiresIn)
  }

  // Create share link
  const { data: shareLink, error } = await supabase
    .from('shared_preview_links')
    .insert({
      project_id: projectId,
      created_by: user.id,
      share_token: shareToken,
      title,
      description,
      access_level: accessLevel,
      password_hash: passwordHash,
      expires_at: expiresAt,
      max_views: maxViews,
      requires_auth: requiresAuth,
      allowed_emails: allowedEmails,
      metadata: {
        created_from: 'api',
        user_agent: request.headers?.get('user-agent')
      }
    })
    .select()
    .single()

  if (error) throw error

  // Create notification preference
  await supabase
    .from('preview_share_notifications')
    .insert({
      user_id: user.id,
      share_link_id: shareLink.id
    })

  const fullShareLink = `${SHARE_BASE_URL}/preview/${shareToken}`

  return new Response(
    JSON.stringify({
      success: true,
      shareLink: fullShareLink,
      shareToken: shareToken,
      expiresAt: expiresAt?.toISOString()
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

async function handleAccessShareLink(
  request: ShareRequest, 
  clientIp: string,
  userAgent: string | null
): Promise<Response> {
  const { shareToken, password, viewerInfo } = request

  if (!shareToken) {
    throw new Error('Share token is required')
  }

  // Parse IP address
  let ipAddress = null
  try {
    // Handle comma-separated IPs from proxies
    const firstIp = clientIp.split(',')[0].trim()
    if (firstIp !== 'unknown') {
      ipAddress = firstIp
    }
  } catch (e) {
    console.error('Failed to parse IP:', e)
  }

  // Call access function
  const { data, error } = await supabase.rpc('access_shared_preview', {
    p_token: shareToken,
    p_password: password,
    p_viewer_email: viewerInfo?.email,
    p_viewer_name: viewerInfo?.name,
    p_viewer_ip: ipAddress,
    p_user_agent: userAgent
  })

  if (error) throw error

  const result = data[0]

  if (!result.success) {
    return new Response(
      JSON.stringify({
        success: false,
        error: result.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403
      }
    )
  }

  // Get preview session details
  const { data: previewSession } = await supabase
    .from('preview_sessions')
    .select('*')
    .eq('project_id', result.project_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  // Notify creator of new viewer
  await notifyShareAccess(result.share_link_id, viewerInfo?.name || 'Anonymous')

  return new Response(
    JSON.stringify({
      success: true,
      viewerSessionId: result.viewer_session_id,
      projectId: result.project_id,
      accessLevel: result.access_level,
      previewUrl: previewSession?.preview_url || null
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

async function handleUpdateShareLink(request: ShareRequest): Promise<Response> {
  const { shareToken, ...updates } = request

  if (!shareToken) {
    throw new Error('Share token is required')
  }

  // Get authenticated user
  const authHeader = request.headers?.get('Authorization')
  if (!authHeader) {
    throw new Error('Authentication required')
  }

  const { data: { user } } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Update share link
  const { data, error } = await supabase
    .from('shared_preview_links')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('share_token', shareToken)
    .eq('created_by', user.id)
    .select()
    .single()

  if (error) throw error

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Share link updated successfully'
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

async function handleRevokeShareLink(request: ShareRequest): Promise<Response> {
  const { shareToken } = request

  if (!shareToken) {
    throw new Error('Share token is required')
  }

  // Get authenticated user
  const authHeader = request.headers?.get('Authorization')
  if (!authHeader) {
    throw new Error('Authentication required')
  }

  const { data: { user } } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )

  if (!user) {
    throw new Error('Unauthorized')
  }

  // Deactivate share link
  const { error } = await supabase
    .from('shared_preview_links')
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('share_token', shareToken)
    .eq('created_by', user.id)

  if (error) throw error

  // Mark all viewers as inactive
  const { data: shareLink } = await supabase
    .from('shared_preview_links')
    .select('id')
    .eq('share_token', shareToken)
    .single()

  if (shareLink) {
    await supabase
      .from('preview_viewers')
      .update({ is_active: false })
      .eq('share_link_id', shareLink.id)
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: 'Share link revoked successfully'
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

async function handleGetViewers(request: ShareRequest): Promise<Response> {
  const { shareToken } = request

  if (!shareToken) {
    throw new Error('Share token is required')
  }

  // Get share link
  const { data: shareLink } = await supabase
    .from('shared_preview_links')
    .select('id')
    .eq('share_token', shareToken)
    .single()

  if (!shareLink) {
    throw new Error('Share link not found')
  }

  // Get active viewers
  const { data: viewers, error } = await supabase.rpc('get_active_viewers', {
    p_share_link_id: shareLink.id
  })

  if (error) throw error

  return new Response(
    JSON.stringify({
      success: true,
      viewers: viewers || []
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

function generateSecureToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function notifyShareAccess(shareLinkId: string, viewerName: string) {
  try {
    // Get share link and creator details
    const { data: shareLink } = await supabase
      .from('shared_preview_links')
      .select(`
        title,
        created_by,
        preview_share_notifications!inner(
          notify_on_view,
          email_notifications
        )
      `)
      .eq('id', shareLinkId)
      .single()

    if (!shareLink || !shareLink.preview_share_notifications[0]?.notify_on_view) {
      return
    }

    // Send notification (implement your notification service)
    console.log(`Notifying user ${shareLink.created_by} about viewer ${viewerName}`)
    
    // You can integrate with email service, push notifications, etc.
    
  } catch (error) {
    console.error('Failed to send notification:', error)
  }
}