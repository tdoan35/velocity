/**
 * Block Type Menu Component
 * 
 * Provides a floating menu for converting blocks between different types
 * (paragraph, headings, lists, etc.) in a Notion-like interface.
 */

import React, { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Minus,
  Image,
  Table
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlockType } from '@/lib/virtual-blocks/types'

export interface BlockTypeMenuProps {
  /** Position for the menu */
  position: { top: number; left: number }
  /** Callback when a type is selected */
  onTypeSelect: (type: BlockType) => void
  /** Callback to close the menu */
  onClose: () => void
  /** Current block type */
  currentType?: BlockType
  /** Whether the menu is visible */
  isVisible: boolean
}

interface BlockTypeOption {
  type: BlockType
  icon: React.ComponentType<any>
  label: string
  description?: string
  shortcut?: string
}

// Define available block types with their icons and labels
const blockTypes: BlockTypeOption[] = [
  { 
    type: BlockType.PARAGRAPH, 
    icon: Type, 
    label: 'Text',
    description: 'Plain text paragraph',
    shortcut: 'Cmd+Alt+0'
  },
  { 
    type: BlockType.HEADING_1, 
    icon: Heading1, 
    label: 'Heading 1',
    description: 'Large section heading',
    shortcut: 'Cmd+Alt+1'
  },
  { 
    type: BlockType.HEADING_2, 
    icon: Heading2, 
    label: 'Heading 2',
    description: 'Medium section heading',
    shortcut: 'Cmd+Alt+2'
  },
  { 
    type: BlockType.HEADING_3, 
    icon: Heading3, 
    label: 'Heading 3',
    description: 'Small section heading',
    shortcut: 'Cmd+Alt+3'
  },
  { 
    type: BlockType.BULLET_LIST, 
    icon: List, 
    label: 'Bullet List',
    description: 'Create a simple list',
    shortcut: 'Cmd+Shift+8'
  },
  { 
    type: BlockType.NUMBERED_LIST, 
    icon: ListOrdered, 
    label: 'Numbered List',
    description: 'Create a numbered list',
    shortcut: 'Cmd+Shift+7'
  },
  { 
    type: BlockType.QUOTE, 
    icon: Quote, 
    label: 'Quote',
    description: 'Capture a quote',
    shortcut: 'Cmd+Shift+.'
  },
  { 
    type: BlockType.CODE, 
    icon: Code, 
    label: 'Code Block',
    description: 'Display code with syntax highlighting',
    shortcut: 'Cmd+Alt+C'
  },
  { 
    type: BlockType.DIVIDER, 
    icon: Minus, 
    label: 'Divider',
    description: 'Visually divide sections'
  },
  { 
    type: BlockType.IMAGE, 
    icon: Image, 
    label: 'Image',
    description: 'Upload or embed an image'
  },
  { 
    type: BlockType.TABLE, 
    icon: Table, 
    label: 'Table',
    description: 'Add a table for structured data'
  }
]

/**
 * Individual block type option component
 */
function BlockTypeOption({ 
  option, 
  isActive, 
  onClick,
  onMouseEnter 
}: {
  option: BlockTypeOption
  isActive: boolean
  onClick: () => void
  onMouseEnter: () => void
}) {
  const Icon = option.icon
  
  return (
    <button
      className={cn(
        'w-full flex items-start gap-3 px-3 py-2 rounded-md transition-colors',
        'hover:bg-gray-100 dark:hover:bg-gray-800',
        'focus:bg-gray-100 dark:focus:bg-gray-800 focus:outline-none',
        isActive && 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
      )}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <div className={cn(
        'flex-shrink-0 w-10 h-10 rounded flex items-center justify-center',
        'bg-gray-100 dark:bg-gray-800',
        isActive && 'bg-blue-100 dark:bg-blue-900/30'
      )}>
        <Icon className="w-5 h-5" />
      </div>
      
      <div className="flex-1 text-left">
        <div className="flex items-center justify-between">
          <span className="font-medium text-sm">
            {option.label}
          </span>
          {option.shortcut && (
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">
              {option.shortcut}
            </span>
          )}
        </div>
        {option.description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {option.description}
          </p>
        )}
      </div>
    </button>
  )
}

export function BlockTypeMenu({ 
  position, 
  onTypeSelect, 
  onClose,
  currentType,
  isVisible 
}: BlockTypeMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [hoveredIndex, setHoveredIndex] = React.useState(0)
  
  // Handle keyboard navigation
  useEffect(() => {
    if (!isVisible) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault()
          setHoveredIndex(prev => Math.max(0, prev - 1))
          break
        case 'ArrowDown':
          e.preventDefault()
          setHoveredIndex(prev => Math.min(blockTypes.length - 1, prev + 1))
          break
        case 'Enter':
          e.preventDefault()
          onTypeSelect(blockTypes[hoveredIndex].type)
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isVisible, hoveredIndex, onTypeSelect, onClose])
  
  // Handle click outside
  useEffect(() => {
    if (!isVisible) return
    
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    
    // Delay to avoid immediate close on open
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 100)
    
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isVisible, onClose])
  
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          ref={menuRef}
          className={cn(
            'absolute z-50 w-80 max-h-96 overflow-y-auto',
            'bg-white dark:bg-gray-900',
            'border border-gray-200 dark:border-gray-700',
            'rounded-lg shadow-xl',
            'py-2'
          )}
          style={{ 
            top: position.top, 
            left: position.left,
            maxHeight: 'calc(100vh - ' + position.top + 'px - 20px)'
          }}
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 mb-2">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Convert to
            </h3>
          </div>
          
          <div className="space-y-0.5">
            {blockTypes.map((blockType, index) => (
              <BlockTypeOption
                key={blockType.type}
                option={blockType}
                isActive={
                  currentType === blockType.type || 
                  index === hoveredIndex
                }
                onClick={() => onTypeSelect(blockType.type)}
                onMouseEnter={() => setHoveredIndex(index)}
              />
            ))}
          </div>
          
          <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 mt-2">
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Type <kbd className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">/</kbd> to filter
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}