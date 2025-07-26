import { useState, useEffect } from 'react'
import { EditorContainer } from '@/components/editor/editor-container'
import { CollapsiblePanel } from '@/components/layout/collapsible-panel'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { useEditorStore } from '@/stores/useEditorStore'
import { FolderOpen, FilePlus, Save } from 'lucide-react'
import { EditorDebug } from '@/components/editor/editor-debug'

const DEMO_FILES = [
  {
    id: 'app-tsx',
    path: '/src/App.tsx',
    content: `import React from 'react'
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native'

interface AppProps {
  title: string
  onPress?: () => void
}

export default function App({ title, onPress }: AppProps) {
  const [count, setCount] = React.useState(0)

  const handlePress = () => {
    setCount(count + 1)
    onPress?.()
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <TouchableOpacity 
        style={styles.button} 
        onPress={handlePress}
      >
        <Text style={styles.buttonText}>
          Clicked {count} times
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007bff',
    padding: 15,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
})`,
  },
  {
    id: 'components-tsx',
    path: '/src/components/Button.tsx',
    content: `import React from 'react'
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary' | 'danger'
  style?: ViewStyle
  textStyle?: TextStyle
  disabled?: boolean
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  style,
  textStyle,
  disabled = false,
}) => {
  const buttonStyles = [
    styles.button,
    styles[variant],
    disabled && styles.disabled,
    style,
  ]

  const textStyles = [
    styles.text,
    styles[\`\${variant}Text\`],
    disabled && styles.disabledText,
    textStyle,
  ]

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={textStyles}>{title}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: '#007bff',
  },
  secondary: {
    backgroundColor: '#6c757d',
  },
  danger: {
    backgroundColor: '#dc3545',
  },
  disabled: {
    opacity: 0.6,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryText: {
    color: '#ffffff',
  },
  secondaryText: {
    color: '#ffffff',
  },
  dangerText: {
    color: '#ffffff',
  },
  disabledText: {
    color: '#cccccc',
  },
})`,
  },
  {
    id: 'utils-ts',
    path: '/src/utils/helpers.ts',
    content: `// Utility functions for React Native app

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    
    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}`,
  },
]

export function EditorDemo() {
  const { openFile, tabs } = useEditorStore()
  const [savedFiles, setSavedFiles] = useState<Record<string, string>>({})

  // Load demo files on mount
  useEffect(() => {
    // Open the first demo file by default
    if (tabs.length === 0 && DEMO_FILES.length > 0) {
      const firstFile = DEMO_FILES[0]
      openFile(firstFile.id, firstFile.path, firstFile.content)
    }
  }, [])

  const handleSave = (fileId: string, content: string) => {
    setSavedFiles(prev => ({
      ...prev,
      [fileId]: content,
    }))
    console.log(`Saved file ${fileId}:`, content)
  }

  const handleOpenDemoFile = (file: typeof DEMO_FILES[0]) => {
    openFile(file.id, file.path, file.content)
  }

  const fileExplorer = (
    <div className="h-full p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Explorer</h3>
        <Button size="icon" variant="ghost" className="h-6 w-6">
          <FilePlus className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="space-y-1">
        <div className="text-xs font-medium text-muted-foreground">DEMO FILES</div>
        {DEMO_FILES.map((file) => {
          const fileName = file.path.split('/').pop()
          const isOpen = tabs.some(tab => tab.id === file.id)
          
          return (
            <button
              key={file.id}
              onClick={() => handleOpenDemoFile(file)}
              className={cn(
                'flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent',
                isOpen && 'bg-accent'
              )}
            >
              <FolderOpen className="h-4 w-4" />
              <span className="truncate">{fileName}</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="flex h-screen flex-col">
      <div className="border-b bg-background p-4">
        <h1 className="text-2xl font-bold">Monaco Editor Integration</h1>
        <p className="text-sm text-muted-foreground">
          Full-featured code editor with React Native TypeScript support
        </p>
      </div>
      
      <div className="flex flex-1 overflow-hidden">
        <CollapsiblePanel
          side="left"
          expandedWidth="w-64"
          collapsedWidth="w-12"
          className="border-r bg-muted/20"
        >
          {fileExplorer}
        </CollapsiblePanel>
        
        <div className="flex-1">
          <EditorContainer onSave={handleSave} />
        </div>
        
        <div className="w-80 border-l bg-muted/10 p-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Editor Features</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Save className="h-4 w-4 text-muted-foreground" />
                <span>Auto-save with 500ms debounce</span>
              </div>
              <div>• React Native TypeScript support</div>
              <div>• IntelliSense & auto-completion</div>
              <div>• Syntax highlighting</div>
              <div>• Error checking</div>
              <div>• Format on paste/type</div>
              <div>• Theme synchronization</div>
              
              <div className="mt-4 space-y-1">
                <div className="font-semibold">Keyboard Shortcuts:</div>
                <div className="text-xs text-muted-foreground">
                  <div>Ctrl/Cmd + S - Save file</div>
                  <div>Ctrl/Cmd + Shift + F - Format document</div>
                  <div>Ctrl/Cmd + . - Quick fix</div>
                  <div>F12 - Go to definition</div>
                  <div>Shift + F12 - Find references</div>
                  <div>F2 - Rename symbol</div>
                </div>
              </div>
              
              {Object.keys(savedFiles).length > 0 && (
                <div className="mt-4">
                  <div className="font-semibold">Saved Files:</div>
                  <div className="mt-1 space-y-1">
                    {Object.entries(savedFiles).map(([fileId, content]) => (
                      <div key={fileId} className="text-xs text-muted-foreground">
                        {fileId} ({content.length} chars)
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <EditorDebug />
    </div>
  )
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}