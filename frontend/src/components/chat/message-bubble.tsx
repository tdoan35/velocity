import { User, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '@/types/chat'
import { format } from 'date-fns'

interface MessageBubbleProps {
  message: ChatMessage
  className?: string
}

export function MessageBubble({ message, className }: MessageBubbleProps) {
  const isUser = message.role === 'user'
  const isError = message.metadata?.error
  
  return (
    <div
      className={cn(
        'flex gap-3',
        isUser ? 'justify-end' : 'justify-start',
        className
      )}
    >
      {!isUser && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
        </div>
      )}
      
      <div
        className={cn(
          'max-w-[70%] space-y-2',
          isUser ? 'items-end' : 'items-start'
        )}
      >
        <div
          className={cn(
            'rounded-lg px-4 py-2',
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted',
            isError && 'bg-destructive/10 text-destructive'
          )}
        >
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        
        <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
          <span>{format(message.timestamp, 'HH:mm')}</span>
          {message.metadata?.fileContext && (
            <>
              <span>•</span>
              <span className="truncate max-w-[150px]">
                {message.metadata.fileContext.filePath}
              </span>
            </>
          )}
        </div>
      </div>
      
      {isUser && (
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <User className="w-5 h-5 text-primary-foreground" />
          </div>
        </div>
      )}
    </div>
  )
}