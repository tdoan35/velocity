import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { RefreshCw } from 'lucide-react';

export function AuthDebugger() {
  const [authInfo, setAuthInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const checkAuth = async () => {
    setLoading(true);
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      const info = {
        hasSession: !!session,
        error: error?.message,
        user: {
          id: session?.user?.id,
          email: session?.user?.email,
          role: session?.user?.role,
        },
        token: {
          exists: !!session?.access_token,
          length: session?.access_token?.length,
          type: session?.token_type,
          expiresAt: session?.expires_at,
          refreshToken: !!session?.refresh_token,
        },
        env: {
          supabaseUrl: import.meta.env.VITE_SUPABASE_URL,
          orchestratorUrl: import.meta.env.VITE_ORCHESTRATOR_URL,
        }
      };
      
      setAuthInfo(info);
      console.log('Auth Debug Info:', info);
    } catch (err) {
      console.error('Auth check error:', err);
      setAuthInfo({ error: err.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Authentication Debugger</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={checkAuth}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent>
        {authInfo ? (
          <pre className="text-xs bg-muted p-4 rounded overflow-auto max-h-96">
            {JSON.stringify(authInfo, null, 2)}
          </pre>
        ) : (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-sm text-muted-foreground">Loading auth info...</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}