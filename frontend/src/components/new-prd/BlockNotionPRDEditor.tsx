import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, FileText, RefreshCw } from 'lucide-react'
import { prdService, type PRD, type FlexiblePRDSection } from '@/services/prdService'
import { useToast } from '@/hooks/use-toast'
import { SectionBlockEditor } from './blocks/SectionBlockEditor'
import { supabase } from '@/lib/supabase'
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types'

interface BlockNotionPRDEditorProps {
  projectId: string
  enableVirtualBlocks?: boolean // Enable virtual block system
}

export function BlockNotionPRDEditor({ projectId, enableVirtualBlocks = true }: BlockNotionPRDEditorProps) {
  const [prd, setPRD] = useState<PRD | null>(null)
  const [sections, setSections] = useState<FlexiblePRDSection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sectionVirtualBlocks, setSectionVirtualBlocks] = useState<Record<string, VirtualContentBlock[]>>({})
  const { toast } = useToast()

  useEffect(() => {
    loadOrCreatePRD()
  }, [projectId])

  const loadOrCreatePRD = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      console.log('Loading PRD for project:', projectId)
      
      // Try to load existing PRD
      let { prd: existingPRD, error: loadError } = await prdService.getPRDByProject(projectId)
      
      if (loadError) {
        console.error('Error loading PRD:', loadError)
      }
      
      // If no PRD exists, create a new one
      if (!existingPRD) {
        console.log('No existing PRD found, creating new one...')
        const result = await prdService.createPRD(projectId)
        existingPRD = result.prd
        
        if (result.error) {
          throw new Error(result.error.message || 'Failed to create PRD')
        }
        
        toast({
          title: 'PRD Created',
          description: 'A new Product Requirements Document has been created for this project.',
        })
      } else {
        console.log('Loaded existing PRD:', existingPRD.id)
      }
      
      setPRD(existingPRD)
      setSections(existingPRD?.sections || [])
    } catch (err) {
      console.error('Error in loadOrCreatePRD:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load or create PRD'
      setError(errorMessage)
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRetry = () => {
    loadOrCreatePRD()
  }

  const handleSectionUpdate = useCallback(async (sectionId: string, content: { html: string; text: string }) => {
    if (!prd?.id) return

    setIsSaving(true)
    
    try {
      // Update local state optimistically
      setSections(prev => prev.map(section => 
        section.id === sectionId 
          ? { ...section, content, status: 'in_progress' as const }
          : section
      ))

      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }
      
      // Save to backend using edge function
      const { data, error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'updateSection',
          prdId: prd.id,
          sectionId: sectionId,
          data: content
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (error) throw error

      // Update section status based on content (check if it's not just template)
      const hasRealContent = content.html && content.text && 
                            !content.html.includes('template-placeholder') && 
                            content.text.length > 20
      
      setSections(prev => prev.map(section => 
        section.id === sectionId 
          ? { 
              ...section, 
              status: hasRealContent ? 'completed' as const : 'in_progress' as const 
            }
          : section
      ))

      // Update PRD completion percentage if returned
      if (data?.completionPercentage !== undefined) {
        setPRD(prev => prev ? { ...prev, completion_percentage: data.completionPercentage } : prev)
      }

      toast({
        title: 'Section saved',
        description: 'Your changes have been saved successfully.',
      })

    } catch (error) {
      console.error(`Failed to save section ${sectionId}:`, error)
      toast({
        title: 'Save failed',
        description: 'Failed to save section. Please try again.',
        variant: 'destructive'
      })
      
      // Reload to get the correct state
      await loadOrCreatePRD()
    } finally {
      setIsSaving(false)
    }
  }, [prd, toast])

  // Loading state
  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading PRD...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error || !prd) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{error || 'Failed to load PRD'}</p>
            <Button onClick={handleRetry} variant="outline" size="sm">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Main PRD display
  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Header Card */}
      <Card>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-semibold">
              {prd.title || 'Product Requirements Document'}
            </CardTitle>
            <div className="flex items-center gap-3">
              {isSaving && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </div>
              )}
              <Button
                onClick={loadOrCreatePRD}
                variant="outline"
                size="sm"
                disabled={isLoading || isSaving}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                Refresh
              </Button>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{prd.completion_percentage || 0}% complete</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${prd.completion_percentage || 0}%` }}
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Status:</span>
              <span className="ml-2 font-medium">{prd.status}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Created:</span>
              <span className="ml-2">{prd.created_at ? new Date(prd.created_at).toLocaleDateString() : 'N/A'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Sections */}
      {sections.length > 0 ? (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Sections
          </h2>
          {sections
            .sort((a, b) => a.order - b.order)
            .map((section) => (
              <SectionBlockEditor
                key={section.id}
                section={section}
                onSave={handleSectionUpdate}
                enableClickToEdit={true}
                enableVirtualBlocks={enableVirtualBlocks}
                onBlocksUpdate={(sectionId, blocks) => {
                  setSectionVirtualBlocks(prev => ({
                    ...prev,
                    [sectionId]: blocks
                  }))
                  console.log(`Virtual blocks updated for section ${sectionId}:`, blocks)
                }}
              />
            ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No sections have been created yet.</p>
              <p className="text-xs mt-2">Sections will be added as you build your PRD.</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}