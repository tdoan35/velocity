import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CollapsiblePanelProps {
  children: React.ReactNode
  side?: 'left' | 'right'
  defaultCollapsed?: boolean
  collapsedWidth?: string
  expandedWidth?: string
  className?: string
  onCollapsedChange?: (collapsed: boolean) => void
}

export function CollapsiblePanel({
  children,
  side = 'left',
  defaultCollapsed = false,
  collapsedWidth = 'w-12',
  expandedWidth = 'w-64',
  className,
  onCollapsedChange
}: CollapsiblePanelProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)

  const handleToggle = () => {
    const newState = !collapsed
    setCollapsed(newState)
    onCollapsedChange?.(newState)
  }

  return (
    <div 
      className={cn(
        'relative transition-all duration-300 ease-in-out',
        collapsed ? collapsedWidth : expandedWidth,
        className
      )}
    >
      <div className={cn(
        'h-full overflow-hidden',
        collapsed && 'opacity-0'
      )}>
        {children}
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        className={cn(
          'absolute top-2 z-10 h-6 w-6',
          side === 'left' ? '-right-3' : '-left-3'
        )}
        onClick={handleToggle}
      >
        {side === 'left' ? (
          collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />
        ) : (
          collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}