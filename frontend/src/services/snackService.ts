import { Snack, SnackOptions, SnackListenerSubscription, SnackSessionOptions } from 'snack-sdk';
import { supabase } from '../lib/supabase';

// Types
export interface SnackServiceConfig {
  snackApiUrl?: string;
  snackagerUrl?: string;
  webPlayerUrl?: string;
  verbose?: boolean;
  channel?: string;
  sessionSecret?: string;
}

export interface SnackSession {
  id: string;
  snack: Snack;
  subscriptions: SnackListenerSubscription[];
  lastActivity: Date;
  projectId?: string;
  userId?: string;
}

export interface SnackPreviewOptions {
  name?: string;
  description?: string;
  dependencies?: Record<string, string>;
  sdkVersion?: string;
  files?: Record<string, { type: string; contents: string }>;
}

// Default configuration
const DEFAULT_CONFIG: SnackServiceConfig = {
  snackApiUrl: import.meta.env.VITE_SNACK_API_URL || 'https://exp.host',
  snackagerUrl: import.meta.env.VITE_SNACKAGER_URL || 'https://snackager.expo.io',
  webPlayerUrl: import.meta.env.VITE_WEB_PLAYER_URL || 'https://snack.expo.dev/embedded',
  verbose: import.meta.env.DEV,
  channel: import.meta.env.VITE_SNACK_CHANNEL || 'production',
};

export class SnackService {
  private config: SnackServiceConfig;
  private sessions: Map<string, SnackSession> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor(config?: Partial<SnackServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize a new Snack session
   */
  async createSession(
    sessionId: string,
    options: SnackPreviewOptions,
    userId?: string,
    projectId?: string
  ): Promise<SnackSession> {
    // Clean up existing session if any
    await this.destroySession(sessionId);

    // Create Snack options
    const snackOptions: SnackOptions = {
      name: options.name || 'Untitled',
      description: options.description || '',
      dependencies: options.dependencies || {},
      sdkVersion: (options.sdkVersion || '52.0.0') as any,
      files: options.files || {
        'App.js': {
          type: 'CODE' as const,
          contents: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to Velocity!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});`
        }
      },
      online: true,
    };

    // Session options
    const sessionOptions: SnackSessionOptions = {
      snackApiUrl: this.config.snackApiUrl,
      snackagerUrl: this.config.snackagerUrl,
      verbose: this.config.verbose,
      channel: this.config.channel as any,
    };

    // Create new Snack instance
    const snack = new (Snack as any)(snackOptions);

    // Set up event listeners
    const subscriptions: SnackListenerSubscription[] = [];

    // Listen for state changes
    subscriptions.push(
      snack.addStateListener((state, prevState) => {
        console.log('[SnackService] State changed:', state);
        
        // Store state updates in Supabase if user is authenticated
        if (userId && projectId) {
          this.storeStateUpdate(sessionId, userId, projectId, state);
        }
      })
    );

    // Listen for log messages
    subscriptions.push(
      snack.addLogListener((log) => {
        console.log('[SnackService] Log:', log);
      })
    );

    // Listen for errors
    subscriptions.push(
      (snack as any).addErrorListener?.((errors: any) => {
        console.error('[SnackService] Errors:', errors);
      })
    );

    // Create session object
    const session: SnackSession = {
      id: sessionId,
      snack,
      subscriptions,
      lastActivity: new Date(),
      projectId,
      userId,
    };

    // Store session
    this.sessions.set(sessionId, session);

    // Set up timeout
    this.resetSessionTimeout(sessionId);

    return session;
  }

  /**
   * Get an existing session
   */
  getSession(sessionId: string): SnackSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      this.resetSessionTimeout(sessionId);
    }
    return session;
  }

  /**
   * Update session code
   */
  async updateCode(sessionId: string, filePath: string, contents: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await session.snack.updateFiles({
      [filePath]: {
        type: 'CODE',
        contents,
      },
    });

    session.lastActivity = new Date();
    this.resetSessionTimeout(sessionId);
  }

  /**
   * Update multiple files at once
   */
  async updateFiles(
    sessionId: string,
    files: Record<string, { type: string; contents: string }>
  ): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await session.snack.updateFiles(files as any);

    session.lastActivity = new Date();
    this.resetSessionTimeout(sessionId);
  }

  /**
   * Update dependencies
   */
  async updateDependencies(
    sessionId: string,
    dependencies: Record<string, string>
  ): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await session.snack.updateDependencies(dependencies as any);

    session.lastActivity = new Date();
    this.resetSessionTimeout(sessionId);
  }

  /**
   * Get the web player URL for embedding
   */
  getWebPlayerUrl(sessionId: string, options?: { platform?: 'ios' | 'android' | 'web' }): string {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const baseUrl = this.config.webPlayerUrl;
    const params = new URLSearchParams();
    
    // Add session ID
    params.append('id', (session.snack as any).getChannel?.() || session.id);
    
    // Add platform if specified
    if (options?.platform) {
      params.append('platform', options.platform);
    }

    // Add theme
    params.append('theme', 'light');
    
    // Hide panels for cleaner embed
    params.append('preview', 'true');
    params.append('hideDevTools', 'true');

    return `${baseUrl}?${params.toString()}`;
  }

  /**
   * Get QR code URL for Expo Go
   */
  getQRCodeUrl(sessionId: string): string {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const channel = (session.snack as any).getChannel?.() || session.id;
    return `exp://exp.host/@snack/${channel}`;
  }

  /**
   * Save current state as a snapshot
   */
  async saveSnapshot(sessionId: string): Promise<void> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    await session.snack.saveAsync();
  }

  /**
   * Get download URL for the project
   */
  async getDownloadUrl(sessionId: string): Promise<string> {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const saveResult = await session.snack.saveAsync();
    return `${this.config.snackApiUrl}/--/api/v2/snack/download/${saveResult.id}`;
  }

  /**
   * Destroy a session
   */
  async destroySession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    // Unsubscribe from all listeners
    session.subscriptions.forEach(sub => sub());

    // Clear timeout
    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }

    // Remove session
    this.sessions.delete(sessionId);

    // Log session destruction
    if (session.userId && session.projectId) {
      await this.logSessionEnd(sessionId, session.userId, session.projectId);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): Map<string, SnackSession> {
    return new Map(this.sessions);
  }

  /**
   * Clean up inactive sessions
   */
  async cleanupInactiveSessions(): Promise<void> {
    const now = new Date();
    const sessionsToRemove: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      const inactiveTime = now.getTime() - session.lastActivity.getTime();
      if (inactiveTime > this.SESSION_TIMEOUT) {
        sessionsToRemove.push(sessionId);
      }
    }

    for (const sessionId of sessionsToRemove) {
      await this.destroySession(sessionId);
    }
  }

  /**
   * Private methods
   */

  private resetSessionTimeout(sessionId: string): void {
    // Clear existing timeout
    const existingTimeout = this.sessionTimeouts.get(sessionId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.destroySession(sessionId);
    }, this.SESSION_TIMEOUT);

    this.sessionTimeouts.set(sessionId, timeout as any);
  }

  private async storeStateUpdate(
    sessionId: string,
    userId: string,
    projectId: string,
    state: any
  ): Promise<void> {
    try {
      await supabase.from('snack_session_states').insert({
        session_id: sessionId,
        user_id: userId,
        project_id: projectId,
        state,
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[SnackService] Failed to store state update:', error);
    }
  }

  private async logSessionEnd(
    sessionId: string,
    userId: string,
    projectId: string
  ): Promise<void> {
    try {
      await supabase.from('snack_session_logs').insert({
        session_id: sessionId,
        user_id: userId,
        project_id: projectId,
        event: 'session_end',
        created_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[SnackService] Failed to log session end:', error);
    }
  }
}

// Singleton instance
export const snackService = new SnackService();

