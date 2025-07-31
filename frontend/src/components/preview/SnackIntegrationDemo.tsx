import React, { useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Code2, Package, Smartphone } from 'lucide-react';
import { SnackPreviewPanel } from './SnackPreviewPanel';
import { DependencyManager } from '../editor/DependencyManager';
import { editor as MonacoEditor } from 'monaco-editor';
import { SnackEditorIntegration } from '../editor/SnackEditorIntegration';
import { v4 as uuidv4 } from 'uuid';

// Sample React Native code
const SAMPLE_CODE = `import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';

export default function App() {
  const [count, setCount] = React.useState(0);
  const fadeAnim = React.useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    setCount(count + 1);
    
    // Animate the button press
    Animated.sequence([
      Animated.timing(fadeAnim, {
        toValue: 0.7,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Velocity!</Text>
      <Text style={styles.subtitle}>
        Build React Native apps with live preview
      </Text>
      
      <Animated.View style={{ opacity: fadeAnim }}>
        <TouchableOpacity style={styles.button} onPress={handlePress}>
          <Text style={styles.buttonText}>Count: {count}</Text>
        </TouchableOpacity>
      </Animated.View>
      
      <Text style={styles.info}>
        Tap the button to see state updates in real-time
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  info: {
    marginTop: 30,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});`;

export function SnackIntegrationDemo() {
  const [sessionId] = useState(() => uuidv4());
  const [editor, setEditor] = useState<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const [files, setFiles] = useState({
    'App.js': {
      type: 'CODE',
      contents: SAMPLE_CODE,
    },
  });
  const [dependencies, setDependencies] = useState<Record<string, string>>({
    'react': '^18.2.0',
    'react-native': '^0.74.0',
  });

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-2xl font-bold">Expo Snack Integration Demo</h2>
        <p className="text-muted-foreground mt-1">
          Live preview of React Native code with Expo Snack
        </p>
      </div>

      <div className="flex-1 flex">
        {/* Editor and Dependencies */}
        <div className="w-1/2 border-r">
          <Tabs defaultValue="code" className="h-full flex flex-col">
            <TabsList className="mx-4 mt-4">
              <TabsTrigger value="code" className="gap-2">
                <Code2 className="w-4 h-4" />
                Code
              </TabsTrigger>
              <TabsTrigger value="dependencies" className="gap-2">
                <Package className="w-4 h-4" />
                Dependencies
              </TabsTrigger>
            </TabsList>

            <TabsContent value="code" className="flex-1 p-4">
              <Card className="h-full p-4">
                <div className="h-full">
                  {/* In a real implementation, you'd use Monaco Editor here */}
                  <textarea
                    className="w-full h-full font-mono text-sm p-4 border rounded"
                    value={files['App.js'].contents}
                    onChange={(e) => {
                      setFiles({
                        ...files,
                        'App.js': {
                          type: 'CODE',
                          contents: e.target.value,
                        },
                      });
                    }}
                  />
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="dependencies" className="flex-1 p-4">
              <DependencyManager
                dependencies={dependencies}
                onDependenciesChange={setDependencies}
                className="h-full"
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Preview Panel */}
        <div className="w-1/2">
          <SnackPreviewPanel
            sessionId={sessionId}
            className="h-full"
            onSessionReady={(session) => {
              console.log('Snack session ready:', session);
            }}
          />
        </div>
      </div>

      {/* Editor Integration (invisible component) */}
      {editor && (
        <SnackEditorIntegration
          editor={editor}
          sessionId={sessionId}
          currentFile="App.js"
          files={files}
          dependencies={dependencies}
          onFilesUpdate={setFiles}
          onDependenciesUpdate={setDependencies}
        />
      )}
    </div>
  );
}