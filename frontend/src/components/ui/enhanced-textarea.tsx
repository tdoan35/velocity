import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Textarea } from './textarea'
import { Button } from './button'
import { MovingBorderWrapper } from './moving-border'
import { Card } from './card'
import { Paperclip, Sparkles, Command, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CommandSuggestion {
  command: string
  description: string
}

interface EnhancedTextareaProps {
  value?: string
  onChange?: (value: string) => void
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
  commandSuggestions?: CommandSuggestion[]
  showCommands?: boolean
  fileContext?: {
    fileName: string
    onRemove: () => void
  }
  showHelperText?: boolean
  maxLength?: number
}

const DEFAULT_COMMAND_SUGGESTIONS: CommandSuggestion[] = [
  { command: '/help', description: 'Show available commands' },
  { command: '/explain', description: 'Explain the current code' },
  { command: '/refactor', description: 'Suggest code improvements' },
  { command: '/debug', description: 'Help debug an issue' },
  { command: '/test', description: 'Generate test cases' },
  { command: '/docs', description: 'Generate documentation' },
]

export const EnhancedTextarea = forwardRef<HTMLTextAreaElement, EnhancedTextareaProps>(({
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
  commandSuggestions = DEFAULT_COMMAND_SUGGESTIONS,
  showCommands: enableCommands = true,
  fileContext,
  showHelperText = false,
  maxLength = 4000,
}, ref) => {
  const [localValue, setLocalValue] = useState('')
  const [showCommandMenu, setShowCommandMenu] = useState(false)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  useImperativeHandle(ref, () => textareaRef.current!)
  
  // Use controlled or uncontrolled mode
  const message = value !== undefined ? value : localValue
  const setMessage = (newValue: string) => {
    if (onChange) {
      onChange(newValue)
    } else {
      setLocalValue(newValue)
    }
  }
  
  const filteredCommands = enableCommands ? commandSuggestions.filter(cmd => 
    message.startsWith('/') && cmd.command.startsWith(message)
  ) : []
  
  useEffect(() => {
    if (enableCommands && message.startsWith('/') && message.length > 0) {
      const hasMatches = commandSuggestions.some(cmd => cmd.command.startsWith(message))
      setShowCommandMenu(hasMatches)
      setSelectedCommandIndex(0)
    } else {
      setShowCommandMenu(false)
    }
  }, [message, enableCommands, commandSuggestions])
  
  const handleSubmit = () => {
    if (message.trim() && !disabled && !isLoading) {
      onSubmit()
      if (!value) {
        setLocalValue('')
      }
      setShowCommandMenu(false)
    }
  }
  
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Enter (without shift) or Ctrl/Cmd+Enter
    if (e.key === 'Enter' && (!e.shiftKey || (e.ctrlKey || e.metaKey))) {
      e.preventDefault()
      handleSubmit()
      return
    }
    
    // Command menu navigation
    if (showCommandMenu) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedCommandIndex(prev => 
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        )
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedCommandIndex(prev => 
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        )
      } else if (e.key === 'Tab' || (e.key === 'Enter' && showCommandMenu)) {
        e.preventDefault()
        const selectedCommand = filteredCommands[selectedCommandIndex]
        if (selectedCommand) {
          setMessage(selectedCommand.command + ' ')
          setShowCommandMenu(false)
        }
      } else if (e.key === 'Escape') {
        setShowCommandMenu(false)
      }
    }
  }

  return (
    <div className={cn("relative", className)}>
      {/* Command suggestions */}
      {showCommandMenu && filteredCommands.length > 0 && (
        <Card className="absolute bottom-full left-0 right-0 mb-2 p-2 shadow-lg z-[100] bg-popover border">
          <div className="space-y-1">
            {filteredCommands.map((cmd, index) => (
              <button
                key={cmd.command}
                className={cn(
                  'flex items-center justify-between w-full px-3 py-2 text-sm rounded-md transition-colors',
                  index === selectedCommandIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
                onClick={() => {
                  setMessage(cmd.command + ' ')
                  setShowCommandMenu(false)
                  textareaRef.current?.focus()
                }}
              >
                <span className="font-mono">{cmd.command}</span>
                <span className="text-xs text-muted-foreground">
                  {cmd.description}
                </span>
              </button>
            ))}
          </div>
        </Card>
      )}
      
      {/* File context indicator */}
      {fileContext && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-2 px-3 py-1 bg-muted rounded-md text-sm">
            <Paperclip className="h-3 w-3" />
            <span className="text-muted-foreground">Context:</span>
            <span className="font-medium">{fileContext.fileName}</span>
            <button
              onClick={fileContext.onRemove}
              className="ml-1 hover:text-destructive"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}
      
      <MovingBorderWrapper
        borderRadius="0.5rem"
        duration={4000}
        containerClassName="relative"
      >
        <div className="relative w-full">
          <Textarea
            ref={textareaRef}
            placeholder={placeholder}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className={cn(
              "w-full p-4 resize-none border-0 bg-background/50 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 focus-visible:ring-offset-0",
              showAttachButton ? "pl-12" : "",
              enableCommands ? "pr-20" : "pr-12",
              textareaClassName
            )}
            style={{ minHeight }}
            disabled={disabled || isLoading}
            maxLength={maxLength}
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
          
          {enableCommands && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute bottom-4 right-12 h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => setMessage('/')}
              disabled={disabled || isLoading}
              aria-label="Show commands"
            >
              <Command className="w-4 h-4" />
            </Button>
          )}
          
          <Button
            onClick={handleSubmit}
            disabled={!message.trim() || disabled || isLoading}
            className="absolute bottom-4 right-4 h-8 w-8 p-0 bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            size="icon"
            title={submitButtonTooltip || (isLoading ? "Loading..." : "Send message")}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <SubmitIcon className="w-4 h-4" />
            )}
          </Button>
        </div>
      </MovingBorderWrapper>
      
      {/* Helper text */}
      {showHelperText && (
        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>Press / for commands, Shift+Enter for new line</span>
          {message.length > 0 && (
            <span>{message.length} / {maxLength}</span>
          )}
        </div>
      )}
    </div>
  )
})

EnhancedTextarea.displayName = 'EnhancedTextarea'