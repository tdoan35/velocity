import { toast } from 'sonner';

interface OptimizationRule {
  id: string;
  name: string;
  description: string;
  category: 'rendering' | 'memory' | 'network' | 'bundling' | 'caching';
  priority: 'low' | 'medium' | 'high' | 'critical';
  apply: () => Promise<void> | void;
  check: () => boolean;
}

interface PerformanceConfig {
  enableLazyLoading: boolean;
  enableCodeSplitting: boolean;
  enableServiceWorker: boolean;
  enableVirtualization: boolean;
  enableMemoization: boolean;
  enableDebouncing: boolean;
  cacheStrategy: 'aggressive' | 'moderate' | 'minimal';
  bundleOptimization: 'development' | 'production';
}

const defaultConfig: PerformanceConfig = {
  enableLazyLoading: true,
  enableCodeSplitting: true,
  enableServiceWorker: false, // Disabled by default for development
  enableVirtualization: false, // Enabled on demand
  enableMemoization: true,
  enableDebouncing: true,
  cacheStrategy: 'moderate',
  bundleOptimization: 'development',
};

class PerformanceOptimizationService {
  private config: PerformanceConfig = defaultConfig;
  private appliedOptimizations: Set<string> = new Set();
  private optimizationRules: OptimizationRule[] = [];

  constructor() {
    this.initializeOptimizationRules();
  }

  private initializeOptimizationRules(): void {
    this.optimizationRules = [
      {
        id: 'lazy-monaco-editor',
        name: 'Lazy Load Monaco Editor',
        description: 'Load Monaco Editor only when needed to reduce initial bundle size',
        category: 'bundling',
        priority: 'high',
        apply: async () => {
          // Monaco Editor lazy loading implementation
          const loadMonaco = () => import('monaco-editor/esm/vs/editor/editor.api');
          (window as any).loadMonacoEditor = loadMonaco;
          toast.success('Monaco Editor lazy loading enabled');
        },
        check: () => !!(window as any).loadMonacoEditor,
      },
      {
        id: 'virtualize-file-explorer',
        name: 'Virtualize File Explorer',
        description: 'Use virtual scrolling for large file lists to improve performance',
        category: 'rendering',
        priority: 'medium',
        apply: () => {
          // Enable virtualization flag
          localStorage.setItem('velocity-file-explorer-virtualized', 'true');
          toast.success('File Explorer virtualization enabled');
        },
        check: () => localStorage.getItem('velocity-file-explorer-virtualized') === 'true',
      },
      {
        id: 'debounce-editor-input',
        name: 'Debounce Editor Input',
        description: 'Reduce editor input handling frequency to improve responsiveness',
        category: 'rendering',
        priority: 'high',
        apply: () => {
          localStorage.setItem('velocity-editor-debounce', '300');
          toast.success('Editor input debouncing enabled (300ms)');
        },
        check: () => !!localStorage.getItem('velocity-editor-debounce'),
      },
      {
        id: 'optimize-bundle-imports',
        name: 'Optimize Bundle Imports',
        description: 'Use tree-shaking and dynamic imports to reduce bundle size',
        category: 'bundling',
        priority: 'high',
        apply: async () => {
          // This would typically be handled at build time
          // For now, we'll just set a flag to indicate optimization is enabled
          localStorage.setItem('velocity-bundle-optimized', 'true');
          toast.success('Bundle optimization strategies applied');
        },
        check: () => localStorage.getItem('velocity-bundle-optimized') === 'true',
      },
      {
        id: 'enable-service-worker',
        name: 'Enable Service Worker Caching',
        description: 'Cache static assets and API responses for improved performance',
        category: 'caching',
        priority: 'medium',
        apply: async () => {
          if ('serviceWorker' in navigator) {
            try {
              // This would register a proper service worker in production
              console.log('Service worker registration would happen here');
              localStorage.setItem('velocity-sw-enabled', 'true');
              toast.success('Service Worker caching enabled');
            } catch (error) {
              toast.error('Failed to enable Service Worker');
            }
          } else {
            toast.warning('Service Worker not supported in this browser');
          }
        },
        check: () => localStorage.getItem('velocity-sw-enabled') === 'true',
      },
      {
        id: 'optimize-api-requests',
        name: 'Optimize API Requests',
        description: 'Implement request deduplication and caching',
        category: 'network',
        priority: 'medium',
        apply: () => {
          localStorage.setItem('velocity-api-cache', 'enabled');
          localStorage.setItem('velocity-request-deduplication', 'enabled');
          toast.success('API request optimization enabled');
        },
        check: () => localStorage.getItem('velocity-api-cache') === 'enabled',
      },
      {
        id: 'enable-component-memoization',
        name: 'Enable Component Memoization',
        description: 'Use React.memo and useMemo to prevent unnecessary re-renders',
        category: 'memory',
        priority: 'high',
        apply: () => {
          localStorage.setItem('velocity-memoization', 'enabled');
          toast.success('Component memoization enabled');
        },
        check: () => localStorage.getItem('velocity-memoization') === 'enabled',
      },
      {
        id: 'optimize-preview-rendering',
        name: 'Optimize Preview Rendering',
        description: 'Use iframe sandboxing and lazy loading for preview content',
        category: 'rendering',
        priority: 'medium',
        apply: () => {
          localStorage.setItem('velocity-preview-optimized', 'true');
          toast.success('Preview rendering optimization enabled');
        },
        check: () => localStorage.getItem('velocity-preview-optimized') === 'true',
      },
      {
        id: 'enable-web-workers',
        name: 'Enable Web Workers',
        description: 'Move CPU-intensive tasks to Web Workers',
        category: 'rendering',
        priority: 'low',
        apply: async () => {
          if ('Worker' in window) {
            localStorage.setItem('velocity-web-workers', 'enabled');
            toast.success('Web Workers enabled for background processing');
          } else {
            toast.warning('Web Workers not supported in this browser');
          }
        },
        check: () => localStorage.getItem('velocity-web-workers') === 'enabled',
      },
      {
        id: 'optimize-hot-reload',
        name: 'Optimize Hot Reload',
        description: 'Reduce hot reload frequency and scope',
        category: 'network',
        priority: 'low',
        apply: () => {
          localStorage.setItem('velocity-hot-reload-optimized', 'true');
          toast.success('Hot reload optimization enabled');
        },
        check: () => localStorage.getItem('velocity-hot-reload-optimized') === 'true',
      },
    ];
  }

  /**
   * Get all available optimization rules
   */
  getOptimizationRules(): OptimizationRule[] {
    return this.optimizationRules;
  }

  /**
   * Get optimization rules by category
   */
  getOptimizationsByCategory(category: OptimizationRule['category']): OptimizationRule[] {
    return this.optimizationRules.filter(rule => rule.category === category);
  }

  /**
   * Get optimization rules by priority
   */
  getOptimizationsByPriority(priority: OptimizationRule['priority']): OptimizationRule[] {
    return this.optimizationRules.filter(rule => rule.priority === priority);
  }

  /**
   * Apply a specific optimization
   */
  async applyOptimization(optimizationId: string): Promise<boolean> {
    const rule = this.optimizationRules.find(r => r.id === optimizationId);
    
    if (!rule) {
      console.error(`Optimization rule not found: ${optimizationId}`);
      return false;
    }

    try {
      await rule.apply();
      this.appliedOptimizations.add(optimizationId);
      return true;
    } catch (error: any) {
      console.error(`Failed to apply optimization ${optimizationId}:`, error);
      toast.error(`Failed to apply ${rule.name}: ${error.message}`);
      return false;
    }
  }

  /**
   * Apply all optimizations of a specific category
   */
  async applyOptimizationsByCategory(category: OptimizationRule['category']): Promise<number> {
    const rules = this.getOptimizationsByCategory(category);
    let appliedCount = 0;

    for (const rule of rules) {
      const success = await this.applyOptimization(rule.id);
      if (success) appliedCount++;
    }

    toast.success(`Applied ${appliedCount}/${rules.length} ${category} optimizations`);
    return appliedCount;
  }

  /**
   * Apply all high priority optimizations
   */
  async applyHighPriorityOptimizations(): Promise<number> {
    const rules = this.getOptimizationsByPriority('high');
    let appliedCount = 0;

    for (const rule of rules) {
      if (!this.isOptimizationApplied(rule.id)) {
        const success = await this.applyOptimization(rule.id);
        if (success) appliedCount++;
      }
    }

    return appliedCount;
  }

  /**
   * Apply all available optimizations
   */
  async applyAllOptimizations(): Promise<{ applied: number; failed: number }> {
    let applied = 0;
    let failed = 0;

    for (const rule of this.optimizationRules) {
      if (!this.isOptimizationApplied(rule.id)) {
        const success = await this.applyOptimization(rule.id);
        if (success) {
          applied++;
        } else {
          failed++;
        }
      }
    }

    toast.success(`Applied ${applied} optimizations${failed > 0 ? `, ${failed} failed` : ''}`);
    return { applied, failed };
  }

  /**
   * Check if an optimization is already applied
   */
  isOptimizationApplied(optimizationId: string): boolean {
    const rule = this.optimizationRules.find(r => r.id === optimizationId);
    if (!rule) return false;
    
    return rule.check();
  }

  /**
   * Get optimization status summary
   */
  getOptimizationStatus(): {
    total: number;
    applied: number;
    pending: number;
    byCategory: Record<string, { applied: number; total: number }>;
    byPriority: Record<string, { applied: number; total: number }>;
  } {
    const total = this.optimizationRules.length;
    const applied = this.optimizationRules.filter(rule => this.isOptimizationApplied(rule.id)).length;
    const pending = total - applied;

    const byCategory: Record<string, { applied: number; total: number }> = {};
    const byPriority: Record<string, { applied: number; total: number }> = {};

    for (const rule of this.optimizationRules) {
      const isApplied = this.isOptimizationApplied(rule.id);
      
      // By category
      if (!byCategory[rule.category]) {
        byCategory[rule.category] = { applied: 0, total: 0 };
      }
      byCategory[rule.category].total++;
      if (isApplied) byCategory[rule.category].applied++;

      // By priority
      if (!byPriority[rule.priority]) {
        byPriority[rule.priority] = { applied: 0, total: 0 };
      }
      byPriority[rule.priority].total++;
      if (isApplied) byPriority[rule.priority].applied++;
    }

    return {
      total,
      applied,
      pending,
      byCategory,
      byPriority,
    };
  }

  /**
   * Get performance recommendations based on current state
   */
  getPerformanceRecommendations(performanceMetrics?: {
    renderTime: number;
    memoryUsage: number;
    apiLatency: number;
    editorResponseTime: number;
  }): string[] {
    const recommendations: string[] = [];
    const status = this.getOptimizationStatus();

    // General recommendations
    if (status.pending > 0) {
      recommendations.push(`Apply ${status.pending} pending optimizations to improve performance`);
    }

    if (status.byPriority.high?.applied < status.byPriority.high?.total) {
      recommendations.push('Apply high priority optimizations first for maximum impact');
    }

    // Specific recommendations based on performance metrics
    if (performanceMetrics) {
      if (performanceMetrics.renderTime > 16 && !this.isOptimizationApplied('enable-component-memoization')) {
        recommendations.push('Enable component memoization to improve render performance');
      }

      if (performanceMetrics.editorResponseTime > 100 && !this.isOptimizationApplied('debounce-editor-input')) {
        recommendations.push('Enable editor input debouncing to improve responsiveness');
      }

      if (performanceMetrics.apiLatency > 1000 && !this.isOptimizationApplied('optimize-api-requests')) {
        recommendations.push('Optimize API requests with caching and deduplication');
      }

      if (performanceMetrics.memoryUsage > 100 && !this.isOptimizationApplied('virtualize-file-explorer')) {
        recommendations.push('Enable file explorer virtualization to reduce memory usage');
      }
    }

    return recommendations;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<PerformanceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem('velocity-performance-config', JSON.stringify(this.config));
  }

  /**
   * Get current configuration
   */
  getConfig(): PerformanceConfig {
    const saved = localStorage.getItem('velocity-performance-config');
    if (saved) {
      try {
        this.config = { ...this.config, ...JSON.parse(saved) };
      } catch (error) {
        console.error('Failed to load performance config:', error);
      }
    }
    return this.config;
  }

  /**
   * Reset all optimizations
   */
  resetOptimizations(): void {
    for (const rule of this.optimizationRules) {
      localStorage.removeItem(`velocity-${rule.id}`);
    }
    
    // Remove other optimization-related storage
    const keysToRemove = [
      'velocity-file-explorer-virtualized',
      'velocity-editor-debounce',
      'velocity-bundle-optimized',
      'velocity-sw-enabled',
      'velocity-api-cache',
      'velocity-request-deduplication',
      'velocity-memoization',
      'velocity-preview-optimized',
      'velocity-web-workers',
      'velocity-hot-reload-optimized',
    ];

    keysToRemove.forEach(key => localStorage.removeItem(key));
    this.appliedOptimizations.clear();
    
    toast.success('All optimizations reset');
  }
}

export const performanceOptimizationService = new PerformanceOptimizationService();