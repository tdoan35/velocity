import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { getDefaultFrontendFiles, getDefaultBackendFiles, getDefaultSharedFiles } from '../utils/defaultProjectFiles';
import { isFeatureEnabled, FSYNC_FLAGS } from '../utils/featureFlags';
import { withRateLimitRetry, withFileOperationRetry } from '../utils/retryUtils';
import type { FileTree, FileContent, ProjectData, SupabaseProject, BuildStatus, DeploymentStatus } from '../types/editor';

export interface ProjectEditorState {
  // Project Context
  projectId: string | null;
  projectData: ProjectData | null;
  projectType: 'frontend-only' | 'full-stack';
  supabaseProject: SupabaseProject | null;
  
  // File Structure
  frontendFiles: FileTree;
  backendFiles: FileTree;
  sharedFiles: FileTree;
  activeFile: string | null;
  openTabs: string[];
  
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
  initializeProject: (projectId: string) => Promise<void>;
  generateProjectStructure: () => Promise<void>;
  ensureMinimumFiles: () => void;
  syncWithSupabase: () => Promise<void>;
  deployProject: () => Promise<void>;
  openFile: (filePath: string) => void;
  closeFile: (filePath: string) => void;
  saveFile: (filePath: string, content: string) => Promise<void>;
  createFile: (filePath: string, content?: string) => Promise<void>;
  deleteFile: (filePath: string) => Promise<void>;
  setBuildStatus: (status: BuildStatus) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState = {
  projectId: null,
  projectData: null,
  projectType: 'frontend-only' as const,
  supabaseProject: null,
  frontendFiles: {},
  backendFiles: {},
  sharedFiles: {},
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

export const useProjectEditorStore = create<ProjectEditorState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      initializeProject: async (projectId: string) => {
        console.log('[ProjectEditorStore] Initializing project:', projectId);
        set({ isLoading: true, error: null, projectId });

        try {
          // Fetch project data (try with prd_sections first, fallback to basic project data)
          let project = null;
          let projectError = null;
          
          // First try with prd_sections
          const { data: projectWithSections, error: sectionsError } = await supabase
            .from('projects')
            .select(`
              *,
              prd_sections (
                id,
                title,
                content,
                order_index
              )
            `)
            .eq('id', projectId)
            .single();

          // If the prd_sections relationship fails, try without it
          if (sectionsError && sectionsError.code === 'PGRST200') {
            console.log('prd_sections table not found, trying basic project query...');
            const { data, error } = await supabase
              .from('projects')
              .select('*')
              .eq('id', projectId)
              .single();
            project = data;
            projectError = error;
            
            // Add empty prd_sections array if project exists
            if (project && !projectError) {
              project.prd_sections = [];
            }
          } else {
            project = projectWithSections;
            projectError = sectionsError;
          }

          // If project doesn't exist or has invalid format, create a temporary project structure  
          if (projectError && (projectError.code === 'PGRST116' || projectError.code === '22P02')) {
            console.log('Project not found in database or invalid ID format, creating temporary project structure...');
            
            const tempProject = {
              id: projectId,
              name: 'Temporary Project',
              description: 'A temporary project for testing',
              user_id: null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              prd_sections: [],
            };

            const frontendFiles = getDefaultFrontendFiles('Temporary Project');
            const sharedFiles = getDefaultSharedFiles('Temporary Project');

            set({
              projectData: tempProject,
              frontendFiles,
              backendFiles: {},
              sharedFiles,
              isSupabaseConnected: false,
              supabaseProject: null,
              projectType: 'frontend-only',
              activeFile: 'frontend/App.tsx',
              openTabs: ['frontend/App.tsx'],
              isLoading: false,
            });
            return;
          }

          if (projectError) throw projectError;

          // Check Supabase connection (handle missing table gracefully)
          let supabaseConnection = null;
          try {
            const { data } = await supabase
              .from('supabase_connections')
              .select('*')
              .eq('project_id', projectId)
              .single();
            supabaseConnection = data;
          } catch (err: any) {
            console.log('supabase_connections table not found or no connection exists');
            supabaseConnection = null;
          }

          // Load existing files if any (handle missing table gracefully)
          let files = null;
          try {
            // Check if we should use new RPC functions
            const useRPC = await isFeatureEnabled(FSYNC_FLAGS.USE_RPC);
            
            if (useRPC) {
              // Use the new list_current_files RPC function
              const { data, error } = await supabase.rpc('list_current_files', {
                project_uuid: projectId
              });
              
              if (error) {
                console.log('RPC list_current_files failed, falling back to direct query:', error);
                // Fallback to direct query
                const fallbackResult = await supabase
                  .from('project_files')
                  .select('*')
                  .eq('project_id', projectId)
                  .eq('is_current_version', true);
                files = fallbackResult.data;
              } else {
                // Convert RPC response to expected format
                files = data?.map((file: any) => ({
                  ...file,
                  project_id: projectId,
                  path: file.file_path,
                  type: file.file_type,
                  // RPC already filters current versions
                })) || [];
              }
            } else {
              // Legacy path - direct database operations  
              const { data } = await supabase
                .from('project_files')
                .select('*')
                .eq('project_id', projectId);
              files = data;
            }
          } catch (err: any) {
            console.log('project_files table not found, will create default files');
            files = null;
          }

          let frontendFiles: FileTree = {};
          let backendFiles: FileTree = {};
          let sharedFiles: FileTree = {};

          // If no files exist, create default project structure
          if (!files || files.length === 0) {
            console.log('No files found for project, creating default structure...');
            
            const projectName = project?.name || 'My Velocity App';
            const isFullStack = !!supabaseConnection;
            
            // Create default files
            frontendFiles = getDefaultFrontendFiles(projectName);
            sharedFiles = getDefaultSharedFiles(projectName);
            
            if (isFullStack) {
              backendFiles = getDefaultBackendFiles(projectName);
            }

            // Save default files to database (if table exists)
            const allDefaultFiles = { ...frontendFiles, ...backendFiles, ...sharedFiles };
            const fileInserts = Object.values(allDefaultFiles).map(file => ({
              project_id: projectId,
              path: file.path,
              content: file.content,
              type: file.type === 'typescript' ? 'typescript' : 
                    file.type === 'javascript' ? 'javascript' :
                    file.type === 'json' ? 'json' :
                    file.type === 'sql' ? 'sql' :
                    file.type === 'markdown' ? 'markdown' :
                    file.type === 'toml' ? 'toml' : 'text',
            }));

            if (fileInserts.length > 0) {
              try {
                const { error: insertError } = await supabase
                  .from('project_files')
                  .insert(fileInserts);

                if (insertError) {
                  console.error('Failed to save default files:', insertError);
                } else {
                  console.log(`Created ${fileInserts.length} default files for project`);
                }
              } catch (err: any) {
                console.log('Could not save files to database (table may not exist), using in-memory files only');
              }
            }
          } else {
            // Load existing files
            files.forEach((file) => {
              const fileContent: FileContent = {
                path: file.path,
                content: file.content,
                type: file.type,
                lastModified: new Date(file.updated_at),
                version: file.version,
                contentHash: file.content_hash,
              };

              if (file.path.startsWith('frontend/')) {
                frontendFiles[file.path] = fileContent;
              } else if (file.path.startsWith('backend/')) {
                backendFiles[file.path] = fileContent;
              } else {
                sharedFiles[file.path] = fileContent;
              }
            });
          }

          // Set initial active file if none exists
          const allFiles = { ...frontendFiles, ...backendFiles, ...sharedFiles };
          const fileKeys = Object.keys(allFiles);
          const defaultActiveFile = fileKeys.includes('frontend/App.tsx') ? 'frontend/App.tsx' : 
                                  fileKeys.includes('frontend/App.js') ? 'frontend/App.js' :
                                  fileKeys[0] || null;

          console.log('[ProjectEditorStore] Project initialized successfully:', {
            projectId,
            projectName: project?.name,
            hasProjectData: !!project,
            frontendFileCount: Object.keys(frontendFiles).length,
            backendFileCount: Object.keys(backendFiles).length,
            sharedFileCount: Object.keys(sharedFiles).length,
            isSupabaseConnected: !!supabaseConnection,
            projectType: supabaseConnection ? 'full-stack' : 'frontend-only',
            activeFile: defaultActiveFile,
            frontendFiles: Object.keys(frontendFiles)
          });

          set({
            projectData: project,
            frontendFiles,
            backendFiles,
            sharedFiles,
            isSupabaseConnected: !!supabaseConnection,
            supabaseProject: supabaseConnection || null,
            projectType: supabaseConnection ? 'full-stack' : 'frontend-only',
            activeFile: defaultActiveFile,
            openTabs: defaultActiveFile ? [defaultActiveFile] : [],
            isLoading: false,
          });
        } catch (error: any) {
          console.error('Project initialization error:', error);
          set({ error: error.message, isLoading: false });
          throw error;
        }
      },

      generateProjectStructure: async () => {
        const { projectId, projectData } = get();
        if (!projectId || !projectData) return;

        set({ buildStatus: 'generating' });

        try {
          // Call the AI code generation service
          const response = await fetch('/api/generate-project', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId,
              prdSections: projectData.prd_sections,
              includeBackend: get().isSupabaseConnected,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to generate project structure');
          }

          const generatedFiles = await response.json();

          // Check if we should use bulk RPC functions
          const useBulkRPC = await isFeatureEnabled(FSYNC_FLAGS.BULK_GENERATION);
          
          if (useBulkRPC) {
            // Use bulk RPC function for atomic operation
            const filesArray = Object.entries(generatedFiles).map(([path, content]) => {
              const fileType = path.endsWith('.tsx') || path.endsWith('.ts') ? 'typescript' :
                              path.endsWith('.js') || path.endsWith('.jsx') ? 'javascript' :
                              path.endsWith('.sql') ? 'sql' :
                              path.endsWith('.json') ? 'json' :
                              path.endsWith('.md') ? 'markdown' : 'text';

              return {
                file_path: path,
                file_type: fileType,
                content: content as string,
              };
            });

            const { data, error } = await withRateLimitRetry(
              () => supabase.rpc('bulk_upsert_project_files', {
                project_uuid: projectId,
                files: filesArray
              }),
              'Bulk file creation'
            );

            if (error) {
              throw new Error(`Bulk file creation failed: ${error.message}`);
            }

            // Convert bulk response to savedFiles format
            const savedFiles = data.files.map((file: any) => ({
              path: file.file_path,
              content: {
                path: file.file_path,
                content: filesArray.find(f => f.file_path === file.file_path)?.content || '',
                type: filesArray.find(f => f.file_path === file.file_path)?.file_type || 'text',
                lastModified: new Date(),
                version: file.version,
                contentHash: file.content_hash,
              } as FileContent,
            }));
          } else {
            // Legacy path - individual operations
            const filePromises = Object.entries(generatedFiles).map(async ([path, content]) => {
              const fileType = path.endsWith('.tsx') || path.endsWith('.ts') ? 'typescript' :
                              path.endsWith('.js') || path.endsWith('.jsx') ? 'javascript' :
                              path.endsWith('.sql') ? 'sql' :
                              path.endsWith('.json') ? 'json' : 'text';

              await supabase
                .from('project_files')
                .upsert({
                  project_id: projectId,
                  file_path: path,
                  content: content as string,
                  file_type: fileType,
                });

              return {
                path,
                content: {
                  path,
                  content: content as string,
                  type: fileType,
                  lastModified: new Date(),
                } as FileContent,
              };
            });

            var savedFiles = await Promise.all(filePromises);
          }

          // Organize files by directory
          const frontendFiles = { ...get().frontendFiles };
          const backendFiles = { ...get().backendFiles };
          const sharedFiles = { ...get().sharedFiles };

          savedFiles.forEach(({ path, content }) => {
            if (path.startsWith('frontend/')) {
              frontendFiles[path] = content;
            } else if (path.startsWith('backend/')) {
              backendFiles[path] = content;
            } else {
              sharedFiles[path] = content;
            }
          });

          set({
            frontendFiles,
            backendFiles,
            sharedFiles,
            buildStatus: 'success',
          });
        } catch (error: any) {
          set({ buildStatus: 'error', error: error.message });
          throw error;
        }
      },

      ensureMinimumFiles: () => {
        const { frontendFiles, projectData } = get();
        
        // Only create files if none exist
        if (Object.keys(frontendFiles).length === 0) {
          const defaultFiles = getDefaultFrontendFiles(projectData?.name || 'Velocity App');
          
          set({
            frontendFiles: defaultFiles,
            activeFile: 'frontend/App.tsx',
            openTabs: ['frontend/App.tsx']
          });
        }
      },

      syncWithSupabase: async () => {
        const { projectId, supabaseProject } = get();
        if (!projectId || !supabaseProject) return;

        try {
          // Sync backend files with Supabase project
          const response = await fetch('/api/sync-supabase', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId,
              supabaseProjectId: supabaseProject.id,
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to sync with Supabase');
          }
        } catch (error: any) {
          set({ error: error.message });
          throw error;
        }
      },

      deployProject: async () => {
        const { projectId, frontendFiles, backendFiles } = get();
        if (!projectId) return;

        set({ deploymentStatus: 'deploying', buildStatus: 'building' });

        try {
          // Deploy to Expo/Snack for preview
          const response = await fetch('/api/deploy-project', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectId,
              files: { ...frontendFiles, ...backendFiles },
            }),
          });

          if (!response.ok) {
            throw new Error('Failed to deploy project');
          }

          const { url } = await response.json();

          set({
            deploymentStatus: 'deployed',
            deploymentUrl: url,
            buildStatus: 'success',
          });
        } catch (error: any) {
          set({
            deploymentStatus: 'failed',
            buildStatus: 'error',
            error: error.message,
          });
          throw error;
        }
      },

      openFile: (filePath: string) => {
        const { openTabs } = get();
        if (!openTabs.includes(filePath)) {
          set({ openTabs: [...openTabs, filePath], activeFile: filePath });
        } else {
          set({ activeFile: filePath });
        }
      },

      closeFile: (filePath: string) => {
        const { openTabs, activeFile } = get();
        const newTabs = openTabs.filter(tab => tab !== filePath);
        const newActiveFile = activeFile === filePath ? 
          (newTabs.length > 0 ? newTabs[newTabs.length - 1] : null) : 
          activeFile;
        
        set({ openTabs: newTabs, activeFile: newActiveFile });
      },

      saveFile: async (filePath: string, content: string) => {
        const { projectId, frontendFiles, backendFiles, sharedFiles } = get();
        if (!projectId) return;

        try {
          // Determine file type from extension
          const fileType = filePath.endsWith('.tsx') || filePath.endsWith('.ts') ? 'typescript' :
                          filePath.endsWith('.js') || filePath.endsWith('.jsx') ? 'javascript' :
                          filePath.endsWith('.sql') ? 'sql' :
                          filePath.endsWith('.json') ? 'json' :
                          filePath.endsWith('.md') ? 'markdown' :
                          filePath.endsWith('.toml') ? 'toml' : 'text';

          // Check if we should use new RPC functions
          const useRPC = await isFeatureEnabled(FSYNC_FLAGS.USE_RPC);
          
          if (useRPC) {
            // Get current file version for optimistic concurrency control
            const currentFiles = { ...frontendFiles, ...backendFiles, ...sharedFiles };
            const existingFile = currentFiles[filePath];
            const expectedVersion = existingFile?.version;

            // Use the new RPC function with retry logic
            const { data, error } = await withFileOperationRetry(
              () => supabase.rpc('upsert_project_file', {
                project_uuid: projectId,
                p_file_path: filePath,
                p_content: content,
                p_file_type: fileType,
                expected_version: expectedVersion || null
              }),
              filePath
            );

            if (error) {
              console.error('RPC upsert_project_file failed:', error);
              throw new Error(`Failed to save file: ${error.message}`);
            }

            // Update local state with RPC response data
            const fileContent: FileContent = {
              path: filePath,
              content,
              type: fileType,
              lastModified: new Date(data.updated_at),
              version: data.version,
              contentHash: data.content_hash,
            };

            if (filePath.startsWith('frontend/')) {
              set(state => ({
                frontendFiles: {
                  ...state.frontendFiles,
                  [filePath]: fileContent,
                },
              }));
            } else if (filePath.startsWith('backend/')) {
              set(state => ({
                backendFiles: {
                  ...state.backendFiles,
                  [filePath]: fileContent,
                },
              }));
            } else {
              set(state => ({
                sharedFiles: {
                  ...state.sharedFiles,
                  [filePath]: fileContent,
                },
              }));
            }
          } else {
            // Legacy path - direct database operations
            await supabase
              .from('project_files')
              .upsert({
                project_id: projectId,
                file_path: filePath,
                content,
                file_type: fileType,
              });

            // Update local state
            const fileContent: FileContent = {
              path: filePath,
              content,
              type: fileType,
              lastModified: new Date(),
            };

            if (filePath.startsWith('frontend/')) {
              set(state => ({
                frontendFiles: {
                  ...state.frontendFiles,
                  [filePath]: fileContent,
                },
              }));
            } else if (filePath.startsWith('backend/')) {
              set(state => ({
                backendFiles: {
                  ...state.backendFiles,
                  [filePath]: fileContent,
                },
              }));
            } else {
              set(state => ({
                sharedFiles: {
                  ...state.sharedFiles,
                  [filePath]: fileContent,
                },
              }));
            }
          }
        } catch (error: any) {
          set({ error: error.message });
          throw error;
        }
      },

      createFile: async (filePath: string, content = '') => {
        await get().saveFile(filePath, content);
        get().openFile(filePath);
      },

      deleteFile: async (filePath: string) => {
        const { projectId, frontendFiles, backendFiles, sharedFiles } = get();
        if (!projectId) return;

        try {
          // Check if we should use new RPC functions
          const useRPC = await isFeatureEnabled(FSYNC_FLAGS.USE_RPC);
          
          if (useRPC) {
            // Get current file version for optimistic concurrency control
            const currentFiles = { ...frontendFiles, ...backendFiles, ...sharedFiles };
            const existingFile = currentFiles[filePath];
            const expectedVersion = existingFile?.version;

            // Use the new RPC function
            const { error } = await supabase.rpc('delete_project_file', {
              project_uuid: projectId,
              p_file_path: filePath,
              expected_version: expectedVersion || null
            });

            if (error) {
              console.error('RPC delete_project_file failed:', error);
              throw new Error(`Failed to delete file: ${error.message}`);
            }
          } else {
            // Legacy path - direct database operations
            await supabase
              .from('project_files')
              .delete()
              .eq('project_id', projectId)
              .eq('file_path', filePath);
          }

          // Remove from local state
          if (filePath.startsWith('frontend/')) {
            set(state => {
              const { [filePath]: deleted, ...rest } = state.frontendFiles;
              return { frontendFiles: rest };
            });
          } else if (filePath.startsWith('backend/')) {
            set(state => {
              const { [filePath]: deleted, ...rest } = state.backendFiles;
              return { backendFiles: rest };
            });
          } else {
            set(state => {
              const { [filePath]: deleted, ...rest } = state.sharedFiles;
              return { sharedFiles: rest };
            });
          }

          // Close file if open
          get().closeFile(filePath);
        } catch (error: any) {
          set({ error: error.message });
          throw error;
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
    {
      name: 'project-editor-store',
    }
  )
);