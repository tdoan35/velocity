import { useEffect, useRef, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'
import { sessionPoolService } from '@/services/sessionPoolService'

interface UseSessionTimeoutOptions {
  sessionId: string | null
  timeoutMinutes?: number
  warningMinutes?: number
  onTimeout?: () => void
  onWarning?: () => void
  enabled?: boolean
}

export function useSessionTimeout({
  sessionId,
  timeoutMinutes = 30,
  warningMinutes = 5,
  onTimeout,
  onWarning,
  enabled = true
}: UseSessionTimeoutOptions) {
  const { toast } = useToast()
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const warningRef = useRef<NodeJS.Timeout | null>(null)
  const lastActivityRef = useRef<Date>(new Date())
  const hasWarnedRef = useRef(false)

  // Reset activity timer
  const resetActivity = useCallback(() => {
    lastActivityRef.current = new Date()
    hasWarnedRef.current = false
    
    // Clear existing timeouts
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (warningRef.current) clearTimeout(warningRef.current)
    
    if (!enabled || !sessionId) return

    // Set warning timeout
    const warningMs = (timeoutMinutes - warningMinutes) * 60 * 1000
    warningRef.current = setTimeout(() => {
      if (!hasWarnedRef.current) {
        hasWarnedRef.current = true
        
        toast({
          title: 'Session Timeout Warning',
          description: `Your preview session will expire in ${warningMinutes} minutes due to inactivity.`,
          variant: 'default',
          duration: 10000,
        })
        
        if (onWarning) onWarning()
      }
    }, warningMs)

    // Set final timeout
    const timeoutMs = timeoutMinutes * 60 * 1000
    timeoutRef.current = setTimeout(async () => {
      toast({
        title: 'Session Expired',
        description: 'Your preview session has been terminated due to inactivity.',
        variant: 'destructive',
      })
      
      // Release session
      if (sessionId) {
        try {
          await sessionPoolService.releaseSession(sessionId)
        } catch (error) {
          console.error('Failed to release timed out session:', error)
        }
      }
      
      if (onTimeout) onTimeout()
    }, timeoutMs)
  }, [enabled, sessionId, timeoutMinutes, warningMinutes, toast, onTimeout, onWarning])

  // Monitor user activity
  useEffect(() => {
    if (!enabled || !sessionId) return

    const handleActivity = () => {
      const now = new Date()
      const timeSinceLastActivity = now.getTime() - lastActivityRef.current.getTime()
      
      // Only reset if more than 1 minute since last activity
      if (timeSinceLastActivity > 60000) {
        resetActivity()
      }
    }

    // Listen for user activity
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach(event => {
      document.addEventListener(event, handleActivity)
    })

    // Start timeout tracking
    resetActivity()

    return () => {
      // Clean up
      events.forEach(event => {
        document.removeEventListener(event, handleActivity)
      })
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (warningRef.current) clearTimeout(warningRef.current)
    }
  }, [enabled, sessionId, resetActivity])

  // Extend session manually
  const extendSession = useCallback(() => {
    resetActivity()
    
    toast({
      title: 'Session Extended',
      description: `Your session has been extended for another ${timeoutMinutes} minutes.`,
    })
  }, [resetActivity, timeoutMinutes, toast])

  // Get remaining time
  const getRemainingTime = useCallback(() => {
    const now = new Date()
    const elapsed = now.getTime() - lastActivityRef.current.getTime()
    const remaining = (timeoutMinutes * 60 * 1000) - elapsed
    
    return Math.max(0, Math.floor(remaining / 1000)) // Return seconds
  }, [timeoutMinutes])

  return {
    extendSession,
    getRemainingTime,
    resetActivity,
    isWarned: hasWarnedRef.current
  }
}