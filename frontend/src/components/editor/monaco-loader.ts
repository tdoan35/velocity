import loader from '@monaco-editor/loader'

// Configure Monaco loader with fallback options
export function configureMonacoLoader() {
  // Set custom CDN path if needed
  loader.config({
    paths: {
      vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs'
    }
  })

  // Add error handling
  loader.init().then((monaco) => {
    console.log('Monaco loaded successfully:', monaco)
  }).catch((error) => {
    console.error('Failed to load Monaco:', error)
  })
}

// Export loader for use in components
export { loader }