import type { FileTree } from '../types/editor';

export const getDefaultFrontendFiles = (projectName: string = 'My Velocity App'): FileTree => ({
  'frontend/App.tsx': {
    path: 'frontend/App.tsx',
    content: `import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HomeScreen } from './screens/HomeScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: any = 'home';
            
            if (route.name === 'Home') {
              iconName = focused ? 'home' : 'home-outline';
            }
            
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#6366f1',
          tabBarInactiveTintColor: 'gray',
          headerStyle: {
            backgroundColor: '#6366f1',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        })}
      >
        <Tab.Screen 
          name="Home" 
          component={HomeScreen}
          options={{
            title: '${projectName}',
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}`,
    type: 'typescript',
    lastModified: new Date(),
  },

  'frontend/screens/HomeScreen.tsx': {
    path: 'frontend/screens/HomeScreen.tsx',
    content: `import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export function HomeScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="rocket" size={64} color="#6366f1" />
        <Text style={styles.title}>Welcome to ${projectName}!</Text>
        <Text style={styles.subtitle}>
          Your app is ready to customize. Start building amazing features!
        </Text>
      </View>

      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="add-circle" size={24} color="#fff" />
          <Text style={styles.actionText}>Add Features</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.actionButton, styles.secondaryButton]}>
          <Ionicons name="settings" size={24} color="#6366f1" />
          <Text style={[styles.actionText, styles.secondaryText]}>Settings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>
          Built with Velocity - AI-powered mobile development
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginTop: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 24,
  },
  actionsContainer: {
    marginBottom: 48,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6366f1',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#6366f1',
  },
  actionText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryText: {
    color: '#6366f1',
  },
  infoContainer: {
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
});`,
    type: 'typescript',
    lastModified: new Date(),
  },

  'frontend/package.json': {
    path: 'frontend/package.json',
    content: JSON.stringify({
      name: projectName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      main: 'App.tsx',
      scripts: {
        start: 'expo start',
        android: 'expo start --android',
        ios: 'expo start --ios',
        web: 'expo start --web'
      },
      dependencies: {
        '@react-navigation/native': '^6.1.7',
        '@react-navigation/bottom-tabs': '^6.5.8',
        'expo': '~49.0.0',
        'react': '18.2.0',
        'react-native': '0.72.6',
        '@expo/vector-icons': '^13.0.0'
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

  'frontend/app.json': {
    path: 'frontend/app.json',
    content: JSON.stringify({
      expo: {
        name: projectName,
        slug: projectName.toLowerCase().replace(/\s+/g, '-'),
        version: '1.0.0',
        orientation: 'portrait',
        icon: './assets/icon.png',
        userInterfaceStyle: 'light',
        splash: {
          image: './assets/splash.png',
          resizeMode: 'contain',
          backgroundColor: '#ffffff'
        },
        assetBundlePatterns: ['**/*'],
        ios: {
          supportsTablet: true
        },
        android: {
          adaptiveIcon: {
            foregroundImage: './assets/adaptive-icon.png',
            backgroundColor: '#FFFFFF'
          }
        },
        web: {
          favicon: './assets/favicon.png'
        }
      }
    }, null, 2),
    type: 'json',
    lastModified: new Date(),
  },

  'frontend/README.md': {
    path: 'frontend/README.md',
    content: `# ${projectName}

A React Native app built with Velocity - AI-powered mobile development platform.

## Getting Started

1. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

2. Start the development server:
   \`\`\`bash
   npm start
   \`\`\`

3. Use the Expo Go app to scan the QR code and preview your app on your device.

## Features

- Cross-platform React Native application
- Modern navigation with React Navigation
- TypeScript support
- Expo development workflow

## Development

This app was generated by Velocity. You can continue building features using the Velocity editor or modify the code directly.

## Learn More

- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Expo Documentation](https://docs.expo.dev/)
- [Velocity Platform](https://velocity.dev)
`,
    type: 'markdown',
    lastModified: new Date(),
  },
});

export const getDefaultBackendFiles = (projectName: string = 'My Velocity App'): FileTree => ({
  'backend/supabase/migrations/001_initial_schema.sql': {
    path: 'backend/supabase/migrations/001_initial_schema.sql',
    content: `-- Initial database schema for ${projectName}
-- This file contains basic tables to get started

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create profiles table for user data
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile" ON profiles 
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles 
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON profiles 
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create function to handle user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user creation
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();`,
    type: 'sql',
    lastModified: new Date(),
  },

  'backend/supabase/functions/hello-world/index.ts': {
    path: 'backend/supabase/functions/hello-world/index.ts',
    content: `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const data = {
      message: 'Hello from ${projectName}!',
      timestamp: new Date().toISOString(),
      function: 'hello-world',
    };

    return new Response(
      JSON.stringify(data),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});`,
    type: 'typescript',
    lastModified: new Date(),
  },

  'backend/supabase/config.toml': {
    path: 'backend/supabase/config.toml',
    content: `# Supabase configuration file for ${projectName}

[api]
enabled = true
port = 54321
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
max_rows = 1000

[auth]
enabled = true
site_url = "http://localhost:3000"
additional_redirect_urls = ["https://localhost:3000"]
jwt_expiry = 3600
enable_signup = true
enable_anonymous_sign_ins = false
enable_email_confirmations = false

[auth.email]
enable_signup = true
double_confirm_changes = true
enable_confirmations = false

[db]
port = 54322
shadow_port = 54320
major_version = 15

[realtime]
enabled = true
ip_version = "IPv4"

[studio]
enabled = true
port = 54323
api_url = "http://localhost:54321"

[storage]
enabled = true
file_size_limit = "50MiB"
`,
    type: 'toml',
    lastModified: new Date(),
  },

  'backend/README.md': {
    path: 'backend/README.md',
    content: `# ${projectName} Backend

Supabase backend configuration for ${projectName}.

## Setup

1. Install the Supabase CLI:
   \`\`\`bash
   npm install -g supabase
   \`\`\`

2. Login to Supabase:
   \`\`\`bash
   supabase login
   \`\`\`

3. Initialize the project (if not already done):
   \`\`\`bash
   supabase init
   \`\`\`

4. Start the local development server:
   \`\`\`bash
   supabase start
   \`\`\`

## Database Migrations

- Migrations are stored in \`supabase/migrations/\`
- Create new migrations with: \`supabase migration new <name>\`
- Apply migrations with: \`supabase db push\`

## Edge Functions

- Functions are stored in \`supabase/functions/\`
- Deploy functions with: \`supabase functions deploy <name>\`
- Test locally with: \`supabase functions serve\`

## Environment Variables

Create a \`.env.local\` file with:

\`\`\`
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
\`\`\`

## Learn More

- [Supabase Documentation](https://supabase.com/docs)
- [Supabase CLI Reference](https://supabase.com/docs/reference/cli)
`,
    type: 'markdown',
    lastModified: new Date(),
  },
});

export const getDefaultSharedFiles = (projectName: string = 'My Velocity App'): FileTree => ({
  'README.md': {
    path: 'README.md',
    content: `# ${projectName}

A full-stack mobile application built with Velocity.

## Project Structure

- \`frontend/\` - React Native mobile application
- \`backend/\` - Supabase backend configuration
- \`shared/\` - Shared types and utilities

## Getting Started

### Frontend Development

1. Navigate to the frontend directory:
   \`\`\`bash
   cd frontend
   \`\`\`

2. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`

3. Start the Expo development server:
   \`\`\`bash
   npm start
   \`\`\`

### Backend Development

1. Navigate to the backend directory:
   \`\`\`bash
   cd backend
   \`\`\`

2. Start Supabase locally:
   \`\`\`bash
   supabase start
   \`\`\`

## Development Workflow

1. Use the Velocity editor to modify your application
2. Preview changes in real-time using the built-in simulator
3. Deploy to production when ready

## Tech Stack

- **Frontend**: React Native, Expo, TypeScript
- **Backend**: Supabase (PostgreSQL, Edge Functions)
- **Development**: Velocity Platform

## Learn More

- [React Native Documentation](https://reactnative.dev/)
- [Supabase Documentation](https://supabase.com/docs)
- [Velocity Platform](https://velocity.dev)
`,
    type: 'markdown',
    lastModified: new Date(),
  },

  '.gitignore': {
    path: '.gitignore',
    content: `# Dependencies
node_modules/
.npm
.yarn/cache
.yarn/unplugged
.yarn/build-state.yml
.yarn/install-state.gz

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Build outputs
dist/
build/
.expo/
.expo-shared/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# Supabase
.branches
.temp

# Temporary files
tmp/
temp/
`,
    type: 'text',
    lastModified: new Date(),
  },
});