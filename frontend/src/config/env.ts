// Environment configuration helper

export interface AppConfig {
  // Application
  appName: string
  appVersion: string
  port: number
  
  // API
  apiUrl: string
  wsUrl: string
  
  // Features
  enablePWA: boolean
  enableAnalytics: boolean
  enableErrorTracking: boolean
  
  // Third-party
  monacoCdnUrl: string
  sentryDsn?: string
  gaTrackingId?: string
  
  // AI Configuration
  anthropicApiKey?: string
  openaiApiKey?: string
  enableAIStreaming: boolean
  
  // Build
  sourceMap: boolean
  bundleAnalyze: boolean
  
  // Runtime
  isDevelopment: boolean
  isProduction: boolean
  isStaging: boolean
}

// Get environment variable with fallback
function getEnvVar(key: string, fallback: string = ''): string {
  return import.meta.env[key] || fallback
}

// Get boolean environment variable
function getEnvBool(key: string, fallback: boolean = false): boolean {
  const value = getEnvVar(key, String(fallback))
  return value === 'true' || value === '1'
}

// Get number environment variable
function getEnvNumber(key: string, fallback: number): number {
  const value = getEnvVar(key)
  const parsed = parseInt(value, 10)
  return isNaN(parsed) ? fallback : parsed
}

// Current environment
export const ENV = import.meta.env.MODE || 'development'

// Environment checks
export const isDevelopment = ENV === 'development'
export const isProduction = ENV === 'production'
export const isStaging = ENV === 'staging'
export const isTest = ENV === 'test'

// Application configuration
export const config: AppConfig = {
  // Application
  appName: getEnvVar('VITE_APP_NAME', 'Velocity'),
  appVersion: getEnvVar('VITE_APP_VERSION', '0.0.0'),
  port: getEnvNumber('VITE_PORT', 5173),
  
  // API
  apiUrl: getEnvVar('VITE_API_URL', 'http://localhost:3000'),
  wsUrl: getEnvVar('VITE_WS_URL', 'ws://localhost:3000'),
  
  // Features
  enablePWA: getEnvBool('VITE_ENABLE_PWA', false),
  enableAnalytics: getEnvBool('VITE_ENABLE_ANALYTICS', false),
  enableErrorTracking: getEnvBool('VITE_ENABLE_ERROR_TRACKING', false),
  
  // Third-party
  monacoCdnUrl: getEnvVar(
    'VITE_MONACO_CDN_URL',
    'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0'
  ),
  sentryDsn: getEnvVar('VITE_SENTRY_DSN'),
  gaTrackingId: getEnvVar('VITE_GA_TRACKING_ID'),
  
  // AI Configuration
  anthropicApiKey: getEnvVar('VITE_ANTHROPIC_API_KEY'),
  openaiApiKey: getEnvVar('VITE_OPENAI_API_KEY'),
  enableAIStreaming: getEnvBool('VITE_ENABLE_AI_STREAMING', true),
  
  // Build
  sourceMap: getEnvBool('VITE_SOURCE_MAP', !isProduction),
  bundleAnalyze: getEnvBool('VITE_BUNDLE_ANALYZE', false),
  
  // Runtime
  isDevelopment,
  isProduction,
  isStaging,
}

// Validate configuration
export function validateConfig(): void {
  const errors: string[] = []
  
  if (isProduction) {
    if (!config.apiUrl.startsWith('https://')) {
      errors.push('API URL must use HTTPS in production')
    }
    
    if (!config.wsUrl.startsWith('wss://')) {
      errors.push('WebSocket URL must use WSS in production')
    }
  }
  
  if (config.enableErrorTracking && !config.sentryDsn) {
    errors.push('Sentry DSN is required when error tracking is enabled')
  }
  
  if (config.enableAnalytics && !config.gaTrackingId) {
    errors.push('Google Analytics tracking ID is required when analytics is enabled')
  }
  
  if (errors.length > 0) {
    console.error('Configuration validation errors:')
    errors.forEach(error => console.error(`  - ${error}`))
    
    if (isProduction) {
      throw new Error('Configuration validation failed')
    }
  }
}

// Log configuration in development
if (isDevelopment) {
  console.log('🔧 Application Configuration:', {
    environment: ENV,
    ...config,
    // Hide sensitive values
    sentryDsn: config.sentryDsn ? '***' : undefined,
  })
}