/**
 * Navigation Performance Metrics Collection
 * Used to establish baseline performance and track improvements
 */

interface NavigationMetric {
  from: string;
  to: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  componentsRemounted: number;
  apiCallsCount: number;
  timestamp: string;
}

class NavigationMetrics {
  private static instance: NavigationMetrics;
  private metrics: NavigationMetric[] = [];
  private activeNavigation: NavigationMetric | null = null;

  static getInstance(): NavigationMetrics {
    if (!NavigationMetrics.instance) {
      NavigationMetrics.instance = new NavigationMetrics();
    }
    return NavigationMetrics.instance;
  }

  startNavigation(from: string, to: string): void {
    this.activeNavigation = {
      from,
      to,
      startTime: performance.now(),
      componentsRemounted: 0,
      apiCallsCount: 0,
      timestamp: new Date().toISOString()
    };

    console.log(`🚀 Navigation started: ${from} → ${to}`);
  }

  endNavigation(): void {
    if (!this.activeNavigation) {
      console.warn('No active navigation to end');
      return;
    }

    this.activeNavigation.endTime = performance.now();
    this.activeNavigation.duration = this.activeNavigation.endTime - this.activeNavigation.startTime;

    console.log(`✅ Navigation completed: ${this.activeNavigation.from} → ${this.activeNavigation.to} in ${this.activeNavigation.duration.toFixed(2)}ms`);

    this.metrics.push({ ...this.activeNavigation });
    this.activeNavigation = null;

    // Keep only last 50 metrics to prevent memory bloat
    if (this.metrics.length > 50) {
      this.metrics = this.metrics.slice(-50);
    }
  }

  recordComponentRemount(): void {
    if (this.activeNavigation) {
      this.activeNavigation.componentsRemounted++;
    }
  }

  recordAPICall(): void {
    if (this.activeNavigation) {
      this.activeNavigation.apiCallsCount++;
    }
  }

  getMetrics(): NavigationMetric[] {
    return [...this.metrics];
  }

  getAverageNavigationTime(from?: string, to?: string): number {
    let filteredMetrics = this.metrics.filter(m => m.duration !== undefined);
    
    if (from) {
      filteredMetrics = filteredMetrics.filter(m => m.from === from);
    }
    if (to) {
      filteredMetrics = filteredMetrics.filter(m => m.to === to);
    }

    if (filteredMetrics.length === 0) return 0;

    const totalDuration = filteredMetrics.reduce((sum, m) => sum + (m.duration || 0), 0);
    return totalDuration / filteredMetrics.length;
  }

  getNavigationStats(): {
    totalNavigations: number;
    averageTime: number;
    designToEditor: number;
    editorToDesign: number;
    slowestNavigation: NavigationMetric | null;
    fastestNavigation: NavigationMetric | null;
  } {
    const metricsWithDuration = this.metrics.filter(m => m.duration !== undefined);
    
    if (metricsWithDuration.length === 0) {
      return {
        totalNavigations: 0,
        averageTime: 0,
        designToEditor: 0,
        editorToDesign: 0,
        slowestNavigation: null,
        fastestNavigation: null
      };
    }

    const designToEditor = this.getAverageNavigationTime('design', 'editor');
    const editorToDesign = this.getAverageNavigationTime('editor', 'design');
    
    const sortedByDuration = metricsWithDuration.sort((a, b) => (a.duration || 0) - (b.duration || 0));
    
    return {
      totalNavigations: metricsWithDuration.length,
      averageTime: this.getAverageNavigationTime(),
      designToEditor,
      editorToDesign,
      slowestNavigation: sortedByDuration[sortedByDuration.length - 1] || null,
      fastestNavigation: sortedByDuration[0] || null
    };
  }

  exportMetrics(): string {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      stats: this.getNavigationStats(),
      rawMetrics: this.metrics
    }, null, 2);
  }

  clearMetrics(): void {
    this.metrics = [];
    this.activeNavigation = null;
    console.log('📊 Navigation metrics cleared');
  }
}

// Export singleton instance
export const navigationMetrics = NavigationMetrics.getInstance();

// Utility hooks for React components
export const useNavigationTracking = () => {
  return {
    startNavigation: navigationMetrics.startNavigation.bind(navigationMetrics),
    endNavigation: navigationMetrics.endNavigation.bind(navigationMetrics),
    recordComponentRemount: navigationMetrics.recordComponentRemount.bind(navigationMetrics),
    recordAPICall: navigationMetrics.recordAPICall.bind(navigationMetrics),
    getStats: navigationMetrics.getNavigationStats.bind(navigationMetrics),
    exportMetrics: navigationMetrics.exportMetrics.bind(navigationMetrics)
  };
};

// Development helper for console access
if (typeof window !== 'undefined') {
  (window as any).navigationMetrics = navigationMetrics;
}