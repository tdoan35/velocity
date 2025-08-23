import React, { useState } from 'react';
import { Button } from '../ui/button';
import { useToast } from '../../hooks/use-toast';
import { 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2,
  Activity
} from 'lucide-react';

interface ConnectionTestButtonProps {
  onTest: () => Promise<{ success: boolean; message: string; error?: string }>;
  isConnected: boolean;
  className?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  showResult?: boolean;
}

export function ConnectionTestButton({
  onTest,
  isConnected,
  className,
  variant = 'outline',
  size = 'default',
  showResult = true
}: ConnectionTestButtonProps) {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    timestamp: Date;
  } | null>(null);
  const { toast } = useToast();

  const handleTest = async () => {
    if (!isConnected) {
      toast({
        title: 'Not Connected',
        description: 'Please connect to a Supabase project first',
        variant: 'destructive',
        duration: 3000
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await onTest();
      
      const newTestResult = {
        success: result.success,
        message: result.message,
        timestamp: new Date()
      };
      
      setTestResult(newTestResult);

      if (showResult) {
        toast({
          title: result.success ? 'Connection Healthy' : 'Connection Issue',
          description: result.message,
          variant: result.success ? 'default' : 'destructive',
          duration: 5000
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Test failed';
      
      setTestResult({
        success: false,
        message: errorMessage,
        timestamp: new Date()
      });

      if (showResult) {
        toast({
          title: 'Test Failed',
          description: errorMessage,
          variant: 'destructive',
          duration: 5000
        });
      }
    } finally {
      setIsTesting(false);
    }
  };

  // Get the appropriate icon based on state
  const getIcon = () => {
    if (isTesting) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    }
    
    if (testResult && !isTesting) {
      if (testResult.success) {
        return <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />;
      } else {
        return <XCircle className="h-4 w-4 text-destructive" />;
      }
    }
    
    return <Activity className="h-4 w-4" />;
  };

  // Get button text based on state
  const getButtonText = () => {
    if (size === 'icon') {
      return null;
    }

    if (isTesting) {
      return 'Testing...';
    }

    if (testResult && !isTesting) {
      const timeSinceTest = Date.now() - testResult.timestamp.getTime();
      // Show result for 3 seconds
      if (timeSinceTest < 3000) {
        return testResult.success ? 'Connection Healthy' : 'Connection Failed';
      }
    }

    return 'Test Connection';
  };

  return (
    <Button
      onClick={handleTest}
      disabled={!isConnected || isTesting}
      variant={variant}
      size={size}
      className={className}
      title={!isConnected ? 'Connect to Supabase first' : 'Test connection health'}
    >
      {getIcon()}
      {getButtonText() && <span className="ml-2">{getButtonText()}</span>}
    </Button>
  );
}