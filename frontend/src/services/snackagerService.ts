import { supabase } from '../lib/supabase';

// Types
export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface DependencyResolution {
  resolved: Record<string, string>;
  conflicts: Array<{
    package: string;
    requested: string;
    existing: string;
  }>;
  suggestions: string[];
}

export interface CachedPackage {
  name: string;
  version: string;
  bundleUrl: string;
  metadata: PackageInfo;
  cachedAt: Date;
  expiresAt: Date;
}

// Configuration
const SNACKAGER_CONFIG = {
  baseUrl: import.meta.env.VITE_SNACKAGER_URL || 'https://snackager.expo.io',
  cacheExpiry: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxCacheSize: 100, // Maximum number of cached packages
  supportedExpoVersions: ['51.0.0', '52.0.0'], // Supported Expo SDK versions
};

// Package version constraints
const PACKAGE_CONSTRAINTS = {
  // React Native core packages
  'react': '^18.2.0',
  'react-native': '^0.74.0',
  'react-dom': '^18.2.0',
  
  // Expo packages constraints
  'expo': '~52.0.0',
  'expo-constants': '~17.0.0',
  'expo-font': '~13.0.0',
  'expo-asset': '~11.0.0',
  
  // Common packages with known compatibility
  '@react-navigation/native': '^6.1.0',
  '@react-navigation/stack': '^6.3.0',
  'react-native-screens': '~3.34.0',
  'react-native-safe-area-context': '4.12.0',
};

export class SnackagerService {
  private cache: Map<string, CachedPackage> = new Map();
  private pendingRequests: Map<string, Promise<PackageInfo>> = new Map();

  /**
   * Resolve dependencies for a project
   */
  async resolveDependencies(
    requestedDeps: Record<string, string>,
    sdkVersion: string = '52.0.0'
  ): Promise<DependencyResolution> {
    const resolved: Record<string, string> = {};
    const conflicts: DependencyResolution['conflicts'] = [];
    const suggestions: string[] = [];

    // Add default dependencies
    const dependencies = {
      ...this.getDefaultDependencies(sdkVersion),
      ...requestedDeps,
    };

    // Resolve each dependency
    for (const [pkgName, requestedVersion] of Object.entries(dependencies)) {
      try {
        const resolvedVersion = await this.resolvePackageVersion(
          pkgName,
          requestedVersion,
          sdkVersion
        );

        // Check for conflicts
        if (PACKAGE_CONSTRAINTS[pkgName]) {
          const constraint = PACKAGE_CONSTRAINTS[pkgName];
          if (!this.versionSatisfiesConstraint(resolvedVersion, constraint)) {
            conflicts.push({
              package: pkgName,
              requested: requestedVersion,
              existing: constraint,
            });
            suggestions.push(
              `Consider using ${pkgName}@${constraint} for better compatibility`
            );
          }
        }

        resolved[pkgName] = resolvedVersion;
      } catch (error) {
        console.error(`Failed to resolve ${pkgName}@${requestedVersion}:`, error);
        suggestions.push(
          `Failed to resolve ${pkgName}@${requestedVersion}. Check if the package exists and is compatible with React Native.`
        );
      }
    }

    // Check for peer dependencies
    await this.checkPeerDependencies(resolved, suggestions);

    return { resolved, conflicts, suggestions };
  }

  /**
   * Get bundle URL for a package
   */
  async getBundleUrl(
    packageName: string,
    version: string,
    sdkVersion: string = '52.0.0'
  ): Promise<string> {
    const cacheKey = `${packageName}@${version}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > new Date()) {
      return cached.bundleUrl;
    }

    // Generate bundle URL
    const bundleUrl = `${SNACKAGER_CONFIG.baseUrl}/bundle/${encodeURIComponent(packageName)}@${encodeURIComponent(version)}?platforms=ios,android,web&sdkVersion=${sdkVersion}`;

    // Cache the URL
    this.cache.set(cacheKey, {
      name: packageName,
      version,
      bundleUrl,
      metadata: {} as PackageInfo,
      cachedAt: new Date(),
      expiresAt: new Date(Date.now() + SNACKAGER_CONFIG.cacheExpiry),
    });

    // Clean up old cache entries
    this.cleanupCache();

    return bundleUrl;
  }

  /**
   * Prefetch commonly used packages
   */
  async prefetchCommonPackages(sdkVersion: string = '52.0.0'): Promise<void> {
    const commonPackages = [
      '@react-navigation/native',
      '@react-navigation/stack',
      'react-native-screens',
      'react-native-safe-area-context',
      'react-native-gesture-handler',
      'react-native-reanimated',
      'react-native-vector-icons',
      'axios',
      'lodash',
    ];

    const prefetchPromises = commonPackages.map(async (pkg) => {
      try {
        await this.resolvePackageVersion(pkg, 'latest', sdkVersion);
      } catch (error) {
        console.warn(`Failed to prefetch ${pkg}:`, error);
      }
    });

    await Promise.allSettled(prefetchPromises);
  }

  /**
   * Get cached packages info
   */
  getCachedPackages(): CachedPackage[] {
    return Array.from(this.cache.values()).filter(
      pkg => pkg.expiresAt > new Date()
    );
  }

  /**
   * Clear package cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Save dependency resolution to database
   */
  async saveDependencyResolution(
    projectId: string,
    resolution: DependencyResolution
  ): Promise<void> {
    try {
      await supabase.from('project_dependencies').upsert({
        project_id: projectId,
        dependencies: resolution.resolved,
        conflicts: resolution.conflicts,
        suggestions: resolution.suggestions,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Failed to save dependency resolution:', error);
    }
  }

  /**
   * Private methods
   */

  private async resolvePackageVersion(
    packageName: string,
    requestedVersion: string,
    sdkVersion: string
  ): Promise<string> {
    // Handle special cases
    if (requestedVersion === 'latest' || requestedVersion === '*') {
      return this.getLatestCompatibleVersion(packageName, sdkVersion);
    }

    // Check if version is already specific
    if (/^\d+\.\d+\.\d+$/.test(requestedVersion)) {
      return requestedVersion;
    }

    // Resolve version range
    return this.resolveVersionRange(packageName, requestedVersion, sdkVersion);
  }

  private async getLatestCompatibleVersion(
    packageName: string,
    sdkVersion: string
  ): Promise<string> {
    // Check constraints first
    if (PACKAGE_CONSTRAINTS[packageName]) {
      return PACKAGE_CONSTRAINTS[packageName];
    }

    // For Expo packages, use SDK-specific versions
    if (packageName.startsWith('expo-')) {
      return this.getExpoPackageVersion(packageName, sdkVersion);
    }

    // Default to latest stable version
    return 'latest';
  }

  private getExpoPackageVersion(packageName: string, sdkVersion: string): string {
    // Map SDK versions to Expo package versions
    const sdkMajor = parseInt(sdkVersion.split('.')[0]);
    
    switch (sdkMajor) {
      case 52:
        return '~17.0.0'; // Example version
      case 51:
        return '~16.0.0'; // Example version
      default:
        return 'latest';
    }
  }

  private async resolveVersionRange(
    packageName: string,
    versionRange: string,
    sdkVersion: string
  ): Promise<string> {
    // Simple version range resolution
    // In production, this would query npm registry
    if (versionRange.startsWith('^')) {
      return versionRange; // Keep caret ranges
    }
    if (versionRange.startsWith('~')) {
      return versionRange; // Keep tilde ranges
    }
    
    return versionRange;
  }

  private versionSatisfiesConstraint(version: string, constraint: string): boolean {
    // Simplified version checking
    // In production, use a proper semver library
    if (constraint === version) return true;
    if (constraint === 'latest' || version === 'latest') return true;
    
    // Check major version compatibility
    const versionMajor = parseInt(version.split('.')[0].replace(/\D/g, ''));
    const constraintMajor = parseInt(constraint.split('.')[0].replace(/\D/g, ''));
    
    return versionMajor === constraintMajor;
  }

  private async checkPeerDependencies(
    resolved: Record<string, string>,
    suggestions: string[]
  ): Promise<void> {
    // Check common peer dependency requirements
    if (resolved['@react-navigation/native'] && !resolved['react-native-screens']) {
      suggestions.push(
        '@react-navigation/native requires react-native-screens. Consider adding it.'
      );
    }

    if (resolved['react-native-reanimated'] && !resolved['react-native-gesture-handler']) {
      suggestions.push(
        'react-native-reanimated works best with react-native-gesture-handler.'
      );
    }
  }

  private getDefaultDependencies(sdkVersion: string): Record<string, string> {
    return {
      'react': PACKAGE_CONSTRAINTS['react'],
      'react-native': PACKAGE_CONSTRAINTS['react-native'],
      'expo': PACKAGE_CONSTRAINTS['expo'],
    };
  }

  private cleanupCache(): void {
    if (this.cache.size <= SNACKAGER_CONFIG.maxCacheSize) return;

    // Remove expired entries first
    const now = new Date();
    for (const [key, value] of this.cache.entries()) {
      if (value.expiresAt < now) {
        this.cache.delete(key);
      }
    }

    // If still over limit, remove oldest entries
    if (this.cache.size > SNACKAGER_CONFIG.maxCacheSize) {
      const entries = Array.from(this.cache.entries());
      entries.sort((a, b) => a[1].cachedAt.getTime() - b[1].cachedAt.getTime());
      
      const toRemove = entries.slice(0, this.cache.size - SNACKAGER_CONFIG.maxCacheSize);
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }
}

// Singleton instance
export const snackagerService = new SnackagerService();