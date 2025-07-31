import React, { useEffect, useRef, useCallback } from 'react';
import { editor as MonacoEditor } from 'monaco-editor';
import { useSnackSession } from '../../hooks/useSnackSession';
import { useToast } from '../../hooks/use-toast';
import { debounce } from '../../lib/utils';

interface SnackEditorIntegrationProps {
  editor: MonacoEditor.IStandaloneCodeEditor | null;
  sessionId: string;
  currentFile: string;
  files: Record<string, { type: string; contents: string }>;
  dependencies?: Record<string, string>;
  onFilesUpdate?: (files: Record<string, { type: string; contents: string }>) => void;
  onDependenciesUpdate?: (dependencies: Record<string, string>) => void;
}

export function SnackEditorIntegration({
  editor,
  sessionId,
  currentFile,
  files,
  dependencies = {},
  onFilesUpdate,
  onDependenciesUpdate
}: SnackEditorIntegrationProps) {
  const { toast } = useToast();
  const { session, updateCode, updateFiles, updateDependencies } = useSnackSession({
    sessionId,
    autoCreate: false,
  });

  const lastSyncedContent = useRef<string>('');
  const isSyncing = useRef(false);

  // Debounced update function
  const debouncedUpdateCode = useRef(
    debounce(async (filePath: string, contents: string) => {
      if (!session || isSyncing.current) return;

      try {
        isSyncing.current = true;
        await updateCode(filePath, contents);
        lastSyncedContent.current = contents;
      } catch (error) {
        console.error('[SnackEditorIntegration] Failed to update code:', error);
        toast({
          title: 'Sync error',
          description: 'Failed to sync code changes to preview',
          variant: 'destructive',
        });
      } finally {
        isSyncing.current = false;
      }
    }, 500)
  ).current;

  // Sync editor changes to Snack
  useEffect(() => {
    if (!editor || !session) return;

    const disposable = editor.onDidChangeModelContent(() => {
      const content = editor.getValue();
      
      // Skip if content hasn't changed
      if (content === lastSyncedContent.current) return;

      // Update local files
      const updatedFiles = {
        ...files,
        [currentFile]: {
          type: 'CODE',
          contents: content,
        },
      };
      onFilesUpdate?.(updatedFiles);

      // Sync to Snack
      debouncedUpdateCode(currentFile, content);
    });

    return () => {
      disposable.dispose();
    };
  }, [editor, session, currentFile, files, onFilesUpdate, debouncedUpdateCode]);

  // Sync initial file content
  useEffect(() => {
    if (!session || !files[currentFile]) return;

    const content = files[currentFile].contents;
    if (content !== lastSyncedContent.current) {
      debouncedUpdateCode(currentFile, content);
    }
  }, [session, currentFile, files, debouncedUpdateCode]);

  // Sync all files when session is created
  useEffect(() => {
    if (!session || Object.keys(files).length === 0) return;

    const syncAllFiles = async () => {
      try {
        await updateFiles(files);
        lastSyncedContent.current = files[currentFile]?.contents || '';
      } catch (error) {
        console.error('[SnackEditorIntegration] Failed to sync files:', error);
        toast({
          title: 'Sync error',
          description: 'Failed to sync project files to preview',
          variant: 'destructive',
        });
      }
    };

    syncAllFiles();
  }, [session]); // Only run when session is created

  // Sync dependencies
  useEffect(() => {
    if (!session || Object.keys(dependencies).length === 0) return;

    const syncDependencies = async () => {
      try {
        await updateDependencies(dependencies);
      } catch (error) {
        console.error('[SnackEditorIntegration] Failed to sync dependencies:', error);
        toast({
          title: 'Dependency sync error',
          description: 'Failed to sync package dependencies',
          variant: 'destructive',
        });
      }
    };

    syncDependencies();
  }, [session, dependencies, updateDependencies, toast]);

  // Handle dependency detection from imports
  const detectAndInstallDependencies = useCallback(async (content: string) => {
    if (!session) return;

    // Simple regex to detect import statements
    const importRegex = /import\s+(?:[\s\S]*?from\s+)?['"]([^'"]+)['"]/g;
    const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;

    const detectedDeps = new Set<string>();
    let match;

    // Find all imports
    while ((match = importRegex.exec(content)) !== null) {
      const dep = match[1];
      if (!dep.startsWith('.') && !dep.startsWith('/')) {
        detectedDeps.add(dep.split('/')[0]); // Get package name
      }
    }

    // Find all requires
    while ((match = requireRegex.exec(content)) !== null) {
      const dep = match[1];
      if (!dep.startsWith('.') && !dep.startsWith('/')) {
        detectedDeps.add(dep.split('/')[0]); // Get package name
      }
    }

    // Check for new dependencies
    const newDeps: Record<string, string> = {};
    for (const dep of detectedDeps) {
      if (!dependencies[dep] && !isBuiltinDependency(dep)) {
        newDeps[dep] = 'latest';
      }
    }

    // Install new dependencies
    if (Object.keys(newDeps).length > 0) {
      try {
        const updatedDeps = { ...dependencies, ...newDeps };
        await updateDependencies(updatedDeps);
        onDependenciesUpdate?.(updatedDeps);
        
        toast({
          title: 'Dependencies installed',
          description: `Added ${Object.keys(newDeps).join(', ')}`,
        });
      } catch (error) {
        console.error('[SnackEditorIntegration] Failed to install dependencies:', error);
        toast({
          title: 'Dependency installation failed',
          description: 'Failed to install detected dependencies',
          variant: 'destructive',
        });
      }
    }
  }, [session, dependencies, updateDependencies, onDependenciesUpdate, toast]);

  // Watch for dependency changes in current file
  useEffect(() => {
    if (!editor || !session || !currentFile.match(/\.(js|jsx|ts|tsx)$/)) return;

    const checkDependencies = debounce(() => {
      const content = editor.getValue();
      detectAndInstallDependencies(content);
    }, 2000);

    const disposable = editor.onDidChangeModelContent(() => {
      checkDependencies();
    });

    return () => {
      disposable.dispose();
    };
  }, [editor, session, currentFile, detectAndInstallDependencies]);

  return null; // This is a hook-like component, no UI
}

// Helper function to check if a dependency is built-in
function isBuiltinDependency(dep: string): boolean {
  const builtins = [
    'react',
    'react-native',
    'react-dom',
    'expo',
    'expo-constants',
    'expo-font',
    'expo-asset',
    'expo-av',
    'expo-camera',
    'expo-location',
    // Add more built-in/pre-installed packages
  ];
  
  return builtins.includes(dep);
}

// Re-export for convenience
export { useSnackSession };