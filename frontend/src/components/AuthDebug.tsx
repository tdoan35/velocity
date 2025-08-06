import { useAuthStore } from '@/stores/useAuthStore'
import { supabase } from '@/lib/supabase'
import { useEffect, useState } from 'react'

export function AuthDebug() {
  const { user, isAuthenticated, isLoading } = useAuthStore()
  const [session, setSession] = useState<any>(null)
  
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
  
  return (
    <div className="fixed bottom-4 right-4 bg-background/95 backdrop-blur border rounded-lg p-4 text-xs max-w-sm">
      <h3 className="font-bold mb-2">Auth Debug</h3>
      <div className="space-y-1">
        <p>Store - isAuthenticated: {String(isAuthenticated)}</p>
        <p>Store - isLoading: {String(isLoading)}</p>
        <p>Store - user: {user ? user.email : 'null'}</p>
        <p className="border-t pt-1 mt-1">Supabase - session: {session ? 'exists' : 'null'}</p>
        <p>Supabase - user: {session?.user?.email || 'null'}</p>
      </div>
    </div>
  )
}