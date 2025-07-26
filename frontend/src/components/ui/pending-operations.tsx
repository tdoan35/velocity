import { useOptimisticStore } from '@/stores/useOptimisticStore'
import { LoadingSpinner } from './loading-states'
import { Button } from './button'
import { X, RefreshCw, Cloud, CloudOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card } from './card'
import { ScrollArea } from './scroll-area'

interface PendingOperationsProps {
  className?: string
  compact?: boolean
}

export function PendingOperations({ className, compact = false }: PendingOperationsProps) {
  const {
    operations,
    failedOperations,
    isOnline,
    isSyncing,
    retryOperation,
    rollbackOperation,
    clearFailedOperations,
  } = useOptimisticStore()
  
  const pendingOps = Array.from(operations.values()).filter(op => op.status === 'pending')
  const hasOperations = pendingOps.length > 0 || failedOperations.length > 0
  
  if (!hasOperations && !compact) return null
  
  const getOperationDescription = (op: typeof pendingOps[0]) => {
    const entityName = op.entityType.charAt(0).toUpperCase() + op.entityType.slice(1)
    switch (op.type) {
      case 'create':
        return `Creating ${entityName.toLowerCase()}`
      case 'update':
        return `Updating ${entityName.toLowerCase()}`
      case 'delete':
        return `Deleting ${entityName.toLowerCase()}`
      case 'move':
        return `Moving ${entityName.toLowerCase()}`
      case 'rename':
        return `Renaming ${entityName.toLowerCase()}`
      default:
        return `${op.type} ${entityName.toLowerCase()}`
    }
  }
  
  if (compact) {
    if (!hasOperations) return null
    
    return (
      <div className={cn('flex items-center gap-2 text-sm', className)}>
        {!isOnline && <CloudOff className="h-4 w-4 text-muted-foreground" />}
        {isSyncing && <LoadingSpinner size="sm" />}
        {pendingOps.length > 0 && (
          <span className="text-muted-foreground">
            {pendingOps.length} pending operation{pendingOps.length !== 1 ? 's' : ''}
          </span>
        )}
        {failedOperations.length > 0 && (
          <span className="text-destructive">
            {failedOperations.length} failed
          </span>
        )}
      </div>
    )
  }
  
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Operations</h3>
          {!isOnline ? (
            <CloudOff className="h-4 w-4 text-muted-foreground" />
          ) : (
            <Cloud className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        {failedOperations.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFailedOperations}
            className="h-7 text-xs"
          >
            Clear failed
          </Button>
        )}
      </div>
      
      <ScrollArea className="max-h-64">
        <div className="space-y-2">
          {/* Pending operations */}
          {pendingOps.map(op => (
            <div
              key={op.id}
              className="flex items-center justify-between p-2 rounded-md bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <LoadingSpinner size="sm" />
                <span className="text-sm">{getOperationDescription(op)}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(op.timestamp).toLocaleTimeString()}
              </span>
            </div>
          ))}
          
          {/* Failed operations */}
          {failedOperations.map(op => (
            <div
              key={op.id}
              className="p-2 rounded-md bg-destructive/10 border border-destructive/20"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-destructive">
                  {getOperationDescription(op)} failed
                </span>
                <div className="flex items-center gap-1">
                  {op.retryCount < op.maxRetries && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => retryOperation(op.id)}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => rollbackOperation(op.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {op.errorMessage && (
                <p className="text-xs text-muted-foreground">{op.errorMessage}</p>
              )}
              {op.retryCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Retry {op.retryCount}/{op.maxRetries}
                </p>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      
      {!isOnline && (
        <div className="mt-3 pt-3 border-t">
          <p className="text-xs text-muted-foreground">
            You're offline. Operations will sync when connection is restored.
          </p>
        </div>
      )}
    </Card>
  )
}

// Sync status indicator for header/footer
export function SyncStatusIndicator({ className }: { className?: string }) {
  const { isOnline, isSyncing, getPendingOperations, failedOperations } = useOptimisticStore()
  const pendingCount = getPendingOperations().length
  const failedCount = failedOperations.length
  
  if (!isOnline) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <CloudOff className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Offline</span>
      </div>
    )
  }
  
  if (isSyncing || pendingCount > 0) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <LoadingSpinner size="sm" />
        <span className="text-sm text-muted-foreground">
          Syncing{pendingCount > 0 && ` (${pendingCount})`}
        </span>
      </div>
    )
  }
  
  if (failedCount > 0) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        <AlertCircle className="h-4 w-4 text-destructive" />
        <span className="text-sm text-destructive">{failedCount} failed</span>
      </div>
    )
  }
  
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Cloud className="h-4 w-4 text-green-600" />
      <span className="text-sm text-green-600">Synced</span>
    </div>
  )
}

// Import AlertCircle
import { AlertCircle } from 'lucide-react'