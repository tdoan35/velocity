import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { 
  Activity, 
  Zap, 
  Clock, 
  MemoryStick, 
  Wifi, 
  AlertTriangle, 
  CheckCircle, 
  TrendingUp,
  Settings,
  RefreshCw
} from 'lucide-react';
import { usePerformanceMonitoring, useAPIPerformanceMonitoring } from '../../hooks/usePerformanceMonitoring';
import { NavigationPerformanceMonitor } from './NavigationPerformanceMonitor';
import { PerformanceDashboardSkeleton } from '../ui/skeleton-loader';

interface PerformanceDashboardProps {
  className?: string;
}

export function PerformanceDashboard({ className }: PerformanceDashboardProps) {
  const performance = usePerformanceMonitoring(true);
  const apiPerformance = useAPIPerformanceMonitoring();
  const [refreshKey, setRefreshKey] = useState(0);
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  useEffect(() => {
    // Simulate initial loading
    const timer = setTimeout(() => {
      setIsInitialLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  const performanceScore = performance.getPerformanceScore();
  const report = performance.generatePerformanceReport();

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-blue-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 60) return 'text-orange-600';
    return 'text-red-600';
  };

  const getScoreBackground = (score: number) => {
    if (score >= 90) return 'bg-green-100';
    if (score >= 80) return 'bg-blue-100';
    if (score >= 70) return 'bg-yellow-100';
    if (score >= 60) return 'bg-orange-100';
    return 'bg-red-100';
  };

  const formatTime = (ms: number) => {
    if (ms < 1) return `${(ms * 1000).toFixed(0)}μs`;
    if (ms < 1000) return `${ms.toFixed(1)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const refresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  // Show skeleton while loading
  if (isInitialLoading) {
    return <PerformanceDashboardSkeleton className={className} />;
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Activity className="h-6 w-6 text-blue-500" />
              <h2 className="text-xl font-semibold">Performance Dashboard</h2>
            </div>
            <Badge variant="outline" className={`${getScoreBackground(performanceScore)} ${getScoreColor(performanceScore)}`}>
              Score: {performanceScore}/100 ({report.grade})
            </Badge>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </Button>
          </div>
        </div>

        {/* Performance Score Visualization */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Overall Score</p>
                  <p className={`text-3xl font-bold ${getScoreColor(performanceScore)}`}>
                    {performanceScore}
                  </p>
                  <p className="text-sm text-muted-foreground">Grade: {report.grade}</p>
                </div>
                <Activity className="h-8 w-8 text-muted-foreground" />
              </div>
              <Progress 
                value={performanceScore} 
                className="mt-2"
                indicatorClassName={performanceScore >= 80 ? 'bg-green-500' : performanceScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Render Time</p>
                  <p className="text-2xl font-bold">{formatTime(performance.metrics.renderTime)}</p>
                  <p className="text-xs text-muted-foreground">Target: &lt;16ms</p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Memory Usage</p>
                  <p className="text-2xl font-bold">{formatSize(performance.metrics.memoryUsage * 1024 * 1024)}</p>
                  <p className="text-xs text-muted-foreground">Target: &lt;100MB</p>
                </div>
                <MemoryStick className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">API Latency</p>
                  <p className="text-2xl font-bold">{formatTime(performance.metrics.apiLatency)}</p>
                  <p className="text-xs text-muted-foreground">Target: &lt;2s</p>
                </div>
                <Wifi className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="overview" className="h-full">
          <div className="p-4 border-b">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="navigation">Navigation</TabsTrigger>
              <TabsTrigger value="metrics">Detailed Metrics</TabsTrigger>
              <TabsTrigger value="issues">Issues</TabsTrigger>
              <TabsTrigger value="optimizations">Optimizations</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="p-4 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Performance Trends */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5" />
                    <span>Performance Trends</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Render Performance</span>
                        <span className={performance.metrics.renderTime <= 16 ? 'text-green-600' : 'text-red-600'}>
                          {performance.metrics.renderTime <= 16 ? 'Good' : 'Needs Improvement'}
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(100, (16 / Math.max(performance.metrics.renderTime, 16)) * 100)} 
                        className="h-2"
                        indicatorClassName={performance.metrics.renderTime <= 16 ? 'bg-green-500' : 'bg-red-500'}
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Memory Efficiency</span>
                        <span className={performance.metrics.memoryUsage <= 100 ? 'text-green-600' : 'text-red-600'}>
                          {performance.metrics.memoryUsage <= 100 ? 'Good' : 'High Usage'}
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(100, 100 - (performance.metrics.memoryUsage / 200 * 100))} 
                        className="h-2"
                        indicatorClassName={performance.metrics.memoryUsage <= 100 ? 'bg-green-500' : 'bg-red-500'}
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Network Performance</span>
                        <span className={performance.metrics.apiLatency <= 2000 ? 'text-green-600' : 'text-red-600'}>
                          {performance.metrics.apiLatency <= 2000 ? 'Good' : 'Slow'}
                        </span>
                      </div>
                      <Progress 
                        value={Math.min(100, (2000 / Math.max(performance.metrics.apiLatency, 2000)) * 100)} 
                        className="h-2"
                        indicatorClassName={performance.metrics.apiLatency <= 2000 ? 'bg-green-500' : 'bg-red-500'}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Zap className="h-5 w-5" />
                    <span>Quick Optimizations</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => performance.optimizeComponent('Monaco Editor')}
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Optimize Monaco Editor
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => performance.optimizeComponent('File Explorer')}
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Enable File Explorer Virtualization
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    onClick={() => performance.optimizeComponent('Preview Panel')}
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Optimize Preview Rendering
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full justify-start"
                    disabled
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    Enable Service Worker Caching
                    <Badge variant="secondary" className="ml-auto">Coming Soon</Badge>
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* API Performance Summary */}
            <Card>
              <CardHeader>
                <CardTitle>API Performance Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Array.from(apiPerformance.apiMetrics.entries()).slice(0, 5).map(([endpoint, metrics]) => (
                    <div key={endpoint} className="flex items-center justify-between p-3 border rounded">
                      <div>
                        <p className="font-medium text-sm">{endpoint}</p>
                        <p className="text-xs text-muted-foreground">{metrics.count} calls</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">{formatTime(metrics.latency)}</p>
                        <Badge 
                          variant={metrics.latency > 1000 ? "destructive" : metrics.latency > 500 ? "secondary" : "default"}
                          className="text-xs"
                        >
                          {metrics.latency > 1000 ? 'Slow' : metrics.latency > 500 ? 'Medium' : 'Fast'}
                        </Badge>
                      </div>
                    </div>
                  ))}
                  
                  {apiPerformance.apiMetrics.size === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Wifi className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No API calls tracked yet</p>
                      <p className="text-sm mt-1">API performance metrics will appear here</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="navigation" className="p-4">
            <NavigationPerformanceMonitor />
          </TabsContent>

          <TabsContent value="metrics" className="p-4">
            <Card>
              <CardHeader>
                <CardTitle>Detailed Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <h4 className="font-medium">Rendering Metrics</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Render Time</span>
                        <span className="font-mono">{formatTime(performance.metrics.renderTime)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Editor Response Time</span>
                        <span className="font-mono">{formatTime(performance.metrics.editorResponseTime)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Last Measurement</span>
                        <span className="font-mono text-xs">
                          {performance.metrics.lastMeasurement.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-medium">Resource Usage</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Memory Usage</span>
                        <span className="font-mono">{formatSize(performance.metrics.memoryUsage * 1024 * 1024)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Bundle Size</span>
                        <span className="font-mono">{formatSize(performance.metrics.bundleSize * 1024 * 1024)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">API Latency</span>
                        <span className="font-mono">{formatTime(performance.metrics.apiLatency)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="issues" className="p-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5" />
                  <span>Performance Issues</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {performance.issues.length > 0 ? (
                  <div className="space-y-3">
                    {performance.issues.map((issue, index) => (
                      <div key={index} className="flex items-start space-x-3 p-3 border rounded bg-orange-50">
                        <AlertTriangle className="h-5 w-5 text-orange-500 mt-0.5" />
                        <p className="text-sm">{issue}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                    <p className="text-lg mb-2">No Performance Issues</p>
                    <p className="text-sm">Your application is running smoothly!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="optimizations" className="p-4">
            <Card>
              <CardHeader>
                <CardTitle>Optimization Recommendations</CardTitle>
              </CardHeader>
              <CardContent>
                {report.recommendations.length > 0 ? (
                  <div className="space-y-4">
                    {report.recommendations.map((recommendation, index) => (
                      <div key={index} className="flex items-start space-x-3 p-3 border rounded">
                        <Zap className="h-5 w-5 text-blue-500 mt-0.5" />
                        <p className="text-sm">{recommendation}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                    <p className="text-lg mb-2">No Recommendations</p>
                    <p className="text-sm">Your application is well optimized!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}