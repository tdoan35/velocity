import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function EditorDebug() {
  const [debugInfo, setDebugInfo] = useState<{
    userAgent: string
    online: boolean
    monacoLoaded: boolean
    errors: string[]
  }>({
    userAgent: '',
    online: true,
    monacoLoaded: false,
    errors: []
  })

  useEffect(() => {
    // Check browser info
    setDebugInfo(prev => ({
      ...prev,
      userAgent: navigator.userAgent,
      online: navigator.onLine
    }))

    // Check if Monaco is loaded
    const checkMonaco = () => {
      const monacoGlobal = (window as any).monaco
      setDebugInfo(prev => ({
        ...prev,
        monacoLoaded: !!monacoGlobal
      }))
    }

    // Check periodically
    const interval = setInterval(checkMonaco, 1000)
    checkMonaco()

    // Listen for errors
    const errorHandler = (event: ErrorEvent) => {
      setDebugInfo(prev => ({
        ...prev,
        errors: [...prev.errors, `${event.message} at ${event.filename}:${event.lineno}`]
      }))
    }

    window.addEventListener('error', errorHandler)

    // Test fetch to CDN
    fetch('https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js')
      .then(res => {
        console.log('CDN test response:', res.status)
        if (!res.ok) {
          setDebugInfo(prev => ({
            ...prev,
            errors: [...prev.errors, `CDN fetch failed: ${res.status}`]
          }))
        }
      })
      .catch(err => {
        console.error('CDN test error:', err)
        setDebugInfo(prev => ({
          ...prev,
          errors: [...prev.errors, `CDN connection error: ${err.message}`]
        }))
      })

    return () => {
      clearInterval(interval)
      window.removeEventListener('error', errorHandler)
    }
  }, [])

  return (
    <Card className="absolute bottom-4 right-4 w-96 z-50">
      <CardHeader>
        <CardTitle className="text-sm">Editor Debug Info</CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div>
          <span className="font-semibold">Online:</span> {debugInfo.online ? '✅' : '❌'}
        </div>
        <div>
          <span className="font-semibold">Monaco Loaded:</span> {debugInfo.monacoLoaded ? '✅' : '❌'}
        </div>
        <div>
          <span className="font-semibold">Browser:</span> {debugInfo.userAgent.substring(0, 50)}...
        </div>
        {debugInfo.errors.length > 0 && (
          <div>
            <span className="font-semibold">Errors:</span>
            <ul className="mt-1 space-y-1">
              {debugInfo.errors.map((error, i) => (
                <li key={i} className="text-destructive">{error}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}