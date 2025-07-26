import { useState } from 'react'
import { ChatInterface } from '@/components/chat/chat-interface'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Card } from '@/components/ui/card'
// import { useEditorStore } from '@/stores/useEditorStore' // For future use
import MonacoEditor from '@monaco-editor/react'
import { MONACO_OPTIONS } from '@/components/editor/monaco-config'

export function ChatInterfaceDemo() {
  const [appliedCode, setAppliedCode] = useState<string>('')
  // const { tabs, activeTabId } = useEditorStore() // For future use
  // const activeTab = tabs.find(tab => tab.id === activeTabId) // For future use

  const handleApplyCode = (code: string) => {
    setAppliedCode(code)
    // In a real app, this would update the editor with the code
    console.log('Applying code:', code)
  }

  // Sample React Native code for demonstration
  const sampleCode = `import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
}

export function Button({ title, onPress, variant = 'primary' }: ButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.button, styles[variant]]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={[styles.text, styles[\`\${variant}Text\`]]}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: '#007AFF',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: '#007AFF',
  },
});`

  return (
    <div className="h-screen bg-background flex flex-col">
      <div className="p-6 border-b">
        <h1 className="text-2xl font-bold">AI Assistant Demo</h1>
        <p className="text-muted-foreground mt-2">
          Interactive AI chat with code suggestions and contextual help
        </p>
      </div>

      <ResizablePanelGroup direction="horizontal" className="flex-1">
        <ResizablePanel defaultSize={60} minSize={30}>
          <div className="h-full p-4">
            <Card className="h-full overflow-hidden">
              <div className="p-4 border-b">
                <h2 className="font-semibold">Code Editor</h2>
                <p className="text-sm text-muted-foreground">
                  React Native Component
                </p>
              </div>
              <div className="h-[calc(100%-80px)]">
                <MonacoEditor
                  height="100%"
                  defaultLanguage="typescript"
                  defaultValue={sampleCode}
                  value={appliedCode || sampleCode}
                  options={{
                    ...MONACO_OPTIONS,
                    minimap: { enabled: false },
                    fontSize: 13,
                  }}
                  theme="vs-dark"
                />
              </div>
            </Card>
          </div>
        </ResizablePanel>

        <ResizableHandle />

        <ResizablePanel defaultSize={40} minSize={25}>
          <div className="h-full p-4">
            <Card className="h-full overflow-hidden">
              <ChatInterface
                className="h-full"
                onApplyCode={handleApplyCode}
              />
            </Card>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <div className="p-4 border-t bg-muted/50">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>💡 Try commands: /help, /explain, /refactor</span>
          <span>•</span>
          <span>Press Ctrl+K to focus chat</span>
          <span>•</span>
          <span>Click "Apply" on code suggestions to update editor</span>
        </div>
      </div>
    </div>
  )
}