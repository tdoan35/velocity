import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { usePreviewSession } from '../../hooks/usePreviewSession';
import type { PreviewStatus, PreviewSession } from '../../hooks/usePreviewSession';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { 
  Smartphone, 
  AlertCircle,
  Loader2,
  RefreshCw,
  Power,
  Tablet,
  Monitor,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ContainerPreviewPanelRef {
  startSession: () => Promise<void>;
  stopSession: () => Promise<void>;
  refresh: () => void;
  openInNewWindow: () => void;
}

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

interface ContainerPreviewPanelProps {
  projectId: string;
  className?: string;
  previewSession?: PreviewSessionProp; // External session (optional for backwards compatibility)
  onStatusChange?: (status: PreviewStatus) => void;
  onSessionChange?: (hasSession: boolean) => void;
  selectedDevice?: 'mobile' | 'tablet' | 'desktop';
  onDeviceChange?: (device: 'mobile' | 'tablet' | 'desktop') => void;
}

interface DeviceConfig {
  id: string;
  name: string;
  width: number;
  height: number;
  icon: React.ReactNode;
  type: 'mobile' | 'tablet' | 'desktop';
}

const DEVICE_CONFIGS: DeviceConfig[] = [
  // Mobile devices
  {
    id: 'iphone-16-pro',
    name: 'iPhone 16 Pro',
    width: 402,
    height: 874,
    icon: <Smartphone className="w-4 h-4" />,
    type: 'mobile'
  },
  {
    id: 'iphone-14',
    name: 'iPhone 14',
    width: 390,
    height: 844,
    icon: <Smartphone className="w-4 h-4" />,
    type: 'mobile'
  },
  {
    id: 'iphone-se',
    name: 'iPhone SE',
    width: 375,
    height: 667,
    icon: <Smartphone className="w-4 h-4" />,
    type: 'mobile'
  },
  // Tablet devices
  {
    id: 'ipad-pro',
    name: 'iPad Pro 12.9"',
    width: 1024,
    height: 1366,
    icon: <Tablet className="w-4 h-4" />,
    type: 'tablet'
  },
  {
    id: 'ipad',
    name: 'iPad 10.9"',
    width: 820,
    height: 1180,
    icon: <Tablet className="w-4 h-4" />,
    type: 'tablet'
  },
  {
    id: 'galaxy-tab',
    name: 'Galaxy Tab S9',
    width: 800,
    height: 1280,
    icon: <Tablet className="w-4 h-4" />,
    type: 'tablet'
  },
  // Desktop devices
  {
    id: 'desktop',
    name: 'Desktop',
    width: 1024,
    height: 768,
    icon: <Monitor className="w-4 h-4" />,
    type: 'desktop'
  }
];

export const ContainerPreviewPanel = forwardRef<ContainerPreviewPanelRef, ContainerPreviewPanelProps>(({ 
  projectId, 
  className,
  previewSession: externalPreviewSession,
  onStatusChange,
  onSessionChange,
  selectedDevice: externalSelectedDevice,
  onDeviceChange
}, ref) => {
  // Initialize with a default device
  const [internalSelectedDevice, setInternalSelectedDevice] = useState<string>('iphone-16-pro');
  
  // Determine which device to use
  // If external device is provided and it's a generic type, use internal selection
  // This preserves specific device selections when parent only knows generic types
  let selectedDevice = internalSelectedDevice;
  
  // Only override with external if it's a specific device ID
  if (externalSelectedDevice && DEVICE_CONFIGS.some(d => d.id === externalSelectedDevice)) {
    selectedDevice = externalSelectedDevice;
  } else if (externalSelectedDevice === 'mobile' || externalSelectedDevice === 'tablet' || externalSelectedDevice === 'desktop') {
    // Keep internal selection when parent provides generic type
    // But ensure we're using an appropriate device for that type
    const currentDevice = DEVICE_CONFIGS.find(d => d.id === internalSelectedDevice);
    if (currentDevice) {
      // Check if current selection matches the requested type
      const typeMatches = 
        (externalSelectedDevice === 'mobile' && currentDevice.type === 'mobile') ||
        (externalSelectedDevice === 'tablet' && currentDevice.type === 'tablet') ||
        (externalSelectedDevice === 'desktop' && currentDevice.type === 'desktop');
      
      if (!typeMatches) {
        // Switch to default for that type
        if (externalSelectedDevice === 'mobile') selectedDevice = 'iphone-16-pro';
        else if (externalSelectedDevice === 'tablet') selectedDevice = 'ipad-pro';
        else if (externalSelectedDevice === 'desktop') selectedDevice = 'desktop';
      }
    }
  }
  const [isRotated, setIsRotated] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [isPreviewHovered, setIsPreviewHovered] = useState(false);
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isResponsiveZoom, setIsResponsiveZoom] = useState(true);
  const [manualZoomLevel, setManualZoomLevel] = useState(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [baseScale, setBaseScale] = useState(1); // Scale that makes device fit in container
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const previewAreaRef = useRef<HTMLDivElement>(null);
  const loadingTimeoutRef = useRef<number | null>(null);
  
  const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

  // Use external session if provided, otherwise create internal session
  const internalPreviewSession = usePreviewSession({
    projectId,
    onError: (error) => {
      console.error('[ContainerPreviewPanel] Session error:', error);
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
  
  // Use external session if provided, otherwise use internal
  const previewSession = externalPreviewSession || internalPreviewSession;

  const currentDevice = DEVICE_CONFIGS.find(d => d.id === selectedDevice) || DEVICE_CONFIGS[0];



  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (loadingTimeoutRef.current) {
        clearTimeout(loadingTimeoutRef.current);
      }
    };
  }, []);
  
  // Sync internal device with external changes only when switching between major types
  useEffect(() => {
    if (externalSelectedDevice) {
      // Only update internal if external is a specific device ID
      if (DEVICE_CONFIGS.some(d => d.id === externalSelectedDevice)) {
        setInternalSelectedDevice(externalSelectedDevice);
      }
      // If switching to a different device type via PreviewHeader
      else if (externalSelectedDevice === 'mobile' || externalSelectedDevice === 'tablet' || externalSelectedDevice === 'desktop') {
        const currentDevice = DEVICE_CONFIGS.find(d => d.id === internalSelectedDevice);
        if (currentDevice) {
          const typeMatches = 
            (externalSelectedDevice === 'mobile' && currentDevice.type === 'mobile') ||
            (externalSelectedDevice === 'tablet' && currentDevice.type === 'tablet') ||
            (externalSelectedDevice === 'desktop' && currentDevice.type === 'desktop');
          
          if (!typeMatches) {
            // Only change when type doesn't match
            if (externalSelectedDevice === 'mobile') setInternalSelectedDevice('iphone-16-pro');
            else if (externalSelectedDevice === 'tablet') setInternalSelectedDevice('ipad-pro');
            else if (externalSelectedDevice === 'desktop') setInternalSelectedDevice('desktop');
          }
        }
      }
    }
  }, [externalSelectedDevice, internalSelectedDevice]);

  // Handle device selection
  const handleDeviceChange = (device: DeviceConfig) => {
    setInternalSelectedDevice(device.id);
    setIsRotated(false);
    setZoomLevel(1);
    setManualZoomLevel(1); // Reset both zoom states when changing devices
    // Call the parent's onDeviceChange if provided
    onDeviceChange?.(device.type);
  };

  // Handle rotation
  const handleRotate = () => {
    setIsRotated(!isRotated);
  };

  // Zoom controls
  const handleZoomIn = () => {
    const currentIndex = ZOOM_LEVELS.findIndex(level => level === zoomLevel);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      const newZoomLevel = ZOOM_LEVELS[currentIndex + 1];
      setZoomLevel(newZoomLevel);
      if (!isResponsiveZoom) {
        setManualZoomLevel(newZoomLevel);
      }
    }
  };

  const handleZoomOut = () => {
    const currentIndex = ZOOM_LEVELS.findIndex(level => level === zoomLevel);
    if (currentIndex > 0) {
      const newZoomLevel = ZOOM_LEVELS[currentIndex - 1];
      setZoomLevel(newZoomLevel);
      if (!isResponsiveZoom) {
        setManualZoomLevel(newZoomLevel);
      }
    }
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
    if (!isResponsiveZoom) {
      setManualZoomLevel(1);
    }
  };

  const handleToggleResponsiveZoom = () => {
    if (isResponsiveZoom) {
      // Switching FROM responsive TO manual: restore saved manual zoom
      setIsResponsiveZoom(false);
      setZoomLevel(manualZoomLevel);
    } else {
      // Switching FROM manual TO responsive: save current manual zoom
      setManualZoomLevel(zoomLevel);
      setIsResponsiveZoom(true);
    }
  };

  // Calculate the base scale that makes the device fit in container
  const calculateBaseScale = () => {
    if (containerSize.width === 0 || containerSize.height === 0) {
      return 1;
    }

    const deviceWidth = isRotated ? currentDevice.height : currentDevice.width;
    const deviceHeight = isRotated ? currentDevice.width : currentDevice.height;
    
    // Account for padding and controls
    const HORIZONTAL_PADDING = 120; // Left/right padding + controls
    const VERTICAL_PADDING = 120; // Top/bottom padding + controls
    
    const availableWidth = Math.max(containerSize.width - HORIZONTAL_PADDING, 100);
    const availableHeight = Math.max(containerSize.height - VERTICAL_PADDING, 100);
    
    const scaleX = availableWidth / deviceWidth;
    const scaleY = availableHeight / deviceHeight;
    
    // Use the smaller scale to ensure it fits in both dimensions
    return Math.min(scaleX, scaleY);
  };

  // Calculate responsive zoom
  const calculateResponsiveZoom = () => {
    if (!isResponsiveZoom || containerSize.width === 0 || containerSize.height === 0) {
      return zoomLevel * baseScale;
    }

    // In responsive mode, always fit to container
    return calculateBaseScale();
  };

  const getEffectiveZoomLevel = () => {
    if (isResponsiveZoom) {
      return calculateResponsiveZoom();
    } else {
      // Manual zoom is now relative to the base scale
      // 100% (zoomLevel = 1) means "fit to container"
      return zoomLevel * calculateBaseScale();
    }
  };

  const getZoomPercentage = () => {
    // Show percentage relative to "fit" size, not actual size
    // 100% means "fits in container", not "actual device size"
    return Math.round(zoomLevel * 100);
  };

  // Track container size for responsive zoom
  useEffect(() => {
    // Use previewAreaRef to get the actual preview area size
    if (!previewAreaRef.current) return;

    const updateContainerSize = () => {
      if (!previewAreaRef.current) return;
      
      const rect = previewAreaRef.current.getBoundingClientRect();
      setContainerSize({ width: rect.width, height: rect.height });
    };

    const resizeObserver = new ResizeObserver(updateContainerSize);
    resizeObserver.observe(previewAreaRef.current);
    
    updateContainerSize();
    
    return () => {
      resizeObserver.disconnect();
    };
  }, []);
  
  // Update base scale when container size or device changes
  useEffect(() => {
    setBaseScale(calculateBaseScale());
  }, [containerSize.width, containerSize.height, currentDevice.id, isRotated]);

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDeviceDropdownOpen && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDeviceDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDeviceDropdownOpen]);


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
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const handleOpenInNewWindow = () => {
    if (previewSession.containerUrl) {
      window.open(previewSession.containerUrl, '_blank');
    }
  };

  // Expose methods to parent through ref
  useImperativeHandle(ref, () => ({
    startSession: () => handleStartSession(),
    stopSession: () => handleStopSession(),
    refresh: () => handleRefresh(),
    openInNewWindow: () => handleOpenInNewWindow()
  }), [selectedDevice, previewSession.containerUrl]);

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


  return (
    <div className={cn('flex flex-col h-full bg-transparent overflow-hidden', className)}>
      {/* Preview Area */}
      <div 
        ref={previewAreaRef} 
        className={cn(
          "flex-1 flex items-center justify-center bg-transparent relative",
          // Use overflow auto for manual zoom to allow scrolling if content exceeds container
          isResponsiveZoom ? "overflow-hidden" : "overflow-auto"
        )}>
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
          <div 
            ref={containerRef}
            className={cn(
              "w-full h-full relative bg-transparent",
              // Desktop: no special styling, just fill container
              currentDevice.type === 'desktop' ? "" :
              // Mobile/Tablet: use zoom-aware layout
              isResponsiveZoom 
                ? "flex items-center justify-center overflow-hidden" 
                : "overflow-auto"
            )}
            onMouseEnter={() => currentDevice.type !== 'desktop' && setIsPreviewHovered(true)}
            onMouseLeave={() => currentDevice.type !== 'desktop' && setIsPreviewHovered(false)}
          >
            {/* Device selector dropdown - positioned in top-left corner (hidden for desktop) */}
            {currentDevice.type !== 'desktop' && (
              <div className={cn(
                "absolute top-6 left-6 z-20 transition-opacity duration-200",
                isPreviewHovered ? "opacity-100" : "opacity-0 pointer-events-none"
              )}>
              <div className="relative">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsDeviceDropdownOpen(!isDeviceDropdownOpen)}
                  className="gap-2"
                >
                  {currentDevice.icon}
                  <span className="text-xs">{currentDevice.name}</span>
                  <ChevronDown className={cn("w-3 h-3 transition-transform", isDeviceDropdownOpen && "rotate-180")} />
                </Button>

                {/* Dropdown menu */}
                {isDeviceDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-lg min-w-[240px] z-30">
                    {DEVICE_CONFIGS
                      .filter((device) => {
                        // Filter devices based on the current device type
                        // If external device is generic type, use current device's type
                        // If external device is specific, show devices of that type
                        const currentDeviceType = currentDevice.type;
                        return device.type === currentDeviceType;
                      })
                      .map((device) => (
                      <button
                        key={device.id}
                        onClick={() => {
                          handleDeviceChange(device);
                          setIsDeviceDropdownOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                          selectedDevice === device.id && "bg-accent text-accent-foreground"
                        )}
                      >
                        {device.icon}
                        <span>{device.name}</span>
                        <span className="ml-auto text-xs text-muted-foreground">
                          {device.width} × {device.height}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              </div>
            )}

            {/* Right-side controls - positioned in top-right corner (hidden for desktop) */}
            {currentDevice.type !== 'desktop' && (
              <div className={cn(
                "absolute top-6 right-6 z-20 transition-opacity duration-200 flex items-center gap-2",
                isPreviewHovered ? "opacity-100" : "opacity-0 pointer-events-none"
              )}>
              {/* Zoom controls */}
              <div className="flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-md p-1 border">
                {/* Responsive zoom toggle */}
                <Button
                  variant={isResponsiveZoom ? "default" : "ghost"}
                  size="sm"
                  onClick={handleToggleResponsiveZoom}
                  title="Toggle responsive zoom"
                  className="h-7 w-7 p-0"
                >
                  <Maximize className="w-3 h-3" />
                </Button>
                
                {/* Manual zoom controls */}
                <div className={cn("flex items-center gap-1", isResponsiveZoom && "opacity-50")}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleZoomOut}
                    disabled={isResponsiveZoom || zoomLevel <= ZOOM_LEVELS[0]}
                    title="Zoom out"
                    className="h-7 w-7 p-0"
                  >
                    <ZoomOut className="w-3 h-3" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleZoomReset}
                    disabled={isResponsiveZoom}
                    title={isResponsiveZoom ? "Responsive zoom active" : "Reset zoom to 100%"}
                    className={cn("h-7 px-2 text-xs font-mono", isResponsiveZoom && "text-primary")}
                  >
                    {isResponsiveZoom ? 'AUTO' : `${getZoomPercentage()}%`}
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleZoomIn}
                    disabled={isResponsiveZoom || zoomLevel >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}
                    title="Zoom in"
                    className="h-7 w-7 p-0"
                  >
                    <ZoomIn className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              {/* Rotate button */}
              {(currentDevice.type === 'mobile' || currentDevice.type === 'tablet') && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleRotate}
                  title="Rotate device"
                  className="h-8 w-8 p-0"
                >
                  <RotateCw className={cn("w-4 h-4 transition-transform", isRotated && "rotate-90")} />
                </Button>
              )}
              </div>
            )}

            {/* Single Device Frame with Dynamic Wrapper */}
            {(() => {
              const deviceWidth = isRotated ? currentDevice.height : currentDevice.width;
              const deviceHeight = isRotated ? currentDevice.width : currentDevice.height;
              const scale = getEffectiveZoomLevel();
              const scaledWidth = deviceWidth * scale;
              const scaledHeight = deviceHeight * scale;
              
              return (
                <div 
                  className={cn(
                    "relative",
                    // Desktop: fill container completely
                    currentDevice.type === 'desktop' ? "w-full h-full" :
                    // Mobile/Tablet: use zoom-aware wrapper
                    !isResponsiveZoom ? "flex items-center justify-center" : ""
                  )}
                  style={currentDevice.type !== 'desktop' && !isResponsiveZoom ? {
                    // Manual zoom: Create actual space for the scaled device plus padding
                    width: `${scaledWidth + 64}px`,
                    height: `${scaledHeight + 64}px`,
                    // Center the wrapper if it's smaller than container
                    margin: 'auto',
                    minWidth: '100%',
                    minHeight: '100%'
                  } : undefined}
                >
                  <div
                    className={cn(
                      'transition-all duration-500 ease-in-out flex-shrink-0 relative overflow-hidden',
                      // Desktop: no device frame styling
                      currentDevice.type === 'desktop' 
                        ? 'w-full h-full' 
                        // Mobile/Tablet: device frame styling
                        : 'bg-black shadow-2xl rounded-[3rem] p-3'
                    )}
                    style={currentDevice.type !== 'desktop' ? {
                      width: deviceWidth,
                      height: deviceHeight,
                      transform: `scale(${scale})`,
                      transformOrigin: 'center center',
                      transitionProperty: 'width, height, border-width, box-shadow, transform'
                    } : undefined}
                  >
                    {/* Device frame elements */}
                    {(currentDevice.type === 'mobile' || currentDevice.type === 'tablet') && (
                      <div className="absolute inset-0 pointer-events-none">
                        {/* Outer bezel ring */}
                        <div className="absolute inset-0 rounded-[2.5rem] ring-8 ring-black/10" />
                        
                        {/* Notch/Dynamic Island for iPhone models */}
                        {currentDevice.id.includes('iphone') && !currentDevice.id.includes('se') && (
                          <>
                            {currentDevice.id === 'iphone-16-pro' ? (
                              /* Dynamic Island for iPhone 16 Pro */
                              isRotated ? (
                                <div className="absolute right-6 top-1/2 -translate-y-1/2 w-6 h-32 bg-black rounded-full z-20" />
                              ) : (
                                <div className="absolute top-6 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-full z-20" />
                              )
                            ) : (
                              /* Traditional notch for iPhone 14 */
                              isRotated ? (
                                <div className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-40 bg-black rounded-l-2xl z-20" />
                              ) : (
                                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-2xl z-20" />
                              )
                            )}
                          </>
                        )}
                        
                        {/* Home indicator for modern iPhones */}
                        {currentDevice.type === 'mobile' && !currentDevice.id.includes('se') && (
                          isRotated ? (
                            <div className="absolute left-2 top-1/2 -translate-y-1/2 w-1 h-32 bg-white/20 rounded-full z-20" />
                          ) : (
                            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-32 h-1 bg-white/20 rounded-full z-20" />
                          )
                        )}
                      </div>
                    )}

                    {/* Inner content area with rounded corners for devices */}
                    <div className={cn(
                      "relative w-full h-full overflow-hidden",
                      (currentDevice.type === 'mobile' || currentDevice.type === 'tablet') && "rounded-[2rem]"
                    )}>
                      {/* Loading Overlay */}
                      {iframeLoading && (
                        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center z-10">
                          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                        </div>
                      )}

                      {/* Single Persistent Iframe */}
                      <iframe
                        ref={iframeRef}
                        src={previewSession.containerUrl}
                        className={cn(
                          "w-full h-full border-0",
                          currentDevice.type === 'desktop' ? "bg-white" : ""
                        )}
                        title={`${currentDevice.name} Preview`}
                        onLoad={handleIframeLoad}
                        onError={handleIframeError}
                        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock"
                        allow="accelerometer; autoplay; camera; encrypted-media; geolocation; gyroscope; microphone; midi; payment; usb; web-share; fullscreen"
                        referrerPolicy="strict-origin-when-cross-origin"
                        loading="eager"
                      />
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        ) : null}
      </div>
    </div>
  );
});

ContainerPreviewPanel.displayName = 'ContainerPreviewPanel';