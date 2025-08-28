import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { useAppStore } from '../stores/useAppStore';
import { useProjectEditorStore } from '../stores/useProjectEditorStore';
import { toast } from 'sonner';
import { Loader2, Settings, Download, Share2, Eye, Code, FileText, Play, Shield, Activity } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../components/ui/resizable';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '../components/ui/toggle-group';
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
import { PreviewTabsPanel } from '../components/preview/PreviewTabsPanel';
import { FullStackAIAssistant } from '../components/ai/FullStackAIAssistant';
import { EnhancedChatInterface } from '@/components/chat/enhanced-chat-interface';
import { VerticalCollapsiblePanel } from '../components/layout/vertical-collapsible-panel';
import { useUnifiedProjectContext } from '../contexts/UnifiedProjectContext';
import { SecurityDashboard } from '../components/security/SecurityDashboard';
import { useFileSecurityMonitoring } from '../hooks/useSecurityMonitoring';
import { PerformanceDashboard } from '../components/performance/PerformanceDashboard';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';

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
  const { setCurrentProject } = useAppStore();
  const { security } = useUnifiedProjectContext();
  const { activeThreats, isSecurityEnabled } = security;
  const securityMonitoring = useFileSecurityMonitoring();
  const performanceMonitoring = usePerformanceMonitoring(true);
  const {
    projectData,
    isLoading,
    buildStatus,
    deploymentUrl,
    isSupabaseConnected,
    initializeProject,
    generateProjectStructure,
    deployProject
  } = useProjectEditorStore();

  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [isSecurityPanelOpen, setIsSecurityPanelOpen] = useState(false);
  const [isPerformancePanelOpen, setIsPerformancePanelOpen] = useState(false);
  const [isPreviewTabsOpen, setIsPreviewTabsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [activeView, setActiveView] = useState<'code' | 'preview'>('code');

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

  // Set current project in app store when project data is available
  useEffect(() => {
    if (projectData && projectId) {
      setCurrentProject({
        id: projectId,
        name: projectData.name || 'Untitled Project',
        description: projectData.description || '',
        createdAt: new Date(projectData.created_at || Date.now()),
        updatedAt: new Date(projectData.updated_at || Date.now()),
        template: 'react-native',
        status: 'ready'
      });
    }
  }, [projectData, projectId, setCurrentProject]);

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

        {/* Right Panel - Current Project Editor Content */}
        <ResizablePanel defaultSize={65} minSize={50}>
          <div className="h-full p-2">
            <Card className="h-full flex flex-col bg-transparent border-gray-300 dark:border-gray-700/50">
              {/* Header */}
              <header className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Code className="h-5 w-5 text-primary" />
            <h1 className="font-semibold text-foreground">
              {projectData?.name || 'Untitled Project'}
            </h1>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center">
          <ToggleGroup 
            type="single" 
            value={activeView} 
            onValueChange={(value) => value && setActiveView(value as 'code' | 'preview')}
            className="bg-muted rounded-md p-1"
          >
            <ToggleGroupItem value="code" className="data-[state=on]:bg-background">
              <Code className="h-4 w-4 mr-2" />
              Code
            </ToggleGroupItem>
            <ToggleGroupItem value="preview" className="data-[state=on]:bg-background">
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsSecurityPanelOpen(!isSecurityPanelOpen)}>
                <Shield className="h-4 w-4 mr-2" />
                Security
                {activeThreats > 0 && (
                  <Badge variant="destructive" className="ml-auto text-xs">
                    {activeThreats}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsPerformancePanelOpen(!isPerformancePanelOpen)}>
                <Activity className="h-4 w-4 mr-2" />
                Performance
                <Badge variant="outline" className="ml-auto text-xs">
                  {performanceMonitoring.getPerformanceScore()}/100
                </Badge>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsPreviewTabsOpen(!isPreviewTabsOpen)}>
                <Eye className="h-4 w-4 mr-2" />
                Tools
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

      {/* Performance Panel (Collapsible) */}
      <VerticalCollapsiblePanel
        isOpen={isPerformancePanelOpen}
        onToggle={setIsPerformancePanelOpen}
        title="Performance Dashboard"
        className="border-t"
        defaultHeight={400}
      >
        <PerformanceDashboard />
      </VerticalCollapsiblePanel>

      {/* Security Panel (Collapsible) */}
      <VerticalCollapsiblePanel
        isOpen={isSecurityPanelOpen}
        onToggle={setIsSecurityPanelOpen}
        title="Security Dashboard"
        className="border-t"
        defaultHeight={400}
      >
        <SecurityDashboard projectId={currentProjectId} />
      </VerticalCollapsiblePanel>

      {/* Preview Tools Panel (Collapsible) */}
      <VerticalCollapsiblePanel
        isOpen={isPreviewTabsOpen}
        onToggle={setIsPreviewTabsOpen}
        title="Preview Tools"
        className="border-t"
        defaultHeight={400}
      >
        <PreviewTabsPanel
          projectId={currentProjectId}
          showAPITesting={isSupabaseConnected}
        />
      </VerticalCollapsiblePanel>

      {/* AI Assistant Panel (Collapsible) */}
      <VerticalCollapsiblePanel
        isOpen={isAIAssistantOpen}
        onToggle={setIsAIAssistantOpen}
        title="AI Assistant"
        className="border-t"
      >
        <FullStackAIAssistant
          projectId={currentProjectId}
          projectType={isSupabaseConnected ? 'full-stack' : 'frontend-only'}
        />
      </VerticalCollapsiblePanel>

              {/* Floating Action Buttons */}
              <div className="fixed bottom-4 right-4 z-50">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsAIAssistantOpen(!isAIAssistantOpen)}
                >
                  <Code className="h-4 w-4 mr-2" />
                  AI Assistant
                </Button>
              </div>
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