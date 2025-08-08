import { useState, useEffect } from 'react'
import { sessionPoolService } from '@/services/sessionPoolService'
import type { SessionMetrics, PoolStatus } from '@/services/sessionPoolService'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Activity, 
  DollarSign, 
  Server, 
  Users, 
  Zap,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertCircle
} from 'lucide-react'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'

export function SessionPoolDashboard() {
  const [metrics, setMetrics] = useState<SessionMetrics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [, setRefreshInterval] = useState<NodeJS.Timer | null>(null)

  useEffect(() => {
    loadMetrics()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadMetrics, 30000)
    setRefreshInterval(interval as any)
    
    return () => {
      if (interval) clearInterval(interval)
    }
  }, [])

  const loadMetrics = async () => {
    try {
      setIsLoading(true)
      const data = await sessionPoolService.getMetrics()
      setMetrics(data)
    } catch (error) {
      console.error('Failed to load metrics:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getPoolHealth = (pool: PoolStatus) => {
    if (pool.errorSessions > 0) return 'error'
    if (pool.utilizationPercentage > 90) return 'warning'
    if (pool.utilizationPercentage < 20 && pool.totalSessions > pool.readySessions) return 'idle'
    return 'healthy'
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value)
  }

  if (isLoading && !metrics) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (!metrics) {
    return (
      <div className="text-center py-8">
        <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
        <p className="text-muted-foreground">No metrics available</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Session Pool Monitor</h2>
          <p className="text-muted-foreground">Real-time session pool status and metrics</p>
        </div>
        <Button 
          variant="outline" 
          size="sm"
          onClick={loadMetrics}
          disabled={isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sessions</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.pools.reduce((acc, pool) => acc + pool.totalSessions, 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              Across {metrics.pools.length} pools
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics.pools.reduce((acc, pool) => acc + pool.activeSessions, 0)}
            </div>
            <Progress 
              value={
                (metrics.pools.reduce((acc, pool) => acc + pool.activeSessions, 0) / 
                 metrics.pools.reduce((acc, pool) => acc + pool.totalSessions, 0)) * 100
              } 
              className="mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">24h Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(metrics.cost.last24Hours)}
            </div>
            <p className="text-xs text-muted-foreground">
              Est. monthly: {formatCurrency(metrics.cost.estimatedMonthly)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Utilization</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(
                metrics.pools.reduce((acc, pool) => acc + pool.utilizationPercentage, 0) / 
                metrics.pools.length
              )}%
            </div>
            <div className="flex items-center text-xs text-muted-foreground mt-1">
              {metrics.history.length > 1 && 
                metrics.history[0].utilizationRate > metrics.history[metrics.history.length - 1].utilizationRate ? (
                  <>
                    <TrendingUp className="h-3 w-3 mr-1 text-green-500" />
                    Increasing
                  </>
                ) : (
                  <>
                    <TrendingDown className="h-3 w-3 mr-1 text-red-500" />
                    Decreasing
                  </>
                )
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pool Status */}
      <Card>
        <CardHeader>
          <CardTitle>Session Pools</CardTitle>
          <CardDescription>Individual pool status and health</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metrics.pools.map((pool) => {
              const health = getPoolHealth(pool)
              return (
                <div key={pool.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className={`h-3 w-3 rounded-full ${
                      health === 'error' ? 'bg-red-500' :
                      health === 'warning' ? 'bg-yellow-500' :
                      health === 'idle' ? 'bg-blue-500' :
                      'bg-green-500'
                    }`} />
                    <div>
                      <h4 className="font-medium">{pool.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {pool.platform} • {pool.deviceType}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-sm font-medium">{pool.activeSessions}/{pool.totalSessions}</p>
                      <p className="text-xs text-muted-foreground">Active/Total</p>
                    </div>
                    
                    <div className="text-right">
                      <p className="text-sm font-medium">{pool.utilizationPercentage}%</p>
                      <p className="text-xs text-muted-foreground">Utilization</p>
                    </div>
                    
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">
                        <Zap className="h-3 w-3 mr-1" />
                        {pool.readySessions} ready
                      </Badge>
                      {pool.hibernatedSessions > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {pool.hibernatedSessions} hibernated
                        </Badge>
                      )}
                      {pool.errorSessions > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {pool.errorSessions} error
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Utilization Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Utilization Trends</CardTitle>
          <CardDescription>Session pool utilization over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.history}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="timestamp" 
                  tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleString()}
                  formatter={(value: number) => `${value}%`}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="utilizationRate" 
                  stroke="#8884d8" 
                  name="Utilization %"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="activeSessions" 
                  stroke="#82ca9d" 
                  name="Active Sessions"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Session Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Session Distribution</CardTitle>
            <CardDescription>Current session states</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={[
                    {
                      name: 'Sessions',
                      active: metrics.pools.reduce((acc, p) => acc + p.activeSessions, 0),
                      ready: metrics.pools.reduce((acc, p) => acc + p.readySessions, 0),
                      hibernated: metrics.pools.reduce((acc, p) => acc + p.hibernatedSessions, 0),
                      error: metrics.pools.reduce((acc, p) => acc + p.errorSessions, 0)
                    }
                  ]}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="active" fill="#22c55e" name="Active" />
                  <Bar dataKey="ready" fill="#3b82f6" name="Ready" />
                  <Bar dataKey="hibernated" fill="#f59e0b" name="Hibernated" />
                  <Bar dataKey="error" fill="#ef4444" name="Error" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost Analysis</CardTitle>
            <CardDescription>Hourly cost trends</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.history}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis 
                    dataKey="timestamp" 
                    tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                  />
                  <YAxis tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    labelFormatter={(value) => new Date(value).toLocaleString()}
                    formatter={(value: number) => formatCurrency(value)}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="costPerHour" 
                    stroke="#8b5cf6" 
                    fill="#8b5cf6" 
                    fillOpacity={0.3}
                    name="Cost/Hour"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}