import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export interface PreviewSession {
  sessionId: string;
  containerUrl?: string;
  status: 'creating' | 'active' | 'ended' | 'error';
  errorMessage?: string;
}

export type PreviewStatus = 'idle' | 'starting' | 'running' | 'error' | 'stopping';

interface UsePreviewSessionOptions {
  projectId: string;
  onError?: (error: Error) => void;
  onStatusChange?: (status: PreviewStatus, session?: PreviewSession) => void;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export function usePreviewSession({ 
  projectId, 
  onError, 
  onStatusChange 
}: UsePreviewSessionOptions) {
  const [session, setSession] = useState<PreviewSession | null>(null);
  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [isLoading, setIsLoading] = useState(false);

  // Get orchestrator service URL from environment
  const orchestratorUrl = import.meta.env.VITE_ORCHESTRATOR_URL || 'http://localhost:8080';
  
  // Remove trailing slash from orchestrator URL
  const cleanOrchestratorUrl = orchestratorUrl.replace(/\/$/, '');

  const updateStatus = useCallback((newStatus: PreviewStatus, newSession?: PreviewSession) => {
    setStatus(newStatus);
    onStatusChange?.(newStatus, newSession);
  }, [onStatusChange]);

  // Helper function to make authenticated requests to orchestrator
  const makeAuthenticatedRequest = async (
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<Response> => {
    if (!supabase) {
      throw new Error('Supabase client not initialized');
    }
    
    const { data: { session: authSession } } = await supabase.auth.getSession();
    
    console.log('[usePreviewSession] Auth session check:', {
      hasSession: !!authSession,
      hasAccessToken: !!authSession?.access_token,
      userEmail: authSession?.user?.email,
      tokenLength: authSession?.access_token?.length
    });
    
    if (!authSession?.access_token) {
      throw new Error('User not authenticated');
    }

    const requestUrl = `${cleanOrchestratorUrl}/api${endpoint}`;
    const requestOptions = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authSession.access_token}`,
        ...options.headers,
      },
    };
    
    console.log('[usePreviewSession] Making request:', {
      url: requestUrl,
      method: options.method || 'GET',
      hasAuth: !!authSession.access_token,
      body: options.body
    });
    
    const response = await fetch(requestUrl, requestOptions);

    console.log('[usePreviewSession] Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      const responseText = await response.text();
      console.log('[usePreviewSession] Raw error response:', responseText);
      
      let errorData;
      try {
        errorData = JSON.parse(responseText);
      } catch {
        errorData = { 
          error: `Network error - HTTP ${response.status}`,
          message: response.statusText,
          rawResponse: responseText
        };
      }
      
      console.log('[usePreviewSession] Error response:', errorData);
      
      // Provide more specific error messages
      let errorMessage = errorData.error || `HTTP ${response.status}`;
      if (response.status === 401) {
        errorMessage = `Authentication failed: ${errorData.error || 'Invalid token'}. Please try signing out and back in.`;
      } else if (response.status === 404) {
        errorMessage = 'Orchestrator service endpoint not found. Please check the configuration.';
      } else if (response.status >= 500) {
        // Check for specific database/validation errors in 500 responses
        if (errorData.error && errorData.error.includes('invalid input syntax for type uuid')) {
          errorMessage = 'Invalid project ID format. Project ID must be a valid UUID.';
        } else {
          errorMessage = `Server error: ${errorData.error || 'Orchestrator service is currently unavailable. Please try again later.'}`;
        }
      }
      
      throw new Error(errorMessage);
    }

    return response;
  };

  // Start a new preview session
  const startSession = useCallback(async (deviceType?: string) => {
    if (status === 'starting' || status === 'running') {
      return session;
    }

    setIsLoading(true);
    updateStatus('starting');

    try {
      // Get current user ID for the request
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const userId = authSession?.user?.id;
      
      if (!userId) {
        throw new Error('User not authenticated');
      }

      const response = await makeAuthenticatedRequest('/sessions/start', {
        method: 'POST',
        body: JSON.stringify({ 
          projectId,
          userId,
          tier: 'free',
          deviceType: deviceType || 'mobile',
          options: {} 
        }),
      });

      const result: ApiResponse<{
        sessionId: string;
        containerUrl?: string;
        status: 'creating' | 'active';
      }> = await response.json();

      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to start session');
      }

      const newSession: PreviewSession = {
        sessionId: result.data.sessionId,
        containerUrl: result.data.containerUrl,
        status: result.data.status,
      };

      setSession(newSession);
      updateStatus(result.data.status === 'active' ? 'running' : 'starting', newSession);

      // Poll for status updates if session is still creating
      if (result.data.status === 'creating') {
        pollSessionStatus(result.data.sessionId);
      }

      return newSession;
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('Unknown error');
      console.error('Failed to start preview session:', errorObj);
      updateStatus('error');
      onError?.(errorObj);
      throw errorObj;
    } finally {
      setIsLoading(false);
    }
  }, [projectId, status, session, orchestratorUrl, supabase, onError, updateStatus]);

  // Stop the current preview session
  const stopSession = useCallback(async () => {
    if (!session?.sessionId || status === 'stopping' || status === 'idle') {
      return;
    }

    setIsLoading(true);
    updateStatus('stopping');

    try {
      await makeAuthenticatedRequest('/sessions/stop', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      setSession(null);
      updateStatus('idle');
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error('Unknown error');
      console.error('Failed to stop preview session:', errorObj);
      updateStatus('error');
      onError?.(errorObj);
      throw errorObj;
    } finally {
      setIsLoading(false);
    }
  }, [session, status, orchestratorUrl, supabase, onError, updateStatus]);

  // Get session status
  const getSessionStatus = useCallback(async (sessionId: string): Promise<PreviewSession | null> => {
    try {
      const response = await makeAuthenticatedRequest(`/sessions/${sessionId}/status`);
      
      const result: ApiResponse<{
        sessionId: string;
        status: 'creating' | 'active' | 'ended' | 'error';
        containerUrl?: string;
        containerId?: string;
        errorMessage?: string;
      }> = await response.json();

      if (!result.success || !result.data) {
        return null;
      }

      return {
        sessionId: result.data.sessionId,
        containerUrl: result.data.containerUrl,
        status: result.data.status,
        errorMessage: result.data.errorMessage,
      };
    } catch (error) {
      console.error('Failed to get session status:', error);
      return null;
    }
  }, [orchestratorUrl, supabase]);

  // Poll session status until it becomes active or errors
  const pollSessionStatus = useCallback(async (sessionId: string) => {
    const maxAttempts = 30; // 5 minutes with 10s intervals
    let attempts = 0;

    const poll = async () => {
      if (attempts >= maxAttempts) {
        updateStatus('error');
        onError?.(new Error('Session creation timeout'));
        return;
      }

      try {
        const sessionStatus = await getSessionStatus(sessionId);
        
        if (!sessionStatus) {
          updateStatus('error');
          onError?.(new Error('Session not found'));
          return;
        }

        setSession(sessionStatus);

        switch (sessionStatus.status) {
          case 'active':
            updateStatus('running', sessionStatus);
            return; // Stop polling
          
          case 'error':
            updateStatus('error', sessionStatus);
            onError?.(new Error(sessionStatus.errorMessage || 'Session failed'));
            return; // Stop polling
          
          case 'ended':
            setSession(null);
            updateStatus('idle');
            return; // Stop polling
          
          case 'creating':
            // Continue polling
            attempts++;
            setTimeout(poll, 10000); // Poll every 10 seconds
            break;
        }
      } catch (error) {
        console.error('Error polling session status:', error);
        attempts++;
        setTimeout(poll, 10000);
      }
    };

    // Start polling after a short delay
    setTimeout(poll, 2000);
  }, [getSessionStatus, onError, updateStatus]);

  // Refresh session status
  const refreshStatus = useCallback(async () => {
    if (!session?.sessionId) return;

    try {
      const sessionStatus = await getSessionStatus(session.sessionId);
      if (sessionStatus) {
        setSession(sessionStatus);
        
        // Update status based on session status
        switch (sessionStatus.status) {
          case 'creating':
            updateStatus('starting', sessionStatus);
            break;
          case 'active':
            updateStatus('running', sessionStatus);
            break;
          case 'error':
            updateStatus('error', sessionStatus);
            break;
          case 'ended':
            setSession(null);
            updateStatus('idle');
            break;
        }
      }
    } catch (error) {
      console.error('Failed to refresh session status:', error);
    }
  }, [session, getSessionStatus, updateStatus]);

  // Auto-cleanup on unmount
  useEffect(() => {
    return () => {
      if (session?.sessionId && status === 'running') {
        // Don't await this - fire and forget cleanup
        makeAuthenticatedRequest('/sessions/stop', {
          method: 'POST',
          body: JSON.stringify({ sessionId: session.sessionId }),
        }).catch(console.error);
      }
    };
  }, [session, status]);

  return {
    session,
    status,
    isLoading,
    startSession,
    stopSession,
    refreshStatus,
    // Computed properties
    isActive: status === 'running' && session?.status === 'active',
    containerUrl: session?.containerUrl,
    errorMessage: session?.errorMessage,
  };
}