import React from 'react'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle, XCircle, Package, Zap, Upload, FileCode } from 'lucide-react'

interface BuildProgressProps {
  stage: 'idle' | 'preparing' | 'bundling' | 'optimizing' | 'uploading' | 'completed' | 'failed'
  progress: number
  message: string
  isBuilding: boolean
}

const stageIcons = {
  idle: FileCode,
  preparing: Package,
  bundling: Loader2,
  optimizing: Zap,
  uploading: Upload,
  completed: CheckCircle,
  failed: XCircle
}

const stageColors = {
  idle: 'text-gray-500',
  preparing: 'text-blue-500',
  bundling: 'text-purple-500',
  optimizing: 'text-yellow-500',
  uploading: 'text-green-500',
  completed: 'text-green-600',
  failed: 'text-red-500'
}

export function BuildProgressIndicator({ stage, progress, message, isBuilding }: BuildProgressProps) {
  const Icon = stageIcons[stage]
  const colorClass = stageColors[stage]

  if (!isBuilding && stage === 'idle') {
    return null
  }

  return (
    <div className="w-full space-y-3 p-4 bg-background/60 backdrop-blur-sm rounded-lg border">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className={`h-5 w-5 ${colorClass} ${stage === 'bundling' ? 'animate-spin' : ''}`} />
          <span className="text-sm font-medium">{message}</span>
        </div>
        <Badge variant={stage === 'completed' ? 'default' : stage === 'failed' ? 'destructive' : 'secondary'}>
          {stage}
        </Badge>
      </div>
      
      {stage !== 'completed' && stage !== 'failed' && (
        <Progress value={progress} className="h-2" />
      )}

      {stage === 'bundling' && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Resolving dependencies...</p>
          <p>• Transpiling React Native code...</p>
          <p>• Optimizing for {progress > 50 ? 'production' : 'preview'}...</p>
        </div>
      )}

      {stage === 'optimizing' && (
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• Tree shaking unused code...</p>
          <p>• Minifying JavaScript...</p>
          <p>• Compressing assets...</p>
        </div>
      )}

      {stage === 'completed' && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span>Build successful! Preview is ready.</span>
        </div>
      )}

      {stage === 'failed' && (
        <div className="text-sm text-red-600 space-y-2">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4" />
            <span>Build failed</span>
          </div>
          <p className="text-xs">{message}</p>
        </div>
      )}
    </div>
  )
}