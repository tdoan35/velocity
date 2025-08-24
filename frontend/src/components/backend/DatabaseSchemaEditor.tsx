import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Plus, Trash2, Edit, Save, Database, Key, Link } from 'lucide-react';
import { toast } from 'sonner';
import type { DatabaseTable, DatabaseColumn, ForeignKey } from '../../types/editor';

interface DatabaseSchemaEditorProps {
  projectId: string;
  className?: string;
  onSchemaChange?: (tables: DatabaseTable[]) => void;
}

export function DatabaseSchemaEditor({ projectId, className, onSchemaChange }: DatabaseSchemaEditorProps) {
  const [tables, setTables] = useState<DatabaseTable[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newTableName, setNewTableName] = useState('');
  const [showAddTable, setShowAddTable] = useState(false);

  // Mock initial data
  useEffect(() => {
    const mockTables: DatabaseTable[] = [
      {
        name: 'users',
        schema: 'public',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, defaultValue: 'gen_random_uuid()' },
          { name: 'email', type: 'text', nullable: false },
          { name: 'password_hash', type: 'text', nullable: false },
          { name: 'created_at', type: 'timestamptz', nullable: false, defaultValue: 'now()' },
          { name: 'updated_at', type: 'timestamptz', nullable: false, defaultValue: 'now()' },
        ],
        primaryKey: ['id'],
        foreignKeys: [],
        indexes: [
          { name: 'users_email_key', columns: ['email'], unique: true },
        ],
      },
      {
        name: 'profiles',
        schema: 'public',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, defaultValue: 'gen_random_uuid()' },
          { name: 'user_id', type: 'uuid', nullable: false },
          { name: 'full_name', type: 'text', nullable: true },
          { name: 'avatar_url', type: 'text', nullable: true },
          { name: 'bio', type: 'text', nullable: true },
        ],
        primaryKey: ['id'],
        foreignKeys: [
          { column: 'user_id', referencedTable: 'users', referencedColumn: 'id', onDelete: 'CASCADE' },
        ],
        indexes: [
          { name: 'profiles_user_id_key', columns: ['user_id'], unique: true },
        ],
      },
    ];

    setTables(mockTables);
    if (mockTables.length > 0) {
      setSelectedTable(mockTables[0].name);
    }
  }, []);

  const getSelectedTable = (): DatabaseTable | null => {
    return tables.find(t => t.name === selectedTable) || null;
  };

  const addTable = () => {
    if (!newTableName.trim()) {
      toast.error('Please enter a table name');
      return;
    }

    const newTable: DatabaseTable = {
      name: newTableName.toLowerCase().replace(/\s+/g, '_'),
      schema: 'public',
      columns: [
        { name: 'id', type: 'uuid', nullable: false, defaultValue: 'gen_random_uuid()' },
        { name: 'created_at', type: 'timestamptz', nullable: false, defaultValue: 'now()' },
        { name: 'updated_at', type: 'timestamptz', nullable: false, defaultValue: 'now()' },
      ],
      primaryKey: ['id'],
      foreignKeys: [],
      indexes: [],
    };

    setTables(prev => [...prev, newTable]);
    setSelectedTable(newTable.name);
    setNewTableName('');
    setShowAddTable(false);
    onSchemaChange?.([...tables, newTable]);
    toast.success(`Table "${newTable.name}" created`);
  };

  const deleteTable = (tableName: string) => {
    if (confirm(`Are you sure you want to delete table "${tableName}"?`)) {
      const newTables = tables.filter(t => t.name !== tableName);
      setTables(newTables);
      if (selectedTable === tableName) {
        setSelectedTable(newTables.length > 0 ? newTables[0].name : null);
      }
      onSchemaChange?.(newTables);
      toast.success(`Table "${tableName}" deleted`);
    }
  };

  const addColumn = () => {
    if (!selectedTable) return;

    const newColumn: DatabaseColumn = {
      name: 'new_column',
      type: 'text',
      nullable: true,
    };

    setTables(prev => prev.map(table => 
      table.name === selectedTable
        ? { ...table, columns: [...table.columns, newColumn] }
        : table
    ));
  };

  const updateColumn = (columnIndex: number, field: keyof DatabaseColumn, value: any) => {
    if (!selectedTable) return;

    setTables(prev => prev.map(table => 
      table.name === selectedTable
        ? {
            ...table,
            columns: table.columns.map((col, index) =>
              index === columnIndex ? { ...col, [field]: value } : col
            ),
          }
        : table
    ));
  };

  const deleteColumn = (columnIndex: number) => {
    if (!selectedTable) return;

    setTables(prev => prev.map(table => 
      table.name === selectedTable
        ? { ...table, columns: table.columns.filter((_, index) => index !== columnIndex) }
        : table
    ));
  };

  const generateMigration = async () => {
    try {
      // In a real implementation, this would call the backend to generate a migration
      const migrationSQL = generateMigrationSQL();
      
      // Create a migration file
      const fileName = `backend/migrations/${Date.now()}_update_schema.sql`;
      const content = `-- Auto-generated migration
${migrationSQL}`;

      // Here you would save the file using your project editor store
      toast.success('Migration generated successfully');
    } catch (error: any) {
      toast.error('Failed to generate migration: ' + error.message);
    }
  };

  const generateMigrationSQL = (): string => {
    const selectedTableData = getSelectedTable();
    if (!selectedTableData) return '';

    const lines: string[] = [];
    
    // Create table
    lines.push(`CREATE TABLE IF NOT EXISTS ${selectedTableData.name} (`);
    
    selectedTableData.columns.forEach((column, index) => {
      const columnDef = `  ${column.name} ${column.type}`;
      const nullable = column.nullable ? '' : ' NOT NULL';
      const defaultVal = column.defaultValue ? ` DEFAULT ${column.defaultValue}` : '';
      const comma = index < selectedTableData.columns.length - 1 ? ',' : '';
      
      lines.push(`${columnDef}${nullable}${defaultVal}${comma}`);
    });
    
    lines.push(');');
    
    // Primary key
    if (selectedTableData.primaryKey && selectedTableData.primaryKey.length > 0) {
      lines.push('');
      lines.push(`ALTER TABLE ${selectedTableData.name} ADD CONSTRAINT ${selectedTableData.name}_pkey PRIMARY KEY (${selectedTableData.primaryKey.join(', ')});`);
    }
    
    // Foreign keys
    selectedTableData.foreignKeys.forEach(fk => {
      lines.push('');
      lines.push(`ALTER TABLE ${selectedTableData.name} ADD CONSTRAINT ${selectedTableData.name}_${fk.column}_fkey`);
      lines.push(`  FOREIGN KEY (${fk.column}) REFERENCES ${fk.referencedTable}(${fk.referencedColumn})`);
      if (fk.onDelete) {
        lines.push(`  ON DELETE ${fk.onDelete}`);
      }
      lines.push(';');
    });
    
    // Indexes
    selectedTableData.indexes.forEach(index => {
      lines.push('');
      const unique = index.unique ? 'UNIQUE ' : '';
      lines.push(`CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${selectedTableData.name} (${index.columns.join(', ')});`);
    });
    
    // RLS
    lines.push('');
    lines.push(`ALTER TABLE ${selectedTableData.name} ENABLE ROW LEVEL SECURITY;`);
    
    return lines.join('\n');
  };

  const getTypeColor = (type: string) => {
    if (type.includes('uuid')) return 'bg-purple-100 text-purple-800';
    if (type.includes('text') || type.includes('varchar')) return 'bg-blue-100 text-blue-800';
    if (type.includes('int') || type.includes('numeric')) return 'bg-green-100 text-green-800';
    if (type.includes('timestamp') || type.includes('date')) return 'bg-orange-100 text-orange-800';
    if (type.includes('bool')) return 'bg-red-100 text-red-800';
    return 'bg-gray-100 text-gray-800';
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Database Schema Editor</h3>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm" onClick={generateMigration}>
              <Save className="h-4 w-4 mr-2" />
              Generate Migration
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddTable(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Table
            </Button>
          </div>
        </div>
      </div>

      {showAddTable && (
        <div className="p-4 border-b bg-muted/50">
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Table name"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={addTable} size="sm">
              Create
            </Button>
            <Button variant="outline" onClick={() => setShowAddTable(false)} size="sm">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex">
        {/* Tables Sidebar */}
        <div className="w-1/3 border-r p-4">
          <h4 className="font-medium mb-3">Tables</h4>
          <div className="space-y-2">
            {tables.map((table) => (
              <Card
                key={table.name}
                className={`cursor-pointer transition-colors ${
                  selectedTable === table.name ? 'bg-accent' : ''
                }`}
                onClick={() => setSelectedTable(table.name)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Database className="h-4 w-4" />
                      <span className="font-medium">{table.name}</span>
                    </div>
                    <div className="flex items-center space-x-1">
                      <Badge variant="outline" className="text-xs">
                        {table.columns.length} cols
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTable(table.name);
                        }}
                        className="h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Table Editor */}
        <div className="flex-1 p-4">
          {selectedTable ? (
            <Tabs defaultValue="columns" className="h-full">
              <TabsList>
                <TabsTrigger value="columns">Columns</TabsTrigger>
                <TabsTrigger value="indexes">Indexes</TabsTrigger>
                <TabsTrigger value="constraints">Constraints</TabsTrigger>
                <TabsTrigger value="sql">SQL Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="columns" className="mt-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Columns for {selectedTable}</h4>
                    <Button onClick={addColumn} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Column
                    </Button>
                  </div>

                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Nullable</TableHead>
                          <TableHead>Default</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getSelectedTable()?.columns.map((column, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Input
                                value={column.name}
                                onChange={(e) => updateColumn(index, 'name', e.target.value)}
                                className="w-full"
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={column.type}
                                onValueChange={(value) => updateColumn(index, 'type', value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="uuid">UUID</SelectItem>
                                  <SelectItem value="text">Text</SelectItem>
                                  <SelectItem value="varchar(255)">VARCHAR(255)</SelectItem>
                                  <SelectItem value="integer">Integer</SelectItem>
                                  <SelectItem value="bigint">BigInt</SelectItem>
                                  <SelectItem value="boolean">Boolean</SelectItem>
                                  <SelectItem value="timestamptz">Timestamp</SelectItem>
                                  <SelectItem value="date">Date</SelectItem>
                                  <SelectItem value="jsonb">JSONB</SelectItem>
                                  <SelectItem value="numeric">Numeric</SelectItem>
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={column.nullable}
                                onChange={(e) => updateColumn(index, 'nullable', e.target.checked)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                value={column.defaultValue || ''}
                                onChange={(e) => updateColumn(index, 'defaultValue', e.target.value)}
                                placeholder="Default value"
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteColumn(index)}
                                className="text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="indexes" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Indexes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Index management coming soon...</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="constraints" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Foreign Keys & Constraints</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Constraint management coming soon...</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="sql" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle>SQL Preview</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <pre className="text-sm bg-muted p-4 rounded overflow-auto max-h-96">
                      {generateMigrationSQL()}
                    </pre>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">No Table Selected</p>
                <p className="text-sm">Select a table from the sidebar to edit its schema</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}