import { lazy, Suspense } from 'react'
import { LoadingSpinner } from '@/components/ui/loading-states'

// Lazy load demo components
export const DesignSystemDemo = lazy(() => 
  import('@/components/design-system-demo').then(m => ({ default: m.DesignSystemDemo }))
)

export const StoreDemo = lazy(() => 
  import('@/components/store-demo').then(m => ({ default: m.StoreDemo }))
)

export const ResponsiveDemo = lazy(() => 
  import('@/components/responsive-demo').then(m => ({ default: m.ResponsiveDemo }))
)

export const EditorDemo = lazy(() => 
  import('@/components/editor-demo').then(m => ({ default: m.EditorDemo }))
)

export const FileExplorerDemo = lazy(() => 
  import('@/components/file-explorer-demo').then(m => ({ default: m.FileExplorerDemo }))
)

export const ChatInterfaceDemo = lazy(() => 
  import('@/components/chat-interface-demo').then(m => ({ default: m.ChatInterfaceDemo }))
)

export const OptimisticUIDemo = lazy(() => 
  import('@/components/demos/optimistic-ui-demo').then(m => ({ default: m.OptimisticUIDemo }))
)

export const PreviewDemo = lazy(() => 
  import('@/components/preview-demo').then(m => ({ default: m.PreviewDemo }))
)

export const ContainerPreviewDemo = lazy(() => 
  import('@/components/container-preview-demo').then(m => ({ default: m.ContainerPreviewDemo }))
)

// Loading fallback component
export function PageLoader() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="lg" />
        <p className="mt-4 text-sm text-muted-foreground">Loading component...</p>
      </div>
    </div>
  )
}

// Wrapper for lazy components
export function LazyBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PageLoader />}>
      {children}
    </Suspense>
  )
}