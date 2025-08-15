/**
 * Utility functions for the Virtual Block System
 */

import { BlockType } from './types';
import type { VirtualContentBlock, ParseOptions } from './types';

/**
 * Generate a unique ID for a block based on position and content
 */
export function generateBlockId(position: number, content: string, depth: number = 0): string {
  const hash = hashString(content);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  return `block-${position}-${hash}-${depth}-${timestamp}-${random}`;
}

/**
 * Simple hash function for content-based ID generation
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Map HTML tag names to BlockType enum
 */
export function getBlockTypeFromTag(tagName: string): BlockType {
  const tagMap: Record<string, BlockType> = {
    'p': BlockType.PARAGRAPH,
    'h1': BlockType.HEADING_1,
    'h2': BlockType.HEADING_2,
    'h3': BlockType.HEADING_3,
    'h4': BlockType.HEADING_4,
    'h5': BlockType.HEADING_5,
    'h6': BlockType.HEADING_6,
    'ul': BlockType.BULLET_LIST,
    'ol': BlockType.NUMBERED_LIST,
    'li': BlockType.LIST_ITEM,
    'blockquote': BlockType.QUOTE,
    'pre': BlockType.CODE,
    'hr': BlockType.DIVIDER,
    'img': BlockType.IMAGE,
    'table': BlockType.TABLE,
    'tr': BlockType.TABLE_ROW,
    'td': BlockType.TABLE_CELL,
    'th': BlockType.TABLE_CELL,
  };
  
  return tagMap[tagName.toLowerCase()] || BlockType.UNKNOWN;
}

/**
 * Get HTML tag name from BlockType
 */
export function getTagFromBlockType(blockType: BlockType): string {
  const typeMap: Record<BlockType, string> = {
    [BlockType.PARAGRAPH]: 'p',
    [BlockType.HEADING_1]: 'h1',
    [BlockType.HEADING_2]: 'h2',
    [BlockType.HEADING_3]: 'h3',
    [BlockType.HEADING_4]: 'h4',
    [BlockType.HEADING_5]: 'h5',
    [BlockType.HEADING_6]: 'h6',
    [BlockType.BULLET_LIST]: 'ul',
    [BlockType.NUMBERED_LIST]: 'ol',
    [BlockType.LIST_ITEM]: 'li',
    [BlockType.QUOTE]: 'blockquote',
    [BlockType.CODE]: 'pre',
    [BlockType.DIVIDER]: 'hr',
    [BlockType.IMAGE]: 'img',
    [BlockType.TABLE]: 'table',
    [BlockType.TABLE_ROW]: 'tr',
    [BlockType.TABLE_CELL]: 'td',
    [BlockType.UNKNOWN]: 'div',
  };
  
  return typeMap[blockType] || 'div';
}

/**
 * Check if an element is a block-level element
 */
export function isBlockElement(element: Element): boolean {
  const blockTags = [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre',
    'hr', 'table', 'tr', 'td', 'th', 'div',
    'section', 'article', 'aside', 'header',
    'footer', 'main', 'nav'
  ];
  
  return blockTags.includes(element.tagName.toLowerCase());
}

/**
 * Check if an element is a container (has child blocks)
 */
export function isContainerElement(element: Element): boolean {
  const containerTags = ['ul', 'ol', 'table', 'blockquote'];
  return containerTags.includes(element.tagName.toLowerCase());
}

/**
 * Extract plain text from HTML string
 */
export function extractTextFromHtml(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  return tempDiv.textContent || tempDiv.innerText || '';
}

/**
 * Get element's position in the HTML string
 */
export function getElementPosition(element: Element, html: string): { start: number; end: number } {
  const elementHtml = element.outerHTML;
  const start = html.indexOf(elementHtml);
  const end = start + elementHtml.length;
  
  return { start, end };
}

/**
 * Calculate depth of nested element
 */
export function calculateElementDepth(element: Element, rootElement: Element): number {
  let depth = 0;
  let current = element.parentElement;
  
  while (current && current !== rootElement) {
    if (isBlockElement(current)) {
      depth++;
    }
    current = current.parentElement;
  }
  
  return depth;
}

/**
 * Create a virtual block from a DOM element
 */
export function createVirtualBlock(
  element: Element,
  position: { start: number; end: number },
  depth: number = 0,
  parent?: VirtualContentBlock
): VirtualContentBlock {
  const html = element.innerHTML;
  const text = extractTextFromHtml(html);
  const blockType = getBlockTypeFromTag(element.tagName);
  
  return {
    id: generateBlockId(position.start, html, depth),
    type: blockType,
    domElement: element as HTMLElement,
    content: {
      html: element.outerHTML,
      text
    },
    properties: {
      isEditable: true,
      isFocused: false,
      isSelected: false,
      showActions: false,
      isDraggable: true,
      isDropTarget: blockType !== BlockType.DIVIDER && blockType !== BlockType.IMAGE
    },
    position,
    parent,
    children: [],
    metadata: {
      tagName: element.tagName.toLowerCase(),
      attributes: getElementAttributes(element),
      depth
    }
  };
}

/**
 * Get all attributes of an element as a record
 */
export function getElementAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    attributes[attr.name] = attr.value;
  }
  
  return attributes;
}

/**
 * Find block by ID in a tree of blocks
 */
export function findBlockById(blocks: VirtualContentBlock[], blockId: string): VirtualContentBlock | null {
  for (const block of blocks) {
    if (block.id === blockId) {
      return block;
    }
    
    if (block.children && block.children.length > 0) {
      const found = findBlockById(block.children, blockId);
      if (found) return found;
    }
  }
  
  return null;
}

/**
 * Flatten a tree of blocks into a flat array
 */
export function flattenBlocks(blocks: VirtualContentBlock[]): VirtualContentBlock[] {
  const flat: VirtualContentBlock[] = [];
  
  for (const block of blocks) {
    flat.push(block);
    
    if (block.children && block.children.length > 0) {
      flat.push(...flattenBlocks(block.children));
    }
  }
  
  return flat;
}

/**
 * Convert block type in HTML string
 */
export function convertBlockTypeInHtml(
  html: string,
  oldTag: string,
  newTag: string,
  blockId: string
): string {
  // Parse HTML to find the specific block
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  
  // Find all elements with the old tag
  const elements = doc.querySelectorAll(oldTag);
  
  for (const element of elements) {
    // Check if this is the target block (by content or position)
    const newElement = doc.createElement(newTag);
    
    // Copy attributes
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      newElement.setAttribute(attr.name, attr.value);
    }
    
    // Copy content
    newElement.innerHTML = element.innerHTML;
    
    // Replace the element
    element.parentNode?.replaceChild(newElement, element);
    break; // For now, convert the first match
  }
  
  return doc.body.innerHTML;
}

/**
 * Insert HTML at a specific position
 */
export function insertHtmlAtPosition(
  originalHtml: string,
  newHtml: string,
  position: number
): string {
  return originalHtml.slice(0, position) + newHtml + originalHtml.slice(position);
}

/**
 * Remove HTML between positions
 */
export function removeHtmlBetweenPositions(
  html: string,
  start: number,
  end: number
): string {
  return html.slice(0, start) + html.slice(end);
}

/**
 * Validate HTML structure
 */
export function validateHtml(html: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Check for parser errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      errors.push('HTML parsing error: ' + parserError.textContent);
      return { isValid: false, errors };
    }
    
    // Additional validation checks could go here
    
    return { isValid: true, errors };
  } catch (error) {
    errors.push('Failed to validate HTML: ' + (error as Error).message);
    return { isValid: false, errors };
  }
}

/**
 * Sanitize HTML to prevent XSS
 */
export function sanitizeHtml(html: string): string {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;
  
  // Remove script tags
  const scripts = tempDiv.querySelectorAll('script');
  scripts.forEach(script => script.remove());
  
  // Remove event handlers
  const allElements = tempDiv.querySelectorAll('*');
  allElements.forEach(element => {
    // Remove all attributes starting with 'on'
    const attributes = element.attributes;
    for (let i = attributes.length - 1; i >= 0; i--) {
      const attr = attributes[i];
      if (attr.name.startsWith('on')) {
        element.removeAttribute(attr.name);
      }
    }
  });
  
  return tempDiv.innerHTML;
}

/**
 * Auto-detect block type from text pattern
 */
export function detectBlockTypeFromPattern(text: string): BlockType | null {
  const patterns: Array<[RegExp, BlockType]> = [
    [/^#\s/, BlockType.HEADING_1],
    [/^##\s/, BlockType.HEADING_2],
    [/^###\s/, BlockType.HEADING_3],
    [/^####\s/, BlockType.HEADING_4],
    [/^#####\s/, BlockType.HEADING_5],
    [/^######\s/, BlockType.HEADING_6],
    [/^[-*]\s/, BlockType.BULLET_LIST],
    [/^\d+\.\s/, BlockType.NUMBERED_LIST],
    [/^>\s/, BlockType.QUOTE],
    [/^```/, BlockType.CODE],
    [/^---$/, BlockType.DIVIDER],
  ];
  
  for (const [pattern, blockType] of patterns) {
    if (pattern.test(text)) {
      return blockType;
    }
  }
  
  return null;
}