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

  // Create session
  const createSession = useCallback(async (options?: SnackPreviewOptions) => {
    if (!isMountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
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
        }, 1500);
      }
    } catch (err) {
      const error = err as Error;
      if (isMountedRef.current) {
        setError(error);
        toast({
          title: 'Failed to create Snack session',
          description: error.message,
          variant: 'destructive',
        });
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
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