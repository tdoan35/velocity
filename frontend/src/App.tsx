import { useEffect, useState } from 'react'
import { initializeStoreSubscriptions } from '@/stores'
import { Button } from '@/components/ui/button'
import {
  LazyBoundary,
  DesignSystemDemo,
  StoreDemo,
  ResponsiveDemo,
  EditorDemo,
  FileExplorerDemo,
  ChatInterfaceDemo,
  OptimisticUIDemo,
  PreviewDemo,
} from '@/routes/lazy-routes'

type DemoView = 'design' | 'store' | 'responsive' | 'editor' | 'explorer' | 'chat' | 'optimistic' | 'preview'

function App() {
  const [currentView, setCurrentView] = useState<DemoView>('design')

  useEffect(() => {
    // Initialize store subscriptions
    const cleanup = initializeStoreSubscriptions()
    return cleanup
  }, [])

  const renderView = () => {
    return (
      <LazyBoundary>
        {currentView === 'design' && <DesignSystemDemo />}
        {currentView === 'store' && <StoreDemo />}
        {currentView === 'responsive' && <ResponsiveDemo />}
        {currentView === 'editor' && <EditorDemo />}
        {currentView === 'explorer' && <FileExplorerDemo />}
        {currentView === 'chat' && <ChatInterfaceDemo />}
        {currentView === 'optimistic' && <OptimisticUIDemo />}
        {currentView === 'preview' && <PreviewDemo />}
      </LazyBoundary>
    )
  }

  return (
    <div>
      <div className="fixed top-4 left-4 z-50 flex gap-2 flex-wrap max-w-4xl">
        <Button
          onClick={() => setCurrentView('design')}
          variant={currentView === 'design' ? 'default' : 'outline'}
          size="sm"
        >
          Design System
        </Button>
        <Button
          onClick={() => setCurrentView('store')}
          variant={currentView === 'store' ? 'default' : 'outline'}
          size="sm"
        >
          Store Demo
        </Button>
        <Button
          onClick={() => setCurrentView('responsive')}
          variant={currentView === 'responsive' ? 'default' : 'outline'}
          size="sm"
        >
          Responsive
        </Button>
        <Button
          onClick={() => setCurrentView('editor')}
          variant={currentView === 'editor' ? 'default' : 'outline'}
          size="sm"
        >
          Editor
        </Button>
        <Button
          onClick={() => setCurrentView('explorer')}
          variant={currentView === 'explorer' ? 'default' : 'outline'}
          size="sm"
        >
          Explorer
        </Button>
        <Button
          onClick={() => setCurrentView('chat')}
          variant={currentView === 'chat' ? 'default' : 'outline'}
          size="sm"
        >
          AI Chat
        </Button>
        <Button
          onClick={() => setCurrentView('optimistic')}
          variant={currentView === 'optimistic' ? 'default' : 'outline'}
          size="sm"
        >
          Optimistic UI
        </Button>
        <Button
          onClick={() => setCurrentView('preview')}
          variant={currentView === 'preview' ? 'default' : 'outline'}
          size="sm"
        >
          Mobile Preview
        </Button>
      </div>
      {renderView()}
    </div>
  )
}

export default App