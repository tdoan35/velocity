import { Editor } from '@tiptap/core';
import { VirtualBlockManager } from './VirtualBlockManager';
import type { VirtualContentBlock } from './types';
import { BlockType } from './types';
import { getTagFromBlockType } from './utils';

export interface KeyboardNavigationOptions {
  onBlockFocus?: (blockId: string) => void;
  onBlockCreate?: (blockId: string, type: BlockType) => void;
  onBlockDelete?: (blockId: string) => void;
  onContentUpdate?: (html: string) => void;
}

export class KeyboardNavigationManager {
  private editor: Editor;
  private virtualBlockManager: VirtualBlockManager;
  private options: KeyboardNavigationOptions;
  private currentBlockId: string | null = null;

  constructor(
    editor: Editor,
    virtualBlockManager: VirtualBlockManager,
    options: KeyboardNavigationOptions = {}
  ) {
    this.editor = editor;
    this.virtualBlockManager = virtualBlockManager;
    this.options = options;
  }

  /**
   * Handle arrow key navigation between blocks
   */
  handleArrowNavigation(direction: 'up' | 'down'): boolean {
    const { state } = this.editor;
    const { selection } = state;
    const { $from } = selection;
    
    // Get current position in the document
    const pos = $from.pos;
    const html = this.editor.getHTML();
    const blocks = this.virtualBlockManager.parseHTMLToBlocks(html);
    
    if (!blocks.length) return false;

    // Find current block based on cursor position
    const currentBlock = this.findBlockAtPosition(blocks, pos);
    if (!currentBlock) return false;

    const currentIndex = blocks.findIndex(b => b.id === currentBlock.id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    // Check if we can navigate
    if (targetIndex < 0 || targetIndex >= blocks.length) {
      return false;
    }

    const targetBlock = blocks[targetIndex];
    
    // Focus the target block
    this.focusBlock(targetBlock.id);
    
    return true;
  }

  /**
   * Handle Enter key behavior - create new block or insert line break
   */
  handleEnterKey(isShift: boolean): boolean {
    const { state } = this.editor;
    const { selection } = state;
    
    if (isShift) {
      // Shift+Enter: Insert line break within current block
      this.editor.commands.setHardBreak();
      return true;
    }

    // Regular Enter: Create new block after current
    const html = this.editor.getHTML();
    const blocks = this.virtualBlockManager.parseHTMLToBlocks(html);
    const currentBlock = this.findCurrentBlock(blocks);
    
    if (!currentBlock) return false;

    // Check if we're at the end of the current block
    const { $from } = selection;
    const isAtEnd = this.isAtBlockEnd($from.pos, currentBlock);
    
    if (isAtEnd) {
      // Create new block after current
      this.createBlockAfter(currentBlock.id, BlockType.PARAGRAPH);
      return true;
    }

    // Split current block at cursor position
    this.splitBlockAtCursor(currentBlock);
    return true;
  }

  /**
   * Handle Backspace key - delete block if empty or merge with previous
   */
  handleBackspaceKey(): boolean {
    const { state } = this.editor;
    const { selection } = state;
    const { $from } = selection;
    
    // Check if we're at the beginning of the document
    if ($from.pos === 1) return false;

    const html = this.editor.getHTML();
    const blocks = this.virtualBlockManager.parseHTMLToBlocks(html);
    const currentBlock = this.findCurrentBlock(blocks);
    
    if (!currentBlock) return false;

    // Check if block is empty
    const isEmpty = this.isBlockEmpty(currentBlock);
    const isAtStart = this.isAtBlockStart($from.pos, currentBlock);
    
    if (isEmpty) {
      // Delete empty block
      this.deleteBlock(currentBlock.id);
      return true;
    }
    
    if (isAtStart) {
      // Merge with previous block
      const currentIndex = blocks.findIndex(b => b.id === currentBlock.id);
      if (currentIndex > 0) {
        this.mergeWithPreviousBlock(currentBlock, blocks[currentIndex - 1]);
        return true;
      }
    }

    return false;
  }

  /**
   * Handle Tab indentation
   */
  handleTabIndentation(isShift: boolean): boolean {
    const html = this.editor.getHTML();
    const blocks = this.virtualBlockManager.parseHTMLToBlocks(html);
    const currentBlock = this.findCurrentBlock(blocks);
    
    if (!currentBlock) return false;

    // Handle list indentation
    if (currentBlock.type === BlockType.BULLET_LIST || 
        currentBlock.type === BlockType.NUMBERED_LIST ||
        currentBlock.type === BlockType.LIST_ITEM) {
      if (isShift) {
        // Outdent
        this.editor.commands.liftListItem('listItem');
      } else {
        // Indent
        this.editor.commands.sinkListItem('listItem');
      }
      return true;
    }

    // For other blocks, convert to list or adjust indentation level
    if (!isShift) {
      // Tab: Convert to list or increase indentation
      const result = this.virtualBlockManager.convertBlockType(
        html,
        currentBlock.id,
        BlockType.BULLET_LIST
      );
      if (result.success && result.html) {
        this.updateContent(result.html);
        return true;
      }
    }

    return false;
  }

  /**
   * Focus a specific block by ID
   */
  focusBlock(blockId: string): void {
    const html = this.editor.getHTML();
    const blocks = this.virtualBlockManager.parseHTMLToBlocks(html);
    const targetBlock = blocks.find(b => b.id === blockId);
    
    if (!targetBlock) return;

    // Calculate position in editor
    const position = this.calculateBlockPosition(targetBlock);
    
    // Set cursor to the beginning of the block
    this.editor.commands.setTextSelection(position);
    
    // Update current block
    this.currentBlockId = blockId;
    
    // Trigger callback
    this.options.onBlockFocus?.(blockId);
  }

  /**
   * Create a new block after the specified block
   */
  createBlockAfter(blockId: string, type: BlockType = BlockType.PARAGRAPH): void {
    const html = this.editor.getHTML();
    const tag = getTagFromBlockType(type);
    const newBlockHTML = `<${tag}></${tag}>`;
    
    const result = this.virtualBlockManager.insertBlockAfter(
      html,
      blockId,
      {
        type,
        content: newBlockHTML
      }
    );
    
    if (result.success && result.html) {
      this.updateContent(result.html);
      
      // Parse updated blocks to get new block ID
      const updatedBlocks = this.virtualBlockManager.parseHTMLToBlocks(result.html);
      const blockIndex = updatedBlocks.findIndex(b => b.id === blockId);
      
      if (blockIndex >= 0 && blockIndex < updatedBlocks.length - 1) {
        const newBlock = updatedBlocks[blockIndex + 1];
        
        // Focus the new block
        setTimeout(() => {
          this.focusBlock(newBlock.id);
          this.options.onBlockCreate?.(newBlock.id, type);
        }, 0);
      }
    }
  }

  /**
   * Delete a block by ID
   */
  deleteBlock(blockId: string): void {
    const html = this.editor.getHTML();
    const blocks = this.virtualBlockManager.parseHTMLToBlocks(html);
    const blockIndex = blocks.findIndex(b => b.id === blockId);
    
    if (blockIndex === -1) return;

    // Focus previous or next block before deletion
    let focusTargetId: string | null = null;
    if (blockIndex > 0) {
      focusTargetId = blocks[blockIndex - 1].id;
    } else if (blockIndex < blocks.length - 1) {
      focusTargetId = blocks[blockIndex + 1].id;
    }

    const result = this.virtualBlockManager.deleteBlock(html, blockId);
    if (result.success && result.html) {
      this.updateContent(result.html);
      
      // Focus target block
      if (focusTargetId) {
        setTimeout(() => this.focusBlock(focusTargetId!), 0);
      }
      
      this.options.onBlockDelete?.(blockId);
    }
  }

  /**
   * Duplicate a block
   */
  duplicateBlock(blockId: string): void {
    const html = this.editor.getHTML();
    const blocks = this.virtualBlockManager.parseHTMLToBlocks(html);
    const blockToDuplicate = blocks.find(b => b.id === blockId);
    
    if (!blockToDuplicate) return;

    const result = this.virtualBlockManager.insertBlockAfter(
      html,
      blockId,
      {
        type: blockToDuplicate.type,
        content: blockToDuplicate.content.html
      }
    );
    
    if (result.success && result.html) {
      this.updateContent(result.html);
    }
  }

  /**
   * Convert block to a different type
   */
  convertBlockType(blockId: string, newType: BlockType): void {
    const html = this.editor.getHTML();
    const result = this.virtualBlockManager.convertBlockType(html, blockId, newType);
    if (result.success && result.html) {
      this.updateContent(result.html);
    }
  }

  /**
   * Get the currently focused block
   */
  getCurrentBlock(): VirtualContentBlock | null {
    const html = this.editor.getHTML();
    const blocks = this.virtualBlockManager.parseHTMLToBlocks(html);
    return this.findCurrentBlock(blocks);
  }

  // Private helper methods

  private findBlockAtPosition(blocks: VirtualContentBlock[], pos: number): VirtualContentBlock | null {
    return blocks.find(block => {
      return pos >= block.position.start && pos <= block.position.end;
    }) || null;
  }

  private findCurrentBlock(blocks: VirtualContentBlock[]): VirtualContentBlock | null {
    const { state } = this.editor;
    const { selection } = state;
    const { $from } = selection;
    
    return this.findBlockAtPosition(blocks, $from.pos);
  }

  private isBlockEmpty(block: VirtualContentBlock): boolean {
    const text = block.content.text.trim();
    return text === '' || text === '\n';
  }

  private isAtBlockStart(pos: number, block: VirtualContentBlock): boolean {
    // Account for HTML tag overhead
    return pos <= block.position.start + 5;
  }

  private isAtBlockEnd(pos: number, block: VirtualContentBlock): boolean {
    // Account for HTML tag overhead
    return pos >= block.position.end - 5;
  }

  private calculateBlockPosition(block: VirtualContentBlock): number {
    // Calculate the position in the editor for the start of the block
    // This is a simplified calculation - may need adjustment based on actual HTML structure
    return block.position.start + 3; // Skip opening tag
  }

  private splitBlockAtCursor(currentBlock: VirtualContentBlock): void {
    const { state } = this.editor;
    const { selection } = state;
    const { $from } = selection;
    
    // Get content before and after cursor
    const html = this.editor.getHTML();
    const cursorOffset = $from.pos - currentBlock.position.start;
    
    const beforeContent = currentBlock.content.html.substring(0, cursorOffset);
    const afterContent = currentBlock.content.html.substring(cursorOffset);
    
    // Update current block with content before cursor
    const updateResult = this.virtualBlockManager.updateBlockInHTML(html, currentBlock.id, beforeContent);
    
    if (updateResult.success && updateResult.html) {
      // Create new block with content after cursor
      const insertResult = this.virtualBlockManager.insertBlockAfter(
        updateResult.html,
        currentBlock.id,
        {
          type: currentBlock.type,
          content: afterContent
        }
      );
      
      if (insertResult.success && insertResult.html) {
        this.updateContent(insertResult.html);
      }
    }
  }

  private mergeWithPreviousBlock(currentBlock: VirtualContentBlock, previousBlock: VirtualContentBlock): void {
    const html = this.editor.getHTML();
    
    // Combine content
    const combinedContent = previousBlock.content.html + currentBlock.content.html;
    
    // Update previous block with combined content
    const updateResult = this.virtualBlockManager.updateBlockInHTML(html, previousBlock.id, combinedContent);
    
    if (updateResult.success && updateResult.html) {
      // Delete current block
      const deleteResult = this.virtualBlockManager.deleteBlock(updateResult.html, currentBlock.id);
      
      if (deleteResult.success && deleteResult.html) {
        this.updateContent(deleteResult.html);
        
        // Position cursor at the merge point
        setTimeout(() => {
          if (deleteResult.html) {
            const blocks = this.virtualBlockManager.parseHTMLToBlocks(deleteResult.html);
            const mergedBlock = blocks.find(b => b.id === previousBlock.id);
            if (mergedBlock) {
              const mergePosition = previousBlock.content.text.length;
              this.editor.commands.setTextSelection(mergedBlock.position.start + mergePosition);
            }
          }
        }, 0);
      }
    }
  }

  private extractText(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || '';
  }

  private updateContent(html: string): void {
    this.editor.commands.setContent(html);
    this.options.onContentUpdate?.(html);
  }
}