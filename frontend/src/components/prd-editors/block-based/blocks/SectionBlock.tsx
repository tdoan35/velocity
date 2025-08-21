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
  AlertCircle,
  Asterisk
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
  hideCard?: boolean
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
  className,
  hideCard = false
}: SectionBlockProps) {
  const [isLocalExpanded, setIsLocalExpanded] = useState(isExpanded)
  const [showBlockMenu, setShowBlockMenu] = useState(false)
  
  // Legacy drag state removed - now handled by @dnd-kit
  const isDragging = false // Placeholder - will be handled by @dnd-kit

  const handleToggleExpanded = useCallback(() => {
    const newState = !isLocalExpanded
    setIsLocalExpanded(newState)
    onToggleExpanded?.(id)
  }, [isLocalExpanded, id, onToggleExpanded])

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.stopPropagation() // Prevent content drag interference
    
    // Visual feedback
    e.currentTarget.classList.add('dragging-section')
    
    // Call parent handler
    onDragStart?.(e, id)
  }, [id, onDragStart])

  const handleDragEnd = useCallback((e: React.DragEvent) => {
    // Clean up visual state
    e.currentTarget.classList.remove('dragging-section')
    
    // Call parent handler
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
    const badges: Record<string, { label: string; className: string }> = {
      project_manager: { label: 'Project Manager', className: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
      design_assistant: { label: 'Design Assistant', className: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
      engineering_assistant: { label: 'Engineering Assistant', className: 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
      config_helper: { label: 'Config Helper', className: 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-orange-200 dark:border-orange-800' },
      human: { label: 'You', className: 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-200 dark:border-gray-700' },
      shared: { label: 'Shared', className: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800' }
    }
    return badges[ownership] || { label: 'Unknown', className: 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400' }
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

  // Document-style rendering without card
  if (hideCard) {
    return (
      <SectionContext.Provider value={contextValue}>
        <motion.div
          layout
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          className={cn(
            'relative group',
            // Legacy drag type checks removed - now handled by @dnd-kit
            className
          )}
          data-section-id={id}
          data-section-type={type}
          data-section-order={order}
        >
          <div className={cn(
            'transition-all duration-200',
            isDragging && 'cursor-move opacity-60 transform rotate-1 z-50',
            // Legacy drag opacity removed
            validationErrors.length > 0 && 'border-l-4 border-red-500 pl-4'
          )}>
            {/* Section Header */}
            <div
              className="flex items-center justify-between py-3 cursor-pointer group/header"
              onClick={handleToggleExpanded}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="flex items-center gap-3">
                {/* Drag Handle */}
                <div
                  className={cn(
                    "opacity-0 group-hover:opacity-100 transition-opacity",
                    'cursor-move'
                  )}
                  draggable={true}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  onClick={(e) => e.stopPropagation()}
                  title='Drag to reorder section'
                >
                  <GripVertical className="h-5 w-5 text-gray-400" />
                </div>
                
                {/* Expand/Collapse Icon */}
                <div className="transition-transform duration-200">
                  {isLocalExpanded ? (
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-gray-500" />
                  )}
                </div>
                
                {/* Title - Larger h2 size */}
                <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                  {title}
                </h2>

                {/* Required icon */}
                {isRequired && (
                  <span title="Required">
                    <Asterisk className="h-4 w-4 text-red-500" aria-label="Required" />
                  </span>
                )}
              </div>
              
              {/* Right side badges */}
              <div className="flex items-center gap-2">
                
                {/* Agent Badge - styled like enhanced chat interface */}
                <span className={cn(
                  "px-2 py-1 text-xs font-medium rounded-md border",
                  getOwnershipBadge().className
                )}>
                  {getOwnershipBadge().label}
                </span>
              </div>
            </div>
            
            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="flex items-start gap-2 p-3 mb-3 bg-red-50 dark:bg-red-900/20 rounded-md">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                <div className="text-sm text-red-600 dark:text-red-400">
                  {validationErrors.map((error, index) => (
                    <div key={index}>{error}</div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Content Area */}
            <AnimatePresence>
              {isLocalExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="pl-20 pr-4 pb-6">
                    {children}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </SectionContext.Provider>
    )
  }

  // Original card-based rendering
  return (
    <SectionContext.Provider value={contextValue}>
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: isDragging ? 0.5 : 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.2 }}
        className={cn(
          'relative group',
          // Legacy drag type checks removed - now handled by @dnd-kit
          className
        )}
        data-section-id={id}
        data-section-type={type}
        data-section-order={order}
      >
        <Card className={cn(
          'overflow-hidden transition-all duration-200',
          isDragging && 'cursor-move opacity-60 transform rotate-1 z-50 shadow-lg',
          // Legacy drag opacity removed
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
                className={cn(
                  "opacity-0 group-hover:opacity-100 transition-opacity",
                  'cursor-move'
                )}
                draggable={true}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onClick={(e) => e.stopPropagation()}
                title='Drag to reorder section'
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

              {/* Title - Larger h2 size */}
              <h2 className="text-xl font-semibold">{title}</h2>

              {/* Validation Errors */}
              {validationErrors.length > 0 && (
                <div className="flex items-center gap-1 text-red-500 ml-2">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-xs">{validationErrors.length} issues</span>
                </div>
              )}
            </div>

            {/* Right side badges */}
            <div className="flex items-center gap-2">
              {/* Required icon */}
              {isRequired && (
                <span title="Required">
                  <Asterisk className="h-4 w-4 text-red-500" aria-label="Required" />
                </span>
              )}
              
              {/* Agent Badge - styled like enhanced chat interface */}
              <span className={cn(
                "px-2 py-1 text-xs font-medium rounded-md border",
                getOwnershipBadge().className
              )}>
                {getOwnershipBadge().label}
              </span>
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