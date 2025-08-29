import { Snack, type SnackOptions, type SnackListenerSubscription } from 'snack-sdk';
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

// Union type for different subscription patterns from Snack SDK
type SnackSubscription = 
  | (() => void)  // Function unsubscribe
  | { unsubscribe(): void }  // Object with unsubscribe method
  | { remove(): void }  // Object with remove method
  | SnackListenerSubscription;  // Original SDK type

export interface SnackSession {
  id: string;
  snack: Snack;
  subscriptions: SnackSubscription[];
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
  snackApiUrl: (import.meta as any).env.VITE_SNACK_API_URL || 'https://exp.host',
  snackagerUrl: (import.meta as any).env.VITE_SNACKAGER_URL || 'https://snackager.expo.io',
  webPlayerUrl: (import.meta as any).env.VITE_WEB_PLAYER_URL || 'https://snack.expo.dev/embedded',
  verbose: (import.meta as any).env.DEV,
  channel: (import.meta as any).env.VITE_SNACK_CHANNEL || 'production',
};

export class SnackService {
  private config: SnackServiceConfig;
  private sessions: Map<string, SnackSession> = new Map();
  private sessionTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes

  constructor(config?: Partial<SnackServiceConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    console.log('[SnackService] Service initialized with config:', this.config);
    console.log('[SnackService] Snack SDK available:', typeof Snack, Snack);
  }

  /**
   * Initialize a new Snack session with webPreviewRef
   */
  async createSession(
    sessionId: string,
    options: SnackPreviewOptions,
    userId?: string,
    projectId?: string,
    webPreviewRef?: React.RefObject<Window | null>
  ): Promise<SnackSession> {
    console.log('[SnackService] Creating session:', sessionId, options);
    
    // Clean up existing session if any
    await this.destroySession(sessionId);

    // Prepare files - use provided files or default
    // Ensure we have a minimal, valid React Native app structure
    const defaultFiles = {
      'App.js': {
        type: 'CODE' as const,
        contents: `import * as React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to Velocity!</Text>
      <Text style={styles.subtitle}>Your React Native app is running!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 20,
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});`
      }
    };

    // Validate and sanitize the files input
    let filesToUse: Record<string, { type: string; contents: string }> = defaultFiles;
    
    if (options.files && Object.keys(options.files).length > 0) {
      // Validate that all files have the correct structure
      const validatedFiles: Record<string, { type: string; contents: string }> = {};
      
      for (const [path, file] of Object.entries(options.files)) {
        // Only include valid files with proper structure
        if (file && typeof file === 'object' && file.type && file.contents) {
          // Ensure the file has the exact structure Snack expects
          validatedFiles[path] = {
            type: file.type === 'CODE' ? 'CODE' : 'CODE', // Force CODE type for now
            contents: String(file.contents) // Ensure it's a string
          };
        }
      }
      
      // Only use provided files if we have at least one valid file
      if (Object.keys(validatedFiles).length > 0) {
        filesToUse = validatedFiles;
      }
    }
      
    console.log('[SnackService] Files to use:', JSON.stringify(filesToUse, null, 2));

    // Smart dependency detection - automatically detect required dependencies from code
    const detectRequiredDependencies = (files: Record<string, { type: string; contents: string }>): Record<string, string> => {
      const detected: Record<string, string> = {};
      
      for (const [path, file] of Object.entries(files)) {
        const content = file.contents;
        
        // React Navigation dependencies
        if (content.includes('@react-navigation/native')) {
          detected['@react-navigation/native'] = '^6.1.7';
        }
        if (content.includes('@react-navigation/bottom-tabs')) {
          detected['@react-navigation/bottom-tabs'] = '^6.5.8';
        }
        if (content.includes('@react-navigation/stack')) {
          detected['@react-navigation/stack'] = '^6.3.16';
        }
        if (content.includes('@react-navigation/drawer')) {
          detected['@react-navigation/drawer'] = '^6.6.2';
        }
        
        // Expo Vector Icons
        if (content.includes('@expo/vector-icons')) {
          detected['@expo/vector-icons'] = '^13.0.0';
        }
        
        // React Native elements and common libraries
        if (content.includes('react-native-elements')) {
          detected['react-native-elements'] = '^3.4.3';
        }
        if (content.includes('react-native-vector-icons')) {
          detected['react-native-vector-icons'] = '^10.0.0';
        }
        
        // State management
        if (content.includes('@reduxjs/toolkit')) {
          detected['@reduxjs/toolkit'] = '^1.9.5';
          detected['react-redux'] = '^8.1.1';
        }
        
        // Async storage
        if (content.includes('@react-native-async-storage/async-storage')) {
          detected['@react-native-async-storage/async-storage'] = '^1.19.0';
        }
        
        // React Native Paper
        if (content.includes('react-native-paper')) {
          detected['react-native-paper'] = '^5.8.0';
        }
        
        // Native Base
        if (content.includes('native-base')) {
          detected['native-base'] = '^3.4.28';
        }
      }
      
      console.log('[SnackService] Detected dependencies from code analysis:', detected);
      return detected;
    };

    // Minimal dependencies for React Native app to function properly
    // Using specific versions that are known to work with Expo SDK 52
    const defaultDependencies: Record<string, any> = {
      'expo': '~52.0.0',
      'react': '18.3.1',
    };

    // Detect additional dependencies from the code
    const detectedDependencies = detectRequiredDependencies(filesToUse);

    // Create Snack options - according to official SDK docs
    // Pass webPreviewRef during construction if available
    const snackOptions: SnackOptions = {
      name: options.name || 'Velocity Preview',
      description: options.description || 'Live preview of your React Native app',
      sdkVersion: '52.0.0',
      files: filesToUse as any,
      dependencies: { ...defaultDependencies, ...detectedDependencies, ...(options.dependencies || {}) },
      verbose: false,
      // Pass webPreviewRef if provided - this enables web preview functionality
      ...(webPreviewRef && { webPreviewRef }),
    };

    console.log('[SnackService] About to create Snack with options:', snackOptions);
    console.log('[SnackService] Files being passed to Snack:', JSON.stringify(snackOptions.files, null, 2));
    console.log('[SnackService] Final dependencies being used:', snackOptions.dependencies);
    
    let snack;
    try {
      snack = new Snack(snackOptions);
      console.log('[SnackService] Snack instance created successfully:', snack);
    } catch (error) {
      console.error('[SnackService] Failed to create Snack instance:', error);
      throw error;
    }

    // Set up event listeners
    const subscriptions: SnackSubscription[] = [];

    // Listen for state changes
    subscriptions.push(
      snack.addStateListener((state) => {
        console.log('[SnackService] State changed:', {
          webPreviewURL: state?.webPreviewURL,
          online: state?.online,
          url: state?.url,
          channel: state?.channel,
          state: state
        });
        
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

    // Set the Snack online immediately after creation
    try {
      console.log('[SnackService] Setting Snack online...');
      
      // Add error listener before going online to catch assertion errors
      const errorSubscription = (snack as any).addErrorListener?.((errors: any) => {
        console.error('[SnackService] Snack SDK Errors:', errors);
        if (errors && errors.length > 0) {
          errors.forEach((error: any, index: number) => {
            console.error(`[SnackService] Error ${index + 1}:`, {
              message: error?.message,
              stack: error?.stack,
              code: error?.code,
              type: error?.type,
              error: error
            });
          });
        }
      });
      
      // Store the error subscription for cleanup
      if (errorSubscription) {
        subscriptions.push(errorSubscription);
      }
      
      try {
        await snack.setOnline(true);
        console.log('[SnackService] Successfully set Snack online');
      } catch (onlineError) {
        console.error('[SnackService] Failed to set Snack online:', onlineError);
        throw onlineError;
      }
      
      // Try to request web preview after going online
      console.log('[SnackService] Requesting web preview...');
      try {
        // According to the documentation, we need to explicitly request web preview
        if (typeof (snack as any).requestWebPreview === 'function') {
          console.log('[SnackService] Calling requestWebPreview method...');
          await (snack as any).requestWebPreview();
        } else if (typeof (snack as any).getWebPreviewAsync === 'function') {
          console.log('[SnackService] Calling getWebPreviewAsync method...');
          await (snack as any).getWebPreviewAsync();
        }
        
        // Note: webPreviewRef will be set later when the iframe is ready and loaded
      } catch (error) {
        console.error('[SnackService] Failed to setup web preview:', error);
      }
      
      // Wait for the state to stabilize, then log it
      setTimeout(() => {
        try {
          const state = snack.getState();
          console.log('[SnackService] State after going online:', {
            webPreviewURL: state?.webPreviewURL,
            online: state?.online,
            url: state?.url,
            channel: state?.channel,
            state: state
          });
        } catch (error) {
          console.error('[SnackService] Failed to get state after going online:', error);
        }
      }, 1000);
    } catch (error) {
      console.error('[SnackService] Failed to set Snack online:', error);
      console.error('[SnackService] Error details:', {
        message: (error as any)?.message,
        stack: (error as any)?.stack,
        name: (error as any)?.name,
        error: error
      });
    }

    // Log the initial files to verify they were applied
    setTimeout(() => {
      try {
        const state = snack.getState();
        console.log('[SnackService] Snack state after creation:', {
          files: Object.keys(state?.files || {}),
          fileDetails: state?.files,
          name: state?.name,
          online: state?.online
        });
      } catch (error) {
        console.error('[SnackService] Failed to get state after creation:', error);
      }
    }, 1000);

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
   * Get the web preview URL from Snack state
   */
  getWebPreviewUrl(sessionId: string): string | null {
    const session = this.getSession(sessionId);
    if (!session) {
      console.log('[SnackService] getWebPreviewUrl: No session found for', sessionId);
      return null;
    }

    try {
      const state = session.snack.getState();
      console.log('[SnackService] getWebPreviewUrl: Current state:', {
        webPreviewURL: state?.webPreviewURL,
        online: state?.online,
        url: state?.url,
        channel: state?.channel
      });
      
      // The Snack SDK should provide webPreviewURL directly in the state
      if (state?.webPreviewURL) {
        console.log('[SnackService] Found webPreviewURL in state:', state.webPreviewURL);
        return state.webPreviewURL;
      }
      
      // If not available yet but we have a URL, it might be the general URL
      if (state?.url && state?.online) {
        // For web preview, we need to ensure we get the web player URL
        // The SDK should handle this, but if not, we can try to construct it
        const webUrl = state.url.includes('/web') ? state.url : `${state.url}/web`;
        console.log('[SnackService] Using URL from state for web preview:', webUrl);
        return webUrl;
      }
      
      // Fallback: try to construct a web preview URL manually if we have a channel
      const channel = (session.snack as any).getChannel?.();
      if (channel && state?.online) {
        const fallbackUrl = `${this.config.webPlayerUrl}/@snack/${channel}`;
        console.log('[SnackService] Using fallback constructed URL:', fallbackUrl);
        return fallbackUrl;
      }
      
      console.log('[SnackService] No webPreviewURL available yet, Snack may still be initializing');
      return null;
    } catch (error) {
      console.error('[SnackService] Failed to get webPreviewURL:', error);
      return null;
    }
  }

  /**
   * Set webPreviewRef on existing session
   */
  setWebPreviewRef(sessionId: string, webPreviewRef: Window | null): void {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    console.log('[SnackService] Setting webPreviewRef:', webPreviewRef);
    
    // According to Snack SDK docs, the webPreviewRef should be set during construction
    // But we can also try to update it if the method exists
    try {
      if (typeof (session.snack as any).setWebPreviewRef === 'function') {
        (session.snack as any).setWebPreviewRef(webPreviewRef);
        console.log('[SnackService] Successfully set webPreviewRef');
        
        // Try to refresh the web preview after setting the ref
        setTimeout(async () => {
          try {
            if (typeof (session.snack as any).requestWebPreview === 'function') {
              console.log('[SnackService] Requesting web preview after webPreviewRef update');
              await (session.snack as any).requestWebPreview();
            } else if (typeof (session.snack as any).getWebPreviewAsync === 'function') {
              console.log('[SnackService] Calling getWebPreviewAsync after webPreviewRef update');
              await (session.snack as any).getWebPreviewAsync();
            }
            
            // Also try to trigger a code refresh to ensure the preview gets the latest code
            const state = session.snack.getState();
            if (state?.files) {
              console.log('[SnackService] Refreshing code after webPreviewRef update');
              await session.snack.updateFiles(state.files);
            }
          } catch (error) {
            console.error('[SnackService] Failed to refresh preview after webPreviewRef update:', error);
          }
        }, 300);
      } else {
        console.warn('[SnackService] setWebPreviewRef method not available on Snack instance');
      }
    } catch (error) {
      console.error('[SnackService] Failed to set webPreviewRef:', error);
    }
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

    console.log('[SnackService] Destroying session:', sessionId);

    // Unsubscribe from all listeners - safely handle different subscription types
    session.subscriptions.forEach(sub => {
      try {
        if (typeof sub === 'function') {
          sub();
        } else if (sub && 'unsubscribe' in sub && typeof sub.unsubscribe === 'function') {
          sub.unsubscribe();
        } else if (sub && 'remove' in sub && typeof sub.remove === 'function') {
          sub.remove();
        }
      } catch (error) {
        console.warn('[SnackService] Failed to unsubscribe listener:', error);
      }
    });

    // Clear timeout
    const timeout = this.sessionTimeouts.get(sessionId);
    if (timeout) {
      clearTimeout(timeout);
      this.sessionTimeouts.delete(sessionId);
    }

    // Remove session
    this.sessions.delete(sessionId);
    console.log('[SnackService] Session destroyed:', sessionId);

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

    for (const [sessionId, session] of Array.from(this.sessions.entries())) {
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

