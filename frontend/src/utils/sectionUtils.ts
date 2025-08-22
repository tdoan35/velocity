/**
 * Utility functions for section management and content validation
 */

/**
 * Enhanced template content detection for preventing premature auto-saves
 */
export function isTemplateOrEmptyContent(content: { html: string; text: string }): boolean {
  if (!content || (!content.html && !content.text)) {
    return true
  }
  
  const html = content.html || ''
  const text = content.text || ''
  
  // Check for template placeholder text
  if (html.includes('Start writing') || 
      text.includes('Start writing') ||
      html.includes('template-placeholder')) {
    return true
  }
  
  // Check for empty or minimal content
  if (text.trim().length < 10) {
    return true
  }
  
  // Check for empty HTML structures
  if (html === '<p></p>' || 
      html === '<p><br></p>' || 
      html === '<p>&nbsp;</p>' ||
      html.trim() === '' ||
      html === '<div></div>') {
    return true
  }
  
  // Check for only whitespace content
  const cleanText = text.replace(/\s+/g, ' ').trim()
  if (cleanText.length < 5) {
    return true
  }
  
  return false
}

/**
 * Check if a section is newly created (within the last 30 seconds)
 * Now tracks creation time separately since we use stable UUIDs
 */
const sectionCreationTimes = new Map<string, number>()

export function markSectionAsNewlyCreated(sectionId: string): void {
  sectionCreationTimes.set(sectionId, Date.now())
}

export function isNewlyCreatedSection(sectionId: string): boolean {
  const creationTime = sectionCreationTimes.get(sectionId)
  if (!creationTime) {
    return false
  }
  
  const ageMs = Date.now() - creationTime
  const isNew = ageMs < 30000 // 30 seconds
  
  // Clean up old entries
  if (!isNew) {
    sectionCreationTimes.delete(sectionId)
  }
  
  return isNew
}

/**
 * Determine appropriate auto-save delay based on section characteristics
 */
export function getAutoSaveDelay(sectionId: string, content: { html: string; text: string }): number {
  const isNew = isNewlyCreatedSection(sectionId)
  const hasSubstantialContent = content.text?.trim().length > 50
  
  if (isNew) {
    return hasSubstantialContent ? 3000 : 5000 // 3-5 seconds for new sections
  }
  
  return hasSubstantialContent ? 1000 : 2000 // 1-2 seconds for existing sections
}

/**
 * Generate a unique section ID using UUID format that's compatible with backend
 * This ensures the ID remains consistent between optimistic and backend sections
 */
export function generateSectionId(): string {
  // Use crypto.randomUUID if available (modern browsers), otherwise fallback
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  
  // Fallback UUID v4 generation for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}