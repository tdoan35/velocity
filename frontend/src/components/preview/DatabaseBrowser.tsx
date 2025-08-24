import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { Database, Play, RefreshCw, Search, Plus, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface DatabaseBrowserProps {
  projectId: string;
  supabaseConnected: boolean;
  className?: string;
}

interface DatabaseTable {
  name: string;
  rowCount: number;
  columns: DatabaseColumn[];
}

interface DatabaseColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: any;
}

interface QueryResult {
  columns: string[];
  rows: any[];
  executionTime: number;
  rowCount: number;
}

export function DatabaseBrowser({ projectId, supabaseConnected, className }: DatabaseBrowserProps) {
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'tables' | 'query' | 'schema'>('tables');

  useEffect(() => {
    if (supabaseConnected) {
      loadTables();
    }
  }, [supabaseConnected]);

  const loadTables = async () => {
    try {
      // Mock data for now - in real implementation, this would call Supabase
      const mockTables: DatabaseTable[] = [
        {
          name: 'users',
          rowCount: 42,
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'email', type: 'text', nullable: false },
            { name: 'created_at', type: 'timestamptz', nullable: false },
          ],
        },
        {
          name: 'profiles',
          rowCount: 38,
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'user_id', type: 'uuid', nullable: false },
            { name: 'full_name', type: 'text', nullable: true },
            { name: 'avatar_url', type: 'text', nullable: true },
          ],
        },
        {
          name: 'posts',
          rowCount: 156,
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'user_id', type: 'uuid', nullable: false },
            { name: 'title', type: 'text', nullable: false },
            { name: 'content', type: 'text', nullable: true },
            { name: 'created_at', type: 'timestamptz', nullable: false },
          ],
        },
      ];

      setTables(mockTables);
    } catch (error: any) {
      toast.error('Failed to load tables: ' + error.message);
    }
  };

  const executeQuery = async () => {
    if (!query.trim()) {
      toast.error('Please enter a query');
      return;
    }

    setIsLoading(true);
    const startTime = Date.now();

    try {
      // Mock query execution - in real implementation, this would call Supabase
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const mockResult: QueryResult = {
        columns: ['id', 'email', 'created_at'],
        rows: [
          { id: '1', email: 'user1@example.com', created_at: '2024-01-15T10:30:00Z' },
          { id: '2', email: 'user2@example.com', created_at: '2024-01-16T14:20:00Z' },
          { id: '3', email: 'user3@example.com', created_at: '2024-01-17T09:15:00Z' },
        ],
        executionTime: Date.now() - startTime,
        rowCount: 3,
      };

      setQueryResult(mockResult);
      toast.success(`Query executed in ${mockResult.executionTime}ms`);
    } catch (error: any) {
      toast.error('Query failed: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTableData = async (tableName: string) => {
    setQuery(`SELECT * FROM ${tableName} LIMIT 100;`);
    setSelectedTable(tableName);
    setActiveTab('query');
  };

  const getTypeColor = (type: string) => {
    if (type.includes('uuid')) return 'bg-purple-100 text-purple-800';
    if (type.includes('text') || type.includes('varchar')) return 'bg-blue-100 text-blue-800';
    if (type.includes('int') || type.includes('numeric')) return 'bg-green-100 text-green-800';
    if (type.includes('timestamp') || type.includes('date')) return 'bg-orange-100 text-orange-800';
    if (type.includes('bool')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  if (!supabaseConnected) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="text-center text-muted-foreground">
          <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg mb-2">Database Not Connected</p>
          <p className="text-sm">Connect to Supabase to browse your database</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${className}`}>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="flex-1 flex flex-col">
        <div className="p-3 border-b">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="tables">Tables</TabsTrigger>
            <TabsTrigger value="query">Query</TabsTrigger>
            <TabsTrigger value="schema">Schema</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="tables" className="m-0 p-3 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">Database Tables</h3>
              <Button variant="outline" size="sm" onClick={loadTables}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            <div className="grid gap-4">
              {tables.map((table) => (
                <Card key={table.name} className="cursor-pointer hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{table.name}</CardTitle>
                      <Badge variant="secondary">{table.rowCount} rows</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {table.columns.slice(0, 6).map((column) => (
                          <Badge
                            key={column.name}
                            variant="outline"
                            className={getTypeColor(column.type)}
                          >
                            {column.name}: {column.type}
                          </Badge>
                        ))}
                        {table.columns.length > 6 && (
                          <Badge variant="outline">
                            +{table.columns.length - 6} more
                          </Badge>
                        )}
                      </div>
                      
                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => loadTableData(table.name)}
                        >
                          <Search className="h-4 w-4 mr-2" />
                          Browse Data
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Schema
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="query" className="m-0 p-3 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">SQL Query Editor</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  placeholder="Enter your SQL query here..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  rows={8}
                  className="font-mono"
                />
                
                <div className="flex gap-2">
                  <Button
                    onClick={executeQuery}
                    disabled={isLoading || !query.trim()}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Execute Query
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setQuery('')}
                  >
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Query Results */}
            {queryResult && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Query Results</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">
                        {queryResult.rowCount} rows
                      </Badge>
                      <Badge variant="outline">
                        {queryResult.executionTime}ms
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-auto max-h-96">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {queryResult.columns.map((column) => (
                            <TableHead key={column}>{column}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {queryResult.rows.map((row, index) => (
                          <TableRow key={index}>
                            {queryResult.columns.map((column) => (
                              <TableCell key={column} className="font-mono text-sm">
                                {row[column]?.toString() || 'NULL'}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="schema" className="m-0 p-3">
            <Card>
              <CardHeader>
                <CardTitle>Database Schema</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center text-muted-foreground py-8">
                  <p className="text-lg mb-2">Schema Visualization</p>
                  <p className="text-sm">Visual schema editor and relationship viewer</p>
                  <p className="text-sm mt-2">Coming soon...</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}