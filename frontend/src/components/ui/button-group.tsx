import React, { useRef, useEffect, useState } from 'react'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface ButtonGroupOption {
  value: string
  label: string
  icon?: React.ReactNode
  disabled?: boolean
}

interface ButtonGroupProps {
  options: ButtonGroupOption[]
  value: string
  onValueChange: (value: string) => void
  className?: string
  size?: 'sm' | 'default' | 'lg'
  variant?: 'default' | 'outline'
}

export function ButtonGroup({ 
  options, 
  value, 
  onValueChange, 
  className,
  size = 'sm',
  variant = 'default'
}: ButtonGroupProps) {
  const activeIndex = options.findIndex(option => option.value === value)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 })
  
  // Update indicator position based on actual button dimensions
  useEffect(() => {
    const updateIndicator = () => {
      if (!containerRef.current || activeIndex === -1) return
      
      const activeButton = buttonRefs.current[activeIndex]
      if (!activeButton) return
      
      const containerRect = containerRef.current.getBoundingClientRect()
      const buttonRect = activeButton.getBoundingClientRect()
      
      const left = buttonRect.left - containerRect.left
      const width = buttonRect.width
      
      setIndicatorStyle({ left, width })
    }
    
    updateIndicator()
    
    // Update on resize
    const resizeObserver = new ResizeObserver(updateIndicator)
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    return () => resizeObserver.disconnect()
  }, [activeIndex, options])
  
  // Initialize refs array
  useEffect(() => {
    buttonRefs.current = buttonRefs.current.slice(0, options.length)
  }, [options.length])
  
  const sizeClasses = {
    sm: 'h-7 px-3 text-xs',
    default: 'h-9 px-4 text-sm',
    lg: 'h-11 px-8 text-base'
  }

  return (
    <div ref={containerRef} className={cn("relative bg-muted rounded-lg p-1 flex gap-1", className)}>
      {/* Sliding background indicator */}
      <div 
        className={cn(
          "absolute top-1 bottom-1 bg-background rounded-md shadow-sm transition-all duration-200 ease-out",
          variant === 'outline' && "border border-border"
        )}
        style={{
          left: `${indicatorStyle.left}px`,
          width: `${indicatorStyle.width}px`
        }}
      />
      
      {/* Buttons */}
      {options.map((option, index) => (
        <Button
          key={option.value}
          ref={(el) => (buttonRefs.current[index] = el)}
          variant="ghost"
          size={size}
          disabled={option.disabled}
          onClick={() => !option.disabled && onValueChange(option.value)}
          className={cn(
            sizeClasses[size],
            "relative z-10 gap-1.5 rounded-md transition-colors duration-150 hover:bg-transparent flex-1",
            option.value === value 
              ? "text-foreground font-medium" 
              : "text-muted-foreground hover:text-foreground",
            option.disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          {option.icon}
          {option.label}
        </Button>
      ))}
    </div>
  )
}