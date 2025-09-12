import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { isFeatureEnabled, FSYNC_FLAGS } from '../utils/featureFlags';
import { withRateLimitRetry, withFileOperationRetry } from '../utils/retryUtils';
import type { FileContent, ProjectData, SupabaseProject, BuildStatus, DeploymentStatus } from '../types/editor';
import type { RealtimeChannel } from '@supabase/supabase-js';

// Define a comprehensive type for a file, including its state
export interface EditorFile extends FileContent {
  isDirty: boolean;
  isSaving: boolean;
}

export interface UnifiedEditorState {
  // Project Context
  projectId: string | null;
  projectData: ProjectData | null;
  projectType: 'frontend-only' | 'full-stack';
  supabaseProject: SupabaseProject | null;
  
  // File Structure & Content
  files: Record<string, EditorFile>;
  activeFile: string | null;
  openTabs: string[]; // An array of file paths
  
  // Build State
  buildStatus: BuildStatus;
  deploymentStatus: DeploymentStatus;
  deploymentUrl: string | null;
  buildLogs: string[];
  
  // Connection State
  isSupabaseConnected: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Realtime Subscription State
  subscription: RealtimeChannel | null;
  isSubscribed: boolean;
  lastRefreshTime: Date | null;

  // Actions
  initializeProjectFiles: (projectId: string) => Promise<void>;
  generateProjectStructure: () => Promise<void>;
  syncWithSupabase: () => Promise<void>;
  deployProject: () => Promise<void>;
  openFile: (filePath: string) => void;
  closeFile: (filePath: string) => void;
  updateFileContent: (filePath: string, newContent: string) => void;
  saveFile: (filePath: string) => Promise<void>;
  createFile: (filePath: string, content?: string) => Promise<void>;
  deleteFile: (filePath: string) => Promise<void>;
  setBuildStatus: (status: BuildStatus) => void;
  setError: (error: string | null) => void;
  reset: () => void;
  
  // Realtime Subscription Actions
  subscribeToProjectFiles: (projectId: string) => void;
  unsubscribeFromProjectFiles: () => void;
  refreshProjectFiles: (projectId: string) => Promise<void>;
}

// Helper function to normalize file paths to canonical format
function normalizeFilePath(originalPath: string): string {
  // If already has a valid prefix, return as-is
  if (originalPath.startsWith('frontend/') || 
      originalPath.startsWith('backend/') || 
      originalPath.startsWith('shared/')) {
    return originalPath;
  }

  // Determine appropriate prefix based on file type and location
  const lowerPath = originalPath.toLowerCase();
  
  // Backend files - SQL, server-related files
  if (lowerPath.includes('.sql') || 
      lowerPath.includes('supabase') || 
      lowerPath.includes('migration') ||
      lowerPath.includes('function') ||
      lowerPath.includes('server')) {
    return `backend/${originalPath}`;
  }
  
  // Frontend files - common frontend patterns
  if (lowerPath.includes('component') ||
      lowerPath.includes('src/') ||
      lowerPath.includes('.tsx') ||
      lowerPath.includes('.jsx') ||
      lowerPath.includes('app.') ||
      lowerPath.includes('index.') ||
      lowerPath.includes('package.json') ||
      lowerPath.includes('tsconfig') ||
      lowerPath.includes('tailwind')) {
    return `frontend/${originalPath}`;
  }
  
  // Default to shared for ambiguous files
  return `shared/${originalPath}`;
}

const initialState = {
  projectId: null,
  projectData: null,
  projectType: 'frontend-only' as const,
  supabaseProject: null,
  files: {},
  activeFile: null,
  openTabs: [],
  buildStatus: 'idle' as BuildStatus,
  deploymentStatus: 'ready' as DeploymentStatus,
  deploymentUrl: null,
  buildLogs: [],
  isSupabaseConnected: false,
  isLoading: false,
  error: null,
  subscription: null,
  isSubscribed: false,
  lastRefreshTime: null,
};

export const useUnifiedEditorStore = create<UnifiedEditorState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      initializeProjectFiles: async (projectId: string) => {
        set({ isLoading: true, error: null, projectId });
        
        try {
          // Fetch project data
          const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('*')
            .eq('id', projectId)
            .single();

          if (projectError) throw projectError;

          // Fetch project files
          const { data: files, error: filesError } = await supabase
            .from('project_files')
            .select('*')
            .eq('project_id', projectId);

          if (filesError) throw filesError;

          // Convert files to the unified format
          const fileMap: Record<string, EditorFile> = {};
          const defaultFiles: EditorFile[] = [
            {
              path: 'frontend/App.tsx',
              content: 'import React from \'react\';\n\nfunction App() {\n  return (\n    <div className="App">\n      <h1>Hello, World!</h1>\n    </div>\n  );\n}\n\nexport default App;',
              type: 'typescript',
              lastModified: new Date(),
              isDirty: false,
              isSaving: false,
            }
          ];

          // Add existing files from database
          files?.forEach(file => {
            const normalizedPath = normalizeFilePath(file.file_path);
            fileMap[normalizedPath] = {
              path: normalizedPath,
              content: file.content || '',
              type: file.file_type || 'text',
              lastModified: new Date(file.updated_at),
              version: file.version,
              isDirty: false,
              isSaving: false,
            };
          });

          // Add default files if none exist
          if (Object.keys(fileMap).length === 0) {
            defaultFiles.forEach(file => {
              fileMap[file.path] = file;
            });
          }

          // Set the first available file as active and open
          const firstFilePath = Object.keys(fileMap)[0] || null;
          const initialTabs = firstFilePath ? [firstFilePath] : [];

          set({
            projectData: project,
            files: fileMap,
            activeFile: firstFilePath,
            openTabs: initialTabs,
            isLoading: false,
          });

          // Subscribe to real-time file changes (non-blocking)
          setTimeout(() => {
            try {
              get().subscribeToProjectFiles(projectId);
              console.log('🔄 Initialized project with real-time sync enabled');
            } catch (error) {
              console.warn('⚠️ Real-time sync unavailable, continuing without it:', error);
            }
          }, 100); // Small delay to ensure project is fully initialized

        } catch (error) {
          console.error('Failed to initialize project files:', error);
          set({ 
            error: error instanceof Error ? error.message : 'Failed to load project files',
            isLoading: false 
          });
        }
      },

      generateProjectStructure: async () => {
        // TODO: Implement project structure generation logic
        console.log('generateProjectStructure not implemented yet');
      },

      syncWithSupabase: async () => {
        // TODO: Implement Supabase sync logic
        console.log('syncWithSupabase not implemented yet');
      },

      deployProject: async () => {
        // TODO: Implement deployment logic
        console.log('deployProject not implemented yet');
      },

      openFile: (filePath: string) => {
        const { openTabs, files } = get();
        
        // Ensure file exists in our files map
        if (!files[filePath]) {
          console.error(`File not found: ${filePath}`);
          return;
        }

        // Add to tabs if not already open
        if (!openTabs.includes(filePath)) {
          set({ openTabs: [...openTabs, filePath] });
        }
        
        // Set as active file
        set({ activeFile: filePath });
      },

      closeFile: (filePath: string) => {
        const { openTabs, activeFile } = get();
        const newTabs = openTabs.filter(tab => tab !== filePath);
        const newActiveFile = activeFile === filePath
          ? (newTabs.length > 0 ? newTabs[newTabs.length - 1] : null)
          : activeFile;
        set({ openTabs: newTabs, activeFile: newActiveFile });
      },

      updateFileContent: (filePath: string, newContent: string) => {
        const { files } = get();
        const existingFile = files[filePath];
        
        if (!existingFile) {
          console.error(`Cannot update content: file not found: ${filePath}`);
          return;
        }

        set({
          files: {
            ...files,
            [filePath]: {
              ...existingFile,
              content: newContent,
              isDirty: true,
            },
          },
        });
      },

      saveFile: async (filePath: string) => {
        const { files, projectId } = get();
        const file = files[filePath];
        
        if (!file || !projectId || file.isSaving) return;

        // Mark as saving
        set({
          files: { 
            ...files, 
            [filePath]: { ...file, isSaving: true } 
          },
        });

        try {
          // Use the correct RPC call with proper parameters
          const { data, error } = await supabase.rpc('upsert_project_file', {
            project_uuid: projectId,
            p_file_path: filePath,
            p_content: file.content,
            p_file_type: file.type,
            expected_version: file.version || null
          });

          if (error) throw error;

          // Update file with saved state
          set({
            files: {
              ...files,
              [filePath]: {
                ...file,
                isDirty: false,
                isSaving: false,
                lastModified: new Date(data?.updated_at || new Date()),
                version: data?.version || file.version,
              },
            },
          });

          console.log(`File ${filePath} saved successfully`);
        } catch (error) {
          console.error(`Failed to save file: ${filePath}`, error);
          
          // Reset saving state on error
          set({
            files: { 
              ...files, 
              [filePath]: { ...file, isSaving: false } 
            },
            error: error instanceof Error ? error.message : 'Failed to save file'
          });
        }
      },

      createFile: async (filePath: string, content = '') => {
        const { files, projectId } = get();
        const normalizedPath = normalizeFilePath(filePath);
        
        if (!projectId) {
          console.error('Cannot create file: no project ID');
          return;
        }

        // Create file in local state immediately
        const newFile: EditorFile = {
          path: normalizedPath,
          content,
          type: normalizedPath.split('.').pop() || 'text',
          lastModified: new Date(),
          isDirty: true,
          isSaving: false,
        };

        set({
          files: {
            ...files,
            [normalizedPath]: newFile,
          },
        });

        // Save to database
        await get().saveFile(normalizedPath);
      },

      deleteFile: async (filePath: string) => {
        const { files, projectId, openTabs, activeFile } = get();
        
        if (!projectId) {
          console.error('Cannot delete file: no project ID');
          return;
        }

        try {
          // Delete from database
          const { error } = await supabase
            .from('project_files')
            .delete()
            .eq('project_id', projectId)
            .eq('file_path', filePath);

          if (error) throw error;

          // Remove from local state
          const newFiles = { ...files };
          delete newFiles[filePath];

          // Update tabs and active file
          const newTabs = openTabs.filter(tab => tab !== filePath);
          const newActiveFile = activeFile === filePath
            ? (newTabs.length > 0 ? newTabs[newTabs.length - 1] : null)
            : activeFile;

          set({
            files: newFiles,
            openTabs: newTabs,
            activeFile: newActiveFile,
          });

          console.log(`File ${filePath} deleted successfully`);
        } catch (error) {
          console.error(`Failed to delete file: ${filePath}`, error);
          set({ error: error instanceof Error ? error.message : 'Failed to delete file' });
        }
      },

      setBuildStatus: (status: BuildStatus) => {
        set({ buildStatus: status });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      reset: () => {
        // Clean up subscription before resetting
        get().unsubscribeFromProjectFiles();
        set(initialState);
      },
      
      // Realtime Subscription Methods
      subscribeToProjectFiles: (projectId: string) => {
        const { subscription: currentSubscription, isSubscribed } = get();
        
        // Clean up existing subscription if any
        if (currentSubscription || isSubscribed) {
          get().unsubscribeFromProjectFiles();
        }
        
        console.log(`🔄 Attempting to subscribe to project_files changes for project: ${projectId}`);
        
        try {
          // Create new subscription for project files
          const newSubscription = supabase
            .channel(`project_files:${projectId}`)
            .on('postgres_changes', {
              event: 'INSERT',
              schema: 'public',
              table: 'project_files',
              filter: `project_id=eq.${projectId}`
            }, (payload) => {
              console.log('📁 New file detected from orchestrator:', payload.new);
              
              // Debounce rapid changes to prevent excessive refreshes
              const { lastRefreshTime } = get();
              const now = new Date();
              const timeSinceLastRefresh = lastRefreshTime 
                ? now.getTime() - lastRefreshTime.getTime() 
                : Infinity;
              
              // Only refresh if more than 2 seconds since last refresh
              if (timeSinceLastRefresh > 2000) {
                get().refreshProjectFiles(projectId);
              } else {
                // Schedule a delayed refresh if we're getting rapid changes
                setTimeout(() => {
                  const currentTime = get().lastRefreshTime;
                  const timeSinceScheduled = currentTime 
                    ? now.getTime() - currentTime.getTime()
                    : Infinity;
                  
                  // Only refresh if no other refresh happened in the meantime
                  if (timeSinceScheduled > 1500) {
                    get().refreshProjectFiles(projectId);
                  }
                }, 2500);
              }
            })
            .on('postgres_changes', {
              event: 'UPDATE',
              schema: 'public',
              table: 'project_files', 
              filter: `project_id=eq.${projectId}`
            }, (payload) => {
              console.log('📝 File updated from external source:', payload.new);
              // Handle external file updates (less urgent than INSERT)
              setTimeout(() => get().refreshProjectFiles(projectId), 1000);
            })
            .on('postgres_changes', {
              event: 'DELETE',
              schema: 'public', 
              table: 'project_files',
              filter: `project_id=eq.${projectId}`
            }, (payload) => {
              console.log('🗑️ File deleted from external source:', payload.old);
              get().refreshProjectFiles(projectId);
            })
            .subscribe((status) => {
              console.log(`📡 Subscription status for project ${projectId}:`, status);
              
              if (status === 'SUBSCRIBED') {
                set({ isSubscribed: true });
                console.log('✅ Successfully subscribed to project file changes');
              } else if (status === 'CHANNEL_ERROR') {
                console.warn('⚠️ Realtime subscription failed - likely not enabled for project_files table');
                console.warn('💡 To enable: Supabase Dashboard → Settings → API → Realtime → Enable for project_files');
                set({ isSubscribed: false });
                // Don't retry on CHANNEL_ERROR as it's likely a configuration issue
              } else if (status === 'CLOSED') {
                set({ isSubscribed: false });
                console.log('📡 Subscription closed');
              }
            });
            
          set({ subscription: newSubscription });
          
        } catch (error) {
          console.warn('⚠️ Failed to create real-time subscription, continuing without it:', error);
          console.warn('💡 Real-time sync requires Supabase Realtime to be enabled for project_files table');
          set({ isSubscribed: false });
        }
      },
      
      unsubscribeFromProjectFiles: () => {
        const { subscription, isSubscribed } = get();
        
        if (subscription) {
          console.log('🔌 Unsubscribing from project file changes');
          subscription.unsubscribe();
          set({ subscription: null, isSubscribed: false });
        } else if (isSubscribed) {
          // Handle edge case where isSubscribed is true but subscription is null
          set({ isSubscribed: false });
        }
      },
      
      refreshProjectFiles: async (projectId: string) => {
        console.log('🔄 Refreshing project files from database...');
        
        try {
          // Prevent excessive refreshes
          set({ lastRefreshTime: new Date() });
          
          // Fetch updated files from database
          const { data: files, error: filesError } = await supabase
            .from('project_files')
            .select('*')
            .eq('project_id', projectId);
            
          if (filesError) {
            console.error('❌ Failed to refresh project files:', filesError);
            return;
          }
          
          const { files: currentFiles } = get();
          const updatedFiles = { ...currentFiles };
          let hasChanges = false;
          
          // Process updated files
          files?.forEach(file => {
            const normalizedPath = normalizeFilePath(file.file_path);
            const existingFile = currentFiles[normalizedPath];
            
            // Check if this is a new file or has been updated
            const isNewFile = !existingFile;
            const isUpdated = existingFile && 
              new Date(file.updated_at).getTime() > existingFile.lastModified.getTime();
            
            if (isNewFile || isUpdated) {
              hasChanges = true;
              updatedFiles[normalizedPath] = {
                path: normalizedPath,
                content: file.content || '',
                type: file.file_type || 'text',
                lastModified: new Date(file.updated_at),
                version: file.version,
                isDirty: existingFile?.isDirty || false, // Preserve dirty state for open files
                isSaving: existingFile?.isSaving || false,
              };
              
              if (isNewFile) {
                console.log(`📁 Added new file: ${normalizedPath}`);
              } else {
                console.log(`📝 Updated file: ${normalizedPath}`);
              }
            }
          });
          
          // Update store if there were changes
          if (hasChanges) {
            set({ files: updatedFiles });
            console.log('✅ Project files refreshed successfully');
          } else {
            console.log('ℹ️ No file changes detected during refresh');
          }
          
        } catch (error) {
          console.error('❌ Failed to refresh project files:', error);
          set({ error: 'Failed to refresh project files' });
        }
      },
    }),
    { name: 'unified-editor-store' }
  )
);