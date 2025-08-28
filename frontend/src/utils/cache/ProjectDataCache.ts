/**
 * Advanced project data caching system with TTL, invalidation, and performance tracking
 * Designed to work with UnifiedProjectProvider to prevent redundant API calls
 */

import type { Project } from '../../contexts/UnifiedProjectContext';
import type { ProjectSecurityConfig, CodeSecurityScan } from '../../services/securityService';
import { navigationMetrics } from '../performance/navigationMetrics';

export interface CachedProjectData {
  project: Project | null;
  security: {
    config: ProjectSecurityConfig;
    isSecurityEnabled: boolean;
    activeThreats: number;
    recentScans: CodeSecurityScan[];
  };
  metadata: {
    cachedAt: number;
    ttl: number;
    accessCount: number;
    lastAccessed: number;
    version: string; // For cache invalidation on schema changes
  };
}

export interface CacheStats {
  totalEntries: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  averageAccessTime: number;
  cacheSize: number; // in bytes (estimate)
  oldestEntry: number | null;
  newestEntry: number | null;
}

export interface CacheConfig {
  defaultTTL: number; // milliseconds
  maxEntries: number;
  enablePersistence: boolean; // localStorage persistence
  enableCompression: boolean; // JSON compression for localStorage
  enableMetrics: boolean; // performance tracking
  version: string; // cache version for invalidation
}

class ProjectDataCache {
  private static instance: ProjectDataCache;
  private cache = new Map<string, CachedProjectData>();
  private stats = {
    hits: 0,
    misses: 0,
    totalAccessTime: 0,
    accessCount: 0
  };
  
  private config: CacheConfig = {
    defaultTTL: 5 * 60 * 1000, // 5 minutes
    maxEntries: 50, // Maximum number of projects to cache
    enablePersistence: true,
    enableCompression: false, // Could be enabled for large projects
    enableMetrics: true,
    version: '1.0.0'
  };

  private constructor(config?: Partial<CacheConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    
    if (this.config.enablePersistence) {
      this.loadFromStorage();
    }
    
    // Cleanup expired entries periodically
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  static getInstance(config?: Partial<CacheConfig>): ProjectDataCache {
    if (!ProjectDataCache.instance) {
      ProjectDataCache.instance = new ProjectDataCache(config);
    }
    return ProjectDataCache.instance;
  }

  /**
   * Get cached project data with performance tracking
   */
  get(projectId: string): CachedProjectData | null {
    const startTime = performance.now();
    
    try {
      const cached = this.cache.get(projectId);
      
      if (!cached) {
        this.recordMiss();
        return null;
      }

      // Check TTL
      const now = Date.now();
      const isExpired = now - cached.metadata.cachedAt > cached.metadata.ttl;
      
      if (isExpired) {
        this.cache.delete(projectId);
        this.recordMiss();
        return null;
      }

      // Update access tracking
      cached.metadata.accessCount++;
      cached.metadata.lastAccessed = now;
      
      this.recordHit();
      
      if (this.config.enableMetrics) {
        navigationMetrics.recordAPICall(); // Negative - we avoided an API call
        console.log(`📦 Cache HIT for project ${projectId} (age: ${((now - cached.metadata.cachedAt) / 1000).toFixed(1)}s)`);
      }
      
      return cached;
      
    } finally {
      const duration = performance.now() - startTime;
      this.stats.totalAccessTime += duration;
      this.stats.accessCount++;
    }
  }

  /**
   * Set cached project data with automatic cleanup
   */
  set(projectId: string, data: Omit<CachedProjectData, 'metadata'>): void {
    const now = Date.now();
    
    // Enforce cache size limits
    if (this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }
    
    const cachedData: CachedProjectData = {
      ...data,
      metadata: {
        cachedAt: now,
        ttl: this.config.defaultTTL,
        accessCount: 1,
        lastAccessed: now,
        version: this.config.version
      }
    };
    
    this.cache.set(projectId, cachedData);
    
    if (this.config.enablePersistence) {
      this.saveToStorage();
    }
    
    if (this.config.enableMetrics) {
      console.log(`💾 Cached project data for ${projectId} (TTL: ${(this.config.defaultTTL / 1000).toFixed(0)}s)`);
    }
  }

  /**
   * Update existing cached data without resetting TTL
   */
  update(projectId: string, updates: Partial<Omit<CachedProjectData, 'metadata'>>): boolean {
    const cached = this.cache.get(projectId);
    
    if (!cached) {
      return false;
    }
    
    // Merge updates
    Object.assign(cached, updates);
    cached.metadata.lastAccessed = Date.now();
    
    if (this.config.enablePersistence) {
      this.saveToStorage();
    }
    
    return true;
  }

  /**
   * Invalidate specific project cache
   */
  invalidate(projectId: string): boolean {
    const existed = this.cache.has(projectId);
    this.cache.delete(projectId);
    
    if (this.config.enablePersistence && existed) {
      this.saveToStorage();
    }
    
    if (this.config.enableMetrics && existed) {
      console.log(`🗑️ Invalidated cache for project ${projectId}`);
    }
    
    return existed;
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    const previousSize = this.cache.size;
    this.cache.clear();
    
    if (this.config.enablePersistence) {
      localStorage.removeItem('velocity-project-cache');
    }
    
    if (this.config.enableMetrics) {
      console.log(`🧹 Cleared cache (${previousSize} entries)`);
    }
  }

  /**
   * Get cache performance statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const now = Date.now();
    
    let totalSize = 0;
    let oldestEntry: number | null = null;
    let newestEntry: number | null = null;
    
    for (const entry of entries) {
      // Rough size estimation
      totalSize += JSON.stringify(entry).length * 2; // UTF-16 chars
      
      const cachedAt = entry.metadata.cachedAt;
      if (oldestEntry === null || cachedAt < oldestEntry) {
        oldestEntry = cachedAt;
      }
      if (newestEntry === null || cachedAt > newestEntry) {
        newestEntry = cachedAt;
      }
    }
    
    const total = this.stats.hits + this.stats.misses;
    
    return {
      totalEntries: this.cache.size,
      hitRate: total > 0 ? (this.stats.hits / total) * 100 : 0,
      missRate: total > 0 ? (this.stats.misses / total) * 100 : 0,
      totalHits: this.stats.hits,
      totalMisses: this.stats.misses,
      averageAccessTime: this.stats.accessCount > 0 ? this.stats.totalAccessTime / this.stats.accessCount : 0,
      cacheSize: totalSize,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Check if project data exists in cache (without accessing it)
   */
  has(projectId: string): boolean {
    const cached = this.cache.get(projectId);
    if (!cached) return false;
    
    // Check expiration
    const now = Date.now();
    const isExpired = now - cached.metadata.cachedAt > cached.metadata.ttl;
    
    if (isExpired) {
      this.cache.delete(projectId);
      return false;
    }
    
    return true;
  }

  /**
   * Get list of cached project IDs
   */
  getCachedProjectIds(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Extend TTL for a specific project
   */
  extendTTL(projectId: string, additionalTime: number): boolean {
    const cached = this.cache.get(projectId);
    if (!cached) return false;
    
    cached.metadata.ttl += additionalTime;
    return true;
  }

  /**
   * Set custom TTL for a specific project
   */
  setTTL(projectId: string, ttl: number): boolean {
    const cached = this.cache.get(projectId);
    if (!cached) return false;
    
    cached.metadata.ttl = ttl;
    cached.metadata.cachedAt = Date.now(); // Reset timer
    return true;
  }

  // Private methods
  private recordHit(): void {
    this.stats.hits++;
  }

  private recordMiss(): void {
    this.stats.misses++;
  }

  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];
    
    for (const [projectId, cached] of this.cache.entries()) {
      const isExpired = now - cached.metadata.cachedAt > cached.metadata.ttl;
      if (isExpired) {
        toDelete.push(projectId);
      }
    }
    
    if (toDelete.length > 0) {
      for (const projectId of toDelete) {
        this.cache.delete(projectId);
      }
      
      if (this.config.enablePersistence) {
        this.saveToStorage();
      }
      
      if (this.config.enableMetrics) {
        console.log(`🧽 Cleaned up ${toDelete.length} expired cache entries`);
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [key, cached] of this.cache.entries()) {
      if (cached.metadata.cachedAt < oldestTime) {
        oldestTime = cached.metadata.cachedAt;
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
      if (this.config.enableMetrics) {
        console.log(`🗑️ Evicted oldest cache entry: ${oldestKey}`);
      }
    }
  }

  private saveToStorage(): void {
    try {
      const cacheData = {
        version: this.config.version,
        timestamp: Date.now(),
        entries: Object.fromEntries(this.cache)
      };
      
      localStorage.setItem('velocity-project-cache', JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Failed to save cache to localStorage:', error);
    }
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('velocity-project-cache');
      if (!stored) return;
      
      const cacheData = JSON.parse(stored);
      
      // Version check
      if (cacheData.version !== this.config.version) {
        console.log('Cache version mismatch, clearing cache');
        localStorage.removeItem('velocity-project-cache');
        return;
      }
      
      // Load entries
      this.cache = new Map(Object.entries(cacheData.entries));
      
      // Clean up expired entries
      this.cleanup();
      
      if (this.config.enableMetrics) {
        console.log(`📂 Loaded ${this.cache.size} cached projects from localStorage`);
      }
      
    } catch (error) {
      console.warn('Failed to load cache from localStorage:', error);
      localStorage.removeItem('velocity-project-cache');
    }
  }
}

// Export singleton instance
export const projectDataCache = ProjectDataCache.getInstance();

// Utility functions for easy integration
export const cacheUtils = {
  /**
   * Cache project data with default settings
   */
  cacheProject: (projectId: string, project: Project | null, security: any) => {
    projectDataCache.set(projectId, { project, security });
  },

  /**
   * Get cached project with fallback
   */
  getCachedProject: (projectId: string) => {
    return projectDataCache.get(projectId);
  },

  /**
   * Invalidate project cache when data changes
   */
  invalidateProject: (projectId: string) => {
    return projectDataCache.invalidate(projectId);
  },

  /**
   * Get cache performance report
   */
  getCacheStats: () => {
    return projectDataCache.getStats();
  },

  /**
   * Clear all cache (for debugging/testing)
   */
  clearCache: () => {
    projectDataCache.clear();
  }
};

// Development helper
if (typeof window !== 'undefined') {
  (window as any).projectDataCache = projectDataCache;
  (window as any).cacheStats = () => console.table(projectDataCache.getStats());
}