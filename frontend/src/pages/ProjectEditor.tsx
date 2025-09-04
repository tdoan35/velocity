import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { useProjectEditorStore } from '../stores/useProjectEditorStore';
import { toast } from 'sonner';
import { Loader2, Settings, Eye, Code,  MessageSquare, FileText as LogsIcon, Terminal } from 'lucide-react';
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
import { EnhancedEditorContainer } from '../components/editor/EnhancedEditorContainer';
import { FullStackPreviewPanel } from '../components/preview/FullStackPreviewPanel';
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
  // No longer need to manually sync - ProjectContext handles this automatically
  const securityMonitoring = useFileSecurityMonitoring();
  const {
    projectData,
    isLoading,
    deploymentUrl,
    isSupabaseConnected,
    initializeProject,
    generateProjectStructure,
    deployProject
  } = useProjectEditorStore();

  const [isBottomPanelOpen, setIsBottomPanelOpen] = useState(false);
  const [activeBottomTab, setActiveBottomTab] = useState<'logs' | 'terminal'>('logs');
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeView, setActiveView] = useState<'preview' | 'code'>('preview');
  const [isAIChatPanelVisible, setIsAIChatPanelVisible] = useState(true);

  useEffect(() => {
    if (skipInitialization) {
      // Skip API initialization for test mode
      setIsInitialized(true);
      return;
    }
    
    if (projectId && user && !isInitialized) {
      initializeProject(projectId)
        .then(() => {
          setIsInitialized(true);
        })
        .catch((error) => {
          toast.error('Failed to initialize project: ' + error.message);
        });
    }
  }, [projectId, user, initializeProject, isInitialized, skipInitialization]);

  // ProjectContext automatically handles currentProject syncing based on route changes

  // Redirect if not authenticated (only if enabled)
  if (showAuthRedirect && !user) {
    return <Navigate to="/signup" replace />;
  }

  // Project validation (only if enabled)
  if (showProjectValidation && !projectId) {
    return <Navigate to="/" replace />;
  }

  // Loading state
  if (isLoading || !isInitialized) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin mx-auto" />
          <p className="text-muted-foreground">Loading project...</p>
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
                  conversationId={undefined}
                  onApplyCode={(code) => {
                    console.log('Applying code:', code);
                    toast.success('Code applied successfully!');
                  }}
                  className="flex-1"
                  activeAgent="project_manager"
                  onAgentChange={() => {}}
                  conversationTitle="Project Chat"
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
        <div className="flex items-center space-x-2">
          <Button
            variant={isAIChatPanelVisible ? "outline" : "ghost"}
            size="sm"
            onClick={() => setIsAIChatPanelVisible(!isAIChatPanelVisible)}
            className="h-7 px-2 bg-transparent"
          >
            <MessageSquare className="h-4 w-4" />
          </Button>
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
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
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
            <ResizablePanel defaultSize={75} minSize={60}>
              <EnhancedEditorContainer
                projectId={currentProjectId}
                projectType={isSupabaseConnected ? 'full-stack' : 'frontend-only'}
                onFileSave={securityMonitoring.onFileSave}
                onFileOpen={securityMonitoring.onFileOpen}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <div className="h-full">
            <FullStackPreviewPanel
              projectId={currentProjectId}
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