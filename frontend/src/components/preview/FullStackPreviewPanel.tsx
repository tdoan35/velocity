import { useState, useEffect, useMemo } from 'react';
import { useProjectEditorStore } from '../../stores/useProjectEditorStore';
import { SnackPreviewPanel } from './SnackPreviewPanel';
import { PreviewHeader } from './PreviewHeader';
import { SharePreviewDialog } from './SharePreviewDialog';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { QRCode } from '../QRCode';
import { 
  Smartphone, 
  AlertCircle,
  Info,
  Package
} from 'lucide-react';
import { toast } from 'sonner';
import { getSnackFallbackFiles } from '../../utils/snackFallbackFiles';
import { usePreviewReadiness } from '../../hooks/usePreviewReadiness';

interface FullStackPreviewPanelProps {
  projectId: string;
}

export function FullStackPreviewPanel({ projectId }: FullStackPreviewPanelProps) {
  const {
    frontendFiles,
    projectData,
    buildStatus,
    isSupabaseConnected,
    isLoading: storeLoading,
    error: storeError
  } = useProjectEditorStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isUsingUserFiles, setIsUsingUserFiles] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  
  // Session state from child SnackPreviewPanel
  const [sessionStatus, setSessionStatus] = useState<'connecting' | 'error' | 'connected' | 'preparing' | 'idle' | 'retrying'>('idle');
  const [isSnackStuck, setIsSnackStuck] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  
  // Modal states for external handling
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
  const [isSessionInfoOpen, setIsSessionInfoOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  
  // Session details for modals (will be set by child component)
  const [sessionDetails, setSessionDetails] = useState<any>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  /**
   * Unified preview system: Always start with demo files for instant preview
   * User can click "Build" to switch to their actual project files
   */
  const { previewFiles, isUsingDemoFiles, userFilesAvailable } = useMemo(() => {
    const hasUserFiles = frontendFiles && Object.keys(frontendFiles).length > 0;
    const projectName = projectData?.name || 'Velocity App';
    
    // Always provide demo files as default - no waiting for store
    const demoFiles = getSnackFallbackFiles(projectName);
    
    if (isUsingUserFiles && hasUserFiles) {
      console.log('[FullStackPreviewPanel] Using user project files:', Object.keys(frontendFiles));
      return {
        previewFiles: frontendFiles,
        isUsingDemoFiles: false,
        userFilesAvailable: true
      };
    } else {
      console.log('[FullStackPreviewPanel] Using demo files for instant preview');
      return {
        previewFiles: demoFiles,
        isUsingDemoFiles: true,
        userFilesAvailable: hasUserFiles
      };
    }
  }, [frontendFiles, projectData?.name, isUsingUserFiles]);

  // Build handler - switches to user files
  const handleBuild = async () => {
    if (!userFilesAvailable) {
      toast.error('No project files available to build');
      return;
    }
    
    setIsBuilding(true);
    
    // Simulate build process
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsUsingUserFiles(true);
    setIsBuilding(false);
    toast.success('Preview updated with your project files');
  };

  // Switch back to demo files
  const handleUseDemoFiles = () => {
    setIsUsingUserFiles(false);
    toast.success('Switched to demo preview');
  };

  // Generate stable session ID based on project and file content hash
  const sessionId = useMemo(() => {
    if (projectId && previewFiles && Object.keys(previewFiles).length > 0) {
      // Create a stable hash of the project content
      const fileKeys = Object.keys(previewFiles).sort();
      const contentHash = fileKeys.map(key => {
        const file = previewFiles[key];
        return `${key}:${file.content ? file.content.length : 0}`;
      }).join('|');
      
      // Use a stable identifier that only changes when content actually changes
      let stableId = '';
      try {
        stableId = btoa(contentHash).substring(0, 8);
      } catch (error) {
        // Fallback to simple hash if btoa fails
        stableId = Math.abs(contentHash.split('').reduce((a, b) => {
          a = ((a << 5) - a) + b.charCodeAt(0);
          return a & a;
        }, 0)).toString(16).substring(0, 8);
      }
      
      const modeSuffix = isUsingDemoFiles ? '-demo' : '-user';
      const sessionId = `${projectId}-${stableId}${modeSuffix}`;
      
      console.log('[FullStackPreviewPanel] Generated session ID:', {
        projectId,
        fileCount: fileKeys.length,
        isUsingDemoFiles,
        stableId,
        sessionId
      });
      
      return sessionId;
    }
    return `${projectId}-demo-default`;
  }, [projectId, previewFiles, isUsingDemoFiles]);

  // Always ready since we start with demo files
  const isPreviewReady = projectId && previewFiles && Object.keys(previewFiles).length > 0;

  console.log('[FullStackPreviewPanel] Preview state:', {
    isPreviewReady,
    sessionId,
    isUsingDemoFiles,
    userFilesAvailable,
    fileCount: previewFiles ? Object.keys(previewFiles).length : 0
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsRefreshing(false);
    toast.success('Preview refreshed');
  };

  // Combined refresh that handles both parent and child refresh
  const handleCombinedRefresh = async () => {
    await handleRefresh();
    // Child will handle its own refresh via onRefresh prop
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
        mode={isUsingDemoFiles ? 'demo' : 'live'}
        status={sessionStatus}
        onMobilePreview={() => setIsMobilePreviewOpen(true)}
        onSessionInfo={() => setIsSessionInfoOpen(true)}
        onSharePreview={() => setIsShareDialogOpen(true)}
        onRefresh={handleCombinedRefresh}
        onBuild={isUsingDemoFiles && userFilesAvailable ? handleBuild : undefined}
        onDemoMode={!isUsingDemoFiles ? handleUseDemoFiles : undefined}
        showBuildButton={isUsingDemoFiles && userFilesAvailable}
        showDemoButton={!isUsingDemoFiles}
        isBuilding={isBuilding}
        buildButtonText="Build"
        isRefreshing={isRefreshing}
        isStuck={isSnackStuck}
        sessionDisabled={!hasSession}
      />
      
      {/* Preview Content */}
      <div className="flex-1 overflow-hidden">
        <SnackPreviewPanel
          sessionId={sessionId}
          projectId={projectId}
          files={previewFiles}
          className="h-full"
          onStatusChange={setSessionStatus}
          onStuckChange={setIsSnackStuck}
          onSessionChange={setHasSession}
          onSessionDetailsChange={setSessionDetails}
          onQrCodeChange={setQrCodeUrl}
          externalMobilePreview={true}
          externalSessionInfo={true}
          externalSharePreview={true}
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
              {qrCodeUrl ? (
                <div className="text-center">
                  <h5 className="text-base font-medium mb-2">
                    Scan with Expo Go
                  </h5>
                  <p className="text-sm text-muted-foreground mb-6">
                    Scan this QR code with the Expo Go app on your iOS or Android device
                  </p>
                  
                  <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
                    <QRCode value={qrCodeUrl} size={180} />
                  </div>
                  
                  <div className="flex flex-col gap-3">
                    <a
                      href="https://expo.dev/client"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline"
                    >
                      Don't have Expo Go? Download it here →
                    </a>
                    
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="font-mono text-xs">
                        {qrCodeUrl}
                      </Badge>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-sm text-muted-foreground">
                    No QR code available. Please wait for the session to initialize.
                  </p>
                </div>
              )}
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
                  Session ID
                </h5>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {sessionId}
                </code>
              </div>

              {sessionDetails && (
                <>
                  <div>
                    <h5 className="text-sm font-medium text-muted-foreground mb-1">
                      Channel
                    </h5>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {(sessionDetails.snack as any).getChannel?.() || sessionDetails.id}
                    </code>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-muted-foreground mb-1">
                      SDK Version
                    </h5>
                    <Badge variant="outline">
                      {(sessionDetails.snack as any).getSdkVersion?.() || '52.0.0'}
                    </Badge>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-muted-foreground mb-1">
                      Dependencies
                    </h5>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries((sessionDetails.snack as any).getDependencies?.() || {}).map(([name, version]) => (
                        <Badge key={name} variant="secondary" className="gap-1">
                          <Package className="w-3 h-3" />
                          {name}@{String(version)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-muted-foreground mb-1">
                      Last Activity
                    </h5>
                    <p className="text-sm">
                      {sessionDetails.lastActivity?.toLocaleString?.() || 'N/A'}
                    </p>
                  </div>
                </>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Share dialog */}
      {isShareDialogOpen && sessionDetails && (
        <SharePreviewDialog
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          projectId={projectId || sessionId}
          projectName={(sessionDetails.snack as any).getName?.() || 'Preview'}
        />
      )}
    </div>
  );
}