import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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

const categoryStyles = {
  continuation: 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:hover:bg-blue-900 dark:text-blue-300 dark:border-blue-800',
  clarification: 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:hover:bg-purple-900 dark:text-purple-300 dark:border-purple-800',
  example: 'bg-green-50 hover:bg-green-100 text-green-700 border-green-200 dark:bg-green-950 dark:hover:bg-green-900 dark:text-green-300 dark:border-green-800',
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
    <div className={cn('w-full', className)}>
      <div className="flex gap-1.5 justify-end flex-nowrap min-w-0">
        {suggestions.map((suggestion, index) => {
          return (
            <Button
              key={index}
              variant="outline"
              size="sm"
              className={cn(
                'h-auto py-1 px-2.5 rounded-full min-w-0 max-w-full',
                'transition-all duration-200 hover:scale-[1.02]',
                'border',
                categoryStyles[suggestion.category],
                disabled && 'opacity-50 cursor-not-allowed'
              )}
              style={{
                flex: `0 1 auto`, // Allow shrinking but not growing
              }}
              onClick={() => !disabled && onSelectSuggestion(suggestion)}
              disabled={disabled || isLoading}
              title={suggestion.text} // Show full text on hover
            >
              <span className="text-xs whitespace-nowrap overflow-hidden text-ellipsis block min-w-0">
                {suggestion.text}
              </span>
            </Button>
          )
        })}
      </div>
    </div>
  )
}