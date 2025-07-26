import { Loader2, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function LoadingSpinner({ size = 'md', className }: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8',
  }
  
  return (
    <Loader2 className={cn('animate-spin', sizeClasses[size], className)} />
  )
}

interface LoadingOverlayProps {
  message?: string
  className?: string
}

export function LoadingOverlay({ message = 'Loading...', className }: LoadingOverlayProps) {
  return (
    <div className={cn(
      'absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50',
      className
    )}>
      <div className="flex flex-col items-center gap-2">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  )
}

interface SuccessIndicatorProps {
  message?: string
  duration?: number
  onComplete?: () => void
  className?: string
}

export function SuccessIndicator({ 
  message = 'Success!', 
  duration = 2000,
  onComplete,
  className 
}: SuccessIndicatorProps) {
  // Auto-hide after duration
  if (duration && onComplete) {
    setTimeout(onComplete, duration)
  }
  
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <CheckCircle2 className="h-5 w-5 text-green-600 animate-in zoom-in-50" />
      <span className="text-sm text-green-600">{message}</span>
    </div>
  )
}

interface ErrorIndicatorProps {
  message: string
  onRetry?: () => void
  className?: string
}

export function ErrorIndicator({ message, onRetry, className }: ErrorIndicatorProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <AlertCircle className="h-5 w-5 text-destructive" />
      <span className="text-sm text-destructive">{message}</span>
      {onRetry && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 ml-2"
          onClick={onRetry}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

interface InlineLoadingProps {
  isLoading: boolean
  children: React.ReactNode
  className?: string
}

export function InlineLoading({ isLoading, children, className }: InlineLoadingProps) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {isLoading && (
        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
          <LoadingSpinner size="sm" />
        </div>
      )}
    </div>
  )
}

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div className={cn('animate-pulse rounded-md bg-muted', className)} />
  )
}

// Skeleton components for common UI elements
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-4', i === lines - 1 && 'w-3/4')}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ className }: SkeletonProps) {
  return (
    <div className={cn('rounded-lg border p-4 space-y-3', className)}>
      <Skeleton className="h-6 w-1/3" />
      <SkeletonText lines={2} />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

export function SkeletonList({ items = 5, className }: { items?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-2">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-1/2 mb-1" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  )
}