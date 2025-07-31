import { supabase } from '@/lib/supabase'

interface CreateShareOptions {
  projectId: string
  title?: string
  description?: string
  accessLevel?: 'viewer' | 'commenter' | 'editor'
  password?: string
  expiresIn?: number // Hours
  maxViews?: number
  requiresAuth?: boolean
  allowedEmails?: string[]
}

interface ShareLink {
  shareLink: string
  shareToken: string
  expiresAt?: string
}

interface ViewerSession {
  viewerSessionId: string
  projectId: string
  accessLevel: string
  previewUrl: string | null
}

interface Viewer {
  viewerId: string
  viewerName: string | null
  viewerEmail: string | null
  isAuthenticated: boolean
  joinedAt: string
  lastActivity: string
}

interface Comment {
  id: string
  viewerId: string
  viewerName: string
  text: string
  timestamp?: number
  position?: { x: number; y: number }
  isResolved: boolean
  createdAt: string
}

interface ShareStats {
  viewCount: number
  activeViewers: number
  totalComments: number
  reactions: Record<string, number>
}

class PreviewSharingService {
  private static instance: PreviewSharingService
  private viewerSessionId: string | null = null
  private shareToken: string | null = null

  private constructor() {}

  static getInstance(): PreviewSharingService {
    if (!PreviewSharingService.instance) {
      PreviewSharingService.instance = new PreviewSharingService()
    }
    return PreviewSharingService.instance
  }

  /**
   * Create a shareable preview link
   */
  async createShareLink(options: CreateShareOptions): Promise<ShareLink> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preview-sharing`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          ...options
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create share link')
      }

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to create share link')
      }

      return {
        shareLink: data.shareLink,
        shareToken: data.shareToken,
        expiresAt: data.expiresAt
      }
    } catch (error) {
      console.error('Create share link error:', error)
      throw error
    }
  }

  /**
   * Access a shared preview
   */
  async accessSharedPreview(
    shareToken: string,
    password?: string,
    viewerInfo?: { name?: string; email?: string }
  ): Promise<ViewerSession> {
    try {
      this.shareToken = shareToken

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preview-sharing`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'access',
          shareToken,
          password,
          viewerInfo
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to access preview')
      }

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Access denied')
      }

      this.viewerSessionId = data.viewerSessionId

      return {
        viewerSessionId: data.viewerSessionId,
        projectId: data.projectId,
        accessLevel: data.accessLevel,
        previewUrl: data.previewUrl
      }
    } catch (error) {
      console.error('Access preview error:', error)
      throw error
    }
  }

  /**
   * Update share link settings
   */
  async updateShareLink(
    shareToken: string,
    updates: Partial<CreateShareOptions>
  ): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preview-sharing`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'update',
          shareToken,
          ...updates
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update share link')
      }
    } catch (error) {
      console.error('Update share link error:', error)
      throw error
    }
  }

  /**
   * Revoke a share link
   */
  async revokeShareLink(shareToken: string): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preview-sharing`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'revoke',
          shareToken
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to revoke share link')
      }
    } catch (error) {
      console.error('Revoke share link error:', error)
      throw error
    }
  }

  /**
   * Get active viewers for a share link
   */
  async getActiveViewers(shareToken: string): Promise<Viewer[]> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/preview-sharing`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get_viewers',
          shareToken
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to get viewers')
      }

      const data = await response.json()
      return data.viewers || []
    } catch (error) {
      console.error('Get viewers error:', error)
      throw error
    }
  }

  /**
   * Add a comment to the shared preview
   */
  async addComment(
    text: string,
    timestamp?: number,
    position?: { x: number; y: number }
  ): Promise<Comment> {
    if (!this.shareToken || !this.viewerSessionId) {
      throw new Error('No active preview session')
    }

    const { data: shareLink } = await supabase
      .from('shared_preview_links')
      .select('id')
      .eq('share_token', this.shareToken)
      .single()

    if (!shareLink) {
      throw new Error('Invalid share token')
    }

    const { data: viewer } = await supabase
      .from('preview_viewers')
      .select('id, viewer_name')
      .eq('viewer_session_id', this.viewerSessionId)
      .single()

    if (!viewer) {
      throw new Error('Invalid viewer session')
    }

    const { data: comment, error } = await supabase
      .from('preview_comments')
      .insert({
        share_link_id: shareLink.id,
        viewer_id: viewer.id,
        comment_text: text,
        timestamp_ms: timestamp,
        screen_x: position?.x,
        screen_y: position?.y
      })
      .select()
      .single()

    if (error) throw error

    // Record activity
    await this.recordActivity('commented', { comment_id: comment.id })

    return {
      id: comment.id,
      viewerId: viewer.id,
      viewerName: viewer.viewer_name || 'Anonymous',
      text: comment.comment_text,
      timestamp: comment.timestamp_ms,
      position: position,
      isResolved: comment.is_resolved,
      createdAt: comment.created_at
    }
  }

  /**
   * Get comments for the shared preview
   */
  async getComments(shareToken?: string): Promise<Comment[]> {
    const token = shareToken || this.shareToken
    if (!token) {
      throw new Error('No share token provided')
    }

    const { data: shareLink } = await supabase
      .from('shared_preview_links')
      .select('id')
      .eq('share_token', token)
      .single()

    if (!shareLink) {
      throw new Error('Invalid share token')
    }

    const { data: comments, error } = await supabase
      .from('preview_comments')
      .select(`
        *,
        preview_viewers!inner(viewer_name)
      `)
      .eq('share_link_id', shareLink.id)
      .order('created_at', { ascending: true })

    if (error) throw error

    return comments.map(c => ({
      id: c.id,
      viewerId: c.viewer_id,
      viewerName: c.preview_viewers.viewer_name || 'Anonymous',
      text: c.comment_text,
      timestamp: c.timestamp_ms,
      position: c.screen_x && c.screen_y ? {
        x: parseFloat(c.screen_x),
        y: parseFloat(c.screen_y)
      } : undefined,
      isResolved: c.is_resolved,
      createdAt: c.created_at
    }))
  }

  /**
   * Add a reaction to the preview
   */
  async addReaction(
    reactionType: '👍' | '👎' | '❤️' | '🎉' | '😕' | '💡',
    timestamp?: number
  ): Promise<void> {
    if (!this.shareToken || !this.viewerSessionId) {
      throw new Error('No active preview session')
    }

    const { data: shareLink } = await supabase
      .from('shared_preview_links')
      .select('id')
      .eq('share_token', this.shareToken)
      .single()

    if (!shareLink) {
      throw new Error('Invalid share token')
    }

    const { data: viewer } = await supabase
      .from('preview_viewers')
      .select('id')
      .eq('viewer_session_id', this.viewerSessionId)
      .single()

    if (!viewer) {
      throw new Error('Invalid viewer session')
    }

    await supabase
      .from('preview_reactions')
      .upsert({
        share_link_id: shareLink.id,
        viewer_id: viewer.id,
        reaction_type: reactionType,
        timestamp_ms: timestamp
      })

    await this.recordActivity('reacted', { reaction: reactionType })
  }

  /**
   * Get share statistics
   */
  async getShareStats(shareToken: string): Promise<ShareStats> {
    const { data: shareLink } = await supabase
      .from('shared_preview_links')
      .select('id, view_count')
      .eq('share_token', shareToken)
      .single()

    if (!shareLink) {
      throw new Error('Invalid share token')
    }

    // Get active viewers count
    const { count: activeViewers } = await supabase
      .from('preview_viewers')
      .select('*', { count: 'exact', head: true })
      .eq('share_link_id', shareLink.id)
      .eq('is_active', true)
      .gte('last_activity_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

    // Get comments count
    const { count: totalComments } = await supabase
      .from('preview_comments')
      .select('*', { count: 'exact', head: true })
      .eq('share_link_id', shareLink.id)

    // Get reactions
    const { data: reactions } = await supabase
      .from('preview_reactions')
      .select('reaction_type')
      .eq('share_link_id', shareLink.id)

    const reactionCounts = reactions?.reduce((acc, r) => {
      acc[r.reaction_type] = (acc[r.reaction_type] || 0) + 1
      return acc
    }, {} as Record<string, number>) || {}

    return {
      viewCount: shareLink.view_count,
      activeViewers: activeViewers || 0,
      totalComments: totalComments || 0,
      reactions: reactionCounts
    }
  }

  /**
   * Record viewer activity
   */
  private async recordActivity(
    activityType: string,
    activityData: Record<string, any> = {}
  ): Promise<void> {
    if (!this.viewerSessionId) return

    try {
      await supabase.rpc('record_viewer_activity', {
        p_viewer_session_id: this.viewerSessionId,
        p_activity_type: activityType,
        p_activity_data: activityData
      })
    } catch (error) {
      console.error('Failed to record activity:', error)
    }
  }

  /**
   * Subscribe to real-time updates
   */
  subscribeToUpdates(
    shareToken: string,
    callbacks: {
      onViewerJoined?: (viewer: Viewer) => void
      onViewerLeft?: (viewerId: string) => void
      onComment?: (comment: Comment) => void
      onReaction?: (reaction: any) => void
    }
  ) {
    const channel = supabase.channel(`preview-share:${shareToken}`)

    // Subscribe to viewer changes
    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'preview_viewers',
        filter: `share_link_id=eq.${shareToken}`
      }, (payload) => {
        if (callbacks.onViewerJoined) {
          callbacks.onViewerJoined(payload.new as Viewer)
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'preview_viewers',
        filter: `share_link_id=eq.${shareToken}`
      }, (payload) => {
        if (!payload.new.is_active && callbacks.onViewerLeft) {
          callbacks.onViewerLeft(payload.new.id)
        }
      })

    // Subscribe to comments
    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'preview_comments',
        filter: `share_link_id=eq.${shareToken}`
      }, (payload) => {
        if (callbacks.onComment) {
          callbacks.onComment(payload.new as Comment)
        }
      })

    // Subscribe to reactions
    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'preview_reactions',
        filter: `share_link_id=eq.${shareToken}`
      }, (payload) => {
        if (callbacks.onReaction) {
          callbacks.onReaction(payload.new)
        }
      })

    channel.subscribe()

    return () => {
      channel.unsubscribe()
    }
  }
}

// Export singleton instance
export const previewSharingService = PreviewSharingService.getInstance()

// Export types
export type {
  CreateShareOptions,
  ShareLink,
  ViewerSession,
  Viewer,
  Comment,
  ShareStats
}