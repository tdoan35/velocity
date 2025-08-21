import React, { useState, useCallback, useEffect } from 'react'
import { SectionBlock, useSectionContext } from './SectionBlock'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Plus, X, User } from 'lucide-react'
import { validateSectionContent, type OverviewSection } from '@/lib/prd-schemas'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import type { SectionBlockProps } from './SectionBlock'

interface OverviewEditorProps extends Omit<SectionBlockProps, 'children'> {
  content: OverviewSection
}

export function OverviewEditor(props: OverviewEditorProps) {
  const [localContent, setLocalContent] = useState<OverviewSection>(
    props.content || { vision: '', problem: '', targetUsers: [] }
  )
  const [errors, setErrors] = useState<string[]>([])
  const [newUser, setNewUser] = useState('')

  // Validate content on change
  useEffect(() => {
    const validation = validateSectionContent('overview', localContent)
    setErrors(validation.errors || [])
  }, [localContent])

  const handleVisionChange = useCallback((value: string) => {
    const updated = { ...localContent, vision: value }
    setLocalContent(updated)
    props.onUpdate(props.id, updated)
  }, [localContent, props])

  const handleProblemChange = useCallback((value: string) => {
    const updated = { ...localContent, problem: value }
    setLocalContent(updated)
    props.onUpdate(props.id, updated)
  }, [localContent, props])

  const handleAddUser = useCallback(() => {
    if (newUser.trim()) {
      const updated = {
        ...localContent,
        targetUsers: [...localContent.targetUsers, newUser.trim()]
      }
      setLocalContent(updated)
      props.onUpdate(props.id, updated)
      setNewUser('')
    }
  }, [localContent, newUser, props])

  const handleRemoveUser = useCallback((index: number) => {
    const updated = {
      ...localContent,
      targetUsers: localContent.targetUsers.filter((_, i) => i !== index)
    }
    setLocalContent(updated)
    props.onUpdate(props.id, updated)
  }, [localContent, props])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleAddUser()
    }
  }

  // Handle paste events for smart content detection
  const handlePaste = useCallback((e: React.ClipboardEvent, field: 'vision' | 'problem') => {
    const text = e.clipboardData?.getData('text/plain')
    if (!text) return

    // Check if pasted content looks like a list (for target users)
    if (field === 'problem' && text.includes('\n')) {
      const lines = text.split('\n').filter(line => line.trim())
      if (lines.length > 2 && lines.every(line => line.length < 100)) {
        // Likely a list of users
        e.preventDefault()
        const updated = {
          ...localContent,
          targetUsers: [...localContent.targetUsers, ...lines.map(l => l.trim())]
        }
        setLocalContent(updated)
        props.onUpdate(props.id, updated)
        return
      }
    }
  }, [localContent, props])

  return (
    <SectionBlock {...props} validationErrors={errors}>
      <div className="space-y-6">
        {/* Vision Statement */}
        <div className="space-y-2">
          <Label htmlFor={`${props.id}-vision`} className="text-sm font-medium">
            Vision Statement
          </Label>
          <Textarea
            id={`${props.id}-vision`}
            value={localContent.vision}
            onChange={(e) => handleVisionChange(e.target.value)}
            onPaste={(e) => handlePaste(e, 'vision')}
            placeholder="Describe the long-term vision for this product..."
            className="min-h-[100px] resize-none"
            disabled={!props.isEditable}
          />
          {errors.find(e => e.includes('vision')) && (
            <p className="text-xs text-red-500">{errors.find(e => e.includes('vision'))}</p>
          )}
        </div>

        {/* Problem Statement */}
        <div className="space-y-2">
          <Label htmlFor={`${props.id}-problem`} className="text-sm font-medium">
            Problem Statement
          </Label>
          <Textarea
            id={`${props.id}-problem`}
            value={localContent.problem}
            onChange={(e) => handleProblemChange(e.target.value)}
            onPaste={(e) => handlePaste(e, 'problem')}
            placeholder="What problem does this product solve?"
            className="min-h-[100px] resize-none"
            disabled={!props.isEditable}
          />
          {errors.find(e => e.includes('problem')) && (
            <p className="text-xs text-red-500">{errors.find(e => e.includes('problem'))}</p>
          )}
        </div>

        {/* Target Users */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Target Users</Label>
          <div className="space-y-2">
            {localContent.targetUsers.map((user, index) => (
              <Card key={index} className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm">{user}</span>
                  </div>
                  {props.isEditable && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleRemoveUser(index)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
            
            {props.isEditable && (
              <div className="flex gap-2">
                <Input
                  value={newUser}
                  onChange={(e) => setNewUser(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Add a target user or persona..."
                  className="flex-1"
                />
                <Button
                  onClick={handleAddUser}
                  size="icon"
                  variant="outline"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
          {errors.find(e => e.includes('targetUsers')) && (
            <p className="text-xs text-red-500">{errors.find(e => e.includes('targetUsers'))}</p>
          )}
        </div>
      </div>
    </SectionBlock>
  )
}