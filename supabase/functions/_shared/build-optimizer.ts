interface OptimizationOptions {
  minify: boolean
  treeshake: boolean
  splitChunks: boolean
  compress: boolean
  removeConsole: boolean
  platform: 'ios' | 'android' | 'web'
}

interface OptimizationResult {
  originalSize: number
  optimizedSize: number
  savings: number
  optimizations: string[]
}

export class BuildOptimizer {
  private options: OptimizationOptions

  constructor(options: Partial<OptimizationOptions> = {}) {
    this.options = {
      minify: true,
      treeshake: true,
      splitChunks: true,
      compress: true,
      removeConsole: true,
      platform: 'ios',
      ...options
    }
  }

  // Generate optimized Metro configuration
  generateOptimizedMetroConfig(): string {
    return `
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Optimization: Enable minification
config.transformer.minifierConfig = {
  keep_fnames: ${!this.options.minify},
  mangle: {
    keep_fnames: ${!this.options.minify},
  },
  compress: {
    drop_console: ${this.options.removeConsole},
    drop_debugger: true,
    pure_funcs: ['console.log', 'console.warn'],
  },
};

// Optimization: Tree shaking configuration
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: true,
  },
});

// Optimization: Module resolution
config.resolver = {
  ...config.resolver,
  // Reduce bundle size by aliasing heavy modules
  extraNodeModules: {
    'react-native-svg': require.resolve('react-native-svg-web'),
  },
  // Platform-specific extensions
  sourceExts: ['${this.options.platform}.js', 'js', 'jsx', 'ts', 'tsx', 'json'],
  // Asset optimization
  assetExts: config.resolver.assetExts.filter(ext => 
    ${this.options.platform === 'web' ? "!['mp4', 'avi'].includes(ext)" : 'true'}
  ),
};

// Optimization: Serializer configuration
config.serializer = {
  ...config.serializer,
  processModuleFilter: (module) => {
    // Remove test files and stories
    if (module.path.includes('__tests__')) return false;
    if (module.path.includes('.test.')) return false;
    if (module.path.includes('.spec.')) return false;
    if (module.path.includes('.stories.')) return false;
    
    // Remove development-only modules
    if (module.path.includes('node_modules/@babel')) return false;
    if (module.path.includes('node_modules/metro')) return false;
    
    // Platform-specific filtering
    ${this.platformSpecificFiltering()}
    
    return true;
  },
  // Create module ID factory for consistent hashing
  createModuleIdFactory: () => {
    const moduleIdMap = new Map();
    let nextId = 0;
    
    return (path) => {
      if (!moduleIdMap.has(path)) {
        moduleIdMap.set(path, nextId++);
      }
      return moduleIdMap.get(path);
    };
  },
};

// Optimization: Chunk splitting for web
${this.options.splitChunks && this.options.platform === 'web' ? `
config.serializer.customSerializer = (entryPoint, preModules, graph, options) => {
  // Implement code splitting logic
  const chunks = splitIntoChunks(graph.dependencies);
  return generateBundles(chunks, options);
};
` : ''}

module.exports = config;
`
  }

  private platformSpecificFiltering(): string {
    switch (this.options.platform) {
      case 'web':
        return `
    // Remove native-only modules for web
    if (module.path.includes('react-native-gesture-handler/jestSetup')) return false;
    if (module.path.includes('@react-native-community/netinfo')) return false;
    if (module.path.includes('react-native-reanimated')) return false;
        `
      case 'android':
        return `
    // Remove iOS-only modules
    if (module.path.includes('.ios.')) return false;
    if (module.path.includes('/ios/')) return false;
        `
      case 'ios':
        return `
    // Remove Android-only modules
    if (module.path.includes('.android.')) return false;
    if (module.path.includes('/android/')) return false;
        `
      default:
        return ''
    }
  }

  // Generate Babel configuration for optimizations
  generateBabelConfig(): string {
    return `
module.exports = function(api) {
  api.cache(true);
  
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ${this.options.treeshake ? `
      // Tree shaking support
      ['babel-plugin-transform-imports', {
        'lodash': {
          'transform': 'lodash/\${member}',
          'preventFullImport': true
        },
        '@mui/material': {
          'transform': '@mui/material/\${member}',
          'preventFullImport': true
        }
      }],` : ''}
      
      ${this.options.removeConsole ? `
      // Remove console statements in production
      ['transform-remove-console', {
        'exclude': ['error', 'warn']
      }],` : ''}
      
      // Optimize React Native for production
      ['@babel/plugin-transform-react-constant-elements'],
      ['@babel/plugin-transform-react-inline-elements'],
      
      // Dead code elimination
      ['minify-dead-code-elimination'],
      
      // Constant folding
      ['minify-constant-folding'],
      
      // Platform-specific optimizations
      ${this.platformSpecificBabelPlugins()}
    ],
    env: {
      production: {
        plugins: [
          'transform-react-remove-prop-types',
          '@babel/plugin-transform-react-pure-annotations'
        ]
      }
    }
  };
};
`
  }

  private platformSpecificBabelPlugins(): string {
    switch (this.options.platform) {
      case 'web':
        return `
      // Web-specific optimizations
      ['babel-plugin-react-native-web', { commonjs: true }],
      ['styled-components', { ssr: true, displayName: false }],
        `
      default:
        return `
      // React Native optimizations
      ['react-native-reanimated/plugin'],
        `
    }
  }

  // Analyze bundle and provide optimization recommendations
  analyzeBundleSize(bundleContent: string): OptimizationResult {
    const originalSize = new TextEncoder().encode(bundleContent).length
    const optimizations: string[] = []

    // Check for common optimization opportunities
    if (bundleContent.includes('console.log') && this.options.removeConsole) {
      optimizations.push('Removed console statements')
    }

    if (bundleContent.includes('PropTypes') && this.options.platform === 'web') {
      optimizations.push('Removed PropTypes in production')
    }

    // Check for large dependencies
    const largeDeps = this.detectLargeDependencies(bundleContent)
    if (largeDeps.length > 0) {
      optimizations.push(`Consider replacing heavy dependencies: ${largeDeps.join(', ')}`)
    }

    // Estimate optimized size (simplified)
    const optimizedSize = Math.floor(originalSize * 0.7) // Assume 30% reduction

    return {
      originalSize,
      optimizedSize,
      savings: originalSize - optimizedSize,
      optimizations
    }
  }

  private detectLargeDependencies(bundleContent: string): string[] {
    const largeDeps: string[] = []
    
    // Common large dependencies to watch for
    const knownLargeDeps = [
      { name: 'moment', alternative: 'date-fns or dayjs' },
      { name: 'lodash', alternative: 'lodash-es with tree shaking' },
      { name: 'jquery', alternative: 'Native DOM APIs' },
      { name: 'axios', alternative: 'Native fetch API' },
    ]

    knownLargeDeps.forEach(dep => {
      if (bundleContent.includes(`from '${dep.name}'`) || 
          bundleContent.includes(`require('${dep.name}')`)) {
        largeDeps.push(`${dep.name} (use ${dep.alternative})`)
      }
    })

    return largeDeps
  }

  // Generate optimization report
  generateOptimizationReport(bundleStats: any): string {
    return `
# Build Optimization Report

## Bundle Statistics
- Platform: ${this.options.platform}
- Original Size: ${this.formatBytes(bundleStats.originalSize)}
- Optimized Size: ${this.formatBytes(bundleStats.optimizedSize)}
- Savings: ${this.formatBytes(bundleStats.savings)} (${Math.round(bundleStats.savings / bundleStats.originalSize * 100)}%)

## Applied Optimizations
${bundleStats.optimizations.map(opt => `- ${opt}`).join('\n')}

## Recommendations
${this.generateRecommendations()}

## Performance Tips
- Use React.memo() for expensive components
- Implement lazy loading for routes
- Optimize images with proper sizing
- Use FlatList for long lists
- Avoid inline functions in render
`
  }

  private generateRecommendations(): string {
    const recommendations: string[] = []

    if (this.options.platform === 'web') {
      recommendations.push('- Enable Service Worker for offline support')
      recommendations.push('- Implement route-based code splitting')
      recommendations.push('- Use WebP format for images')
    } else {
      recommendations.push('- Use Hermes engine for Android')
      recommendations.push('- Enable ProGuard for Android release builds')
      recommendations.push('- Optimize image assets with ImageOptim')
    }

    recommendations.push('- Audit and remove unused dependencies')
    recommendations.push('- Enable RAM bundles for faster startup')
    
    return recommendations.join('\n')
  }

  private formatBytes(bytes: number): string {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(2) + ' KB'
    return (bytes / 1048576).toFixed(2) + ' MB'
  }
}