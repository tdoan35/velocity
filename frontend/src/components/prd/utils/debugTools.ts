import { type PRDSection } from '../hooks/usePRDSections'
import { type JSONContent } from '@tiptap/react'

// Debug log levels
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Debug event types
export type DebugEventType = 
  | 'CONTENT_UPDATE'
  | 'SECTION_SAVE'
  | 'SECTION_LOAD'
  | 'DUPLICATE_DETECTED'
  | 'DUPLICATE_FIXED'
  | 'VALIDATION_ERROR'
  | 'VALIDATION_WARNING'
  | 'TRANSACTION_START'
  | 'TRANSACTION_COMMIT'
  | 'TRANSACTION_ROLLBACK'
  | 'EDITOR_INIT'
  | 'EDITOR_DESTROY'
  | 'STATE_CHANGE'
  | 'ERROR'

// Debug event
export interface DebugEvent {
  timestamp: number
  type: DebugEventType
  level: LogLevel
  message: string
  data?: any
  stackTrace?: string
}

// Debug configuration
export interface DebugConfig {
  enabled: boolean
  logLevel: LogLevel
  logToConsole: boolean
  logToStorage: boolean
  maxLogSize: number
  includeStackTrace: boolean
  highlightDuplicates: boolean
  showPerformanceMetrics: boolean
}

// Performance metrics
export interface PerformanceMetrics {
  renderTime: number
  saveTime: number
  loadTime: number
  validationTime: number
  editorInitTime: number
  memoryUsage?: number
}

// PRD Debug Tools class
export class PRDDebugTools {
  private config: DebugConfig
  private eventLog: DebugEvent[]
  private performanceMetrics: Map<string, PerformanceMetrics>
  private duplicateTracker: Map<string, number>
  private enabled: boolean
  
  constructor(config: Partial<DebugConfig> = {}) {
    this.config = {
      enabled: true,
      logLevel: LogLevel.INFO,
      logToConsole: true,
      logToStorage: true,
      maxLogSize: 500,
      includeStackTrace: false,
      highlightDuplicates: true,
      showPerformanceMetrics: true,
      ...config
    }
    
    this.eventLog = []
    this.performanceMetrics = new Map()
    this.duplicateTracker = new Map()
    this.enabled = this.config.enabled
    
    // Load existing logs from storage if available
    if (this.config.logToStorage) {
      this.loadLogsFromStorage()
    }
    
    // Add global error handler
    if (this.enabled) {
      this.setupGlobalErrorHandler()
    }
  }
  
  // Log event
  log(
    type: DebugEventType,
    level: LogLevel,
    message: string,
    data?: any
  ): void {
    if (!this.enabled || level < this.config.logLevel) {
      return
    }
    
    const event: DebugEvent = {
      timestamp: Date.now(),
      type,
      level,
      message,
      data
    }
    
    // Add stack trace if configured
    if (this.config.includeStackTrace && level >= LogLevel.WARN) {
      event.stackTrace = new Error().stack
    }
    
    // Add to event log
    this.eventLog.push(event)
    
    // Trim log if exceeds max size
    if (this.eventLog.length > this.config.maxLogSize) {
      this.eventLog = this.eventLog.slice(-this.config.maxLogSize)
    }
    
    // Log to console if configured
    if (this.config.logToConsole) {
      this.logToConsole(event)
    }
    
    // Save to storage if configured
    if (this.config.logToStorage) {
      this.saveLogsToStorage()
    }
  }
  
  // Log to console with formatting
  private logToConsole(event: DebugEvent): void {
    const timestamp = new Date(event.timestamp).toISOString()
    const levelName = LogLevel[event.level]
    const prefix = `[PRD-DEBUG] [${timestamp}] [${levelName}] [${event.type}]`
    
    const style = this.getConsoleStyle(event.level)
    
    console.log(`%c${prefix} ${event.message}`, style)
    
    if (event.data) {
      console.log('Data:', event.data)
    }
    
    if (event.stackTrace) {
      console.log('Stack:', event.stackTrace)
    }
  }
  
  // Get console style based on log level
  private getConsoleStyle(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'color: #888; font-size: 11px;'
      case LogLevel.INFO:
        return 'color: #4CAF50; font-weight: bold;'
      case LogLevel.WARN:
        return 'color: #FF9800; font-weight: bold;'
      case LogLevel.ERROR:
        return 'color: #F44336; font-weight: bold; font-size: 13px;'
      default:
        return ''
    }
  }
  
  // Track duplicate sections
  trackDuplicate(sectionId: string): void {
    if (!this.enabled || !this.config.highlightDuplicates) {
      return
    }
    
    const count = this.duplicateTracker.get(sectionId) || 0
    this.duplicateTracker.set(sectionId, count + 1)
    
    if (count > 0) {
      this.log(
        'DUPLICATE_DETECTED',
        LogLevel.WARN,
        `Duplicate section detected: ${sectionId} (count: ${count + 1})`,
        { sectionId, count: count + 1 }
      )
    }
  }
  
  // Clear duplicate tracker
  clearDuplicateTracker(): void {
    this.duplicateTracker.clear()
  }
  
  // Start performance measurement
  startMeasure(label: string): void {
    if (!this.enabled || !this.config.showPerformanceMetrics) {
      return
    }
    
    performance.mark(`${label}-start`)
  }
  
  // End performance measurement
  endMeasure(label: string): number {
    if (!this.enabled || !this.config.showPerformanceMetrics) {
      return 0
    }
    
    performance.mark(`${label}-end`)
    performance.measure(label, `${label}-start`, `${label}-end`)
    
    const measure = performance.getEntriesByName(label)[0]
    const duration = measure ? measure.duration : 0
    
    // Clean up marks and measures
    performance.clearMarks(`${label}-start`)
    performance.clearMarks(`${label}-end`)
    performance.clearMeasures(label)
    
    return duration
  }
  
  // Track editor initialization
  trackEditorInit(duration: number): void {
    const metrics = this.performanceMetrics.get('editor') || {} as PerformanceMetrics
    metrics.editorInitTime = duration
    this.performanceMetrics.set('editor', metrics)
    
    this.log(
      'EDITOR_INIT',
      LogLevel.INFO,
      `Editor initialized in ${duration.toFixed(2)}ms`,
      { duration }
    )
  }
  
  // Track save operation
  trackSave(duration: number, sectionCount: number): void {
    const metrics = this.performanceMetrics.get('save') || {} as PerformanceMetrics
    metrics.saveTime = duration
    this.performanceMetrics.set('save', metrics)
    
    this.log(
      'SECTION_SAVE',
      LogLevel.INFO,
      `Saved ${sectionCount} sections in ${duration.toFixed(2)}ms`,
      { duration, sectionCount }
    )
  }
  
  // Track load operation
  trackLoad(duration: number, sectionCount: number): void {
    const metrics = this.performanceMetrics.get('load') || {} as PerformanceMetrics
    metrics.loadTime = duration
    this.performanceMetrics.set('load', metrics)
    
    this.log(
      'SECTION_LOAD',
      LogLevel.INFO,
      `Loaded ${sectionCount} sections in ${duration.toFixed(2)}ms`,
      { duration, sectionCount }
    )
  }
  
  // Analyze sections for issues
  analyzeSections(sections: PRDSection[]): {
    duplicates: string[]
    emptyContent: string[]
    invalidOrder: string[]
    missingIds: string[]
    statistics: {
      totalSections: number
      completedSections: number
      averageContentLength: number
      totalContentSize: number
    }
  } {
    const duplicates: string[] = []
    const emptyContent: string[] = []
    const invalidOrder: string[] = []
    const missingIds: string[] = []
    
    const seenIds = new Set<string>()
    const seenOrders = new Set<number>()
    let totalContentLength = 0
    let completedCount = 0
    
    sections.forEach((section, index) => {
      // Check for duplicate IDs
      if (seenIds.has(section.id)) {
        duplicates.push(section.id)
      }
      seenIds.add(section.id)
      
      // Check for missing IDs
      if (!section.id) {
        missingIds.push(`Section at index ${index}`)
      }
      
      // Check for empty content
      if (!section.content || !section.content.content || section.content.content.length === 0) {
        emptyContent.push(section.id || `Section at index ${index}`)
      }
      
      // Check for invalid order
      if (section.order < 1 || seenOrders.has(section.order)) {
        invalidOrder.push(section.id || `Section at index ${index}`)
      }
      seenOrders.add(section.order)
      
      // Calculate statistics
      const contentStr = JSON.stringify(section.content)
      totalContentLength += contentStr.length
      
      if (section.status === 'completed') {
        completedCount++
      }
    })
    
    return {
      duplicates,
      emptyContent,
      invalidOrder,
      missingIds,
      statistics: {
        totalSections: sections.length,
        completedSections: completedCount,
        averageContentLength: sections.length > 0 ? Math.round(totalContentLength / sections.length) : 0,
        totalContentSize: totalContentLength
      }
    }
  }
  
  // Analyze editor content for duplicates
  analyzeEditorContent(html: string): {
    duplicateHeaders: string[]
    duplicateSections: string[]
    emptyDivs: number
    totalElements: number
  } {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    
    const duplicateHeaders: string[] = []
    const duplicateSections: string[] = []
    
    // Check for duplicate headers
    const headers = Array.from(doc.querySelectorAll('h1, h2, h3'))
    const seenHeaders = new Set<string>()
    
    headers.forEach(header => {
      const text = header.textContent?.trim() || ''
      if (seenHeaders.has(text)) {
        duplicateHeaders.push(text)
      }
      seenHeaders.add(text)
    })
    
    // Check for duplicate section IDs
    const sections = Array.from(doc.querySelectorAll('[data-section-id]'))
    const seenSectionIds = new Set<string>()
    
    sections.forEach(section => {
      const id = section.getAttribute('data-section-id') || ''
      if (seenSectionIds.has(id)) {
        duplicateSections.push(id)
      }
      seenSectionIds.add(id)
    })
    
    // Count empty divs
    const emptyDivs = Array.from(doc.querySelectorAll('div')).filter(div => {
      const content = div.textContent?.trim() || ''
      return content === '' && div.children.length === 0
    }).length
    
    return {
      duplicateHeaders,
      duplicateSections,
      emptyDivs,
      totalElements: doc.body.querySelectorAll('*').length
    }
  }
  
  // Export debug data
  exportDebugData(): {
    config: DebugConfig
    eventLog: DebugEvent[]
    performanceMetrics: Record<string, PerformanceMetrics>
    duplicateTracker: Record<string, number>
    timestamp: number
  } {
    return {
      config: this.config,
      eventLog: this.eventLog,
      performanceMetrics: Object.fromEntries(this.performanceMetrics),
      duplicateTracker: Object.fromEntries(this.duplicateTracker),
      timestamp: Date.now()
    }
  }
  
  // Import debug data
  importDebugData(data: ReturnType<typeof this.exportDebugData>): void {
    this.eventLog = data.eventLog
    this.performanceMetrics = new Map(Object.entries(data.performanceMetrics))
    this.duplicateTracker = new Map(Object.entries(data.duplicateTracker))
  }
  
  // Clear all debug data
  clearDebugData(): void {
    this.eventLog = []
    this.performanceMetrics.clear()
    this.duplicateTracker.clear()
    
    if (this.config.logToStorage) {
      this.clearStorageLogs()
    }
  }
  
  // Save logs to local storage
  private saveLogsToStorage(): void {
    try {
      const data = JSON.stringify(this.eventLog)
      localStorage.setItem('prd-debug-logs', data)
    } catch (error) {
      console.error('Failed to save debug logs to storage:', error)
    }
  }
  
  // Load logs from local storage
  private loadLogsFromStorage(): void {
    try {
      const data = localStorage.getItem('prd-debug-logs')
      if (data) {
        this.eventLog = JSON.parse(data)
      }
    } catch (error) {
      console.error('Failed to load debug logs from storage:', error)
    }
  }
  
  // Clear storage logs
  private clearStorageLogs(): void {
    try {
      localStorage.removeItem('prd-debug-logs')
    } catch (error) {
      console.error('Failed to clear debug logs from storage:', error)
    }
  }
  
  // Setup global error handler
  private setupGlobalErrorHandler(): void {
    window.addEventListener('error', (event) => {
      this.log(
        'ERROR',
        LogLevel.ERROR,
        `Global error: ${event.message}`,
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error
        }
      )
    })
    
    window.addEventListener('unhandledrejection', (event) => {
      this.log(
        'ERROR',
        LogLevel.ERROR,
        `Unhandled promise rejection: ${event.reason}`,
        { reason: event.reason }
      )
    })
  }
  
  // Get event log
  getEventLog(filter?: {
    type?: DebugEventType
    level?: LogLevel
    startTime?: number
    endTime?: number
  }): DebugEvent[] {
    let log = [...this.eventLog]
    
    if (filter) {
      if (filter.type) {
        log = log.filter(e => e.type === filter.type)
      }
      if (filter.level !== undefined) {
        log = log.filter(e => e.level >= filter.level)
      }
      if (filter.startTime) {
        log = log.filter(e => e.timestamp >= filter.startTime)
      }
      if (filter.endTime) {
        log = log.filter(e => e.timestamp <= filter.endTime)
      }
    }
    
    return log
  }
  
  // Get performance summary
  getPerformanceSummary(): Record<string, PerformanceMetrics> {
    return Object.fromEntries(this.performanceMetrics)
  }
  
  // Enable/disable debugging
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    this.config.enabled = enabled
  }
  
  // Update log level
  setLogLevel(level: LogLevel): void {
    this.config.logLevel = level
  }
}