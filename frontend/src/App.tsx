import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom'
import { initializeStoreSubscriptions } from './stores'
import { useAuthStore } from './stores/useAuthStore'
import { useAppStore } from './stores/useAppStore'
import { authService } from './services/auth'
import { projectService } from './services/projectService'
import { useNavigate } from 'react-router-dom'
import { Button } from './components/ui/button'
import { Textarea } from './components/ui/textarea'
import { AuroraBackground } from './components/ui/aurora-background'
import { MovingBorderWrapper } from './components/ui/moving-border'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import { AnimatedTooltip } from './components/ui/animated-tooltip'
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
import { AuthCallback } from './pages/AuthCallback'
import { Modal } from './components/ui/modal'
import { SignupForm } from './components/ui/signup-form'
import { AuthenticatedLayout } from './components/AuthenticatedLayout'
import { Dashboard } from './pages/Dashboard'
import { ProjectDesign } from './pages/ProjectDesign'
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
  Sun,
  Lightbulb,
  Layers,
  Play,
  Paperclip,
  Edit
} from 'lucide-react'
import { useTheme } from './components/theme-provider'

function NavigationContent({ onOpenAuthModal }: { onOpenAuthModal?: (mode: 'signup' | 'login') => void }) {
  const [isOpen, setIsOpen] = useState(false)
  const [localAuthModalOpen, setLocalAuthModalOpen] = useState(false)
  const [localAuthMode, setLocalAuthMode] = useState<'signup' | 'login'>('signup')
  const location = useLocation()
  const { theme, setTheme } = useTheme()
  const { user, isAuthenticated, logout } = useAuthStore()
  const { currentProject } = useAppStore()
  const navigate = useNavigate()
  
  // Use local modal state if no shared handler provided
  const isAuthModalOpen = onOpenAuthModal ? false : localAuthModalOpen
  const authMode = onOpenAuthModal ? 'signup' : localAuthMode
  const setIsAuthModalOpen = onOpenAuthModal ? () => {} : setLocalAuthModalOpen
  const setAuthMode = onOpenAuthModal ? () => {} : setLocalAuthMode
  
  const handleLogout = async () => {
    await logout()
  }
  
  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/demo/design', label: 'Design System', icon: Palette },
    { path: '/demo/store', label: 'Store Demo', icon: Database },
    { path: '/demo/responsive', label: 'Responsive', icon: Layout },
    { path: '/demo/editor', label: 'Editor', icon: Code2 },
    { path: '/demo/explorer', label: 'File Explorer', icon: FolderOpen },
    { path: '/demo/chat', label: 'AI Chat', icon: MessageSquare },
    { path: '/demo/optimistic', label: 'Optimistic UI', icon: Zap },
    { path: '/demo/preview', label: 'Mobile Preview', icon: Smartphone },
  ]

  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false)
  }, [location])

  // Check if we're on a project page
  const isProjectPage = location.pathname.startsWith('/project/')

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50">
        <nav className="w-full px-4">
          <div className="flex h-16 items-center relative">
            {/* Logo/Brand - absolutely positioned */}
            <Link to="/" className="absolute left-0 flex items-center gap-2 font-semibold text-lg [text-shadow:_0_1px_2px_rgb(0_0_0_/_20%)]">
              <span className="text-xl drop-shadow-sm">✨</span>
              <span className="text-foreground">Velocity</span>
            </Link>
            
            {/* Center Content - Show project title on project pages, navigation links otherwise */}
            <div className="hidden md:flex items-center gap-8 mx-auto">
              {isProjectPage && currentProject ? (
                <div className="text-center">
                  <h1 className="text-lg font-semibold text-foreground">{currentProject.name}</h1>
                </div>
              ) : (
                <>
                  <span className="text-sm font-medium text-foreground/40 cursor-not-allowed">
                    Features
                  </span>
                  <span className="text-sm font-medium text-foreground/40 cursor-not-allowed">
                    Learn
                  </span>
                  <span className="text-sm font-medium text-foreground/40 cursor-not-allowed">
                    Pricing
                  </span>
                  <span className="text-sm font-medium text-foreground/40 cursor-not-allowed">
                    Enterprise
                  </span>
                </>
              )}
            </div>
            
            {/* Right side controls - absolutely positioned */}
            <div className="absolute right-0 flex items-center gap-2">
              {/* Open Editor Button - only show on project pages */}
              {isProjectPage && currentProject && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/editor/${currentProject.id}`)}
                  className="hidden md:flex gap-2"
                >
                  <Edit className="w-4 h-4" />
                  Open Editor
                </Button>
              )}
              
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

              {/* Auth Buttons */}
              {isAuthenticated ? (
                <>
                  <div className="hidden md:flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                      {user?.email}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleLogout}
                    >
                      Log out
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  {/* Login Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="hidden md:flex"
                    onClick={() => {
                      if (onOpenAuthModal) {
                        onOpenAuthModal('login');
                      } else {
                        setLocalAuthMode('login');
                        setLocalAuthModalOpen(true);
                      }
                    }}
                  >
                    Log in
                  </Button>
                  
                  {/* Get Started Button */}
                  <Button
                    size="sm"
                    className="hidden md:flex bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => {
                      if (onOpenAuthModal) {
                        onOpenAuthModal('signup');
                      } else {
                        setLocalAuthMode('signup');
                        setLocalAuthModalOpen(true);
                      }
                    }}
                  >
                    Get Started
                  </Button>
                </>
              )}
              
            </div>
          </div>
        </nav>
      </header>
      
      {!onOpenAuthModal && (
        <Modal isOpen={localAuthModalOpen} onClose={() => setLocalAuthModalOpen(false)}>
          <SignupForm 
            mode={localAuthMode} 
            onClose={() => setLocalAuthModalOpen(false)}
            onModeSwitch={(newMode) => setLocalAuthMode(newMode)}
          />
        </Modal>
      )}
    </>
  )
}

// Wrapper component to provide Router context
function Navigation({ onOpenAuthModal }: { onOpenAuthModal?: (mode: 'signup' | 'login') => void }) {
  return <NavigationContent onOpenAuthModal={onOpenAuthModal} />
}

// Unauthenticated layout with shared auth modal
function UnauthenticatedLayout() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('signup')
  
  const handleOpenAuthModal = (mode: 'signup' | 'login' = 'signup') => {
    setAuthMode(mode)
    setIsAuthModalOpen(true)
  }
  
  return (
    <>
      <Navigation onOpenAuthModal={handleOpenAuthModal} />
      <HomePage onAuthRequired={() => handleOpenAuthModal('signup')} />
      <Modal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)}>
        <SignupForm 
          mode={authMode} 
          onClose={() => setIsAuthModalOpen(false)}
          onModeSwitch={(newMode) => setAuthMode(newMode)}
        />
      </Modal>
    </>
  )
}

function HomePage({ onAuthRequired }: { onAuthRequired?: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [mouseX, setMouseX] = useState(50) // percentage
  const [isHovering, setIsHovering] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  const handleSubmit = async () => {
    if (prompt.trim() && !isSubmitting) {
      // Check if user is authenticated
      if (!isAuthenticated) {
        // Open auth modal instead of submitting
        onAuthRequired?.()
        return
      }
      
      setIsSubmitting(true)
      
      try {
        // Generate a name from the prompt (first 50 chars or first sentence)
        const projectName = prompt.split('.')[0].substring(0, 50) + 
          (prompt.length > 50 ? '...' : '')
        
        // Create the project
        const { project, error } = await projectService.createProject({
          name: projectName,
          description: prompt,
          initialPrompt: prompt,
          template: 'react-native'
        })
        
        if (error) {
          console.error('Error creating project:', error)
          // TODO: Show error notification
          return
        }
        
        if (project) {
          // Navigate to the project design page
          navigate(`/project/${project.id}`)
        }
      } catch (error) {
        console.error('Unexpected error:', error)
        // TODO: Show error notification
      } finally {
        setIsSubmitting(false)
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percentage = (x / rect.width) * 100
    setMouseX(Math.max(0, Math.min(100, percentage)))
  }

  const content = (
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
              duration={4000}
              containerClassName="relative"
            >
              <div className="relative w-full">
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
                  className="min-h-[120px] w-full p-4 resize-none border-0 bg-background/50 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-0"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute bottom-4 left-4 h-8 w-8 text-muted-foreground hover:text-foreground"
                  onClick={() => console.log('Attach image clicked')}
                  aria-label="Attach image"
                >
                  <Paperclip className="w-4 h-4" />
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!prompt.trim() || isSubmitting}
                  className="absolute bottom-4 right-4 h-8 w-8 p-0 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  size="icon"
                  title={!isAuthenticated && prompt.trim() ? "Sign up to create your app" : ""}
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </MovingBorderWrapper>
          </div>
          
          <div className="relative mt-16">
            {/* Icons grid */}
            <div 
              className="grid grid-cols-1 md:grid-cols-3 gap-16 max-w-3xl mx-auto relative"
              onMouseMove={handleMouseMove}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => setIsHovering(false)}
            >
              {/* Horizontal line - positioned to align with icon centers */}
              <div className="absolute top-6 left-[16.67%] right-[16.67%] h-px overflow-hidden">
                <div 
                  className="h-full w-full transition-opacity duration-300"
                  style={{
                    background: isHovering 
                      ? `linear-gradient(90deg, 
                          transparent 0%, 
                          transparent ${Math.max(0, mouseX - 15)}%, 
                          rgba(59, 130, 246, 0.1) ${Math.max(0, mouseX - 10)}%, 
                          rgba(59, 130, 246, 0.3) ${Math.max(0, mouseX - 5)}%, 
                          rgba(59, 130, 246, 0.8) ${mouseX}%, 
                          rgba(59, 130, 246, 0.3) ${Math.min(100, mouseX + 5)}%, 
                          rgba(59, 130, 246, 0.1) ${Math.min(100, mouseX + 10)}%, 
                          transparent ${Math.min(100, mouseX + 15)}%, 
                          transparent 100%)`
                      : 'linear-gradient(90deg, transparent 0%, rgba(148, 163, 184, 0.2) 50%, transparent 100%)',
                    opacity: isHovering ? 1 : 0.5,
                  }}
                />
                {/* Glow effect */}
                {isHovering && (
                  <div 
                    className="absolute -top-1 h-3 w-20 -translate-x-1/2 blur-md transition-all duration-75"
                    style={{
                      left: `${mouseX}%`,
                      background: 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.6) 0%, transparent 70%)',
                    }}
                  />
                )}
              </div>
              
              <AnimatedTooltip items={{ id: 1, name: "Ideate", designation: "Transform your ideas into reality" }}>
                <div className="mx-auto w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center cursor-pointer transition-transform hover:scale-110 relative z-10 backdrop-blur-sm">
                  <Lightbulb className="w-6 h-6 text-blue-500" />
                </div>
              </AnimatedTooltip>

              <AnimatedTooltip items={{ id: 2, name: "Architect", designation: "Design your app ideas" }}>
                <div className="mx-auto w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center cursor-pointer transition-transform hover:scale-110 relative z-10 backdrop-blur-sm">
                  <Layers className="w-6 h-6 text-purple-500" />
                </div>
              </AnimatedTooltip>

              <AnimatedTooltip items={{ id: 3, name: "Execute", designation: "Build and deploy instantly" }}>
                <div className="mx-auto w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center cursor-pointer transition-transform hover:scale-110 relative z-10 backdrop-blur-sm">
                  <Play className="w-6 h-6 text-green-500" />
                </div>
              </AnimatedTooltip>
            </div>
          </div>
        </div>
      </div>
  )

  // Only wrap with AuroraBackground if not authenticated (since AuthenticatedLayout already has it)
  return isAuthenticated ? content : (
    <AuroraBackground showRadialGradient={false}>
      {content}
    </AuroraBackground>
  )
}

function App() {
  const { setUser, checkAuth, isAuthenticated } = useAuthStore()
  
  useEffect(() => {
    // Initialize store subscriptions
    const cleanup = initializeStoreSubscriptions()
    
    // Check initial auth state
    checkAuth()
    
    // Set up auth state listener
    const authSubscription = authService.onAuthStateChange((user) => {
      setUser(user)
    })
    
    return () => {
      cleanup()
      authSubscription.unsubscribe()
    }
  }, [setUser, checkAuth])

  return (
    <Router>
      <div>
        <Routes>
          {/* Auth callback route */}
          <Route path="/auth/callback" element={<AuthCallback />} />
          
          {/* Main routes without navigation */}
          <Route path="/snack/:projectId" element={<SnackEditor />} />
          
          {/* Authenticated routes with sidebar */}
          <Route path="/" element={
            isAuthenticated ? (
              <AuroraBackground showRadialGradient={false}>
                <AuthenticatedLayout />
              </AuroraBackground>
            ) : (
              <UnauthenticatedLayout />
            )
          }>
            {isAuthenticated && (
              <>
                <Route index element={<HomePage />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="apps" element={<SnackProjects />} />
                <Route path="project/:id" element={<ProjectDesign />} />
                <Route path="editor" element={
                  <LazyBoundary>
                    <EditorDemo />
                  </LazyBoundary>
                } />
                <Route path="history" element={
                  <div className="p-10">
                    <h1 className="text-2xl font-bold">History</h1>
                    <p className="text-muted-foreground mt-2">Your project history will appear here.</p>
                  </div>
                } />
                <Route path="profile" element={
                  <div className="p-10">
                    <h1 className="text-2xl font-bold">Profile</h1>
                    <p className="text-muted-foreground mt-2">Manage your profile settings.</p>
                  </div>
                } />
                <Route path="settings" element={
                  <div className="p-10">
                    <h1 className="text-2xl font-bold">Settings</h1>
                    <p className="text-muted-foreground mt-2">Configure your app preferences.</p>
                  </div>
                } />
              </>
            )}
          </Route>
          
          {/* Public demo routes */}
          <Route path="/demo/*" element={
            <>
              <Navigation />
              <div>
                <Routes>
                  <Route path="design" element={
                    <LazyBoundary>
                      <DesignSystemDemo />
                    </LazyBoundary>
                  } />
                  <Route path="store" element={
                    <LazyBoundary>
                      <StoreDemo />
                    </LazyBoundary>
                  } />
                  <Route path="responsive" element={
                    <LazyBoundary>
                      <ResponsiveDemo />
                    </LazyBoundary>
                  } />
                  <Route path="editor" element={
                    <LazyBoundary>
                      <EditorDemo />
                    </LazyBoundary>
                  } />
                  <Route path="explorer" element={
                    <LazyBoundary>
                      <FileExplorerDemo />
                    </LazyBoundary>
                  } />
                  <Route path="chat" element={
                    <LazyBoundary>
                      <ChatInterfaceDemo />
                    </LazyBoundary>
                  } />
                  <Route path="optimistic" element={
                    <LazyBoundary>
                      <OptimisticUIDemo />
                    </LazyBoundary>
                  } />
                  <Route path="preview" element={
                    <LazyBoundary>
                      <PreviewDemo />
                    </LazyBoundary>
                  } />
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