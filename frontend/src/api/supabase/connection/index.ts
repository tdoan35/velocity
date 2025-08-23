/**
 * Supabase Connection API
 * 
 * This module provides secure API endpoints for managing Supabase connections
 * with user-owned projects. All sensitive credentials are encrypted before storage.
 */

export {
  testSupabaseConnection,
  clearRateLimit,
  getRateLimitStatus,
  type ConnectionTestRequest,
  type ConnectionTestResponse,
} from './test';

export {
  storeSupabaseConnection,
  getStoredConnection,
  deleteStoredConnection,
  updateConnectionStatus,
  type StoreConnectionRequest,
  type StoreConnectionResponse,
} from './store';

export {
  checkConnectionHealth,
  batchHealthCheck,
  type HealthCheckRequest,
  type HealthCheckResponse,
} from './health';

// Re-export credential security utilities
export {
  encryptCredentials,
  decryptCredentials,
  isValidAnonKeyFormat,
  isValidSupabaseUrl,
  sanitizeForLogging,
  generateSecureToken,
  type SupabaseCredentials,
  type EncryptedCredentials,
} from '../../../utils/supabase/credentialSecurity';