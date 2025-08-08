import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import {
  Activity,
  Zap,
  TrendingUp,
  AlertCircle,
  RefreshCw,
  Flame,
  Clock,
  Database,
  Wifi
} from 'lucide-react'
import { usePreviewPerformance } from '@/hooks/usePreviewPerformance'
import { cn } from '@/lib/utils'

interface PerformanceMonitorProps {
  projectId?: string
  className?: string
  compact?: boolean
}

export function PerformanceMonitor({ projectId, className, compact = false }: PerformanceMonitorProps) {
  const {
    metrics,
    trends,
    recommendations,
    optimizationConfig,
    isOptimizing,
    warmSessions,
    optimizeBuild,
    updateOptimizationConfig,
    detectNetworkQuality,
    refresh
  } = usePreviewPerformance({ projectId })

  const [networkQuality, setNetworkQuality] = useState('good')
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h')

  useEffect(() => {
    // Monitor network quality
    const interval = setInterval(() => {
      const quality = detectNetworkQuality()
      setNetworkQuality(quality)
    }, 10000) // Check every 10 seconds

    return () => clearInterval(interval)
  }, [detectNetworkQuality])

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  const getPerformanceColor = (value: number, type: string) => {
    const thresholds = {
      preview_startup: { good: 1000, warning: 3000 },
      build_time: { good: 10000, warning: 30000 },
      hot_reload: { good: 500, warning: 2000 },
      session_allocation: { good: 1000, warning: 3000 }
    }

    const threshold = thresholds[type as keyof typeof thresholds] || { good: 1000, warning: 3000 }
    
    if (value <= threshold.good) return 'text-green-500'
    if (value <= threshold.warning) return 'text-yellow-500'
    return 'text-red-500'
  }

  const getNetworkIcon = () => {
    const icons = {
      excellent: <Wifi className="w-4 h-4 text-green-500" />,
      good: <Wifi className="w-4 h-4 text-blue-500" />,
      fair: <Wifi className="w-4 h-4 text-yellow-500" />,
      poor: <Wifi className="w-4 h-4 text-red-500" />
    }
    return icons[networkQuality as keyof typeof icons] || icons.good
  }

  if (compact) {
    return (
      <Card className={className}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Performance</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={refresh}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {metrics && (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Startup</span>
                  <span className={getPerformanceColor(metrics.averageStartupTime, 'preview_startup')}>
                    {formatDuration(metrics.averageStartupTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Build</span>
                  <span className={getPerformanceColor(metrics.averageBuildTime, 'build_time')}>
                    {formatDuration(metrics.averageBuildTime)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cache Hit</span>
                  <span className={metrics.cacheHitRate > 0.7 ? 'text-green-500' : 'text-yellow-500'}>
                    {Math.round(metrics.cacheHitRate * 100)}%
                  </span>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Performance Monitor</h2>
          <p className="text-muted-foreground">
            Real-time preview system performance metrics
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            {getNetworkIcon()}
            <span className="text-sm capitalize">{networkQuality}</span>
          </div>
          <Select value={selectedTimeRange} onValueChange={setSelectedTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={refresh} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Avg Startup Time
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics ? formatDuration(metrics.averageStartupTime) : '--'}
            </div>
            <p className="text-xs text-muted-foreground">
              {metrics && metrics.optimizationImpact > 0 && (
                <span className="text-green-500">
                  {metrics.optimizationImpact}% faster
                </span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Cache Hit Rate
            </CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics ? `${Math.round(metrics.cacheHitRate * 100)}%` : '--'}
            </div>
            <Progress
              value={metrics ? metrics.cacheHitRate * 100 : 0}
              className="mt-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Hot Reload Speed
            </CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics ? formatDuration(metrics.averageHotReloadTime) : '--'}
            </div>
            <p className="text-xs text-muted-foreground">
              Avg time to reload
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Sessions
            </CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {metrics?.totalSessions || 0}
            </div>
            <p className="text-xs text-muted-foreground">
              In selected period
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">Trends</TabsTrigger>
          <TabsTrigger value="optimization">Optimization</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Trends</CardTitle>
              <CardDescription>
                Average response times over the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={(value) => {
                        const date = new Date(value)
                        return `${date.getHours()}:00`
                      }}
                    />
                    <YAxis />
                    <Tooltip
                      formatter={(value: number) => formatDuration(value)}
                      labelFormatter={(label) => {
                        const date = new Date(label)
                        return date.toLocaleString()
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="average"
                      stroke="#8884d8"
                      name="Avg Response Time"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="optimization" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Optimization Settings</CardTitle>
              <CardDescription>
                Configure performance optimization features
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {optimizationConfig && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">Session Warming</div>
                      <div className="text-sm text-muted-foreground">
                        Pre-warm sessions for instant preview access
                      </div>
                    </div>
                    <Switch
                      checked={optimizationConfig.enableSessionWarming}
                      onCheckedChange={(checked) => {
                        updateOptimizationConfig({ enableSessionWarming: checked })
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">Adaptive Quality</div>
                      <div className="text-sm text-muted-foreground">
                        Adjust preview quality based on network conditions
                      </div>
                    </div>
                    <Switch
                      checked={optimizationConfig.adaptiveQuality}
                      onCheckedChange={(checked) => {
                        updateOptimizationConfig({ adaptiveQuality: checked })
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Cache Strategy</label>
                    <Select
                      value={optimizationConfig.cacheStrategy}
                      onValueChange={(value: any) => {
                        updateOptimizationConfig({ cacheStrategy: value })
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="aggressive">Aggressive</SelectItem>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="minimal">Minimal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={() => warmSessions()}
                      variant="outline"
                      className="flex-1"
                    >
                      <Flame className="w-4 h-4 mr-2" />
                      Warm Sessions
                    </Button>
                    <Button
                      onClick={optimizeBuild}
                      disabled={isOptimizing}
                      className="flex-1"
                    >
                      <TrendingUp className="w-4 h-4 mr-2" />
                      {isOptimizing ? 'Optimizing...' : 'Optimize Build'}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Performance Recommendations</CardTitle>
              <CardDescription>
                Suggested improvements based on current metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recommendations.length > 0 ? (
                <div className="space-y-2">
                  {recommendations.map((recommendation, index) => (
                    <Alert key={index}>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{recommendation}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No recommendations at this time. Your preview system is performing well!
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}