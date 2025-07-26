import { useEffect } from 'react'
import { FileExplorer } from '@/components/file-explorer/file-explorer'
import { EditorContainer } from '@/components/editor/editor-container'
import { useFileSystemStore } from '@/stores/useFileSystemStore'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import type { FileNode } from '@/types/store'

const DEMO_FILE_TREE: FileNode = {
  id: 'root',
  name: 'my-app',
  path: '/',
  type: 'directory',
  children: [
    {
      id: 'src',
      name: 'src',
      path: '/src',
      type: 'directory',
      parentId: 'root',
      children: [
        {
          id: 'app-tsx',
          name: 'App.tsx',
          path: '/src/App.tsx',
          type: 'file',
          parentId: 'src',
          content: `import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { Button } from './components/Button'

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>My React Native App</Text>
      <Button title="Get Started" onPress={() => console.log('Pressed')} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
})`,
        },
        {
          id: 'index-ts',
          name: 'index.ts',
          path: '/src/index.ts',
          type: 'file',
          parentId: 'src',
          content: `import { AppRegistry } from 'react-native'
import App from './App'
import { name as appName } from './app.json'

AppRegistry.registerComponent(appName, () => App)`,
        },
        {
          id: 'components',
          name: 'components',
          path: '/src/components',
          type: 'directory',
          parentId: 'src',
          children: [
            {
              id: 'button-tsx',
              name: 'Button.tsx',
              path: '/src/components/Button.tsx',
              type: 'file',
              parentId: 'components',
              content: `import React from 'react'
import { TouchableOpacity, Text, StyleSheet } from 'react-native'

interface ButtonProps {
  title: string
  onPress: () => void
  variant?: 'primary' | 'secondary'
}

export function Button({ title, onPress, variant = 'primary' }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, styles[variant]]}
      onPress={onPress}
    >
      <Text style={styles.text}>{title}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  primary: {
    backgroundColor: '#007bff',
  },
  secondary: {
    backgroundColor: '#6c757d',
  },
  text: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
})`,
            },
            {
              id: 'card-tsx',
              name: 'Card.tsx',
              path: '/src/components/Card.tsx',
              type: 'file',
              parentId: 'components',
              content: `import React from 'react'
import { View, StyleSheet, ViewProps } from 'react-native'

interface CardProps extends ViewProps {
  children: React.ReactNode
}

export function Card({ children, style, ...props }: CardProps) {
  return (
    <View style={[styles.card, style]} {...props}>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
})`,
            },
          ],
        },
        {
          id: 'utils',
          name: 'utils',
          path: '/src/utils',
          type: 'directory',
          parentId: 'src',
          children: [
            {
              id: 'helpers-ts',
              name: 'helpers.ts',
              path: '/src/utils/helpers.ts',
              type: 'file',
              parentId: 'utils',
              content: `export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US').format(date)
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}`,
            },
          ],
        },
      ],
    },
    {
      id: 'package-json',
      name: 'package.json',
      path: '/package.json',
      type: 'file',
      parentId: 'root',
      content: `{
  "name": "my-app",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "android": "react-native run-android",
    "ios": "react-native run-ios",
    "start": "react-native start",
    "test": "jest",
    "lint": "eslint . --ext .js,.jsx,.ts,.tsx"
  },
  "dependencies": {
    "react": "18.2.0",
    "react-native": "0.73.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-native": "^0.73.0",
    "typescript": "^5.0.0"
  }
}`,
    },
    {
      id: 'readme',
      name: 'README.md',
      path: '/README.md',
      type: 'file',
      parentId: 'root',
      content: `# My React Native App

This is a sample React Native application demonstrating the file explorer component.

## Features

- 📁 File Explorer with tree view
- ✏️ Monaco Editor integration
- 🎨 Syntax highlighting
- 📝 File operations (create, rename, delete)
- 🔍 Search functionality
- 🖱️ Drag and drop support

## Getting Started

1. Install dependencies: \`npm install\`
2. Run the app: \`npm start\`
`,
    },
  ],
}

export function FileExplorerDemo() {
  const { setFileTree } = useFileSystemStore()

  useEffect(() => {
    // Initialize demo file tree
    setFileTree(DEMO_FILE_TREE)
  }, [setFileTree])

  const handleFileSave = (fileId: string, content: string) => {
    console.log(`Saving file ${fileId} with content:`, content)
    // In a real app, this would save to a backend
  }

  return (
    <div className="flex h-screen">
      <div className="w-64 border-r bg-muted/20">
        <FileExplorer
          className="h-full"
          onFileSelect={(file) => console.log('Selected file:', file.path)}
        />
      </div>
      
      <div className="flex-1 flex flex-col">
        <EditorContainer
          className="flex-1"
          onSave={handleFileSave}
        />
      </div>
      
      <div className="w-80 border-l bg-muted/10 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">File Explorer Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="space-y-1">
              <div className="font-semibold">File Operations:</div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Right-click on files/folders for context menu</li>
                <li>Create new files and folders</li>
                <li>Rename items inline</li>
                <li>Delete with confirmation</li>
                <li>Drag and drop to reorganize</li>
              </ul>
            </div>
            
            <div className="space-y-1">
              <div className="font-semibold">Navigation:</div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Click folders to expand/collapse</li>
                <li>Click files to open in editor</li>
                <li>Search to filter file tree</li>
                <li>Auto-expand when searching</li>
              </ul>
            </div>
            
            <div className="space-y-1">
              <div className="font-semibold">File Icons:</div>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>TypeScript/JavaScript - Blue</li>
                <li>Python/Ruby - Yellow</li>
                <li>Java/Kotlin - Orange</li>
                <li>C/C++/C# - Purple</li>
                <li>Go/Rust - Cyan</li>
                <li>JSON/YAML - Green</li>
                <li>Images - Pink</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}