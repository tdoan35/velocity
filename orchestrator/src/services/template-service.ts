import type { ProjectFile } from '../types';

export interface TemplateFile {
  file_path: string;
  content: string;
  file_type: 'javascript' | 'typescript' | 'css' | 'html' | 'json' | 'markdown' | 'text';
}

export class TemplateService {
  /**
   * Get template files for a specific project type
   */
  getTemplateFiles(templateType: string): TemplateFile[] {
    const templates: Record<string, TemplateFile[]> = {
      'react': this.getReactTemplate(),
      'react-native': this.getReactNativeTemplate(),
      'next': this.getNextTemplate(),
      'vue': this.getVueTemplate(),
      'svelte': this.getSvelteTemplate(),
    };
    
    return templates[templateType] || templates['react'];
  }

  /**
   * React template with Vite
   */
  private getReactTemplate(): TemplateFile[] {
    return [
      {
        file_path: 'src/App.jsx',
        content: `import { useState } from 'react'
import './App.css'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="App">
      <h1>Welcome to Velocity Preview!</h1>
      <p>This is a demo React application running in a preview container.</p>
      <p>Start editing your code and see changes instantly with hot reload.</p>
      
      <div className="card">
        <h2>Interactive Counter</h2>
        <button onClick={() => setCount((count) => count + 1)}>
          Count is {count}
        </button>
        <p>Click the button above to test reactivity!</p>
      </div>

      <div className="features">
        <h2>Preview Features</h2>
        <ul>
          <li>✅ Hot Module Replacement (HMR)</li>
          <li>✅ Real-time code synchronization</li>
          <li>✅ Instant preview updates</li>
          <li>✅ Full React development environment</li>
        </ul>
      </div>
    </div>
  )
}

export default App`,
        file_type: 'javascript'
      },
      {
        file_path: 'src/main.jsx',
        content: `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)`,
        file_type: 'javascript'
      },
      {
        file_path: 'src/App.css',
        content: `.App {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  line-height: 1.6;
  color: #333;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 1rem;
  color: #646cff;
  background: linear-gradient(45deg, #646cff, #747bff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

h2 {
  font-size: 1.5rem;
  margin-bottom: 1rem;
  color: #444;
}

p {
  font-size: 1.1rem;
  margin-bottom: 1.5rem;
  color: #666;
}

.card {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 12px;
  padding: 2rem;
  margin: 2rem 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  transition: transform 0.2s ease;
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

.features {
  background: #fff;
  border: 2px solid #646cff;
  border-radius: 12px;
  padding: 2rem;
  margin: 2rem 0;
}

.features ul {
  list-style: none;
  padding: 0;
  text-align: left;
  max-width: 400px;
  margin: 0 auto;
}

.features li {
  padding: 0.5rem 0;
  font-size: 1rem;
  color: #555;
}

button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.8em 1.6em;
  font-size: 1.1em;
  font-weight: 600;
  font-family: inherit;
  background: linear-gradient(45deg, #646cff, #747bff);
  color: white;
  cursor: pointer;
  transition: all 0.25s ease;
  border: none;
  box-shadow: 0 2px 4px rgba(100,108,255,0.3);
}

button:hover {
  background: linear-gradient(45deg, #535bf2, #646cff);
  transform: translateY(-1px);
  box-shadow: 0 4px 8px rgba(100,108,255,0.4);
}

button:active {
  transform: translateY(0);
  box-shadow: 0 2px 4px rgba(100,108,255,0.3);
}

@media (max-width: 600px) {
  .App {
    padding: 1rem;
  }
  
  h1 {
    font-size: 2rem;
  }
  
  .card, .features {
    padding: 1.5rem;
    margin: 1.5rem 0;
  }
}`,
        file_type: 'css'
      },
      {
        file_path: 'src/index.css',
        content: `:root {
  font-family: Inter, system-ui, Avenir, Helvetica, Arial, sans-serif;
  line-height: 1.5;
  font-weight: 400;

  color-scheme: light dark;
  color: rgba(255, 255, 255, 0.87);
  background-color: #242424;

  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}
a:hover {
  color: #535bf2;
}

body {
  margin: 0;
  display: flex;
  place-items: center;
  min-width: 320px;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

#root {
  width: 100%;
  margin: 0 auto;
  text-align: center;
}

@media (prefers-color-scheme: light) {
  :root {
    color: #213547;
    background-color: #ffffff;
  }
  
  body {
    background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);
  }
  
  a:hover {
    color: #747bff;
  }
  
  button {
    background-color: #f9f9f9;
  }
}`,
        file_type: 'css'
      },
      {
        file_path: 'index.html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/vite.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Velocity Preview - React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
        file_type: 'html'
      },
      {
        file_path: 'package.json',
        content: JSON.stringify({
          "name": "velocity-preview-react",
          "private": true,
          "version": "0.0.0",
          "type": "module",
          "scripts": {
            "dev": "vite --host 0.0.0.0 --port 3001 --strictPort",
            "build": "vite build",
            "lint": "eslint . --ext js,jsx --report-unused-disable-directives --max-warnings 0",
            "preview": "vite preview"
          },
          "dependencies": {
            "react": "^18.2.0",
            "react-dom": "^18.2.0"
          },
          "devDependencies": {
            "@types/react": "^18.2.15",
            "@types/react-dom": "^18.2.7",
            "@vitejs/plugin-react": "^4.0.3",
            "eslint": "^8.45.0",
            "eslint-plugin-react": "^7.32.2",
            "eslint-plugin-react-hooks": "^4.6.0",
            "eslint-plugin-react-refresh": "^0.4.3",
            "vite": "^4.4.5"
          }
        }, null, 2),
        file_type: 'json'
      },
      {
        file_path: 'vite.config.js',
        content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 3001,
    strictPort: true,
    cors: true,
    hmr: {
      port: 3001,
      host: '0.0.0.0'
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
})`,
        file_type: 'javascript'
      },
      {
        file_path: 'README.md',
        content: `# Velocity Preview - React Application

This is a demo React application running in a Velocity preview container.

## Features

- ⚡ **Vite** - Fast build tool and dev server
- ⚛️ **React 18** - Latest React with modern features
- 🔥 **Hot Module Replacement** - Instant updates as you code
- 🎨 **Modern CSS** - Responsive design with gradients and animations
- 📱 **Mobile Responsive** - Works great on all screen sizes

## Development

This project is automatically set up in your Velocity preview container with:

- Development server running on port 3001
- Hot reload enabled
- All dependencies pre-installed
- Real-time code synchronization

## Getting Started

1. Edit files in the \`src/\` directory
2. See changes instantly in the preview
3. Customize the components and styles
4. Build amazing applications with Velocity!

## Available Scripts

- \`npm run dev\` - Start development server
- \`npm run build\` - Build for production
- \`npm run preview\` - Preview production build

---

**Powered by Velocity** - The AI-powered mobile app development platform
`,
        file_type: 'markdown'
      }
    ];
  }

  /**
   * React Native template
   */
  private getReactNativeTemplate(): TemplateFile[] {
    return [
      {
        file_path: 'App.js',
        content: `import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';

export default function App() {
  const [count, setCount] = React.useState(0);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Welcome to Velocity Preview!</Text>
      <Text style={styles.subtitle}>React Native Development Environment</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Interactive Counter</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => setCount(count + 1)}
        >
          <Text style={styles.buttonText}>Count: {count}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.features}>
        <Text style={styles.featuresTitle}>Preview Features</Text>
        <Text style={styles.feature}>✅ React Native Components</Text>
        <Text style={styles.feature}>✅ Hot Reloading</Text>
        <Text style={styles.feature}>✅ Metro Bundler</Text>
        <Text style={styles.feature}>✅ Mobile-First Development</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginVertical: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    minWidth: 250,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  features: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginTop: 20,
    alignItems: 'center',
    minWidth: 250,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 15,
    color: '#333',
  },
  feature: {
    fontSize: 14,
    color: '#666',
    marginVertical: 2,
  },
});`,
        file_type: 'javascript'
      },
      {
        file_path: 'package.json',
        content: JSON.stringify({
          "name": "velocity-preview-react-native",
          "version": "0.0.1",
          "private": true,
          "scripts": {
            "android": "react-native run-android",
            "ios": "react-native run-ios",
            "start": "react-native start",
            "test": "jest",
            "lint": "eslint ."
          },
          "dependencies": {
            "react": "18.2.0",
            "react-native": "0.72.6"
          },
          "devDependencies": {
            "@babel/core": "^7.20.0",
            "@babel/preset-env": "^7.20.0",
            "@babel/runtime": "^7.20.0",
            "@react-native/eslint-config": "^0.72.2",
            "@react-native/metro-config": "^0.72.11",
            "@tsconfig/react-native": "^3.0.0",
            "@types/react": "^18.0.24",
            "@types/react-test-renderer": "^18.0.0",
            "babel-jest": "^29.2.1",
            "eslint": "^8.19.0",
            "jest": "^29.2.1",
            "metro-react-native-babel-preset": "0.76.8",
            "prettier": "^2.4.1",
            "react-test-renderer": "18.2.0",
            "typescript": "4.8.4"
          },
          "engines": {
            "node": ">=16"
          }
        }, null, 2),
        file_type: 'json'
      }
    ];
  }

  /**
   * Next.js template
   */
  private getNextTemplate(): TemplateFile[] {
    return [
      {
        file_path: 'pages/index.js',
        content: `import Head from 'next/head'
import { useState } from 'react'
import styles from '../styles/Home.module.css'

export default function Home() {
  const [count, setCount] = useState(0)

  return (
    <div className={styles.container}>
      <Head>
        <title>Velocity Preview - Next.js App</title>
        <meta name="description" content="Velocity Preview Next.js application" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>
          Welcome to Velocity Preview!
        </h1>

        <p className={styles.description}>
          Your Next.js development environment is ready
        </p>

        <div className={styles.card}>
          <h2>Interactive Counter</h2>
          <button 
            className={styles.button}
            onClick={() => setCount(count + 1)}
          >
            Count: {count}
          </button>
        </div>

        <div className={styles.grid}>
          <div className={styles.feature}>
            <h3>✅ Server-Side Rendering</h3>
            <p>Pre-rendered pages for optimal performance</p>
          </div>

          <div className={styles.feature}>
            <h3>✅ Hot Reloading</h3>
            <p>Instant updates as you develop</p>
          </div>

          <div className={styles.feature}>
            <h3>✅ API Routes</h3>
            <p>Built-in API functionality</p>
          </div>

          <div className={styles.feature}>
            <h3>✅ Optimized Builds</h3>
            <p>Production-ready optimization</p>
          </div>
        </div>
      </main>
    </div>
  )
}`,
        file_type: 'javascript'
      },
      {
        file_path: 'package.json',
        content: JSON.stringify({
          "name": "velocity-preview-nextjs",
          "version": "0.1.0",
          "private": true,
          "scripts": {
            "dev": "next dev -H 0.0.0.0 -p 3001",
            "build": "next build",
            "start": "next start",
            "lint": "next lint"
          },
          "dependencies": {
            "next": "13.5.6",
            "react": "^18",
            "react-dom": "^18"
          },
          "devDependencies": {
            "eslint": "^8",
            "eslint-config-next": "13.5.6"
          }
        }, null, 2),
        file_type: 'json'
      }
    ];
  }

  /**
   * Vue template
   */
  private getVueTemplate(): TemplateFile[] {
    return [
      {
        file_path: 'src/App.vue',
        content: `<template>
  <div id="app">
    <h1>Welcome to Velocity Preview!</h1>
    <p>Your Vue.js development environment is ready</p>
    
    <div class="card">
      <h2>Interactive Counter</h2>
      <button @click="increment">Count: {{ count }}</button>
    </div>

    <div class="features">
      <h2>Preview Features</h2>
      <ul>
        <li>✅ Vue 3 Composition API</li>
        <li>✅ Hot Module Replacement</li>
        <li>✅ Vite Development Server</li>
        <li>✅ Single File Components</li>
      </ul>
    </div>
  </div>
</template>

<script>
import { ref } from 'vue'

export default {
  name: 'App',
  setup() {
    const count = ref(0)
    
    const increment = () => {
      count.value++
    }
    
    return {
      count,
      increment
    }
  }
}
</script>

<style>
#app {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h1 {
  color: #42b883;
  font-size: 2.5rem;
  margin-bottom: 1rem;
}

.card {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 2rem;
  margin: 2rem 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

button {
  background: #42b883;
  color: white;
  border: none;
  padding: 0.8rem 1.6rem;
  border-radius: 8px;
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.3s ease;
}

button:hover {
  background: #369870;
  transform: translateY(-1px);
}
</style>`,
        file_type: 'javascript'
      }
    ];
  }

  /**
   * Svelte template  
   */
  private getSvelteTemplate(): TemplateFile[] {
    return [
      {
        file_path: 'src/App.svelte',
        content: `<script>
  let count = 0;
  
  function increment() {
    count += 1;
  }
</script>

<main>
  <h1>Welcome to Velocity Preview!</h1>
  <p>Your Svelte development environment is ready</p>
  
  <div class="card">
    <h2>Interactive Counter</h2>
    <button on:click={increment}>
      Count: {count}
    </button>
  </div>

  <div class="features">
    <h2>Preview Features</h2>
    <ul>
      <li>✅ Svelte Compiler</li>
      <li>✅ Hot Module Replacement</li>
      <li>✅ Vite Development Server</li>
      <li>✅ Reactive Programming</li>
    </ul>
  </div>
</main>

<style>
  main {
    max-width: 800px;
    margin: 0 auto;
    padding: 2rem;
    text-align: center;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  h1 {
    color: #ff3e00;
    font-size: 2.5rem;
    margin-bottom: 1rem;
  }

  .card {
    background: #f8f9fa;
    border-radius: 12px;
    padding: 2rem;
    margin: 2rem 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  }

  button {
    background: #ff3e00;
    color: white;
    border: none;
    padding: 0.8rem 1.6rem;
    border-radius: 8px;
    font-size: 1.1rem;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  button:hover {
    background: #e6360d;
    transform: translateY(-1px);
  }
</style>`,
        file_type: 'javascript'
      }
    ];
  }

  /**
   * Convert template files to project file format for database storage
   */
  convertToProjectFiles(templateFiles: TemplateFile[], projectId: string): Omit<ProjectFile, 'id' | 'created_at' | 'updated_at'>[] {
    return templateFiles.map(file => ({
      project_id: projectId,
      file_path: file.file_path,
      content: file.content,
      file_type: file.file_type,
      size: file.content.length,
      version: 1,
      is_directory: false,
    }));
  }

  /**
   * Get supported template types
   */
  getSupportedTemplateTypes(): string[] {
    return ['react', 'react-native', 'next', 'vue', 'svelte'];
  }

  /**
   * Check if a template type is supported
   */
  isTemplateTypeSupported(templateType: string): boolean {
    return this.getSupportedTemplateTypes().includes(templateType);
  }
}