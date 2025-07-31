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
  webPlayerUrl: string | null;
  qrCodeUrl: string | null;
  createSession: (options?: SnackPreviewOptions) => Promise<void>;
  updateCode: (filePath: string, contents: string) => Promise<void>;
  updateFiles: (files: Record<string, { type: string; contents: string }>) => Promise<void>;
  updateDependencies: (dependencies: Record<string, string>) => Promise<void>;
  saveSnapshot: () => Promise<void>;
  getDownloadUrl: () => Promise<string | null>;
  destroySession: () => Promise<void>;
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
  const [webPlayerUrl, setWebPlayerUrl] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  
  const { toast } = useToast();
  const isMountedRef = useRef(true);

  // Create session
  const createSession = useCallback(async (options?: SnackPreviewOptions) => {
    if (!isMountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const newSession = await snackService.createSession(
        sessionId,
        options || initialOptions || {},
        userId,
        projectId
      );

      if (isMountedRef.current) {
        setSession(newSession);
        setWebPlayerUrl(snackService.getWebPlayerUrl(sessionId));
        setQrCodeUrl(snackService.getQRCodeUrl(sessionId));
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

  // Destroy session
  const destroySession = useCallback(async () => {
    try {
      await snackService.destroySession(sessionId);
      setSession(null);
      setWebPlayerUrl(null);
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
  }, [sessionId, toast]);

  // Initialize session
  useEffect(() => {
    isMountedRef.current = true;

    // Check for existing session
    const existingSession = snackService.getSession(sessionId);
    if (existingSession) {
      setSession(existingSession);
      setWebPlayerUrl(snackService.getWebPlayerUrl(sessionId));
      setQrCodeUrl(snackService.getQRCodeUrl(sessionId));
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
    webPlayerUrl,
    qrCodeUrl,
    createSession,
    updateCode,
    updateFiles,
    updateDependencies,
    saveSnapshot,
    getDownloadUrl,
    destroySession,
  };
}