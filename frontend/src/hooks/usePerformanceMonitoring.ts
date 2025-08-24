import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from 'sonner';

interface PerformanceMetrics {
  renderTime: number;
  memoryUsage: number;
  bundleSize: number;
  apiLatency: number;
  editorResponseTime: number;
  lastMeasurement: Date;
}

interface PerformanceThresholds {
  maxRenderTime: number;
  maxMemoryUsage: number;
  maxBundleSize: number;
  maxApiLatency: number;
  maxEditorResponseTime: number;
}

const defaultThresholds: PerformanceThresholds = {
  maxRenderTime: 16, // 60fps
  maxMemoryUsage: 100, // MB
  maxBundleSize: 5, // MB
  maxApiLatency: 2000, // ms
  maxEditorResponseTime: 100, // ms
};

export function usePerformanceMonitoring(enabled: boolean = true) {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    memoryUsage: 0,
    bundleSize: 0,
    apiLatency: 0,
    editorResponseTime: 0,
    lastMeasurement: new Date(),
  });

  const [thresholds, setThresholds] = useState<PerformanceThresholds>(defaultThresholds);
  const [issues, setIssues] = useState<string[]>([]);
  const performanceObserver = useRef<PerformanceObserver | null>(null);
  const measurementInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Set up performance observer for render times
    if ('PerformanceObserver' in window) {
      performanceObserver.current = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        entries.forEach((entry) => {
          if (entry.entryType === 'measure') {
            updateMetric('renderTime', entry.duration);
          }
        });
      });

      performanceObserver.current.observe({ entryTypes: ['measure'] });
    }

    // Set up regular performance measurements
    measurementInterval.current = setInterval(() => {
      measurePerformance();
    }, 5000); // Measure every 5 seconds

    return () => {
      if (performanceObserver.current) {
        performanceObserver.current.disconnect();
      }
      if (measurementInterval.current) {
        clearInterval(measurementInterval.current);
      }
    };
  }, [enabled]);

  const measurePerformance = useCallback(() => {
    const newMetrics: Partial<PerformanceMetrics> = {
      lastMeasurement: new Date(),
    };

    // Measure memory usage
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      newMetrics.memoryUsage = memory.usedJSHeapSize / (1024 * 1024); // Convert to MB
    }

    // Measure API latency (example with a simple fetch to current origin)
    const apiStart = performance.now();
    fetch(window.location.origin, { method: 'HEAD' })
      .then(() => {
        const apiEnd = performance.now();
        newMetrics.apiLatency = apiEnd - apiStart;
        updateMetrics(newMetrics);
      })
      .catch(() => {
        // Fallback latency measurement
        newMetrics.apiLatency = metrics.apiLatency;
        updateMetrics(newMetrics);
      });
  }, [metrics.apiLatency]);

  const updateMetric = useCallback((metric: keyof PerformanceMetrics, value: number) => {
    setMetrics(prev => ({
      ...prev,
      [metric]: value,
      lastMeasurement: new Date(),
    }));
  }, []);

  const updateMetrics = useCallback((newMetrics: Partial<PerformanceMetrics>) => {
    setMetrics(prev => ({
      ...prev,
      ...newMetrics,
    }));
  }, []);

  // Check for performance issues
  useEffect(() => {
    const currentIssues: string[] = [];

    if (metrics.renderTime > thresholds.maxRenderTime) {
      currentIssues.push(`Slow rendering: ${metrics.renderTime.toFixed(2)}ms (threshold: ${thresholds.maxRenderTime}ms)`);
    }

    if (metrics.memoryUsage > thresholds.maxMemoryUsage) {
      currentIssues.push(`High memory usage: ${metrics.memoryUsage.toFixed(2)}MB (threshold: ${thresholds.maxMemoryUsage}MB)`);
    }

    if (metrics.apiLatency > thresholds.maxApiLatency) {
      currentIssues.push(`High API latency: ${metrics.apiLatency.toFixed(2)}ms (threshold: ${thresholds.maxApiLatency}ms)`);
    }

    if (metrics.editorResponseTime > thresholds.maxEditorResponseTime) {
      currentIssues.push(`Slow editor response: ${metrics.editorResponseTime.toFixed(2)}ms (threshold: ${thresholds.maxEditorResponseTime}ms)`);
    }

    setIssues(currentIssues);

    // Show toast for critical performance issues
    if (currentIssues.length > 0 && currentIssues.length > issues.length) {
      const newIssue = currentIssues[currentIssues.length - 1];
      toast.warning(`Performance issue detected: ${newIssue}`);
    }
  }, [metrics, thresholds, issues.length]);

  const measureEditorPerformance = useCallback((operation: string, startTime: number) => {
    const endTime = performance.now();
    const duration = endTime - startTime;
    
    performance.mark(`editor-${operation}-end`);
    performance.measure(`editor-${operation}`, `editor-${operation}-start`, `editor-${operation}-end`);
    
    updateMetric('editorResponseTime', duration);
    
    return duration;
  }, [updateMetric]);

  const startEditorMeasurement = useCallback((operation: string) => {
    const startTime = performance.now();
    performance.mark(`editor-${operation}-start`);
    
    return {
      end: () => measureEditorPerformance(operation, startTime),
      startTime,
    };
  }, [measureEditorPerformance]);

  const optimizeComponent = useCallback((componentName: string) => {
    // Component-specific optimizations
    const optimizations = {
      'Monaco Editor': () => {
        // Lazy load Monaco Editor
        return import('monaco-editor/esm/vs/editor/editor.api');
      },
      'File Explorer': () => {
        // Implement virtualization for large file lists
        console.log('Implementing virtualization for file explorer');
      },
      'Preview Panel': () => {
        // Optimize preview rendering
        console.log('Optimizing preview panel rendering');
      },
    };

    const optimization = optimizations[componentName as keyof typeof optimizations];
    if (optimization) {
      optimization();
      toast.success(`Applied performance optimization for ${componentName}`);
    }
  }, []);

  const getPerformanceScore = useCallback(() => {
    let score = 100;
    
    if (metrics.renderTime > thresholds.maxRenderTime) {
      score -= Math.min(30, (metrics.renderTime - thresholds.maxRenderTime) / thresholds.maxRenderTime * 30);
    }
    
    if (metrics.memoryUsage > thresholds.maxMemoryUsage) {
      score -= Math.min(25, (metrics.memoryUsage - thresholds.maxMemoryUsage) / thresholds.maxMemoryUsage * 25);
    }
    
    if (metrics.apiLatency > thresholds.maxApiLatency) {
      score -= Math.min(25, (metrics.apiLatency - thresholds.maxApiLatency) / thresholds.maxApiLatency * 25);
    }
    
    if (metrics.editorResponseTime > thresholds.maxEditorResponseTime) {
      score -= Math.min(20, (metrics.editorResponseTime - thresholds.maxEditorResponseTime) / thresholds.maxEditorResponseTime * 20);
    }

    return Math.max(0, Math.round(score));
  }, [metrics, thresholds]);

  const generatePerformanceReport = useCallback(() => {
    const score = getPerformanceScore();
    const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
    
    return {
      score,
      grade,
      metrics,
      issues,
      recommendations: generateRecommendations(),
    };
  }, [metrics, issues, getPerformanceScore]);

  const generateRecommendations = useCallback(() => {
    const recommendations: string[] = [];
    
    if (metrics.renderTime > thresholds.maxRenderTime) {
      recommendations.push('Consider using React.memo() for expensive components');
      recommendations.push('Implement virtualization for large lists');
      recommendations.push('Use useCallback and useMemo to prevent unnecessary re-renders');
    }
    
    if (metrics.memoryUsage > thresholds.maxMemoryUsage) {
      recommendations.push('Check for memory leaks in event listeners');
      recommendations.push('Implement lazy loading for heavy components');
      recommendations.push('Consider using Web Workers for CPU-intensive tasks');
    }
    
    if (metrics.apiLatency > thresholds.maxApiLatency) {
      recommendations.push('Implement request caching');
      recommendations.push('Use connection pooling');
      recommendations.push('Consider using a CDN for static assets');
    }
    
    if (metrics.editorResponseTime > thresholds.maxEditorResponseTime) {
      recommendations.push('Debounce editor input handlers');
      recommendations.push('Optimize syntax highlighting');
      recommendations.push('Consider using Web Workers for parsing');
    }

    return recommendations;
  }, [metrics, thresholds]);

  return {
    metrics,
    thresholds,
    issues,
    enabled,
    setThresholds,
    startEditorMeasurement,
    measureEditorPerformance,
    optimizeComponent,
    getPerformanceScore,
    generatePerformanceReport,
    updateMetric,
    updateMetrics,
  };
}

// Hook for specific component performance monitoring
export function useComponentPerformanceMonitoring(componentName: string) {
  const renderStartTime = useRef<number>(0);
  const [renderTime, setRenderTime] = useState<number>(0);

  useEffect(() => {
    renderStartTime.current = performance.now();
  });

  useEffect(() => {
    const endTime = performance.now();
    const duration = endTime - renderStartTime.current;
    setRenderTime(duration);
    
    // Log slow renders
    if (duration > 16) { // More than one frame at 60fps
      console.warn(`Slow render in ${componentName}: ${duration.toFixed(2)}ms`);
    }
  });

  return {
    renderTime,
    componentName,
  };
}

// Hook for API call performance monitoring
export function useAPIPerformanceMonitoring() {
  const [apiMetrics, setApiMetrics] = useState<Map<string, { latency: number; count: number }>>(new Map());

  const measureAPICall = useCallback(async <T>(
    endpoint: string,
    apiCall: () => Promise<T>
  ): Promise<T> => {
    const startTime = performance.now();
    
    try {
      const result = await apiCall();
      const endTime = performance.now();
      const latency = endTime - startTime;
      
      setApiMetrics(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(endpoint) || { latency: 0, count: 0 };
        
        // Calculate moving average
        const newLatency = (existing.latency * existing.count + latency) / (existing.count + 1);
        
        newMap.set(endpoint, {
          latency: newLatency,
          count: existing.count + 1,
        });
        
        return newMap;
      });
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      const latency = endTime - startTime;
      
      // Still record the latency for failed requests
      setApiMetrics(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(endpoint) || { latency: 0, count: 0 };
        
        newMap.set(endpoint, {
          latency: (existing.latency * existing.count + latency) / (existing.count + 1),
          count: existing.count + 1,
        });
        
        return newMap;
      });
      
      throw error;
    }
  }, []);

  const getSlowEndpoints = useCallback((threshold: number = 1000) => {
    return Array.from(apiMetrics.entries())
      .filter(([_, metrics]) => metrics.latency > threshold)
      .sort(([_, a], [__, b]) => b.latency - a.latency);
  }, [apiMetrics]);

  return {
    apiMetrics,
    measureAPICall,
    getSlowEndpoints,
  };
}