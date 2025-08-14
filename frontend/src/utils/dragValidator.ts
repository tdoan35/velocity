/**
 * Comprehensive validation utilities for drag and drop system
 * Used for testing and debugging the implementation
 */

import { useDragStore } from '@/stores/dragStateStore'
import { dragLogger } from '@/utils/dragLogger'

export interface ValidationResult {
  isValid: boolean
  errors: string[]
  warnings: string[]
  info: string[]
}

export interface DragSystemHealth {
  state: ValidationResult
  dom: ValidationResult
  performance: ValidationResult
  overall: 'healthy' | 'warning' | 'error'
}

export class DragValidator {
  
  /**
   * Validate the current drag state
   */
  static validateDragState(): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      info: []
    }

    const state = useDragStore.getState()

    // Check for consistent state
    if (state.type === 'section') {
      if (!state.draggedSectionId) {
        result.errors.push('Section drag type set but no draggedSectionId')
        result.isValid = false
      }
      if (state.draggedContentId) {
        result.errors.push('Section drag active but draggedContentId is set')
        result.isValid = false
      }
    }

    if (state.type === 'content') {
      if (!state.draggedContentId) {
        result.errors.push('Content drag type set but no draggedContentId')
        result.isValid = false
      }
      if (!state.sourceContainer) {
        result.errors.push('Content drag active but no sourceContainer')
        result.isValid = false
      }
      if (state.draggedSectionId) {
        result.errors.push('Content drag active but draggedSectionId is set')
        result.isValid = false
      }
    }

    if (state.type === 'none') {
      if (state.draggedSectionId || state.draggedContentId || state.sourceContainer) {
        result.warnings.push('Drag type is none but other drag properties are set')
      }
      if (state.dropIndicatorIndex !== null || state.dropIndicatorType !== null) {
        result.warnings.push('Drag type is none but drop indicators are active')
      }
    }

    // Check drop indicator consistency
    if (state.dropIndicatorIndex !== null && state.dropIndicatorType === null) {
      result.errors.push('Drop indicator index set but type is null')
      result.isValid = false
    }

    if (state.dropIndicatorType !== null && state.dropIndicatorIndex === null) {
      result.errors.push('Drop indicator type set but index is null')
      result.isValid = false
    }

    // Performance checks
    const performanceStats = dragLogger.getPerformanceStats()
    
    result.info.push(`Drag state: ${state.type}`)
    if (typeof performanceStats === 'object' && 'totalOperations' in performanceStats) {
      result.info.push(`Performance: ${performanceStats.totalOperations} ops, ${performanceStats.successRate} success rate`)
    }

    return result
  }

  /**
   * Validate DOM state for drag elements
   */
  static validateDOMState(): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      info: []
    }

    // Check for required drag zone elements
    const sectionDropZones = document.querySelectorAll('.section-drop-zone')
    const contentDropZones = document.querySelectorAll('.content-drop-zone')
    const draggableSections = document.querySelectorAll('[data-section-id]')

    result.info.push(`Found ${sectionDropZones.length} section drop zones`)
    result.info.push(`Found ${contentDropZones.length} content drop zones`)
    result.info.push(`Found ${draggableSections.length} draggable sections`)

    // Check for orphaned drag indicators
    const activeIndicators = document.querySelectorAll('.section-drop-indicator-active')
    const state = useDragStore.getState()
    
    if (activeIndicators.length > 0 && state.type === 'none') {
      result.warnings.push('Active drop indicators found but no drag in progress')
    }

    // Check for dragging class consistency
    const draggingElements = document.querySelectorAll('.dragging-section, .dragging-content')
    if (draggingElements.length > 0 && state.type === 'none') {
      result.warnings.push('Elements with dragging classes found but no drag in progress')
    }

    // Check for missing required attributes
    draggableSections.forEach((element, index) => {
      const sectionId = element.getAttribute('data-section-id')
      const sectionType = element.getAttribute('data-section-type')
      if (!sectionId) {
        result.errors.push(`Draggable section ${index} missing data-section-id attribute`)
        result.isValid = false
      }
      if (!sectionType) {
        result.warnings.push(`Draggable section ${index} missing data-section-type attribute`)
      }
    })

    return result
  }

  /**
   * Validate performance metrics
   */
  static validatePerformance(): ValidationResult {
    const result: ValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      info: []
    }

    const performanceStats = dragLogger.getPerformanceStats()
    
    if (typeof performanceStats === 'object' && 'averageDuration' in performanceStats) {
      const avgDuration = parseInt(performanceStats.averageDuration || '0')
      
      if (avgDuration > 1000) {
        result.errors.push(`Average drag duration too high: ${performanceStats.averageDuration}`)
        result.isValid = false
      } else if (avgDuration > 500) {
        result.warnings.push(`Average drag duration concerning: ${performanceStats.averageDuration}`)
      }

      const successRate = parseFloat(performanceStats.successRate || '0')
      if (successRate < 90) {
        result.errors.push(`Success rate too low: ${performanceStats.successRate}`)
        result.isValid = false
      } else if (successRate < 95) {
        result.warnings.push(`Success rate could be better: ${performanceStats.successRate}`)
      }

      result.info.push(`Performance stats: ${JSON.stringify(performanceStats)}`)
    } else {
      result.info.push('No performance data available yet')
    }

    return result
  }

  /**
   * Comprehensive system health check
   */
  static checkSystemHealth(): DragSystemHealth {
    const state = this.validateDragState()
    const dom = this.validateDOMState()
    const performance = this.validatePerformance()

    let overall: 'healthy' | 'warning' | 'error' = 'healthy'

    if (state.errors.length > 0 || dom.errors.length > 0 || performance.errors.length > 0) {
      overall = 'error'
    } else if (state.warnings.length > 0 || dom.warnings.length > 0 || performance.warnings.length > 0) {
      overall = 'warning'
    }

    return {
      state,
      dom,
      performance,
      overall
    }
  }

  /**
   * Run automated tests on the drag system
   */
  static runTests(): { passed: number; failed: number; results: Array<{test: string; passed: boolean; message: string}> } {
    const tests = []
    let passed = 0
    let failed = 0

    // Test 1: Initial state should be clean
    const initialState = useDragStore.getState()
    const test1Passed = initialState.type === 'none' && 
                      initialState.draggedSectionId === null && 
                      initialState.draggedContentId === null
    tests.push({
      test: 'Initial drag state is clean',
      passed: test1Passed,
      message: test1Passed ? 'Pass' : `Initial state not clean: ${JSON.stringify(initialState)}`
    })
    if (test1Passed) passed++; else failed++

    // Test 2: DOM elements are present
    const sectionDropZones = document.querySelectorAll('.section-drop-zone')
    const test2Passed = sectionDropZones.length > 0
    tests.push({
      test: 'Section drop zones exist in DOM',
      passed: test2Passed,
      message: test2Passed ? `Found ${sectionDropZones.length} drop zones` : 'No section drop zones found'
    })
    if (test2Passed) passed++; else failed++

    // Test 3: Draggable sections have required attributes
    const draggableSections = document.querySelectorAll('[data-section-id]')
    const test3Passed = Array.from(draggableSections).every(el => 
      el.getAttribute('data-section-id') && 
      el.getAttribute('data-section-type')
    )
    tests.push({
      test: 'Draggable sections have required attributes',
      passed: test3Passed,
      message: test3Passed ? `All ${draggableSections.length} sections have attributes` : 'Some sections missing attributes'
    })
    if (test3Passed) passed++; else failed++

    // Test 4: No orphaned CSS classes
    const orphanedClasses = document.querySelectorAll('.dragging-section, .dragging-content, .section-drop-indicator-active')
    const test4Passed = orphanedClasses.length === 0 || initialState.type !== 'none'
    tests.push({
      test: 'No orphaned drag CSS classes',
      passed: test4Passed,
      message: test4Passed ? 'No orphaned classes' : `Found ${orphanedClasses.length} orphaned drag classes`
    })
    if (test4Passed) passed++; else failed++

    return { passed, failed, results: tests }
  }

  /**
   * Generate a comprehensive diagnostic report
   */
  static generateDiagnosticReport(): string {
    const health = this.checkSystemHealth()
    const tests = this.runTests()
    const timestamp = new Date().toISOString()

    return `
# Drag & Drop System Diagnostic Report
Generated: ${timestamp}

## Overall Health: ${health.overall.toUpperCase()}

## System Tests
✅ Passed: ${tests.passed}
❌ Failed: ${tests.failed}

${tests.results.map(test => 
  `${test.passed ? '✅' : '❌'} ${test.test}: ${test.message}`
).join('\n')}

## State Validation
${health.state.errors.length > 0 ? `❌ Errors:\n${health.state.errors.map(e => `  - ${e}`).join('\n')}` : '✅ No state errors'}
${health.state.warnings.length > 0 ? `⚠️ Warnings:\n${health.state.warnings.map(w => `  - ${w}`).join('\n')}` : ''}

## DOM Validation  
${health.dom.errors.length > 0 ? `❌ Errors:\n${health.dom.errors.map(e => `  - ${e}`).join('\n')}` : '✅ No DOM errors'}
${health.dom.warnings.length > 0 ? `⚠️ Warnings:\n${health.dom.warnings.map(w => `  - ${w}`).join('\n')}` : ''}

## Performance Validation
${health.performance.errors.length > 0 ? `❌ Errors:\n${health.performance.errors.map(e => `  - ${e}`).join('\n')}` : '✅ No performance errors'}
${health.performance.warnings.length > 0 ? `⚠️ Warnings:\n${health.performance.warnings.map(w => `  - ${w}`).join('\n')}` : ''}

## Debug Information
${[...health.state.info, ...health.dom.info, ...health.performance.info].map(i => `- ${i}`).join('\n')}

## Recent Drag Events
${dragLogger.getRecentEvents(5).map(event => 
  `${new Date(event.timestamp).toLocaleTimeString()} - ${event.type}: ${event.dragType} (${event.sourceId}${event.targetId ? ` → ${event.targetId}` : ''})`
).join('\n')}
    `.trim()
  }
}

// Expose validator to window for debugging
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  (window as any).dragValidator = DragValidator
}

export default DragValidator