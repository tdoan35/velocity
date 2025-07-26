import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Send, Command, Paperclip, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ChatInputProps {
  onSubmit: (message: string) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  fileContext?: {
    fileName: string
    onRemove: () => void
  }
}

const COMMAND_SUGGESTIONS = [
  { command: '/help', description: 'Show available commands' },
  { command: '/explain', description: 'Explain the current code' },
  { command: '/refactor', description: 'Suggest code improvements' },
  { command: '/debug', description: 'Help debug an issue' },
  { command: '/test', description: 'Generate test cases' },
  { command: '/docs', description: 'Generate documentation' },
]

export const ChatInput = forwardRef<HTMLTextAreaElement, ChatInputProps>(({ 
  onSubmit, 
  disabled = false,
  placeholder = 'Ask me anything...',
  className,
  fileContext
}, ref) => {
  const [message, setMessage] = useState('')
  const [showCommands, setShowCommands] = useState(false)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  
  useImperativeHandle(ref, () => textareaRef.current!)
  
  const filteredCommands = COMMAND_SUGGESTIONS.filter(cmd => 
    message.startsWith('/') && cmd.command.startsWith(message)
  )
  
  useEffect(() => {
    setShowCommands(filteredCommands.length > 0 && message.length > 1)
    setSelectedCommandIndex(0)
  }, [message])
  
  const handleSubmit = () => {
    if (message.trim() && !disabled) {
      onSubmit(message.trim())
      setMessage('')
      setShowCommands(false)
    }
  }
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
    
    if (showCommands) {
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
      } else if (e.key === 'Tab' || (e.key === 'Enter' && showCommands)) {
        e.preventDefault()
        const selectedCommand = filteredCommands[selectedCommandIndex]
        if (selectedCommand) {
          setMessage(selectedCommand.command + ' ')
          setShowCommands(false)
        }
      } else if (e.key === 'Escape') {
        setShowCommands(false)
      }
    }
  }
  
  return (
    <div className={cn('relative', className)}>
      {/* Command suggestions */}
      {showCommands && (
        <Card className="absolute bottom-full mb-2 w-full p-2 shadow-lg">
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
                  setShowCommands(false)
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
      
      {/* Input area */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-[60px] max-h-[200px] resize-none pr-12"
          />
          <Button
            size="icon"
            variant="ghost"
            className="absolute bottom-2 right-2 h-8 w-8"
            onClick={() => setMessage('/')}
            disabled={disabled}
          >
            <Command className="h-4 w-4" />
          </Button>
        </div>
        
        <Button
          onClick={handleSubmit}
          disabled={disabled || !message.trim()}
          className="self-end"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Helper text */}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>Press / for commands, Shift+Enter for new line</span>
        {message.length > 0 && (
          <span>{message.length} / 4000</span>
        )}
      </div>
    </div>
  )
})

ChatInput.displayName = 'ChatInput'