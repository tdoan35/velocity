import { EnhancedEditorContainer } from './EnhancedEditorContainer';
import { useProjectEditorStore } from '../../stores/useProjectEditorStore';
import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { FileText, Code, Database, Settings } from 'lucide-react';

// Mock file contents for testing different file types
const mockFiles = {
  // Frontend React Native files
  'frontend/App.tsx': {
    path: 'frontend/App.tsx',
    content: `import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { supabase } from './lib/supabase';

interface User {
  id: string;
  email: string;
  name: string;
}

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    // Add user functionality here
    console.log('Add user pressed');
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Velocity App</Text>
        <Text style={styles.subtitle}>AI-powered mobile development</Text>
      </View>

      <TouchableOpacity style={styles.addButton} onPress={handleAddUser}>
        <Text style={styles.addButtonText}>Add User</Text>
      </TouchableOpacity>

      <View style={styles.userList}>
        {users.map((user) => (
          <View key={user.id} style={styles.userCard}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#6366f1',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#e0e7ff',
  },
  loadingText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 50,
    color: '#666',
  },
  addButton: {
    backgroundColor: '#10b981',
    margin: 20,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'semibold',
  },
  userList: {
    paddingHorizontal: 20,
  },
  userCard: {
    backgroundColor: 'white',
    padding: 15,
    marginBottom: 10,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'semibold',
    color: '#333',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
});`,
    type: 'typescript',
    lastModified: new Date(),
  },

  'frontend/lib/supabase.ts': {
    path: 'frontend/lib/supabase.ts',
    content: `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Types
export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          name: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          name: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          name?: string;
          updated_at?: string;
        };
      };
      projects: {
        Row: {
          id: string;
          name: string;
          description: string;
          user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string;
          user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          updated_at?: string;
        };
      };
    };
  };
}`,
    type: 'typescript',
    lastModified: new Date(),
  },

  'frontend/package.json': {
    path: 'frontend/package.json',
    content: JSON.stringify({
      name: 'velocity-mobile-app',
      version: '1.0.0',
      main: 'App.tsx',
      scripts: {
        start: 'expo start',
        android: 'expo start --android',
        ios: 'expo start --ios',
        web: 'expo start --web'
      },
      dependencies: {
        '@supabase/supabase-js': '^2.38.0',
        'expo': '~49.0.0',
        'react': '18.2.0',
        'react-native': '0.72.6',
        '@react-native-async-storage/async-storage': '1.19.3'
      },
      devDependencies: {
        '@babel/core': '^7.20.0',
        '@types/react': '~18.2.14',
        'typescript': '^5.1.3'
      }
    }, null, 2),
    type: 'json',
    lastModified: new Date(),
  },

  // Backend Supabase Edge Functions
  'backend/functions/users/index.ts': {
    path: 'backend/functions/users/index.ts',
    content: `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { method } = req;

    switch (method) {
      case 'GET':
        return await handleGetUsers(supabaseClient);
      case 'POST':
        return await handleCreateUser(supabaseClient, req);
      case 'PUT':
        return await handleUpdateUser(supabaseClient, req);
      case 'DELETE':
        return await handleDeleteUser(supabaseClient, req);
      default:
        return new Response('Method not allowed', { 
          status: 405, 
          headers: corsHeaders 
        });
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }), 
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function handleGetUsers(supabase: any) {
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return new Response(
    JSON.stringify({ users }), 
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

async function handleCreateUser(supabase: any, req: Request) {
  const { name, email } = await req.json();

  const { data: user, error } = await supabase
    .from('users')
    .insert([{ name, email }])
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return new Response(
    JSON.stringify({ user }), 
    { 
      status: 201,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

async function handleUpdateUser(supabase: any, req: Request) {
  const { id, name, email } = await req.json();

  const { data: user, error } = await supabase
    .from('users')
    .update({ name, email, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return new Response(
    JSON.stringify({ user }), 
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}

async function handleDeleteUser(supabase: any, req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    throw new Error('User ID is required');
  }

  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(error.message);
  }

  return new Response(
    JSON.stringify({ message: 'User deleted successfully' }), 
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}`,
    type: 'typescript',
    lastModified: new Date(),
  },

  // SQL Migration file
  'backend/migrations/20231120_create_users.sql': {
    path: 'backend/migrations/20231120_create_users.sql',
    content: `-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at 
  BEFORE UPDATE ON users 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS (Row Level Security)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view all users" ON users
  FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON users
  FOR INSERT WITH CHECK (auth.uid()::text = id::text);

CREATE POLICY "Users can update their own profile" ON users
  FOR UPDATE USING (auth.uid()::text = id::text);

-- Insert sample data
INSERT INTO users (email, name) VALUES
  ('john@example.com', 'John Doe'),
  ('jane@example.com', 'Jane Smith'),
  ('bob@example.com', 'Bob Johnson');`,
    type: 'sql',
    lastModified: new Date(),
  },

  // Configuration files
  'app.config.js': {
    path: 'app.config.js',
    content: `export default {
  expo: {
    name: 'Velocity Mobile App',
    slug: 'velocity-mobile-app',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#6366f1'
    },
    assetBundlePatterns: [
      '**/*'
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'com.velocity.mobileapp'
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#FFFFFF'
      },
      package: 'com.velocity.mobileapp'
    },
    web: {
      favicon: './assets/favicon.png'
    },
    plugins: [
      '@react-native-async-storage/async-storage'
    ],
    extra: {
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    }
  }
};`,
    type: 'javascript',
    lastModified: new Date(),
  },

  'README.md': {
    path: 'README.md',
    content: `# Velocity Mobile App

A React Native application built with Expo and Supabase for rapid mobile development.

## Features

- 📱 **Cross-platform**: Runs on iOS, Android, and Web
- 🚀 **Real-time**: Powered by Supabase for real-time data
- 🎨 **Modern UI**: Clean, responsive design
- 🔐 **Authentication**: Secure user authentication
- 📊 **Database**: PostgreSQL with Row Level Security

## Getting Started

### Prerequisites

- Node.js 18+ 
- Expo CLI
- Supabase account

### Installation

1. Clone the repository
2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Set up environment variables:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

4. Start the development server:
   \`\`\`bash
   npm run start
   \`\`\`

## Project Structure

\`\`\`
├── App.tsx              # Main app component
├── lib/
│   └── supabase.ts      # Supabase client configuration
├── components/          # Reusable UI components
├── screens/             # App screens
└── types/              # TypeScript type definitions
\`\`\`

## Backend

The backend uses Supabase Edge Functions written in TypeScript with Deno:

- **Functions**: API endpoints for user management
- **Database**: PostgreSQL with RLS policies
- **Authentication**: Built-in auth with JWT tokens

## Deployment

### Mobile App
- **iOS**: Deploy to App Store using EAS Build
- **Android**: Deploy to Google Play using EAS Build

### Backend
- **Functions**: Auto-deployed to Supabase Edge Runtime
- **Database**: Managed PostgreSQL on Supabase

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details.`,
    type: 'markdown',
    lastModified: new Date(),
  },
};

export function EnhancedEditorContainerTest() {
  const [securityLogs, setSecurityLogs] = useState<string[]>([]);
  const [performanceLogs, setPerformanceLogs] = useState<string[]>([]);

  // Mock security and performance monitoring callbacks
  const handleFileSave = (fileName: string, content: string, language: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setSecurityLogs(prev => [
      ...prev.slice(-4), // Keep last 5 logs
      `[${timestamp}] Security scan: ${fileName} (${language}) - ${content.length} chars - ✅ Safe`
    ]);
  };

  const handleFileOpen = (fileName: string, content: string, language: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setPerformanceLogs(prev => [
      ...prev.slice(-4), // Keep last 5 logs
      `[${timestamp}] Opened: ${fileName} (${language}) - ${content.length} chars loaded`
    ]);
  };

  // Initialize mock store data
  useEffect(() => {
    const store = useProjectEditorStore.getState();
    
    // Set up mock data
    useProjectEditorStore.setState({
      projectId: 'test-editor-project',
      frontendFiles: Object.fromEntries(
        Object.entries(mockFiles).filter(([path]) => 
          path.startsWith('frontend/') || !path.includes('/')
        )
      ),
      backendFiles: Object.fromEntries(
        Object.entries(mockFiles).filter(([path]) => 
          path.startsWith('backend/')
        )
      ),
      sharedFiles: {},
      openTabs: [],
      activeFile: null,
      buildStatus: 'success',
      isSupabaseConnected: true,
      isLoading: false,
      error: null,
    });

    // Cleanup function
    return () => {
      store.reset();
    };
  }, []);

  const openSampleFile = (filePath: string) => {
    const { openFile } = useProjectEditorStore.getState();
    openFile(filePath);
  };

  const openAllFiles = () => {
    const filePaths = Object.keys(mockFiles);
    const { openFile } = useProjectEditorStore.getState();
    
    filePaths.forEach((filePath) => {
      openFile(filePath);
    });
    
    // Set the first TypeScript file as active
    const firstTsFile = filePaths.find(path => path.endsWith('.tsx') || path.endsWith('.ts'));
    if (firstTsFile) {
      useProjectEditorStore.setState({ activeFile: firstTsFile });
    }
  };

  return (
    <div className="h-screen w-full flex flex-col bg-background">
      {/* Demo Header */}
      <div className="border-b bg-card px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Code className="h-5 w-5 text-primary" />
              <h1 className="font-semibold text-foreground">Enhanced Editor Container Demo</h1>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={() => openSampleFile('frontend/App.tsx')}>
              <FileText className="h-4 w-4 mr-2" />
              Open App.tsx
            </Button>
            <Button variant="outline" size="sm" onClick={() => openSampleFile('backend/functions/users/index.ts')}>
              <Database className="h-4 w-4 mr-2" />
              Open API Function
            </Button>
            <Button variant="outline" size="sm" onClick={openAllFiles}>
              <Settings className="h-4 w-4 mr-2" />
              Open All Files
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Editor */}
        <div className="flex-1">
          <EnhancedEditorContainer
            projectId="test-editor-project"
            projectType="full-stack"
            onFileSave={handleFileSave}
            onFileOpen={handleFileOpen}
          />
        </div>

        {/* Side Panel with Monitoring Info */}
        <div className="w-80 border-l bg-card flex flex-col">
          <div className="p-3 border-b">
            <h3 className="font-medium text-sm">Monitoring & Logs</h3>
          </div>

          {/* Security Monitoring */}
          <div className="p-3 border-b">
            <h4 className="font-medium text-xs text-muted-foreground mb-2">Security Scanning</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {securityLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Save files to see security scans</p>
              ) : (
                securityLogs.map((log, index) => (
                  <div key={index} className="text-xs font-mono text-green-600">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Performance Monitoring */}
          <div className="p-3 border-b">
            <h4 className="font-medium text-xs text-muted-foreground mb-2">Performance Tracking</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {performanceLogs.length === 0 ? (
                <p className="text-xs text-muted-foreground">Open files to see performance logs</p>
              ) : (
                performanceLogs.map((log, index) => (
                  <div key={index} className="text-xs font-mono text-blue-600">
                    {log}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Feature Info */}
          <div className="p-3 flex-1">
            <h4 className="font-medium text-xs text-muted-foreground mb-2">Editor Features</h4>
            <div className="space-y-2 text-xs">
              <div>• Monaco Editor with TypeScript support</div>
              <div>• Syntax highlighting for multiple languages</div>
              <div>• Auto-save with 1s debounce</div>
              <div>• Keyboard shortcuts (Ctrl/Cmd+S)</div>
              <div>• Tab management</div>
              <div>• File type detection</div>
              <div>• React Native & Supabase type definitions</div>
              <div>• Security & performance monitoring hooks</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}