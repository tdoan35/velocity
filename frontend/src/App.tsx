import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { initializeStoreSubscriptions } from './stores'
import { useAuthStore } from './stores/useAuthStore'
import { useAppStore } from './stores/useAppStore'
import { authService } from './services/auth'
import { projectService } from './services/projectService'
import { useNavigate } from 'react-router-dom'
import { AuroraBackground } from './components/ui/aurora-background'
import { AnimatedTooltip } from './components/ui/animated-tooltip'
import { EnhancedTextarea } from './components/ui/enhanced-textarea'
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
import { PRDEditorDemo } from './pages/PRDEditorDemo'
import { Modal } from './components/ui/modal'
import { SignupForm } from './components/ui/signup-form'
import { AuthenticatedLayout } from './components/AuthenticatedLayout'
import { Dashboard } from './pages/Dashboard'
import { ProjectDesign } from './pages/ProjectDesignWithSupabase'
import { ProjectEditor } from './pages/ProjectEditor'
import { FullStackPreviewPanelTest } from './components/preview/FullStackPreviewPanelTest'
import { EnhancedEditorContainerTest } from './components/editor/EnhancedEditorContainerTest'
import { ProjectEditorTest } from './pages/ProjectEditorTest'
import { ProjectTester } from './components/testing/ProjectTester'
import { 
  Lightbulb,
  Layers,
  Play
} from 'lucide-react'
import { Navbar } from './components/navigation'

function Navigation({ onOpenAuthModal }: { onOpenAuthModal?: (mode: 'signup' | 'login') => void }) {
  const [localAuthModalOpen, setLocalAuthModalOpen] = useState(false)
  const [localAuthMode, setLocalAuthMode] = useState<'signup' | 'login'>('signup')
  const { logout } = useAuthStore()
  
  const handleLogout = async () => {
    await logout()
  }
  
  const handleOpenAuthModal = (mode: 'signup' | 'login') => {
    if (onOpenAuthModal) {
      onOpenAuthModal(mode)
    } else {
      setLocalAuthMode(mode)
      setLocalAuthModalOpen(true)
    }
  }
  
  return (
    <>
      <Navbar 
        onOpenAuthModal={handleOpenAuthModal}
        onLogout={handleLogout}
        showDemoMenu={true}
      />
      
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
  const { addProject } = useAppStore()
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
          // Add the project to the app store
          addProject({
            id: project.id,
            name: project.name || 'Untitled Project',
            description: project.description || '',
            createdAt: new Date(project.created_at || Date.now()),
            updatedAt: new Date(project.updated_at || Date.now()),
            template: project.template_type || 'react-native',
            status: project.status || 'ready'
          })
          
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
          
          <div className="w-full mb-8">
            <EnhancedTextarea
              value={prompt}
              onChange={setPrompt}
              onSubmit={handleSubmit}
              placeholder="Describe your app idea..."
              disabled={false}
              isLoading={isSubmitting}
              onAttach={() => console.log('Attach image clicked')}
              className="w-full"
              submitButtonTooltip={!isAuthenticated && prompt.trim() ? "Sign up to create your app" : ""}
            />
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
          
          
          {/* New PRD Editor Demo */}
          <Route path="/prd-editor" element={<PRDEditorDemo />} />
          
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
                <Route path="project/:id/editor" element={<ProjectEditor />} />
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
                  <Route path="preview-test" element={
                    <FullStackPreviewPanelTest />
                  } />
                  <Route path="editor-test" element={
                    <EnhancedEditorContainerTest />
                  } />
                  <Route path="project-editor-test" element={
                    <ProjectEditorTest />
                  } />
                  <Route path="project-tester" element={
                    <ProjectTester />
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