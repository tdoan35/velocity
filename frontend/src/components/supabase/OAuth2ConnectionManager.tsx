/**
 * OAuth2 Connection Manager Component
 * Main orchestrator for OAuth2 connection flow and project management
 */

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Alert, AlertDescription } from '../ui/alert'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import {
  Link2,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useOAuth2Flow } from '@/hooks/useOAuth2Flow'
import { OAuth2OrganizationSelector } from './OAuth2OrganizationSelector'
import { OAuth2ProjectSelector } from './OAuth2ProjectSelector'
import { OAuth2ProjectCreator } from './OAuth2ProjectCreator'
import type { SupabaseOrganization, SupabaseProject, CreateSupabaseProjectRequest } from '@/types/supabase-oauth'

export interface OAuth2ConnectionManagerProps {
  velocityProjectId: string
  onConnectionSuccess?: () => void
  onConnectionError?: (error: string) => void
  className?: string
}

type FlowStep = 'authorization' | 'organizations' | 'projects' | 'create-project' | 'connecting' | 'connected'

export function OAuth2ConnectionManager({
  velocityProjectId,
  onConnectionSuccess,
  onConnectionError,
  className
}: OAuth2ConnectionManagerProps) {
  const [currentStep, setCurrentStep] = useState<FlowStep>('authorization')
  const [selectedProject, setSelectedProject] = useState<SupabaseProject | null>(null)
  
  const {
    flowState,
    initiate,
    processCallback,
    loadOrganizations,
    loadProjects,
    createProject,
    selectOrganization,
    clearSelection,
    reset,
    isOAuth2Available
  } = useOAuth2Flow()

  // Handle OAuth2 authorization
  const handleAuthorize = async () => {
    if (!isOAuth2Available) {
      onConnectionError?.('OAuth2 is not available or configured')
      return
    }

    const result = await initiate(velocityProjectId)
    
    if (result.success && result.authUrl) {
      // Open OAuth2 authorization URL in new window
      const authWindow = window.open(
        result.authUrl,
        'supabase-oauth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      )

      // Listen for the callback
      const handleCallback = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return
        
        if (event.data.type === 'oauth-callback') {
          window.removeEventListener('message', handleCallback)
          authWindow?.close()
          
          const { code, state } = event.data
          const callbackResult = await processCallback(code, state)
          
          if (callbackResult.success) {
            setCurrentStep('organizations')
            // Load organizations
            const orgResult = await loadOrganizations(velocityProjectId)
            if (!orgResult.success) {
              onConnectionError?.(orgResult.error || 'Failed to load organizations')
            }
          } else {
            onConnectionError?.(callbackResult.error || 'OAuth2 authorization failed')
          }
        }
      }

      window.addEventListener('message', handleCallback)
      
      // Handle window closed without callback
      const checkClosed = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(checkClosed)
          window.removeEventListener('message', handleCallback)
        }
      }, 1000)
    } else {
      onConnectionError?.(result.error || 'Failed to initiate OAuth2 flow')
    }
  }

  // Handle organization selection
  const handleOrganizationSelect = (organization: SupabaseOrganization) => {
    selectOrganization(organization)
  }

  // Continue to projects after organization selection
  const handleOrganizationContinue = async () => {
    if (!flowState.selectedOrganization) return
    
    setCurrentStep('projects')
    const result = await loadProjects(velocityProjectId, flowState.selectedOrganization.id)
    if (!result.success) {
      onConnectionError?.(result.error || 'Failed to load projects')
    }
  }

  // Handle project selection
  const handleProjectSelect = (project: SupabaseProject) => {
    setSelectedProject(project)
  }

  // Connect to selected project
  const handleProjectConnect = async () => {
    if (!selectedProject || !flowState.selectedOrganization) return
    
    setCurrentStep('connecting')
    
    // TODO: Implement actual project connection logic
    // For now, simulate connection
    setTimeout(() => {
      setCurrentStep('connected')
      onConnectionSuccess?.()
    }, 2000)
  }

  // Navigate to project creation
  const handleCreateProject = () => {
    setCurrentStep('create-project')
  }

  // Handle project creation
  const handleProjectCreate = async (request: CreateSupabaseProjectRequest) => {
    const result = await createProject(velocityProjectId, request)
    return result
  }

  // Handle successful project creation
  const handleProjectCreated = () => {
    setCurrentStep('projects')
    // Reload projects to show the newly created one
    if (flowState.selectedOrganization) {
      loadProjects(velocityProjectId, flowState.selectedOrganization.id)
    }
  }

  // Handle back navigation
  const handleBack = () => {
    switch (currentStep) {
      case 'organizations':
        setCurrentStep('authorization')
        reset()
        break
      case 'projects':
        setCurrentStep('organizations')
        setSelectedProject(null)
        break
      case 'create-project':
        setCurrentStep('projects')
        break
      default:
        break
    }
  }

  // Reset everything
  const handleReset = () => {
    setCurrentStep('authorization')
    setSelectedProject(null)
    clearSelection()
    reset()
  }

  if (!isOAuth2Available) {
    return (
      <div className={cn("space-y-4", className)}>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            OAuth2 integration is not available or properly configured for this environment.
            Please contact your administrator or use the direct connection method instead.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      {/* Progress Indicator */}
      <div className="flex items-center justify-center space-x-4">
        {[
          { step: 'authorization', label: 'Authorize', icon: Shield },
          { step: 'organizations', label: 'Organization', icon: Link2 },
          { step: 'projects', label: 'Project', icon: CheckCircle2 }
        ].map((item, index) => {
          const Icon = item.icon
          const isActive = 
            currentStep === item.step ||
            (currentStep === 'create-project' && item.step === 'projects') ||
            (currentStep === 'connecting' && item.step === 'projects') ||
            (currentStep === 'connected' && item.step === 'projects')
          
          const isCompleted = 
            (item.step === 'authorization' && ['organizations', 'projects', 'create-project', 'connecting', 'connected'].includes(currentStep)) ||
            (item.step === 'organizations' && ['projects', 'create-project', 'connecting', 'connected'].includes(currentStep))

          return (
            <div key={item.step} className="flex items-center">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors",
                isActive && "bg-primary border-primary text-primary-foreground",
                isCompleted && !isActive && "bg-green-500 border-green-500 text-white",
                !isActive && !isCompleted && "border-muted-foreground text-muted-foreground"
              )}>
                <Icon className="w-4 h-4" />
              </div>
              <span className={cn(
                "ml-2 text-sm font-medium",
                isActive && "text-primary",
                isCompleted && !isActive && "text-green-600",
                !isActive && !isCompleted && "text-muted-foreground"
              )}>
                {item.label}
              </span>
              {index < 2 && (
                <div className={cn(
                  "w-12 h-0.5 mx-4",
                  isCompleted && "bg-green-500",
                  !isCompleted && "bg-muted"
                )} />
              )}
            </div>
          )
        })}
      </div>

      {/* Error Display */}
      {flowState.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{flowState.error}</span>
            <Button size="sm" variant="outline" onClick={handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Step Content */}
      <Card>
        <CardContent className="p-6">
          {currentStep === 'authorization' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto">
                <Shield className="w-8 h-8 text-purple-500" />
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">Connect with Supabase</h3>
                <p className="text-sm text-muted-foreground">
                  Authorize Velocity to access your Supabase organizations and projects
                </p>
              </div>
              
              <div className="space-y-3">
                <Button 
                  onClick={handleAuthorize}
                  disabled={flowState.isInitiating}
                  className="w-full max-w-sm"
                >
                  {flowState.isInitiating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Authorize with Supabase
                    </>
                  )}
                </Button>
                
                <p className="text-xs text-muted-foreground">
                  You'll be redirected to Supabase to authorize the connection
                </p>
              </div>
            </div>
          )}

          {currentStep === 'organizations' && (
            <OAuth2OrganizationSelector
              organizations={flowState.organizations}
              selectedOrganization={flowState.selectedOrganization}
              onOrganizationSelect={handleOrganizationSelect}
              onContinue={handleOrganizationContinue}
              isLoading={flowState.isLoadingOrganizations}
            />
          )}

          {currentStep === 'projects' && flowState.selectedOrganization && (
            <OAuth2ProjectSelector
              organization={flowState.selectedOrganization}
              projects={flowState.projects}
              selectedProject={selectedProject}
              onProjectSelect={handleProjectSelect}
              onBack={handleBack}
              onConnect={handleProjectConnect}
              onCreateNew={handleCreateProject}
              isLoading={flowState.isLoadingProjects}
            />
          )}

          {currentStep === 'create-project' && flowState.selectedOrganization && (
            <OAuth2ProjectCreator
              organization={flowState.selectedOrganization}
              onBack={handleBack}
              onCreate={handleProjectCreate}
              onSuccess={handleProjectCreated}
              isCreating={flowState.isCreatingProject}
            />
          )}

          {currentStep === 'connecting' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mx-auto">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
              
              <div>
                <h3 className="text-lg font-semibold mb-2">Connecting Project</h3>
                <p className="text-sm text-muted-foreground">
                  Setting up the connection to {selectedProject?.name}...
                </p>
              </div>
            </div>
          )}

          {currentStep === 'connected' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8 text-green-500" />
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-green-600 mb-2">Connection Successful!</h3>
                <p className="text-sm text-muted-foreground">
                  Your Supabase project is now connected to Velocity
                </p>
              </div>
              
              {selectedProject && (
                <div className="bg-muted rounded-lg p-4">
                  <div className="flex items-center justify-center gap-2">
                    <Badge variant="secondary">{selectedProject.name}</Badge>
                    <span className="text-sm text-muted-foreground">•</span>
                    <Badge variant="outline">{selectedProject.region}</Badge>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}