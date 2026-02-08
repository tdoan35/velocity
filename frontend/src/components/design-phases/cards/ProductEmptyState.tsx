import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileText, Map, MessageSquare } from 'lucide-react'

type EmptyStateType = 'overview' | 'roadmap'

interface ProductEmptyStateProps {
  type: EmptyStateType
  onGoToChat?: () => void
  disabled?: boolean
}

const config: Record<EmptyStateType, {
  icon: typeof FileText
  title: string
  description: string
  buttonLabel: string
}> = {
  overview: {
    icon: FileText,
    title: 'No product defined yet',
    description: 'Use the AI chat to define your product vision, key problems, and features.',
    buttonLabel: 'Define your Product',
  },
  roadmap: {
    icon: Map,
    title: 'No roadmap defined yet',
    description: 'Use the AI chat to break down your product into development sections.',
    buttonLabel: 'Define your Roadmap',
  },
}

export function ProductEmptyState({ type, onGoToChat, disabled }: ProductEmptyStateProps) {
  const { icon: Icon, title, description, buttonLabel } = config[type]

  return (
    <Card className="border-gray-200 dark:border-gray-700 shadow-sm border-dashed">
      <CardContent className="py-8">
        <div className="flex flex-col items-center text-center max-w-sm mx-auto">
          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
            <Icon className="w-5 h-5 text-gray-400 dark:text-gray-500" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-medium text-gray-600 dark:text-gray-400 mb-1">
            {title}
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            {description}
          </p>
          {onGoToChat && (
            <Button variant="outline" size="sm" onClick={onGoToChat} disabled={disabled}>
              <MessageSquare className="w-4 h-4 mr-2" />
              {buttonLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
