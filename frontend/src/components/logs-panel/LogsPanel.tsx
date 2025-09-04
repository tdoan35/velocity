import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface LogsPanelProps {
  projectId?: string;
}

export function LogsPanel({ projectId }: LogsPanelProps) {
  // Mock log data for now
  const logs = [
    { timestamp: new Date().toLocaleTimeString(), level: 'info', message: 'Project initialized successfully' },
    { timestamp: new Date().toLocaleTimeString(), level: 'warn', message: 'No package.json found, creating default' },
    { timestamp: new Date().toLocaleTimeString(), level: 'info', message: 'Dependencies installed' },
    { timestamp: new Date().toLocaleTimeString(), level: 'error', message: 'Build failed: syntax error in App.tsx:42' },
  ];

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600 dark:text-red-400';
      case 'warn':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'info':
        return 'text-blue-600 dark:text-blue-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  return (
    <div className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Application Logs</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <ScrollArea className="h-full">
          <div className="space-y-2">
            {logs.map((log, index) => (
              <div key={index} className="flex items-start gap-3 text-sm font-mono">
                <span className="text-gray-500 text-xs">{log.timestamp}</span>
                <span className={`uppercase text-xs font-bold ${getLevelColor(log.level)}`}>
                  {log.level}
                </span>
                <span className="flex-1">{log.message}</span>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </div>
  );
}