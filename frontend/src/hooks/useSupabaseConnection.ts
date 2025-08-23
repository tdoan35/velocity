import { useState, useEffect, useCallback, useRef } from 'react';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  type SupabaseCredentials,
  validateSupabaseConnection,
  storeSupabaseConnectionForProject,
  getStoredConnectionForProject,
  updateSupabaseConnection,
  disconnectSupabaseProject,
  testConnectionHealth,
  createSupabaseClientFromStoredCredentials,
  type ConnectionTestResult
} from '../services/supabaseConnection';

export interface SupabaseConnectionState {
  isConnected: boolean;
  isConnecting: boolean;
  isHealthy: boolean;
  projectUrl: string | null;
  lastValidated: Date | null;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: string | null;
  supabaseClient: SupabaseClient | null;
}

export interface UseSupabaseConnectionReturn {
  connectionState: SupabaseConnectionState;
  connectSupabase: (credentials: SupabaseCredentials) => Promise<ConnectionTestResult>;
  disconnectSupabase: () => Promise<{ success: boolean; error?: string }>;
  updateConnection: (credentials: SupabaseCredentials) => Promise<{ success: boolean; error?: string }>;
  checkConnectionHealth: () => Promise<ConnectionTestResult>;
  refreshConnection: () => Promise<void>;
}

// Cache for connection status to minimize validation calls
const connectionCache = new Map<string, {
  state: SupabaseConnectionState;
  timestamp: number;
}>();

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useSupabaseConnection(velocityProjectId: string): UseSupabaseConnectionReturn {
  const [connectionState, setConnectionState] = useState<SupabaseConnectionState>({
    isConnected: false,
    isConnecting: false,
    isHealthy: false,
    projectUrl: null,
    lastValidated: null,
    connectionStatus: 'disconnected',
    error: null,
    supabaseClient: null
  });

  const healthCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // Load cached connection state if available
  const loadCachedState = useCallback(() => {
    const cached = connectionCache.get(velocityProjectId);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.state;
    }
    return null;
  }, [velocityProjectId]);

  // Update cache when state changes
  const updateCache = useCallback((state: SupabaseConnectionState) => {
    connectionCache.set(velocityProjectId, {
      state,
      timestamp: Date.now()
    });
  }, [velocityProjectId]);

  // Initialize connection state from stored data
  const initializeConnection = useCallback(async () => {
    // Check cache first
    const cachedState = loadCachedState();
    if (cachedState) {
      setConnectionState(cachedState);
      return;
    }

    try {
      setConnectionState(prev => ({ ...prev, isConnecting: true }));
      
      const storedConnection = await getStoredConnectionForProject(velocityProjectId);
      
      if (!storedConnection) {
        const newState: SupabaseConnectionState = {
          isConnected: false,
          isConnecting: false,
          isHealthy: false,
          projectUrl: null,
          lastValidated: null,
          connectionStatus: 'disconnected',
          error: null,
          supabaseClient: null
        };
        setConnectionState(newState);
        updateCache(newState);
        return;
      }

      // Create Supabase client from stored credentials
      const client = await createSupabaseClientFromStoredCredentials(velocityProjectId);
      
      if (client) {
        // Test the connection health
        const healthResult = await testConnectionHealth(velocityProjectId);
        
        const newState: SupabaseConnectionState = {
          isConnected: true,
          isConnecting: false,
          isHealthy: healthResult.success,
          projectUrl: storedConnection.projectUrl,
          lastValidated: storedConnection.lastValidated,
          connectionStatus: healthResult.success ? 'connected' : 'error',
          error: healthResult.success ? null : healthResult.error || null,
          supabaseClient: client
        };
        
        if (isMountedRef.current) {
          setConnectionState(newState);
          updateCache(newState);
        }
      } else {
        const newState: SupabaseConnectionState = {
          isConnected: false,
          isConnecting: false,
          isHealthy: false,
          projectUrl: storedConnection.projectUrl,
          lastValidated: storedConnection.lastValidated,
          connectionStatus: 'error',
          error: 'Failed to create Supabase client',
          supabaseClient: null
        };
        
        if (isMountedRef.current) {
          setConnectionState(newState);
          updateCache(newState);
        }
      }
    } catch (error) {
      const newState: SupabaseConnectionState = {
        isConnected: false,
        isConnecting: false,
        isHealthy: false,
        projectUrl: null,
        lastValidated: null,
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : 'Failed to initialize connection',
        supabaseClient: null
      };
      
      if (isMountedRef.current) {
        setConnectionState(newState);
        updateCache(newState);
      }
    }
  }, [velocityProjectId, loadCachedState, updateCache]);

  // Connect to Supabase with provided credentials
  const connectSupabase = useCallback(async (
    credentials: SupabaseCredentials
  ): Promise<ConnectionTestResult> => {
    try {
      setConnectionState(prev => ({
        ...prev,
        isConnecting: true,
        connectionStatus: 'connecting',
        error: null
      }));

      // Validate the connection first
      const validationResult = await validateSupabaseConnection(credentials);
      
      if (!validationResult.success) {
        const newState: SupabaseConnectionState = {
          ...connectionState,
          isConnecting: false,
          connectionStatus: 'error',
          error: validationResult.message
        };
        setConnectionState(newState);
        updateCache(newState);
        return validationResult;
      }

      // Store the credentials (encryption happens server-side)
      const storeResult = await storeSupabaseConnectionForProject(velocityProjectId, credentials);
      
      if (!storeResult.success) {
        const newState: SupabaseConnectionState = {
          ...connectionState,
          isConnecting: false,
          connectionStatus: 'error',
          error: storeResult.error || 'Failed to store connection'
        };
        setConnectionState(newState);
        updateCache(newState);
        return {
          success: false,
          message: storeResult.error || 'Failed to store connection'
        };
      }

      // Create Supabase client
      const client = await createSupabaseClientFromStoredCredentials(velocityProjectId);
      
      if (client) {
        const newState: SupabaseConnectionState = {
          isConnected: true,
          isConnecting: false,
          isHealthy: true,
          projectUrl: credentials.projectUrl,
          lastValidated: new Date(),
          connectionStatus: 'connected',
          error: null,
          supabaseClient: client
        };
        
        setConnectionState(newState);
        updateCache(newState);
        
        return {
          success: true,
          message: 'Successfully connected to Supabase project'
        };
      } else {
        const newState: SupabaseConnectionState = {
          ...connectionState,
          isConnecting: false,
          connectionStatus: 'error',
          error: 'Failed to create Supabase client'
        };
        setConnectionState(newState);
        updateCache(newState);
        return {
          success: false,
          message: 'Failed to create Supabase client'
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      const newState: SupabaseConnectionState = {
        ...connectionState,
        isConnecting: false,
        connectionStatus: 'error',
        error: errorMessage
      };
      setConnectionState(newState);
      updateCache(newState);
      return {
        success: false,
        message: errorMessage
      };
    }
  }, [velocityProjectId, connectionState, updateCache]);

  // Disconnect from Supabase
  const disconnectSupabase = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const result = await disconnectSupabaseProject(velocityProjectId);
      
      if (result.success) {
        const newState: SupabaseConnectionState = {
          isConnected: false,
          isConnecting: false,
          isHealthy: false,
          projectUrl: null,
          lastValidated: null,
          connectionStatus: 'disconnected',
          error: null,
          supabaseClient: null
        };
        setConnectionState(newState);
        updateCache(newState);
        
        // Clear the health check interval
        if (healthCheckIntervalRef.current) {
          clearInterval(healthCheckIntervalRef.current);
          healthCheckIntervalRef.current = null;
        }
      }
      
      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disconnect'
      };
    }
  }, [velocityProjectId, updateCache]);

  // Update existing connection with new credentials
  const updateConnection = useCallback(async (
    credentials: SupabaseCredentials
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      setConnectionState(prev => ({
        ...prev,
        isConnecting: true,
        connectionStatus: 'connecting',
        error: null
      }));

      const result = await updateSupabaseConnection(velocityProjectId, credentials);
      
      if (result.success) {
        // Recreate the client with new credentials
        const client = await createSupabaseClientFromStoredCredentials(velocityProjectId);
        
        if (client) {
          const newState: SupabaseConnectionState = {
            isConnected: true,
            isConnecting: false,
            isHealthy: true,
            projectUrl: credentials.projectUrl,
            lastValidated: new Date(),
            connectionStatus: 'connected',
            error: null,
            supabaseClient: client
          };
          setConnectionState(newState);
          updateCache(newState);
        }
      } else {
        setConnectionState(prev => ({
          ...prev,
          isConnecting: false,
          connectionStatus: 'error',
          error: result.error || 'Failed to update connection'
        }));
      }
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update connection';
      setConnectionState(prev => ({
        ...prev,
        isConnecting: false,
        connectionStatus: 'error',
        error: errorMessage
      }));
      return {
        success: false,
        error: errorMessage
      };
    }
  }, [velocityProjectId, updateCache]);

  // Check connection health
  const checkConnectionHealth = useCallback(async (): Promise<ConnectionTestResult> => {
    if (!connectionState.isConnected) {
      return {
        success: false,
        message: 'No active connection'
      };
    }

    try {
      const healthResult = await testConnectionHealth(velocityProjectId);
      
      setConnectionState(prev => ({
        ...prev,
        isHealthy: healthResult.success,
        lastValidated: new Date(),
        connectionStatus: healthResult.success ? 'connected' : 'error',
        error: healthResult.success ? null : healthResult.error || null
      }));
      
      return healthResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Health check failed';
      setConnectionState(prev => ({
        ...prev,
        isHealthy: false,
        connectionStatus: 'error',
        error: errorMessage
      }));
      return {
        success: false,
        message: errorMessage
      };
    }
  }, [velocityProjectId, connectionState.isConnected]);

  // Refresh connection (re-initialize from stored data)
  const refreshConnection = useCallback(async () => {
    // Clear cache to force reload
    connectionCache.delete(velocityProjectId);
    await initializeConnection();
  }, [velocityProjectId, initializeConnection]);

  // Initialize connection on mount
  useEffect(() => {
    isMountedRef.current = true;
    initializeConnection();

    // Set up periodic health checks every 5 minutes
    healthCheckIntervalRef.current = setInterval(async () => {
      if (connectionState.isConnected && isMountedRef.current) {
        await checkConnectionHealth();
      }
    }, 5 * 60 * 1000);

    return () => {
      isMountedRef.current = false;
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
    };
  }, [velocityProjectId]); // Only re-run if project ID changes

  return {
    connectionState,
    connectSupabase,
    disconnectSupabase,
    updateConnection,
    checkConnectionHealth,
    refreshConnection
  };
}