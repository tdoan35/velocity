import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Sparkles, MessageSquare, Lightbulb } from 'lucide-react'

export interface SuggestedResponse {
  text: string
  category: 'continuation' | 'clarification' | 'example'
  section?: string
}

interface SuggestedResponsesProps {
  suggestions: SuggestedResponse[]
  onSelectSuggestion: (suggestion: SuggestedResponse) => void
  className?: string
  disabled?: boolean
  isLoading?: boolean
}

const categoryIcons = {
  continuation: MessageSquare,
  clarification: Lightbulb,
  example: Sparkles,
}

const categoryStyles = {
  continuation: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200',
  clarification: 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200',
  example: 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200',
}

export function SuggestedResponses({
  suggestions,
  onSelectSuggestion,
  className,
  disabled = false,
  isLoading = false,
}: SuggestedResponsesProps) {
  if (!suggestions || suggestions.length === 0) {
    return null
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        <span>Suggested responses:</span>
      </div>
      <div className="flex flex-col gap-2">
        {suggestions.map((suggestion, index) => {
          const Icon = categoryIcons[suggestion.category] || MessageSquare
          
          return (
            <Button
              key={index}
              variant="outline"
              size="sm"
              className={cn(
                'justify-start text-left h-auto py-3 px-4 whitespace-normal',
                'transition-all duration-200 hover:scale-[1.02]',
                categoryStyles[suggestion.category],
                disabled && 'opacity-50 cursor-not-allowed'
              )}
              onClick={() => !disabled && onSelectSuggestion(suggestion)}
              disabled={disabled || isLoading}
            >
              <Icon className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="text-sm leading-relaxed">{suggestion.text}</span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}