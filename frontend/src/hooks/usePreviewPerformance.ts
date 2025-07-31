import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ui/use-toast'
import { performanceMonitor, markPerformance, measurePerformance } from '@/utils/performance'

interface PerformanceMetrics {
  averageStartupTime: number
  averageBuildTime: number
  averageHotReloadTime: number
  sessionAllocationTime: number
  cacheHitRate: number
  optimizationImpact: number
  totalSessions: number
}

interface PerformanceTrend {
  hour: string
  average: number
  count: number
}

interface OptimizationConfig {
  enableSessionWarming: boolean
  warmingPoolSize: number
  preloadThreshold: number
  adaptiveQuality: boolean
  cacheStrategy: 'aggressive' | 'balanced' | 'minimal'
}

interface UsePreviewPerformanceOptions {
  projectId?: string
  autoWarm?: boolean
  reportInterval?: number // milliseconds
}

export function usePreviewPerformance(options: UsePreviewPerformanceOptions = {}) {
  const { projectId, autoWarm = true, reportInterval = 60000 } = options // Default 1 minute
  
  const [metrics, setMetrics] = useState<PerformanceMetrics | null>(null)
  const [trends, setTrends] = useState<PerformanceTrend[]>([])
  const [recommendations, setRecommendations] = useState<string[]>([])
  const [optimizationConfig, setOptimizationConfig] = useState<OptimizationConfig | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  
  const { toast } = useToast()
  const metricsBuffer = useRef<any[]>([])
  const reportTimer = useRef<NodeJS.Timeout | null>(null)
  const warmingTimer = useRef<NodeJS.Timeout | null>(null)
  
  // Fetch performance metrics
  const fetchMetrics = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('preview-optimizer/performance-metrics', {
        body: {
          project_id: projectId,
          time_range: '24h'
        }
      })
      
      if (error) throw error
      
      setMetrics(data.metrics)
      setTrends(data.trends || [])
      setRecommendations(data.recommendations || [])
      
    } catch (error) {
      console.error('Failed to fetch performance metrics:', error)
    }
  }, [projectId])
  
  // Fetch optimization config
  const fetchOptimizationConfig = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('preview-optimizer/optimization-config')
      
      if (error) throw error
      
      setOptimizationConfig(data)
      
    } catch (error) {
      console.error('Failed to fetch optimization config:', error)
    }
  }, [])
  
  // Record a performance metric
  const recordMetric = useCallback((
    metricType: string,
    value: number,
    metadata?: Record<string, any>
  ) => {
    const metric = {
      project_id: projectId,
      metric_type: metricType,
      value,
      metadata: metadata || {},
      timestamp: new Date().toISOString()
    }
    
    metricsBuffer.current.push(metric)
    
    // Report immediately if buffer is getting large
    if (metricsBuffer.current.length >= 10) {
      reportMetrics()
    }
  }, [projectId])
  
  // Report buffered metrics
  const reportMetrics = useCallback(async () => {
    if (metricsBuffer.current.length === 0) return
    
    const metrics = [...metricsBuffer.current]
    metricsBuffer.current = []
    
    try {
      const { error } = await supabase.functions.invoke('performance-monitor/report', {
        body: {
          project_id: projectId,
          metrics
        }
      })
      
      if (error) throw error
      
    } catch (error) {
      console.error('Failed to report metrics:', error)
      // Put metrics back in buffer for retry
      metricsBuffer.current.unshift(...metrics)
    }
  }, [projectId])
  
  // Measure preview startup time
  const measureStartupTime = useCallback((startMark: string, endMark: string) => {
    markPerformance(startMark)
    
    return () => {
      markPerformance(endMark)
      
      try {
        const measure = performance.measure('preview-startup', startMark, endMark)
        recordMetric('preview_startup', measure.duration)
        
        // Check if startup time is anomalous
        if (metrics && measure.duration > metrics.averageStartupTime * 2) {
          toast({
            title: 'Slow Preview Startup',
            description: `Startup took ${Math.round(measure.duration)}ms (2x average)`,
            variant: 'destructive'
          })
        }
      } catch (error) {
        console.error('Failed to measure startup time:', error)
      }
    }
  }, [recordMetric, metrics, toast])
  
  // Warm preview sessions
  const warmSessions = useCallback(async (deviceTypes?: string[]) => {
    if (!optimizationConfig?.enableSessionWarming) return
    
    try {
      const { data, error } = await supabase.functions.invoke('preview-optimizer/warm-sessions', {
        body: {
          action: 'warm',
          projectId,
          deviceTypes,
          priority: 'high'
        }
      })
      
      if (error) throw error
      
      if (data.success) {
        console.log(`Warmed ${data.warmedSessions} sessions in ${data.duration}ms`)
      }
      
    } catch (error) {
      console.error('Failed to warm sessions:', error)
    }
  }, [projectId, optimizationConfig])
  
  // Optimize build process
  const optimizeBuild = useCallback(async () => {
    if (!projectId || isOptimizing) return
    
    setIsOptimizing(true)
    
    try {
      const { data, error } = await supabase.functions.invoke('preview-optimizer/optimize-build', {
        body: { projectId }
      })
      
      if (error) throw error
      
      if (data.success) {
        toast({
          title: 'Build Optimized',
          description: `Estimated ${data.estimatedSpeedup}% performance improvement`
        })
        
        // Refresh metrics to see impact
        await fetchMetrics()
      }
      
    } catch (error) {
      console.error('Failed to optimize build:', error)
      toast({
        title: 'Optimization Failed',
        description: 'Could not optimize build process',
        variant: 'destructive'
      })
    } finally {
      setIsOptimizing(false)
    }
  }, [projectId, isOptimizing, fetchMetrics, toast])
  
  // Update optimization config
  const updateOptimizationConfig = useCallback(async (
    updates: Partial<OptimizationConfig>
  ) => {
    try {
      const { data, error } = await supabase.functions.invoke('preview-optimizer/optimization-config', {
        method: 'PUT',
        body: updates
      })
      
      if (error) throw error
      
      if (data.success) {
        setOptimizationConfig(data.config)
        toast({
          title: 'Settings Updated',
          description: 'Optimization settings have been updated'
        })
      }
      
    } catch (error) {
      console.error('Failed to update optimization config:', error)
      toast({
        title: 'Update Failed',
        description: 'Could not update optimization settings',
        variant: 'destructive'
      })
    }
  }, [toast])
  
  // Adjust quality based on network
  const adjustQuality = useCallback(async (sessionId: string, networkQuality: string) => {
    if (!optimizationConfig?.adaptiveQuality) return
    
    try {
      const { data, error } = await supabase.functions.invoke('preview-optimizer/adaptive-quality', {
        body: {
          sessionId,
          networkQuality
        }
      })
      
      if (error) throw error
      
      if (data.success) {
        console.log(`Adjusted quality to ${networkQuality} profile`)
      }
      
    } catch (error) {
      console.error('Failed to adjust quality:', error)
    }
  }, [optimizationConfig])
  
  // Network quality detection
  const detectNetworkQuality = useCallback((): string => {
    const connection = (navigator as any).connection
    
    if (!connection) return 'good'
    
    const downlink = connection.downlink || 10 // Mbps
    const rtt = connection.rtt || 50 // ms
    
    if (downlink >= 10 && rtt <= 50) return 'excellent'
    if (downlink >= 5 && rtt <= 100) return 'good'
    if (downlink >= 2 && rtt <= 200) return 'fair'
    return 'poor'
  }, [])
  
  // Initialize performance monitoring
  useEffect(() => {
    fetchMetrics()
    fetchOptimizationConfig()
    
    // Set up periodic metric reporting
    reportTimer.current = setInterval(reportMetrics, reportInterval)
    
    // Set up session warming if enabled
    if (autoWarm) {
      warmingTimer.current = setInterval(() => {
        warmSessions()
      }, 5 * 60 * 1000) // Every 5 minutes
      
      // Initial warming
      warmSessions()
    }
    
    // Clean up on unmount
    return () => {
      if (reportTimer.current) {
        clearInterval(reportTimer.current)
      }
      if (warmingTimer.current) {
        clearInterval(warmingTimer.current)
      }
      // Report any remaining metrics
      reportMetrics()
    }
  }, [fetchMetrics, fetchOptimizationConfig, reportMetrics, autoWarm, warmSessions, reportInterval])
  
  return {
    // State
    metrics,
    trends,
    recommendations,
    optimizationConfig,
    isOptimizing,
    
    // Actions
    recordMetric,
    measureStartupTime,
    warmSessions,
    optimizeBuild,
    updateOptimizationConfig,
    adjustQuality,
    detectNetworkQuality,
    
    // Utilities
    refresh: fetchMetrics
  }
}