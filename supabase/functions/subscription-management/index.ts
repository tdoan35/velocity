// Supabase Edge Function for subscription management
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'
import { featureGate } from '../_shared/feature-gate.ts'
import { quotaManager } from '../_shared/quota-manager.ts'

interface SubscriptionRequest {
  action: 'get_current' | 'get_tiers' | 'change_tier' | 'cancel' | 'reactivate' | 'get_history' | 'get_invoice' | 'update_payment'
  tierId?: string
  paymentMethodId?: string
  invoiceId?: string
}

interface SubscriptionResponse {
  action: string
  success: boolean
  data?: any
  message?: string
  nextSteps?: string[]
}

interface TierComparison {
  current: any
  target: any
  changes: {
    tokens: { before: number; after: number; change: number }
    requests: { before: number; after: number; change: number }
    features: { added: string[]; removed: string[] }
    price: { before: number; after: number; change: number }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authResult = await requireAuth(req)
    if (!authResult.authorized) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const logger = createLogger({ 
      userId: authResult.userId,
      requestId: crypto.randomUUID()
    })

    const body: SubscriptionRequest = await req.json()
    const { action, tierId, paymentMethodId, invoiceId } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let response: SubscriptionResponse = {
      action,
      success: false
    }

    switch (action) {
      case 'get_current':
        response = await getCurrentSubscription(supabase, authResult.userId)
        break

      case 'get_tiers':
        response = await getAvailableTiers(supabase, authResult.userId)
        break

      case 'change_tier':
        if (!tierId) throw new Error('Tier ID required')
        response = await changeTier(supabase, authResult.userId, tierId, logger)
        break

      case 'cancel':
        response = await cancelSubscription(supabase, authResult.userId, logger)
        break

      case 'reactivate':
        response = await reactivateSubscription(supabase, authResult.userId, logger)
        break

      case 'get_history':
        response = await getSubscriptionHistory(supabase, authResult.userId)
        break

      case 'get_invoice':
        if (!invoiceId) throw new Error('Invoice ID required')
        response = await getInvoice(supabase, authResult.userId, invoiceId)
        break

      case 'update_payment':
        if (!paymentMethodId) throw new Error('Payment method ID required')
        response = await updatePaymentMethod(supabase, authResult.userId, paymentMethodId, logger)
        break

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    await logger.info('Subscription action completed', {
      action,
      success: response.success
    })

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const logger = createLogger({ requestId: crypto.randomUUID() })
    await logger.error('Subscription management error', { error: error.message })
    
    return new Response(JSON.stringify({ 
      error: 'Subscription operation failed',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function getCurrentSubscription(supabase: any, userId: string): Promise<SubscriptionResponse> {
  // Get current subscription
  const { data: subscription, error: subError } = await supabase
    .from('user_subscriptions')
    .select(`
      *,
      subscription_tiers (*)
    `)
    .eq('user_id', userId)
    .single()

  if (subError && subError.code !== 'PGRST116') {
    throw subError
  }

  // Get current usage
  const usage = await quotaManager.getUsageStats(userId)

  // Get available features
  const features = await getEnabledFeatures(userId)

  return {
    action: 'get_current',
    success: true,
    data: {
      subscription: subscription || createDefaultSubscription(userId),
      usage: {
        tokens: usage.currentPeriod.tokens,
        requests: usage.currentPeriod.requests,
        estimatedCost: usage.estimatedCost
      },
      features,
      nextBillingDate: subscription?.current_period_end || null,
      canUpgrade: true,
      canDowngrade: subscription?.subscription_tier !== 'free'
    }
  }
}

async function getAvailableTiers(supabase: any, userId: string): Promise<SubscriptionResponse> {
  // Get all tiers
  const { data: tiers, error } = await supabase
    .from('subscription_tiers')
    .select('*')
    .order('price_monthly', { ascending: true })

  if (error) throw error

  // Get current subscription
  const { data: currentSub } = await supabase
    .from('user_subscriptions')
    .select('subscription_tier')
    .eq('user_id', userId)
    .single()

  const currentTier = currentSub?.subscription_tier || 'free'

  // Enhance tier information
  const enhancedTiers = tiers.map((tier: any) => ({
    ...tier,
    isCurrent: tier.id === currentTier,
    features: Object.entries(tier.features || {})
      .filter(([_, enabled]) => enabled)
      .map(([feature]) => ({
        key: feature,
        name: formatFeatureName(feature),
        description: getFeatureDescription(feature)
      })),
    savings: tier.price_yearly < tier.price_monthly * 12
      ? Math.round((1 - tier.price_yearly / (tier.price_monthly * 12)) * 100)
      : 0
  }))

  return {
    action: 'get_tiers',
    success: true,
    data: {
      tiers: enhancedTiers,
      currentTier,
      recommendations: getRecommendedTier(currentTier, await quotaManager.getUsageStats(userId))
    }
  }
}

async function changeTier(
  supabase: any, 
  userId: string, 
  newTierId: string,
  logger: any
): Promise<SubscriptionResponse> {
  // Validate tier exists
  const { data: newTier, error: tierError } = await supabase
    .from('subscription_tiers')
    .select('*')
    .eq('id', newTierId)
    .single()

  if (tierError || !newTier) {
    throw new Error('Invalid tier')
  }

  // Get current subscription
  const { data: currentSub } = await supabase
    .from('user_subscriptions')
    .select('*, subscription_tiers(*)')
    .eq('user_id', userId)
    .single()

  // Generate comparison
  const comparison = generateTierComparison(
    currentSub?.subscription_tiers || { id: 'free', tokens_per_month: 100000 },
    newTier
  )

  // Check if downgrade with active usage
  if (comparison.changes.tokens.change < 0) {
    const usage = await quotaManager.getUsageStats(userId)
    if (usage.currentPeriod.tokens.used > newTier.tokens_per_month) {
      return {
        action: 'change_tier',
        success: false,
        message: 'Cannot downgrade: Current usage exceeds new tier limits',
        data: {
          currentUsage: usage.currentPeriod.tokens.used,
          newLimit: newTier.tokens_per_month,
          suggestion: 'Wait until next billing period or reduce usage'
        }
      }
    }
  }

  // Update subscription (in production, this would integrate with Stripe)
  const { error: updateError } = await supabase
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      subscription_tier: newTierId,
      status: 'active',
      updated_at: new Date().toISOString()
    })

  if (updateError) throw updateError

  // Log billing event
  await supabase
    .from('billing_events')
    .insert({
      user_id: userId,
      event_type: 'subscription_updated',
      subscription_tier: newTierId,
      previous_tier: currentSub?.subscription_tier || 'free',
      metadata: { comparison }
    })

  await logger.info('Subscription tier changed', {
    userId,
    from: currentSub?.subscription_tier || 'free',
    to: newTierId
  })

  return {
    action: 'change_tier',
    success: true,
    message: `Successfully ${comparison.changes.price.change > 0 ? 'upgraded' : 'changed'} to ${newTier.display_name}`,
    data: {
      newTier,
      comparison,
      effectiveDate: new Date().toISOString()
    },
    nextSteps: [
      'New limits are effective immediately',
      comparison.changes.price.change > 0 ? 'Payment will be processed' : 'Credit will be applied',
      'Review new features available'
    ]
  }
}

async function cancelSubscription(
  supabase: any,
  userId: string,
  logger: any
): Promise<SubscriptionResponse> {
  // Get current subscription
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!subscription || subscription.subscription_tier === 'free') {
    return {
      action: 'cancel',
      success: false,
      message: 'No active paid subscription to cancel'
    }
  }

  // Update subscription status
  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString()
    })
    .eq('user_id', userId)

  if (error) throw error

  // Log billing event
  await supabase
    .from('billing_events')
    .insert({
      user_id: userId,
      event_type: 'subscription_cancelled',
      subscription_tier: subscription.subscription_tier,
      metadata: { reason: 'user_requested' }
    })

  await logger.info('Subscription cancelled', {
    userId,
    tier: subscription.subscription_tier
  })

  return {
    action: 'cancel',
    success: true,
    message: 'Subscription cancelled successfully',
    data: {
      effectiveDate: subscription.current_period_end,
      willRevertTo: 'free',
      dataRetention: '30 days after cancellation'
    },
    nextSteps: [
      'You can continue using your current plan until the end of the billing period',
      'Your account will revert to the free tier after that',
      'You can reactivate anytime before the period ends'
    ]
  }
}

async function reactivateSubscription(
  supabase: any,
  userId: string,
  logger: any
): Promise<SubscriptionResponse> {
  // Get cancelled subscription
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'cancelled')
    .single()

  if (!subscription) {
    return {
      action: 'reactivate',
      success: false,
      message: 'No cancelled subscription found'
    }
  }

  // Check if still within billing period
  const periodEnd = new Date(subscription.current_period_end)
  if (periodEnd < new Date()) {
    return {
      action: 'reactivate',
      success: false,
      message: 'Subscription period has ended. Please choose a new plan.'
    }
  }

  // Reactivate subscription
  const { error } = await supabase
    .from('user_subscriptions')
    .update({
      status: 'active',
      cancelled_at: null
    })
    .eq('user_id', userId)

  if (error) throw error

  await logger.info('Subscription reactivated', {
    userId,
    tier: subscription.subscription_tier
  })

  return {
    action: 'reactivate',
    success: true,
    message: 'Subscription reactivated successfully',
    data: {
      tier: subscription.subscription_tier,
      validUntil: subscription.current_period_end
    }
  }
}

async function getSubscriptionHistory(supabase: any, userId: string): Promise<SubscriptionResponse> {
  // Get billing events
  const { data: events, error } = await supabase
    .from('billing_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) throw error

  // Get invoices (mock data for now)
  const invoices = generateMockInvoices(events)

  // Calculate statistics
  const stats = calculateBillingStats(events)

  return {
    action: 'get_history',
    success: true,
    data: {
      events,
      invoices,
      stats
    }
  }
}

async function getInvoice(
  supabase: any,
  userId: string,
  invoiceId: string
): Promise<SubscriptionResponse> {
  // In production, this would fetch from Stripe
  // For now, return mock invoice
  const invoice = {
    id: invoiceId,
    user_id: userId,
    date: new Date().toISOString(),
    amount: 99.00,
    currency: 'USD',
    status: 'paid',
    items: [
      {
        description: 'Velocity Pro - Monthly',
        quantity: 1,
        amount: 99.00
      }
    ],
    tax: 0,
    total: 99.00
  }

  return {
    action: 'get_invoice',
    success: true,
    data: invoice
  }
}

async function updatePaymentMethod(
  supabase: any,
  userId: string,
  paymentMethodId: string,
  logger: any
): Promise<SubscriptionResponse> {
  // In production, this would update Stripe payment method
  // For now, just log the intent
  await logger.info('Payment method update requested', {
    userId,
    paymentMethodId
  })

  return {
    action: 'update_payment',
    success: true,
    message: 'Payment method updated successfully',
    data: {
      last4: '4242',
      brand: 'Visa',
      expiryMonth: 12,
      expiryYear: 2025
    }
  }
}

// Helper functions

function createDefaultSubscription(userId: string): any {
  return {
    user_id: userId,
    subscription_tier: 'free',
    status: 'active',
    subscription_tiers: {
      id: 'free',
      name: 'free',
      display_name: 'Free',
      tokens_per_month: 100000,
      requests_per_month: 100,
      price_monthly: 0,
      features: {
        code_generation: true,
        basic_components: true,
        preview: true
      }
    }
  }
}

async function getEnabledFeatures(userId: string): Promise<string[]> {
  const features = [
    'code_generation',
    'basic_components',
    'advanced_components',
    'code_optimization',
    'quality_analysis',
    'team_collaboration',
    'custom_ai_models',
    'priority_generation',
    'export_production',
    'advanced_analytics',
    'white_label'
  ]

  const enabledFeatures = []
  
  for (const feature of features) {
    const hasAccess = await featureGate.check(userId, feature)
    if (hasAccess.allowed) {
      enabledFeatures.push(feature)
    }
  }

  return enabledFeatures
}

function formatFeatureName(feature: string): string {
  return feature
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getFeatureDescription(feature: string): string {
  const descriptions: Record<string, string> = {
    code_generation: 'AI-powered React Native code generation',
    basic_components: 'Generate standard UI components',
    advanced_components: 'Complex components with animations',
    code_optimization: 'Automatic code quality improvements',
    quality_analysis: 'Deep code analysis and security scanning',
    team_collaboration: 'Share projects with team members',
    custom_ai_models: 'Use custom-trained AI models',
    priority_generation: 'Skip the queue during high load',
    export_production: 'Export production-ready applications',
    advanced_analytics: 'Detailed usage and performance metrics',
    white_label: 'Remove Velocity branding'
  }
  
  return descriptions[feature] || feature
}

function generateTierComparison(currentTier: any, newTier: any): TierComparison {
  const currentFeatures = Object.keys(currentTier.features || {}).filter(k => currentTier.features[k])
  const newFeatures = Object.keys(newTier.features || {}).filter(k => newTier.features[k])
  
  const addedFeatures = newFeatures.filter(f => !currentFeatures.includes(f))
  const removedFeatures = currentFeatures.filter(f => !newFeatures.includes(f))

  return {
    current: currentTier,
    target: newTier,
    changes: {
      tokens: {
        before: currentTier.tokens_per_month || 0,
        after: newTier.tokens_per_month || 0,
        change: (newTier.tokens_per_month || 0) - (currentTier.tokens_per_month || 0)
      },
      requests: {
        before: currentTier.requests_per_month || 0,
        after: newTier.requests_per_month || 0,
        change: (newTier.requests_per_month || 0) - (currentTier.requests_per_month || 0)
      },
      features: {
        added: addedFeatures,
        removed: removedFeatures
      },
      price: {
        before: currentTier.price_monthly || 0,
        after: newTier.price_monthly || 0,
        change: (newTier.price_monthly || 0) - (currentTier.price_monthly || 0)
      }
    }
  }
}

function getRecommendedTier(currentTier: string, usage: any): string | null {
  const tokenUsage = usage.currentPeriod.tokens.percentUsed
  const requestUsage = usage.currentPeriod.requests.percentUsed

  if (currentTier === 'free' && (tokenUsage > 80 || requestUsage > 80)) {
    return 'starter'
  }
  
  if (currentTier === 'starter' && (tokenUsage > 90 || requestUsage > 90)) {
    return 'pro'
  }

  if (currentTier === 'pro' && (tokenUsage > 95 || requestUsage > 95)) {
    return 'enterprise'
  }

  return null
}

function generateMockInvoices(events: any[]): any[] {
  // Generate mock invoices from billing events
  return events
    .filter(e => e.event_type === 'payment_succeeded')
    .map(e => ({
      id: `inv_${e.id}`,
      date: e.created_at,
      amount: e.amount || 0,
      status: 'paid',
      tier: e.subscription_tier
    }))
}

function calculateBillingStats(events: any[]): any {
  const payments = events.filter(e => e.event_type === 'payment_succeeded')
  const totalSpent = payments.reduce((sum, p) => sum + (p.amount || 0), 0)
  
  return {
    totalSpent,
    averageMonthly: payments.length > 0 ? totalSpent / payments.length : 0,
    subscriptionChanges: events.filter(e => e.event_type === 'subscription_updated').length,
    paymentMethods: 1
  }
}