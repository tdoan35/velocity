import { useState, useRef, useEffect } from 'react';
import { usePreviewSession, type PreviewStatus } from '../../hooks/usePreviewSession';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { 
  Smartphone, 
  Monitor, 
  Tablet,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Power,
  PowerOff,
  RotateCw
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContainerPreviewPanelProps {
  projectId: string;
  className?: string;
  onStatusChange?: (status: PreviewStatus) => void;
  onSessionChange?: (hasSession: boolean) => void;
}

interface DeviceConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  aspectRatio: number;
  type: 'mobile' | 'tablet' | 'desktop';
}

const DEVICE_CONFIGS: DeviceConfig[] = [
  {
    id: 'mobile',
    name: 'Mobile',
    width: 375,
    height: 667,
    aspectRatio: 9/16,
    type: 'mobile'
  },
  {
    id: 'tablet',
    name: 'Tablet',
    width: 768,
    height: 1024,
    aspectRatio: 3/4,
    type: 'tablet'
  },
  {
    id: 'desktop',
    name: 'Desktop',
    width: 1200,
    height: 800,
    aspectRatio: 3/2,
    type: 'desktop'
  }
];

export function ContainerPreviewPanel({ 
  projectId, 
  className,
  onStatusChange,
  onSessionChange
}: ContainerPreviewPanelProps) {
  const [selectedDevice, setSelectedDevice] = useState<string>('mobile');
  const [isLandscape, setIsLandscape] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const previewSession = usePreviewSession({
    projectId,
    onError: (error) => {
      console.error('[ContainerPreviewPanel] Session error:', error);
      console.error('[ContainerPreviewPanel] Error details:', {
        message: error.message,
        stack: error.stack,
        projectId,
        orchestratorUrl: import.meta.env.VITE_ORCHESTRATOR_URL
      });
      setIframeError(error.message);
    },
    onStatusChange: (status, session) => {
      console.log('[ContainerPreviewPanel] Status changed:', status, session);
      onStatusChange?.(status);
      onSessionChange?.(status === 'running');
      
      // Reset iframe error when session changes
      if (status === 'starting') {
        setIframeError(null);
        setIframeLoading(true);
      } else if (status === 'running' && session?.containerUrl) {
        // Start iframe loading timeout when container becomes available
        setIframeLoading(true);
        setIframeError(null);
        
        if (loadingTimeoutRef.current) {
          clearTimeout(loadingTimeoutRef.current);
        }
        
        loadingTimeoutRef.current = setTimeout(() => {
          if (iframeLoading) {
            setIframeLoading(false);
            setIframeError('Preview container took too long to respond');
          }
        }, 30000);
      }
    },
  });

  const currentDevice = DEVICE_CONFIGS.find(d => d.id === selectedDevice) || DEVICE_CONFIGS[0];

  // Calculate responsive dimensions with enhanced scaling logic
  const getResponsiveDimensions = () => {
    const baseWidth = isLandscape ? currentDevice.height : currentDevice.width;
    const baseHeight = isLandscape ? currentDevice.width : currentDevice.height;
    
    // Get available viewport space, accounting for headers and padding
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Reserve space for headers, controls, and padding
    const headerHeight = 80; // Approximate header height
    const footerHeight = 40; // Approximate footer height
    const padding = 32; // Total padding around preview
    
    const availableWidth = viewportWidth - padding;
    const availableHeight = viewportHeight - headerHeight - footerHeight - padding;
    
    // For mobile viewports, use more of the available space
    const isMobileViewport = viewportWidth < 768;
    const widthFactor = isMobileViewport ? 0.95 : 0.85;
    const heightFactor = isMobileViewport ? 0.8 : 0.75;
    
    const maxWidth = Math.min(
      selectedDevice === 'desktop' ? 1200 : selectedDevice === 'tablet' ? 900 : 600,
      availableWidth * widthFactor
    );
    const maxHeight = Math.min(
      selectedDevice === 'desktop' ? 800 : selectedDevice === 'tablet' ? 1024 : 800,
      availableHeight * heightFactor
    );
    
    const scaleX = maxWidth / baseWidth;
    const scaleY = maxHeight / baseHeight;
    const scale = Math.min(scaleX, scaleY, 1);
    
    return {
      width: Math.round(baseWidth * scale),
      height: Math.round(baseHeight * scale),
      scale,
      isMobileViewport
    };
  };

  const [dimensions, setDimensions] = useState(getResponsiveDimensions());

  // Update dimensions on window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions(getResponsiveDimensions());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedDevice, isLandscape]);

  // Update dimensions when device or orientation changes
  useEffect(() => {
    setDimensions(getResponsiveDimensions());
  }, [selectedDevice, isLandscape]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDevice(deviceId);
    // Reset orientation when changing devices
    setIsLandscape(false);
  };

  const handleStartSession = async (deviceType?: string) => {
    const device = deviceType || selectedDevice;
    try {
      setIframeLoading(true);
      setIframeError(null);
      await previewSession.startSession(device);
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const handleStopSession = async () => {
    try {
      await previewSession.stopSession();
      setIframeLoading(false);
      setIframeError(null);
    } catch (error) {
      console.error('Failed to stop session:', error);
    }
  };

  const handleRefresh = () => {
    if (iframeRef.current) {
      setIframeLoading(true);
      setIframeError(null);
      
      // Set timeout for iframe loading
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
      
      loadingTimeoutRef.current = setTimeout(() => {
        if (iframeLoading) {
          setIframeLoading(false);
          setIframeError('Preview container took too long to respond');
        }
      }, 30000); // 30 second timeout
      
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const handleOpenExternal = () => {
    if (previewSession.containerUrl) {
      window.open(previewSession.containerUrl, '_blank');
    }
  };

  const handleIframeLoad = () => {
    // Clear loading timeout
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    
    setIframeLoading(false);
    setIframeError(null);
  };

  const handleIframeError = () => {
    // Clear loading timeout
    if (loadingTimeoutRef.current) {
      clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
    }
    
    setIframeLoading(false);
    setIframeError('Failed to load preview container');
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return <Smartphone className="h-4 w-4" />;
      case 'tablet':
        return <Tablet className="h-4 w-4" />;
      case 'desktop':
        return <Monitor className="h-4 w-4" />;
      default:
        return <Smartphone className="h-4 w-4" />;
    }
  };

  const getStatusColor = () => {
    switch (previewSession.status) {
      case 'running':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'starting':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'stopping':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getStatusText = () => {
    switch (previewSession.status) {
      case 'running':
        return 'Running';
      case 'starting':
        return 'Starting...';
      case 'error':
        return 'Error';
      case 'stopping':
        return 'Stopping...';
      default:
        return 'Stopped';
    }
  };

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header Controls */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-4">
          {/* Device Selection */}
          <div className="flex items-center gap-2">
            {DEVICE_CONFIGS.map((device) => (
              <Button
                key={device.id}
                variant={selectedDevice === device.id ? 'default' : 'outline'}
                size="sm"
                className="h-8"
                onClick={() => handleDeviceChange(device.id)}
                disabled={previewSession.isLoading}
              >
                {getDeviceIcon(device.type)}
                <span className="ml-1 text-xs">{device.name}</span>
              </Button>
            ))}
          </div>

          {/* Rotate Button */}
          {selectedDevice !== 'desktop' && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => setIsLandscape(!isLandscape)}
              disabled={previewSession.status !== 'running'}
              title="Rotate device"
            >
              <RotateCw className="h-3 w-3" />
            </Button>
          )}

          {/* Status Badge */}
          <Badge className={`text-xs ${getStatusColor()}`}>
            {getStatusText()}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          {previewSession.status === 'running' && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleRefresh}
              disabled={iframeLoading}
              title="Refresh preview"
            >
              <RefreshCw className={`h-3 w-3 ${iframeLoading ? 'animate-spin' : ''}`} />
            </Button>
          )}

          {/* External Link Button */}
          {previewSession.containerUrl && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleOpenExternal}
              title="Open in new tab"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}

          {/* Start/Stop Button */}
          {previewSession.status === 'idle' || previewSession.status === 'error' ? (
            <Button
              size="sm"
              className="h-8"
              onClick={() => handleStartSession()}
              disabled={previewSession.isLoading}
            >
              {previewSession.isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Power className="h-3 w-3 mr-1" />
              )}
              Start
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleStopSession}
              disabled={previewSession.isLoading}
            >
              {previewSession.isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <PowerOff className="h-3 w-3 mr-1" />
              )}
              Stop
            </Button>
          )}
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 flex items-center justify-center p-4 bg-slate-50 dark:bg-slate-900">
        {previewSession.status === 'idle' ? (
          <Card className="p-8 max-w-md text-center">
            <Smartphone className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No Preview Session</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Start a preview session to see your app running in a container
            </p>
            <Button onClick={() => handleStartSession()} disabled={previewSession.isLoading}>
              {previewSession.isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Power className="h-4 w-4 mr-2" />
              )}
              Start Preview
            </Button>
          </Card>
        ) : previewSession.status === 'starting' ? (
          <Card className="p-8 max-w-md text-center">
            <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-blue-500" />
            <h3 className="text-lg font-semibold mb-2">Starting Preview Container</h3>
            <p className="text-sm text-muted-foreground">
              This may take up to 2 minutes for the first launch...
            </p>
          </Card>
        ) : previewSession.status === 'error' ? (
          <Card className="p-8 max-w-md text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-lg font-semibold text-red-600 mb-2">Preview Error</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {iframeError || previewSession.errorMessage || 'Failed to start preview container'}
            </p>
            <Button onClick={() => handleStartSession()} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </Card>
        ) : previewSession.status === 'running' && previewSession.containerUrl ? (
          <div className="flex flex-col items-center">
            {/* Device Frame */}
            <div
              className={cn(
                'bg-white dark:bg-gray-900 rounded-lg shadow-2xl overflow-hidden relative',
                'border-8 border-gray-300 dark:border-gray-700',
                selectedDevice === 'mobile' && 'border-4',
                selectedDevice === 'tablet' && 'border-6',
                selectedDevice === 'desktop' && 'border-2'
              )}
              style={{
                width: dimensions.width,
                height: dimensions.height,
              }}
            >
              {/* Loading Overlay */}
              {iframeLoading && (
                <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center z-10">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
              )}

              {/* Iframe */}
              <iframe
                ref={iframeRef}
                src={previewSession.containerUrl}
                className="w-full h-full border-0"
                title={`${currentDevice.name} Preview`}
                onLoad={handleIframeLoad}
                onError={handleIframeError}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"
                allow="accelerometer; autoplay; camera; encrypted-media; geolocation; gyroscope; microphone; midi; payment; usb; web-share; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                credentialless
                loading="eager"
              />
            </div>

            {/* Device Info */}
            <div className="mt-4 text-center">
              <p className="text-sm text-muted-foreground">
                {currentDevice.name} • {dimensions.width}×{dimensions.height}
                {isLandscape && selectedDevice !== 'desktop' && ' (Landscape)'}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {/* Footer Info */}
      {previewSession.session && previewSession.status === 'running' && (
        <div className="p-3 border-t bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Session: {previewSession.session.sessionId.substring(0, 8)}...</span>
            <span>{previewSession.containerUrl}</span>
          </div>
        </div>
      )}
    </div>
  );
}