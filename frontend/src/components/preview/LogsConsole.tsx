import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Terminal, Trash2, Download, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';

interface LogsConsoleProps {
  projectId: string;
  includeBackend: boolean;
  className?: string;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: 'frontend' | 'backend' | 'database' | 'edge-function';
  message: string;
  details?: any;
}

export function LogsConsole({ projectId, includeBackend, className }: LogsConsoleProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([]);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Mock log generation for demo
  useEffect(() => {
    const generateMockLog = (): LogEntry => {
      const levels: LogEntry['level'][] = ['info', 'warn', 'error', 'debug'];
      const sources: LogEntry['source'][] = includeBackend 
        ? ['frontend', 'backend', 'database', 'edge-function']
        : ['frontend'];
      
      const messages = [
        'Component rendered successfully',
        'API request completed',
        'Database connection established',
        'User authentication successful',
        'Cache updated',
        'Warning: Deprecated function used',
        'Error: Network request failed',
        'Debug: State update triggered',
        'File uploaded to storage',
        'Real-time subscription active',
      ];

      return {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date(),
        level: levels[Math.floor(Math.random() * levels.length)],
        source: sources[Math.floor(Math.random() * sources.length)],
        message: messages[Math.floor(Math.random() * messages.length)],
        details: Math.random() > 0.7 ? { requestId: Math.random().toString(36).substr(2, 9) } : undefined,
      };
    };

    // Add initial logs
    const initialLogs = Array.from({ length: 20 }, generateMockLog);
    setLogs(initialLogs);

    // Simulate real-time logs
    const interval = setInterval(() => {
      if (Math.random() > 0.3) { // 70% chance to add a log
        setLogs(prevLogs => {
          const newLog = generateMockLog();
          const updatedLogs = [...prevLogs, newLog];
          // Keep only last 200 logs
          return updatedLogs.slice(-200);
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [includeBackend]);

  // Filter logs based on criteria
  useEffect(() => {
    let filtered = logs;

    if (filterLevel !== 'all') {
      filtered = filtered.filter(log => log.level === filterLevel);
    }

    if (filterSource !== 'all') {
      filtered = filtered.filter(log => log.source === filterSource);
    }

    if (searchTerm) {
      filtered = filtered.filter(log =>
        log.message.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredLogs(filtered);
  }, [logs, filterLevel, filterSource, searchTerm]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs, autoScroll]);

  const handleScroll = () => {
    if (logsContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = logsContainerRef.current;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
      setAutoScroll(isAtBottom);
    }
  };

  const clearLogs = () => {
    setLogs([]);
    toast.success('Logs cleared');
  };

  const exportLogs = () => {
    const exportData = {
      projectId,
      timestamp: new Date().toISOString(),
      logs: filteredLogs,
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${projectId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Logs exported');
  };

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-600 bg-red-50 border-red-200';
      case 'warn':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'info':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'debug':
        return 'text-gray-600 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getSourceIcon = (source: LogEntry['source']) => {
    switch (source) {
      case 'frontend':
        return '🖥️';
      case 'backend':
        return '⚙️';
      case 'database':
        return '🗄️';
      case 'edge-function':
        return '⚡';
      default:
        return '📋';
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-3 border-b space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Terminal className="h-5 w-5" />
            <h3 className="font-medium">Logs Console</h3>
            <Badge variant="outline">{filteredLogs.length} entries</Badge>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={exportLogs}>
              <Download className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={clearLogs}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center space-x-2">
          <div className="flex-1">
            <Input
              placeholder="Search logs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8"
            />
          </div>
          
          <Select value={filterLevel} onValueChange={setFilterLevel}>
            <SelectTrigger className="w-32 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Levels</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warn">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="debug">Debug</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="w-32 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="frontend">Frontend</SelectItem>
              {includeBackend && (
                <>
                  <SelectItem value="backend">Backend</SelectItem>
                  <SelectItem value="database">Database</SelectItem>
                  <SelectItem value="edge-function">Edge Function</SelectItem>
                </>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Logs */}
      <div
        ref={logsContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-3 space-y-1 font-mono text-sm bg-gray-950 text-gray-100"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-center text-gray-400 py-8">
            <Terminal className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No logs to display</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div
              key={log.id}
              className={`p-2 rounded-sm border-l-4 ${getLevelColor(log.level)} bg-opacity-10`}
            >
              <div className="flex items-start space-x-3">
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                <span className="text-xs">
                  {getSourceIcon(log.source)}
                </span>
                <Badge variant="outline" className="text-xs">
                  {log.level.toUpperCase()}
                </Badge>
                <span className="flex-1">{log.message}</span>
              </div>
              {log.details && (
                <div className="mt-1 ml-16 text-xs text-gray-400">
                  {JSON.stringify(log.details)}
                </div>
              )}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>

      {/* Status Bar */}
      <div className="border-t px-3 py-2 text-xs text-muted-foreground bg-muted/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span>Showing {filteredLogs.length} of {logs.length} logs</span>
            <span className={autoScroll ? 'text-green-600' : 'text-gray-600'}>
              Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            <span className="text-green-600">Live</span>
          </div>
        </div>
      </div>
    </div>
  );
}