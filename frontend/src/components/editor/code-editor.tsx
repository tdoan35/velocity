import { useRef, useCallback, useEffect, useState } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import type { Monaco, OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useTheme } from '@/components/theme-provider'
import { useEditorStore } from '@/stores/useEditorStore'
import { configureMonaco, MONACO_OPTIONS } from './monaco-config'
import { cn } from '@/lib/utils'

interface CodeEditorProps {
  fileId: string
  filePath: string
  initialValue?: string
  language?: string
  onSave?: (value: string) => void
  onChange?: (value: string) => void
  className?: string
  readOnly?: boolean
}

export function CodeEditor({
  fileId,
  filePath: _filePath,
  initialValue = '',
  language = 'typescript',
  onSave,
  onChange,
  className,
  readOnly = false,
}: CodeEditorProps) {
  const { theme } = useTheme()
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)
  const monacoRef = useRef<Monaco | null>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  
  const { updateTabContent } = useEditorStore()
  
  // Configure Monaco loader on first mount
  useEffect(() => {
    // Set a timeout for loading
    const loadTimeout = setTimeout(() => {
      if (isLoading) {
        setLoadError('Editor is taking too long to load. This might be due to network issues.')
      }
    }, 15000) // 15 seconds timeout
    
    loader.config({
      paths: {
        vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs'
      }
    })
    
    return () => clearTimeout(loadTimeout)
  }, [isLoading])

  // Auto-save with debounce
  const handleChange = useCallback((value: string | undefined) => {
    if (!value) return
    
    // Update tab content in store
    updateTabContent(fileId, value)
    
    // Call onChange immediately
    onChange?.(value)
    
    // Debounce auto-save
    if (onSave) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        onSave(value)
      }, 500) as unknown as NodeJS.Timeout
    }
  }, [fileId, onChange, onSave, updateTabContent])

  const handleEditorDidMount: OnMount = useCallback((editor, monaco) => {
    console.log('Monaco Editor mounted successfully')
    setIsLoading(false)
    editorRef.current = editor
    monacoRef.current = monaco
    
    // Configure Monaco
    try {
      configureMonaco(monaco)
    } catch (error) {
      console.error('Error configuring Monaco:', error)
      setLoadError('Failed to configure editor')
    }
    
    // Register keyboard shortcuts
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const value = editor.getValue()
      onSave?.(value)
    })
    
    // Format document shortcut
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      editor.trigger('', 'editor.action.formatDocument', {})
    })
    
    // Quick actions
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period, () => {
      editor.trigger('', 'editor.action.quickFix', {})
    })
    
    // Go to definition
    editor.addCommand(monaco.KeyCode.F12, () => {
      editor.trigger('', 'editor.action.revealDefinition', {})
    })
    
    // Find references
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.F12, () => {
      editor.trigger('', 'editor.action.goToReferences', {})
    })
    
    // Rename symbol
    editor.addCommand(monaco.KeyCode.F2, () => {
      editor.trigger('', 'editor.action.rename', {})
    })
  }, [onSave])

  // Update editor theme when app theme changes
  useEffect(() => {
    if (monacoRef.current) {
      const monacoTheme = theme === 'dark' ? 'velocity-dark' : 'velocity-light'
      monacoRef.current.editor.setTheme(monacoTheme)
    }
  }, [theme])

  // Update editor options when readOnly changes
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ readOnly })
    }
  }, [readOnly])

  // Cleanup auto-save timeout
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Handle editor resize
  useEffect(() => {
    const handleResize = () => {
      editorRef.current?.layout()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Add error boundary for Monaco loading issues
  if (loadError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="text-sm text-destructive">Editor Loading Error</div>
          <div className="text-xs text-muted-foreground mt-2">{loadError}</div>
          <div className="mt-4 space-x-4">
            <button 
              onClick={() => {
                setLoadError(null)
                setRetryCount(prev => prev + 1)
              }} 
              className="text-xs text-primary underline"
            >
              Retry
            </button>
            <button 
              onClick={() => window.location.reload()} 
              className="text-xs text-primary underline"
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    )
  }
  
  return (
    <div className={cn('h-full w-full', className)}>
      <Editor
        key={`${fileId}-${retryCount}`}
        defaultValue={initialValue}
        defaultLanguage={language}
        theme={theme === 'dark' ? 'velocity-dark' : 'velocity-light'}
        options={{
          ...MONACO_OPTIONS,
          readOnly,
        }}
        onChange={handleChange}
        onMount={handleEditorDidMount}
        loading={
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Loading Monaco Editor...</div>
              <div className="text-xs text-muted-foreground mt-2">Downloading editor files from CDN</div>
              <div className="mt-4">
                <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary/50 rounded-full animate-pulse" style={{ width: '60%' }} />
                </div>
              </div>
            </div>
          </div>
        }
        beforeMount={(monaco) => {
          console.log('Monaco is about to mount', monaco)
          setLoadError(null)
        }}
        onValidate={(markers) => {
          console.log('Monaco validation markers:', markers)
        }}
        wrapperProps={{
          onError: (error: Error) => {
            console.error('Monaco Editor error:', error)
            setLoadError(error.message || 'Failed to load editor')
          }
        }}
      />
    </div>
  )
}