import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Shield, ShieldAlert, ShieldCheck, ShieldX, AlertTriangle, TrendingUp, Lock, Unlock, Settings, RefreshCw } from 'lucide-react';
import { useSecurity } from '../../contexts/UnifiedProjectContext';
import { SecurityDashboardSkeleton } from '../ui/skeleton-loader';
import { SecurityScanner } from './SecurityScanner';

interface SecurityDashboardProps {
  projectId: string;
  className?: string;
}

export function SecurityDashboard({ projectId, className }: SecurityDashboardProps) {
  const { 
    config, 
    isSecurityEnabled, 
    activeThreats, 
    recentScans,
    enableSecurity,
    disableSecurity,
    updateConfig
  } = useSecurity();
  
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  
  const [securityMetrics, setSecurityMetrics] = useState({
    totalScans: 0,
    filesScanned: 0,
    vulnerabilitiesFound: 0,
    criticalIssues: 0,
    fixedIssues: 0,
    lastScanTime: null as Date | null,
  });

  const [trendData, setTrendData] = useState({
    weeklyScans: [5, 8, 12, 15, 18, 22, 25],
    weeklyVulns: [3, 5, 8, 6, 4, 2, 1],
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  });

  useEffect(() => {
    updateMetrics();
    // Simulate initial loading
    if (isInitialLoading) {
      const timer = setTimeout(() => {
        setIsInitialLoading(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [recentScans, isInitialLoading]);

  const updateMetrics = () => {
    const metrics = {
      totalScans: recentScans.length,
      filesScanned: recentScans.length,
      vulnerabilitiesFound: recentScans.reduce((total, scan) => total + scan.violations.length, 0),
      criticalIssues: recentScans.reduce((total, scan) => 
        total + scan.violations.filter(v => v.severity === 'critical').length, 0),
      fixedIssues: Math.floor(Math.random() * 10), // Mock fixed issues
      lastScanTime: recentScans.length > 0 ? new Date() : null,
    };
    
    setSecurityMetrics(metrics);
  };

  const getSecurityStatus = () => {
    if (!isSecurityEnabled) return { status: 'disabled', color: 'gray', icon: Unlock };
    if (activeThreats > 5) return { status: 'critical', color: 'red', icon: ShieldX };
    if (activeThreats > 2) return { status: 'warning', color: 'orange', icon: ShieldAlert };
    if (activeThreats > 0) return { status: 'moderate', color: 'yellow', icon: AlertTriangle };
    return { status: 'secure', color: 'green', icon: ShieldCheck };
  };

  const securityStatus = getSecurityStatus();

  const toggleSecurity = () => {
    if (isSecurityEnabled) {
      disableSecurity();
    } else {
      enableSecurity();
    }
  };

  const refreshMetrics = () => {
    updateMetrics();
    // Simulate updated trend data
    setTrendData(prev => ({
      ...prev,
      weeklyScans: prev.weeklyScans.map(val => Math.max(0, val + Math.floor(Math.random() * 5) - 2)),
      weeklyVulns: prev.weeklyVulns.map(val => Math.max(0, val + Math.floor(Math.random() * 3) - 1)),
    }));
  };

  // Show skeleton while loading
  if (isInitialLoading) {
    return <SecurityDashboardSkeleton className={className} />;
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <securityStatus.icon className={`h-6 w-6 text-${securityStatus.color}-500`} />
              <h2 className="text-xl font-semibold">Security Dashboard</h2>
            </div>
            <Badge 
              variant="outline" 
              className={`bg-${securityStatus.color}-100 text-${securityStatus.color}-800 capitalize`}
            >
              {securityStatus.status}
            </Badge>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={refreshMetrics}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button 
              variant={isSecurityEnabled ? "destructive" : "default"} 
              size="sm" 
              onClick={toggleSecurity}
            >
              {isSecurityEnabled ? <Lock className="h-4 w-4 mr-2" /> : <Unlock className="h-4 w-4 mr-2" />}
              {isSecurityEnabled ? 'Disable' : 'Enable'} Security
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </Button>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Threats</p>
                  <p className={`text-2xl font-bold ${activeThreats > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {activeThreats}
                  </p>
                </div>
                <ShieldAlert className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Files Scanned</p>
                  <p className="text-2xl font-bold">{securityMetrics.filesScanned}</p>
                </div>
                <Shield className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Vulnerabilities</p>
                  <p className="text-2xl font-bold text-orange-600">{securityMetrics.vulnerabilitiesFound}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Issues Fixed</p>
                  <p className="text-2xl font-bold text-green-600">{securityMetrics.fixedIssues}</p>
                </div>
                <ShieldCheck className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="flex-1">
        <Tabs defaultValue="overview" className="h-full">
          <div className="p-4 border-b">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="scanner">Scanner</TabsTrigger>
              <TabsTrigger value="policies">Policies</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="overview" className="p-4 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Security Trends */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5" />
                    <span>Security Trends (7 Days)</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Scans Completed</span>
                        <span className="font-medium">{trendData.weeklyScans.reduce((a, b) => a + b, 0)}</span>
                      </div>
                      <div className="flex items-end space-x-1 h-16">
                        {trendData.weeklyScans.map((value, index) => (
                          <div key={index} className="flex-1 flex flex-col items-center">
                            <div 
                              className="w-full bg-blue-200 rounded-t"
                              style={{ height: `${(value / Math.max(...trendData.weeklyScans)) * 100}%` }}
                            />
                            <span className="text-xs text-muted-foreground mt-1">
                              {trendData.labels[index]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span>Vulnerabilities Found</span>
                        <span className="font-medium text-orange-600">{trendData.weeklyVulns.reduce((a, b) => a + b, 0)}</span>
                      </div>
                      <div className="flex items-end space-x-1 h-16">
                        {trendData.weeklyVulns.map((value, index) => (
                          <div key={index} className="flex-1 flex flex-col items-center">
                            <div 
                              className="w-full bg-orange-200 rounded-t"
                              style={{ height: `${(value / Math.max(...trendData.weeklyVulns)) * 100}%` }}
                            />
                            <span className="text-xs text-muted-foreground mt-1">
                              {trendData.labels[index]}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Security Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Settings className="h-5 w-5" />
                    <span>Security Configuration</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Code Scanning</span>
                      <Badge variant={config.enableCodeScanning ? "default" : "secondary"}>
                        {config.enableCodeScanning ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Dependency Checks</span>
                      <Badge variant={config.enableDependencyChecks ? "default" : "secondary"}>
                        {config.enableDependencyChecks ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Database Security</span>
                      <Badge variant={config.enableDatabaseSecurityChecks ? "default" : "secondary"}>
                        {config.enableDatabaseSecurityChecks ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <span className="text-sm">API Validation</span>
                      <Badge variant={config.enableAPISecurityValidation ? "default" : "secondary"}>
                        {config.enableAPISecurityValidation ? "Enabled" : "Disabled"}
                      </Badge>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Max File Size</span>
                        <span className="text-muted-foreground">
                          {(config.maxFileSize / (1024 * 1024)).toFixed(1)}MB
                        </span>
                      </div>
                      
                      <div className="flex justify-between text-sm">
                        <span>Allowed Domains</span>
                        <span className="text-muted-foreground">
                          {config.allowedDomains.length} configured
                        </span>
                      </div>
                      
                      <div className="flex justify-between text-sm">
                        <span>Blocked Packages</span>
                        <span className="text-muted-foreground">
                          {config.blockedPackages.length} blocked
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Recent Security Events */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Security Events</CardTitle>
              </CardHeader>
              <CardContent>
                {recentScans.length > 0 ? (
                  <div className="space-y-3">
                    {recentScans.slice(0, 5).map((scan, index) => (
                      <div key={index} className="flex items-center justify-between p-3 border rounded">
                        <div className="flex items-center space-x-3">
                          {scan.violations.some(v => v.severity === 'critical') ? (
                            <ShieldX className="h-5 w-5 text-red-500" />
                          ) : scan.violations.length > 0 ? (
                            <ShieldAlert className="h-5 w-5 text-orange-500" />
                          ) : (
                            <ShieldCheck className="h-5 w-5 text-green-500" />
                          )}
                          <div>
                            <p className="font-medium text-sm">{scan.fileName.split('/').pop()}</p>
                            <p className="text-xs text-muted-foreground">
                              {scan.violations.length} issues found
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <Badge variant="outline" className="text-xs">
                            Risk: {scan.riskScore}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No recent security events</p>
                    <p className="text-sm mt-1">Security scans will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="scanner" className="h-full">
            <SecurityScanner projectId={projectId} />
          </TabsContent>

          <TabsContent value="policies" className="p-4">
            <Card>
              <CardHeader>
                <CardTitle>Security Policies</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Security policy configuration coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="p-4">
            <Card>
              <CardHeader>
                <CardTitle>Security Reports</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Detailed security reports coming soon...</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}