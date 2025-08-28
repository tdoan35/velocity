import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Activity, TrendingUp, Clock, Zap, Download, RefreshCw } from 'lucide-react';
import { navigationMetrics, useNavigationTracking } from '../../utils/performance/navigationMetrics';
import { projectDataCache } from '../../utils/cache/ProjectDataCache';

interface NavigationPerformanceMonitorProps {
  className?: string;
}

export function NavigationPerformanceMonitor({ className }: NavigationPerformanceMonitorProps) {
  const [stats, setStats] = useState(navigationMetrics.getNavigationStats());
  const [cacheStats, setCacheStats] = useState(projectDataCache.getStats());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { exportMetrics } = useNavigationTracking();

  const refreshStats = () => {
    setIsRefreshing(true);
    setStats(navigationMetrics.getNavigationStats());
    setCacheStats(projectDataCache.getStats());
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    // Auto-refresh stats every 5 seconds
    const interval = setInterval(refreshStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const exportPerformanceData = () => {
    const data = {
      navigationStats: stats,
      cacheStats,
      timestamp: new Date().toISOString(),
      rawMetrics: exportMetrics()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `navigation-performance-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getPerformanceScore = (): number => {
    if (stats.totalNavigations === 0) return 100;
    
    // Score based on average navigation time (lower is better)
    const avgTime = stats.averageTime;
    if (avgTime < 100) return 100;
    if (avgTime < 200) return 90;
    if (avgTime < 300) return 80;
    if (avgTime < 500) return 70;
    return Math.max(60, 100 - Math.floor(avgTime / 10));
  };

  const performanceScore = getPerformanceScore();
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Performance Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Performance Score</p>
                <p className={`text-2xl font-bold ${getScoreColor(performanceScore)}`}>
                  {performanceScore}/100
                </p>
              </div>
              <Activity className="h-8 w-8 text-muted-foreground" />
            </div>
            <Progress value={performanceScore} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Navigation</p>
                <p className="text-2xl font-bold">
                  {stats.averageTime.toFixed(0)}ms
                </p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Cache Hit Rate</p>
                <p className="text-2xl font-bold text-green-600">
                  {cacheStats.hitRate.toFixed(1)}%
                </p>
              </div>
              <Zap className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Performance */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5" />
              <span>Navigation Performance</span>
            </CardTitle>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshStats}
                disabled={isRefreshing}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportPerformanceData}
              >
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Design → Editor</span>
                <Badge variant={stats.designToEditor < 150 ? "default" : "secondary"}>
                  {stats.designToEditor.toFixed(0)}ms
                </Badge>
              </div>
              <Progress value={Math.min(100, (200 - stats.designToEditor) / 2)} />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Editor → Design</span>
                <Badge variant={stats.editorToDesign < 150 ? "default" : "secondary"}>
                  {stats.editorToDesign.toFixed(0)}ms
                </Badge>
              </div>
              <Progress value={Math.min(100, (200 - stats.editorToDesign) / 2)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total Navigations:</span>
              <span className="ml-2 font-medium">{stats.totalNavigations}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Fastest:</span>
              <span className="ml-2 font-medium">
                {stats.fastestNavigation ? `${stats.fastestNavigation.duration?.toFixed(0)}ms` : 'N/A'}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cache Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Zap className="h-5 w-5" />
            <span>Cache Performance</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total Entries:</span>
              <p className="text-lg font-medium">{cacheStats.totalEntries}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Cache Size:</span>
              <p className="text-lg font-medium">
                {(cacheStats.cacheSize / 1024).toFixed(1)}KB
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Hits:</span>
              <p className="text-lg font-medium text-green-600">{cacheStats.totalHits}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Total Misses:</span>
              <p className="text-lg font-medium text-orange-600">{cacheStats.totalMisses}</p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Hit Rate</span>
              <Badge variant={cacheStats.hitRate > 80 ? "default" : "secondary"}>
                {cacheStats.hitRate.toFixed(1)}%
              </Badge>
            </div>
            <Progress value={cacheStats.hitRate} />
          </div>

          <div className="text-xs text-muted-foreground">
            <p>Average access time: {cacheStats.averageAccessTime.toFixed(2)}ms</p>
            {cacheStats.oldestEntry && (
              <p>
                Oldest entry: {new Date(cacheStats.oldestEntry).toLocaleTimeString()}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}