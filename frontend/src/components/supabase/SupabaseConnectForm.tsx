import React, { useState, useCallback } from 'react';
import type { SupabaseCredentials } from '../../services/supabaseConnection';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import { useToast } from '../../hooks/use-toast';
import { Loader2, Lock, Database, AlertCircle, CheckCircle2, Info } from 'lucide-react';

interface SupabaseConnectFormProps {
  projectId: string;
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: (credentials: SupabaseCredentials) => Promise<{ success: boolean; message: string }>;
  onUpdate?: (credentials: SupabaseCredentials) => Promise<{ success: boolean; error?: string }>;
  projectUrl?: string | null;
  className?: string;
}

export function SupabaseConnectForm({
  projectId,
  isConnected,
  isConnecting,
  onConnect,
  onUpdate,
  projectUrl,
  className
}: SupabaseConnectFormProps) {
  const [credentials, setCredentials] = useState<SupabaseCredentials>({
    projectUrl: projectUrl || '',
    anonKey: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{
    projectUrl?: string;
    anonKey?: string;
  }>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  // Validate project URL format
  const validateProjectUrl = (url: string): string | undefined => {
    if (!url) {
      return 'Project URL is required';
    }
    try {
      const parsedUrl = new URL(url);
      const supabasePattern = /^https:\/\/[a-zA-Z0-9-]+\.(supabase\.co|supabase\.in)$/;
      if (!supabasePattern.test(parsedUrl.origin)) {
        return 'Invalid Supabase project URL format';
      }
    } catch {
      return 'Invalid URL format';
    }
    return undefined;
  };

  // Validate anon key
  const validateAnonKey = (key: string): string | undefined => {
    if (!key) {
      return 'Anon key is required';
    }
    if (key.length < 30) {
      return 'Anon key appears to be invalid (too short)';
    }
    return undefined;
  };

  // Handle form submission
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate fields
    const urlError = validateProjectUrl(credentials.projectUrl);
    const keyError = validateAnonKey(credentials.anonKey);

    if (urlError || keyError) {
      setValidationErrors({
        projectUrl: urlError,
        anonKey: keyError
      });
      return;
    }

    setValidationErrors({});
    setIsSubmitting(true);

    try {
      const result = isConnected && onUpdate
        ? await onUpdate(credentials)
        : await onConnect(credentials);

      if (result.success) {
        toast({
          title: isConnected ? 'Connection Updated' : 'Connected Successfully',
          description: `Successfully ${isConnected ? 'updated' : 'connected to'} your Supabase project`,
          duration: 5000
        });

        // Clear the anon key after successful connection for security
        if (!isConnected) {
          setCredentials(prev => ({ ...prev, anonKey: '' }));
        }
      } else {
        toast({
          title: 'Connection Failed',
          description: 'error' in result ? result.error : ('message' in result ? result.message : 'Connection failed'),
          variant: 'destructive',
          duration: 5000
        });
      }
    } catch (error) {
      toast({
        title: 'Connection Error',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
        duration: 5000
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [credentials, isConnected, onConnect, onUpdate, toast]);

  // Handle input changes
  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
    setCredentials(prev => ({ ...prev, projectUrl: url }));
    if (validationErrors.projectUrl) {
      const error = validateProjectUrl(url);
      setValidationErrors(prev => ({ ...prev, projectUrl: error }));
    }
  };

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const key = e.target.value;
    setCredentials(prev => ({ ...prev, anonKey: key }));
    if (validationErrors.anonKey) {
      const error = validateAnonKey(key);
      setValidationErrors(prev => ({ ...prev, anonKey: error }));
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="h-5 w-5" />
          {isConnected ? 'Update Supabase Connection' : 'Connect Your Supabase Project'}
        </CardTitle>
        <CardDescription>
          {isConnected
            ? 'Update your Supabase project credentials if they have changed'
            : 'Connect your own Supabase project to enable backend functionality'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project URL Input */}
          <div className="space-y-2">
            <Label htmlFor="project-url">
              Supabase Project URL
              <span className="text-destructive ml-1">*</span>
            </Label>
            <Input
              id="project-url"
              type="url"
              placeholder="https://your-project.supabase.co"
              value={credentials.projectUrl}
              onChange={handleUrlChange}
              disabled={isSubmitting || isConnecting}
              className={validationErrors.projectUrl ? 'border-destructive' : ''}
              aria-invalid={!!validationErrors.projectUrl}
              aria-describedby={validationErrors.projectUrl ? 'url-error' : 'url-help'}
            />
            {validationErrors.projectUrl ? (
              <p id="url-error" className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {validationErrors.projectUrl}
              </p>
            ) : (
              <p id="url-help" className="text-sm text-muted-foreground">
                Found in your Supabase project settings under API
              </p>
            )}
          </div>

          {/* Anon Key Input */}
          <div className="space-y-2">
            <Label htmlFor="anon-key">
              Anon Key
              <span className="text-destructive ml-1">*</span>
            </Label>
            <div className="relative">
              <Input
                id="anon-key"
                type={showPassword ? 'text' : 'password'}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                value={credentials.anonKey}
                onChange={handleKeyChange}
                disabled={isSubmitting || isConnecting}
                className={validationErrors.anonKey ? 'border-destructive pr-20' : 'pr-20'}
                aria-invalid={!!validationErrors.anonKey}
                aria-describedby={validationErrors.anonKey ? 'key-error' : 'key-help'}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {validationErrors.anonKey ? (
              <p id="key-error" className="text-sm text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {validationErrors.anonKey}
              </p>
            ) : (
              <p id="key-help" className="text-sm text-muted-foreground">
                Your project's anonymous public key from the API settings
              </p>
            )}
          </div>

          {/* Security Notice */}
          <Alert className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900">
            <Lock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              Your credentials are encrypted before storage and never exposed in logs or responses. 
              You maintain full control and can update or disconnect at any time.
            </AlertDescription>
          </Alert>

          {/* Data Sovereignty Notice */}
          {!isConnected && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>You maintain full ownership:</strong> Your Supabase project, data, and billing 
                remain entirely under your control. Velocity only connects using the credentials you provide.
              </AlertDescription>
            </Alert>
          )}

          {/* Submit Button */}
          <Button
            type="submit"
            disabled={isSubmitting || isConnecting}
            className="w-full"
          >
            {isSubmitting || isConnecting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isConnected ? 'Updating Connection...' : 'Testing Connection...'}
              </>
            ) : (
              <>
                {isConnected ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    Update Connection
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" />
                    Connect Supabase
                  </>
                )}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}