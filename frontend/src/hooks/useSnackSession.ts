import { useState, useEffect, useCallback, useRef } from 'react';
import { snackService } from '../services/snackService';
import type { SnackSession, SnackPreviewOptions } from '../services/snackService';
import { useToast } from './use-toast';

export interface UseSnackSessionOptions {
  sessionId: string;
  userId?: string;
  projectId?: string;
  autoCreate?: boolean;
  initialOptions?: SnackPreviewOptions;
}

export interface UseSnackSessionReturn {
  session: SnackSession | null;
  isLoading: boolean;
  error: Error | null;
  snack: any; // Snack SDK instance
  webPreviewUrl: string | null;
  webPreviewRef: React.RefObject<Window | null>;
  qrCodeUrl: string | null;
  createSession: (options?: SnackPreviewOptions) => Promise<void>;
  updateCode: (filePath: string, contents: string) => Promise<void>;
  updateFiles: (files: Record<string, { type: string; contents: string }>) => Promise<void>;
  updateDependencies: (dependencies: Record<string, string>) => Promise<void>;
  saveSnapshot: () => Promise<void>;
  getDownloadUrl: () => Promise<string | null>;
  destroySession: () => Promise<void>;
  setWebPreviewRef: (ref: Window | null) => void;
}

export function useSnackSession({
  sessionId,
  userId,
  projectId,
  autoCreate = true,
  initialOptions,
}: UseSnackSessionOptions): UseSnackSessionReturn {
  const [session, setSession] = useState<SnackSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [webPreviewUrl, setWebPreviewUrl] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const webPreviewRef = useRef<Window | null>(null);
  
  const { toast } = useToast();
  const isMountedRef = useRef(true);

  // Create session with retry mechanism and session reuse
  const createSession = useCallback(async (options?: SnackPreviewOptions, retryCount = 0, forceNew = false) => {
    if (!isMountedRef.current) return;

    // Check if we can reuse existing session with same ID
    if (!forceNew && retryCount === 0) {
      const existingSession = snackService.getSession(sessionId);
      if (existingSession && !error) {
        console.log('[useSnackSession] Reusing existing session:', sessionId);
        setSession(existingSession);
        
        // Get current webPreviewUrl from existing session
        const currentUrl = snackService.getWebPreviewUrl(sessionId);
        if (currentUrl) {
          console.log('[useSnackSession] Found existing webPreviewUrl:', currentUrl);
          setWebPreviewUrl(currentUrl);
        }
        setQrCodeUrl(snackService.getQRCodeUrl(sessionId));
        setIsLoading(false);
        setError(null);
        return;
      }
    }

    const maxRetries = 3;
    const retryDelay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff, max 5s

    setIsLoading(true);
    if (retryCount === 0) {
      setError(null); // Only clear error on first attempt
    }

    try {
      console.log(`[useSnackSession] Creating new session (attempt ${retryCount + 1}/${maxRetries + 1}):`, sessionId);
      
      // Pass webPreviewRef during creation - this is required for web preview functionality
      const newSession = await snackService.createSession(
        sessionId,
        options || initialOptions || {},
        userId,
        projectId,
        webPreviewRef
      );

      if (isMountedRef.current) {
        setSession(newSession);
        // webPreviewUrl will be updated via Snack state listener
        setQrCodeUrl(snackService.getQRCodeUrl(sessionId));
        
        // Set up listener for webPreviewURL updates
        const unsubscribe = newSession.snack.addStateListener?.((state: any) => {
          if (isMountedRef.current) {
            console.log('[useSnackSession] State listener triggered:', {
              webPreviewURL: state?.webPreviewURL,
              online: state?.online,
              url: state?.url
            });
            
            // Use webPreviewURL from state if available, otherwise try url
            const url = state?.webPreviewURL || state?.url;
            if (url && url !== webPreviewUrl) {
              console.log('[useSnackSession] Setting webPreviewUrl:', url);
              setWebPreviewUrl(url);
            }
          }
        });

        // Store the unsubscribe function for cleanup
        if (unsubscribe) {
          (newSession as any)._webPreviewUrlUnsubscribe = unsubscribe;
        }
        
        // Immediately try to get webPreviewURL after session creation
        setTimeout(() => {
          if (isMountedRef.current) {
            const url = snackService.getWebPreviewUrl(sessionId);
            if (url) {
              console.log('[useSnackSession] Got initial webPreviewUrl from service:', url);
              setWebPreviewUrl(url);
            } else {
              console.log('[useSnackSession] No webPreviewUrl available yet, waiting for state updates...');
            }
          }
        }, 2000);
        
        // Also try again after a longer timeout in case Snack takes longer to initialize
        setTimeout(() => {
          if (isMountedRef.current && !webPreviewUrl) {
            const url = snackService.getWebPreviewUrl(sessionId);
            if (url) {
              console.log('[useSnackSession] Got delayed webPreviewUrl from service:', url);
              setWebPreviewUrl(url);
            } else {
              console.warn('[useSnackSession] Still no webPreviewUrl available after 5s - there may be an issue with Snack initialization');
            }
          }
        }, 5000);
      }
      
      // Successfully created session - always set loading to false on success
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    } catch (err) {
      const error = err as Error;
      console.error(`[useSnackSession] Session creation failed (attempt ${retryCount + 1}):`, error);
      
      if (isMountedRef.current) {
        // If we haven't exhausted retries, attempt again
        if (retryCount < maxRetries) {
          console.log(`[useSnackSession] Retrying in ${retryDelay}ms...`);
          setTimeout(() => {
            if (isMountedRef.current) {
              createSession(options, retryCount + 1, true); // Force new session on retry
            }
          }, retryDelay);
          return; // Don't set error state yet, keep trying
        }
        
        // All retries exhausted
        setError(error);
        setIsLoading(false);
        
        const isNetworkError = error.message.includes('network') || error.message.includes('fetch');
        toast({
          title: 'Failed to create Snack session',
          description: isNetworkError 
            ? 'Network connection issue. Please check your internet connection.' 
            : `Session failed after ${maxRetries + 1} attempts: ${error.message}`,
          variant: 'destructive',
        });
      }
    }
  }, [sessionId, userId, projectId, initialOptions, toast]);

  // Update code
  const updateCode = useCallback(async (filePath: string, contents: string) => {
    if (!session) {
      setError(new Error('No active session'));
      return;
    }

    try {
      await snackService.updateCode(sessionId, filePath, contents);
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast({
        title: 'Failed to update code',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [session, sessionId, toast]);

  // Update multiple files
  const updateFiles = useCallback(async (
    files: Record<string, { type: string; contents: string }>
  ) => {
    if (!session) {
      setError(new Error('No active session'));
      return;
    }

    try {
      await snackService.updateFiles(sessionId, files);
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast({
        title: 'Failed to update files',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [session, sessionId, toast]);

  // Update dependencies
  const updateDependencies = useCallback(async (dependencies: Record<string, string>) => {
    if (!session) {
      setError(new Error('No active session'));
      return;
    }

    try {
      await snackService.updateDependencies(sessionId, dependencies);
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast({
        title: 'Failed to update dependencies',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [session, sessionId, toast]);

  // Save snapshot
  const saveSnapshot = useCallback(async () => {
    if (!session) {
      setError(new Error('No active session'));
      return;
    }

    try {
      await snackService.saveSnapshot(sessionId);
      toast({
        title: 'Snapshot saved',
        description: 'Your project snapshot has been saved successfully.',
      });
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast({
        title: 'Failed to save snapshot',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [session, sessionId, toast]);

  // Get download URL
  const getDownloadUrl = useCallback(async (): Promise<string | null> => {
    if (!session) {
      setError(new Error('No active session'));
      return null;
    }

    try {
      const url = await snackService.getDownloadUrl(sessionId);
      return url;
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast({
        title: 'Failed to get download URL',
        description: error.message,
        variant: 'destructive',
      });
      return null;
    }
  }, [session, sessionId, toast]);

  // Set webPreviewRef
  const setWebPreviewRef = useCallback((ref: Window | null) => {
    webPreviewRef.current = ref;
    if (session) {
      snackService.setWebPreviewRef(sessionId, ref);
    }
  }, [session, sessionId]);

  // Destroy session
  const destroySession = useCallback(async () => {
    try {
      // Clean up webPreviewURL listener if exists
      if (session && (session as any)._webPreviewUrlUnsubscribe) {
        (session as any)._webPreviewUrlUnsubscribe();
      }
      
      await snackService.destroySession(sessionId);
      setSession(null);
      setWebPreviewUrl(null);
      setQrCodeUrl(null);
    } catch (err) {
      const error = err as Error;
      setError(error);
      toast({
        title: 'Failed to destroy session',
        description: error.message,
        variant: 'destructive',
      });
    }
  }, [sessionId, session, toast]);

  // Initialize session
  useEffect(() => {
    isMountedRef.current = true;

    // Check for existing session
    const existingSession = snackService.getSession(sessionId);
    if (existingSession) {
      setSession(existingSession);
      // Get current webPreviewUrl from Snack state
      const currentUrl = snackService.getWebPreviewUrl(sessionId);
      if (currentUrl) {
        setWebPreviewUrl(currentUrl);
      }
      setQrCodeUrl(snackService.getQRCodeUrl(sessionId));
      
      // Set up listener for existing session
      const unsubscribe = existingSession.snack.addStateListener?.((state: any) => {
        if (isMountedRef.current) {
          console.log('[useSnackSession] Existing session state listener triggered:', {
            webPreviewURL: state?.webPreviewURL,
            online: state?.online,
            url: state?.url
          });
          
          // Use webPreviewURL from state if available, otherwise try url
          const url = state?.webPreviewURL || state?.url;
          if (url && url !== webPreviewUrl) {
            console.log('[useSnackSession] Setting webPreviewUrl from existing session:', url);
            setWebPreviewUrl(url);
          }
        }
      });
      
      if (unsubscribe) {
        (existingSession as any)._webPreviewUrlUnsubscribe = unsubscribe;
      }
    } else if (autoCreate) {
      createSession();
    }

    return () => {
      isMountedRef.current = false;
    };
  }, [sessionId, autoCreate]); // Removed createSession from deps to avoid loop

  return {
    session,
    isLoading,
    error,
    snack: session?.snack || null,
    webPreviewUrl,
    webPreviewRef,
    qrCodeUrl,
    createSession,
    updateCode,
    updateFiles,
    updateDependencies,
    saveSnapshot,
    getDownloadUrl,
    destroySession,
    setWebPreviewRef,
  };
}