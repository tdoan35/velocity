
import { Viewer } from '@/services/previewSharingService'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Users, Eye } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ViewerIndicatorProps {
  viewers: Viewer[]
  maxDisplay?: number
  className?: string
}

export function ViewerIndicator({ 
  viewers, 
  maxDisplay = 5,
  className 
}: ViewerIndicatorProps) {
  const displayViewers = viewers.slice(0, maxDisplay)
  const remainingCount = Math.max(0, viewers.length - maxDisplay)

  const getInitials = (name: string | null, email: string | null) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return '?'
  }

  const getViewerColor = (index: number) => {
    const colors = [
      'bg-red-500',
      'bg-blue-500',
      'bg-green-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-teal-500'
    ]
    return colors[index % colors.length]
  }

  if (viewers.length === 0) {
    return null
  }

  return (
    <TooltipProvider>
      <div className={cn("flex items-center gap-2", className)}>
        <div className="flex items-center gap-1">
          <Eye className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{viewers.length}</span>
        </div>

        <div className="flex -space-x-2">
          {displayViewers.map((viewer, index) => (
            <Tooltip key={viewer.viewerId}>
              <TooltipTrigger asChild>
                <Avatar className="h-8 w-8 border-2 border-background cursor-pointer hover:z-10 transition-transform hover:scale-110">
                  <AvatarFallback className={cn(getViewerColor(index), "text-white text-xs")}>
                    {getInitials(viewer.viewerName, viewer.viewerEmail)}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <div className="space-y-1">
                  <p className="font-medium">
                    {viewer.viewerName || viewer.viewerEmail || 'Anonymous'}
                  </p>
                  {viewer.isAuthenticated && (
                    <Badge variant="outline" className="text-xs">
                      Authenticated
                    </Badge>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(viewer.joinedAt).toLocaleTimeString()}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          ))}

          {remainingCount > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Avatar className="h-8 w-8 border-2 border-background cursor-pointer bg-muted">
                  <AvatarFallback className="text-xs">
                    +{remainingCount}
                  </AvatarFallback>
                </Avatar>
              </TooltipTrigger>
              <TooltipContent>
                <p>{remainingCount} more viewer{remainingCount > 1 ? 's' : ''}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}

interface ViewerCursorProps {
  viewer: Viewer & { cursor?: { x: number; y: number } }
  containerRef: React.RefObject<HTMLElement>
}

export function ViewerCursor({ viewer, containerRef }: ViewerCursorProps) {
  if (!viewer.cursor || !containerRef.current) return null

  const rect = containerRef.current.getBoundingClientRect()
  const x = (viewer.cursor.x / 100) * rect.width
  const y = (viewer.cursor.y / 100) * rect.height

  const getInitials = (name: string | null, email: string | null) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    }
    if (email) {
      return email[0].toUpperCase()
    }
    return '?'
  }

  return (
    <div
      className="absolute pointer-events-none z-50 transition-all duration-100"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translate(-50%, -50%)'
      }}
    >
      {/* Cursor pointer */}
      <svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        className="drop-shadow-md"
      >
        <path
          d="M5.5 3.5L16.5 9.5L11.5 11.5L9.5 16.5L5.5 3.5Z"
          fill="currentColor"
          className="text-blue-500"
          stroke="white"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>

      {/* Viewer label */}
      <div className="absolute left-4 top-4 flex items-center gap-1 bg-blue-500 text-white px-2 py-1 rounded-full text-xs whitespace-nowrap">
        {viewer.viewerName || getInitials(viewer.viewerName, viewer.viewerEmail)}
      </div>
    </div>
  )
}