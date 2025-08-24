/**
 * Connection Method Selector Component
 * Allows users to choose between Direct and OAuth2 connection methods
 */

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  Database,
  Link2,
  Shield,
  Zap,
  CheckCircle2,
  Info
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type ConnectionMethod = 'direct' | 'oauth'

export interface ConnectionMethodSelectorProps {
  selectedMethod: ConnectionMethod | null
  onMethodChange: (method: ConnectionMethod) => void
  isOAuth2Available: boolean
  className?: string
  disabled?: boolean
}

export function ConnectionMethodSelector({
  selectedMethod,
  onMethodChange,
  isOAuth2Available,
  className,
  disabled = false
}: ConnectionMethodSelectorProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold mb-2">Choose Connection Method</h3>
        <p className="text-sm text-muted-foreground">
          Select how you want to connect your Supabase project to Velocity
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Direct Connection Method */}
        <Card 
          className={cn(
            "relative cursor-pointer transition-all duration-200 hover:shadow-md",
            selectedMethod === 'direct' && "ring-2 ring-primary border-primary",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onClick={() => !disabled && onMethodChange('direct')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <Database className="w-4 h-4 text-blue-500" />
                </div>
                <CardTitle className="text-base">Direct Connection</CardTitle>
              </div>
              {selectedMethod === 'direct' && (
                <CheckCircle2 className="w-5 h-5 text-primary" />
              )}
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-4">
              Connect using your Supabase project URL and anon key directly
            </p>
            
            {/* Benefits */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="w-3 h-3 text-green-500" />
                <span>Quick setup</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="w-3 h-3 text-green-500" />
                <span>Full control over credentials</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="w-3 h-3 text-green-500" />
                <span>Works with any Supabase project</span>
              </div>
            </div>
            
            <Badge variant="secondary" className="mt-3 text-xs">
              Recommended
            </Badge>
          </CardContent>
        </Card>

        {/* OAuth2 Connection Method */}
        <Card 
          className={cn(
            "relative cursor-pointer transition-all duration-200",
            isOAuth2Available && "hover:shadow-md",
            selectedMethod === 'oauth' && "ring-2 ring-primary border-primary",
            !isOAuth2Available && "opacity-60 cursor-not-allowed bg-muted/30",
            disabled && "opacity-50 cursor-not-allowed"
          )}
          onClick={() => !disabled && isOAuth2Available && onMethodChange('oauth')}
        >
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                  <Link2 className="w-4 h-4 text-purple-500" />
                </div>
                <CardTitle className="text-base">OAuth2 Integration</CardTitle>
              </div>
              {selectedMethod === 'oauth' && (
                <CheckCircle2 className="w-5 h-5 text-primary" />
              )}
            </div>
          </CardHeader>
          
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-4">
              Connect through Supabase OAuth2 and manage projects via Management API
            </p>
            
            {/* Benefits */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="w-3 h-3 text-purple-500" />
                <span>Secure OAuth2 authorization</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Zap className="w-3 h-3 text-purple-500" />
                <span>Create projects directly</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Database className="w-3 h-3 text-purple-500" />
                <span>Manage multiple organizations</span>
              </div>
            </div>
            
            {isOAuth2Available ? (
              <Badge variant="outline" className="mt-3 text-xs border-purple-200 text-purple-600">
                Advanced
              </Badge>
            ) : (
              <div className="mt-3 flex items-center gap-1">
                <Badge variant="outline" className="text-xs border-orange-200 text-orange-600">
                  <Info className="w-3 h-3 mr-1" />
                  Not Available
                </Badge>
              </div>
            )}
            
            {!isOAuth2Available && (
              <p className="text-xs text-muted-foreground mt-2">
                OAuth2 is not configured for this environment
              </p>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Continue Button */}
      <div className="flex justify-center pt-4">
        <Button 
          onClick={() => selectedMethod && onMethodChange(selectedMethod)}
          disabled={disabled || !selectedMethod}
          className="min-w-32"
        >
          {selectedMethod ? 'Continue' : 'Select a Method'}
        </Button>
      </div>
      
      {/* Help Text */}
      <div className="text-center">
        <p className="text-xs text-muted-foreground">
          You can change this later in your project settings
        </p>
      </div>
    </div>
  )
}