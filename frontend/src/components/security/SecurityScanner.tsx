import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Shield, ShieldAlert, ShieldCheck, ShieldX, AlertTriangle, Search, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { securityService, type CodeSecurityScan, type SecurityViolation } from '../../services/securityService';

interface SecurityScannerProps {
  projectId: string;
  className?: string;
  onSecurityIssue?: (violation: SecurityViolation) => void;
}

export function SecurityScanner({ projectId, className, onSecurityIssue }: SecurityScannerProps) {
  const [activeScans, setActiveScans] = useState<CodeSecurityScan[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [selectedScan, setSelectedScan] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [securityReport, setSecurityReport] = useState<any>(null);

  useEffect(() => {
    loadSecurityReport();
  }, [projectId]);

  const loadSecurityReport = async () => {
    try {
      const report = await securityService.generateSecurityReport(projectId);
      setSecurityReport(report);
    } catch (error: any) {
      console.error('Failed to load security report:', error);
      toast.error('Failed to load security report');
    }
  };

  const scanFile = async (fileName: string, content: string, language: string) => {
    try {
      const scan = await securityService.scanCode(fileName, content, language);
      
      setActiveScans(prev => {
        const existing = prev.findIndex(s => s.fileName === fileName);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = scan;
          return updated;
        }
        return [...prev, scan];
      });

      // Notify about critical violations
      const criticalViolations = scan.violations.filter(v => v.severity === 'critical');
      if (criticalViolations.length > 0) {
        toast.error(`${criticalViolations.length} critical security issues found in ${fileName}`);
        criticalViolations.forEach(violation => onSecurityIssue?.(violation));
      }

      return scan;
    } catch (error: any) {
      toast.error(`Failed to scan ${fileName}: ${error.message}`);
      throw error;
    }
  };

  const scanAllFiles = async () => {
    setIsScanning(true);
    try {
      // Mock scanning multiple files
      const mockFiles = [
        { name: 'src/components/auth/LoginForm.tsx', content: 'const apiKey = "sk_test_12345"; // Hardcoded API key\nconst password = "admin123";', language: 'typescript' },
        { name: 'src/utils/api.ts', content: 'fetch("http://api.example.com/data")\nconsole.log("User password:", password)', language: 'typescript' },
        { name: 'backend/migrations/001_initial.sql', content: 'CREATE TABLE users (id SERIAL, email TEXT);\n-- No RLS enabled', language: 'sql' },
      ];

      const scans = [];
      for (const file of mockFiles) {
        const scan = await scanFile(file.name, file.content, file.language);
        scans.push(scan);
        await new Promise(resolve => setTimeout(resolve, 500)); // Simulate scan time
      }

      toast.success(`Scanned ${scans.length} files`);
      await loadSecurityReport();
    } catch (error) {
      toast.error('Failed to complete security scan');
    } finally {
      setIsScanning(false);
    }
  };

  const getSelectedScan = (): CodeSecurityScan | null => {
    return activeScans.find(scan => scan.fileName === selectedScan) || null;
  };

  const getFilteredViolations = (violations: SecurityViolation[]): SecurityViolation[] => {
    return violations.filter(violation => {
      const matchesSearch = searchFilter === '' || 
        violation.message.toLowerCase().includes(searchFilter.toLowerCase()) ||
        violation.rule.toLowerCase().includes(searchFilter.toLowerCase());
      
      const matchesSeverity = severityFilter === 'all' || violation.severity === severityFilter;
      
      return matchesSearch && matchesSeverity;
    });
  };

  const getSeverityIcon = (severity: SecurityViolation['severity']) => {
    switch (severity) {
      case 'critical':
        return <ShieldX className="h-4 w-4 text-red-500" />;
      case 'error':
        return <ShieldAlert className="h-4 w-4 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'info':
        return <Shield className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: SecurityViolation['severity']) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'error':
        return 'bg-red-50 text-red-700';
      case 'warning':
        return 'bg-orange-100 text-orange-800';
      case 'info':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const totalViolations = activeScans.reduce((total, scan) => total + scan.violations.length, 0);
  const criticalViolations = activeScans.reduce((total, scan) => 
    total + scan.violations.filter(v => v.severity === 'critical').length, 0);

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <h3 className="font-medium">Security Scanner</h3>
            {securityReport && (
              <Badge variant="outline" className={getRiskColor(securityReport.overallRisk)}>
                {securityReport.overallRisk.toUpperCase()} RISK
              </Badge>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={scanAllFiles}
              disabled={isScanning}
            >
              <Shield className="h-4 w-4 mr-2" />
              {isScanning ? 'Scanning...' : 'Scan All Files'}
            </Button>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" />
              Configure
            </Button>
          </div>
        </div>

        {totalViolations > 0 && (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">{criticalViolations}</div>
              <div className="text-muted-foreground">Critical Issues</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{totalViolations}</div>
              <div className="text-muted-foreground">Total Violations</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{activeScans.length}</div>
              <div className="text-muted-foreground">Files Scanned</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 flex">
        {/* File List */}
        <div className="w-1/3 border-r">
          <div className="p-4">
            <h4 className="font-medium mb-3">Scanned Files</h4>
            
            <div className="space-y-2">
              {activeScans.map((scan) => (
                <Card
                  key={scan.fileName}
                  className={`cursor-pointer transition-colors ${
                    selectedScan === scan.fileName ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedScan(scan.fileName)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{scan.fileName.split('/').pop()}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {scan.fileName}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 ml-2">
                        <Badge variant="outline" className="text-xs">
                          {scan.language}
                        </Badge>
                        {scan.violations.length > 0 && (
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${scan.violations.some(v => v.severity === 'critical') 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-orange-100 text-orange-800'}`}
                          >
                            {scan.violations.length}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    {scan.riskScore > 0 && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Risk Score: {scan.riskScore}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
              
              {activeScans.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No files scanned yet</p>
                  <p className="text-sm mt-1">Click "Scan All Files" to start</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Violations Details */}
        <div className="flex-1 p-4">
          {selectedScan ? (
            <Tabs defaultValue="violations" className="h-full">
              <div className="flex items-center justify-between mb-4">
                <TabsList>
                  <TabsTrigger value="violations">Violations</TabsTrigger>
                  <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
                </TabsList>
                
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search violations..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  
                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="border rounded px-3 py-2 text-sm"
                  >
                    <option value="all">All Severities</option>
                    <option value="critical">Critical</option>
                    <option value="error">Error</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                </div>
              </div>

              <TabsContent value="violations" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Security Violations - {getSelectedScan()?.fileName.split('/').pop()}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {getSelectedScan()?.violations && getSelectedScan()!.violations.length > 0 ? (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Line</TableHead>
                            <TableHead>Severity</TableHead>
                            <TableHead>Rule</TableHead>
                            <TableHead>Message</TableHead>
                            <TableHead>Suggestion</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {getFilteredViolations(getSelectedScan()!.violations).map((violation, index) => (
                            <TableRow key={index}>
                              <TableCell className="font-mono text-sm">{violation.line}</TableCell>
                              <TableCell>
                                <div className="flex items-center space-x-2">
                                  {getSeverityIcon(violation.severity)}
                                  <Badge variant="outline" className={`text-xs ${getSeverityColor(violation.severity)}`}>
                                    {violation.severity}
                                  </Badge>
                                </div>
                              </TableCell>
                              <TableCell className="font-mono text-sm">{violation.rule}</TableCell>
                              <TableCell>{violation.message}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {violation.suggestion || '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <ShieldCheck className="h-12 w-12 mx-auto mb-4 text-green-500 opacity-50" />
                        <p className="text-lg mb-2">No Security Violations</p>
                        <p className="text-sm">This file passed all security checks</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="recommendations" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Security Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {securityReport?.recommendations ? (
                      <div className="space-y-4">
                        {securityReport.recommendations.map((recommendation: string, index: number) => (
                          <div key={index} className="flex items-start space-x-3 p-3 bg-muted/50 rounded">
                            <Shield className="h-5 w-5 text-blue-500 mt-0.5" />
                            <p className="text-sm">{recommendation}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No recommendations available</p>
                        <p className="text-sm mt-1">Run a security scan to get recommendations</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">No File Selected</p>
                <p className="text-sm">Select a scanned file to view security violations</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}