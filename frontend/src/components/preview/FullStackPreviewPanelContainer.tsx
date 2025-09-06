import { useState, useMemo } from 'react';
import { useProjectEditorStore } from '../../stores/useProjectEditorStore';
import { ContainerPreviewPanel } from './ContainerPreviewPanel';
import { PreviewHeader } from './PreviewHeader';
import { SharePreviewDialog } from './SharePreviewDialog';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { 
  Smartphone, 
  AlertCircle,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import type { PreviewStatus } from '../../hooks/usePreviewSession';

interface FullStackPreviewPanelContainerProps {
  projectId: string;
}

export function FullStackPreviewPanelContainer({ projectId }: FullStackPreviewPanelContainerProps) {
  const {
    frontendFiles,
    projectData,
    buildStatus,
    isSupabaseConnected,
    isLoading: storeLoading,
    error: storeError
  } = useProjectEditorStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  
  // Session state from ContainerPreviewPanel
  const [sessionStatus, setSessionStatus] = useState<PreviewStatus>('idle');
  const [hasSession, setHasSession] = useState(false);
  
  // Modal states for external handling
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
  const [isSessionInfoOpen, setIsSessionInfoOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  
  // Session details for modals
  const [sessionDetails, setSessionDetails] = useState<any>(null);

  // Build handler
  const handleBuild = async () => {
    setIsBuilding(true);
    
    try {
      // TODO: Implement actual build process
      await new Promise(resolve => setTimeout(resolve, 2000));
      toast.success('Build completed successfully');
    } catch (error) {
      toast.error('Build failed');
    } finally {
      setIsBuilding(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    try {
      // Trigger a refresh in the container preview
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast.success('Preview refreshed');
    } catch (error) {
      toast.error('Failed to refresh preview');
    } finally {
      setIsRefreshing(false);
    }
  };

  // Map container status to preview header status
  const getHeaderStatus = (status: PreviewStatus): 'connecting' | 'error' | 'connected' | 'preparing' | 'idle' | 'retrying' => {
    switch (status) {
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

  // Simple loading state only if no project ID
  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center bg-card">
        <div className="text-center text-muted-foreground">
          <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg mb-2">No project selected</p>
          <p className="text-sm">Please select a project to preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-transparent">
      {/* Unified Header */}
      <PreviewHeader
        mode="live"
        status={getHeaderStatus(sessionStatus)}
        onMobilePreview={() => setIsMobilePreviewOpen(true)}
        onSessionInfo={() => setIsSessionInfoOpen(true)}
        onSharePreview={() => setIsShareDialogOpen(true)}
        onRefresh={handleRefresh}
        onBuild={handleBuild}
        showBuildButton={true}
        isBuilding={isBuilding}
        buildButtonText="Build"
        isRefreshing={isRefreshing}
        isStuck={false}
        sessionDisabled={!hasSession}
      />
      
      {/* Container-based Preview Content */}
      <div className="flex-1 overflow-hidden">
        <ContainerPreviewPanel
          projectId={projectId}
          className="h-full"
          onStatusChange={setSessionStatus}
          onSessionChange={setHasSession}
        />
      </div>

      {/* External Modal Handlers */}
      
      {/* Mobile Preview Modal */}
      {isMobilePreviewOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Mobile Preview</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsMobilePreviewOpen(false)}
              >
                ✕
              </Button>
            </div>
            
            <div className="flex flex-col items-center justify-center">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  Mobile preview is currently being implemented for container-based previews.
                  The preview URL will be available soon.
                </p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Session Info Modal */}
      {isSessionInfoOpen && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <Card className="w-full max-w-lg mx-4 p-6 max-h-[80%] flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold">Session Information</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSessionInfoOpen(false)}
              >
                ✕
              </Button>
            </div>
            
            <div className="space-y-4 overflow-auto">
              <div>
                <h5 className="text-sm font-medium text-muted-foreground mb-1">
                  Project ID
                </h5>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {projectId}
                </code>
              </div>

              <div>
                <h5 className="text-sm font-medium text-muted-foreground mb-1">
                  Preview Type
                </h5>
                <Badge variant="outline">Container-based</Badge>
              </div>

              <div>
                <h5 className="text-sm font-medium text-muted-foreground mb-1">
                  Status
                </h5>
                <Badge variant={sessionStatus === 'running' ? 'default' : 'secondary'}>
                  {sessionStatus}
                </Badge>
              </div>

              <div>
                <h5 className="text-sm font-medium text-muted-foreground mb-1">
                  Session Active
                </h5>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${hasSession ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="text-sm">{hasSession ? 'Active' : 'Inactive'}</span>
                </div>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                      Container Preview
                    </p>
                    <p className="text-blue-700 dark:text-blue-300 text-xs">
                      This preview runs in an isolated container environment powered by Fly.io,
                      providing a production-like preview experience.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Share dialog */}
      {isShareDialogOpen && (
        <SharePreviewDialog
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          projectId={projectId}
          projectName={projectData?.name || 'Preview'}
        />
      )}
    </div>
  );
}