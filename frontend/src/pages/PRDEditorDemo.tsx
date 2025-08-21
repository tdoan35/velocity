import { useState, useEffect } from 'react'
import { BlockNotionPRDEditor } from '@/components/prd-editors/baseline'
import { supabase } from '@/lib/supabase'
import { Loader2 } from 'lucide-react'
import { projectService } from '@/services/projectService'

export function PRDEditorDemo() {
  const [projectId, setProjectId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    loadOrCreateProject()
  }, [])
  
  const loadOrCreateProject = async () => {
    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        setError('User not authenticated')
        setIsLoading(false)
        return
      }
      
      // Try to get an existing project for this user
      const { data: projects, error: fetchError } = await supabase
        .from('projects')
        .select('id, name')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (fetchError) {
        console.error('Error fetching projects:', fetchError)
      }
      
      if (projects && projects.length > 0) {
        // Use the most recent project
        console.log('Using existing project:', projects[0])
        setProjectId(projects[0].id)
      } else {
        // Create a test project
        console.log('Creating test project for PRD demo...')
        const { project, error: createError } = await projectService.createProject({
          name: 'PRD Editor Test Project',
          description: 'Test project for PRD editor development',
          initialPrompt: 'A test project for developing the PRD editor component',
          template: 'react-native'
        })
        
        if (createError || !project) {
          setError('Failed to create test project: ' + (createError?.message || 'Unknown error'))
        } else {
          setProjectId(project.id)
        }
      }
    } catch (err) {
      console.error('Error in loadOrCreateProject:', err)
      setError('An unexpected error occurred')
    } finally {
      setIsLoading(false)
    }
  }
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading project...</p>
        </div>
      </div>
    )
  }
  
  if (error || !projectId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive mb-2">{error || 'No project available'}</p>
          <button 
            onClick={() => window.location.reload()} 
            className="text-sm text-primary hover:underline"
          >
            Refresh page
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">PRD Editor Demo</h1>
          <p className="text-muted-foreground">
            Testing the new baseline PRD editor component
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Project ID: {projectId}
          </p>
        </div>
        
        <BlockNotionPRDEditor projectId={projectId} />
      </div>
    </div>
  )
}