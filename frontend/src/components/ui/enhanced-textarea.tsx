import React from 'react'
import { Textarea } from './textarea'
import { Button } from './button'
import { MovingBorderWrapper } from './moving-border'
import { Paperclip, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EnhancedTextareaProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  disabled?: boolean
  isLoading?: boolean
  onAttach?: () => void
  submitIcon?: React.ElementType
  className?: string
  textareaClassName?: string
  minHeight?: string
  showAttachButton?: boolean
  submitButtonTooltip?: string
}

export function EnhancedTextarea({
  value,
  onChange,
  onSubmit,
  placeholder = "Type your message...",
  disabled = false,
  isLoading = false,
  onAttach,
  submitIcon: SubmitIcon = Sparkles,
  className,
  textareaClassName,
  minHeight = "120px",
  showAttachButton = true,
  submitButtonTooltip,
}: EnhancedTextareaProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <MovingBorderWrapper
      borderRadius="0.5rem"
      duration={4000}
      containerClassName={cn("relative", className)}
    >
      <div className="relative w-full">
        <Textarea
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={cn(
            "w-full p-4 resize-none border-0 bg-background/50 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-0",
            textareaClassName
          )}
          style={{ minHeight }}
          disabled={disabled || isLoading}
        />
        
        {showAttachButton && onAttach && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute bottom-4 left-4 h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onAttach}
            disabled={disabled || isLoading}
            aria-label="Attach file"
          >
            <Paperclip className="w-4 h-4" />
          </Button>
        )}
        
        <Button
          onClick={onSubmit}
          disabled={!value.trim() || disabled || isLoading}
          className="absolute bottom-4 right-4 h-8 w-8 p-0 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          size="icon"
          title={submitButtonTooltip}
        >
          {isLoading ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <SubmitIcon className="w-4 h-4" />
          )}
        </Button>
      </div>
    </MovingBorderWrapper>
  )
}