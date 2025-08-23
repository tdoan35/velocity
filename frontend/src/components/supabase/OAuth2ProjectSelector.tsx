/**
 * OAuth2 Project Selector Component
 * Displays and manages Supabase projects for an organization
 */

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import {
  Database,
  Search,
  CheckCircle2,
  Plus,
  Globe,
  Calendar,
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowLeft
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SupabaseProject, SupabaseOrganization } from '@/types/supabase-oauth'

export interface OAuth2ProjectSelectorProps {
  organization: SupabaseOrganization
  projects: SupabaseProject[]
  selectedProject: SupabaseProject | null
  onProjectSelect: (project: SupabaseProject) => void
  onBack: () => void
  onConnect: () => void
  onCreateNew: () => void
  isLoading?: boolean
  className?: string
}

export function OAuth2ProjectSelector({
  organization,
  projects,
  selectedProject,
  onProjectSelect,
  onBack,
  onConnect,
  onCreateNew,
  isLoading = false,
  className
}: OAuth2ProjectSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')

  // Filter projects based on search term
  const filteredProjects = projects.filter(project =>
    project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    project.ref.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // Get status color and label
  const getProjectStatusInfo = (status: SupabaseProject['status']) => {
    switch (status) {
      case 'ACTIVE_HEALTHY':
        return { color: 'text-green-500', bgColor: 'bg-green-500/10', label: 'Healthy' }
      case 'COMING_UP':
        return { color: 'text-blue-500', bgColor: 'bg-blue-500/10', label: 'Starting' }
      case 'INACTIVE':
        return { color: 'text-gray-500', bgColor: 'bg-gray-500/10', label: 'Inactive' }
      case 'INIT_FAILED':
        return { color: 'text-red-500', bgColor: 'bg-red-500/10', label: 'Failed' }
      case 'REMOVED':
        return { color: 'text-gray-500', bgColor: 'bg-gray-500/10', label: 'Removed' }
      case 'RESTORING':
        return { color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', label: 'Restoring' }
      case 'UPGRADING':
        return { color: 'text-blue-500', bgColor: 'bg-blue-500/10', label: 'Upgrading' }
      default:
        return { color: 'text-gray-500', bgColor: 'bg-gray-500/10', label: 'Unknown' }
    }
  }

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold mb-2">Select Project</h3>
          <p className="text-sm text-muted-foreground">
            Loading projects for {organization.name}...
          </p>
        </div>
        
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-40 mb-2" />
                  <Skeleton className="h-3 w-24 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Select Project</h3>
        <p className="text-sm text-muted-foreground">
          Choose a Supabase project from <span className="font-medium">{organization.name}</span>
        </p>
      </div>
      
      {/* Search and Create Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search projects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={onCreateNew}>
          <Plus className="w-4 h-4 mr-2" />
          Create New
        </Button>
      </div>
      
      {/* Projects List */}
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {filteredProjects.length === 0 ? (
          <div className="text-center py-8">
            <Database className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-2">
              {searchTerm ? 'No projects found matching your search' : 'No projects in this organization'}
            </p>
            {!searchTerm && (
              <Button variant="outline" onClick={onCreateNew} className="mt-2">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Project
              </Button>
            )}
          </div>
        ) : (
          filteredProjects.map((project) => {
            const statusInfo = getProjectStatusInfo(project.status)
            const isSelectable = project.status === 'ACTIVE_HEALTHY'
            
            return (
              <Card 
                key={project.id}
                className={cn(
                  "transition-all duration-200",
                  isSelectable && "cursor-pointer hover:shadow-md",
                  !isSelectable && "opacity-60 cursor-not-allowed",
                  selectedProject?.id === project.id && isSelectable && "ring-2 ring-primary border-primary"
                )}
                onClick={() => isSelectable && onProjectSelect(project)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                      <Database className="w-5 h-5 text-blue-500" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-medium text-sm truncate">{project.name}</h4>
                        {selectedProject?.id === project.id && isSelectable && (
                          <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                        )}
                        {!isSelectable && (
                          <AlertCircle className="w-4 h-4 text-orange-500 flex-shrink-0" />
                        )}
                      </div>
                      
                      <div className="space-y-1">
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Globe className="w-3 h-3" />
                            <span className="truncate">{project.ref}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {new Date(project.created_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <div className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded text-xs",
                            statusInfo.bgColor
                          )}>
                            <Activity className={cn("w-3 h-3", statusInfo.color)} />
                            <span className={statusInfo.color}>{statusInfo.label}</span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {project.region}
                          </Badge>
                        </div>
                      </div>
                      
                      {!isSelectable && (
                        <p className="text-xs text-orange-600 mt-2">
                          Project is not available for connection
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
      
      {/* Navigation */}
      <div className="flex justify-between items-center pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {selectedProject ? `Selected: ${selectedProject.name}` : 'Please select a project to continue'}
          </p>
          
          <Button 
            onClick={onConnect}
            disabled={!selectedProject || selectedProject.status !== 'ACTIVE_HEALTHY'}
            className="min-w-32"
          >
            Connect
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  )
}