import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { isFeatureEnabled, FSYNC_FLAGS } from '../utils/featureFlags';
import { withRateLimitRetry, withFileOperationRetry } from '../utils/retryUtils';
import type { FileContent, ProjectData, SupabaseProject, BuildStatus, DeploymentStatus } from '../types/editor';

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
          // Use the same RPC call pattern from the original store
          const { data, error } = await supabase.rpc('upsert_project_file', {
            p_project_id: projectId,
            p_file_path: filePath,
            p_content: file.content,
            p_file_type: file.type
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
        set(initialState);
      },
    }),
    { name: 'unified-editor-store' }
  )
);