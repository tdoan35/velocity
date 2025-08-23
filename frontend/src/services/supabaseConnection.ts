import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  testSupabaseConnection,
  storeSupabaseConnection,
  getStoredConnection,
  deleteStoredConnection,
  checkConnectionHealth,
  updateConnectionStatus,
  type ConnectionTestRequest,
  type ConnectionTestResponse,
  type StoreConnectionRequest,
  type StoreConnectionResponse,
  type HealthCheckRequest,
  type HealthCheckResponse,
} from '../api/supabase/connection';
import { useAuthStore } from '../stores/useAuthStore';

// Types for Supabase connection
export interface SupabaseCredentials {
  projectUrl: string;
  anonKey: string;
}

export interface EncryptedCredentials {
  projectUrl: string;
  encryptedAnonKey: string;
  encryptionIv: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  error?: string;
}

export interface StoredConnection {
  velocityProjectId: string;
  projectUrl: string;
  encryptedAnonKey: string;
  encryptionIv: string;
  lastValidated: Date;
  connectionStatus: 'active' | 'error' | 'disconnected';
}

/**
 * Validates the format of a Supabase project URL
 */
export function isValidSupabaseUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    // Check if it's a valid Supabase URL pattern
    const supabasePattern = /^https:\/\/[a-zA-Z0-9-]+\.(supabase\.co|supabase\.in)$/;
    return supabasePattern.test(parsedUrl.origin);
  } catch {
    return false;
  }
}

/**
 * Tests a connection to a Supabase project using provided credentials
 * Uses the API endpoint with rate limiting and proper validation
 */
export async function validateSupabaseConnection(
  credentials: SupabaseCredentials
): Promise<ConnectionTestResult> {
  // Get current user for rate limiting
  const { user } = useAuthStore.getState();
  const userId = user?.id;
  
  // Use the API endpoint for testing
  const request: ConnectionTestRequest = {
    projectUrl: credentials.projectUrl,
    anonKey: credentials.anonKey,
    userId: userId || 'anonymous',
  };
  
  const response = await testSupabaseConnection(request);
  
  return {
    success: response.success,
    message: response.message,
    error: response.error,
  };
}

/**
 * Stores Supabase connection in the database with encryption
 */
export async function storeSupabaseConnectionForProject(
  velocityProjectId: string,
  credentials: SupabaseCredentials
): Promise<{ success: boolean; error?: string }> {
  // Get current user
  const { user } = useAuthStore.getState();
  if (!user) {
    return { success: false, error: 'User not authenticated' };
  }
  
  const request: StoreConnectionRequest = {
    projectId: velocityProjectId,
    projectUrl: credentials.projectUrl,
    anonKey: credentials.anonKey,
    userId: user.id,
  };
  
  const response = await storeSupabaseConnection(request);
  
  return {
    success: response.success,
    error: response.error,
  };
}

/**
 * Tests the health of an existing Supabase connection
 */
export async function testConnectionHealth(
  velocityProjectId: string
): Promise<ConnectionTestResult> {
  // Get current user
  const { user } = useAuthStore.getState();
  if (!user) {
    return {
      success: false,
      message: 'User not authenticated',
      error: 'NOT_AUTHENTICATED',
    };
  }
  
  const request: HealthCheckRequest = {
    projectId: velocityProjectId,
    userId: user.id,
  };
  
  const response = await checkConnectionHealth(request);
  
  return {
    success: response.success && response.isHealthy,
    message: response.isHealthy ? 'Connection healthy' : 'Connection unhealthy',
    error: response.error,
  };
}

/**
 * Retrieves stored connection for a project
 */
export async function getStoredConnectionForProject(
  velocityProjectId: string
): Promise<StoredConnection | null> {
  // Get current user
  const { user } = useAuthStore.getState();
  if (!user) {
    return null;
  }
  
  const result = await getStoredConnection(velocityProjectId, user.id);
  
  if (!result.success || !result.connection) {
    return null;
  }
  
  return {
    velocityProjectId,
    projectUrl: result.connection.projectUrl,
    encryptedAnonKey: '', // Not exposed to client
    encryptionIv: '', // Not exposed to client
    lastValidated: new Date(result.connection.lastValidated),
    connectionStatus: result.connection.status as 'active' | 'error' | 'disconnected',
  };
}

/**
 * Updates an existing Supabase connection
 */
export async function updateSupabaseConnection(
  velocityProjectId: string,
  credentials: SupabaseCredentials
): Promise<{ success: boolean; error?: string }> {
  // First validate the new credentials
  const validationResult = await validateSupabaseConnection(credentials);
  if (!validationResult.success) {
    return { success: false, error: validationResult.message };
  }

  // Store the updated connection (the API will handle encryption)
  return storeSupabaseConnectionForProject(velocityProjectId, credentials);
}

/**
 * Disconnects and removes stored Supabase connection
 */
export async function disconnectSupabaseProject(
  velocityProjectId: string
): Promise<{ success: boolean; error?: string }> {
  // Get current user
  const { user } = useAuthStore.getState();
  if (!user) {
    return { success: false, error: 'User not authenticated' };
  }
  
  return deleteStoredConnection(velocityProjectId, user.id);
}

/**
 * Creates a Supabase client from stored credentials
 */
export async function createSupabaseClientFromStoredCredentials(
  velocityProjectId: string
): Promise<SupabaseClient | null> {
  try {
    // Get current user
    const { user } = useAuthStore.getState();
    if (!user) {
      return null;
    }
    
    const result = await getStoredConnection(velocityProjectId, user.id);
    
    if (!result.success || !result.connection) {
      return null;
    }
    
    // Create client with decrypted credentials
    // Note: The API returns the decrypted anon key securely
    return createClient(result.connection.projectUrl, result.connection.anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  } catch (error) {
    console.error('Error creating Supabase client from stored credentials:', error);
    return null;
  }
}

/**
 * Updates the connection status in the database
 */
export async function updateStoredConnectionStatus(
  velocityProjectId: string,
  status: 'active' | 'error' | 'disconnected',
  errorMessage?: string
): Promise<{ success: boolean; error?: string }> {
  // Get current user
  const { user } = useAuthStore.getState();
  if (!user) {
    return { success: false, error: 'User not authenticated' };
  }
  
  return updateConnectionStatus(velocityProjectId, user.id, status, errorMessage);
}

// Export commonly used utility functions from the API
export { isValidAnonKeyFormat, sanitizeForLogging } from '../api/supabase/connection';