import React, { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '../ui/dropdown-menu'
import { 
  Menu, 
  X, 
  Home, 
  Palette, 
  Database, 
  Layout, 
  Code2, 
  FolderOpen, 
  MessageSquare, 
  Zap, 
  Smartphone,
  Monitor,
  Edit3,
  Layers3
} from 'lucide-react'

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

// Component test demos
const componentTestItems = [
  { path: '/demo/preview-test', label: 'Preview Panel Test', icon: Monitor },
  { path: '/demo/editor-test', label: 'Editor Container Test', icon: Edit3 },
  { path: '/demo/project-editor-test', label: 'Project Editor Test', icon: Layers3 },
]

export function NavbarMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const location = useLocation()
  
  // Close menu when route changes
  useEffect(() => {
    setIsOpen(false)
  }, [location])

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative hover:bg-background/20 [&_svg]:drop-shadow-sm h-8 w-8"
          aria-label="Open navigation menu"
        >
          <Menu className={`h-4 w-4 transition-all ${isOpen ? 'rotate-90 opacity-0' : ''}`} />
          <X className={`h-4 w-4 absolute transition-all ${isOpen ? 'rotate-0 opacity-100' : 'rotate-90 opacity-0'}`} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-background/95 backdrop-blur-md border-border/50">
        {/* Main Navigation */}
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
        
        <DropdownMenuSeparator />
        
        {/* Component Tests Section */}
        <div className="px-2 py-1.5">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Component Tests
          </span>
        </div>
        {componentTestItems.map(({ path, label, icon: Icon }) => (
          <DropdownMenuItem key={path} asChild>
            <Link 
              to={path} 
              className="flex items-center gap-3 cursor-pointer"
            >
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}