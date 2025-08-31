
import { ContainerPreviewPanel } from './ContainerPreviewPanel'
import { useAppStore } from '@/stores/useAppStore'

export function PreviewPanel() {
  const { currentProject } = useAppStore()

  if (!currentProject?.id) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <p>No project selected</p>
          <p className="text-sm">Select a project to start preview</p>
        </div>
      </div>
    )
  }

  return (
    <ContainerPreviewPanel
      projectId={currentProject.id}
      className="h-full"
    />
  )
}