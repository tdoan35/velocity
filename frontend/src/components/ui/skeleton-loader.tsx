import React from 'react';
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        className
      )}
      {...props}
    />
  );
}

interface ProjectEditorSkeletonProps {
  showFileExplorer?: boolean;
}

function ProjectEditorSkeleton({ showFileExplorer = true }: ProjectEditorSkeletonProps) {
  return (
    <div className="h-full flex">
      {/* AI Chat Panel Skeleton */}
      <div className="w-[35%] border-r">
        <div className="p-4">
          <div className="space-y-4">
            {/* Chat header */}
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-16" />
            </div>
            
            {/* Chat messages */}
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
                  <div className="space-y-2 max-w-xs">
                    <Skeleton className={`h-16 w-full ${i % 2 === 0 ? 'rounded-r-lg rounded-bl-lg' : 'rounded-l-lg rounded-br-lg'}`} />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              ))}
            </div>
            
            {/* Chat input */}
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        </div>
      </div>

      {/* Main Editor Area Skeleton */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-6 w-32" />
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 flex">
          {showFileExplorer && (
            <>
              {/* File Explorer */}
              <div className="w-64 border-r">
                <div className="p-4">
                  <Skeleton className="h-6 w-24 mb-4" />
                  <div className="space-y-2">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="flex items-center space-x-2">
                        <Skeleton className="h-4 w-4" />
                        <Skeleton className={`h-4 ${Math.random() > 0.5 ? 'w-20' : 'w-16'}`} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Editor */}
          <div className="flex-1">
            <div className="h-full p-4">
              <div className="h-full space-y-4">
                {/* Editor tabs */}
                <div className="flex items-center space-x-2">
                  <Skeleton className="h-8 w-24" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-8 w-16" />
                </div>
                
                {/* Editor content */}
                <div className="flex-1 space-y-2">
                  {[...Array(15)].map((_, i) => (
                    <div key={i} className="flex items-start space-x-2">
                      <Skeleton className="h-4 w-8 flex-shrink-0" />
                      <Skeleton className={`h-4 ${
                        Math.random() > 0.8 ? 'w-16' : 
                        Math.random() > 0.6 ? 'w-32' :
                        Math.random() > 0.4 ? 'w-48' : 
                        'w-64'
                      }`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SecurityDashboardSkeletonProps {
  className?: string;
}

function SecurityDashboardSkeleton({ className }: SecurityDashboardSkeletonProps) {
  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        
        {/* Quick stats */}
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-4 border rounded">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-8" />
                </div>
                <Skeleton className="h-8 w-8" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        <div className="space-y-6">
          {/* Tabs */}
          <div className="flex space-x-4 border-b">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-20" />
            ))}
          </div>
          
          {/* Content cards */}
          <div className="grid grid-cols-2 gap-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="p-4 border rounded">
                <Skeleton className="h-6 w-32 mb-4" />
                <div className="space-y-3">
                  {[...Array(4)].map((_, j) => (
                    <div key={j} className="flex items-center justify-between">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-4 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface PerformanceDashboardSkeletonProps {
  className?: string;
}

function PerformanceDashboardSkeleton({ className }: PerformanceDashboardSkeletonProps) {
  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <Skeleton className="h-6 w-6" />
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-5 w-20" />
          </div>
          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>
        
        {/* Performance metrics */}
        <div className="grid grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="p-4 border rounded">
              <div className="flex items-center justify-between mb-2">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-8 w-12" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-8 w-8" />
              </div>
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-4">
        <div className="space-y-6">
          {/* Tabs */}
          <div className="flex space-x-4 border-b">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-24" />
            ))}
          </div>
          
          {/* Charts and content */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-48 w-full" />
            </div>
            <div className="space-y-4">
              <Skeleton className="h-6 w-40" />
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export { 
  Skeleton, 
  ProjectEditorSkeleton, 
  SecurityDashboardSkeleton, 
  PerformanceDashboardSkeleton 
};