import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface TerminalPanelProps {
  projectId?: string;
}

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error';
  content: string;
  timestamp: Date;
}

export function TerminalPanel({ projectId }: TerminalPanelProps) {
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: 1,
      type: 'output',
      content: 'Welcome to Velocity Terminal',
      timestamp: new Date()
    },
    {
      id: 2,
      type: 'output',
      content: `Project: ${projectId || 'No project loaded'}`,
      timestamp: new Date()
    }
  ]);
  const [currentCommand, setCurrentCommand] = useState('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Auto-scroll to bottom when new lines are added
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const executeCommand = async (command: string) => {
    const commandLine: TerminalLine = {
      id: Date.now(),
      type: 'input',
      content: `$ ${command}`,
      timestamp: new Date()
    };

    // Add command to history
    setCommandHistory(prev => [...prev, command]);
    setHistoryIndex(-1);
    
    // Add command line
    setLines(prev => [...prev, commandLine]);

    // Simulate command execution
    let output: TerminalLine;
    
    switch (command.toLowerCase().trim()) {
      case 'help':
        output = {
          id: Date.now() + 1,
          type: 'output',
          content: 'Available commands: help, clear, ls, pwd, npm, git',
          timestamp: new Date()
        };
        break;
      case 'clear':
        setLines([]);
        return;
      case 'ls':
        output = {
          id: Date.now() + 1,
          type: 'output',
          content: 'src/  package.json  README.md  node_modules/',
          timestamp: new Date()
        };
        break;
      case 'pwd':
        output = {
          id: Date.now() + 1,
          type: 'output',
          content: '/workspace/project',
          timestamp: new Date()
        };
        break;
      default:
        if (command.startsWith('npm ') || command.startsWith('git ')) {
          output = {
            id: Date.now() + 1,
            type: 'output',
            content: `Executing: ${command}...`,
            timestamp: new Date()
          };
        } else {
          output = {
            id: Date.now() + 1,
            type: 'error',
            content: `Command not found: ${command}`,
            timestamp: new Date()
          };
        }
    }

    // Add output with slight delay
    setTimeout(() => {
      setLines(prev => [...prev, output]);
    }, 100);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (currentCommand.trim()) {
      executeCommand(currentCommand);
      setCurrentCommand('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp' && commandHistory.length > 0) {
      e.preventDefault();
      const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(newIndex);
      setCurrentCommand(commandHistory[newIndex] || '');
    } else if (e.key === 'ArrowDown' && commandHistory.length > 0) {
      e.preventDefault();
      const newIndex = historyIndex === -1 ? -1 : Math.min(commandHistory.length - 1, historyIndex + 1);
      setHistoryIndex(newIndex);
      setCurrentCommand(newIndex === -1 ? '' : commandHistory[newIndex] || '');
    }
  };

  const getLineColor = (type: string) => {
    switch (type) {
      case 'input':
        return 'text-blue-400';
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-300';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-green-400 font-mono">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm text-gray-300">Terminal</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 pt-0 flex flex-col">
        {/* Terminal Output */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full" ref={scrollRef}>
            <div className="space-y-1 p-2">
              {lines.map((line) => (
                <div key={line.id} className={`text-sm ${getLineColor(line.type)}`}>
                  {line.content}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
        
        {/* Command Input */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2 border-t border-gray-700">
          <span className="text-blue-400 text-sm">$</span>
          <Input
            ref={inputRef}
            value={currentCommand}
            onChange={(e) => setCurrentCommand(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 bg-transparent border-none text-green-400 font-mono text-sm focus:ring-0 focus:outline-none"
            placeholder="Enter command..."
            autoComplete="off"
          />
        </form>
      </CardContent>
    </div>
  );
}