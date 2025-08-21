/**
 * UndoRedoManager - Manages undo/redo history for virtual block operations
 */

export interface HistoryEntry {
  html: string;
  timestamp: number;
  description?: string;
  affectedBlockIds?: string[];
}

export class UndoRedoManager {
  private history: HistoryEntry[] = [];
  private currentIndex: number = -1;
  private maxHistorySize: number;
  private isEnabled: boolean = true;

  constructor(maxHistorySize: number = 50) {
    this.maxHistorySize = maxHistorySize;
  }

  /**
   * Add a new state to the history
   */
  public addState(html: string, description?: string, affectedBlockIds?: string[]): void {
    if (!this.isEnabled) return;

    // Remove any redo states if we're adding from middle of history
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }

    // Add new state
    const entry: HistoryEntry = {
      html,
      timestamp: Date.now(),
      description,
      affectedBlockIds
    };

    this.history.push(entry);
    this.currentIndex++;

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.currentIndex--;
    }
  }

  /**
   * Undo the last operation
   */
  public undo(): HistoryEntry | null {
    if (!this.canUndo()) return null;

    this.currentIndex--;
    return this.history[this.currentIndex];
  }

  /**
   * Redo the next operation
   */
  public redo(): HistoryEntry | null {
    if (!this.canRedo()) return null;

    this.currentIndex++;
    return this.history[this.currentIndex];
  }

  /**
   * Check if undo is available
   */
  public canUndo(): boolean {
    return this.currentIndex > 0;
  }

  /**
   * Check if redo is available
   */
  public canRedo(): boolean {
    return this.currentIndex < this.history.length - 1;
  }

  /**
   * Get current state
   */
  public getCurrentState(): HistoryEntry | null {
    if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
      return this.history[this.currentIndex];
    }
    return null;
  }

  /**
   * Clear all history
   */
  public clear(): void {
    this.history = [];
    this.currentIndex = -1;
  }

  /**
   * Get history size
   */
  public getHistorySize(): number {
    return this.history.length;
  }

  /**
   * Get current position in history
   */
  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  /**
   * Enable/disable history tracking
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Check if history tracking is enabled
   */
  public getEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Get a summary of recent operations
   */
  public getRecentOperations(count: number = 5): Array<{
    description: string;
    timestamp: number;
    canRevert: boolean;
  }> {
    const start = Math.max(0, this.currentIndex - count + 1);
    const end = Math.min(this.history.length, this.currentIndex + count + 1);
    
    return this.history.slice(start, end).map((entry, index) => ({
      description: entry.description || 'Block operation',
      timestamp: entry.timestamp,
      canRevert: start + index <= this.currentIndex
    }));
  }

  /**
   * Batch multiple operations without adding intermediate states
   */
  public batch(callback: () => void): void {
    const wasEnabled = this.isEnabled;
    this.isEnabled = false;
    
    try {
      callback();
    } finally {
      this.isEnabled = wasEnabled;
    }
  }
}