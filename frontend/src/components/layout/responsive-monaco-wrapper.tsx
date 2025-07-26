import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ResponsiveMonacoWrapperProps {
  children: React.ReactNode
  className?: string
  minHeight?: string
}

export function ResponsiveMonacoWrapper({ 
  children, 
  className,
  minHeight = '300px'
}: ResponsiveMonacoWrapperProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [, setDimensions] = useState({ width: 0, height: 0 })

  useEffect(() => {
    if (!containerRef.current) return

    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect()
        setDimensions({ width, height })
      }
    }

    updateDimensions()

    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  return (
    <div 
      ref={containerRef}
      className={cn(
        'relative w-full overflow-hidden rounded-md border',
        className
      )}
      style={{ minHeight }}
    >
      <div className="absolute inset-0">
        {children}
      </div>
      
      {/* Mobile overlay with instructions */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-4 text-center text-sm text-muted-foreground md:hidden">
        <p>Swipe horizontally to scroll code</p>
      </div>
    </div>
  )
}