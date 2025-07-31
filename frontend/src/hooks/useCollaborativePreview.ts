import { useState, useEffect, useCallback, useRef } from 'react'
import { previewSharingService, Viewer, Comment } from '@/services/previewSharingService'
import { useToast } from '@/hooks/use-toast'
import { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface CollaborativePreviewState {
  viewers: Viewer[]
  comments: Comment[]
  isConnected: boolean
  myViewerId: string | null
  myPermissions: {
    canComment: boolean
    canEdit: boolean
  }
}

interface UseCollaborativePreviewOptions {
  shareToken: string
  viewerSessionId?: string
  onViewerJoined?: (viewer: Viewer) => void
  onViewerLeft?: (viewerId: string) => void
  onComment?: (comment: Comment) => void
}

export function useCollaborativePreview({
  shareToken,
  viewerSessionId,
  onViewerJoined,
  onViewerLeft,
  onComment
}: UseCollaborativePreviewOptions) {
  const { toast } = useToast()
  const [state, setState] = useState<CollaborativePreviewState>({
    viewers: [],
    comments: [],
    isConnected: false,
    myViewerId: null,
    myPermissions: {
      canComment: true,
      canEdit: false
    }
  })

  const channelRef = useRef<RealtimeChannel | null>(null)
  const presenceRef = useRef<any>({})

  // Load initial data
  useEffect(() => {
    loadInitialData()
  }, [shareToken])

  // Setup real-time subscriptions
  useEffect(() => {
    if (!shareToken) return

    const channel = supabase.channel(`collab-preview:${shareToken}`)

    // Presence for cursor tracking
    channel
      .on('presence', { event: 'sync' }, () => {
        const presence = channel.presenceState()
        updateViewersFromPresence(presence)
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('Viewer joined:', key, newPresences)
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('Viewer left:', key, leftPresences)
      })

    // Broadcast for real-time events
    channel
      .on('broadcast', { event: 'cursor_move' }, ({ payload }) => {
        updateViewerCursor(payload.viewerId, payload.position)
      })
      .on('broadcast', { event: 'comment_added' }, ({ payload }) => {
        handleNewComment(payload)
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        handleReaction(payload)
      })
      .on('broadcast', { event: 'navigation' }, ({ payload }) => {
        handleNavigation(payload)
      })

    // Subscribe
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setState(prev => ({ ...prev, isConnected: true }))
        
        // Track presence
        if (viewerSessionId) {
          await channel.track({
            viewer_id: viewerSessionId,
            online_at: new Date().toISOString(),
            cursor: { x: 0, y: 0 }
          })
        }
      }
    })

    channelRef.current = channel

    return () => {
      channel.unsubscribe()
    }
  }, [shareToken, viewerSessionId])

  const loadInitialData = async () => {
    try {
      // Load active viewers
      const viewers = await previewSharingService.getActiveViewers(shareToken)
      
      // Load comments
      const comments = await previewSharingService.getComments(shareToken)
      
      setState(prev => ({
        ...prev,
        viewers,
        comments
      }))
    } catch (error) {
      console.error('Failed to load collaborative data:', error)
    }
  }

  const updateViewersFromPresence = (presence: any) => {
    const viewers = Object.entries(presence).map(([key, data]: [string, any]) => ({
      viewerId: key,
      viewerName: data[0]?.viewer_name || 'Anonymous',
      viewerEmail: data[0]?.viewer_email,
      isAuthenticated: !!data[0]?.is_authenticated,
      joinedAt: data[0]?.online_at,
      lastActivity: new Date().toISOString(),
      cursor: data[0]?.cursor
    }))

    setState(prev => ({ ...prev, viewers }))
  }

  const updateViewerCursor = (viewerId: string, position: { x: number; y: number }) => {
    setState(prev => ({
      ...prev,
      viewers: prev.viewers.map(v => 
        v.viewerId === viewerId 
          ? { ...v, cursor: position }
          : v
      )
    }))
  }

  const handleNewComment = (comment: Comment) => {
    setState(prev => ({
      ...prev,
      comments: [...prev.comments, comment]
    }))

    if (onComment) {
      onComment(comment)
    }

    // Show notification
    toast({
      title: 'New Comment',
      description: `${comment.viewerName}: ${comment.text}`,
    })
  }

  const handleReaction = (payload: any) => {
    toast({
      title: 'Reaction',
      description: `${payload.viewerName} reacted with ${payload.reaction}`,
      duration: 2000,
    })
  }

  const handleNavigation = (payload: any) => {
    // Handle navigation events (e.g., page changes)
    console.log('Navigation event:', payload)
  }

  // Broadcast cursor position
  const broadcastCursor = useCallback((position: { x: number; y: number }) => {
    if (!channelRef.current || !viewerSessionId) return

    channelRef.current.send({
      type: 'broadcast',
      event: 'cursor_move',
      payload: {
        viewerId: viewerSessionId,
        position
      }
    })
  }, [viewerSessionId])

  // Add a comment
  const addComment = useCallback(async (
    text: string,
    timestamp?: number,
    position?: { x: number; y: number }
  ) => {
    if (!state.myPermissions.canComment) {
      toast({
        title: 'Permission Denied',
        description: 'You do not have permission to comment',
        variant: 'destructive'
      })
      return
    }

    try {
      const comment = await previewSharingService.addComment(text, timestamp, position)
      
      // Broadcast to other viewers
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'comment_added',
          payload: comment
        })
      }

      // Update local state
      setState(prev => ({
        ...prev,
        comments: [...prev.comments, comment]
      }))

      return comment
    } catch (error) {
      console.error('Failed to add comment:', error)
      toast({
        title: 'Error',
        description: 'Failed to add comment',
        variant: 'destructive'
      })
      throw error
    }
  }, [state.myPermissions.canComment, toast])

  // Add a reaction
  const addReaction = useCallback(async (
    reactionType: '👍' | '👎' | '❤️' | '🎉' | '😕' | '💡',
    timestamp?: number
  ) => {
    try {
      await previewSharingService.addReaction(reactionType, timestamp)
      
      // Broadcast to other viewers
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'reaction',
          payload: {
            viewerId: viewerSessionId,
            viewerName: 'You',
            reaction: reactionType,
            timestamp
          }
        })
      }
    } catch (error) {
      console.error('Failed to add reaction:', error)
      toast({
        title: 'Error',
        description: 'Failed to add reaction',
        variant: 'destructive'
      })
    }
  }, [viewerSessionId, toast])

  // Broadcast navigation
  const broadcastNavigation = useCallback((navigation: {
    url?: string
    action?: string
    timestamp: number
  }) => {
    if (!channelRef.current || !viewerSessionId) return

    channelRef.current.send({
      type: 'broadcast',
      event: 'navigation',
      payload: {
        viewerId: viewerSessionId,
        ...navigation
      }
    })
  }, [viewerSessionId])

  // Resolve a comment
  const resolveComment = useCallback(async (commentId: string) => {
    try {
      await supabase
        .from('preview_comments')
        .update({ is_resolved: true })
        .eq('id', commentId)

      setState(prev => ({
        ...prev,
        comments: prev.comments.map(c => 
          c.id === commentId ? { ...c, isResolved: true } : c
        )
      }))
    } catch (error) {
      console.error('Failed to resolve comment:', error)
    }
  }, [])

  // Leave the session
  const leave = useCallback(async () => {
    if (channelRef.current) {
      await channelRef.current.untrack()
      channelRef.current.unsubscribe()
      channelRef.current = null
    }

    setState({
      viewers: [],
      comments: [],
      isConnected: false,
      myViewerId: null,
      myPermissions: {
        canComment: true,
        canEdit: false
      }
    })
  }, [])

  return {
    ...state,
    broadcastCursor,
    addComment,
    addReaction,
    broadcastNavigation,
    resolveComment,
    leave,
    refresh: loadInitialData
  }
}