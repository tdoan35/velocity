import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import type { ShellSpec } from '@/types/design-phases'

interface ShellSpecSummaryCardProps {
  shellSpec: ShellSpec
  onEdit?: () => void
}

export function ShellSpecSummaryCard({ shellSpec, onEdit }: ShellSpecSummaryCardProps) {
  return (
    <Card className="border-gray-200 dark:border-gray-700 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Application Shell
          </CardTitle>
          {onEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Layout Pattern */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">Layout:</span>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-sm font-medium">
            {shellSpec.layoutPattern}
          </span>
        </div>

        {/* Navigation Items */}
        {shellSpec.navigationItems.length > 0 && (
          <div>
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Navigation ({shellSpec.navigationItems.length})
            </span>
            <ul className="mt-2 space-y-1.5">
              {shellSpec.navigationItems.map((item, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 dark:text-gray-500 w-4 text-center">{i + 1}</span>
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{item.label}</span>
                  <span className="text-gray-400 dark:text-gray-500">{item.route}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Overview */}
        {shellSpec.overview && (
          <p className="text-sm text-gray-500 dark:text-gray-400 pt-1">
            {shellSpec.overview}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
