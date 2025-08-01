import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import { initializeStoreSubscriptions } from './stores'
import { Button } from './components/ui/button'
import { Textarea } from './components/ui/textarea'
import { AuroraBackground } from './components/ui/aurora-background'
import { MovingBorderWrapper } from './components/ui/moving-border'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from './components/ui/dropdown-menu'

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
  Sparkles,
  Menu,
  X,
  Moon,
  Sun
} from 'lucide-react'
import { useTheme } from './components/theme-provider'

function NavigationContent() {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  
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

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false)
  }, [location])

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo/Brand */}
          <Link to="/" className="flex items-center gap-2 font-semibold text-lg [text-shadow:_0_1px_2px_rgb(0_0_0_/_20%)]">
            <Sparkles className="w-5 h-5 text-primary drop-shadow-sm" />
            <span className="text-foreground">Velocity</span>
          </Link>
          
          {/* Right side controls */}
          <div className="flex items-center gap-2">
            {/* Theme Toggle */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="relative hover:bg-background/20 [&_svg]:drop-shadow-sm"
              aria-label="Toggle theme"
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </Button>
            
            {/* Hamburger Menu */}
            <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative hover:bg-background/20 [&_svg]:drop-shadow-sm"
                aria-label="Open navigation menu"
              >
                <Menu className={`h-5 w-5 transition-all ${isOpen ? 'rotate-90 opacity-0' : ''}`} />
                <X className={`h-5 w-5 absolute transition-all ${isOpen ? 'rotate-0 opacity-100' : 'rotate-90 opacity-0'}`} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-background/95 backdrop-blur-md border-border/50">
              {navItems.map(({ path, label, icon: Icon }, index) => (
                <React.Fragment key={path}>
                  <DropdownMenuItem asChild>
                    <Link 
                      to={path} 
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <Icon className="w-4 h-4" />
                      <span>{label}</span>
                    </Link>
                  </DropdownMenuItem>
                  {(index === 0 || index === 3 || index === 7) && <DropdownMenuSeparator />}
                </React.Fragment>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          </div>
        </div>
      </nav>
    </header>
  )
}

// Wrapper component to provide Router context
function Navigation() {
  return <NavigationContent />
}

function HomePage() {
  const [prompt, setPrompt] = useState('')

  const handleSubmit = () => {
    if (prompt.trim()) {
      // TODO: Handle submission
      console.log('Submitting prompt:', prompt)
    }
  }

  return (
    <AuroraBackground showRadialGradient={false}>
      <div className="flex items-center justify-center p-8 min-h-screen">
        <div className="max-w-4xl text-center relative z-10">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            What are we building today?
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Create beautiful apps at lightning speed.
          </p>
          
          <div className="w-full mb-8 relative">
            <MovingBorderWrapper
              borderRadius="0.5rem"
              duration={5000}
              borderClassName="bg-gradient-to-r from-transparent via-blue-500 to-transparent dark:from-transparent dark:via-blue-400 dark:to-transparent"
              containerClassName="relative"
            >
              <div className="relative">
                <Textarea
                  placeholder="Describe your app idea..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      handleSubmit()
                    }
                  }}
                  className="min-h-[120px] p-4 pr-24 resize-none border-0 bg-background/50 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-0"
                />
                <Button
                  onClick={handleSubmit}
                  disabled={!prompt.trim()}
                  className="absolute bottom-3 right-3 h-10 px-4 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed z-20"
                  size="sm"
                >
                  <Sparkles className="w-4 h-4" />
                </Button>
              </div>
            </MovingBorderWrapper>
          </div>
          
          {/* <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-12">
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
          </div> */}
        </div>
      </div>
    </AuroraBackground>
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
              <div>
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