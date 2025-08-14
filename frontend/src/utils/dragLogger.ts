/**
 * Enhanced drag and drop logging system
 * Provides comprehensive debugging and monitoring capabilities
 */

const DEBUG_MODE = process.env.NODE_ENV === 'development'
const ENABLE_CONSOLE_LOGGING = DEBUG_MODE
const ENABLE_PERFORMANCE_TRACKING = DEBUG_MODE

interface DragEvent {
  type: 'start' | 'over' | 'drop' | 'end' | 'error'
  dragType: 'section' | 'content' | 'unknown'
  sourceId: string
  targetId?: string
  timestamp: number
  context?: any
  duration?: number
  success?: boolean
}

class DragLogger {
  private events: DragEvent[] = []
  private startTimes: Map<string, number> = new Map()
  private maxEvents = 100 // Keep last 100 events

  private addEvent(event: DragEvent) {
    this.events.push(event)
    
    // Keep only recent events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents)
    }
    
    if (ENABLE_CONSOLE_LOGGING) {
      this.logToConsole(event)
    }
  }

  private logToConsole(event: DragEvent) {
    const emoji = {
      start: '🎯',
      over: '🎪',
      drop: '📍',
      end: '🏁',
      error: '❌'
    }[event.type]

    const color = {
      section: '#3b82f6',
      content: '#6366f1',
      unknown: '#6b7280'
    }[event.dragType]

    console.log(
      `%c${emoji} Drag ${event.type}: ${event.dragType} - ${event.sourceId}${event.targetId ? ` → ${event.targetId}` : ''}`,
      `color: ${color}; font-weight: bold;`,
      event.context || ''
    )
  }

  start(dragType: 'section' | 'content' | 'unknown', sourceId: string, context?: any) {
    if (!DEBUG_MODE) return

    const timestamp = Date.now()
    this.startTimes.set(`${dragType}-${sourceId}`, timestamp)
    
    this.addEvent({
      type: 'start',
      dragType,
      sourceId,
      timestamp,
      context
    })
  }

  over(dragType: 'section' | 'content' | 'unknown', targetId: string, valid: boolean, context?: any) {
    if (!DEBUG_MODE) return

    this.addEvent({
      type: 'over',
      dragType,
      sourceId: 'unknown',
      targetId,
      timestamp: Date.now(),
      context: { valid, ...context }
    })
  }

  drop(dragType: 'section' | 'content' | 'unknown', sourceId: string, targetId: string, context?: any) {
    if (!DEBUG_MODE) return

    this.addEvent({
      type: 'drop',
      dragType,
      sourceId,
      targetId,
      timestamp: Date.now(),
      context,
      success: true
    })
  }

  end(dragType: 'section' | 'content' | 'unknown', sourceId: string, successful: boolean, context?: any) {
    if (!DEBUG_MODE) return

    const key = `${dragType}-${sourceId}`
    const startTime = this.startTimes.get(key)
    const duration = startTime ? Date.now() - startTime : undefined
    
    this.addEvent({
      type: 'end',
      dragType,
      sourceId,
      timestamp: Date.now(),
      duration,
      success: successful,
      context
    })

    this.startTimes.delete(key)
    
    if (ENABLE_PERFORMANCE_TRACKING && duration) {
      this.trackPerformance(dragType, duration, successful)
    }
  }

  error(message: string, context?: any) {
    if (!DEBUG_MODE) return

    this.addEvent({
      type: 'error',
      dragType: 'unknown',
      sourceId: 'error',
      timestamp: Date.now(),
      context: { message, ...context }
    })

    console.error('🚨 Drag Error:', message, context)
  }

  private trackPerformance(dragType: string, duration: number, successful: boolean) {
    const perfData = {
      dragType,
      duration,
      successful,
      timestamp: Date.now()
    }

    console.log(
      `⏱️ Drag Performance: ${dragType} took ${duration}ms (${successful ? 'success' : 'failed'})`,
      perfData
    )

    // Could send to analytics service here
    if (duration > 5000) {
      console.warn('⚠️ Slow drag operation detected:', perfData)
    }
  }

  // Debug utilities
  getRecentEvents(count = 10): DragEvent[] {
    return this.events.slice(-count)
  }

  getEventsByType(type: DragEvent['type']): DragEvent[] {
    return this.events.filter(event => event.type === type)
  }

  getEventsByDragType(dragType: DragEvent['dragType']): DragEvent[] {
    return this.events.filter(event => event.dragType === dragType)
  }

  getPerformanceStats() {
    const dragEnds = this.events.filter(e => e.type === 'end' && e.duration)
    
    if (dragEnds.length === 0) {
      return { message: 'No completed drag operations recorded' }
    }

    const durations = dragEnds.map(e => e.duration!).filter(d => d > 0)
    const successful = dragEnds.filter(e => e.success).length
    
    return {
      totalOperations: dragEnds.length,
      successfulOperations: successful,
      successRate: `${((successful / dragEnds.length) * 100).toFixed(1)}%`,
      averageDuration: `${(durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(0)}ms`,
      minDuration: `${Math.min(...durations)}ms`,
      maxDuration: `${Math.max(...durations)}ms`
    }
  }

  dumpEventLog() {
    if (!DEBUG_MODE) {
      console.log('Debug mode is disabled')
      return
    }

    console.group('🔍 Drag & Drop Event Log')
    console.table(this.events.map(event => ({
      Time: new Date(event.timestamp).toLocaleTimeString(),
      Type: event.type,
      DragType: event.dragType,
      Source: event.sourceId,
      Target: event.targetId || '-',
      Duration: event.duration ? `${event.duration}ms` : '-',
      Success: event.success ?? '-'
    })))
    console.log('Performance Stats:', this.getPerformanceStats())
    console.groupEnd()
  }

  clearLog() {
    this.events = []
    this.startTimes.clear()
    console.log('🧹 Drag event log cleared')
  }

  // Validation utilities
  validateState(expectedType: 'none' | 'section' | 'content', actualState: any) {
    const isValid = actualState.type === expectedType
    
    if (!isValid) {
      this.error('State validation failed', {
        expected: expectedType,
        actual: actualState.type,
        fullState: actualState
      })
    }
    
    return isValid
  }

  monitorLongRunningDrags(warningThreshold = 10000, errorThreshold = 30000) {
    if (!DEBUG_MODE) return

    this.startTimes.forEach((startTime, key) => {
      const duration = Date.now() - startTime
      
      if (duration > errorThreshold) {
        this.error('Long-running drag operation detected', {
          key,
          duration: `${duration}ms`,
          threshold: 'error'
        })
      } else if (duration > warningThreshold) {
        console.warn(`⏳ Long drag operation: ${key} running for ${duration}ms`)
      }
    })
  }
}

// Global logger instance
export const dragLogger = new DragLogger()

// Auto-monitor long-running drags in development
if (DEBUG_MODE) {
  setInterval(() => {
    dragLogger.monitorLongRunningDrags()
  }, 5000)
}

// Expose to window for debugging
if (DEBUG_MODE && typeof window !== 'undefined') {
  (window as any).dragLogger = dragLogger
}

export default dragLogger