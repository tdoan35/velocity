import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { useUnifiedEditorStore } from '../stores/useUnifiedEditorStore';
import { toast } from 'sonner';
import { Loader2, Settings, Eye, Code, MessageSquare, FileText as LogsIcon, Terminal, Play, Square, Hammer } from 'lucide-react';
import { useBuilderChat, type DesignSpec } from '../hooks/useBuilderChat';
import type { BuilderModel, BuildProgress } from '../types/ai';
import { usePreviewSession } from '../hooks/usePreviewSession';
import type { PreviewStatus } from '../hooks/usePreviewSession';
import { usePreviewRealtime } from '../hooks/usePreviewRealtime';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../components/ui/resizable';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ButtonGroup } from '../components/ui/button-group';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from '../components/ui/dropdown-menu';
import { FullStackFileExplorer } from '../components/editor/FullStackFileExplorer';
import { CodeEditor } from '../components/editor/code-editor';
import { EditorTabs } from '../components/editor/editor-tabs';
import { FullStackPreviewPanelContainer } from '../components/preview/FullStackPreviewPanelContainer';
import { EnhancedChatInterface } from '@/components/chat/enhanced-chat-interface';
import { VerticalCollapsiblePanel } from '../components/layout/vertical-collapsible-panel';
import { useFileSecurityMonitoring } from '../hooks/useSecurityMonitoring';
import { LogsPanel } from '../components/logs-panel/LogsPanel';
import { TerminalPanel } from '../components/terminal/TerminalPanel';

// Core ProjectEditor component that can be used with or without router
function ProjectEditorCore({ 
  projectId, 
  showAuthRedirect = true,
  showProjectValidation = true,
  skipInitialization = false
}: { 
  projectId: string | undefined;
  showAuthRedirect?: boolean;
  showProjectValidation?: boolean;
  skipInitialization?: boolean;
}) {
  const { user } = useAuthStore();
  
  // Development mode flag - bypass auth in development
  const isDevelopment = import.meta.env.MODE === 'development';
  const effectiveUser = isDevelopment && !user ? { id: 'dev-user' } as any : user;
  // No longer need to manually sync - ProjectContext handles this automatically
  const securityMonitoring = useFileSecurityMonitoring();
  const {
    projectData,
    isLoading,
    deploymentUrl,
    isSupabaseConnected,
    files,
    activeFile,
    openTabs,
    initializeProjectFiles,
    generateProjectStructure,
    deployProject,
    openFile,
    closeFile,
    updateFileContent,
    saveFile
  } = useUnifiedEditorStore();

  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<'logs' | 'terminal'>('logs');
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeView, setActiveView] = useState<'preview' | 'code'>('preview');
  const [isAIChatPanelVisible, setIsAIChatPanelVisible] = useState(true);

  // Auto-build state
  const [isAutoBuild, setIsAutoBuild] = useState(false);
  const [designSpec, setDesignSpec] = useState<DesignSpec | null>(null);
  const [builderModel, setBuilderModel] = useState<BuilderModel>('claude-sonnet-4-5-20250929');
  const autoBuildStartedRef = useRef(false);
  
  // Realtime file sync to preview container
  const previewRealtime = usePreviewRealtime({
    projectId: projectId || null,
    onError: (error) => console.error('[ProjectEditor] Realtime error:', error),
  });

  // Builder chat hook (always created, only used when in auto-build mode)
  const builderChat = useBuilderChat({
    projectId: projectId || '',
    model: builderModel,
    projectContext: projectData ? {
      id: projectId || '',
      name: projectData.name || 'Untitled Project',
      description: projectData.description,
      template: 'react-native',
    } : undefined,
    onConversationCreated: (id) => {
      console.log('[ProjectEditor] Builder conversation created:', id);
    },
    onTitleGenerated: (title) => {
      console.log('[ProjectEditor] Builder title:', title);
    },
    onBuildComplete: () => {
      console.log('[ProjectEditor] Build complete, switching to preview');
      setActiveView('preview');
      toast.success('App generated successfully!');
    },
  });

  // Detect auto-build mode on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autobuild') === 'true' && projectId) {
      const specJson = sessionStorage.getItem(`velocity_build_spec_${projectId}`);
      if (specJson) {
        try {
          setDesignSpec(JSON.parse(specJson));
          setIsAutoBuild(true);
          sessionStorage.removeItem(`velocity_build_spec_${projectId}`);
        } catch (e) {
          console.error('[ProjectEditor] Failed to parse design spec:', e);
        }
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [projectId]);

  // Start auto-build after initialization
  useEffect(() => {
    if (isAutoBuild && designSpec && isInitialized && !autoBuildStartedRef.current && builderChat.conversationId) {
      autoBuildStartedRef.current = true;
      console.log('[ProjectEditor] Starting auto-build...');
      builderChat.startBuild(designSpec);
    }
  }, [isAutoBuild, designSpec, isInitialized, builderChat.conversationId]);

  // Flush file broadcasts to preview when builder creates files
  useEffect(() => {
    if (builderChat.buildProgress.filesCompleted > 0) {
      builderChat.flushBroadcasts(previewRealtime.broadcastFileUpdate);
    }
  }, [builderChat.buildProgress.filesCompleted]);

  // Preview session management at project level
  const [selectedDevice, setSelectedDevice] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const [autoStartAttempted, setAutoStartAttempted] = useState(false);
  const autoStartTimerRef = useRef<number | null>(null);
  const idleTimeoutRef = useRef<number | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  
  // Initialize preview session at project level
  const previewSession = usePreviewSession({
    projectId: projectId || '',
    onError: (error) => {
      console.error('[ProjectEditor] Preview session error:', error);
      toast.error('Preview session error: ' + error.message);
    },
    onStatusChange: (status) => {
      console.log('[ProjectEditor] Preview session status changed:', status);
      // Reset idle timer on session activity
      if (status === 'running' || status === 'starting') {
        resetIdleTimer();
      }
    }
  });

  // Idle timer management (15 minutes)
  const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
  
  // Enhanced status dot renderer (moved from PreviewHeader)
  const renderStatusDot = (status: PreviewStatus) => {
    const dotClass = "w-2 h-2 rounded-full";
    
    // Map PreviewStatus to PreviewHeader status types
    const getPreviewHeaderStatus = (previewStatus: PreviewStatus): 'connecting' | 'error' | 'connected' | 'preparing' | 'idle' | 'retrying' => {
      switch (previewStatus) {
        case 'running':
          return 'connected';
        case 'starting':
          return 'connecting';
        case 'error':
          return 'error';
        case 'stopping':
          return 'preparing';
        default:
          return 'idle';
      }
    };
    
    const headerStatus = getPreviewHeaderStatus(status);
    
    switch (headerStatus) {
      case 'connecting':
        return <div className={`${dotClass} bg-yellow-500 animate-pulse`} title="Connecting..." />;
      case 'retrying':
        return <div className={`${dotClass} bg-orange-500`} title="Connection Issue" />;
      case 'error':
        return <div className={`${dotClass} bg-red-500`} title="Error" />;
      case 'connected':
        return <div className={`${dotClass} bg-green-500`} title="Connected" />;
      case 'preparing':
        return <div className={`${dotClass} bg-blue-500 animate-pulse`} title="Initializing Preview" />;
      default:
        return <div className={`${dotClass} bg-gray-400`} title="Idle" />;
    }
  };

  const resetIdleTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
    
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
    }
    
    // Only set idle timer if session is running
    if (previewSession.status === 'running') {
      idleTimeoutRef.current = window.setTimeout(() => {
        console.log('[ProjectEditor] Session idle timeout - stopping preview');
        previewSession.stopSession().catch(console.error);
        toast.info('Preview session stopped due to inactivity');
      }, IDLE_TIMEOUT);
    }
  }, [previewSession.status, previewSession.stopSession]);

  // Track user activity to reset idle timer
  const handleUserActivity = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  // Preview session control functions
  const handleStartPreview = useCallback(async () => {
    try {
      await previewSession.startSession(selectedDevice);
      resetIdleTimer();
    } catch (error) {
      console.error('Failed to start preview:', error);
      toast.error('Failed to start preview');
    }
  }, [previewSession.startSession, selectedDevice, resetIdleTimer]);

  const handleStopPreview = useCallback(async () => {
    try {
      await previewSession.stopSession();
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
    } catch (error) {
      console.error('Failed to stop preview:', error);
      toast.error('Failed to stop preview');
    }
  }, [previewSession.stopSession]);

  useEffect(() => {
    console.log('[ProjectEditor] useEffect triggered', {
      projectId,
      effectiveUser,
      isInitialized,
      skipInitialization,
      isDevelopment
    });
    
    if (skipInitialization) {
      // Skip API initialization for test mode
      setIsInitialized(true);
      return;
    }
    
    if (projectId && effectiveUser && !isInitialized) {
      console.log('[ProjectEditor] Calling initializeProjectFiles for:', projectId);
      initializeProjectFiles(projectId)
        .then(() => {
          console.log('[ProjectEditor] Project initialized successfully');
          setIsInitialized(true);
        })
        .catch((error) => {
          console.error('[ProjectEditor] Failed to initialize:', error);
          toast.error('Failed to initialize project: ' + error.message);
          // Even if initialization fails, mark as initialized to show the UI
          if (isDevelopment) {
            console.log('[ProjectEditor] Development mode - continuing despite error');
            setIsInitialized(true);
          }
        });
    }
  }, [projectId, effectiveUser, initializeProjectFiles, isInitialized, skipInitialization, isDevelopment]);

  // Auto-start preview session when project is initialized
  useEffect(() => {
    if (projectId && isInitialized && !autoStartAttempted && !autoStartTimerRef.current) {
      setAutoStartAttempted(true);
      
      autoStartTimerRef.current = window.setTimeout(() => {
        console.log('[ProjectEditor] Auto-starting preview session...');
        autoStartTimerRef.current = null;
        handleStartPreview().catch((error) => {
          console.warn('[ProjectEditor] Auto-start preview failed:', error);
        });
      }, 1500);
      
      console.log('[ProjectEditor] Auto-start timer set:', autoStartTimerRef.current);
    }
  }, [projectId, isInitialized, autoStartAttempted, handleStartPreview]);

  // Activity tracking for idle timeout
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    events.forEach(event => {
      document.addEventListener(event, handleUserActivity, { passive: true });
    });
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserActivity);
      });
    };
  }, [handleUserActivity]);

  // Cleanup on unmount (project exit)
  useEffect(() => {
    return () => {
      if (autoStartTimerRef.current) {
        clearTimeout(autoStartTimerRef.current);
        autoStartTimerRef.current = null;
      }
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      // Preview session will be cleaned up by usePreviewSession hook
    };
  }, []);

  // ProjectContext automatically handles currentProject syncing based on route changes

  // Redirect if not authenticated (only if enabled and not in dev mode)
  if (showAuthRedirect && !effectiveUser && !isDevelopment) {
    return <Navigate to="/signup" replace />;
  }

  // Project validation (only if enabled)
  if (showProjectValidation && !projectId) {
    return <Navigate to="/" replace />;
  }

  // Loading state - add more detailed debugging
  if (isLoading || !isInitialized) {
    console.log('[ProjectEditor] Still loading:', { isLoading, isInitialized, effectiveUser, projectId });
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading project...</p>
          <p className="text-xs text-muted-foreground">
            {!effectiveUser && "No user authenticated - checking..."}
            {effectiveUser && !isInitialized && "Initializing project..."}
            {isLoading && "Loading project data..."}
          </p>
        </div>
      </div>
    );
  }

  // Ensure projectId is available at this point
  const currentProjectId = projectId;
  if (!currentProjectId) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">No project ID provided</p>
        </div>
      </div>
    );
  }

  const handleGenerateProject = async () => {
    try {
      await generateProjectStructure();
      toast.success('Project structure generated successfully!');
    } catch (error: any) {
      toast.error('Failed to generate project: ' + error.message);
    }
  };

  const handleDeploy = async () => {
    try {
      await deployProject();
      toast.success('Project deployed successfully!');
    } catch (error: any) {
      toast.error('Failed to deploy project: ' + error.message);
    }
  };

  const handleShare = () => {
    if (deploymentUrl) {
      navigator.clipboard.writeText(deploymentUrl);
      toast.success('Deployment URL copied to clipboard!');
    } else {
      toast.error('No deployment URL available');
    }
  };

  return (
    <div className="flex flex-col h-full mx-2 mb-2 rounded-lg overflow-hidden bg-white/30 dark:bg-gray-900/30 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 shadow-xl">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left Panel - AI Chat */}
        {isAIChatPanelVisible && (
          <>
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <div className="h-full p-2">
                <Card className="h-full flex flex-col bg-transparent border-gray-300 dark:border-gray-700/50">
                  <EnhancedChatInterface
                  projectId={currentProjectId}
                  conversationId={isAutoBuild ? builderChat.conversationId : undefined}
                  onApplyCode={(code) => {
                    console.log('Applying code:', code);
                    toast.success('Code applied successfully!');
                  }}
                  className="flex-1"
                  activeAgent={isAutoBuild ? 'builder' : 'project_manager'}
                  onAgentChange={() => {}}
                  conversationTitle={isAutoBuild ? 'Builder Agent' : 'Project Chat'}
                  onNewConversation={() => {}}
                  onToggleHistory={() => {}}
                  isHistoryOpen={false}
                  projectContext={projectData ? {
                    id: currentProjectId,
                    name: projectData.name || 'Untitled Project',
                    description: projectData.description,
                    template: 'react-native'
                  } : undefined}
                  onInitialMessageSent={() => {}}
                  onConversationCreated={() => {}}
                  onTitleGenerated={() => {}}
                  onConversationTitleUpdated={() => {}}
                  buildProgress={isAutoBuild ? builderChat.buildProgress : undefined}
                  />
                </Card>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />
          </>
        )}

        {/* Right Panel - Current Project Editor Content */}
        <ResizablePanel defaultSize={isAIChatPanelVisible ? 65 : 100} minSize={50}>
          <div className="h-full p-2">
            <Card className="h-full flex flex-col bg-transparent border-gray-300 dark:border-gray-700/50">
              {/* Header */}
              <header className="px-4 py-2 flex items-center justify-between border-b border-gray-300 dark:border-gray-700/50">

        {/* View Toggle */}
        <div className="flex items-center space-x-3">
          <Button
            variant={isAIChatPanelVisible ? "outline" : "ghost"}
            size="sm"
            onClick={() => setIsAIChatPanelVisible(!isAIChatPanelVisible)}
            className="h-7 px-2 bg-transparent"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center space-x-2">
            <ButtonGroup
              options={[
                {
                  value: 'preview',
                  label: 'Preview',
                  icon: <Eye className="h-4 w-4" />
                },
                {
                  value: 'code',
                  label: 'Code',
                  icon: <Code className="h-4 w-4" />
                }
              ]}
              value={activeView}
              onValueChange={(value) => setActiveView(value as 'preview' | 'code')}
              size="sm"
              variant="default"
            />
            
            {/* Preview Session Status Indicator */}
            <div className="flex items-center space-x-2 pl-1">
              {renderStatusDot(previewSession.status)}
            </div>

            {/* Build Progress Indicator */}
            {isAutoBuild && builderChat.buildProgress.status === 'generating' && (
              <div className="flex items-center space-x-2 pl-2 text-xs text-muted-foreground">
                <Hammer className="h-3 w-3 animate-pulse text-rose-500" />
                <span className="hidden sm:inline">
                  Building... ({builderChat.buildProgress.stepsCompleted}/{builderChat.buildProgress.stepsTotal} steps, {builderChat.buildProgress.filesCompleted} files)
                </span>
              </div>
            )}
            {isAutoBuild && builderChat.buildProgress.status === 'complete' && (
              <div className="flex items-center space-x-2 pl-2 text-xs text-green-600">
                <Hammer className="h-3 w-3" />
                <span className="hidden sm:inline">Build complete</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          {/* Preview Control */}
          <Button
            variant="outline"
            size="sm"
            onClick={previewSession.status === 'running' ? handleStopPreview : handleStartPreview}
            disabled={previewSession.status === 'starting' || previewSession.status === 'stopping'}
            className="h-7 px-2 bg-transparent"
            title={previewSession.status === 'running' ? 'Stop Preview' : 'Start Preview'}
          >
            {previewSession.status === 'running' ? (
              <Square className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2 bg-transparent">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => {
                setActiveBottomTab('logs');
                setIsBottomPanelOpen(true);
              }}>
                <LogsIcon className="h-4 w-4 mr-2" />
                Logs
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => {
                setActiveBottomTab('terminal');
                setIsBottomPanelOpen(true);
              }}>
                <Terminal className="h-4 w-4 mr-2" />
                Terminal
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setBuilderModel(builderModel === 'claude-sonnet-4-5-20250929' ? 'claude-opus-4-6' : 'claude-sonnet-4-5-20250929')}
              >
                <Hammer className="h-4 w-4 mr-2" />
                Model: {builderModel === 'claude-sonnet-4-5-20250929' ? 'Sonnet' : 'Opus'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings className="h-4 w-4 mr-2" />
                Project Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {activeView === 'code' ? (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* File Explorer */}
            <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
              <FullStackFileExplorer
                projectId={currentProjectId}
                showBackend={isSupabaseConnected}
              />
            </ResizablePanel>
            
            <ResizableHandle withHandle />
            
            {/* Editor */}
            <ResizablePanel defaultSize={75} minSize={60} className="flex flex-col">
              {/* Render Editor Tabs */}
              <EditorTabs
                tabs={openTabs}
                activeTab={activeFile}
                onTabClick={openFile}
                onTabClose={closeFile}
                files={files}
              />

              {/* Render the Active Editor */}
              <div className="flex-1">
                {activeFile && files[activeFile] && (
                  <CodeEditor
                    fileId={activeFile}
                    filePath={activeFile}
                    initialValue={files[activeFile].content}
                    language={files[activeFile].type}
                    isDirty={files[activeFile].isDirty}
                    onChange={(newContent) => {
                      // Read activeFile from store at call time to avoid stale closure
                      const currentFile = useUnifiedEditorStore.getState().activeFile;
                      if (!currentFile) return;
                      updateFileContent(currentFile, newContent);
                      securityMonitoring.onFileOpen(currentFile, newContent);
                    }}
                    onSave={async (content) => {
                      // Read activeFile from store at call time to avoid stale closure
                      // in Monaco's Ctrl+S handler (registered once at mount, never updated)
                      const currentFile = useUnifiedEditorStore.getState().activeFile;
                      if (!currentFile) return;
                      await saveFile(currentFile);
                      securityMonitoring.onFileSave(currentFile, content);
                      previewRealtime.broadcastFileUpdate(currentFile, content);
                    }}
                  />
                )}
                {!activeFile && (
                  <div className="h-full flex items-center justify-center bg-card text-muted-foreground">
                    Select a file to begin editing.
                  </div>
                )}
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="h-full">
            <FullStackPreviewPanelContainer
              projectId={currentProjectId}
              previewSession={previewSession}
              selectedDevice={selectedDevice}
              onDeviceChange={setSelectedDevice}
            />
          </div>
        )}
      </div>

      {/* Bottom Panel (Collapsible) */}
      <VerticalCollapsiblePanel
        isOpen={isBottomPanelOpen}
        onToggle={setIsBottomPanelOpen}
        titleComponent={
          <ButtonGroup
            options={[
              {
                value: 'logs',
                label: 'Logs',
                icon: <LogsIcon className="h-4 w-4" />
              },
              {
                value: 'terminal',
                label: 'Terminal',
                icon: <Terminal className="h-4 w-4" />
              }
            ]}
            value={activeBottomTab}
            onValueChange={(value) => setActiveBottomTab(value as 'logs' | 'terminal')}
            size="sm"
            variant="default"
          />
        }
        className="border-t border-gray-300 dark:border-gray-700/50"
        defaultHeight={400}
      >
        <div className="h-full overflow-hidden">
          {activeBottomTab === 'logs' && (
            <LogsPanel projectId={currentProjectId} />
          )}
          {activeBottomTab === 'terminal' && (
            <TerminalPanel projectId={currentProjectId} />
          )}
        </div>
      </VerticalCollapsiblePanel>

            </Card>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}

// Router-dependent wrapper that uses useParams
function ProjectEditorContent() {
  const { id: projectId } = useParams<{ id: string }>();
  
  return (
    <ProjectEditorCore 
      projectId={projectId}
      showAuthRedirect={true}
      showProjectValidation={true}
    />
  );
}

export function ProjectEditor() {
  const { id: projectId } = useParams<{ id: string }>();
  
  if (!projectId) {
    return <Navigate to="/" replace />;
  }

  return <ProjectEditorContent />;
}

// Export the core component for testing purposes
export { ProjectEditorCore };