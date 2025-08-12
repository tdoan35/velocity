import React, { useCallback, useState, createContext, useContext } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  GripVertical, 
  ChevronDown, 
  ChevronRight, 
  MoreVertical,
  Trash2,
  Copy,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import type { AgentType } from '@/services/prdService'

export type SectionType = 
  | 'overview' 
  | 'core_features' 
  | 'additional_features'
  | 'ui_design_patterns'
  | 'ux_flows'
  | 'technical_architecture'
  | 'tech_integrations'
  | 'custom'

export interface SectionBlockProps {
  id: string
  type: SectionType
  title: string
  content: any
  ownership: AgentType | 'human' | 'shared'
  isRequired: boolean
  isExpanded?: boolean
  isEditable?: boolean
  isVisible?: boolean
  order: number
  status?: 'pending' | 'in_progress' | 'completed'
  validationErrors?: string[]
  onUpdate: (id: string, content: any) => void
  onDelete?: (id: string) => void
  onDuplicate?: (id: string) => void
  onToggleVisibility?: (id: string) => void
  onToggleExpanded?: (id: string) => void
  onDragStart?: (e: React.DragEvent, id: string) => void
  onDragEnd?: (e: React.DragEvent) => void
  onDragOver?: (e: React.DragEvent) => void
  onDrop?: (e: React.DragEvent, id: string) => void
  children?: React.ReactNode
  className?: string
}

// Context for managing section state
interface SectionContextValue {
  sectionId: string
  sectionType: SectionType
  isEditable: boolean
  ownership: AgentType | 'human' | 'shared'
  updateContent: (content: any) => void
}

const SectionContext = createContext<SectionContextValue | null>(null)

export const useSectionContext = () => {
  const context = useContext(SectionContext)
  if (!context) {
    throw new Error('useSectionContext must be used within a SectionBlock')
  }
  return context
}

export function SectionBlock({
  id,
  type,
  title,
  content,
  ownership,
  isRequired,
  isExpanded = true,
  isEditable = true,
  isVisible = true,
  order,
  status = 'pending',
  validationErrors = [],
  onUpdate,
  onDelete,
  onDuplicate,
  onToggleVisibility,
  onToggleExpanded,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  children,
  className
}: SectionBlockProps) {
  const [isLocalExpanded, setIsLocalExpanded] = useState(isExpanded)
  const [isDragging, setIsDragging] = useState(false)
  const [showBlockMenu, setShowBlockMenu] = useState(false)

  const handleToggleExpanded = useCallback(() => {
    const newState = !isLocalExpanded
    setIsLocalExpanded(newState)
    onToggleExpanded?.(id)
  }, [isLocalExpanded, id, onToggleExpanded])

  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('application/x-prd-section', JSON.stringify({ id, order }))
    onDragStart?.(e, id)
  }, [id, order, onDragStart])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    setIsDragging(false)
    onDragEnd?.(e)
  }, [onDragEnd])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    onDragOver?.(e)
  }, [onDragOver])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    onDrop?.(e, id)
  }, [id, onDrop])

  const getOwnershipBadge = () => {
    const badges: Record<string, { label: string; variant: any }> = {
      project_manager: { label: 'PM', variant: 'default' },
      design_assistant: { label: 'Design', variant: 'secondary' },
      engineering_assistant: { label: 'Eng', variant: 'outline' },
      config_helper: { label: 'Config', variant: 'outline' },
      human: { label: 'You', variant: 'default' },
      shared: { label: 'Shared', variant: 'secondary' }
    }
    return badges[ownership] || { label: 'Unknown', variant: 'outline' }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'completed': return 'text-green-500'
      case 'in_progress': return 'text-yellow-500'
      default: return 'text-gray-400'
    }
  }

  const contextValue: SectionContextValue = {
    sectionId: id,
    sectionType: type,
    isEditable: isEditable && (ownership === 'human' || ownership === 'shared'),
    ownership,
    updateContent: (newContent) => onUpdate(id, newContent)
  }

  if (!isVisible) return null

  return (
    <SectionContext.Provider value={contextValue}>
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.2 }}
        className={cn('relative group', className)}
        data-section-id={id}
        data-section-type={type}
        data-section-order={order}
      >
        <Card className={cn(
          'overflow-hidden transition-all duration-200',
          isDragging && 'cursor-move opacity-50',
          validationErrors.length > 0 && 'border-red-500'
        )}>
          {/* Section Header */}
          <div
            className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
            onClick={handleToggleExpanded}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
          >
            <div className="flex items-center gap-3">
              {/* Drag Handle */}
              <div
                className="opacity-0 group-hover:opacity-100 transition-opacity cursor-move"
                draggable
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={(e) => e.stopPropagation()}
              >
                <GripVertical className="w-5 h-5 text-gray-400" />
              </div>

              {/* Expand/Collapse Icon */}
              <button 
                className="p-1"
                onClick={(e) => {
                  e.stopPropagation()
                  handleToggleExpanded()
                }}
              >
                {isLocalExpanded ? 
                  <ChevronDown className="w-4 h-4" /> : 
                  <ChevronRight className="w-4 h-4" />
                }
              </button>

              {/* Title and Status */}
              <h3 className="text-lg font-semibold">{title}</h3>
              
              {/* Badges */}
              <div className="flex items-center gap-2">
                {isRequired && (
                  <Badge variant="default" className="text-xs">
                    Required
                  </Badge>
                )}
                {getOwnershipBadge() && (
                  <Badge variant={getOwnershipBadge().variant as any} className="text-xs">
                    {getOwnershipBadge().label}
                  </Badge>
                )}
                <span className={cn('text-sm', getStatusColor())}>
                  {status === 'completed' && '✓'}
                  {status === 'in_progress' && '◐'}
                  {status === 'pending' && '○'}
                </span>
              </div>

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="flex items-center gap-1 text-red-500">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs">{validationErrors.length} issues</span>
                </div>
              )}
            </div>

            {/* Actions Menu */}
            <div className="flex items-center gap-2">
              <DropdownMenu open={showBlockMenu} onOpenChange={setShowBlockMenu}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowBlockMenu(!showBlockMenu)
                    }}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {onDuplicate && (
                    <DropdownMenuItem onClick={() => onDuplicate(id)}>
                      <Copy className="w-4 h-4 mr-2" />
                      Duplicate
                    </DropdownMenuItem>
                  )}
                  {onToggleVisibility && (
                    <DropdownMenuItem onClick={() => onToggleVisibility(id)}>
                      {isVisible ? (
                        <>
                          <EyeOff className="w-4 h-4 mr-2" />
                          Hide
                        </>
                      ) : (
                        <>
                          <Eye className="w-4 h-4 mr-2" />
                          Show
                        </>
                      )}
                    </DropdownMenuItem>
                  )}
                  {ownership === 'human' && (
                    <DropdownMenuItem>
                      <Lock className="w-4 h-4 mr-2" />
                      Lock Section
                    </DropdownMenuItem>
                  )}
                  {ownership !== 'human' && ownership !== 'shared' && (
                    <DropdownMenuItem disabled>
                      <Unlock className="w-4 h-4 mr-2" />
                      Request Edit Access
                    </DropdownMenuItem>
                  )}
                  {onDelete && !isRequired && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => onDelete(id)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Section Content */}
          <AnimatePresence>
            {isLocalExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-gray-200 dark:border-gray-700"
              >
                <div 
                  className="p-4"
                  data-field="content"
                >
                  {/* Validation Errors Display */}
                  {validationErrors.length > 0 && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-red-800 dark:text-red-200">
                            Validation Issues:
                          </p>
                          <ul className="text-xs text-red-700 dark:text-red-300 space-y-0.5">
                            {validationErrors.map((error, index) => (
                              <li key={index}>• {error}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Render children (specific editor components) */}
                  {children}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>
    </SectionContext.Provider>
  )
}