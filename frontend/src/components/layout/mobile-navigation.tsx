import { Home, Code, FileText, Settings, Package } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const tabs = [
  { id: 'dashboard', label: 'Home', icon: Home },
  { id: 'editor', label: 'Editor', icon: Code },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'packages', label: 'Packages', icon: Package },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function MobileNavigation({ activeTab, onTabChange }: MobileNavigationProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/80 backdrop-blur-md md:hidden">
      <div className="flex h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors",
                isActive 
                  ? "text-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn(
                "h-5 w-5 transition-transform",
                isActive && "scale-110"
              )} />
              <span className="font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}