import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export interface HotReloadConfig {
  projectId: string;
  supabaseProjectId?: string;
  frontendEnabled: boolean;
  backendEnabled: boolean;
  watchPatterns: string[];
}

export interface FileChange {
  path: string;
  type: 'created' | 'modified' | 'deleted';
  content?: string;
  timestamp: Date;
}

export interface HotReloadResult {
  success: boolean;
  changes: string[];
  errors?: string[];
  duration: number;
}

class FullStackHotReloadService {
  private config: HotReloadConfig | null = null;
  private watcherActive = false;
  private changeCallbacks: Array<(changes: FileChange[]) => void> = [];
  private pendingChanges: Map<string, FileChange> = new Map();
  private debounceTimer: NodeJS.Timeout | null = null;

  /**
   * Initialize hot reload for a project
   */
  async initialize(config: HotReloadConfig): Promise<void> {
    this.config = config;
    
    if (config.frontendEnabled) {
      this.startFrontendWatcher();
    }
    
    if (config.backendEnabled && config.supabaseProjectId) {
      this.startBackendWatcher();
    }
    
    // Start monitoring for file changes
    this.startFileMonitoring();
    
    console.log('Hot reload initialized:', config);
  }

  /**
   * Add a callback for when files change
   */
  onFileChange(callback: (changes: FileChange[]) => void): () => void {
    this.changeCallbacks.push(callback);
    
    return () => {
      const index = this.changeCallbacks.indexOf(callback);
      if (index > -1) {
        this.changeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Trigger hot reload for frontend changes
   */
  async reloadFrontend(changes: FileChange[]): Promise<HotReloadResult> {
    const startTime = Date.now();
    
    try {
      const changedFiles = changes.filter(c => 
        c.path.startsWith('frontend/') && 
        (c.path.endsWith('.tsx') || c.path.endsWith('.ts') || c.path.endsWith('.js') || c.path.endsWith('.jsx'))
      );
      
      if (changedFiles.length === 0) {
        return {
          success: true,
          changes: [],
          duration: Date.now() - startTime,
        };
      }

      // Simulate frontend hot reload
      await this.updateSnackSession(changedFiles);
      
      const result: HotReloadResult = {
        success: true,
        changes: changedFiles.map(c => c.path),
        duration: Date.now() - startTime,
      };
      
      console.log('Frontend hot reload completed:', result);
      return result;
    } catch (error: any) {
      return {
        success: false,
        changes: [],
        errors: [error.message],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Trigger hot reload for backend changes
   */
  async reloadBackend(changes: FileChange[]): Promise<HotReloadResult> {
    const startTime = Date.now();
    
    try {
      const backendChanges = changes.filter(c => c.path.startsWith('backend/'));
      
      if (backendChanges.length === 0) {
        return {
          success: true,
          changes: [],
          duration: Date.now() - startTime,
        };
      }

      const results: string[] = [];
      const errors: string[] = [];

      for (const change of backendChanges) {
        try {
          if (change.path.includes('/functions/')) {
            await this.deployEdgeFunction(change);
            results.push(`Deployed function: ${change.path}`);
          } else if (change.path.includes('/migrations/')) {
            await this.runMigration(change);
            results.push(`Applied migration: ${change.path}`);
          }
        } catch (error: any) {
          errors.push(`Failed to process ${change.path}: ${error.message}`);
        }
      }

      const result: HotReloadResult = {
        success: errors.length === 0,
        changes: results,
        errors: errors.length > 0 ? errors : undefined,
        duration: Date.now() - startTime,
      };
      
      console.log('Backend hot reload completed:', result);
      return result;
    } catch (error: any) {
      return {
        success: false,
        changes: [],
        errors: [error.message],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Trigger full-stack hot reload
   */
  async fullStackReload(changes: FileChange[]): Promise<HotReloadResult> {
    const startTime = Date.now();
    
    try {
      const frontendResult = await this.reloadFrontend(changes);
      const backendResult = await this.reloadBackend(changes);
      
      return {
        success: frontendResult.success && backendResult.success,
        changes: [...frontendResult.changes, ...backendResult.changes],
        errors: [
          ...(frontendResult.errors || []),
          ...(backendResult.errors || [])
        ].length > 0 ? [
          ...(frontendResult.errors || []),
          ...(backendResult.errors || [])
        ] : undefined,
        duration: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        success: false,
        changes: [],
        errors: [error.message],
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Handle file changes with debouncing
   */
  handleFileChange(change: FileChange): void {
    this.pendingChanges.set(change.path, change);
    
    // Debounce changes to avoid excessive reloads
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    
    this.debounceTimer = setTimeout(() => {
      this.processAllChanges();
    }, 500);
  }

  /**
   * Process all pending changes
   */
  private async processAllChanges(): Promise<void> {
    const changes = Array.from(this.pendingChanges.values());
    this.pendingChanges.clear();
    
    if (changes.length === 0) return;
    
    try {
      const result = await this.fullStackReload(changes);
      
      // Notify callbacks
      this.changeCallbacks.forEach(callback => {
        try {
          callback(changes);
        } catch (error) {
          console.error('Hot reload callback error:', error);
        }
      });
      
      if (result.success) {
        if (result.changes.length > 0) {
          toast.success(`Hot reload: ${result.changes.length} changes applied (${result.duration}ms)`);
        }
      } else {
        toast.error(`Hot reload failed: ${result.errors?.join(', ')}`);
      }
    } catch (error: any) {
      toast.error('Hot reload error: ' + error.message);
    }
  }

  /**
   * Start frontend file watcher
   */
  private startFrontendWatcher(): void {
    // In a real implementation, this would use a file system watcher
    console.log('Frontend watcher started');
  }

  /**
   * Start backend file watcher
   */
  private startBackendWatcher(): void {
    // In a real implementation, this would watch Supabase files
    console.log('Backend watcher started');
  }

  /**
   * Start file monitoring (mock implementation)
   */
  private startFileMonitoring(): void {
    if (this.watcherActive) return;
    
    this.watcherActive = true;
    
    // Simulate periodic file change detection
    const checkInterval = setInterval(() => {
      if (!this.watcherActive) {
        clearInterval(checkInterval);
        return;
      }
      
      // This is a mock - in reality, you'd use fs.watch or similar
      // For demo purposes, we won't actually generate changes
    }, 1000);
  }

  /**
   * Update Snack session with frontend changes
   */
  private async updateSnackSession(changes: FileChange[]): Promise<void> {
    // Mock implementation - in reality, this would update the Snack session
    console.log('Updating Snack session with changes:', changes.map(c => c.path));
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  /**
   * Deploy Edge Function
   */
  private async deployEdgeFunction(change: FileChange): Promise<void> {
    if (!this.config?.supabaseProjectId || !change.content) return;
    
    // Extract function name from path
    const functionName = change.path.split('/').pop()?.replace('.ts', '') || 'unknown';
    
    console.log(`Deploying Edge Function: ${functionName}`);
    
    // Mock deployment
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In reality, this would call Supabase CLI or API
    // await supabaseCli.functions.deploy(functionName, change.content);
  }

  /**
   * Run database migration
   */
  private async runMigration(change: FileChange): Promise<void> {
    if (!this.config?.supabaseProjectId || !change.content) return;
    
    console.log(`Running migration: ${change.path}`);
    
    // Mock migration run
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // In reality, this would execute the SQL migration
    // await supabaseCli.db.push();
  }

  /**
   * Stop hot reload service
   */
  stop(): void {
    this.watcherActive = false;
    this.changeCallbacks = [];
    this.pendingChanges.clear();
    
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    
    console.log('Hot reload service stopped');
  }

  /**
   * Get current status
   */
  getStatus(): {
    active: boolean;
    frontendEnabled: boolean;
    backendEnabled: boolean;
    pendingChanges: number;
  } {
    return {
      active: this.watcherActive,
      frontendEnabled: this.config?.frontendEnabled || false,
      backendEnabled: this.config?.backendEnabled || false,
      pendingChanges: this.pendingChanges.size,
    };
  }
}

export const hotReloadService = new FullStackHotReloadService();