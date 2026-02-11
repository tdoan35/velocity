import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import type { DataModel } from '@/types/design-phases'

interface DataModelSummaryCardProps {
  dataModel: DataModel
  onEdit?: () => void
}

export function DataModelSummaryCard({ dataModel, onEdit }: DataModelSummaryCardProps) {
  return (
    <Card className="border-gray-200 dark:border-gray-700 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Data Model
          </CardTitle>
          {onEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Entities ({dataModel.entities?.length ?? 0})
          </span>
          <div className="flex flex-wrap gap-2 mt-2">
            {(dataModel.entities ?? []).map((entity) => (
              <span
                key={entity.name}
                className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium"
              >
                {entity.name}
                <span className="ml-1.5 text-blue-400 dark:text-blue-500 text-xs">
                  {entity.fields?.length ?? 0}f
                </span>
              </span>
            ))}
          </div>
        </div>
        {(dataModel.relationships?.length ?? 0) > 0 && (
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Relationships ({dataModel.relationships.length})
            </span>
            <ul className="mt-2 space-y-1">
              {dataModel.relationships.map((rel, i) => (
                <li key={i} className="text-sm text-gray-600 dark:text-gray-400">
                  {rel.from} &rarr; {rel.to}
                  <span className="text-gray-400 dark:text-gray-500 ml-1">({rel.type})</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
