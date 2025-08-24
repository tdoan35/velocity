import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Play, Plus, Clock, CheckCircle, XCircle, ArrowRight, RotateCcw, FileText } from 'lucide-react';
import { toast } from 'sonner';
import type { Migration, MigrationResult } from '../../types/editor';

interface MigrationManagerProps {
  projectId: string;
  className?: string;
  onMigrationRun?: (migration: Migration) => void;
}

export function MigrationManager({ projectId, className, onMigrationRun }: MigrationManagerProps) {
  const [migrations, setMigrations] = useState<Migration[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [runningMigrationId, setRunningMigrationId] = useState<string | null>(null);
  const [showNewMigration, setShowNewMigration] = useState(false);
  const [newMigrationName, setNewMigrationName] = useState('');
  const [selectedMigration, setSelectedMigration] = useState<string | null>(null);

  // Mock initial data
  useEffect(() => {
    const mockMigrations: Migration[] = [
      {
        id: '001',
        name: 'initial_schema',
        version: '20240115000001',
        statements: [
          'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";',
          `CREATE TABLE users (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );`,
          'ALTER TABLE users ENABLE ROW LEVEL SECURITY;',
        ],
        applied_at: '2024-01-15T10:30:00Z',
        status: 'applied',
      },
      {
        id: '002',
        name: 'user_profiles',
        version: '20240116000001',
        statements: [
          `CREATE TABLE profiles (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            full_name TEXT,
            avatar_url TEXT,
            bio TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );`,
          'ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;',
          `CREATE POLICY "Users can view own profile" ON profiles 
           FOR SELECT USING (auth.uid() = user_id);`,
          `CREATE POLICY "Users can update own profile" ON profiles 
           FOR UPDATE USING (auth.uid() = user_id);`,
        ],
        applied_at: '2024-01-16T14:20:00Z',
        status: 'applied',
      },
      {
        id: '003',
        name: 'posts_table',
        version: '20240117000001',
        statements: [
          `CREATE TABLE posts (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id UUID REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            content TEXT,
            published BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );`,
          'ALTER TABLE posts ENABLE ROW LEVEL SECURITY;',
          `CREATE POLICY "Users can view published posts" ON posts 
           FOR SELECT USING (published = true);`,
          `CREATE POLICY "Users can manage own posts" ON posts 
           FOR ALL USING (auth.uid() = user_id);`,
        ],
        status: 'pending',
      },
    ];

    setMigrations(mockMigrations);
    setSelectedMigration(mockMigrations[0].id);
  }, []);

  const getSelectedMigration = (): Migration | null => {
    return migrations.find(m => m.id === selectedMigration) || null;
  };

  const createMigration = () => {
    if (!newMigrationName.trim()) {
      toast.error('Please enter a migration name');
      return;
    }

    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '');
    const filename = newMigrationName.toLowerCase().replace(/[^a-z0-9]/g, '_');

    const newMigration: Migration = {
      id: (Date.now()).toString(),
      name: filename,
      version: timestamp,
      statements: [
        '-- Add your migration SQL here',
        '-- Example:',
        '-- ALTER TABLE users ADD COLUMN new_field TEXT;',
      ],
      status: 'pending',
    };

    setMigrations(prev => [...prev, newMigration]);
    setSelectedMigration(newMigration.id);
    setNewMigrationName('');
    setShowNewMigration(false);
    toast.success(`Migration "${filename}" created`);
  };

  const runMigration = async (migrationId: string) => {
    const migration = migrations.find(m => m.id === migrationId);
    if (!migration || migration.status === 'applied') return;

    setIsRunning(true);
    setRunningMigrationId(migrationId);

    try {
      // Mock migration execution
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Simulate potential failure (10% chance)
      if (Math.random() < 0.1) {
        throw new Error('Migration failed: Syntax error in SQL statement');
      }

      const result: MigrationResult = {
        success: true,
        appliedAt: new Date().toISOString(),
      };

      setMigrations(prev => prev.map(m => 
        m.id === migrationId
          ? { ...m, status: 'applied', applied_at: result.appliedAt }
          : m
      ));

      onMigrationRun?.(migration);
      toast.success(`Migration "${migration.name}" applied successfully`);
    } catch (error: any) {
      setMigrations(prev => prev.map(m => 
        m.id === migrationId
          ? { ...m, status: 'failed' }
          : m
      ));
      
      toast.error('Migration failed: ' + error.message);
    } finally {
      setIsRunning(false);
      setRunningMigrationId(null);
    }
  };

  const runAllPending = async () => {
    const pendingMigrations = migrations.filter(m => m.status === 'pending');
    
    if (pendingMigrations.length === 0) {
      toast.info('No pending migrations to run');
      return;
    }

    setIsRunning(true);

    try {
      for (const migration of pendingMigrations) {
        setRunningMigrationId(migration.id);
        await runMigration(migration.id);
        await new Promise(resolve => setTimeout(resolve, 500)); // Brief pause between migrations
      }
      
      toast.success(`Applied ${pendingMigrations.length} migrations`);
    } catch (error) {
      // Error handling is done in runMigration
    } finally {
      setIsRunning(false);
      setRunningMigrationId(null);
    }
  };

  const resetMigration = (migrationId: string) => {
    const migration = migrations.find(m => m.id === migrationId);
    if (!migration) return;

    if (confirm(`Are you sure you want to reset migration "${migration.name}"? This will mark it as pending.`)) {
      setMigrations(prev => prev.map(m => 
        m.id === migrationId
          ? { ...m, status: 'pending', applied_at: undefined }
          : m
      ));
      
      toast.success(`Migration "${migration.name}" reset to pending`);
    }
  };

  const getStatusIcon = (status: Migration['status'], migrationId: string) => {
    if (runningMigrationId === migrationId) {
      return <Clock className="h-4 w-4 animate-spin text-blue-500" />;
    }
    
    switch (status) {
      case 'applied':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: Migration['status']) => {
    switch (status) {
      case 'applied':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'pending':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const pendingCount = migrations.filter(m => m.status === 'pending').length;

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h3 className="font-medium">Migration Manager</h3>
            {pendingCount > 0 && (
              <Badge variant="outline" className="bg-orange-100 text-orange-800">
                {pendingCount} pending
              </Badge>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={runAllPending}
              disabled={isRunning || pendingCount === 0}
            >
              <Play className="h-4 w-4 mr-2" />
              Run All Pending
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowNewMigration(true)}>
              <Plus className="h-4 w-4 mr-2" />
              New Migration
            </Button>
          </div>
        </div>
      </div>

      {showNewMigration && (
        <div className="p-4 border-b bg-muted/50">
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Migration name (e.g., add_user_roles)"
              value={newMigrationName}
              onChange={(e) => setNewMigrationName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={createMigration} size="sm">
              Create
            </Button>
            <Button variant="outline" onClick={() => setShowNewMigration(false)} size="sm">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex">
        {/* Migrations List */}
        <div className="w-1/2 border-r">
          <div className="p-4">
            <h4 className="font-medium mb-3">Migrations</h4>
            
            <div className="space-y-2">
              {migrations.map((migration) => (
                <Card
                  key={migration.id}
                  className={`cursor-pointer transition-colors ${
                    selectedMigration === migration.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedMigration(migration.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(migration.status, migration.id)}
                        <div>
                          <div className="font-medium text-sm">{migration.name}</div>
                          <div className="text-xs text-muted-foreground">
                            Version: {migration.version}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className={`text-xs ${getStatusColor(migration.status)}`}>
                          {migration.status}
                        </Badge>
                        
                        {migration.status === 'pending' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              runMigration(migration.id);
                            }}
                            disabled={isRunning}
                            className="h-6 w-6 p-0"
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                        )}
                        
                        {migration.status === 'applied' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              resetMigration(migration.id);
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <RotateCcw className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {migration.applied_at && (
                      <div className="text-xs text-muted-foreground mt-1">
                        Applied: {new Date(migration.applied_at).toLocaleString()}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>

        {/* Migration Details */}
        <div className="flex-1 p-4">
          {selectedMigration ? (
            <Tabs defaultValue="statements" className="h-full">
              <TabsList>
                <TabsTrigger value="statements">SQL Statements</TabsTrigger>
                <TabsTrigger value="info">Migration Info</TabsTrigger>
              </TabsList>

              <TabsContent value="statements" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {getSelectedMigration()?.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {getSelectedMigration()?.statements.map((statement, index) => (
                        <div key={index} className="border-l-4 border-blue-200 pl-4">
                          <div className="text-sm font-medium mb-1">Statement {index + 1}</div>
                          <pre className="text-sm bg-muted p-3 rounded overflow-auto">
                            {statement}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="info" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Migration Information</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium">Name</label>
                          <p className="text-sm text-muted-foreground">
                            {getSelectedMigration()?.name}
                          </p>
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium">Version</label>
                          <p className="text-sm text-muted-foreground">
                            {getSelectedMigration()?.version}
                          </p>
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium">Status</label>
                          <Badge variant="outline" className={`text-xs ${getStatusColor(getSelectedMigration()?.status || 'pending')}`}>
                            {getSelectedMigration()?.status}
                          </Badge>
                        </div>
                        
                        <div>
                          <label className="text-sm font-medium">Statements</label>
                          <p className="text-sm text-muted-foreground">
                            {getSelectedMigration()?.statements.length} statements
                          </p>
                        </div>
                      </div>
                      
                      {getSelectedMigration()?.applied_at && (
                        <div>
                          <label className="text-sm font-medium">Applied At</label>
                          <p className="text-sm text-muted-foreground">
                            {new Date(getSelectedMigration()!.applied_at!).toLocaleString()}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">No Migration Selected</p>
                <p className="text-sm">Select a migration from the list to view details</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}