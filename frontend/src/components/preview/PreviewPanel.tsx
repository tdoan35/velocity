
import { useAppetizePreview } from '@/hooks/useAppetizePreview'
import { HotReloadIndicator } from './HotReloadIndicator'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, RotateCw, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PreviewPanel() {
  const {
    devices,
    selectedDevice,
    session,
    isLoading,
    metrics,
    hotReload,
    startPreviewSession,
    endPreviewSession,
    switchDevice,
    rotateDevice,
  } = useAppetizePreview({
    autoStart: true,
    defaultDevice: 'iphone15pro'
  })

  const currentDevice = devices.find(d => d.id === selectedDevice)

  return (
    <div className="flex flex-col h-full">
      {/* Header Controls */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          {/* Device Selector */}
          <Select value={selectedDevice} onValueChange={switchDevice}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select device" />
            </SelectTrigger>
            <SelectContent>
              {devices.map(device => (
                <SelectItem key={device.id} value={device.id}>
                  {device.name} ({device.osVersion})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Rotate Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={rotateDevice}
            disabled={!session || session.status !== 'ready'}
          >
            <RotateCw className="h-4 w-4" />
          </Button>

          {/* Hot Reload Indicator */}
          {session && session.status === 'ready' && (
            <HotReloadIndicator
              isConnected={hotReload.isConnected}
              isReloading={hotReload.isReloading}
              isEnabled={true}
              connectedDevices={hotReload.connectedDevices}
              reloadCount={metrics.hotReloads}
              lastReloadTime={metrics.lastReloadTime}
              onManualReload={hotReload.onManualReload}
              onToggleConnection={() => {
                if (session) {
                  endPreviewSession()
                } else {
                  startPreviewSession()
                }
              }}
            />
          )}
        </div>

        {/* Session Controls */}
        <div className="flex items-center gap-2">
          {session ? (
            <Button
              variant="outline"
              size="sm"
              onClick={endPreviewSession}
            >
              <X className="h-4 w-4 mr-1" />
              End Session
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={startPreviewSession}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              Start Preview
            </Button>
          )}
        </div>
      </div>

      {/* Preview Area */}
      <div className="flex-1 relative">
        {session ? (
          <div className="h-full flex items-center justify-center bg-slate-100 dark:bg-slate-900">
            {session.status === 'loading' ? (
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  Starting preview session...
                </p>
              </div>
            ) : session.status === 'error' ? (
              <Card className="p-6 max-w-md">
                <h3 className="font-semibold text-red-600 mb-2">Preview Error</h3>
                <p className="text-sm text-muted-foreground">{session.error}</p>
                <Button
                  className="mt-4"
                  onClick={startPreviewSession}
                >
                  Retry
                </Button>
              </Card>
            ) : session.status === 'ready' ? (
              <div 
                className={cn(
                  "bg-white dark:bg-gray-900 rounded-lg shadow-xl overflow-hidden transition-all",
                  currentDevice?.orientation === 'landscape' ? 'rotate-90' : ''
                )}
                style={{
                  width: currentDevice?.width,
                  height: currentDevice?.height,
                }}
              >
                {/* Demo Mode - Show placeholder */}
                {session.url === '#demo-preview' ? (
                  <div className="h-full flex items-center justify-center p-8">
                    <div className="text-center">
                      <p className="text-lg font-semibold mb-2">Demo Preview Mode</p>
                      <p className="text-sm text-muted-foreground">
                        Configure Appetize.io API keys to see live preview
                      </p>
                    </div>
                  </div>
                ) : (
                  <iframe
                    src={session.url}
                    className="w-full h-full border-0"
                    title="App Preview"
                  />
                )}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <Card className="p-8 max-w-md text-center">
              <h3 className="text-lg font-semibold mb-2">No Preview Session</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start a preview session to see your app running on a virtual device
              </p>
              <Button onClick={startPreviewSession} disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                Start Preview
              </Button>
            </Card>
          </div>
        )}
      </div>

      {/* Footer Stats */}
      {session && session.status === 'ready' && (
        <div className="p-2 border-t bg-muted/30 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Session: {session.sessionId}</span>
            <span>{currentDevice?.name} • {currentDevice?.osVersion}</span>
          </div>
        </div>
      )}
    </div>
  )
}