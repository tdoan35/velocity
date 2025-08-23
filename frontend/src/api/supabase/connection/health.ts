import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getStoredConnection, updateConnectionStatus } from './store';

// Request validation schema
const healthCheckSchema = z.object({
  projectId: z.string().uuid('Invalid project ID format'),
  userId: z.string().uuid('Invalid user ID format'),
});

export interface HealthCheckRequest {
  projectId: string;
  userId: string;
}

export interface HealthCheckResponse {
  success: boolean;
  isHealthy: boolean;
  lastChecked: string;
  projectUrl?: string;
  error?: string;
  metrics?: {
    responseTime: number;
    databaseAccessible: boolean;
    authWorking: boolean;
  };
}

/**
 * Perform a comprehensive health check on the Supabase connection
 */
async function performHealthCheck(
  projectUrl: string,
  anonKey: string
): Promise<{
  isHealthy: boolean;
  metrics: {
    responseTime: number;
    databaseAccessible: boolean;
    authWorking: boolean;
  };
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    // Create a temporary client for health check
    const client = createClient(projectUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (url, options = {}) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for health checks
          
          return fetch(url, {
            ...options,
            signal: controller.signal,
          }).finally(() => clearTimeout(timeoutId));
        },
      },
    });
    
    // Test 1: Database connectivity
    let databaseAccessible = false;
    try {
      const { error: dbError } = await client
        .from('_prisma_migrations')
        .select('id')
        .limit(1)
        .maybeSingle();
      
      // These error codes indicate the connection works but table doesn't exist or no access
      databaseAccessible = !dbError || dbError.code === 'PGRST116' || dbError.code === 'PGRST301';
    } catch {
      databaseAccessible = false;
    }
    
    // Test 2: Auth service (anonymous auth should always work with anon key)
    let authWorking = false;
    try {
      const { data: { session }, error: authError } = await client.auth.getSession();
      // Anonymous access doesn't require a session, so no error means auth is working
      authWorking = !authError;
    } catch {
      authWorking = false;
    }
    
    const responseTime = Date.now() - startTime;
    
    // Connection is healthy if database is accessible and response time is reasonable
    const isHealthy = databaseAccessible && responseTime < 5000;
    
    return {
      isHealthy,
      metrics: {
        responseTime,
        databaseAccessible,
        authWorking,
      },
      error: isHealthy ? undefined : 'Connection unhealthy',
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return {
      isHealthy: false,
      metrics: {
        responseTime,
        databaseAccessible: false,
        authWorking: false,
      },
      error: error instanceof Error ? error.message : 'Health check failed',
    };
  }
}

/**
 * Check the health of a stored Supabase connection
 */
export async function checkConnectionHealth(
  request: HealthCheckRequest
): Promise<HealthCheckResponse> {
  try {
    // Validate request
    const validation = healthCheckSchema.safeParse(request);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return {
        success: false,
        isHealthy: false,
        lastChecked: new Date().toISOString(),
        error: firstError.message,
      };
    }
    
    const { projectId, userId } = validation.data;
    
    console.log(`[Health Check] Checking connection health for project: ${projectId}`);
    
    // Get stored connection
    const storedConnection = await getStoredConnection(projectId, userId);
    
    if (!storedConnection.success || !storedConnection.connection) {
      return {
        success: false,
        isHealthy: false,
        lastChecked: new Date().toISOString(),
        error: storedConnection.error || 'No connection found',
      };
    }
    
    const { projectUrl, anonKey } = storedConnection.connection;
    
    // Perform health check
    const healthResult = await performHealthCheck(projectUrl, anonKey);
    
    // Update connection status in database
    await updateConnectionStatus(
      projectId,
      userId,
      healthResult.isHealthy ? 'active' : 'error',
      healthResult.error
    );
    
    console.log(`[Health Check] Health check completed - Healthy: ${healthResult.isHealthy}`);
    
    return {
      success: true,
      isHealthy: healthResult.isHealthy,
      lastChecked: new Date().toISOString(),
      projectUrl: projectUrl,
      metrics: healthResult.metrics,
      error: healthResult.error,
    };
  } catch (error) {
    console.error('[Health Check] Unexpected error:', error);
    return {
      success: false,
      isHealthy: false,
      lastChecked: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Health check failed',
    };
  }
}

/**
 * Batch health check for multiple connections
 */
export async function batchHealthCheck(
  requests: HealthCheckRequest[]
): Promise<HealthCheckResponse[]> {
  // Process health checks in parallel with a limit
  const BATCH_SIZE = 5;
  const results: HealthCheckResponse[] = [];
  
  for (let i = 0; i < requests.length; i += BATCH_SIZE) {
    const batch = requests.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(request => checkConnectionHealth(request))
    );
    results.push(...batchResults);
  }
  
  return results;
}