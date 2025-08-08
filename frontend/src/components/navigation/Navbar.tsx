import { cn } from '@/lib/utils'
import { NavbarBrand } from './NavbarBrand'
import { NavbarCenter } from './NavbarCenter'
import { NavbarActions } from './NavbarActions'
import { useAuthStore } from '@/stores/useAuthStore'

interface NavbarProps {
  className?: string
  onOpenAuthModal?: (mode: 'signup' | 'login') => void
  onLogout?: () => void
  showDemoMenu?: boolean
  showProjectTitle?: boolean
  brandClassName?: string
}

export function Navbar({ 
  className,
  onOpenAuthModal,
  onLogout,
  showDemoMenu = false,
  showProjectTitle = true,
  brandClassName
}: NavbarProps) {
  const { isAuthenticated } = useAuthStore()

  return (
    <header className={cn("fixed top-0 left-0 right-0 z-50", className)}>
      <nav className="w-full px-4">
        <div className="flex h-14 items-center relative">
          {/* Logo/Brand - absolutely positioned */}
          <div className={cn("absolute left-0 flex items-center h-full", brandClassName)}>
            <NavbarBrand />
          </div>
          
          {/* Center Content */}
          <NavbarCenter 
            isAuthenticated={isAuthenticated} 
            showProjectTitle={showProjectTitle}
          />
          
          {/* Right side controls */}
          <NavbarActions 
            onOpenAuthModal={onOpenAuthModal}
            onLogout={onLogout}
            showDemoMenu={showDemoMenu}
          />
        </div>
      </nav>
    </header>
  )
}