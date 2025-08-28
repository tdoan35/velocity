export interface FileContent {
  path: string;
  content: string;
  type: string;
  lastModified: Date;
}

export interface FileTree {
  [path: string]: FileContent;
}

export interface ProjectData {
  id: string;
  name: string;
  description?: string;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  prd_sections: PRDSection[];
}

export interface PRDSection {
  id: string;
  title: string;
  content: string;
  order_index: number;
}

export interface SupabaseProject {
  id: string;
  project_id: string;
  supabase_project_id: string;
  supabase_url: string;
  supabase_anon_key: string;
  supabase_service_role_key?: string;
  created_at: string;
  updated_at: string;
}

export type BuildStatus = 'idle' | 'generating' | 'building' | 'success' | 'error';
export type DeploymentStatus = 'ready' | 'deploying' | 'deployed' | 'failed';

export interface DatabaseSchema {
  tables: DatabaseTable[];
  views: DatabaseView[];
  functions: DatabaseFunction[];
  policies: RLSPolicy[];
}

export interface DatabaseTable {
  name: string;
  schema: string;
  columns: DatabaseColumn[];
  primaryKey?: string[];
  foreignKeys: ForeignKey[];
  indexes: DatabaseIndex[];
}

export interface DatabaseColumn {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: any;
  description?: string;
}

export interface DatabaseView {
  name: string;
  schema: string;
  definition: string;
  columns: DatabaseColumn[];
}

export interface DatabaseFunction {
  name: string;
  schema: string;
  definition: string;
  parameters: FunctionParameter[];
  returnType: string;
}

export interface FunctionParameter {
  name: string;
  type: string;
  mode: 'in' | 'out' | 'inout';
}

export interface RLSPolicy {
  name: string;
  table: string;
  schema: string;
  command: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';
  roles: string[];
  expression: string;
}

export interface ForeignKey {
  column: string;
  referencedTable: string;
  referencedColumn: string;
  onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';
  onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';
}

export interface DatabaseIndex {
  name: string;
  columns: string[];
  unique: boolean;
  partial?: string;
}

export interface EdgeFunction {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'inactive' | 'failed';
  version: number;
  code: string;
  created_at: string;
  updated_at: string;
}

export interface Migration {
  id: string;
  name: string;
  version: string;
  statements: string[];
  applied_at?: string;
  status: 'pending' | 'applied' | 'failed';
}

export interface AuthProvider {
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

export interface DeploymentResult {
  success: boolean;
  url?: string;
  errors?: string[];
  warnings?: string[];
}

export interface TestResult {
  success: boolean;
  response?: any;
  error?: string;
  duration: number;
}

export interface SyncResult {
  success: boolean;
  changes: FileChange[];
  errors?: string[];
}

export interface FileChange {
  path: string;
  type: 'added' | 'modified' | 'deleted';
  content?: string;
}

export interface PushResult {
  success: boolean;
  deployed: string[];
  errors?: string[];
}

export interface PullResult {
  success: boolean;
  updated: string[];
  errors?: string[];
}

export interface BackendFileOperations {
  // Edge Functions
  createEdgeFunction(name: string, template?: string): Promise<EdgeFunction>;
  updateEdgeFunction(id: string, code: string): Promise<void>;
  deployEdgeFunction(id: string): Promise<DeploymentResult>;
  testEdgeFunction(id: string, payload: any): Promise<TestResult>;
  
  // Database Schema
  updateSchema(schema: DatabaseSchema): Promise<void>;
  generateMigration(schemaChanges: SchemaChange[]): Promise<Migration>;
  runMigration(migrationId: string): Promise<MigrationResult>;
  
  // File Sync
  syncWithSupabase(): Promise<SyncResult>;
  pushChanges(): Promise<PushResult>;
  pullChanges(): Promise<PullResult>;
}

export interface SchemaChange {
  type: 'create_table' | 'alter_table' | 'drop_table' | 'create_function' | 'drop_function';
  table?: string;
  columns?: DatabaseColumn[];
  changes?: ColumnChange[];
}

export interface ColumnChange {
  type: 'add' | 'modify' | 'drop';
  column: DatabaseColumn;
  oldColumn?: DatabaseColumn;
}

export interface MigrationResult {
  success: boolean;
  appliedAt?: string;
  errors?: string[];
}

export interface ProjectContext {
  projectId: string;
  projectType: 'frontend-only' | 'full-stack';
  currentFiles: FileTree;
  activeFile?: string;
  databaseSchema?: DatabaseSchema;
  edgeFunctions: EdgeFunction[];
  dependencies: Record<string, string>;
}

export interface GenerationTask {
  id: string;
  type: 'component' | 'function' | 'schema' | 'migration';
  prompt: string;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  result?: any;
  error?: string;
  createdAt: Date;
}

export interface BuildLog {
  timestamp: Date;
  level: 'info' | 'warn' | 'error';
  message: string;
  details?: any;
}

export interface BuildArtifact {
  name: string;
  type: 'bundle' | 'sourcemap' | 'assets';
  path: string;
  size: number;
  hash: string;
}

export interface ErrorDiagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code?: string;
  source: 'typescript' | 'eslint' | 'build' | 'runtime';
}