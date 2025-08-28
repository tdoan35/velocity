import React from 'react'
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
  const buttonWidthPercent = 100 / options.length
  
  // Calculate left and right positions for any number of buttons
  const leftPercent = activeIndex * buttonWidthPercent
  const rightPercent = (options.length - activeIndex - 1) * buttonWidthPercent
  
  const sizeClasses = {
    sm: 'h-7 px-3 text-xs',
    default: 'h-9 px-4 text-sm',
    lg: 'h-11 px-8 text-base'
  }

  return (
    <div className={cn("relative bg-muted rounded-lg p-1 flex gap-1", className)}>
      {/* Sliding background indicator */}
      <div 
        className={cn(
          "absolute top-1 bottom-1 bg-background rounded-md shadow-sm transition-all duration-200 ease-out",
          variant === 'outline' && "border border-border"
        )}
        style={{
          left: activeIndex === 0 ? '4px' : `${leftPercent}%`,
          right: activeIndex === options.length - 1 ? '4px' : `${rightPercent}%`
        }}
      />
      
      {/* Buttons */}
      {options.map((option, index) => (
        <Button
          key={option.value}
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