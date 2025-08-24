/**
 * OAuth2 Organization Selector Component
 * Displays and allows selection of Supabase organizations
 */

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import {
  Building2,
  Search,
  CheckCircle2,
  Users,
  Globe,
  ArrowRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SupabaseOrganization } from '@/types/supabase-oauth'

export interface OAuth2OrganizationSelectorProps {
  organizations: SupabaseOrganization[]
  selectedOrganization: SupabaseOrganization | null
  onOrganizationSelect: (organization: SupabaseOrganization) => void
  onContinue: () => void
  isLoading?: boolean
  className?: string
}

export function OAuth2OrganizationSelector({
  organizations,
  selectedOrganization,
  onOrganizationSelect,
  onContinue,
  isLoading = false,
  className
}: OAuth2OrganizationSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')

  // Filter organizations based on search term
  const filteredOrganizations = organizations.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    org.slug.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (isLoading) {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="text-center mb-6">
          <h3 className="text-lg font-semibold mb-2">Select Organization</h3>
          <p className="text-sm text-muted-foreground">
            Loading your Supabase organizations...
          </p>
        </div>
        
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-full" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-32 mb-2" />
                  <Skeleton className="h-3 w-24" />
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
        <h3 className="text-lg font-semibold mb-2">Select Organization</h3>
        <p className="text-sm text-muted-foreground">
          Choose the Supabase organization you want to connect to
        </p>
      </div>
      
      {/* Search Bar */}
      {organizations.length > 3 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="Search organizations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      )}
      
      {/* Organizations List */}
      <div className="space-y-3 max-h-80 overflow-y-auto">
        {filteredOrganizations.length === 0 ? (
          <div className="text-center py-8">
            <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {searchTerm ? 'No organizations found matching your search' : 'No organizations available'}
            </p>
          </div>
        ) : (
          filteredOrganizations.map((organization) => (
            <Card 
              key={organization.id}
              className={cn(
                "cursor-pointer transition-all duration-200 hover:shadow-md",
                selectedOrganization?.id === organization.id && "ring-2 ring-primary border-primary"
              )}
              onClick={() => onOrganizationSelect(organization)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-5 h-5 text-blue-500" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-sm truncate">{organization.name}</h4>
                      {selectedOrganization?.id === organization.id && (
                        <CheckCircle2 className="w-4 h-4 text-primary flex-shrink-0" />
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        <span className="truncate">{organization.slug}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex-shrink-0">
                    <Badge variant="outline" className="text-xs">
                      Organization
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      
      {/* Continue Button */}
      <div className="flex justify-between items-center pt-4 border-t">
        <p className="text-xs text-muted-foreground">
          {selectedOrganization ? `Selected: ${selectedOrganization.name}` : 'Please select an organization to continue'}
        </p>
        
        <Button 
          onClick={onContinue}
          disabled={!selectedOrganization}
          className="min-w-32"
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}