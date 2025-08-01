import { useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom'
import { initializeStoreSubscriptions } from './stores'
import { Button } from './components/ui/button'
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
} from './routes/lazy-routes'
import { SnackProjects } from './pages/SnackProjects'
import { SnackEditor } from './pages/SnackEditor'
import { 
  Home, 
  Palette, 
  Database, 
  Layout, 
  Code2, 
  FolderOpen, 
  MessageSquare, 
  Zap, 
  Smartphone,
  Sparkles
} from 'lucide-react'

function Navigation() {
  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/design', label: 'Design System', icon: Palette },
    { path: '/store', label: 'Store Demo', icon: Database },
    { path: '/responsive', label: 'Responsive', icon: Layout },
    { path: '/editor', label: 'Editor', icon: Code2 },
    { path: '/explorer', label: 'File Explorer', icon: FolderOpen },
    { path: '/chat', label: 'AI Chat', icon: MessageSquare },
    { path: '/optimistic', label: 'Optimistic UI', icon: Zap },
    { path: '/preview', label: 'Mobile Preview', icon: Smartphone },
    { path: '/snack', label: 'Snack Projects', icon: Sparkles },
  ]

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
      <nav className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo/Brand */}
          <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
            <Sparkles className="w-5 h-5 text-primary" />
            Velocity
          </Link>
          
          {/* Navigation Items */}
          <div className="flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link key={path} to={path}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 hover:bg-accent"
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden md:inline">{label}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  )
}

function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="max-w-4xl text-center">
        <h1 className="text-4xl font-bold mb-4">Velocity Development Platform</h1>
        <p className="text-xl text-muted-foreground mb-8">
          AI-powered mobile app development with live preview
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
          <Link to="/snack">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <Sparkles className="w-6 h-6" />
              <span>Snack Projects</span>
            </Button>
          </Link>
          <Link to="/editor">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <Code2 className="w-6 h-6" />
              <span>Code Editor</span>
            </Button>
          </Link>
          <Link to="/preview">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <Smartphone className="w-6 h-6" />
              <span>Mobile Preview</span>
            </Button>
          </Link>
          <Link to="/chat">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <MessageSquare className="w-6 h-6" />
              <span>AI Assistant</span>
            </Button>
          </Link>
          <Link to="/design">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <Palette className="w-6 h-6" />
              <span>Design System</span>
            </Button>
          </Link>
          <Link to="/explorer">
            <Button variant="outline" className="w-full h-24 flex flex-col gap-2">
              <FolderOpen className="w-6 h-6" />
              <span>File Explorer</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

function App() {
  useEffect(() => {
    // Initialize store subscriptions
    const cleanup = initializeStoreSubscriptions()
    return cleanup
  }, [])

  return (
    <Router>
      <div>
        <Routes>
          {/* Main routes without navigation */}
          <Route path="/snack/:projectId" element={<SnackEditor />} />
          
          {/* Routes with navigation */}
          <Route path="*" element={
            <>
              <Navigation />
              <div className="pt-16">
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/design" element={
                    <LazyBoundary>
                      <DesignSystemDemo />
                    </LazyBoundary>
                  } />
                  <Route path="/store" element={
                    <LazyBoundary>
                      <StoreDemo />
                    </LazyBoundary>
                  } />
                  <Route path="/responsive" element={
                    <LazyBoundary>
                      <ResponsiveDemo />
                    </LazyBoundary>
                  } />
                  <Route path="/editor" element={
                    <LazyBoundary>
                      <EditorDemo />
                    </LazyBoundary>
                  } />
                  <Route path="/explorer" element={
                    <LazyBoundary>
                      <FileExplorerDemo />
                    </LazyBoundary>
                  } />
                  <Route path="/chat" element={
                    <LazyBoundary>
                      <ChatInterfaceDemo />
                    </LazyBoundary>
                  } />
                  <Route path="/optimistic" element={
                    <LazyBoundary>
                      <OptimisticUIDemo />
                    </LazyBoundary>
                  } />
                  <Route path="/preview" element={
                    <LazyBoundary>
                      <PreviewDemo />
                    </LazyBoundary>
                  } />
                  <Route path="/snack" element={<SnackProjects />} />
                </Routes>
              </div>
            </>
          } />
        </Routes>
      </div>
    </Router>
  )
}

export default App