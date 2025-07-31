import { useEffect, useCallback, useRef, useState } from 'react'
import { RealtimeChannel, RealtimePresenceState } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/stores/useAppStore'
import { useFileSystemStore } from '@/stores/useFileSystemStore'
import { usePreviewBuild } from './usePreviewBuild'

interface HotReloadConfig {
  enabled: boolean
  debounceMs?: number
  autoReconnect?: boolean
  maxReconnectAttempts?: number
}

interface HotReloadState {
  isConnected: boolean
  isReloading: boolean
  lastReloadTime: Date | null
  connectedDevices: number
  reloadCount: number
}

interface FileChange {
  path: string
  type: 'create' | 'update' | 'delete'
  content?: string
  timestamp: number
}

export function useHotReload(config: HotReloadConfig = { enabled: true }) {
  const { toast } = useToast()
  const { currentProject } = useAppStore()
  const { files, updateFile } = useFileSystemStore()
  const { buildPreview, isBuilding } = usePreviewBuild()
  
  const [state, setState] = useState<HotReloadState>({
    isConnected: false,
    isReloading: false,
    lastReloadTime: null,
    connectedDevices: 0,
    reloadCount: 0
  })

  const channelRef = useRef<RealtimeChannel | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const reloadDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const fileHashesRef = useRef<Map<string, string>>(new Map())

  const {
    enabled,
    debounceMs = 1000,
    autoReconnect = true,
    maxReconnectAttempts = 5
  } = config

  // Generate file hash for change detection
  const generateFileHash = useCallback((content: string): string => {
    let hash = 0
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36)
  }, [])

  // Detect file changes
  const detectFileChanges = useCallback((): FileChange[] => {
    const changes: FileChange[] = []
    const currentHashes = new Map<string, string>()

    files.forEach(file => {
      if (file.type === 'file' && file.content) {
        const hash = generateFileHash(file.content)
        currentHashes.set(file.path, hash)

        const previousHash = fileHashesRef.current.get(file.path)
        
        if (!previousHash) {
          // New file
          changes.push({
            path: file.path,
            type: 'create',
            content: file.content,
            timestamp: Date.now()
          })
        } else if (previousHash !== hash) {
          // Modified file
          changes.push({
            path: file.path,
            type: 'update',
            content: file.content,
            timestamp: Date.now()
          })
        }
      }
    })

    // Check for deleted files
    fileHashesRef.current.forEach((hash, path) => {
      if (!currentHashes.has(path)) {
        changes.push({
          path,
          type: 'delete',
          timestamp: Date.now()
        })
      }
    })

    fileHashesRef.current = currentHashes
    return changes
  }, [files, generateFileHash])

  // Broadcast file changes
  const broadcastChanges = useCallback(async (changes: FileChange[]) => {
    if (!channelRef.current || changes.length === 0) return

    try {
      await channelRef.current.send({
        type: 'broadcast',
        event: 'file_changes',
        payload: {
          projectId: currentProject?.id,
          changes,
          timestamp: Date.now()
        }
      })
    } catch (error) {
      console.error('Failed to broadcast changes:', error)
    }
  }, [currentProject])

  // Trigger hot reload
  const triggerHotReload = useCallback(async (changes: FileChange[]) => {
    if (isBuilding || state.isReloading) return

    setState(prev => ({ ...prev, isReloading: true }))

    try {
      // Clear existing debounce
      if (reloadDebounceRef.current) {
        clearTimeout(reloadDebounceRef.current)
      }

      // Debounce reload
      reloadDebounceRef.current = setTimeout(async () => {
        // Check if changes affect code files
        const codeChanges = changes.filter(change => 
          change.path.match(/\.(js|jsx|ts|tsx)$/) &&
          !change.path.includes('test') &&
          !change.path.includes('spec')
        )

        if (codeChanges.length === 0) {
          setState(prev => ({ ...prev, isReloading: false }))
          return
        }

        // Broadcast reload event to connected devices
        if (channelRef.current) {
          await channelRef.current.send({
            type: 'broadcast',
            event: 'hot_reload',
            payload: {
              projectId: currentProject?.id,
              changedFiles: codeChanges.map(c => c.path),
              timestamp: Date.now()
            }
          })
        }

        // Rebuild the preview
        const result = await buildPreview({ 
          cache: false, // Skip cache for hot reload
          platform: 'ios' // TODO: Make this configurable
        })

        if (result?.success) {
          setState(prev => ({
            ...prev,
            isReloading: false,
            lastReloadTime: new Date(),
            reloadCount: prev.reloadCount + 1
          }))

          toast({
            title: 'Hot Reload Complete',
            description: `Updated ${codeChanges.length} file${codeChanges.length > 1 ? 's' : ''}`,
          })
        } else {
          setState(prev => ({ ...prev, isReloading: false }))
          
          toast({
            title: 'Hot Reload Failed',
            description: result?.error || 'Failed to rebuild preview',
            variant: 'destructive'
          })
        }
      }, debounceMs)

    } catch (error) {
      console.error('Hot reload error:', error)
      setState(prev => ({ ...prev, isReloading: false }))
      
      toast({
        title: 'Hot Reload Error',
        description: error.message || 'Failed to reload preview',
        variant: 'destructive'
      })
    }
  }, [isBuilding, state.isReloading, currentProject, buildPreview, toast, debounceMs])

  // Setup WebSocket channel
  const setupChannel = useCallback(async () => {
    if (!currentProject?.id || !enabled) return

    try {
      // Clean up existing channel
      if (channelRef.current) {
        await channelRef.current.unsubscribe()
      }

      // Create new channel for project
      const channel = supabase.channel(`hot-reload:${currentProject.id}`, {
        config: {
          broadcast: { self: true },
          presence: { key: currentProject.id }
        }
      })

      // Handle incoming file changes from other clients
      channel.on('broadcast', { event: 'file_changes' }, (payload) => {
        if (payload.payload.projectId === currentProject.id) {
          // Apply remote changes to local file system
          payload.payload.changes.forEach((change: FileChange) => {
            if (change.type === 'update' && change.content) {
              updateFile(change.path, change.content)
            }
          })
        }
      })

      // Handle hot reload events
      channel.on('broadcast', { event: 'hot_reload' }, (payload) => {
        if (payload.payload.projectId === currentProject.id) {
          console.log('Hot reload triggered by remote client')
        }
      })

      // Handle presence updates
      channel.on('presence', { event: 'sync' }, () => {
        const presence = channel.presenceState()
        const deviceCount = Object.keys(presence).length
        setState(prev => ({ ...prev, connectedDevices: deviceCount }))
      })

      // Subscribe and track connection state
      await channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          setState(prev => ({ ...prev, isConnected: true }))
          reconnectAttemptsRef.current = 0
          
          // Track presence
          channel.track({
            user_id: currentProject.user_id,
            online_at: new Date().toISOString()
          })
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          setState(prev => ({ ...prev, isConnected: false }))
          
          // Auto-reconnect logic
          if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
            reconnectAttemptsRef.current++
            setTimeout(() => setupChannel(), 2000 * reconnectAttemptsRef.current)
          }
        }
      })

      channelRef.current = channel

    } catch (error) {
      console.error('Failed to setup hot reload channel:', error)
      setState(prev => ({ ...prev, isConnected: false }))
    }
  }, [currentProject, enabled, autoReconnect, maxReconnectAttempts, updateFile])

  // Monitor file changes
  useEffect(() => {
    if (!enabled || !state.isConnected) return

    const checkInterval = setInterval(() => {
      const changes = detectFileChanges()
      if (changes.length > 0) {
        broadcastChanges(changes)
        triggerHotReload(changes)
      }
    }, 500) // Check every 500ms

    return () => clearInterval(checkInterval)
  }, [enabled, state.isConnected, detectFileChanges, broadcastChanges, triggerHotReload])

  // Setup channel on mount and project change
  useEffect(() => {
    setupChannel()

    return () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe()
        channelRef.current = null
      }
      if (reloadDebounceRef.current) {
        clearTimeout(reloadDebounceRef.current)
      }
    }
  }, [setupChannel])

  // Manual reload trigger
  const manualReload = useCallback(async () => {
    const changes = detectFileChanges()
    await triggerHotReload(changes.length > 0 ? changes : [{
      path: 'manual-reload',
      type: 'update' as const,
      timestamp: Date.now()
    }])
  }, [detectFileChanges, triggerHotReload])

  // Disconnect function
  const disconnect = useCallback(async () => {
    if (channelRef.current) {
      await channelRef.current.unsubscribe()
      channelRef.current = null
      setState(prev => ({ ...prev, isConnected: false }))
    }
  }, [])

  return {
    ...state,
    manualReload,
    disconnect,
    isEnabled: enabled
  }
}