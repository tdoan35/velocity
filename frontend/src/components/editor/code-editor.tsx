import { useRef, useCallback, useEffect, useState } from 'react'
import Editor, { loader } from '@monaco-editor/react'
import type { Monaco, OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { useTheme } from '@/components/theme-provider'
// Note: This component now relies on props from the unified store rather than importing it directly
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
  filePath,
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
  const modelsRef = useRef<Map<string, editor.ITextModel>>(new Map())
  const currentFileIdRef = useRef<string>(fileId)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)
  const [saveIndicator, setSaveIndicator] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle')
  const [lastSaveError, setLastSaveError] = useState<string | null>(null)
  
  // Tab content updates are now handled by the parent component via onChange prop
  
  // Model management functions
  const getOrCreateModel = useCallback((monaco: Monaco, fileId: string, filePath: string, content: string, language: string) => {
    // Check if model already exists
    let model = modelsRef.current.get(fileId)
    
    if (!model) {
      // Create unique URI for the file
      const uri = monaco.Uri.parse(`file:///${filePath}`)
      
      // Check if a model with this URI already exists and dispose it
      const existingModel = monaco.editor.getModel(uri)
      if (existingModel) {
        existingModel.dispose()
      }
      
      // Create new model
      model = monaco.editor.createModel(content, language, uri)
      modelsRef.current.set(fileId, model)
      
      // Set up change listener with improved debouncing
      model.onDidChangeContent(() => {
        const value = model!.getValue()
        onChange?.(value)
        
        // Cancel previous auto-save if user is still typing
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current)
          saveTimeoutRef.current = null
        }
        
        // Enhanced debounced auto-save with status indication
        if (onSave) {
          setSaveIndicator('idle') // Reset indicator when typing
          setLastSaveError(null)   // Clear previous errors
          
          saveTimeoutRef.current = setTimeout(async () => {
            try {
              setSaveIndicator('saving')
              await onSave(value)
              setSaveIndicator('saved')
              
              // Reset indicator after showing success
              setTimeout(() => setSaveIndicator('idle'), 2000)
            } catch (error) {
              setSaveIndicator('error')
              const errorMessage = error instanceof Error ? error.message : 'Save failed'
              setLastSaveError(errorMessage)
              console.error('Auto-save failed:', error)
            }
          }, 500) as unknown as NodeJS.Timeout
        }
      })
    } else {
      // Update existing model content if it's different
      if (model.getValue() !== content) {
        model.setValue(content)
      }
    }
    
    return model
  }, [onChange, onSave])

  const switchToFile = useCallback((monaco: Monaco, editor: editor.IStandaloneCodeEditor, fileId: string, filePath: string, content: string, language: string) => {
    const model = getOrCreateModel(monaco, fileId, filePath, content, language)
    editor.setModel(model)
    currentFileIdRef.current = fileId
  }, [getOrCreateModel])

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

  // Effect to handle file changes
  useEffect(() => {
    if (monacoRef.current && editorRef.current && fileId !== currentFileIdRef.current) {
      switchToFile(monacoRef.current, editorRef.current, fileId, filePath, initialValue, language)
    }
  }, [fileId, filePath, initialValue, language, switchToFile])

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
      return
    }
    
    // Create and set initial model
    const initialModel = getOrCreateModel(monaco, fileId, filePath, initialValue, language)
    editor.setModel(initialModel)
    currentFileIdRef.current = fileId
    
    // Enhanced manual save command with immediate execution
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, async () => {
      const model = editor.getModel()
      if (!model || !onSave) return

      // Cancel debounced save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }

      const value = model.getValue()
      setSaveIndicator('saving')
      setLastSaveError(null)

      try {
        await onSave(value)
        setSaveIndicator('saved')
        setTimeout(() => setSaveIndicator('idle'), 2000)
      } catch (error) {
        setSaveIndicator('error')
        const errorMessage = error instanceof Error ? error.message : 'Save failed'
        setLastSaveError(errorMessage)
        console.error('Manual save failed:', error)
      }
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
  }, [fileId, filePath, initialValue, language, getOrCreateModel, onSave])

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

  // Cleanup auto-save timeout and models
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
        saveTimeoutRef.current = null
      }
      
      // Dispose all models when component unmounts
      modelsRef.current.forEach(model => {
        try {
          model.dispose()
        } catch (error) {
          console.warn('Error disposing model:', error)
        }
      })
      modelsRef.current.clear()
    }
  }, [])

  // Clear error indicator when file changes
  useEffect(() => {
    setSaveIndicator('idle')
    setLastSaveError(null)
  }, [fileId, filePath])

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
    <div className={cn('relative h-full w-full', className)}>
      {/* Save Status Indicator */}
      {saveIndicator !== 'idle' && (
        <div
          className={cn(
            'absolute top-2 right-2 z-10 px-2 py-1 rounded text-xs font-medium shadow-md',
            {
              'bg-blue-500 text-white': saveIndicator === 'saving',
              'bg-green-500 text-white': saveIndicator === 'saved',
              'bg-red-500 text-white': saveIndicator === 'error',
            }
          )}
        >
          {saveIndicator === 'saving' && '💾 Saving...'}
          {saveIndicator === 'saved' && '✅ Saved'}
          {saveIndicator === 'error' && '❌ Save Failed'}
        </div>
      )}
      
      {/* Error Details Tooltip */}
      {saveIndicator === 'error' && lastSaveError && (
        <div className="absolute top-10 right-2 z-10 bg-red-100 border border-red-300 text-red-700 px-3 py-2 rounded text-xs max-w-xs shadow-lg">
          <div className="font-medium mb-1">Save Error:</div>
          <div className="break-words">{lastSaveError}</div>
          <div className="mt-2 text-xs opacity-75">
            Try saving again with Cmd+S
          </div>
        </div>
      )}

      <Editor
        key={retryCount} // Remove fileId from key to prevent re-mounting
        theme={theme === 'dark' ? 'velocity-dark' : 'velocity-light'}
        options={{
          ...MONACO_OPTIONS,
          readOnly,
        }}
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