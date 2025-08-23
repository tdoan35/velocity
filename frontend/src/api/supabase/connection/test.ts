import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { connectionTestLimiter, checkRateLimit } from '../../../middleware/rateLimiter';
import { logConnectionAttempt, logRateLimitViolation, logInfo } from '../../../utils/logging/supabaseConnectionLogger';
import { validateCredentialStrength } from '../../../utils/supabase/credentialSecurity';

// Request validation schema
const testConnectionSchema = z.object({
  projectUrl: z.string().url().refine(
    (url) => {
      // Validate that it's a valid Supabase URL
      const supabasePattern = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
      return supabasePattern.test(url);
    },
    { message: 'Invalid Supabase project URL format' }
  ),
  anonKey: z.string().min(1, 'Anon key is required'),
});

// Rate limiting is now handled by the rateLimiter middleware

export interface ConnectionTestRequest {
  projectUrl: string;
  anonKey: string;
  userId?: string; // For rate limiting
}

export interface ConnectionTestResponse {
  success: boolean;
  message: string;
  projectInfo?: {
    url: string;
    isValid: boolean;
    timestamp: string;
  };
  error?: string;
}


/**
 * Validate that the Supabase client can connect
 */
async function validateSupabaseClient(
  projectUrl: string,
  anonKey: string
): Promise<{ isValid: boolean; error?: string }> {
  try {
    // Create a temporary Supabase client
    const testClient = createClient(projectUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: (url, options = {}) => {
          // Add timeout to fetch requests
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
          
          return fetch(url, {
            ...options,
            signal: controller.signal,
          }).finally(() => clearTimeout(timeoutId));
        },
      },
    });
    
    // Test connection by attempting to query a system table
    // Note: We use a query that should work with minimal permissions
    const { error } = await testClient
      .from('_prisma_migrations')
      .select('id')
      .limit(1)
      .maybeSingle();
    
    // PGRST116 means table doesn't exist, which is fine - connection works
    // PGRST301 means unauthorized to access table, which is also fine
    if (error && error.code !== 'PGRST116' && error.code !== 'PGRST301') {
      // Check for specific error types
      if (error.message.includes('Failed to fetch')) {
        return { isValid: false, error: 'Network error: Unable to reach Supabase project' };
      }
      if (error.message.includes('Invalid API key')) {
        return { isValid: false, error: 'Invalid anon key provided' };
      }
      if (error.message.includes('JWSError')) {
        return { isValid: false, error: 'Invalid or malformed anon key' };
      }
      
      return { isValid: false, error: `Connection failed: ${error.message}` };
    }
    
    // Connection successful
    return { isValid: true };
  } catch (error) {
    // Handle timeout and other errors
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        return { isValid: false, error: 'Connection timeout: Supabase project took too long to respond' };
      }
      return { isValid: false, error: `Unexpected error: ${error.message}` };
    }
    return { isValid: false, error: 'Unknown error occurred during connection test' };
  }
}

/**
 * Test Supabase connection with provided credentials
 * This function validates the project URL and anon key
 */
export async function testSupabaseConnection(
  request: ConnectionTestRequest
): Promise<ConnectionTestResponse> {
  try {
    // Check rate limit using new limiter
    const rateLimitOk = await checkRateLimit(connectionTestLimiter, request.userId || 'anonymous');
    if (!rateLimitOk) {
      logRateLimitViolation('connection/test', request.userId || 'anonymous');
      return {
        success: false,
        message: 'Rate limit exceeded',
        error: 'Too many connection attempts. Please wait a minute before trying again.',
      };
    }
    
    // Validate request data
    const validation = testConnectionSchema.safeParse(request);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return {
        success: false,
        message: 'Invalid request data',
        error: firstError.message,
      };
    }
    
    const { projectUrl, anonKey } = validation.data;
    
    // Validate credential strength
    const credentialValidation = validateCredentialStrength({ url: projectUrl, anonKey });
    if (!credentialValidation.isValid) {
      return {
        success: false,
        message: 'Invalid credentials',
        error: credentialValidation.errors.join('; '),
      };
    }
    
    // Log connection attempt (without exposing credentials)
    logInfo('SupabaseConnection', `Testing connection to project`, {
      projectUrl: projectUrl.replace(/https:\/\/([^.]+)/, 'https://***'),
      userId: request.userId,
    });
    
    // Validate the connection
    const startTime = Date.now();
    const result = await validateSupabaseClient(projectUrl, anonKey);
    const duration = Date.now() - startTime;
    
    // Log result
    logConnectionAttempt(
      'unknown', // We don't have project ID at this point
      request.userId || 'anonymous',
      projectUrl,
      result.isValid
    );
    
    if (result.isValid) {
      return {
        success: true,
        message: 'Connection successful',
        projectInfo: {
          url: projectUrl,
          isValid: true,
          timestamp: new Date().toISOString(),
        },
      };
    } else {
      return {
        success: false,
        message: 'Connection failed',
        error: result.error || 'Unable to connect to Supabase project',
      };
    }
  } catch (error) {
    console.error('[Supabase Connection Test] Unexpected error:', error);
    return {
      success: false,
      message: 'Connection test failed',
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Clear rate limit for a specific user (useful for testing)
 */
export function clearRateLimit(userId: string = 'anonymous'): void {
  connectionTestLimiter.reset(`user:${userId}`);
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(userId: string = 'anonymous'): {
  remaining: number;
  resetTime: number;
} | null {
  const status = connectionTestLimiter.getStatus(`user:${userId}`);
  if (!status) {
    return {
      remaining: 10, // Max requests from limiter config
      resetTime: Date.now() + 60000, // 1 minute window
    };
  }
  
  return {
    remaining: status.remaining,
    resetTime: status.resetTime,
  };
}