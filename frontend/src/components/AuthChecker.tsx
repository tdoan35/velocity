import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { AlertCircle, LogIn, User } from 'lucide-react';

interface AuthCheckerProps {
  children: React.ReactNode;
  requireAuth?: boolean;
}

export function AuthChecker({ children, requireAuth = true }: AuthCheckerProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setIsAuthenticated(!!session);
        setUserEmail(session?.user?.email || null);
      } catch (error) {
        console.error('Auth check error:', error);
        setIsAuthenticated(false);
      }
    };

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
      setUserEmail(session?.user?.email || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Show loading state
  if (isAuthenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // Show authentication required message
  if (requireAuth && !isAuthenticated) {
    return (
      <Card className="max-w-md mx-auto mt-8">
        <CardHeader className="text-center">
          <AlertCircle className="h-12 w-12 mx-auto mb-4 text-yellow-500" />
          <CardTitle>Authentication Required</CardTitle>
          <CardDescription>
            You need to be logged in to use the container preview feature.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            The container preview system requires authentication to create and manage preview sessions.
          </p>
          <Button 
            onClick={() => window.location.href = '/auth/login'} 
            className="w-full"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Sign In
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Show authenticated user info and children
  return (
    <div>
      {isAuthenticated && (
        <div className="mb-4 p-2 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
          <div className="flex items-center text-sm text-green-800 dark:text-green-200">
            <User className="h-4 w-4 mr-2" />
            Authenticated as: {userEmail}
          </div>
        </div>
      )}
      {children}
    </div>
  );
}