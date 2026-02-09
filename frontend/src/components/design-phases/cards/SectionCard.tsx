/**
 * SectionCard Component
 * Card component for displaying section summary with inline actions
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Pencil, ClipboardCheck, Database, Sparkles, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DesignSection } from '@/types/design-phases'

interface SectionCardProps {
  section: DesignSection
  onEdit: () => void
  onDefineSpec: () => void
  onGenerateSampleData: () => void
  isSaving?: boolean
}

export function SectionCard({ section, onEdit, onDefineSpec, onGenerateSampleData, isSaving }: SectionCardProps) {
  const hasSpec = !!section.spec
  const hasSampleData = !!section.sample_data
  const [specOpen, setSpecOpen] = useState(false)
  const [dataOpen, setDataOpen] = useState(false)

  return (
    <Card className="border-gray-200 dark:border-gray-700 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="shrink-0 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium flex items-center justify-center">
              {section.order_index}
            </span>
            <CardTitle className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              {section.title}
            </CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 flex-shrink-0" onClick={onEdit}>
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {section.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
            {section.description}
          </p>
        )}

        {/* AI action buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onDefineSpec}
            disabled={hasSpec || isSaving}
            className="text-xs"
          >
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Define Spec
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerateSampleData}
            disabled={!hasSpec || isSaving}
            className="text-xs"
          >
            <Database className="w-3.5 h-3.5 mr-1.5" />
            Generate Sample Data
          </Button>
        </div>

        {/* Inline spec preview */}
        {hasSpec && section.spec && (
          <div>
            <button
              onClick={() => setSpecOpen(!specOpen)}
              className="flex items-center justify-between w-full py-1.5 cursor-pointer"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <ClipboardCheck className="w-3.5 h-3.5" />
                Spec
              </span>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200',
                  specOpen && 'rotate-180'
                )}
                strokeWidth={1.5}
              />
            </button>
            <AnimatePresence initial={false}>
              {specOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="pt-1.5 pb-1 space-y-2 text-sm">
                    {section.spec.overview && (
                      <p className="text-gray-600 dark:text-gray-400">{section.spec.overview}</p>
                    )}
                    {section.spec.keyFeatures?.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Key Features
                        </span>
                        <ul className="mt-1 space-y-0.5 ml-1">
                          {section.spec.keyFeatures.map((f, i) => (
                            <li key={i} className="flex items-start gap-2 text-gray-600 dark:text-gray-400">
                              <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 mt-2 shrink-0" />
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {section.spec.requirements?.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Requirements
                        </span>
                        <ul className="mt-1 space-y-0.5 ml-1">
                          {section.spec.requirements.map((r, i) => (
                            <li key={i} className="flex items-start gap-2 text-gray-600 dark:text-gray-400">
                              <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 mt-2 shrink-0" />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {section.spec.acceptance?.length > 0 && (
                      <div>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                          Acceptance Criteria
                        </span>
                        <ul className="mt-1 space-y-0.5 ml-1">
                          {section.spec.acceptance.map((a, i) => (
                            <li key={i} className="flex items-start gap-2 text-gray-600 dark:text-gray-400">
                              <span className="w-1 h-1 rounded-full bg-gray-400 dark:bg-gray-500 mt-2 shrink-0" />
                              {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Inline sample data preview */}
        {hasSampleData && section.sample_data && (
          <div>
            <button
              onClick={() => setDataOpen(!dataOpen)}
              className="flex items-center justify-between w-full py-1.5 cursor-pointer"
            >
              <span className="flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400">
                <Database className="w-3.5 h-3.5" />
                Sample Data
                <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">
                  ({Object.keys(section.sample_data).length} {Object.keys(section.sample_data).length === 1 ? 'key' : 'keys'})
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200',
                  dataOpen && 'rotate-180'
                )}
                strokeWidth={1.5}
              />
            </button>
            <AnimatePresence initial={false}>
              {dataOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <pre className="pt-1.5 pb-1 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50 rounded-md p-2 overflow-x-auto max-h-48 overflow-y-auto">
                    {JSON.stringify(section.sample_data, null, 2)}
                  </pre>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Status indicators */}
        {(!hasSpec || !hasSampleData) && (
          <div className="flex items-center justify-end gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    <ClipboardCheck className={cn(
                      'w-4 h-4',
                      hasSpec
                        ? 'text-emerald-500 dark:text-emerald-400'
                        : 'text-gray-300 dark:text-gray-600'
                    )} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{hasSpec ? 'Spec defined' : 'No spec yet'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center">
                    <Database className={cn(
                      'w-4 h-4',
                      hasSampleData
                        ? 'text-blue-500 dark:text-blue-400'
                        : 'text-gray-300 dark:text-gray-600'
                    )} />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{hasSampleData ? 'Sample data generated' : 'No sample data yet'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
