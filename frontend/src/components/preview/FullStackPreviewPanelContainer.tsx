import { useState, useRef, useEffect } from 'react';
import { useUnifiedEditorStore } from '../../stores/useUnifiedEditorStore';
import { ContainerPreviewPanel } from './ContainerPreviewPanel';
import type { ContainerPreviewPanelRef } from './ContainerPreviewPanel';
import { PreviewHeader } from './PreviewHeader';
import { SharePreviewDialog } from './SharePreviewDialog';
import { 
  Smartphone
} from 'lucide-react';
import type { PreviewStatus, PreviewSession } from '../../hooks/usePreviewSession';

interface PreviewSessionProp {
  status: PreviewStatus;
  isLoading: boolean;
  isActive: boolean;
  containerUrl?: string;
  errorMessage?: string;
  startSession: (device?: string) => Promise<PreviewSession | null>;
  stopSession: () => Promise<void>;
  refreshStatus: () => void;
}

interface FullStackPreviewPanelContainerProps {
  projectId: string;
  previewSession: PreviewSessionProp;
  selectedDevice: 'mobile' | 'tablet' | 'desktop';
  onDeviceChange: (device: 'mobile' | 'tablet' | 'desktop') => void;
}

export function FullStackPreviewPanelContainer({ 
  projectId, 
  previewSession,
  selectedDevice,
  onDeviceChange
}: FullStackPreviewPanelContainerProps) {
  const {
    projectData
  } = useUnifiedEditorStore();

  const containerPreviewRef = useRef<ContainerPreviewPanelRef>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Session state now comes from props
  const sessionStatus = previewSession.status;
  const hasSession = previewSession.isActive;
  
  // Modal states for external handling
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);

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
      {/* Preview Header */}
      <PreviewHeader
        mode="live"
        status={getHeaderStatus(sessionStatus)}
        selectedDevice={selectedDevice}
        onDeviceChange={onDeviceChange}
        onOpenInNewWindow={handleOpenInNewWindow}
        onSharePreview={() => setIsShareDialogOpen(true)}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        sessionDisabled={!hasSession}
      />

      {/* Container-based Preview Content */}
      <div className="flex-1 overflow-hidden">
        <ContainerPreviewPanel
          ref={containerPreviewRef}
          projectId={projectId}
          className="h-full"
          previewSession={previewSession}
          selectedDevice={selectedDevice}
          onDeviceChange={onDeviceChange}
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