import { useState, useCallback } from 'react'
import { CodeEditor } from './code-editor'
import { EditorTabs } from './editor-tabs'
import { useEditorStore } from '@/stores/useEditorStore'
import { ResponsiveMonacoWrapper } from '@/components/layout/responsive-monaco-wrapper'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface EditorContainerProps {
  className?: string
  onSave?: (fileId: string, content: string) => void
}

export function EditorContainer({ className, onSave }: EditorContainerProps) {
  const { tabs, activeTabId, closeTab, setActiveTab } = useEditorStore()
  const [saving, setSaving] = useState<string | null>(null)
  
  const activeTab = tabs.find(tab => tab.id === activeTabId)

  const handleSave = useCallback(async (fileId: string, content: string) => {
    setSaving(fileId)
    try {
      await onSave?.(fileId, content)
      // Show success indicator
      setTimeout(() => setSaving(null), 1000)
    } catch (error) {
      console.error('Failed to save file:', error)
      setSaving(null)
    }
  }, [onSave])


  if (tabs.length === 0) {
    return (
      <Card className={cn('flex h-full items-center justify-center', className)}>
        <div className="text-center">
          <h3 className="text-lg font-semibold text-muted-foreground">No files open</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Select a file from the explorer to start editing
          </p>
        </div>
      </Card>
    )
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <EditorTabs
        tabs={tabs}
        activeTabId={activeTabId}
        onTabClick={setActiveTab}
        onTabClose={closeTab}
        saving={saving}
      />
      
      <ResponsiveMonacoWrapper className="flex-1">
        {activeTab && (
          <CodeEditor
            key={activeTab.id}
            fileId={activeTab.id}
            filePath={activeTab.filePath}
            initialValue={activeTab.content}
            language={getLanguageFromPath(activeTab.filePath)}
            onSave={(content) => handleSave(activeTab.id, content)}
            onChange={() => {
              // Update content in store is handled by CodeEditor
            }}
          />
        )}
      </ResponsiveMonacoWrapper>
    </div>
  )
}

function getLanguageFromPath(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase()
  
  const languageMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    json: 'json',
    css: 'css',
    scss: 'scss',
    less: 'less',
    html: 'html',
    xml: 'xml',
    md: 'markdown',
    py: 'python',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    cs: 'csharp',
    php: 'php',
    rb: 'ruby',
    go: 'go',
    rs: 'rust',
    kt: 'kotlin',
    swift: 'swift',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
  }
  
  return languageMap[extension || ''] || 'plaintext'
}