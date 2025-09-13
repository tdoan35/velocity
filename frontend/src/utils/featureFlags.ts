import { supabase } from '../lib/supabase';

// Feature flag cache to avoid excessive DB calls
const flagCache = new Map<string, { value: boolean; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if a feature flag is enabled for the current user
 * Uses caching to avoid excessive database calls
 */
export async function isFeatureEnabled(flagKey: string, userId?: string): Promise<boolean> {
  // Check cache first
  const cached = flagCache.get(flagKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.value;
  }

  try {
    // Get current user if not provided
    const currentUserId = userId || (await supabase.auth.getUser()).data.user?.id;

    // Call the RPC function we created in Phase 0
    const { data, error } = await supabase.rpc('is_feature_enabled', {
      flag_key: flagKey,
      user_id: currentUserId || null
    });

    if (error) {
      console.warn(`Feature flag check failed for ${flagKey}:`, error);
      return false; // Default to disabled on error
    }

    const isEnabled = data || false;
    
    // Cache the result
    flagCache.set(flagKey, { value: isEnabled, timestamp: Date.now() });
    
    return isEnabled;
  } catch (error) {
    console.warn(`Feature flag check error for ${flagKey}:`, error);
    return false; // Default to disabled on error
  }
}

/**
 * Clear the feature flag cache
 * Useful when user changes or flags are updated
 */
export function clearFeatureFlagCache(): void {
  flagCache.clear();
}

/**
 * Pre-cache multiple feature flags
 * Useful for loading critical flags at app startup
 */
export async function preloadFeatureFlags(flagKeys: string[]): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  
  await Promise.all(
    flagKeys.map(async (flagKey) => {
      results[flagKey] = await isFeatureEnabled(flagKey);
    })
  );
  
  return results;
}

// Feature flag constants for file system sync
export const FSYNC_FLAGS = {
  USE_RPC: 'FSYNC_USE_RPC',
  SERVER_BROADCASTS: 'FSYNC_SERVER_BROADCASTS',
  SNAPSHOT_HYDRATION: 'FSYNC_SNAPSHOT_HYDRATION',
  BULK_GENERATION: 'FSYNC_BULK_GENERATION',
  KEEP_CLIENT_BROADCAST: 'FSYNC_KEEP_CLIENT_BROADCAST',
} as const;