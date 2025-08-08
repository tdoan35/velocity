// Performance monitoring utilities

import { config } from '@/config/env'

interface PerformanceMetric {
  name: string
  value: number
  rating: 'good' | 'needs-improvement' | 'poor'
  timestamp: number
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = []
  private observer: PerformanceObserver | null = null

  constructor() {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      this.initializeObserver()
    }
  }

  private initializeObserver() {
    // Observe various performance metrics
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.processEntry(entry)
      }
    })

    // Observe different entry types
    try {
      this.observer.observe({ entryTypes: ['paint', 'largest-contentful-paint'] })
    } catch (e) {
      // Fallback for browsers that don't support all entry types
      this.observer?.observe({ entryTypes: ['paint'] })
    }
  }

  private processEntry(entry: PerformanceEntry) {
    let rating: 'good' | 'needs-improvement' | 'poor' = 'good'
    
    // Define thresholds based on Web Vitals
    switch (entry.name) {
      case 'first-paint':
      case 'first-contentful-paint':
        rating = entry.startTime < 1800 ? 'good' : 
                 entry.startTime < 3000 ? 'needs-improvement' : 'poor'
        break
      case 'largest-contentful-paint':
        rating = entry.startTime < 2500 ? 'good' : 
                 entry.startTime < 4000 ? 'needs-improvement' : 'poor'
        break
    }

    const metric: PerformanceMetric = {
      name: entry.name,
      value: Math.round(entry.startTime),
      rating,
      timestamp: Date.now(),
    }

    this.metrics.push(metric)
    this.reportMetric(metric)
  }

  private reportMetric(metric: PerformanceMetric) {
    // Log in development
    if (config.isDevelopment) {
      const emoji = metric.rating === 'good' ? '✅' : 
                    metric.rating === 'needs-improvement' ? '⚠️' : '❌'
      console.log(`${emoji} ${metric.name}: ${metric.value}ms (${metric.rating})`)
    }

    // Send to analytics if enabled
    if (config.enableAnalytics && window.gtag) {
      window.gtag('event', 'timing_complete', {
        name: metric.name,
        value: metric.value,
        metric_rating: metric.rating,
      })
    }
  }

  // Get Core Web Vitals
  getCoreWebVitals() {
    return {
      FCP: this.getMetric('first-contentful-paint'),
      LCP: this.getMetric('largest-contentful-paint'),
      FID: this.getMetric('first-input-delay'),
      CLS: this.getMetric('cumulative-layout-shift'),
      TTFB: this.getMetric('time-to-first-byte'),
    }
  }

  // Get specific metric
  getMetric(name: string): PerformanceMetric | undefined {
    return this.metrics.find(m => m.name === name)
  }

  // Get all metrics
  getAllMetrics(): PerformanceMetric[] {
    return [...this.metrics]
  }

  // Measure custom timing
  measureTiming(name: string, startMark: string, endMark: string) {
    if (typeof performance.mark === 'function' && typeof performance.measure === 'function') {
      try {
        performance.measure(name, startMark, endMark)
        const measures = performance.getEntriesByName(name, 'measure')
        const measure = measures[measures.length - 1]
        
        if (measure) {
          const metric: PerformanceMetric = {
            name,
            value: Math.round(measure.duration),
            rating: measure.duration < 1000 ? 'good' : 
                   measure.duration < 3000 ? 'needs-improvement' : 'poor',
            timestamp: Date.now(),
          }
          
          this.metrics.push(metric)
          this.reportMetric(metric)
        }
      } catch (e) {
        console.error('Performance measurement error:', e)
      }
    }
  }

  // Clean up
  destroy() {
    this.observer?.disconnect()
    this.metrics = []
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor()

// Utility functions for marking performance points
export function markPerformance(name: string) {
  if (performance.mark) {
    performance.mark(name)
  }
}

export function measurePerformance(name: string, startMark: string, endMark: string) {
  performanceMonitor.measureTiming(name, startMark, endMark)
}

// React component performance helper
export function measureComponentPerformance(componentName: string) {
  const startMark = `${componentName}-start`
  const endMark = `${componentName}-end`
  
  return {
    start: () => markPerformance(startMark),
    end: () => {
      markPerformance(endMark)
      measurePerformance(`${componentName}-render`, startMark, endMark)
    },
  }
}

// Lazy loading performance helper
export function measureLazyLoad(chunkName: string) {
  const startMark = `lazy-${chunkName}-start`
  markPerformance(startMark)
  
  return () => {
    const endMark = `lazy-${chunkName}-end`
    markPerformance(endMark)
    measurePerformance(`lazy-load-${chunkName}`, startMark, endMark)
  }
}

// Report Web Vitals
export function reportWebVitals(metric: any) {
  const { name, value, rating } = metric
  
  const _formattedMetric: PerformanceMetric = {
    name,
    value: Math.round(value),
    rating: rating || 'needs-improvement',
    timestamp: Date.now(),
  }
  
  // Log in development
  if (config.isDevelopment) {
    console.log(`📊 Web Vital - ${name}: ${value} (${rating})`)
  }
  
  // Send to analytics
  if (config.enableAnalytics && window.gtag) {
    window.gtag('event', name, {
      value: Math.round(value),
      metric_rating: rating,
      metric_value: value,
    })
  }
}

// Extend Window interface
// Global Window interface is declared in main.tsx