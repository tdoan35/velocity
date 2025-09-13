import { X, FileCode, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EditorFile } from '@/stores/useUnifiedEditorStore'

interface EditorTabsProps {
  tabs: string[]
  activeTab: string | null
  onTabClick: (filePath: string) => void
  onTabClose: (filePath: string) => void
  files: Record<string, EditorFile>
}

export function EditorTabs({
  tabs,
  activeTab,
  onTabClick,
  onTabClose,
  files,
}: EditorTabsProps) {
  if (tabs.length === 0) return null;

  return (
    <div className="flex border-b bg-background">
      <div className="flex flex-1 overflow-x-auto">
        {tabs.map((filePath) => {
          const isActive = filePath === activeTab
          const file = files[filePath]
          const isSaving = file?.isSaving || false
          const isDirty = file?.isDirty || false
          const fileName = filePath.split('/').pop() || 'untitled'
          
          return (
            <div
              key={filePath}
              className={cn(
                'group flex items-center border-r px-3 py-2 text-sm',
                isActive
                  ? 'bg-background text-foreground'
                  : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
              )}
            >
              <button
                className="flex items-center gap-2"
                onClick={() => onTabClick(filePath)}
              >
                <FileCode className="h-4 w-4" />
                <span className="max-w-[150px] truncate">{fileName}</span>
                {isDirty && !isSaving && (
                  <span className="ml-1 h-2 w-2 rounded-full bg-primary" />
                )}
                {isSaving && (
                  <Loader2 className="ml-1 h-3 w-3 animate-spin" />
                )}
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="ml-2 h-5 w-5 opacity-0 group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation()
                  onTabClose(filePath)
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}