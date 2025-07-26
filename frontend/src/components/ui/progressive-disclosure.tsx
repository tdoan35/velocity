import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface ProgressiveDisclosureProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  icon?: React.ReactNode
  description?: string
  className?: string
}

export function ProgressiveDisclosure({
  title,
  children,
  defaultOpen = false,
  icon,
  description,
  className
}: ProgressiveDisclosureProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={cn('rounded-lg border', className)}>
      <Button
        variant="ghost"
        className="w-full justify-between p-4 hover:bg-transparent"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2 text-left">
          {icon || (isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />)}
          <div>
            <h3 className="font-medium">{title}</h3>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {!icon && (
          <span className="text-xs text-muted-foreground">
            {isOpen ? 'Hide' : 'Show'}
          </span>
        )}
      </Button>
      
      {isOpen && (
        <div className="border-t px-4 pb-4 pt-2">
          {children}
        </div>
      )}
    </div>
  )
}

interface ProgressiveDisclosureGroupProps {
  children: React.ReactNode
  allowMultiple?: boolean
}

export function ProgressiveDisclosureGroup({ 
  children
}: ProgressiveDisclosureGroupProps) {
  return (
    <div className="space-y-2">
      {children}
    </div>
  )
}