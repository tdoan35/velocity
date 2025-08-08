
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  RefreshCw, 
  Wifi, 
  WifiOff, 
  Zap, 
  Users, 
  Activity,
  Loader2
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface HotReloadIndicatorProps {
  isConnected: boolean
  isReloading: boolean
  isEnabled: boolean
  connectedDevices: number
  reloadCount: number
  lastReloadTime: Date | null
  onManualReload: () => void
  onToggleConnection: () => void
}

export function HotReloadIndicator({
  isConnected,
  isReloading,
  isEnabled,
  connectedDevices,
  reloadCount,
  lastReloadTime,
  onManualReload,
  onToggleConnection
}: HotReloadIndicatorProps) {
  const formatLastReload = (date: Date | null) => {
    if (!date) return 'Never'
    
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const seconds = Math.floor(diff / 1000)
    
    if (seconds < 60) return `${seconds}s ago`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ago`
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-background/60 backdrop-blur-sm rounded-lg border">
      <TooltipProvider>
        {/* Connection Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleConnection}
              className={`p-1 h-8 w-8 ${isConnected ? 'text-green-500' : 'text-red-500'}`}
            >
              {isConnected ? (
                <Wifi className="h-4 w-4" />
              ) : (
                <WifiOff className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isConnected ? 'Connected' : 'Disconnected'}</p>
            <p className="text-xs text-muted-foreground">Click to {isConnected ? 'disconnect' : 'reconnect'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Hot Reload Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1">
              <Zap className={`h-4 w-4 ${isEnabled ? 'text-yellow-500' : 'text-gray-400'}`} />
              <Badge variant={isEnabled ? 'default' : 'secondary'} className="text-xs">
                {isEnabled ? 'ON' : 'OFF'}
              </Badge>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Hot Reload {isEnabled ? 'Enabled' : 'Disabled'}</p>
            <p className="text-xs text-muted-foreground">
              Automatically rebuilds on file changes
            </p>
          </TooltipContent>
        </Tooltip>

        {/* Manual Reload Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onManualReload}
              disabled={!isConnected || isReloading}
              className="p-1 h-8 w-8"
            >
              {isReloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Manual Reload</p>
            <p className="text-xs text-muted-foreground">Force rebuild preview</p>
          </TooltipContent>
        </Tooltip>

        {/* Connected Devices */}
        {connectedDevices > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-2">
                <Users className="h-4 w-4 text-blue-500" />
                <span className="text-xs font-medium">{connectedDevices}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{connectedDevices} Connected Device{connectedDevices > 1 ? 's' : ''}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Reload Stats */}
        {reloadCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-2 text-xs text-muted-foreground">
                <Activity className="h-3 w-3" />
                <span>{reloadCount} reloads</span>
                <span className="text-xs">({formatLastReload(lastReloadTime)})</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Reload Statistics</p>
              <p className="text-xs text-muted-foreground">
                Total: {reloadCount} reloads<br />
                Last: {formatLastReload(lastReloadTime)}
              </p>
            </TooltipContent>
          </Tooltip>
        )}
      </TooltipProvider>

      {/* Status Text */}
      {isReloading && (
        <span className="text-xs text-muted-foreground animate-pulse">
          Reloading...
        </span>
      )}
    </div>
  )
}