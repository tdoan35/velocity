import { useEffect, useRef, useCallback, useState } from 'react'
import { debounce } from 'lodash'
import { type PRDSection } from './usePRDSections'
import { TransactionManager, TransactionQueue } from '../utils/transactionManager'

// Auto-save configuration
export interface AutoSaveConfig {
  enabled: boolean
  debounceMs: number
  maxRetries: number
  retryDelayMs: number
  validateBeforeSave: boolean
  conflictResolution: 'client_wins' | 'server_wins' | 'merge' | 'manual'
}

// Save status
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'conflict'

// Save result
export interface SaveResult {
  success: boolean
  error?: Error
  conflictResolved?: boolean
  version?: number
}

// Integrity check result
export interface IntegrityCheckResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  duplicates: string[]
  missingRequired: string[]
}

// Section validator
export interface SectionValidator {
  validateSection(section: PRDSection): string[]
  validateAllSections(sections: PRDSection[]): IntegrityCheckResult
}

// Default section validator
export class DefaultSectionValidator implements SectionValidator {
  private requiredSections = new Set(['overview', 'core_features'])
  
  validateSection(section: PRDSection): string[] {
    const errors: string[] = []
    
    // Check for ID
    if (!section.id) {
      errors.push('Section missing ID')
    }
    
    // Check for title
    if (!section.title || section.title.trim().length === 0) {
      errors.push('Section missing title')
    }
    
    // Check for valid order
    if (section.order < 1) {
      errors.push('Section has invalid order')
    }
    
    // Check content
    if (!section.content || !section.content.content || section.content.content.length === 0) {
      if (section.required) {
        errors.push('Required section has no content')
      }
    }
    
    // Check for valid status
    const validStatuses = ['pending', 'in_progress', 'completed', 'review']
    if (!validStatuses.includes(section.status)) {
      errors.push(`Invalid status: ${section.status}`)
    }
    
    return errors
  }
  
  validateAllSections(sections: PRDSection[]): IntegrityCheckResult {
    const result: IntegrityCheckResult = {
      isValid: true,
      errors: [],
      warnings: [],
      duplicates: [],
      missingRequired: []
    }
    
    // Check for duplicates
    const seenIds = new Set<string>()
    const seenTitles = new Map<string, number>()
    const seenOrders = new Map<number, string>()
    
    sections.forEach(section => {
      // Check for duplicate IDs
      if (seenIds.has(section.id)) {
        result.duplicates.push(section.id)
        result.errors.push(`Duplicate section ID: ${section.id}`)
        result.isValid = false
      }
      seenIds.add(section.id)
      
      // Check for duplicate titles (warning only)
      const titleCount = seenTitles.get(section.title) || 0
      if (titleCount > 0) {
        result.warnings.push(`Duplicate section title: ${section.title}`)
      }
      seenTitles.set(section.title, titleCount + 1)
      
      // Check for duplicate orders
      const existingSection = seenOrders.get(section.order)
      if (existingSection) {
        result.errors.push(`Sections "${existingSection}" and "${section.title}" have the same order: ${section.order}`)
        result.isValid = false
      }
      seenOrders.set(section.order, section.title)
      
      // Validate individual section
      const sectionErrors = this.validateSection(section)
      if (sectionErrors.length > 0) {
        result.errors.push(`Section "${section.title}": ${sectionErrors.join(', ')}`)
        result.isValid = false
      }
    })
    
    // Check for missing required sections
    const sectionTypes = new Set(sections.map(s => s.type))
    this.requiredSections.forEach(required => {
      if (!sectionTypes.has(required)) {
        result.missingRequired.push(required)
        result.warnings.push(`Missing required section: ${required}`)
      }
    })
    
    // Check for order gaps
    const orders = sections.map(s => s.order).sort((a, b) => a - b)
    for (let i = 0; i < orders.length - 1; i++) {
      if (orders[i + 1] - orders[i] > 1) {
        result.warnings.push(`Gap in section ordering between ${orders[i]} and ${orders[i + 1]}`)
      }
    }
    
    return result
  }
}

// Auto-save hook
export function useAutoSave(
  sections: PRDSection[],
  saveFn: (sections: PRDSection[]) => Promise<SaveResult>,
  config: Partial<AutoSaveConfig> = {}
) {
  // Merge with default config
  const finalConfig: AutoSaveConfig = {
    enabled: true,
    debounceMs: 1500,
    maxRetries: 3,
    retryDelayMs: 1000,
    validateBeforeSave: true,
    conflictResolution: 'client_wins',
    ...config
  }
  
  // State
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null)
  const [saveError, setSaveError] = useState<Error | null>(null)
  const [integrityErrors, setIntegrityErrors] = useState<string[]>([])
  
  // Refs
  const transactionManager = useRef(new TransactionManager(1, finalConfig.conflictResolution))
  const transactionQueue = useRef(new TransactionQueue(finalConfig.maxRetries, finalConfig.retryDelayMs))
  const validator = useRef<SectionValidator>(new DefaultSectionValidator())
  const lastSavedSections = useRef<PRDSection[]>([])
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Check if sections have changed
  const hasChanges = useCallback(() => {
    if (lastSavedSections.current.length !== sections.length) {
      return true
    }
    
    // Deep comparison of sections
    return JSON.stringify(sections) !== JSON.stringify(lastSavedSections.current)
  }, [sections])
  
  // Validate sections before save
  const validateSections = useCallback((): IntegrityCheckResult => {
    return validator.current.validateAllSections(sections)
  }, [sections])
  
  // Remove duplicate sections
  const removeDuplicates = useCallback((sectionsToClean: PRDSection[]): PRDSection[] => {
    const seen = new Set<string>()
    const cleaned: PRDSection[] = []
    
    for (const section of sectionsToClean) {
      if (!seen.has(section.id)) {
        seen.add(section.id)
        cleaned.push(section)
      }
    }
    
    // Re-order sections to ensure continuous ordering
    return cleaned.map((section, index) => ({
      ...section,
      order: index + 1
    }))
  }, [])
  
  // Perform save with integrity checks
  const performSave = useCallback(async () => {
    if (!finalConfig.enabled || !hasChanges()) {
      return
    }
    
    setSaveStatus('saving')
    setSaveError(null)
    setIntegrityErrors([])
    
    try {
      let sectionsToSave = [...sections]
      
      // Validate if required
      if (finalConfig.validateBeforeSave) {
        const validation = validateSections()
        
        if (!validation.isValid) {
          // Try to fix duplicates automatically
          if (validation.duplicates.length > 0) {
            console.log('Auto-fixing duplicate sections...')
            sectionsToSave = removeDuplicates(sectionsToSave)
            
            // Re-validate after cleanup
            const revalidation = validator.current.validateAllSections(sectionsToSave)
            if (!revalidation.isValid) {
              throw new Error(`Validation failed: ${revalidation.errors.join(', ')}`)
            }
          } else {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`)
          }
        }
        
        // Store warnings for display
        if (validation.warnings.length > 0) {
          setIntegrityErrors(validation.warnings)
        }
      }
      
      // Create transaction
      const transactionId = transactionManager.current.beginTransaction()
      
      // Add save operation to transaction
      transactionManager.current.addOperation(transactionId, {
        type: 'update',
        data: sectionsToSave
      })
      
      // Commit transaction through queue
      await transactionQueue.current.enqueue(async () => {
        const result = await saveFn(sectionsToSave)
        
        if (!result.success) {
          throw result.error || new Error('Save failed')
        }
        
        // Commit the transaction
        await transactionManager.current.commitTransaction(
          transactionId,
          async () => {
            // Transaction committed successfully
            lastSavedSections.current = sectionsToSave
            setLastSaveTime(Date.now())
            setSaveStatus('saved')
          }
        )
      })
      
    } catch (error) {
      console.error('Auto-save failed:', error)
      setSaveError(error as Error)
      setSaveStatus('error')
    }
  }, [sections, finalConfig, hasChanges, validateSections, removeDuplicates, saveFn])
  
  // Debounced save function
  const debouncedSave = useCallback(
    debounce(performSave, finalConfig.debounceMs),
    [performSave, finalConfig.debounceMs]
  )
  
  // Trigger auto-save when sections change
  useEffect(() => {
    if (finalConfig.enabled && hasChanges()) {
      // Clear any existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      
      // Set status to indicate pending save
      if (saveStatus === 'saved' || saveStatus === 'idle') {
        setSaveStatus('idle')
      }
      
      // Trigger debounced save
      debouncedSave()
    }
  }, [sections, finalConfig.enabled, hasChanges, debouncedSave, saveStatus])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel()
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [debouncedSave])
  
  // Manual save trigger
  const saveNow = useCallback(async () => {
    // Cancel any pending debounced save
    debouncedSave.cancel()
    
    // Perform save immediately
    await performSave()
  }, [debouncedSave, performSave])
  
  // Get transaction log
  const getTransactionLog = useCallback((limit?: number) => {
    return transactionManager.current.getTransactionLog(limit)
  }, [])
  
  // Get version info
  const getVersionInfo = useCallback(() => {
    return transactionManager.current.getVersionInfo()
  }, [])
  
  // Reset auto-save state
  const reset = useCallback(() => {
    setSaveStatus('idle')
    setLastSaveTime(null)
    setSaveError(null)
    setIntegrityErrors([])
    lastSavedSections.current = []
    transactionManager.current.reset()
    transactionQueue.current.clear()
  }, [])
  
  return {
    // Status
    saveStatus,
    lastSaveTime,
    saveError,
    integrityErrors,
    hasChanges: hasChanges(),
    
    // Actions
    saveNow,
    reset,
    
    // Utilities
    validateSections,
    removeDuplicates,
    getTransactionLog,
    getVersionInfo,
    
    // Queue info
    queueSize: transactionQueue.current.getQueueSize(),
    isProcessing: transactionQueue.current.isProcessing()
  }
}