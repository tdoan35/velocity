/**
 * Enhanced Supabase Connection Hook
 * Supports both direct credentials and OAuth2 connections
 * Extends existing useSupabaseConnection with OAuth2 capabilities
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import {
  type SupabaseCredentials,
  validateSupabaseConnection,
  storeSupabaseConnectionForProject,
  getStoredConnectionForProject,
  updateSupabaseConnection,
  disconnectSupabaseProject,
  testConnectionHealth,
  createSupabaseClientFromStoredCredentials,
  type ConnectionTestResult
} from '../services/supabaseConnection'
import { supabaseOAuth2Service } from '../services/supabaseOAuth2Service'
import { supabaseOAuth2ConnectionService, type OAuth2ConnectionData } from '../services/supabaseOAuth2ConnectionService'
import { enhancedOAuth2Service } from '../services/enhancedOAuth2Service'
import { oauth2HealthMonitor } from '../services/oauth2HealthMonitor'
import { oauth2TokenManager } from '../services/oauth2TokenManager'
import type {
  OAuthInitiateRequest,
  OAuthCallbackRequest,
  SupabaseOrganization,
  SupabaseProject,
  CreateSupabaseProjectRequest
} from '../types/supabase-oauth'

export interface EnhancedSupabaseConnectionState {
  // Connection state
  isConnected: boolean
  isConnecting: boolean
  isHealthy: boolean
  connectionMethod: 'direct' | 'oauth' | null
  
  // Direct connection fields
  projectUrl: string | null
  lastValidated: Date | null
  
  // OAuth2 connection fields
  organizationId: string | null
  organizationName: string | null
  supabaseProjectId: string | null
  supabaseProjectName: string | null
  supabaseProjectRegion: string | null
  
  // Common fields
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error' | 'expired'
  error: string | null
  supabaseClient: SupabaseClient | null
}

export interface OAuth2FlowResult {
  success: boolean
  authUrl?: string
  state?: string
  error?: string
}

export interface UseEnhancedSupabaseConnectionReturn {
  connectionState: EnhancedSupabaseConnectionState
  
  // Direct connection methods (existing)
  connectSupabase: (credentials: SupabaseCredentials) => Promise<ConnectionTestResult>
  disconnectSupabase: () => Promise<{ success: boolean; error?: string }>
  updateConnection: (credentials: SupabaseCredentials) => Promise<{ success: boolean; error?: string }>
  checkConnectionHealth: () => Promise<ConnectionTestResult>
  refreshConnection: () => Promise<void>
  
  // OAuth2 methods (new)
  isOAuth2Available: boolean
  initiateOAuth2Flow: (redirectUri?: string) => Promise<OAuth2FlowResult>
  handleOAuth2Callback: (code: string, state: string) => Promise<{ success: boolean; error?: string }>
  
  // OAuth2 project management
  getUserOrganizations: () => Promise<SupabaseOrganization[]>
  getOrganizationProjects: (organizationId: string) => Promise<SupabaseProject[]>
  connectOAuth2Project: (
    project: SupabaseProject,
    organization: SupabaseOrganization
  ) => Promise<{ success: boolean; error?: string }>
  createSupabaseProject: (
    request: CreateSupabaseProjectRequest
  ) => Promise<{ success: boolean; project?: SupabaseProject; error?: string }>
}

// Cache for connection status to minimize validation calls
const enhancedConnectionCache = new Map<string, {
  state: EnhancedSupabaseConnectionState
  timestamp: number
}>()

const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export function useEnhancedSupabaseConnection(velocityProjectId: string): UseEnhancedSupabaseConnectionReturn {
  const [connectionState, setConnectionState] = useState<EnhancedSupabaseConnectionState>({
    isConnected: false,
    isConnecting: false,
    isHealthy: false,
    connectionMethod: null,
    projectUrl: null,
    lastValidated: null,
    organizationId: null,
    organizationName: null,
    supabaseProjectId: null,
    supabaseProjectName: null,
    supabaseProjectRegion: null,
    connectionStatus: 'disconnected',
    error: null,
    supabaseClient: null
  })

  const healthCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const isMountedRef = useRef(true)

  // Check if OAuth2 is available
  const isOAuth2Available = supabaseOAuth2Service.isOAuth2Enabled()

  // Load cached connection state if available
  const loadCachedState = useCallback(() => {
    const cached = enhancedConnectionCache.get(velocityProjectId)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.state
    }
    return null
  }, [velocityProjectId])

  // Update cache when state changes
  const updateCache = useCallback((state: EnhancedSupabaseConnectionState) => {
    enhancedConnectionCache.set(velocityProjectId, {
      state,
      timestamp: Date.now()
    })
  }, [velocityProjectId])

  // Initialize connection state from stored data
  const initializeConnection = useCallback(async () => {
    // Check cache first
    const cachedState = loadCachedState()
    if (cachedState) {
      setConnectionState(cachedState)
      return
    }

    try {
      setConnectionState(prev => ({ ...prev, isConnecting: true }))
      
      // First check for OAuth2 connection
      const oauthConnection = await supabaseOAuth2ConnectionService.getOAuth2Connection(velocityProjectId)
      
      if (oauthConnection) {
        // Test OAuth2 connection health
        const isHealthy = await supabaseOAuth2ConnectionService.testOAuth2Connection(velocityProjectId)
        
        const newState: EnhancedSupabaseConnectionState = {
          isConnected: true,
          isConnecting: false,
          isHealthy,
          connectionMethod: 'oauth',
          projectUrl: oauthConnection.supabaseProjectUrl,
          lastValidated: oauthConnection.lastValidated,
          organizationId: oauthConnection.organizationId,
          organizationName: oauthConnection.organizationSlug,
          supabaseProjectId: oauthConnection.supabaseProjectId,
          supabaseProjectName: oauthConnection.supabaseProjectName,
          supabaseProjectRegion: oauthConnection.supabaseProjectRegion,
          connectionStatus: isHealthy ? 'connected' : (oauthConnection.connectionStatus === 'expired' ? 'expired' : 'error'),
          error: isHealthy ? null : 'OAuth2 connection needs refresh',
          supabaseClient: isHealthy ? (await import('@supabase/supabase-js')).createClient(
            oauthConnection.supabaseProjectUrl,
            oauthConnection.anonKey
          ) : null
        }
        
        if (isMountedRef.current) {
          setConnectionState(newState)
          updateCache(newState)
        }
        return
      }
      
      // Fallback to direct connection check
      const storedConnection = await getStoredConnectionForProject(velocityProjectId)
      
      if (!storedConnection) {
        const newState: EnhancedSupabaseConnectionState = {
          isConnected: false,
          isConnecting: false,
          isHealthy: false,
          connectionMethod: null,
          projectUrl: null,
          lastValidated: null,
          organizationId: null,
          organizationName: null,
          supabaseProjectId: null,
          supabaseProjectName: null,
          supabaseProjectRegion: null,
          connectionStatus: 'disconnected',
          error: null,
          supabaseClient: null
        }
        setConnectionState(newState)
        updateCache(newState)
        return
      }

      // Create Supabase client from stored credentials
      const client = await createSupabaseClientFromStoredCredentials(velocityProjectId)
      
      if (client) {
        // Test the connection health
        const healthResult = await testConnectionHealth(velocityProjectId)
        
        const newState: EnhancedSupabaseConnectionState = {
          isConnected: true,
          isConnecting: false,
          isHealthy: healthResult.success,
          connectionMethod: 'direct',
          projectUrl: storedConnection.projectUrl,
          lastValidated: storedConnection.lastValidated,
          organizationId: null,
          organizationName: null,
          supabaseProjectId: null,
          supabaseProjectName: null,
          supabaseProjectRegion: null,
          connectionStatus: healthResult.success ? 'connected' : 'error',
          error: healthResult.success ? null : healthResult.error || null,
          supabaseClient: client
        }
        
        if (isMountedRef.current) {
          setConnectionState(newState)
          updateCache(newState)
        }
      } else {
        const newState: EnhancedSupabaseConnectionState = {
          isConnected: false,
          isConnecting: false,
          isHealthy: false,
          connectionMethod: 'direct',
          projectUrl: storedConnection.projectUrl,
          lastValidated: storedConnection.lastValidated,
          organizationId: null,
          organizationName: null,
          supabaseProjectId: null,
          supabaseProjectName: null,
          supabaseProjectRegion: null,
          connectionStatus: 'error',
          error: 'Failed to create Supabase client',
          supabaseClient: null
        }
        
        if (isMountedRef.current) {
          setConnectionState(newState)
          updateCache(newState)
        }
      }
    } catch (error) {
      const newState: EnhancedSupabaseConnectionState = {
        isConnected: false,
        isConnecting: false,
        isHealthy: false,
        connectionMethod: null,
        projectUrl: null,
        lastValidated: null,
        organizationId: null,
        organizationName: null,
        supabaseProjectId: null,
        supabaseProjectName: null,
        supabaseProjectRegion: null,
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : 'Failed to initialize connection',
        supabaseClient: null
      }
      
      if (isMountedRef.current) {
        setConnectionState(newState)
        updateCache(newState)
      }
    }
  }, [velocityProjectId, loadCachedState, updateCache])

  // Connect to Supabase with provided credentials (existing functionality)
  const connectSupabase = useCallback(async (
    credentials: SupabaseCredentials
  ): Promise<ConnectionTestResult> => {
    try {
      setConnectionState(prev => ({
        ...prev,
        isConnecting: true,
        connectionStatus: 'connecting',
        error: null
      }))

      // Validate the connection first
      const validationResult = await validateSupabaseConnection(credentials)
      
      if (!validationResult.success) {
        const newState: EnhancedSupabaseConnectionState = {
          ...connectionState,
          isConnecting: false,
          connectionStatus: 'error',
          error: validationResult.message
        }
        setConnectionState(newState)
        updateCache(newState)
        return validationResult
      }

      // Store the credentials (encryption happens server-side)
      const storeResult = await storeSupabaseConnectionForProject(velocityProjectId, credentials)
      
      if (!storeResult.success) {
        const newState: EnhancedSupabaseConnectionState = {
          ...connectionState,
          isConnecting: false,
          connectionStatus: 'error',
          error: storeResult.error || 'Failed to store connection'
        }
        setConnectionState(newState)
        updateCache(newState)
        return {
          success: false,
          message: storeResult.error || 'Failed to store connection'
        }
      }

      // Create Supabase client
      const client = await createSupabaseClientFromStoredCredentials(velocityProjectId)
      
      if (client) {
        const newState: EnhancedSupabaseConnectionState = {
          isConnected: true,
          isConnecting: false,
          isHealthy: true,
          connectionMethod: 'direct',
          projectUrl: credentials.projectUrl,
          lastValidated: new Date(),
          organizationId: null,
          organizationName: null,
          supabaseProjectId: null,
          supabaseProjectName: null,
          supabaseProjectRegion: null,
          connectionStatus: 'connected',
          error: null,
          supabaseClient: client
        }
        
        setConnectionState(newState)
        updateCache(newState)
        
        return {
          success: true,
          message: 'Successfully connected to Supabase project'
        }
      } else {
        const newState: EnhancedSupabaseConnectionState = {
          ...connectionState,
          isConnecting: false,
          connectionStatus: 'error',
          error: 'Failed to create Supabase client'
        }
        setConnectionState(newState)
        updateCache(newState)
        return {
          success: false,
          message: 'Failed to create Supabase client'
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed'
      const newState: EnhancedSupabaseConnectionState = {
        ...connectionState,
        isConnecting: false,
        connectionStatus: 'error',
        error: errorMessage
      }
      setConnectionState(newState)
      updateCache(newState)
      return {
        success: false,
        message: errorMessage
      }
    }
  }, [velocityProjectId, connectionState, updateCache])

  // Disconnect from Supabase (works for both direct and OAuth2)
  const disconnectSupabase = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    try {
      let result: { success: boolean; error?: string }
      
      if (connectionState.connectionMethod === 'oauth') {
        const success = await supabaseOAuth2ConnectionService.deleteOAuth2Connection(velocityProjectId)
        result = { success, error: success ? undefined : 'Failed to disconnect OAuth2 connection' }
      } else {
        result = await disconnectSupabaseProject(velocityProjectId)
      }
      
      if (result.success) {
        const newState: EnhancedSupabaseConnectionState = {
          isConnected: false,
          isConnecting: false,
          isHealthy: false,
          connectionMethod: null,
          projectUrl: null,
          lastValidated: null,
          organizationId: null,
          organizationName: null,
          supabaseProjectId: null,
          supabaseProjectName: null,
          supabaseProjectRegion: null,
          connectionStatus: 'disconnected',
          error: null,
          supabaseClient: null
        }
        setConnectionState(newState)
        updateCache(newState)
        
        // Clear the health check interval
        if (healthCheckIntervalRef.current) {
          clearInterval(healthCheckIntervalRef.current)
          healthCheckIntervalRef.current = null
        }
      }
      
      return result
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disconnect'
      }
    }
  }, [velocityProjectId, connectionState.connectionMethod, updateCache])

  // Update existing connection with new credentials (direct connection only)
  const updateConnection = useCallback(async (
    credentials: SupabaseCredentials
  ): Promise<{ success: boolean; error?: string }> => {
    if (connectionState.connectionMethod === 'oauth') {
      return {
        success: false,
        error: 'Cannot update OAuth2 connection with direct credentials'
      }
    }

    try {
      setConnectionState(prev => ({
        ...prev,
        isConnecting: true,
        connectionStatus: 'connecting',
        error: null
      }))

      const result = await updateSupabaseConnection(velocityProjectId, credentials)
      
      if (result.success) {
        // Recreate the client with new credentials
        const client = await createSupabaseClientFromStoredCredentials(velocityProjectId)
        
        if (client) {
          const newState: EnhancedSupabaseConnectionState = {
            ...connectionState,
            isConnected: true,
            isConnecting: false,
            isHealthy: true,
            projectUrl: credentials.projectUrl,
            lastValidated: new Date(),
            connectionStatus: 'connected',
            error: null,
            supabaseClient: client
          }
          setConnectionState(newState)
          updateCache(newState)
        }
      } else {
        setConnectionState(prev => ({
          ...prev,
          isConnecting: false,
          connectionStatus: 'error',
          error: result.error || 'Failed to update connection'
        }))
      }
      
      return result
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to update connection'
      setConnectionState(prev => ({
        ...prev,
        isConnecting: false,
        connectionStatus: 'error',
        error: errorMessage
      }))
      return {
        success: false,
        error: errorMessage
      }
    }
  }, [velocityProjectId, connectionState, updateCache])

  // Check connection health (works for both connection types)
  const checkConnectionHealth = useCallback(async (): Promise<ConnectionTestResult> => {
    if (!connectionState.isConnected) {
      return {
        success: false,
        message: 'No active connection'
      }
    }

    try {
      let healthResult: ConnectionTestResult
      
      if (connectionState.connectionMethod === 'oauth') {
        const isHealthy = await supabaseOAuth2ConnectionService.testOAuth2Connection(velocityProjectId)
        healthResult = {
          success: isHealthy,
          message: isHealthy ? 'OAuth2 connection is healthy' : 'OAuth2 connection failed health check'
        }
      } else {
        healthResult = await testConnectionHealth(velocityProjectId)
      }
      
      setConnectionState(prev => ({
        ...prev,
        isHealthy: healthResult.success,
        lastValidated: new Date(),
        connectionStatus: healthResult.success ? 'connected' : 'error',
        error: healthResult.success ? null : healthResult.error || null
      }))
      
      return healthResult
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Health check failed'
      setConnectionState(prev => ({
        ...prev,
        isHealthy: false,
        connectionStatus: 'error',
        error: errorMessage
      }))
      return {
        success: false,
        message: errorMessage
      }
    }
  }, [velocityProjectId, connectionState.isConnected, connectionState.connectionMethod])

  // Refresh connection (re-initialize from stored data)
  const refreshConnection = useCallback(async () => {
    // Clear cache to force reload
    enhancedConnectionCache.delete(velocityProjectId)
    await initializeConnection()
  }, [velocityProjectId, initializeConnection])

  // Initiate OAuth2 flow
  const initiateOAuth2Flow = useCallback(async (redirectUri?: string): Promise<OAuth2FlowResult> => {
    if (!isOAuth2Available) {
      return {
        success: false,
        error: 'OAuth2 is not available or configured'
      }
    }

    try {
      const request: OAuthInitiateRequest = {
        project_id: velocityProjectId,
        redirect_uri: redirectUri
      }

      const response = await supabaseOAuth2Service.initiateOAuth2Flow(request)
      
      return {
        success: true,
        authUrl: response.auth_url,
        state: response.state
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initiate OAuth2 flow'
      }
    }
  }, [velocityProjectId, isOAuth2Available])

  // Handle OAuth2 callback
  const handleOAuth2Callback = useCallback(async (
    code: string,
    state: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isOAuth2Available) {
      return {
        success: false,
        error: 'OAuth2 is not available or configured'
      }
    }

    try {
      setConnectionState(prev => ({
        ...prev,
        isConnecting: true,
        connectionStatus: 'connecting',
        error: null
      }))

      const request: OAuthCallbackRequest = { code, state }
      const tokens = await supabaseOAuth2Service.handleOAuth2Callback(request)
      
      // For now, we'll just return success - the actual project connection
      // will happen when user selects a specific Supabase project
      setConnectionState(prev => ({
        ...prev,
        isConnecting: false,
        error: null
      }))

      return {
        success: true
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'OAuth2 callback failed'
      setConnectionState(prev => ({
        ...prev,
        isConnecting: false,
        connectionStatus: 'error',
        error: errorMessage
      }))
      
      return {
        success: false,
        error: errorMessage
      }
    }
  }, [isOAuth2Available])

  // Get user organizations (OAuth2 only)
  const getUserOrganizations = useCallback(async (): Promise<SupabaseOrganization[]> => {
    if (!isOAuth2Available) {
      throw new Error('OAuth2 is not available')
    }

    try {
      return await supabaseOAuth2ConnectionService.getUserOrganizations(velocityProjectId)
    } catch (error) {
      throw error
    }
  }, [velocityProjectId, isOAuth2Available])

  // Get organization projects (OAuth2 only)
  const getOrganizationProjects = useCallback(async (organizationId: string): Promise<SupabaseProject[]> => {
    if (!isOAuth2Available) {
      throw new Error('OAuth2 is not available')
    }

    try {
      return await supabaseOAuth2ConnectionService.getOrganizationProjects(velocityProjectId, organizationId)
    } catch (error) {
      throw error
    }
  }, [velocityProjectId, isOAuth2Available])

  // Connect to existing OAuth2 project
  const connectOAuth2Project = useCallback(async (
    project: SupabaseProject,
    organization: SupabaseOrganization
  ): Promise<{ success: boolean; error?: string }> => {
    if (!isOAuth2Available) {
      return {
        success: false,
        error: 'OAuth2 is not available'
      }
    }

    try {
      setConnectionState(prev => ({
        ...prev,
        isConnecting: true,
        connectionStatus: 'connecting',
        error: null
      }))

      // This would require having OAuth2 tokens available
      // For now, return a placeholder implementation
      
      return {
        success: false,
        error: 'OAuth2 project connection not yet implemented'
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect OAuth2 project'
      }
    }
  }, [velocityProjectId, isOAuth2Available])

  // Create new Supabase project (OAuth2 only)
  const createSupabaseProject = useCallback(async (
    request: CreateSupabaseProjectRequest
  ): Promise<{ success: boolean; project?: SupabaseProject; error?: string }> => {
    if (!isOAuth2Available) {
      return {
        success: false,
        error: 'OAuth2 is not available'
      }
    }

    try {
      const project = await supabaseOAuth2ConnectionService.createSupabaseProject(velocityProjectId, request)
      
      return {
        success: true,
        project
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create Supabase project'
      }
    }
  }, [velocityProjectId, isOAuth2Available])

  // Initialize connection on mount
  useEffect(() => {
    isMountedRef.current = true
    initializeConnection()

    // Set up periodic health checks every 5 minutes
    healthCheckIntervalRef.current = setInterval(async () => {
      if (connectionState.isConnected && isMountedRef.current) {
        await checkConnectionHealth()
      }
    }, 5 * 60 * 1000)

    return () => {
      isMountedRef.current = false
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current)
      }
    }
  }, [velocityProjectId]) // Only re-run if project ID changes

  return {
    connectionState,
    
    // Direct connection methods
    connectSupabase,
    disconnectSupabase,
    updateConnection,
    checkConnectionHealth,
    refreshConnection,
    
    // OAuth2 methods
    isOAuth2Available,
    initiateOAuth2Flow,
    handleOAuth2Callback,
    getUserOrganizations,
    getOrganizationProjects,
    connectOAuth2Project,
    createSupabaseProject
  }
}