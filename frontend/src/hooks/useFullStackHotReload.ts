import { useEffect, useState, useCallback } from 'react';
import { hotReloadService, type HotReloadConfig, type FileChange, type HotReloadResult } from '../services/fullStackHotReload';
import { toast } from 'sonner';

interface UseFullStackHotReloadOptions {
  projectId: string;
  supabaseProjectId?: string;
  frontendEnabled?: boolean;
  backendEnabled?: boolean;
  watchPatterns?: string[];
  onFileChange?: (changes: FileChange[]) => void;
  onReloadComplete?: (result: HotReloadResult) => void;
}

interface HotReloadStatus {
  active: boolean;
  frontendEnabled: boolean;
  backendEnabled: boolean;
  pendingChanges: number;
}

export function useFullStackHotReload(options: UseFullStackHotReloadOptions) {
  const [status, setStatus] = useState<HotReloadStatus>({
    active: false,
    frontendEnabled: false,
    backendEnabled: false,
    pendingChanges: 0,
  });
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize hot reload service
  useEffect(() => {
    const initializeHotReload = async () => {
      try {
        const config: HotReloadConfig = {
          projectId: options.projectId,
          supabaseProjectId: options.supabaseProjectId,
          frontendEnabled: options.frontendEnabled ?? true,
          backendEnabled: options.backendEnabled ?? !!options.supabaseProjectId,
          watchPatterns: options.watchPatterns ?? [
            'frontend/**/*.{ts,tsx,js,jsx}',
            'backend/**/*.{ts,js,sql}',
          ],
        };

        await hotReloadService.initialize(config);
        setIsInitialized(true);
        updateStatus();
      } catch (error: any) {
        console.error('Failed to initialize hot reload:', error);
        toast.error('Hot reload initialization failed: ' + error.message);
      }
    };

    if (options.projectId) {
      initializeHotReload();
    }

    return () => {
      hotReloadService.stop();
      setIsInitialized(false);
    };
  }, [
    options.projectId,
    options.supabaseProjectId,
    options.frontendEnabled,
    options.backendEnabled,
  ]);

  // Set up file change listener
  useEffect(() => {
    if (!isInitialized) return;

    const unsubscribe = hotReloadService.onFileChange((changes) => {
      options.onFileChange?.(changes);
      updateStatus();
    });

    return unsubscribe;
  }, [isInitialized, options.onFileChange]);

  // Update status from service
  const updateStatus = useCallback(() => {
    const newStatus = hotReloadService.getStatus();
    setStatus(newStatus);
  }, []);

  // Manually trigger frontend reload
  const reloadFrontend = useCallback(async (changes?: FileChange[]): Promise<HotReloadResult> => {
    if (!isInitialized) {
      throw new Error('Hot reload not initialized');
    }

    const defaultChanges: FileChange[] = changes || [{
      path: 'frontend/App.tsx',
      type: 'modified',
      timestamp: new Date(),
    }];

    const result = await hotReloadService.reloadFrontend(defaultChanges);
    options.onReloadComplete?.(result);
    updateStatus();
    
    return result;
  }, [isInitialized, options.onReloadComplete]);

  // Manually trigger backend reload
  const reloadBackend = useCallback(async (changes?: FileChange[]): Promise<HotReloadResult> => {
    if (!isInitialized) {
      throw new Error('Hot reload not initialized');
    }

    const defaultChanges: FileChange[] = changes || [{
      path: 'backend/functions/example.ts',
      type: 'modified',
      timestamp: new Date(),
    }];

    const result = await hotReloadService.reloadBackend(defaultChanges);
    options.onReloadComplete?.(result);
    updateStatus();
    
    return result;
  }, [isInitialized, options.onReloadComplete]);

  // Manually trigger full-stack reload
  const reloadFullStack = useCallback(async (changes?: FileChange[]): Promise<HotReloadResult> => {
    if (!isInitialized) {
      throw new Error('Hot reload not initialized');
    }

    const defaultChanges: FileChange[] = changes || [
      {
        path: 'frontend/App.tsx',
        type: 'modified',
        timestamp: new Date(),
      },
      {
        path: 'backend/functions/example.ts',
        type: 'modified',
        timestamp: new Date(),
      },
    ];

    const result = await hotReloadService.fullStackReload(defaultChanges);
    options.onReloadComplete?.(result);
    updateStatus();
    
    return result;
  }, [isInitialized, options.onReloadComplete]);

  // Trigger hot reload for specific file changes
  const triggerReload = useCallback((changes: FileChange[]) => {
    if (!isInitialized) return;

    changes.forEach(change => {
      hotReloadService.handleFileChange(change);
    });
    
    updateStatus();
  }, [isInitialized]);

  // Stop hot reload service
  const stop = useCallback(() => {
    hotReloadService.stop();
    setIsInitialized(false);
    updateStatus();
  }, []);

  return {
    // Status
    status,
    isInitialized,
    
    // Actions
    reloadFrontend,
    reloadBackend,
    reloadFullStack,
    triggerReload,
    stop,
    
    // Utils
    updateStatus,
  };
}