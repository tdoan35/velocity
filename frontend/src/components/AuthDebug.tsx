import { useAuthStore } from '@/stores/useAuthStore'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'
import { X, Eye, EyeOff } from 'lucide-react'

export function AuthDebug() {
  const { user, isAuthenticated, isLoading } = useAuthStore()
  const [session, setSession] = useState<any>(null)
  const [isVisible, setIsVisible] = useState(true)
  const [isMinimized, setIsMinimized] = useState(false)
  
  useEffect(() => {
    // Check Supabase session directly
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth state changed:', event, session)
      setSession(session)
    })
    
    return () => subscription.unsubscribe()
  }, [])
  
  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-4 right-4 bg-background/95 backdrop-blur border rounded-lg p-2 text-xs hover:bg-accent transition-colors"
        title="Show Auth Debug"
      >
        <Eye className="h-4 w-4" />
      </button>
    )
  }
  
  return (
    <div className="fixed bottom-4 right-4 bg-background/95 backdrop-blur border rounded-lg text-xs max-w-sm">
      <div className="flex items-center justify-between p-3 border-b">
        <h3 className="font-bold">Auth Debug</h3>
        <div className="flex gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-accent rounded transition-colors"
            title={isMinimized ? "Expand" : "Minimize"}
          >
            {isMinimized ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          <button
            onClick={() => setIsVisible(false)}
            className="p-1 hover:bg-accent rounded transition-colors"
            title="Hide"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      {!isMinimized && (
        <div className="p-3 space-y-1">
          <p>Store - isAuthenticated: {String(isAuthenticated)}</p>
          <p>Store - isLoading: {String(isLoading)}</p>
          <p>Store - user: {user ? user.email : 'null'}</p>
          <p className="border-t pt-1 mt-1">Supabase - session: {session ? 'exists' : 'null'}</p>
          <p>Supabase - user: {session?.user?.email || 'null'}</p>
        </div>
      )}
    </div>
  )
}