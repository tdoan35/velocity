import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Smartphone, 
  Tablet, 
  Monitor, 
  RotateCw, 
  AlertCircle,
  Loader2,
  Maximize2,
  Minimize2,
  Download,
  Share2,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface SnackWebPlayerProps {
  snack: any; // Snack SDK instance
  webPreviewRef: React.RefObject<Window | null>;
  webPreviewUrl: string | null;
  sessionId: string;
  className?: string;
  onError?: (error: Error) => void;
  onLoad?: () => void;
  onDeviceChange?: (device: DevicePreset) => void;
}

export interface DevicePreset {
  name: string;
  width: number;
  height: number;
  icon: React.ReactNode;
  userAgent?: string;
}

const DEVICE_PRESETS: DevicePreset[] = [
  {
    name: 'iPhone 16 Pro',
    width: 402,
    height: 874,
    icon: <Smartphone className="w-4 h-4" />,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
  },
  {
    name: 'iPhone 14',
    width: 390,
    height: 844,
    icon: <Smartphone className="w-4 h-4" />,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
  },
  {
    name: 'iPhone SE',
    width: 375,
    height: 667,
    icon: <Smartphone className="w-4 h-4" />,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
  },
  {
    name: 'iPad',
    width: 820,
    height: 1180,
    icon: <Tablet className="w-4 h-4" />,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
  },
  {
    name: 'Web',
    width: 1024,
    height: 768,
    icon: <Monitor className="w-4 h-4" />,
    userAgent: navigator.userAgent
  }
];

export function SnackWebPlayer({
  snack,
  webPreviewRef,
  webPreviewUrl,
  sessionId,
  className,
  onError,
  onLoad,
  onDeviceChange
}: SnackWebPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DevicePreset>(DEVICE_PRESETS[0]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRotated, setIsRotated] = useState(false);
  const [isPreviewHovered, setIsPreviewHovered] = useState(false);
  const [isDeviceDropdownOpen, setIsDeviceDropdownOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isResponsiveZoom, setIsResponsiveZoom] = useState(false);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Zoom levels: 25%, 50%, 75%, 100%, 125%, 150%, 200%
  const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
  const DEFAULT_ZOOM_INDEX = 3; // 100%

  // Handle device selection
  const handleDeviceChange = (device: DevicePreset) => {
    setSelectedDevice(device);
    setIsRotated(false);
    setZoomLevel(1); // Reset zoom when changing devices
    // Keep responsive zoom mode active if it was enabled
    onDeviceChange?.(device);
  };

  // Handle rotation
  const handleRotate = () => {
    setIsRotated(!isRotated);
  };

  // Handle fullscreen
  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Handle zoom
  const handleZoomIn = () => {
    const currentIndex = ZOOM_LEVELS.findIndex(level => level === zoomLevel);
    if (currentIndex < ZOOM_LEVELS.length - 1) {
      setZoomLevel(ZOOM_LEVELS[currentIndex + 1]);
    }
  };

  const handleZoomOut = () => {
    const currentIndex = ZOOM_LEVELS.findIndex(level => level === zoomLevel);
    if (currentIndex > 0) {
      setZoomLevel(ZOOM_LEVELS[currentIndex - 1]);
    }
  };

  const handleZoomReset = () => {
    setZoomLevel(1);
  };

  // Toggle responsive zoom mode
  const handleToggleResponsiveZoom = () => {
    setIsResponsiveZoom(!isResponsiveZoom);
    if (!isResponsiveZoom) {
      // When enabling responsive zoom, reset manual zoom
      setZoomLevel(1);
    }
  };

  // Calculate responsive zoom level
  const calculateResponsiveZoom = () => {
    if (!isResponsiveZoom || containerSize.width === 0 || containerSize.height === 0) {
      return zoomLevel;
    }

    const deviceWidth = isRotated ? selectedDevice.height : selectedDevice.width;
    const deviceHeight = isRotated ? selectedDevice.width : selectedDevice.height;
    
    // Add some padding to ensure the device doesn't touch the edges
    const PADDING = 80; // 40px on each side for controls and spacing
    const availableWidth = containerSize.width - PADDING;
    const availableHeight = containerSize.height - PADDING;
    
    // Calculate scale factors for both dimensions
    const scaleX = availableWidth / deviceWidth;
    const scaleY = availableHeight / deviceHeight;
    
    // Use the smaller scale factor to ensure the device fits completely
    const responsiveScale = Math.min(scaleX, scaleY, 2); // Cap at 200% for sanity
    
    // Don't go below 0.25 (25%)
    return Math.max(0.25, responsiveScale);
  };

  // Get current effective zoom level
  const getEffectiveZoomLevel = () => {
    return isResponsiveZoom ? calculateResponsiveZoom() : zoomLevel;
  };

  // Get zoom percentage for display
  const getZoomPercentage = () => {
    const effectiveZoom = getEffectiveZoomLevel();
    return Math.round(effectiveZoom * 100);
  };

  // Handle iframe load
  const handleIframeLoad = () => {
    setIsLoading(false);
    setError(null);
    onLoad?.();

    console.log('[SnackWebPlayer] Iframe loaded, webPreviewRef current value:', webPreviewRef?.current);
    
    // Ensure webPreviewRef is set correctly (should already be set via ref callback)
    if (iframeRef.current?.contentWindow && webPreviewRef && !webPreviewRef.current) {
      webPreviewRef.current = iframeRef.current.contentWindow;
      console.log('[SnackWebPlayer] Set webPreviewRef in load handler:', webPreviewRef.current);
    }

    // Wait a bit for iframe to be fully ready, then notify the Snack service
    setTimeout(() => {
      if (snack && webPreviewRef?.current && typeof (snack as any).setWebPreviewRef === 'function') {
        console.log('[SnackWebPlayer] Notifying Snack SDK of webPreviewRef after iframe load');
        (snack as any).setWebPreviewRef(webPreviewRef.current);
        
        // Also try to trigger a refresh of the preview
        if (typeof (snack as any).requestWebPreview === 'function') {
          console.log('[SnackWebPlayer] Requesting web preview after webPreviewRef update');
          (snack as any).requestWebPreview().catch((error: Error) => {
            console.error('[SnackWebPlayer] Failed to request web preview:', error);
          });
        }
      }
    }, 300);
  };

  // Handle iframe error
  const handleIframeError = () => {
    const err = new Error('Failed to load preview');
    setError(err);
    setIsLoading(false);
    onError?.(err);
  };

  // Handle messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }

      switch (event.data.type) {
        case 'SNACK_RUNTIME_ERROR':
          console.error('[SnackWebPlayer] Runtime error:', event.data.error);
          break;
        case 'SNACK_RUNTIME_LOG':
          console.log('[SnackWebPlayer] Log:', event.data.log);
          break;
        case 'SNACK_RUNTIME_READY':
          console.log('[SnackWebPlayer] Runtime ready');
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Handle click outside dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isDeviceDropdownOpen && containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDeviceDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDeviceDropdownOpen]);

  // Handle keyboard shortcuts for zoom
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when the container is focused or hovered
      if (!isPreviewHovered && !isFullscreen) return;
      
      // Ctrl/Cmd + Plus/Equals for zoom in
      if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) {
        event.preventDefault();
        if (!isResponsiveZoom) handleZoomIn();
      }
      // Ctrl/Cmd + Minus for zoom out
      else if ((event.ctrlKey || event.metaKey) && event.key === '-') {
        event.preventDefault();
        if (!isResponsiveZoom) handleZoomOut();
      }
      // Ctrl/Cmd + 0 for reset zoom
      else if ((event.ctrlKey || event.metaKey) && event.key === '0') {
        event.preventDefault();
        if (!isResponsiveZoom) handleZoomReset();
      }
      // Ctrl/Cmd + R for toggle responsive zoom
      else if ((event.ctrlKey || event.metaKey) && event.key === 'r') {
        event.preventDefault();
        handleToggleResponsiveZoom();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isPreviewHovered, isFullscreen, zoomLevel, isResponsiveZoom]);

  // Track container size for responsive zoom
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // No longer needed - webPreviewUrl is passed as prop

  // Set webPreviewRef on Snack instance when available
  useEffect(() => {
    if (!snack || !webPreviewRef?.current) return;

    console.log('[SnackWebPlayer] Updating Snack with webPreviewRef:', webPreviewRef.current);
    
    // According to Snack SDK docs, the webPreviewRef should be set during construction
    // But we can also try to update it if the method exists
    try {
      if (typeof (snack as any).setWebPreviewRef === 'function') {
        (snack as any).setWebPreviewRef(webPreviewRef.current);
        console.log('[SnackWebPlayer] Successfully set webPreviewRef on Snack instance');
      }
    } catch (error) {
      console.error('[SnackWebPlayer] Failed to set webPreviewRef on Snack:', error);
    }
  }, [snack, webPreviewRef?.current]);

  if (!webPreviewUrl) {
    return (
      <Card className={cn("flex items-center justify-center p-8", className)}>
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            {snack ? 'Initializing preview...' : 'No Snack session available. Please create a session first.'}
          </p>
          {snack && (
            <div className="mt-4">
              <div className="w-6 h-6 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          )}
        </div>
      </Card>
    );
  }

  const deviceWidth = isRotated ? selectedDevice.height : selectedDevice.width;
  const deviceHeight = isRotated ? selectedDevice.width : selectedDevice.height;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Preview container */}
      <div 
        ref={containerRef}
        className={cn(
          "flex-1 flex items-center justify-center bg-muted/20 overflow-auto relative",
          isFullscreen && "fixed inset-0 z-50 bg-background"
        )}
        onMouseEnter={() => setIsPreviewHovered(true)}
        onMouseLeave={() => setIsPreviewHovered(false)}
      >
        {/* Device selector dropdown - positioned in top-left corner */}
        <div className={cn(
          "absolute top-6 left-6 z-10 transition-opacity duration-200",
          isPreviewHovered || isFullscreen ? "opacity-100" : "opacity-0"
        )}>
          {/* Device dropdown */}
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsDeviceDropdownOpen(!isDeviceDropdownOpen)}
              className="gap-2"
            >
              {selectedDevice.icon}
              <span className="text-xs">{selectedDevice.name}</span>
              <ChevronDown className={cn("w-3 h-3 transition-transform", isDeviceDropdownOpen && "rotate-180")} />
            </Button>

            {/* Dropdown menu */}
            {isDeviceDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 bg-background border rounded-md shadow-lg min-w-[240px] z-20">
                {DEVICE_PRESETS.map((device) => (
                  <button
                    key={device.name}
                    onClick={() => {
                      handleDeviceChange(device);
                      setIsDeviceDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
                      selectedDevice.name === device.name && "bg-accent text-accent-foreground"
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

        {/* Right-side controls - positioned in top-right corner */}
        <div className={cn(
          "absolute top-6 right-6 z-10 transition-opacity duration-200 flex items-center gap-2",
          isPreviewHovered || isFullscreen ? "opacity-100" : "opacity-0"
        )}>
          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-background/90 backdrop-blur-sm rounded-md p-1 border">
            {/* Responsive zoom toggle */}
            <Button
              variant={isResponsiveZoom ? "default" : "ghost"}
              size="sm"
              onClick={handleToggleResponsiveZoom}
              title="Toggle responsive zoom (Ctrl+R)"
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
          {selectedDevice.name !== 'Web' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleRotate}
              title="Rotate device"
            >
              <RotateCw className={cn("w-4 h-4 transition-transform", isRotated && "rotate-90")} />
            </Button>
          )}

          {/* Fullscreen button */}
          <Button
            variant="secondary"
            size="sm"
            onClick={handleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>
        </div>

        <div 
          className={cn(
            "relative bg-black shadow-xl overflow-hidden",
            "transition-all duration-300 ease-in-out",
            selectedDevice.name !== 'Web' && "rounded-[3rem] p-3",
            selectedDevice.name === 'Web' && "bg-white"
          )}
          style={{
            width: `${deviceWidth}px`,
            height: `${deviceHeight}px`,
            transform: `scale(${getEffectiveZoomLevel()})`,
            transformOrigin: 'center center',
          }}
        >
          {/* Device frame */}
          {selectedDevice.name !== 'Web' && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 rounded-[2.5rem] ring-8 ring-black/10" />
              {/* Notch/Dynamic Island for iPhone */}
              {selectedDevice.name.includes('iPhone') && !selectedDevice.name.includes('SE') && (
                <>
                  {selectedDevice.name.includes('16 Pro') ? (
                    /* Dynamic Island for iPhone 16 Pro */
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-full" />
                  ) : (
                    /* Traditional notch for other iPhones */
                    <div className="absolute top-3 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-2xl" />
                  )}
                </>
              )}
            </div>
          )}

          {/* Iframe */}
          <iframe
            ref={(element) => {
              iframeRef.current = element;
              // According to Snack SDK docs, webPreviewRef should be set to the iframe's contentWindow
              if (element?.contentWindow && webPreviewRef) {
                webPreviewRef.current = element.contentWindow;
                console.log('[SnackWebPlayer] Set webPreviewRef via ref callback:', webPreviewRef.current);
              }
            }}
            src={webPreviewUrl}
            className={cn(
              "w-full h-full border-0",
              selectedDevice.name !== 'Web' && "rounded-[2rem]"
            )}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; magnetometer; microphone; midi; payment; usb"
            sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
          />

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading preview...</p>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center p-4">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm font-medium">Failed to load preview</p>
                <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => iframeRef.current?.contentWindow?.location.reload()}
                  className="mt-4"
                >
                  <RotateCw className="w-3 h-3 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}