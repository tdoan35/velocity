import React, { useState, useCallback } from 'react'
import { SectionBlock } from './SectionBlock'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, X, Sparkles, GripVertical, ChevronDown, ChevronRight } from 'lucide-react'
import { validateSectionContent, type Feature, type CoreFeaturesSection } from '@/lib/prd-schemas'
import { Label } from '@/components/ui/label'
import type { SectionBlockProps } from './SectionBlock'
import { motion, AnimatePresence } from 'framer-motion'

interface FeaturesEditorProps extends Omit<SectionBlockProps, 'children'> {
  content: CoreFeaturesSection
  maxFeatures?: number
  showPriority?: boolean
}

export function FeaturesEditor({
  maxFeatures,
  showPriority = true,
  ...props
}: FeaturesEditorProps) {
  const [localContent, setLocalContent] = useState<CoreFeaturesSection>(
    props.content || { features: [] }
  )
  const [errors, setErrors] = useState<string[]>([])
  const [newFeature, setNewFeature] = useState<Partial<Feature>>({
    title: '',
    description: '',
    priority: 'medium'
  })
  const [isAddingFeature, setIsAddingFeature] = useState(false)
  const [expandedFeatures, setExpandedFeatures] = useState<Set<number>>(new Set())

  // Validate content
  React.useEffect(() => {
    const validation = validateSectionContent(props.type, localContent)
    setErrors(validation.errors || [])
  }, [localContent, props.type])

  const handleAddFeature = useCallback(() => {
    if (newFeature.title && newFeature.description) {
      const feature: Feature = {
        id: `feature-${Date.now()}`,
        title: newFeature.title,
        description: newFeature.description,
        priority: showPriority ? newFeature.priority : undefined,
        acceptance_criteria: []
      }
      
      const updated = {
        ...localContent,
        features: [...localContent.features, feature]
      }
      setLocalContent(updated)
      props.onUpdate(props.id, updated)
      setNewFeature({ title: '', description: '', priority: 'medium' })
      setIsAddingFeature(false)
    }
  }, [localContent, newFeature, props, showPriority])

  const handleUpdateFeature = useCallback((index: number, field: keyof Feature, value: any) => {
    const updated = {
      ...localContent,
      features: localContent.features.map((f, i) => 
        i === index ? { ...f, [field]: value } : f
      )
    }
    setLocalContent(updated)
    props.onUpdate(props.id, updated)
  }, [localContent, props])

  const handleRemoveFeature = useCallback((index: number) => {
    const updated = {
      ...localContent,
      features: localContent.features.filter((_, i) => i !== index)
    }
    setLocalContent(updated)
    props.onUpdate(props.id, updated)
  }, [localContent, props])

  const handleReorderFeature = useCallback((fromIndex: number, toIndex: number) => {
    const features = [...localContent.features]
    const [removed] = features.splice(fromIndex, 1)
    features.splice(toIndex, 0, removed)
    
    const updated = { ...localContent, features }
    setLocalContent(updated)
    props.onUpdate(props.id, updated)
  }, [localContent, props])

  const toggleFeatureExpanded = (index: number) => {
    const newExpanded = new Set(expandedFeatures)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedFeatures(newExpanded)
  }

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'high': return 'destructive'
      case 'medium': return 'default'
      case 'low': return 'secondary'
      default: return 'outline'
    }
  }

  // Handle paste for bulk feature import
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const text = e.clipboardData?.getData('text/plain')
    if (!text) return

    // Check if it looks like a feature list
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length > 1) {
      e.preventDefault()
      
      // Try to parse as feature list
      const features: Feature[] = []
      let currentFeature: Partial<Feature> | null = null
      
      lines.forEach(line => {
        const trimmed = line.trim()
        // Check if line starts with number or bullet
        if (/^(\d+\.|[-*•])/.test(trimmed)) {
          if (currentFeature?.title) {
            features.push({
              ...currentFeature,
              description: currentFeature.description || '',
              title: currentFeature.title
            } as Feature)
          }
          currentFeature = {
            title: trimmed.replace(/^(\d+\.|[-*•])\s*/, ''),
            description: ''
          }
        } else if (currentFeature && trimmed) {
          currentFeature.description = currentFeature.description 
            ? `${currentFeature.description} ${trimmed}`
            : trimmed
        }
      })
      
      if (currentFeature?.title) {
        features.push({
          ...currentFeature,
          description: currentFeature.description || '',
          title: currentFeature.title
        } as Feature)
      }
      
      if (features.length > 0) {
        const updated = {
          ...localContent,
          features: [...localContent.features, ...features]
        }
        setLocalContent(updated)
        props.onUpdate(props.id, updated)
      }
    }
  }, [localContent, props])

  return (
    <SectionBlock {...props} validationErrors={errors}>
      <div className="space-y-4" onPaste={handlePaste}>
        {/* Existing Features */}
        <div className="space-y-3">
          {localContent.features.map((feature, index) => (
            <Card key={feature.id || index} className="overflow-hidden">
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => toggleFeatureExpanded(index)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    {props.isEditable && (
                      <GripVertical 
                        className="w-5 h-5 text-gray-400 cursor-move mt-0.5"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('featureIndex', index.toString())
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault()
                          const fromIndex = parseInt(e.dataTransfer.getData('featureIndex'))
                          if (!isNaN(fromIndex) && fromIndex !== index) {
                            handleReorderFeature(fromIndex, index)
                          }
                        }}
                      />
                    )}
                    <button className="p-1">
                      {expandedFeatures.has(index) ? 
                        <ChevronDown className="w-4 h-4" /> : 
                        <ChevronRight className="w-4 h-4" />
                      }
                    </button>
                    <Sparkles className="w-4 h-4 text-yellow-500 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{feature.title}</h4>
                        {showPriority && feature.priority && (
                          <Badge variant={getPriorityColor(feature.priority) as any}>
                            {feature.priority}
                          </Badge>
                        )}
                      </div>
                      {!expandedFeatures.has(index) && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                          {feature.description}
                        </p>
                      )}
                    </div>
                  </div>
                  {props.isEditable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveFeature(index)
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {expandedFeatures.has(index) && (
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: 'auto' }}
                    exit={{ height: 0 }}
                    className="border-t border-gray-200 dark:border-gray-700"
                  >
                    <div className="p-4 space-y-3">
                      {props.isEditable ? (
                        <>
                          <div>
                            <Label htmlFor={`feature-${index}-title`}>Title</Label>
                            <Input
                              id={`feature-${index}-title`}
                              value={feature.title}
                              onChange={(e) => handleUpdateFeature(index, 'title', e.target.value)}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`feature-${index}-desc`}>Description</Label>
                            <Textarea
                              id={`feature-${index}-desc`}
                              value={feature.description}
                              onChange={(e) => handleUpdateFeature(index, 'description', e.target.value)}
                              className="mt-1 min-h-[80px]"
                            />
                          </div>
                          {showPriority && (
                            <div>
                              <Label htmlFor={`feature-${index}-priority`}>Priority</Label>
                              <Select
                                value={feature.priority}
                                onValueChange={(value) => handleUpdateFeature(index, 'priority', value)}
                              >
                                <SelectTrigger id={`feature-${index}-priority`} className="mt-1">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="high">High</SelectItem>
                                  <SelectItem value="medium">Medium</SelectItem>
                                  <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          <p className="text-sm">{feature.description}</p>
                          {feature.acceptance_criteria && feature.acceptance_criteria.length > 0 && (
                            <div>
                              <p className="text-sm font-medium">Acceptance Criteria:</p>
                              <ul className="text-sm text-gray-600 dark:text-gray-400 list-disc list-inside">
                                {feature.acceptance_criteria.map((criteria, i) => (
                                  <li key={i}>{criteria}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          ))}
        </div>

        {/* Add New Feature */}
        {props.isEditable && (!maxFeatures || localContent.features.length < maxFeatures) && (
          <div>
            {isAddingFeature ? (
              <Card className="p-4 space-y-3">
                <div>
                  <Label htmlFor="new-feature-title">Feature Title</Label>
                  <Input
                    id="new-feature-title"
                    value={newFeature.title}
                    onChange={(e) => setNewFeature({ ...newFeature, title: e.target.value })}
                    placeholder="Enter feature title..."
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="new-feature-desc">Description</Label>
                  <Textarea
                    id="new-feature-desc"
                    value={newFeature.description}
                    onChange={(e) => setNewFeature({ ...newFeature, description: e.target.value })}
                    placeholder="Describe the feature..."
                    className="mt-1 min-h-[80px]"
                  />
                </div>
                {showPriority && (
                  <div>
                    <Label htmlFor="new-feature-priority">Priority</Label>
                    <Select
                      value={newFeature.priority}
                      onValueChange={(value) => setNewFeature({ ...newFeature, priority: value as any })}
                    >
                      <SelectTrigger id="new-feature-priority" className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button onClick={handleAddFeature} size="sm">
                    Add Feature
                  </Button>
                  <Button 
                    onClick={() => {
                      setIsAddingFeature(false)
                      setNewFeature({ title: '', description: '', priority: 'medium' })
                    }} 
                    size="sm" 
                    variant="outline"
                  >
                    Cancel
                  </Button>
                </div>
              </Card>
            ) : (
              <Button
                onClick={() => setIsAddingFeature(true)}
                variant="outline"
                className="w-full"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Feature
              </Button>
            )}
          </div>
        )}

        {errors.length > 0 && (
          <div className="text-xs text-red-500 space-y-1">
            {errors.map((error, i) => (
              <p key={i}>{error}</p>
            ))}
          </div>
        )}
      </div>
    </SectionBlock>
  )
}