/**
 * OAuth2 Integration Test Component
 * Comprehensive test interface for OAuth2 features
 */

import React, { useState, useEffect } from 'react'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Database,
  Users,
  Zap,
  RefreshCw,
  Activity,
  Settings,
  Shield,
  Info
} from 'lucide-react'
import { enhancedOAuth2Service } from '@/services/enhancedOAuth2Service'
import { oauth2HealthMonitor } from '@/services/oauth2HealthMonitor'
import { oauth2TokenManager } from '@/services/oauth2TokenManager'
import type { HealthCheckResult } from '@/services/oauth2HealthMonitor'

export interface OAuth2IntegrationTestProps {
  projectId: string
}

export function OAuth2IntegrationTest({ projectId }: OAuth2IntegrationTestProps) {
  const [testResults, setTestResults] = useState<Record<string, any>>({})
  const [isRunningTests, setIsRunningTests] = useState(false)
  const [connectionId, setConnectionId] = useState('')
  const [healthStatus, setHealthStatus] = useState<HealthCheckResult | null>(null)
  const [tokenRefreshLog, setTokenRefreshLog] = useState<string[]>([])

  // Mock connection ID for testing (in real usage, this comes from OAuth flow)
  useEffect(() => {
    // Initialize health monitoring with test event handlers
    oauth2HealthMonitor.on('onConnectionUnhealthy', (result) => {
      setTokenRefreshLog(prev => [...prev, `UNHEALTHY: ${result.error} (${new Date().toLocaleTimeString()})`])
    })

    oauth2HealthMonitor.on('onConnectionRecovered', (result) => {
      setTokenRefreshLog(prev => [...prev, `RECOVERED: Connection healthy (${new Date().toLocaleTimeString()})`])
    })

    oauth2HealthMonitor.on('onTokenExpiringSoon', (connectionId, expiresIn) => {
      setTokenRefreshLog(prev => [...prev, `TOKEN WARNING: Expires in ${expiresIn} minutes (${new Date().toLocaleTimeString()})`])
    })

    oauth2HealthMonitor.on('onRateLimitWarning', (connectionId, remaining) => {
      setTokenRefreshLog(prev => [...prev, `RATE LIMIT WARNING: ${remaining} requests remaining (${new Date().toLocaleTimeString()})`])
    })

    // Start monitoring
    oauth2HealthMonitor.startMonitoring(1) // Check every minute for testing

    // Start token refresh scheduler
    oauth2TokenManager.startTokenRefreshScheduler(2) // Check every 2 minutes for testing

    return () => {
      oauth2HealthMonitor.stopMonitoring()
    }
  }, [])

  const runTest = async (testName: string, testFn: () => Promise<any>) => {
    try {
      setTestResults(prev => ({ ...prev, [testName]: { status: 'running', result: null, error: null } }))
      
      const result = await testFn()
      
      setTestResults(prev => ({ 
        ...prev, 
        [testName]: { status: 'success', result, error: null } 
      }))
      
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setTestResults(prev => ({ 
        ...prev, 
        [testName]: { status: 'error', result: null, error: errorMessage } 
      }))
      throw error
    }
  }

  const runAllTests = async () => {
    setIsRunningTests(true)
    setTestResults({})
    setTokenRefreshLog([])

    try {
      // Test 1: OAuth2 Flow Initiation
      await runTest('oauth2_initiate', async () => {
        const result = await enhancedOAuth2Service.initiateFlow({
          project_id: projectId
        })
        return result
      })

      // Test 2: Connection Info Retrieval
      await runTest('connection_info', async () => {
        const result = await enhancedOAuth2Service.getConnectionInfo(projectId)
        if (result.success && result.data) {
          setConnectionId(result.data.id)
        }
        return result
      })

      // Test 3: Health Check (if we have a connection)
      if (connectionId) {
        await runTest('health_check', async () => {
          const result = await oauth2HealthMonitor.checkConnectionHealth(connectionId)
          setHealthStatus(result)
          return result
        })

        // Test 4: Rate Limit Status
        await runTest('rate_limit_status', async () => {
          const status = oauth2TokenManager.getRateLimitStatus(connectionId)
          return status
        })

        // Test 5: Token Validation
        await runTest('token_validation', async () => {
          const result = await oauth2TokenManager.getValidTokens(connectionId)
          return result
        })
      }

      // Test 6: Health Monitor Status
      await runTest('health_monitor_summary', async () => {
        const summary = oauth2HealthMonitor.getHealthSummary()
        return summary
      })

    } catch (error) {
      console.error('Test execution failed:', error)
    } finally {
      setIsRunningTests(false)
    }
  }

  const forceHealthCheck = async () => {
    if (!connectionId) return
    
    try {
      const result = await oauth2HealthMonitor.forceHealthCheck(connectionId)
      setHealthStatus(result)
      setTokenRefreshLog(prev => [...prev, `MANUAL CHECK: ${result.isHealthy ? 'Healthy' : 'Unhealthy'} (${new Date().toLocaleTimeString()})`])
    } catch (error) {
      setTokenRefreshLog(prev => [...prev, `MANUAL CHECK ERROR: ${error instanceof Error ? error.message : 'Unknown error'}`])
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
      case 'success':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'border-blue-200 bg-blue-50'
      case 'success':
        return 'border-green-200 bg-green-50'
      case 'error':
        return 'border-red-200 bg-red-50'
      default:
        return 'border-gray-200 bg-gray-50'
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Shield className="w-6 h-6" />
          OAuth2 Integration Test Suite
        </h1>
        <Button 
          onClick={runAllTests} 
          disabled={isRunningTests}
          className="min-w-32"
        >
          {isRunningTests ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Running Tests
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              Run All Tests
            </>
          )}
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This test suite validates OAuth2 integration features including token management, 
          health monitoring, and rate limiting. Project ID: <code>{projectId}</code>
        </AlertDescription>
      </Alert>

      {/* Test Results */}
      <div className="grid gap-4 md:grid-cols-2">
        {[
          { id: 'oauth2_initiate', title: 'OAuth2 Flow Initiation', icon: Database },
          { id: 'connection_info', title: 'Connection Information', icon: Settings },
          { id: 'health_check', title: 'Health Check', icon: Activity },
          { id: 'rate_limit_status', title: 'Rate Limit Status', icon: Clock },
          { id: 'token_validation', title: 'Token Validation', icon: Shield },
          { id: 'health_monitor_summary', title: 'Health Monitor Summary', icon: Users }
        ].map((test) => {
          const result = testResults[test.id]
          const Icon = test.icon
          
          return (
            <Card key={test.id} className={`transition-colors ${getStatusColor(result?.status || 'pending')}`}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {test.title}
                  {getStatusIcon(result?.status || 'pending')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {result?.status === 'success' && (
                  <div className="space-y-2">
                    <Badge variant="outline" className="text-green-700 border-green-300">
                      Success
                    </Badge>
                    {result.result && (
                      <pre className="text-xs bg-white p-2 rounded border overflow-auto max-h-32">
                        {JSON.stringify(result.result, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
                
                {result?.status === 'error' && (
                  <div className="space-y-2">
                    <Badge variant="destructive">
                      Error
                    </Badge>
                    <p className="text-sm text-red-700">{result.error}</p>
                  </div>
                )}
                
                {result?.status === 'running' && (
                  <Badge variant="secondary">
                    Running...
                  </Badge>
                )}
                
                {!result && (
                  <Badge variant="outline">
                    Pending
                  </Badge>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Health Status */}
      {healthStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Connection Health Status
              <Button size="sm" variant="outline" onClick={forceHealthCheck}>
                <RefreshCw className="w-3 h-3 mr-1" />
                Refresh
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {healthStatus.isHealthy ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm font-medium">
                  {healthStatus.isHealthy ? 'Healthy' : 'Unhealthy'}
                </span>
                <Badge variant="outline" className="text-xs">
                  Last checked: {healthStatus.lastChecked.toLocaleTimeString()}
                </Badge>
              </div>
              
              {healthStatus.error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Error:</strong> {healthStatus.error}
                    {healthStatus.recommendation && (
                      <div className="mt-1">
                        <strong>Recommendation:</strong> {healthStatus.recommendation}
                      </div>
                    )}
                  </AlertDescription>
                </Alert>
              )}
              
              {healthStatus.details && (
                <pre className="text-xs bg-gray-50 p-2 rounded border overflow-auto max-h-32">
                  {JSON.stringify(healthStatus.details, null, 2)}
                </pre>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Token Refresh Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="w-4 h-4" />
            Token Management Log
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setTokenRefreshLog([])}
            >
              Clear
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {tokenRefreshLog.length === 0 ? (
              <p className="text-sm text-gray-500 italic">No events logged yet...</p>
            ) : (
              tokenRefreshLog.map((log, index) => (
                <div key={index} className="text-xs font-mono bg-gray-50 p-2 rounded">
                  {log}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Manual Connection ID Input for Testing */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Test Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div>
              <Label htmlFor="connection-id" className="text-sm">Connection ID (for testing)</Label>
              <Input
                id="connection-id"
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
                placeholder="Enter OAuth2 connection ID for testing..."
                className="text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                In real usage, this ID comes from the OAuth2 authorization flow
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}