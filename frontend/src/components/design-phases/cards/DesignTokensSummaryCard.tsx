import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import type { DesignSystem } from '@/types/design-phases'

interface DesignTokensSummaryCardProps {
  designSystem: DesignSystem
  onEdit?: () => void
}

export function DesignTokensSummaryCard({ designSystem, onEdit }: DesignTokensSummaryCardProps) {
  const colorKeys = ['primary', 'secondary', 'neutral', 'accent'] as const

  return (
    <Card className="border-gray-200 dark:border-gray-700 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Design Tokens
          </CardTitle>
          {onEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Color Swatches */}
        <div>
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Colors
          </span>
          <div className="flex gap-3 mt-2">
            {colorKeys.map((key) => {
              const color = designSystem.colors?.[key]
              if (!color) return null
              return (
                <div key={key} className="flex flex-col items-center gap-1">
                  <div
                    className="w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm"
                    style={{ backgroundColor: color.value }}
                    title={`${color.name}: ${color.value}`}
                  />
                  <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">{key}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Typography */}
        <div>
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Typography
          </span>
          <div className="mt-2 space-y-1">
            {(['heading', 'body', 'mono'] as const).map((category) => {
              const font = designSystem.typography?.[category]
              if (!font) return null
              return (
                <div key={category} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400 capitalize">{category}</span>
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{font.family}</span>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
