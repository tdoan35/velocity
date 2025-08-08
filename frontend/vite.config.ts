import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { visualizer } from 'rollup-plugin-visualizer'
import viteCompression from 'vite-plugin-compression'
import { VitePWA } from 'vite-plugin-pwa'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProduction = mode === 'production'
  const isAnalyze = process.env.ANALYZE === 'true'

  return {
    plugins: [
      react(),
      
      // Compression plugin for gzip and brotli
      isProduction && viteCompression({
        algorithm: 'gzip',
        ext: '.gz',
        threshold: 10240, // Only compress files larger than 10kb
      }),
      
      isProduction && viteCompression({
        algorithm: 'brotliCompress',
        ext: '.br',
        threshold: 10240,
      }),
      
      // PWA plugin for offline support
      isProduction && VitePWA({
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5MB
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          globIgnores: ['**/monaco-vendor-*.js'], // Ignore large Monaco files
        },
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
        manifest: {
          name: 'Velocity - AI App Builder',
          short_name: 'Velocity',
          theme_color: '#ffffff',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
      }),
      
      // Bundle analyzer
      isAnalyze && visualizer({
        open: true,
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@components': path.resolve(__dirname, './src/components'),
        '@features': path.resolve(__dirname, './src/features'),
        '@hooks': path.resolve(__dirname, './src/hooks'),
        '@stores': path.resolve(__dirname, './src/stores'),
        '@types': path.resolve(__dirname, './src/types'),
        '@utils': path.resolve(__dirname, './src/utils'),
        '@lib': path.resolve(__dirname, './src/lib'),
      },
    },
    
    server: {
      port: parseInt(env.VITE_PORT || '5173'),
      strictPort: true,
      headers: {
        // Development CSP headers - more permissive
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
          "img-src 'self' data: https:",
          "font-src 'self' https://cdn.jsdelivr.net",
          "connect-src 'self' ws: wss: http: https:",
          "worker-src 'self' blob:",
        ].join('; '),
      },
    },
    
    build: {
      target: 'es2022',
      minify: isProduction ? 'terser' : false,
      sourcemap: !isProduction,
      
      terserOptions: isProduction ? {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info'],
          passes: 2,
        },
        mangle: {
          safari10: true,
        },
        format: {
          comments: false,
          ecma: 2020,
        },
      } : undefined,
      
      rollupOptions: {
        output: {
          // Enhanced manual chunks for better code splitting
          manualChunks: (id) => {
            // Vendor chunks
            if (id.includes('node_modules')) {
              if (id.includes('react') || id.includes('react-dom')) {
                return 'react-vendor'
              }
              if (id.includes('monaco-editor') || id.includes('@monaco-editor')) {
                return 'monaco-vendor'
              }
              if (id.includes('framer-motion')) {
                return 'animation-vendor'
              }
              if (id.includes('@radix-ui') || id.includes('class-variance-authority')) {
                return 'ui-vendor'
              }
              if (id.includes('zustand') || id.includes('immer')) {
                return 'state-vendor'
              }
              // All other vendor code
              return 'vendor'
            }
            
            // Application chunks
            if (id.includes('src/components/ui')) {
              return 'ui-components'
            }
            if (id.includes('src/components/editor')) {
              return 'editor-components'
            }
            if (id.includes('src/components/chat')) {
              return 'chat-components'
            }
            if (id.includes('src/stores')) {
              return 'stores'
            }
          },
          
          // Asset file naming for better caching
          assetFileNames: (assetInfo) => {
            const info = (assetInfo.name || 'asset').split('.')
            const ext = info[info.length - 1]
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `assets/images/[name]-[hash][extname]`
            }
            if (/woff2?|ttf|otf|eot/i.test(ext)) {
              return `assets/fonts/[name]-[hash][extname]`
            }
            return `assets/[name]-[hash][extname]`
          },
          
          chunkFileNames: 'js/[name]-[hash].js',
          entryFileNames: 'js/[name]-[hash].js',
        },
        
        // External dependencies for CDN loading (optional)
        external: isProduction ? [] : [],
      },
      
      // Increase chunk size warning limit for production
      chunkSizeWarningLimit: isProduction ? 1500 : 1000,
      
      // Enable CSS code splitting
      cssCodeSplit: true,
      
      // Preload directives
      modulePreload: {
        polyfill: true,
      },
      
      reportCompressedSize: true,
      
      // Asset inlining threshold
      assetsInlineLimit: 4096, // 4kb
    },
    
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        '@monaco-editor/react',
        'framer-motion',
        'zustand',
      ],
      exclude: ['@vite/client', '@vite/env'],
      esbuildOptions: {
        target: 'es2022',
      },
    },
    
    // Environment variables prefix
    envPrefix: 'VITE_',
    
    // Define global constants
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  }
})