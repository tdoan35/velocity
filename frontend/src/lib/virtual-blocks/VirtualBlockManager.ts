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

import { UndoRedoManager } from './UndoRedoManager';

export class VirtualBlockManager {
  private blockCache = new Map<string, VirtualContentBlock[]>();
  private htmlHash: string = '';
  private parseOptions: ParseOptions;
  private undoRedoManager: UndoRedoManager;

  constructor(options: ParseOptions = {}) {
    this.parseOptions = {
      includeInline: false,
      preserveWhitespace: false,
      maxDepth: 10,
      ...options
    };
    this.undoRedoManager = new UndoRedoManager(50);
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
      
      // Find the indices of source and target blocks
      const sourceIndex = blocks.findIndex(block => block.id === sourceBlockId);
      const targetIndex = blocks.findIndex(block => block.id === targetBlockId);
      
      // Extract source block HTML
      const sourceHtml = html.slice(sourceBlock.position.start, sourceBlock.position.end);
      
      // Calculate the target position for insertion BEFORE removing the source
      let insertPosition: number;
      
      if (sourceIndex < targetIndex) {
        // Moving forward: insert after target (position needs adjustment after removal)
        insertPosition = position === 'before' ? targetBlock.position.start : targetBlock.position.end;
        // Adjust for source removal
        const sourceLength = sourceBlock.position.end - sourceBlock.position.start;
        insertPosition -= sourceLength;
      } else {
        // Moving backward: insert relative to target (no adjustment needed)
        insertPosition = position === 'before' ? targetBlock.position.start : targetBlock.position.end;
      }
      
      // Remove source block from HTML
      let updatedHtml = removeHtmlBetweenPositions(
        html,
        sourceBlock.position.start,
        sourceBlock.position.end
      );
      
      // Insert source HTML at the calculated position
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
   * Duplicate a block
   */
  public duplicateBlock(html: string, blockId: string): BlockOperationResult {
    try {
      const blocks = this.parseHTMLToBlocks(html);
      const targetBlock = findBlockById(blocks, blockId);
      
      if (!targetBlock) {
        return {
          success: false,
          error: `Block with ID ${blockId} not found`
        };
      }
      
      // Create a copy of the block's HTML
      const duplicatedHtml = targetBlock.content.html;
      
      // Insert the duplicated block after the original
      const insertPosition = targetBlock.position.end;
      const updatedHtml = insertHtmlAtPosition(html, duplicatedHtml, insertPosition);
      
      // Validate
      const validation = validateHtml(updatedHtml);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid HTML after duplication: ${validation.errors.join(', ')}`
        };
      }
      
      // Parse updated HTML to get new block IDs
      const updatedBlocks = this.parseHTMLToBlocks(updatedHtml);
      
      return {
        success: true,
        html: updatedHtml,
        blocks: updatedBlocks,
        affectedBlockIds: [blockId]
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to duplicate block: ${(error as Error).message}`
      };
    }
  }

  /**
   * Create a new block at a specific position
   */
  public createBlockAt(
    html: string,
    position: 'start' | 'end' | number,
    blockType: BlockType = BlockType.PARAGRAPH,
    content: string = ''
  ): BlockOperationResult {
    try {
      const tag = getTagFromBlockType(blockType);
      const newBlockHtml = `<${tag}>${content}</${tag}>`;
      
      let insertPos: number;
      if (position === 'start') {
        insertPos = 0;
      } else if (position === 'end') {
        insertPos = html.length;
      } else {
        insertPos = position;
      }
      
      const updatedHtml = insertHtmlAtPosition(html, newBlockHtml, insertPos);
      
      // Validate
      const validation = validateHtml(updatedHtml);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid HTML after creation: ${validation.errors.join(', ')}`
        };
      }
      
      // Parse updated HTML to get new block IDs
      const updatedBlocks = this.parseHTMLToBlocks(updatedHtml);
      
      return {
        success: true,
        html: updatedHtml,
        blocks: updatedBlocks,
        affectedBlockIds: []
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create block: ${(error as Error).message}`
      };
    }
  }

  /**
   * Delete multiple blocks at once
   */
  public deleteBlocks(html: string, blockIds: string[]): BlockOperationResult {
    try {
      let updatedHtml = html;
      const blocks = this.parseHTMLToBlocks(html);
      
      // Sort blocks by position (descending) to delete from end to start
      const blocksToDelete = blockIds
        .map(id => findBlockById(blocks, id))
        .filter(block => block !== null) as VirtualContentBlock[];
      
      blocksToDelete.sort((a, b) => b.position.start - a.position.start);
      
      // Delete each block
      for (const block of blocksToDelete) {
        updatedHtml = removeHtmlBetweenPositions(
          updatedHtml,
          block.position.start,
          block.position.end
        );
      }
      
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
        affectedBlockIds: blockIds
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to delete blocks: ${(error as Error).message}`
      };
    }
  }

  /**
   * Replace a block with a different type while preserving content
   */
  public replaceBlock(
    html: string,
    blockId: string,
    newType: BlockType,
    preserveContent: boolean = true
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
      
      const content = preserveContent ? targetBlock.content.text : '';
      const tag = getTagFromBlockType(newType);
      const newBlockHtml = `<${tag}>${content}</${tag}>`;
      
      // Replace the block
      const beforeHtml = html.substring(0, targetBlock.position.start);
      const afterHtml = html.substring(targetBlock.position.end);
      const updatedHtml = beforeHtml + newBlockHtml + afterHtml;
      
      // Validate
      const validation = validateHtml(updatedHtml);
      if (!validation.isValid) {
        return {
          success: false,
          error: `Invalid HTML after replacement: ${validation.errors.join(', ')}`
        };
      }
      
      // Parse updated HTML to get new block IDs
      const updatedBlocks = this.parseHTMLToBlocks(updatedHtml);
      
      return {
        success: true,
        html: updatedHtml,
        blocks: updatedBlocks,
        affectedBlockIds: [blockId]
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to replace block: ${(error as Error).message}`
      };
    }
  }

  /**
   * Perform an operation with undo/redo support
   */
  private performOperationWithHistory(
    html: string,
    operation: () => BlockOperationResult,
    description: string
  ): BlockOperationResult {
    // Save current state before operation
    this.undoRedoManager.addState(html, `Before: ${description}`);
    
    // Perform the operation
    const result = operation();
    
    // If successful, save the new state
    if (result.success && result.html) {
      this.undoRedoManager.addState(result.html, description, result.affectedBlockIds);
    }
    
    return result;
  }

  /**
   * Undo the last operation
   */
  public undo(): { success: boolean; html?: string; error?: string } {
    const previousState = this.undoRedoManager.undo();
    
    if (!previousState) {
      return {
        success: false,
        error: 'No operations to undo'
      };
    }
    
    // Clear cache to force re-parse
    this.clearCache();
    
    return {
      success: true,
      html: previousState.html
    };
  }

  /**
   * Redo the last undone operation
   */
  public redo(): { success: boolean; html?: string; error?: string } {
    const nextState = this.undoRedoManager.redo();
    
    if (!nextState) {
      return {
        success: false,
        error: 'No operations to redo'
      };
    }
    
    // Clear cache to force re-parse
    this.clearCache();
    
    return {
      success: true,
      html: nextState.html
    };
  }

  /**
   * Check if undo is available
   */
  public canUndo(): boolean {
    return this.undoRedoManager.canUndo();
  }

  /**
   * Check if redo is available
   */
  public canRedo(): boolean {
    return this.undoRedoManager.canRedo();
  }

  /**
   * Get undo/redo history
   */
  public getHistory(): Array<{ description: string; timestamp: number; canRevert: boolean }> {
    return this.undoRedoManager.getRecentOperations(10);
  }

  /**
   * Clear undo/redo history
   */
  public clearHistory(): void {
    this.undoRedoManager.clear();
  }

  /**
   * Batch operations without intermediate history states
   */
  public batch(callback: () => void): void {
    this.undoRedoManager.batch(callback);
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