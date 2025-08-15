/**
 * VirtualBlockManager - Core class for managing virtual blocks
 * 
 * This class provides the main interface for parsing HTML into virtual blocks
 * and performing operations on those blocks while maintaining HTML integrity.
 */

import { BlockType } from './types';
import type {
  VirtualContentBlock,
  ParseOptions,
  BlockOperationResult,
  BlockOperationContext,
  BlockTypeConversion
} from './types';

import {
  generateBlockId,
  getBlockTypeFromTag,
  getTagFromBlockType,
  isBlockElement,
  isContainerElement,
  extractTextFromHtml,
  createVirtualBlock,
  findBlockById,
  flattenBlocks,
  convertBlockTypeInHtml,
  insertHtmlAtPosition,
  removeHtmlBetweenPositions,
  validateHtml,
  sanitizeHtml
} from './utils';

export class VirtualBlockManager {
  private blockCache = new Map<string, VirtualContentBlock[]>();
  private htmlHash: string = '';
  private parseOptions: ParseOptions;

  constructor(options: ParseOptions = {}) {
    this.parseOptions = {
      includeInline: false,
      preserveWhitespace: false,
      maxDepth: 10,
      ...options
    };
  }

  /**
   * Parse HTML string into virtual blocks with caching
   */
  public parseHTMLToBlocks(html: string): VirtualContentBlock[] {
    const currentHash = this.hashHTML(html);
    
    // Check cache
    if (this.htmlHash === currentHash && this.blockCache.has(currentHash)) {
      return this.blockCache.get(currentHash)!;
    }
    
    // Parse HTML
    const blocks = this.doParse(html);
    
    // Update cache
    this.blockCache.set(currentHash, blocks);
    this.htmlHash = currentHash;
    
    // Clean old cache entries if too many
    if (this.blockCache.size > 10) {
      const firstKey = this.blockCache.keys().next().value;
      if (firstKey !== undefined) {
        this.blockCache.delete(firstKey);
      }
    }
    
    return blocks;
  }

  /**
   * Internal HTML parsing implementation
   */
  private doParse(html: string): VirtualContentBlock[] {
    // Sanitize HTML first
    const sanitized = sanitizeHtml(html);
    
    // Parse HTML into DOM
    const parser = new DOMParser();
    const doc = parser.parseFromString(sanitized, 'text/html');
    const body = doc.body;
    
    // Track position in original HTML
    let currentPosition = 0;
    
    // Parse top-level blocks
    const blocks: VirtualContentBlock[] = [];
    const children = Array.from(body.children);
    
    for (const child of children) {
      if (isBlockElement(child)) {
        const block = this.parseElement(child, sanitized, currentPosition, 0);
        if (block) {
          blocks.push(block);
          currentPosition = block.position.end;
        }
      }
    }
    
    return blocks;
  }

  /**
   * Parse a single DOM element into a virtual block
   */
  private parseElement(
    element: Element,
    fullHtml: string,
    startPosition: number,
    depth: number,
    parent?: VirtualContentBlock
  ): VirtualContentBlock | null {
    // Check max depth
    if (depth > (this.parseOptions.maxDepth || 10)) {
      return null;
    }
    
    // Get element's HTML
    const elementHtml = element.outerHTML;
    const elementInnerHtml = element.innerHTML;
    
    // Calculate position in full HTML
    const position = {
      start: fullHtml.indexOf(elementHtml, startPosition),
      end: 0
    };
    position.end = position.start + elementHtml.length;
    
    // Skip if element not found in HTML (shouldn't happen)
    if (position.start === -1) {
      return null;
    }
    
    // Create the virtual block
    const block = createVirtualBlock(element, position, depth, parent);
    
    // Parse children for container elements
    if (isContainerElement(element)) {
      const children: VirtualContentBlock[] = [];
      let childPosition = position.start + element.outerHTML.indexOf('>') + 1;
      
      for (const child of Array.from(element.children)) {
        if (isBlockElement(child)) {
          const childBlock = this.parseElement(
            child,
            fullHtml,
            childPosition,
            depth + 1,
            block
          );
          
          if (childBlock) {
            children.push(childBlock);
            childPosition = childBlock.position.end;
          }
        }
      }
      
      block.children = children;
    }
    
    return block;
  }

  /**
   * Update a block's content in the HTML
   */
  public updateBlockInHTML(html: string, blockId: string, newContent: string): BlockOperationResult {
    try {
      const blocks = this.parseHTMLToBlocks(html);
      const targetBlock = findBlockById(blocks, blockId);
      
      if (!targetBlock) {
        return {
          success: false,
          error: `Block with ID ${blockId} not found`
        };
      }
      
      // Replace the block's HTML in the original HTML
      const updatedHtml = 
        html.slice(0, targetBlock.position.start) +
        newContent +
        html.slice(targetBlock.position.end);
      
      // Validate the updated HTML
      const validation = validateHtml(updatedHtml);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid HTML after update: ${validation.errors.join(', ')}`
        };
      }
      
      return {
        success: true,
        html: updatedHtml,
        affectedBlockIds: [blockId]
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to update block: ${(error as Error).message}`
      };
    }
  }

  /**
   * Insert a new block after an existing block
   */
  public insertBlockAfter(
    html: string,
    targetBlockId: string,
    newBlock: { type: BlockType; content: string }
  ): BlockOperationResult {
    try {
      const blocks = this.parseHTMLToBlocks(html);
      const targetBlock = findBlockById(blocks, targetBlockId);
      
      if (!targetBlock) {
        return {
          success: false,
          error: `Target block with ID ${targetBlockId} not found`
        };
      }
      
      // Create HTML for the new block
      const tag = getTagFromBlockType(newBlock.type);
      const newBlockHtml = `<${tag}>${newBlock.content}</${tag}>`;
      
      // Insert after the target block
      const insertPosition = targetBlock.position.end;
      const updatedHtml = insertHtmlAtPosition(html, newBlockHtml, insertPosition);
      
      // Validate
      const validation = validateHtml(updatedHtml);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid HTML after insertion: ${validation.errors.join(', ')}`
        };
      }
      
      // Parse updated HTML to get new block IDs
      const updatedBlocks = this.parseHTMLToBlocks(updatedHtml);
      
      return {
        success: true,
        html: updatedHtml,
        blocks: updatedBlocks,
        affectedBlockIds: [targetBlockId]
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to insert block: ${(error as Error).message}`
      };
    }
  }

  /**
   * Delete a block from the HTML
   */
  public deleteBlock(html: string, blockId: string): BlockOperationResult {
    try {
      const blocks = this.parseHTMLToBlocks(html);
      const targetBlock = findBlockById(blocks, blockId);
      
      if (!targetBlock) {
        return {
          success: false,
          error: `Block with ID ${blockId} not found`
        };
      }
      
      // Remove the block's HTML
      const updatedHtml = removeHtmlBetweenPositions(
        html,
        targetBlock.position.start,
        targetBlock.position.end
      );
      
      // Validate
      const validation = validateHtml(updatedHtml);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid HTML after deletion: ${validation.errors.join(', ')}`
        };
      }
      
      return {
        success: true,
        html: updatedHtml,
        affectedBlockIds: [blockId]
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete block: ${(error as Error).message}`
      };
    }
  }

  /**
   * Reorder blocks by moving one block to a new position
   */
  public reorderBlocks(
    html: string,
    sourceBlockId: string,
    targetBlockId: string,
    position: 'before' | 'after' = 'after'
  ): BlockOperationResult {
    try {
      const blocks = this.parseHTMLToBlocks(html);
      const sourceBlock = findBlockById(blocks, sourceBlockId);
      const targetBlock = findBlockById(blocks, targetBlockId);
      
      if (!sourceBlock || !targetBlock) {
        return {
          success: false,
          error: `Source or target block not found`
        };
      }
      
      // Extract source block HTML
      const sourceHtml = html.slice(sourceBlock.position.start, sourceBlock.position.end);
      
      // Remove source block
      let updatedHtml = removeHtmlBetweenPositions(
        html,
        sourceBlock.position.start,
        sourceBlock.position.end
      );
      
      // Recalculate target position after removal
      const updatedBlocks = this.parseHTMLToBlocks(updatedHtml);
      const updatedTarget = findBlockById(updatedBlocks, targetBlockId);
      
      if (!updatedTarget) {
        return {
          success: false,
          error: 'Failed to find target block after source removal'
        };
      }
      
      // Insert at new position
      const insertPosition = position === 'before' 
        ? updatedTarget.position.start 
        : updatedTarget.position.end;
      
      updatedHtml = insertHtmlAtPosition(updatedHtml, sourceHtml, insertPosition);
      
      // Validate
      const validation = validateHtml(updatedHtml);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid HTML after reordering: ${validation.errors.join(', ')}`
        };
      }
      
      return {
        success: true,
        html: updatedHtml,
        affectedBlockIds: [sourceBlockId, targetBlockId]
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to reorder blocks: ${(error as Error).message}`
      };
    }
  }

  /**
   * Convert a block from one type to another
   */
  public convertBlockType(
    html: string,
    blockId: string,
    newType: BlockType
  ): BlockOperationResult {
    try {
      const blocks = this.parseHTMLToBlocks(html);
      const targetBlock = findBlockById(blocks, blockId);
      
      if (!targetBlock) {
        return {
          success: false,
          error: `Block with ID ${blockId} not found`
        };
      }
      
      // Get old and new tags
      const oldTag = targetBlock.metadata?.tagName || 'div';
      const newTag = getTagFromBlockType(newType);
      
      // Extract inner content
      const parser = new DOMParser();
      const tempDoc = parser.parseFromString(targetBlock.content.html, 'text/html');
      const element = tempDoc.body.firstElementChild;
      const innerContent = element?.innerHTML || '';
      
      // Create new block HTML
      const newBlockHtml = `<${newTag}>${innerContent}</${newTag}>`;
      
      // Replace in original HTML
      const updatedHtml = 
        html.slice(0, targetBlock.position.start) +
        newBlockHtml +
        html.slice(targetBlock.position.end);
      
      // Validate
      const validation = validateHtml(updatedHtml);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid HTML after conversion: ${validation.errors.join(', ')}`
        };
      }
      
      return {
        success: true,
        html: updatedHtml,
        affectedBlockIds: [blockId]
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to convert block type: ${(error as Error).message}`
      };
    }
  }

  /**
   * Get a specific block by ID
   */
  public getBlock(html: string, blockId: string): VirtualContentBlock | null {
    const blocks = this.parseHTMLToBlocks(html);
    return findBlockById(blocks, blockId);
  }

  /**
   * Get block at a specific character position
   */
  public getBlockAtPosition(html: string, position: number): VirtualContentBlock | null {
    const blocks = this.parseHTMLToBlocks(html);
    const flatBlocks = flattenBlocks(blocks);
    
    for (const block of flatBlocks) {
      if (position >= block.position.start && position <= block.position.end) {
        return block;
      }
    }
    
    return null;
  }

  /**
   * Get the current HTML from blocks (for validation)
   */
  public getHTML(blocks: VirtualContentBlock[]): string {
    // Reconstruct HTML from blocks
    let html = '';
    
    for (const block of blocks) {
      html += block.content.html;
    }
    
    return html;
  }

  /**
   * Clear the cache
   */
  public clearCache(): void {
    this.blockCache.clear();
    this.htmlHash = '';
  }

  /**
   * Hash HTML for caching
   */
  private hashHTML(html: string): string {
    let hash = 0;
    for (let i = 0; i < html.length; i++) {
      const char = html.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }
}