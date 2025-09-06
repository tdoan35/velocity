import { useState, useRef } from 'react';
import { useProjectEditorStore } from '../../stores/useProjectEditorStore';
import { ContainerPreviewPanel } from './ContainerPreviewPanel';
import type { ContainerPreviewPanelRef } from './ContainerPreviewPanel';
import { PreviewHeader } from './PreviewHeader';
import { SharePreviewDialog } from './SharePreviewDialog';
import { 
  Smartphone
} from 'lucide-react';
import { toast } from 'sonner';
import type { PreviewStatus } from '../../hooks/usePreviewSession';

interface FullStackPreviewPanelContainerProps {
  projectId: string;
}

export function FullStackPreviewPanelContainer({ projectId }: FullStackPreviewPanelContainerProps) {
  const {
    projectData
  } = useProjectEditorStore();

  const containerPreviewRef = useRef<ContainerPreviewPanelRef>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPreviewRunning, setIsPreviewRunning] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  
  // Session state from ContainerPreviewPanel
  const [sessionStatus, setSessionStatus] = useState<PreviewStatus>('idle');
  const [hasSession, setHasSession] = useState(false);
  
  // Modal states for external handling
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

  // Preview control handlers that delegate to ContainerPreviewPanel
  const handleStartPreview = async () => {
    if (containerPreviewRef.current) {
      try {
        await containerPreviewRef.current.startSession();
      } catch (error) {
        console.error('Failed to start preview:', error);
        toast.error('Failed to start preview');
      }
    }
  };

  const handleStopPreview = async () => {
    if (containerPreviewRef.current) {
      try {
        await containerPreviewRef.current.stopSession();
      } catch (error) {
        console.error('Failed to stop preview:', error);
        toast.error('Failed to stop preview');
      }
    }
  };

  const handleOpenInNewWindow = () => {
    if (containerPreviewRef.current) {
      containerPreviewRef.current.openInNewWindow();
    }
  };

  const handleRefresh = async () => {
    if (containerPreviewRef.current) {
      setIsRefreshing(true);
      try {
        containerPreviewRef.current.refresh();
        // Small delay for visual feedback
        await new Promise(resolve => setTimeout(resolve, 500));
      } finally {
        setIsRefreshing(false);
      }
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
        selectedDevice={selectedDevice}
        onDeviceChange={setSelectedDevice}
        isPreviewRunning={isPreviewRunning}
        onStartPreview={handleStartPreview}
        onStopPreview={handleStopPreview}
        onOpenInNewWindow={handleOpenInNewWindow}
        onSharePreview={() => setIsShareDialogOpen(true)}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        isStuck={false}
        sessionDisabled={!hasSession}
      />
      
      {/* Container-based Preview Content */}
      <div className="flex-1 overflow-hidden">
        <ContainerPreviewPanel
          ref={containerPreviewRef}
          projectId={projectId}
          className="h-full"
          onStatusChange={(status) => {
            setSessionStatus(status);
            // Update preview running state based on status
            setIsPreviewRunning(status === 'running' || status === 'starting');
          }}
          onSessionChange={setHasSession}
          selectedDevice={selectedDevice === 'mobile' ? 'mobile' : selectedDevice === 'tablet' ? 'tablet' : 'desktop'}
          onDeviceChange={(deviceId) => setSelectedDevice(deviceId as 'mobile' | 'tablet' | 'desktop')}
        />
      </div>

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