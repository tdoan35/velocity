import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Database, MessageSquare } from 'lucide-react'

interface DataModelEmptyStateProps {
  onDefineWithAI?: () => void
  disabled?: boolean
}

export function DataModelEmptyState({ onDefineWithAI, disabled }: DataModelEmptyStateProps) {
  return (
    <Card className="border-gray-200 dark:border-gray-700 shadow-sm border-dashed">
      <CardContent className="py-8">
        <div className="flex flex-col items-center text-center max-w-sm mx-auto">
          <div className="w-10 h-10 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
            <Database className="w-5 h-5 text-gray-400 dark:text-gray-500" strokeWidth={1.5} />
          </div>
          <h3 className="text-base font-medium text-gray-600 dark:text-gray-400 mb-1">
            No data model defined yet
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Use AI to define your app's entities, fields, and relationships.
          </p>
          {onDefineWithAI && (
            <Button variant="outline" size="sm" onClick={onDefineWithAI} disabled={disabled}>
              <MessageSquare className="w-4 h-4 mr-2" />
              Define with AI
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
