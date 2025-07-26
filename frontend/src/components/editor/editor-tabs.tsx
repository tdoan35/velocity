import { X, FileCode, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { EditorTab } from '@/types/store'

interface EditorTabsProps {
  tabs: EditorTab[]
  activeTabId: string | null
  onTabClick: (tabId: string) => void
  onTabClose: (tabId: string) => void
  saving?: string | null
}

export function EditorTabs({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  saving,
}: EditorTabsProps) {
  return (
    <div className="flex border-b bg-background">
      <div className="flex flex-1 overflow-x-auto">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          const isSaving = saving === tab.id
          const fileName = tab.filePath.split('/').pop() || 'untitled'
          
          return (
            <div
              key={tab.id}
              className={cn(
                'group flex items-center border-r px-3 py-2 text-sm',
                isActive
                  ? 'bg-background text-foreground'
                  : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'
              )}
            >
              <button
                className="flex items-center gap-2"
                onClick={() => onTabClick(tab.id)}
              >
                <FileCode className="h-4 w-4" />
                <span className="max-w-[150px] truncate">{fileName}</span>
                {tab.isDirty && !isSaving && (
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
                  onTabClose(tab.id)
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