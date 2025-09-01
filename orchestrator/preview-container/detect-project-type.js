/**
 * Project Type Detection for Velocity Preview Container
 * 
 * Analyzes project structure to determine the appropriate
 * development server and build configuration.
 */

const fs = require('fs-extra');
const path = require('path');

/**
 * Detect project type based on files and configuration
 */
async function detectProjectType(projectDir) {
  try {
    const files = await fs.readdir(projectDir);
    let packageJson = null;

    // Try to read package.json if it exists
    if (files.includes('package.json')) {
      try {
        packageJson = await fs.readJSON(path.join(projectDir, 'package.json'));
      } catch (error) {
        console.warn('Failed to read package.json:', error);
      }
    }

    // Detection logic based on files and dependencies
    const projectType = {
      type: 'unknown',
      framework: 'unknown',
      devServer: 'static',
      port: 3001,
      commands: {
        install: 'npm install',
        dev: 'python3 -m http.server 3001',
        build: null,
      }
    };

    // Expo React Native project
    if (files.includes('app.json') || files.includes('app.config.js') || 
        (packageJson?.dependencies?.['@expo/vector-icons'] || packageJson?.dependencies?.['expo'])) {
      projectType.type = 'react-native';
      projectType.framework = 'expo';
      projectType.devServer = 'expo';
      projectType.commands = {
        install: 'npm install',
        dev: 'npx expo start --web --port 3001',
        build: 'npx expo build:web',
      };
    }
    
    // React project with Vite
    else if (files.includes('vite.config.js') || files.includes('vite.config.ts') ||
             packageJson?.devDependencies?.['vite']) {
      projectType.type = 'react';
      projectType.framework = 'vite';
      projectType.devServer = 'vite';
      projectType.commands = {
        install: 'npm install',
        dev: 'npm run dev',
        build: 'npm run build',
      };
    }
    
    // React project with Create React App
    else if (packageJson?.dependencies?.['react-scripts']) {
      projectType.type = 'react';
      projectType.framework = 'create-react-app';
      projectType.devServer = 'webpack';
      projectType.commands = {
        install: 'npm install',
        dev: 'npm start',
        build: 'npm run build',
      };
    }
    
    // Next.js project
    else if (files.includes('next.config.js') || packageJson?.dependencies?.['next']) {
      projectType.type = 'react';
      projectType.framework = 'nextjs';
      projectType.devServer = 'next';
      projectType.port = 3000;
      projectType.commands = {
        install: 'npm install',
        dev: 'npm run dev',
        build: 'npm run build',
      };
    }
    
    // Vue.js project
    else if (files.includes('vue.config.js') || packageJson?.dependencies?.['vue']) {
      projectType.type = 'vue';
      projectType.framework = 'vue';
      projectType.devServer = 'vite';
      projectType.commands = {
        install: 'npm install',
        dev: 'npm run dev',
        build: 'npm run build',
      };
    }
    
    // Generic Node.js project
    else if (packageJson && packageJson.scripts) {
      projectType.type = 'nodejs';
      projectType.framework = 'custom';
      
      // Try to determine dev command
      if (packageJson.scripts.dev) {
        projectType.commands.dev = 'npm run dev';
        projectType.devServer = 'custom';
      } else if (packageJson.scripts.start) {
        projectType.commands.dev = 'npm start';
        projectType.devServer = 'custom';
      }
    }
    
    // Static HTML project
    else if (files.includes('index.html')) {
      projectType.type = 'static';
      projectType.framework = 'html';
      projectType.devServer = 'static';
      projectType.commands = {
        install: null,
        dev: 'python3 -m http.server 3001',
        build: null,
      };
    }

    console.log(`🔍 Detected project type:`, projectType);
    return projectType;

  } catch (error) {
    console.error('❌ Failed to detect project type:', error);
    return {
      type: 'unknown',
      framework: 'unknown',
      devServer: 'static',
      port: 3001,
      commands: {
        install: null,
        dev: 'python3 -m http.server 3001',
        build: null,
      }
    };
  }
}

/**
 * Get development server command based on project type
 */
function getDevCommand(projectType, port = 3001) {
  const commands = {
    'vite': `npx vite --host 0.0.0.0 --port ${port} --strictPort`,
    'expo': `npx expo start --web --port ${port} --host 0.0.0.0`,
    'webpack': `HOST=0.0.0.0 PORT=${port} npm start`,
    'next': `npm run dev -- --hostname 0.0.0.0 --port ${port}`,
    'custom': projectType.commands.dev || 'npm start',
    'static': `python3 -m http.server ${port}`,
  };

  return commands[projectType.devServer] || commands.static;
}

module.exports = {
  detectProjectType,
  getDevCommand,
};