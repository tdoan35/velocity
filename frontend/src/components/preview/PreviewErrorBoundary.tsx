import React, { Component, ErrorInfo, ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  AlertCircle,
  RefreshCw,
  Bug,
  ChevronRight,
  Copy,
  Download,
  Send,
  CheckCircle,
  XCircle,
  Loader2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from '@/components/ui/use-toast'

interface Props {
  children: ReactNode
  sessionId?: string
  projectId?: string
  onReset?: () => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  errorCode: string
  userMessage: string
  recoverySteps: string[]
  canRetry: boolean
  retryCount: number
  isRecovering: boolean
  recoveryProgress: number
  diagnosticReportId: string | null
  isReporting: boolean
}

export class PreviewErrorBoundary extends Component<Props, State> {
  private retryTimeouts: Set<NodeJS.Timeout> = new Set()

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorCode: 'UNKNOWN',
      userMessage: 'An unexpected error occurred',
      recoverySteps: [],
      canRetry: true,
      retryCount: 0,
      isRecovering: false,
      recoveryProgress: 0,
      diagnosticReportId: null,
      isReporting: false
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Map error to preview error code
    const errorMapping = PreviewErrorBoundary.mapErrorToPreviewError(error)
    
    return {
      hasError: true,
      error,
      ...errorMapping
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Preview error caught:', error, errorInfo)
    
    this.setState({ errorInfo })
    
    // Report error to diagnostics
    this.reportError(error, errorInfo)
  }

  componentWillUnmount() {
    // Clear any pending timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout))
    this.retryTimeouts.clear()
  }

  static mapErrorToPreviewError(error: Error): {
    errorCode: string
    userMessage: string
    recoverySteps: string[]
    canRetry: boolean
  } {
    const message = error.message.toLowerCase()
    
    // Network errors
    if (message.includes('network') || message.includes('fetch')) {
      return {
        errorCode: 'NETWORK_ERROR',
        userMessage: 'Network connection issue',
        recoverySteps: [
          'Check your internet connection',
          'Try refreshing the page',
          'Disable VPN or proxy if active'
        ],
        canRetry: true
      }
    }
    
    // WebSocket errors
    if (message.includes('websocket') || message.includes('realtime')) {
      return {
        errorCode: 'WEBSOCKET_ERROR',
        userMessage: 'Real-time connection lost',
        recoverySteps: [
          'Check if WebSockets are blocked',
          'Try disabling browser extensions',
          'Refresh the page to reconnect'
        ],
        canRetry: true
      }
    }
    
    // Build errors
    if (message.includes('build') || message.includes('bundle')) {
      return {
        errorCode: 'BUILD_ERROR',
        userMessage: 'Build process failed',
        recoverySteps: [
          'Check for syntax errors in your code',
          'Verify all dependencies are installed',
          'Review the console for specific errors'
        ],
        canRetry: true
      }
    }
    
    // Memory errors
    if (message.includes('memory') || message.includes('heap')) {
      return {
        errorCode: 'MEMORY_ERROR',
        userMessage: 'Out of memory',
        recoverySteps: [
          'Close unused browser tabs',
          'Restart your browser',
          'Reduce the complexity of your app'
        ],
        canRetry: true
      }
    }
    
    // Default error
    return {
      errorCode: 'UNKNOWN_ERROR',
      userMessage: 'An unexpected error occurred',
      recoverySteps: [
        'Try refreshing the page',
        'Clear your browser cache',
        'Contact support if the issue persists'
      ],
      canRetry: true
    }
  }

  async reportError(error: Error, errorInfo: ErrorInfo) {
    if (this.state.isReporting) return
    
    this.setState({ isReporting: true })
    
    try {
      // Collect diagnostics
      const diagnostics = await this.collectDiagnostics()
      
      // Report to backend
      const { data, error: reportError } = await supabase.functions.invoke(
        'preview-diagnostics/report-error',
        {
          body: {
            errorCode: this.state.errorCode,
            message: error.message,
            context: {
              sessionId: this.props.sessionId,
              projectId: this.props.projectId,
              componentStack: errorInfo.componentStack,
              stack: error.stack,
              retryCount: this.state.retryCount
            },
            diagnostics
          }
        }
      )
      
      if (reportError) throw reportError
      
      if (data?.errorId) {
        console.log('Error reported with ID:', data.errorId)
      }
      
      // Check if this is a recurring error
      if (data?.pattern?.isRecurring) {
        toast({
          title: 'Recurring Error Detected',
          description: data.pattern.suggestion || 'This error has occurred multiple times',
          variant: 'destructive'
        })
      }
      
    } catch (err) {
      console.error('Failed to report error:', err)
    } finally {
      this.setState({ isReporting: false })
    }
  }

  async collectDiagnostics() {
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    }
    
    // Performance metrics
    if (window.performance) {
      const navigation = performance.getEntriesByType('navigation')[0] as any
      diagnostics.performance = {
        loadTime: navigation?.loadEventEnd - navigation?.loadEventStart,
        domContentLoaded: navigation?.domContentLoadedEventEnd - navigation?.domContentLoadedEventStart
      }
    }
    
    // Memory info if available
    if ((performance as any).memory) {
      diagnostics.memory = (performance as any).memory
    }
    
    // Network info
    if ((navigator as any).connection) {
      diagnostics.network = {
        effectiveType: (navigator as any).connection.effectiveType,
        downlink: (navigator as any).connection.downlink,
        rtt: (navigator as any).connection.rtt
      }
    }
    
    return diagnostics
  }

  async attemptRecovery() {
    if (this.state.isRecovering || !this.state.canRetry) return
    
    this.setState({
      isRecovering: true,
      recoveryProgress: 0,
      retryCount: this.state.retryCount + 1
    })
    
    try {
      // Simulate recovery steps
      const steps = [
        { progress: 20, action: 'Clearing cache...', delay: 500 },
        { progress: 40, action: 'Reconnecting...', delay: 1000 },
        { progress: 60, action: 'Reloading components...', delay: 1000 },
        { progress: 80, action: 'Finalizing...', delay: 500 },
        { progress: 100, action: 'Complete!', delay: 200 }
      ]
      
      for (const step of steps) {
        await new Promise(resolve => {
          const timeout = setTimeout(resolve, step.delay)
          this.retryTimeouts.add(timeout)
        })
        this.setState({ recoveryProgress: step.progress })
      }
      
      // Reset error state
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        isRecovering: false
      })
      
      // Call parent reset if provided
      if (this.props.onReset) {
        this.props.onReset()
      }
      
    } catch (err) {
      console.error('Recovery failed:', err)
      this.setState({
        isRecovering: false,
        canRetry: this.state.retryCount < 3
      })
    }
  }

  async generateDiagnosticReport() {
    try {
      const { data, error } = await supabase.functions.invoke(
        'preview-diagnostics/diagnostic-report',
        {
          body: {
            sessionId: this.props.sessionId
          }
        }
      )
      
      if (error) throw error
      
      if (data?.reportId) {
        this.setState({ diagnosticReportId: data.reportId })
        toast({
          title: 'Diagnostic Report Generated',
          description: `Report ID: ${data.reportId}`,
        })
      }
      
      return data
      
    } catch (err) {
      console.error('Failed to generate diagnostic report:', err)
      toast({
        title: 'Report Generation Failed',
        description: 'Could not generate diagnostic report',
        variant: 'destructive'
      })
    }
  }

  copyErrorDetails() {
    const details = {
      errorCode: this.state.errorCode,
      message: this.state.error?.message,
      stack: this.state.error?.stack,
      sessionId: this.props.sessionId,
      timestamp: new Date().toISOString()
    }
    
    navigator.clipboard.writeText(JSON.stringify(details, null, 2))
    toast({
      title: 'Error Details Copied',
      description: 'Error details copied to clipboard',
    })
  }

  downloadDiagnostics = async () => {
    const diagnostics = await this.collectDiagnostics()
    const errorDetails = {
      error: {
        code: this.state.errorCode,
        message: this.state.error?.message,
        stack: this.state.error?.stack,
        componentStack: this.state.errorInfo?.componentStack
      },
      diagnostics,
      sessionId: this.props.sessionId,
      projectId: this.props.projectId,
      timestamp: new Date().toISOString()
    }
    
    const blob = new Blob([JSON.stringify(errorDetails, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `preview-error-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <div className="flex items-center justify-center min-h-[400px] p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-6 w-6 text-destructive" />
              <CardTitle>Preview Error</CardTitle>
            </div>
            <CardDescription>
              {this.state.userMessage}
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Recovery Steps */}
            {this.state.recoverySteps.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Recommended Steps</AlertTitle>
                <AlertDescription>
                  <ol className="mt-2 space-y-1">
                    {this.state.recoverySteps.map((step, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </AlertDescription>
              </Alert>
            )}

            {/* Recovery Progress */}
            {this.state.isRecovering && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Attempting recovery...</span>
                  <span>{this.state.recoveryProgress}%</span>
                </div>
                <Progress value={this.state.recoveryProgress} />
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => this.attemptRecovery()}
                disabled={!this.state.canRetry || this.state.isRecovering}
              >
                {this.state.isRecovering ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recovering...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Recovery
                  </>
                )}
              </Button>
              
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Refresh Page
              </Button>
              
              <Button
                variant="outline"
                onClick={() => this.generateDiagnosticReport()}
              >
                <Bug className="mr-2 h-4 w-4" />
                Generate Report
              </Button>
            </div>

            {/* Error Details (Collapsible) */}
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="details">
                <AccordionTrigger>Technical Details</AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-2 flex-1">
                        <div>
                          <span className="font-medium">Error Code:</span> {this.state.errorCode}
                        </div>
                        <div>
                          <span className="font-medium">Retry Count:</span> {this.state.retryCount}
                        </div>
                        {this.state.diagnosticReportId && (
                          <div>
                            <span className="font-medium">Report ID:</span> {this.state.diagnosticReportId}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => this.copyErrorDetails()}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={this.downloadDiagnostics}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {this.state.error && (
                      <div className="space-y-2">
                        <div className="font-medium">Error Message:</div>
                        <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                          {this.state.error.message}
                        </pre>
                      </div>
                    )}
                    
                    {this.state.error?.stack && (
                      <div className="space-y-2">
                        <div className="font-medium">Stack Trace:</div>
                        <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-48">
                          {this.state.error.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
      </div>
    )
  }
}