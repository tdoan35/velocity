import { useNavigate, useLocation } from 'react-router-dom'
import { Button } from '../ui/button'
import { Edit } from 'lucide-react'
import { useAppStore } from '@/stores/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { ThemeToggle } from './ThemeToggle'
import { NavbarAuth } from './NavbarAuth'
import { NavbarMenu } from './NavbarMenu'

interface NavbarActionsProps {
  onOpenAuthModal?: (mode: 'signup' | 'login') => void
  onLogout?: () => void
  showDemoMenu?: boolean
}

export function NavbarActions({ onOpenAuthModal, onLogout, showDemoMenu = false }: NavbarActionsProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { currentProject } = useAppStore()
  const { isAuthenticated } = useAuthStore()
  
  const isProjectPage = location.pathname.startsWith('/project/')

  return (
    <div className="absolute right-0 flex items-center gap-2 h-full">
      {/* Open Editor Button - only show on project pages */}
      {isAuthenticated && isProjectPage && currentProject && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/editor/${currentProject.id}`)}
          className="hidden md:flex gap-1.5 h-8 px-3 text-sm"
        >
          <Edit className="w-3.5 h-3.5" />
          Open Editor
        </Button>
      )}
      
      {/* Demo Menu - show for demo pages or authenticated users */}
      {(showDemoMenu || isAuthenticated) && <NavbarMenu />}
      
      {/* Theme Toggle */}
      <ThemeToggle />
      
      {/* Auth Buttons/User Info */}
      {!isAuthenticated && (
        <NavbarAuth onOpenAuthModal={onOpenAuthModal} onLogout={onLogout} />
      )}
    </div>
  )
}