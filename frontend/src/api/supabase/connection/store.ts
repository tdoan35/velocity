import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { encryptCredentials, decryptCredentials, validateCredentialStrength } from '../../../utils/supabase/credentialSecurity';
import { supabase } from '../../../lib/supabase';
import { credentialStoreLimiter, checkRateLimit } from '../../../middleware/rateLimiter';
import { logInfo, logError, logSecurityEvent, logRateLimitViolation } from '../../../utils/logging/supabaseConnectionLogger';

// Request validation schema
const storeConnectionSchema = z.object({
  projectId: z.string().uuid('Invalid project ID format'),
  projectUrl: z.string().url().refine(
    (url) => {
      const supabasePattern = /^https:\/\/[a-z0-9-]+\.supabase\.co$/;
      return supabasePattern.test(url);
    },
    { message: 'Invalid Supabase project URL format' }
  ),
  anonKey: z.string().min(1, 'Anon key is required'),
  userId: z.string().uuid('Invalid user ID format'),
});

export interface StoreConnectionRequest {
  projectId: string;
  projectUrl: string;
  anonKey: string;
  userId: string;
}

export interface StoreConnectionResponse {
  success: boolean;
  message: string;
  connectionId?: string;
  error?: string;
}

/**
 * Check if a connection already exists for this project
 */
async function checkExistingConnection(
  projectId: string,
  userId: string
): Promise<{ exists: boolean; connectionId?: string }> {
  try {
    const { data, error } = await supabase
      .from('user_supabase_connections')
      .select('id')
      .eq('velocity_project_id', projectId)
      .eq('user_id', userId)
      .single();
    
    if (error && error.code !== 'PGRST116') {
      // PGRST116 means no rows found, which is expected
      console.error('[Store Connection] Error checking existing connection:', error);
      return { exists: false };
    }
    
    return {
      exists: !!data,
      connectionId: data?.id,
    };
  } catch (error) {
    console.error('[Store Connection] Unexpected error checking connection:', error);
    return { exists: false };
  }
}

/**
 * Store encrypted Supabase connection in database
 */
export async function storeSupabaseConnection(
  request: StoreConnectionRequest
): Promise<StoreConnectionResponse> {
  try {
    // Check rate limit
    const rateLimitOk = await checkRateLimit(credentialStoreLimiter, request.userId);
    if (!rateLimitOk) {
      logRateLimitViolation('connection/store', request.userId);
      return {
        success: false,
        message: 'Rate limit exceeded',
        error: 'Too many credential operations. Please wait before trying again.',
      };
    }
    
    // Validate request data
    const validation = storeConnectionSchema.safeParse(request);
    if (!validation.success) {
      const firstError = validation.error.errors[0];
      return {
        success: false,
        message: 'Invalid request data',
        error: firstError.message,
      };
    }
    
    const { projectId, projectUrl, anonKey, userId } = validation.data;
    
    // Validate credential strength
    const credentialValidation = validateCredentialStrength({ url: projectUrl, anonKey });
    if (!credentialValidation.isValid) {
      logSecurityEvent('Invalid credential format attempted', userId, {
        projectId,
        errors: credentialValidation.errors,
      });
      return {
        success: false,
        message: 'Invalid credentials',
        error: credentialValidation.errors.join('; '),
      };
    }
    
    // Log storage attempt (without exposing credentials)
    logInfo('SupabaseConnection', 'Storing connection for project', {
      projectId,
      userId,
      warnings: credentialValidation.warnings,
    });
    
    // Check for existing connection
    const existing = await checkExistingConnection(projectId, userId);
    
    // Encrypt the credentials
    const encryptedData = await encryptCredentials({
      url: projectUrl,
      anonKey: anonKey,
    });
    
    // Prepare connection data
    const connectionData = {
      velocity_project_id: projectId,
      user_id: userId,
      project_url: projectUrl,
      encrypted_anon_key: encryptedData.encryptedAnonKey,
      encryption_iv: encryptedData.encryptionIv,
      last_validated: new Date().toISOString(),
      connection_status: 'active',
    };
    
    let result;
    
    if (existing.exists && existing.connectionId) {
      // Update existing connection
      const { data, error } = await supabase
        .from('user_supabase_connections')
        .update(connectionData)
        .eq('id', existing.connectionId)
        .select()
        .single();
      
      if (error) {
        logError('SupabaseConnection', 'Error updating connection', error, { projectId, userId });
        return {
          success: false,
          message: 'Failed to update connection',
          error: error.message,
        };
      }
      
      result = data;
      logInfo('SupabaseConnection', 'Updated existing connection', { 
        projectId, 
        connectionId: existing.connectionId 
      });
    } else {
      // Insert new connection
      const { data, error } = await supabase
        .from('user_supabase_connections')
        .insert(connectionData)
        .select()
        .single();
      
      if (error) {
        logError('SupabaseConnection', 'Error inserting connection', error, { projectId, userId });
        return {
          success: false,
          message: 'Failed to store connection',
          error: error.message,
        };
      }
      
      result = data;
      logInfo('SupabaseConnection', 'Created new connection', { 
        projectId, 
        connectionId: data.id 
      });
      
      // Log security event for new connection
      logSecurityEvent('Supabase connection created', userId, {
        projectId,
        connectionId: data.id,
      });
    }
    
    return {
      success: true,
      message: existing.exists ? 'Connection updated successfully' : 'Connection stored successfully',
      connectionId: result.id,
    };
  } catch (error) {
    console.error('[Store Connection] Unexpected error:', error);
    return {
      success: false,
      message: 'Failed to store connection',
      error: error instanceof Error ? error.message : 'An unexpected error occurred',
    };
  }
}

/**
 * Retrieve and decrypt stored Supabase connection
 */
export async function getStoredConnection(
  projectId: string,
  userId: string
): Promise<{
  success: boolean;
  connection?: {
    projectUrl: string;
    anonKey: string;
    lastValidated: string;
    status: string;
  };
  error?: string;
}> {
  try {
    // Fetch connection from database
    const { data, error } = await supabase
      .from('user_supabase_connections')
      .select('*')
      .eq('velocity_project_id', projectId)
      .eq('user_id', userId)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return {
          success: false,
          error: 'No connection found for this project',
        };
      }
      console.error('[Get Connection] Error fetching connection:', error);
      return {
        success: false,
        error: error.message,
      };
    }
    
    if (!data) {
      return {
        success: false,
        error: 'No connection found',
      };
    }
    
    // Decrypt the anon key
    const decryptedAnonKey = await decryptCredentials(
      data.encrypted_anon_key,
      data.encryption_iv
    );
    
    return {
      success: true,
      connection: {
        projectUrl: data.project_url,
        anonKey: decryptedAnonKey,
        lastValidated: data.last_validated,
        status: data.connection_status,
      },
    };
  } catch (error) {
    console.error('[Get Connection] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve connection',
    };
  }
}

/**
 * Delete stored Supabase connection
 */
export async function deleteStoredConnection(
  projectId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log(`[Delete Connection] Deleting connection for project: ${projectId}`);
    
    const { error } = await supabase
      .from('user_supabase_connections')
      .delete()
      .eq('velocity_project_id', projectId)
      .eq('user_id', userId);
    
    if (error) {
      console.error('[Delete Connection] Error deleting connection:', error);
      return {
        success: false,
        error: error.message,
      };
    }
    
    console.log(`[Delete Connection] Successfully deleted connection for project: ${projectId}`);
    return { success: true };
  } catch (error) {
    console.error('[Delete Connection] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete connection',
    };
  }
}

/**
 * Update connection status
 */
export async function updateConnectionStatus(
  projectId: string,
  userId: string,
  status: 'active' | 'error' | 'disconnected',
  errorMessage?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: any = {
      connection_status: status,
      last_validated: new Date().toISOString(),
    };
    
    if (errorMessage) {
      updateData.last_error = errorMessage;
    }
    
    const { error } = await supabase
      .from('user_supabase_connections')
      .update(updateData)
      .eq('velocity_project_id', projectId)
      .eq('user_id', userId);
    
    if (error) {
      console.error('[Update Status] Error updating connection status:', error);
      return {
        success: false,
        error: error.message,
      };
    }
    
    return { success: true };
  } catch (error) {
    console.error('[Update Status] Unexpected error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update connection status',
    };
  }
}