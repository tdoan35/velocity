import { useState } from 'react'
import { motion, Reorder, useDragControls } from 'framer-motion'
import { 
  GripVertical, 
  Plus, 
  Trash2, 
  ChevronRight, 
  ChevronDown,
  CheckCircle2,
  Circle,
  Clock,
  User,
  Palette,
  Code,
  Settings
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { FlexiblePRDSection, AgentType } from '@/services/prdService'

interface SectionManagerProps {
  sections: FlexiblePRDSection[]
  onReorder: (sections: FlexiblePRDSection[]) => void
  onAdd: (title: string, agent: AgentType, required: boolean) => void
  onRemove: (sectionId: string) => void
  onEdit: (sectionId: string, updates: Partial<FlexiblePRDSection>) => void
  onNavigate: (sectionId: string) => void
  className?: string
}

const agentIcons: Record<AgentType, any> = {
  project_manager: User,
  design_assistant: Palette,
  engineering_assistant: Code,
  config_helper: Settings
}

const agentColors: Record<AgentType, string> = {
  project_manager: 'text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30',
  design_assistant: 'text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30',
  engineering_assistant: 'text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
  config_helper: 'text-orange-600 bg-orange-100 dark:text-orange-400 dark:bg-orange-900/30'
}

export function SectionManager({
  sections,
  onReorder,
  onAdd,
  onRemove,
  onEdit,
  onNavigate,
  className
}: SectionManagerProps) {
  const [isAddingSection, setIsAddingSection] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')
  const [newSectionAgent, setNewSectionAgent] = useState<AgentType>('project_manager')
  const [newSectionRequired, setNewSectionRequired] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())

  const handleAddSection = () => {
    if (newSectionTitle.trim()) {
      onAdd(newSectionTitle.trim(), newSectionAgent, newSectionRequired)
      setNewSectionTitle('')
      setIsAddingSection(false)
    }
  }

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-500" />
      case 'in_progress':
        return <Clock className="h-4 w-4 text-yellow-600 dark:text-yellow-500" />
      default:
        return <Circle className="h-4 w-4 text-gray-400 dark:text-gray-600" />
    }
  }

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400">
          SECTIONS
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsAddingSection(!isAddingSection)}
          className="h-7 px-2"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Add Section Form */}
      {isAddingSection && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2"
        >
          <Input
            placeholder="Section title"
            value={newSectionTitle}
            onChange={(e) => setNewSectionTitle(e.target.value)}
            className="h-8 text-sm"
          />
          <div className="flex gap-2">
            <Select value={newSectionAgent} onValueChange={(v) => setNewSectionAgent(v as AgentType)}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="project_manager">Project Manager</SelectItem>
                <SelectItem value="design_assistant">Design Assistant</SelectItem>
                <SelectItem value="engineering_assistant">Engineering Assistant</SelectItem>
                <SelectItem value="config_helper">Config Helper</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newSectionRequired}
                onChange={(e) => setNewSectionRequired(e.target.checked)}
                className="rounded"
              />
              Required
            </label>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7"
              onClick={handleAddSection}
              disabled={!newSectionTitle.trim()}
            >
              Add
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                setIsAddingSection(false)
                setNewSectionTitle('')
              }}
            >
              Cancel
            </Button>
          </div>
        </motion.div>
      )}

      {/* Sections List */}
      <Reorder.Group
        axis="y"
        values={sections}
        onReorder={onReorder}
        className="space-y-1"
      >
        {sections.map((section) => {
          const AgentIcon = agentIcons[section.agent]
          const isExpanded = expandedSections.has(section.id)
          
          return (
            <Reorder.Item
              key={section.id}
              value={section}
              className="group"
            >
              <motion.div
                className={cn(
                  'rounded-lg border border-gray-200 dark:border-gray-700',
                  'hover:border-gray-300 dark:hover:border-gray-600',
                  'transition-all duration-150'
                )}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
              >
                {/* Section Header */}
                <div className="flex items-center gap-2 p-2">
                  <button className="cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity">
                    <GripVertical className="h-4 w-4 text-gray-400" />
                  </button>
                  
                  <button
                    onClick={() => toggleSection(section.id)}
                    className="p-0.5"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>

                  {getStatusIcon(section.status)}
                  
                  <div className={cn('p-1 rounded', agentColors[section.agent])}>
                    <AgentIcon className="h-3 w-3" />
                  </div>
                  
                  <button
                    onClick={() => onNavigate(section.id)}
                    className="flex-1 text-left text-sm font-medium hover:text-primary transition-colors"
                  >
                    {section.title}
                  </button>
                  
                  {section.required && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
                      Required
                    </span>
                  )}
                  
                  {section.isCustom && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => onRemove(section.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>

                {/* Section Details (when expanded) */}
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-8 pb-2"
                  >
                    {section.description && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                        {section.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-500">
                      <span>Order: {section.order}</span>
                      <span>Agent: {section.agent.replace('_', ' ')}</span>
                      <span className="capitalize">Status: {section.status}</span>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            </Reorder.Item>
          )
        })}
      </Reorder.Group>
    </div>
  )
}