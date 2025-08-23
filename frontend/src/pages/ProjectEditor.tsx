import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/useAuthStore';
import { useProjectEditorStore } from '../stores/useProjectEditorStore';
import { toast } from 'sonner';
import { Loader2, Settings, Download, Share2, Eye, Code, FileText, Play, Shield, Activity } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../components/ui/resizable';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { FullStackFileExplorer } from '../components/editor/FullStackFileExplorer';
import { EnhancedEditorContainer } from '../components/editor/EnhancedEditorContainer';
import { FullStackPreviewPanel } from '../components/preview/FullStackPreviewPanel';
import { FullStackAIAssistant } from '../components/ai/FullStackAIAssistant';
import { VerticalCollapsiblePanel } from '../components/layout/vertical-collapsible-panel';
import { SecurityProvider, useSecurity } from '../components/security/SecurityProvider';
import { SecurityDashboard } from '../components/security/SecurityDashboard';
import { useFileSecurityMonitoring } from '../hooks/useSecurityMonitoring';
import { PerformanceDashboard } from '../components/performance/PerformanceDashboard';
import { usePerformanceMonitoring } from '../hooks/usePerformanceMonitoring';

function ProjectEditorContent() {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const { activeThreats, isSecurityEnabled } = useSecurity();
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
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (projectId && user && !isInitialized) {
      initializeProject(projectId)
        .then(() => {
          setIsInitialized(true);
        })
        .catch((error) => {
          toast.error('Failed to initialize project: ' + error.message);
        });
    }
  }, [projectId, user, initializeProject, isInitialized]);

  // Redirect if not authenticated
  if (!user) {
    return <Navigate to="/signup" replace />;
  }

  // Project validation
  if (!projectId) {
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
    <div className="h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Code className="h-5 w-5 text-primary" />
            <h1 className="font-semibold text-foreground">
              {projectData?.name || 'Untitled Project'}
            </h1>
          </div>
          
          {/* Build Status */}
          <div className="flex items-center space-x-2 text-sm">
            {buildStatus === 'generating' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span className="text-blue-600">Generating...</span>
              </>
            )}
            {buildStatus === 'building' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                <span className="text-orange-600">Building...</span>
              </>
            )}
            {buildStatus === 'success' && (
              <>
                <div className="h-2 w-2 bg-green-500 rounded-full" />
                <span className="text-green-600">Ready</span>
              </>
            )}
            {buildStatus === 'error' && (
              <>
                <div className="h-2 w-2 bg-red-500 rounded-full" />
                <span className="text-red-600">Error</span>
              </>
            )}
          </div>

          {/* Supabase Connection Status */}
          {isSupabaseConnected && (
            <div className="flex items-center space-x-2 text-sm">
              <div className="h-2 w-2 bg-green-500 rounded-full" />
              <span className="text-green-600">Supabase Connected</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          {/* Security Status */}
          {isSecurityEnabled && (
            <div className="flex items-center space-x-2 text-sm">
              <Shield className={`h-4 w-4 ${activeThreats > 0 ? 'text-red-500' : 'text-green-500'}`} />
              {activeThreats > 0 ? (
                <Badge variant="destructive" className="text-xs">
                  {activeThreats} threats
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs bg-green-100 text-green-800">
                  Secure
                </Badge>
              )}
            </div>
          )}

          {/* Performance Status */}
          <div className="flex items-center space-x-2 text-sm">
            <Activity className="h-4 w-4 text-blue-500" />
            <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
              Score: {performanceMonitoring.getPerformanceScore()}/100
            </Badge>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateProject}
            disabled={buildStatus === 'generating' || buildStatus === 'building'}
          >
            <FileText className="h-4 w-4 mr-2" />
            Generate
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeploy}
            disabled={buildStatus !== 'success'}
          >
            <Play className="h-4 w-4 mr-2" />
            Deploy
          </Button>
          
          {deploymentUrl && (
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          )}
          
          <Button
            variant="outline" 
            size="sm"
            onClick={() => setIsSecurityPanelOpen(!isSecurityPanelOpen)}
          >
            <Shield className="h-4 w-4 mr-2" />
            Security
          </Button>

          <Button
            variant="outline" 
            size="sm"
            onClick={() => setIsPerformancePanelOpen(!isPerformancePanelOpen)}
          >
            <Activity className="h-4 w-4 mr-2" />
            Performance
          </Button>
          
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* File Explorer */}
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
            <FullStackFileExplorer
              projectId={projectId}
              showBackend={isSupabaseConnected}
            />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          {/* Editor */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <EnhancedEditorContainer
              projectId={projectId}
              projectType={isSupabaseConnected ? 'full-stack' : 'frontend-only'}
              onFileSave={securityMonitoring.onFileSave}
              onFileOpen={securityMonitoring.onFileOpen}
            />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          {/* Preview */}
          <ResizablePanel defaultSize={30} minSize={20}>
            <FullStackPreviewPanel
              projectId={projectId}
              showAPITesting={isSupabaseConnected}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
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
        <SecurityDashboard projectId={projectId} />
      </VerticalCollapsiblePanel>

      {/* AI Assistant Panel (Collapsible) */}
      <VerticalCollapsiblePanel
        isOpen={isAIAssistantOpen}
        onToggle={setIsAIAssistantOpen}
        title="AI Assistant"
        className="border-t"
      >
        <FullStackAIAssistant
          projectId={projectId}
          projectType={isSupabaseConnected ? 'full-stack' : 'frontend-only'}
        />
      </VerticalCollapsiblePanel>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsPerformancePanelOpen(!isPerformancePanelOpen)}
          className={performanceMonitoring.getPerformanceScore() < 70 ? 'border-orange-500 bg-orange-50' : ''}
        >
          <Activity className="h-4 w-4 mr-2" />
          Performance
          <Badge variant="outline" className="ml-2 text-xs">
            {performanceMonitoring.getPerformanceScore()}
          </Badge>
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsSecurityPanelOpen(!isSecurityPanelOpen)}
          className={activeThreats > 0 ? 'border-red-500 bg-red-50' : ''}
        >
          <Shield className="h-4 w-4 mr-2" />
          Security
          {activeThreats > 0 && (
            <Badge variant="destructive" className="ml-2 text-xs">
              {activeThreats}
            </Badge>
          )}
        </Button>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsAIAssistantOpen(!isAIAssistantOpen)}
        >
          <Eye className="h-4 w-4 mr-2" />
          AI Assistant
        </Button>
      </div>
    </div>
  );
}

export function ProjectEditor() {
  const { id: projectId } = useParams<{ id: string }>();
  
  if (!projectId) {
    return <Navigate to="/" replace />;
  }

  return (
    <SecurityProvider projectId={projectId}>
      <ProjectEditorContent />
    </SecurityProvider>
  );
}