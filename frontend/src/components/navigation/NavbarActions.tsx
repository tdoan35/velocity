import { useNavigate, useLocation } from 'react-router-dom'
import { Edit, Palette } from 'lucide-react'
import { useAuthStore } from '@/stores/useAuthStore'
import { useCurrentProject } from '@/contexts/ProjectContext'
import { useDesignPhase } from '@/stores/useDesignPhaseStore'
import type { PhaseName } from '@/types/design-phases'
import { ThemeToggle } from './ThemeToggle'
import { NavbarAuth } from './NavbarAuth'
import { NavbarMenu } from './NavbarMenu'
import { ButtonGroup } from '../ui/button-group'

interface NavbarActionsProps {
  onOpenAuthModal?: (mode: 'signup' | 'login') => void
  onLogout?: () => void
  showDemoMenu?: boolean
}

export function NavbarActions({ onOpenAuthModal, onLogout, showDemoMenu = false }: NavbarActionsProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useAuthStore()
  const { currentProject } = useCurrentProject()
  const { currentDesignPhase } = useDesignPhase()

  const isProjectPage = location.pathname.startsWith('/project/')
  const isEditorPage = location.pathname.includes('/editor')

  const currentValue = isEditorPage ? 'editor' : 'design'

  const ALL_PHASES: PhaseName[] = [
    'product-vision', 'product-roadmap', 'data-model',
    'design-system', 'application-shell', 'section-details', 'export'
  ]

  const allPhasesCompleted = currentDesignPhase
    ? ALL_PHASES.every(p => currentDesignPhase.phases_completed.includes(p))
    : false

  const viewOptions = [
    {
      value: 'design',
      label: 'Design',
      icon: <Palette className="w-3 h-3" />
    },
    {
      value: 'editor',
      label: 'Editor',
      icon: <Edit className="w-3 h-3" />,
      disabled: !allPhasesCompleted
    }
  ]

  const handleViewChange = (value: string) => {
    if (!currentProject) return
    
    if (value === 'design') {
      navigate(`/project/${currentProject.id}`)
    } else if (value === 'editor') {
      navigate(`/project/${currentProject.id}/editor`)
    }
  }

  return (
    <div className="absolute right-0 flex items-center gap-2 h-full">
      {/* Design/Editor Toggle - only show on project pages */}
      {isAuthenticated && isProjectPage && currentProject && (
        <ButtonGroup
          options={viewOptions}
          value={currentValue}
          onValueChange={handleViewChange}
          className="hidden md:flex"
        />
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