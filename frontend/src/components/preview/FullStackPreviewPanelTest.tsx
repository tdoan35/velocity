import { FullStackPreviewPanel } from './FullStackPreviewPanel';
import { useProjectEditorStore } from '../../stores/useProjectEditorStore';
import { useEffect } from 'react';

// Mock data for testing
const mockFrontendFiles = {
  'frontend/App.tsx': {
    path: 'frontend/App.tsx',
    content: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello, Velocity!</Text>
      <Text style={styles.subtitle}>This is a test React Native app</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});`,
    type: 'typescript',
    lastModified: new Date(),
  },
  'frontend/package.json': {
    path: 'frontend/package.json',
    content: JSON.stringify({
      name: 'velocity-test-app',
      version: '1.0.0',
      main: 'App.tsx',
      dependencies: {
        'react': '18.2.0',
        'react-native': '0.72.0',
      },
    }, null, 2),
    type: 'json',
    lastModified: new Date(),
  },
};

const mockBackendFiles = {
  'backend/index.ts': {
    path: 'backend/index.ts',
    content: `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  return new Response(JSON.stringify({ message: 'Hello from backend!' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});`,
    type: 'typescript',
    lastModified: new Date(),
  },
};

export function FullStackPreviewPanelTest() {
  // Mock the store state
  useEffect(() => {
    const store = useProjectEditorStore.getState();
    
    // Set up mock data
    useProjectEditorStore.setState({
      projectId: 'test-project-123',
      projectData: {
        id: 'test-project-123',
        name: 'Test Project',
        description: 'A test project for preview panel',
        user_id: 'test-user',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        prd_sections: [],
      },
      frontendFiles: mockFrontendFiles,
      backendFiles: mockBackendFiles,
      buildStatus: 'success',
      isSupabaseConnected: true,
      deploymentUrl: 'https://snack.expo.dev/@test/velocity-test',
      isLoading: false,
      error: null,
    });

    // Cleanup function
    return () => {
      store.reset();
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-background p-8 pt-16">
      <div className="w-full max-w-6xl mx-auto border border-border rounded-lg overflow-auto" style={{ height: 'calc(100vh - 8rem)' }}>
        <FullStackPreviewPanel 
          projectId="test-project-123" 
        />
      </div>
    </div>
  );
}