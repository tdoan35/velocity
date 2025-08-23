/**
 * OAuth2 Project Creator Component
 * Form for creating new Supabase projects via OAuth2 Management API
 */

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Badge } from '../ui/badge'
import { Alert, AlertDescription } from '../ui/alert'
import {
  Database,
  ArrowLeft,
  Loader2,
  Globe,
  Shield,
  Zap,
  Info,
  CheckCircle2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SupabaseOrganization, CreateSupabaseProjectRequest } from '@/types/supabase-oauth'

export interface OAuth2ProjectCreatorProps {
  organization: SupabaseOrganization
  onBack: () => void
  onCreate: (request: CreateSupabaseProjectRequest) => Promise<{ success: boolean; error?: string }>
  onSuccess: () => void
  isCreating?: boolean
  className?: string
}

// Available regions for Supabase projects
const SUPABASE_REGIONS = [
  { value: 'us-east-1', label: 'US East (N. Virginia)', flag: '🇺🇸' },
  { value: 'us-west-1', label: 'US West (N. California)', flag: '🇺🇸' },
  { value: 'eu-west-1', label: 'Europe (Ireland)', flag: '🇪🇺' },
  { value: 'eu-central-1', label: 'Europe (Frankfurt)', flag: '🇪🇺' },
  { value: 'ap-southeast-1', label: 'Asia Pacific (Singapore)', flag: '🇸🇬' },
  { value: 'ap-northeast-1', label: 'Asia Pacific (Tokyo)', flag: '🇯🇵' },
  { value: 'ap-south-1', label: 'Asia Pacific (Mumbai)', flag: '🇮🇳' }
]

// Available plans
const SUPABASE_PLANS = [
  {
    value: 'free' as const,
    label: 'Free',
    description: 'Perfect for hobby projects and getting started',
    features: ['Up to 2 projects', '500MB database', '1GB bandwidth', 'Community support'],
    badge: 'Most Popular'
  },
  {
    value: 'pro' as const,
    label: 'Pro',
    description: 'For production applications',
    features: ['Unlimited projects', '8GB database', '250GB bandwidth', 'Email support'],
    price: '$25/month'
  },
  {
    value: 'team' as const,
    label: 'Team',
    description: 'For teams and collaborative development',
    features: ['Everything in Pro', 'Team collaboration', 'Advanced security', 'Priority support'],
    price: '$599/month'
  }
]

export function OAuth2ProjectCreator({
  organization,
  onBack,
  onCreate,
  onSuccess,
  isCreating = false,
  className
}: OAuth2ProjectCreatorProps) {
  const [formData, setFormData] = useState<CreateSupabaseProjectRequest>({
    organization_id: organization.id,
    name: '',
    region: 'us-east-1',
    plan: 'free',
    db_pass: ''
  })
  
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showSuccess, setShowSuccess] = useState(false)

  // Generate a secure random password
  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
    let password = ''
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    setFormData(prev => ({ ...prev, db_pass: password }))
    setErrors(prev => ({ ...prev, db_pass: '' }))
  }

  // Validate form data
  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Project name is required'
    } else if (formData.name.length < 3) {
      newErrors.name = 'Project name must be at least 3 characters'
    } else if (!/^[a-zA-Z0-9-_]+$/.test(formData.name)) {
      newErrors.name = 'Project name can only contain letters, numbers, hyphens, and underscores'
    }

    if (!formData.region) {
      newErrors.region = 'Region is required'
    }

    if (!formData.plan) {
      newErrors.plan = 'Plan is required'
    }

    if (!formData.db_pass) {
      newErrors.db_pass = 'Database password is required'
    } else if (formData.db_pass.length < 8) {
      newErrors.db_pass = 'Password must be at least 8 characters long'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    try {
      const result = await onCreate(formData)
      
      if (result.success) {
        setShowSuccess(true)
        setTimeout(() => {
          onSuccess()
        }, 2000)
      } else {
        setErrors({ submit: result.error || 'Failed to create project' })
      }
    } catch (error) {
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to create project' })
    }
  }

  if (showSuccess) {
    return (
      <div className={cn("space-y-6 text-center", className)}>
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-green-500" />
        </div>
        
        <div>
          <h3 className="text-lg font-semibold text-green-600 mb-2">Project Created Successfully!</h3>
          <p className="text-sm text-muted-foreground">
            Your new Supabase project "{formData.name}" has been created and is being set up.
          </p>
        </div>
        
        <div className="animate-pulse">
          <p className="text-xs text-muted-foreground">Redirecting to project selection...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn("space-y-6", className)}>
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Create New Project</h3>
        <p className="text-sm text-muted-foreground">
          Create a new Supabase project in <span className="font-medium">{organization.name}</span>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Project Name */}
        <div className="space-y-2">
          <Label htmlFor="project-name">
            Project Name
            <span className="text-red-500 ml-1">*</span>
          </Label>
          <Input
            id="project-name"
            placeholder="my-awesome-project"
            value={formData.name}
            onChange={(e) => {
              setFormData(prev => ({ ...prev, name: e.target.value }))
              setErrors(prev => ({ ...prev, name: '' }))
            }}
            className={errors.name ? 'border-red-500' : ''}
            disabled={isCreating}
          />
          {errors.name && (
            <p className="text-xs text-red-500">{errors.name}</p>
          )}
          <p className="text-xs text-muted-foreground">
            This will be used to generate your project URL: {formData.name || 'project-name'}.supabase.co
          </p>
        </div>

        {/* Region Selection */}
        <div className="space-y-2">
          <Label htmlFor="region">
            Region
            <span className="text-red-500 ml-1">*</span>
          </Label>
          <Select
            value={formData.region}
            onValueChange={(value) => {
              setFormData(prev => ({ ...prev, region: value }))
              setErrors(prev => ({ ...prev, region: '' }))
            }}
            disabled={isCreating}
          >
            <SelectTrigger className={errors.region ? 'border-red-500' : ''}>
              <SelectValue placeholder="Select a region" />
            </SelectTrigger>
            <SelectContent>
              {SUPABASE_REGIONS.map((region) => (
                <SelectItem key={region.value} value={region.value}>
                  <div className="flex items-center gap-2">
                    <span>{region.flag}</span>
                    <span>{region.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.region && (
            <p className="text-xs text-red-500">{errors.region}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Choose the region closest to your users for better performance
          </p>
        </div>

        {/* Plan Selection */}
        <div className="space-y-2">
          <Label>
            Plan
            <span className="text-red-500 ml-1">*</span>
          </Label>
          <div className="grid gap-3">
            {SUPABASE_PLANS.map((plan) => (
              <Card
                key={plan.value}
                className={cn(
                  "cursor-pointer transition-all duration-200",
                  formData.plan === plan.value && "ring-2 ring-primary border-primary",
                  isCreating && "opacity-50 cursor-not-allowed"
                )}
                onClick={() => !isCreating && setFormData(prev => ({ ...prev, plan: plan.value }))}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium text-sm">{plan.label}</h4>
                        {plan.badge && (
                          <Badge variant="secondary" className="text-xs">
                            {plan.badge}
                          </Badge>
                        )}
                        {plan.price && (
                          <Badge variant="outline" className="text-xs">
                            {plan.price}
                          </Badge>
                        )}
                        {formData.plan === plan.value && (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">
                        {plan.description}
                      </p>
                      <div className="space-y-1">
                        {plan.features.slice(0, 2).map((feature, index) => (
                          <p key={index} className="text-xs text-muted-foreground flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            {feature}
                          </p>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {errors.plan && (
            <p className="text-xs text-red-500">{errors.plan}</p>
          )}
        </div>

        {/* Database Password */}
        <div className="space-y-2">
          <Label htmlFor="db-password">
            Database Password
            <span className="text-red-500 ml-1">*</span>
          </Label>
          <div className="flex gap-2">
            <Input
              id="db-password"
              type="password"
              placeholder="Enter a secure password"
              value={formData.db_pass}
              onChange={(e) => {
                setFormData(prev => ({ ...prev, db_pass: e.target.value }))
                setErrors(prev => ({ ...prev, db_pass: '' }))
              }}
              className={cn("flex-1", errors.db_pass ? 'border-red-500' : '')}
              disabled={isCreating}
            />
            <Button
              type="button"
              variant="outline"
              onClick={generatePassword}
              disabled={isCreating}
            >
              Generate
            </Button>
          </div>
          {errors.db_pass && (
            <p className="text-xs text-red-500">{errors.db_pass}</p>
          )}
          <p className="text-xs text-muted-foreground">
            This password will be used to access your database directly
          </p>
        </div>

        {/* Submit Error */}
        {errors.submit && (
          <Alert variant="destructive">
            <AlertDescription>{errors.submit}</AlertDescription>
          </Alert>
        )}

        {/* Creation Info */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Project creation typically takes 30-60 seconds. You'll be redirected once it's ready.
          </AlertDescription>
        </Alert>

        {/* Form Actions */}
        <div className="flex justify-between items-center pt-4">
          <Button type="button" variant="outline" onClick={onBack} disabled={isCreating}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          <Button type="submit" disabled={isCreating} className="min-w-32">
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Database className="w-4 h-4 mr-2" />
                Create Project
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}