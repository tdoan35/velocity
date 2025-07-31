import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './components/theme-provider'
import { config, validateConfig } from './config/env'
import { performanceMonitor, markPerformance, reportWebVitals } from './utils/performance'

// Validate configuration
validateConfig()

// Mark app initialization
markPerformance('app-init-start')

// Initialize error tracking
// TODO: Uncomment when @sentry/react is installed
// if (config.enableErrorTracking && config.sentryDsn) {
//   import('@sentry/react')
//     .then(({ init, BrowserTracing }) => {
//       init({
//         dsn: config.sentryDsn,
//         environment: config.isProduction ? 'production' : 'development',
//         integrations: [new BrowserTracing()],
//         tracesSampleRate: config.isProduction ? 0.1 : 1.0,
//       })
//     })
//     .catch(() => {
//       console.warn('Sentry not installed. Run `npm install @sentry/react` to enable error tracking.')
//     })
// }

// Initialize analytics
if (config.enableAnalytics && config.gaTrackingId) {
  const script = document.createElement('script')
  script.src = `https://www.googletagmanager.com/gtag/js?id=${config.gaTrackingId}`
  script.async = true
  document.head.appendChild(script)
  
  window.dataLayer = window.dataLayer || []
  window.gtag = function() {
    window.dataLayer.push(arguments)
  }
  window.gtag('js', new Date())
  window.gtag('config', config.gaTrackingId)
}

// Report Web Vitals
// TODO: Uncomment when web-vitals is installed
// if (config.isProduction) {
//   import('web-vitals')
//     .then(({ onCLS, onFID, onFCP, onLCP, onTTFB }) => {
//       onCLS(reportWebVitals)
//       onFID(reportWebVitals)
//       onFCP(reportWebVitals)
//       onLCP(reportWebVitals)
//       onTTFB(reportWebVitals)
//     })
//     .catch(() => {
//       console.warn('web-vitals not installed. Run `npm install web-vitals` to enable performance monitoring.')
//     })
// }

// Register service worker for PWA
if (config.enablePWA && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(
      (registration) => {
        console.log('SW registered:', registration)
      },
      (error) => {
        console.error('SW registration failed:', error)
      }
    )
  })
}

// Create root and render app
const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

const root = createRoot(rootElement)

// Mark before render
markPerformance('app-render-start')

root.render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="velocity-theme">
      <App />
    </ThemeProvider>
  </StrictMode>
)

// Mark after render
requestAnimationFrame(() => {
  markPerformance('app-render-end')
  performanceMonitor.measureTiming('app-initialization', 'app-init-start', 'app-render-end')
})

// Log app info in development
if (config.isDevelopment) {
  console.log(`🚀 ${config.appName} v${config.appVersion}`)
  console.log(`📍 Environment: ${config.isDevelopment ? 'Development' : 'Production'}`)
  console.log(`🔗 API: ${config.apiUrl}`)
}

// Extend window for TypeScript
declare global {
  interface Window {
    dataLayer: any[]
    gtag: (...args: any[]) => void
  }
}