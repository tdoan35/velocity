import { Editor } from '@tiptap/react';
import { VirtualBlockManager } from './VirtualBlockManager';
import { BlockType } from './types';

interface AutoConversionPattern {
  pattern: RegExp;
  blockType: BlockType;
  removePattern: boolean;
  description: string;
}

interface AutoConversionResult {
  converted: boolean;
  newBlockType?: BlockType;
  patternLength?: number;
}

/**
 * Manages auto-conversion patterns for transforming typed patterns into block types
 * Examples: "# " -> Heading 1, "- " -> Bullet List, etc.
 */
export class AutoConversionManager {
  private patterns: AutoConversionPattern[] = [
    {
      pattern: /^# $/,
      blockType: BlockType.HEADING_1,
      removePattern: true,
      description: 'Convert "# " to Heading 1'
    },
    {
      pattern: /^## $/,
      blockType: BlockType.HEADING_2,
      removePattern: true,
      description: 'Convert "## " to Heading 2'
    },
    {
      pattern: /^### $/,
      blockType: BlockType.HEADING_3,
      removePattern: true,
      description: 'Convert "### " to Heading 3'
    },
    {
      pattern: /^- $/,
      blockType: BlockType.BULLET_LIST,
      removePattern: true,
      description: 'Convert "- " to Bullet List'
    },
    {
      pattern: /^\d+\. $/,
      blockType: BlockType.NUMBERED_LIST,
      removePattern: true,
      description: 'Convert "1. " to Numbered List'
    },
    {
      pattern: /^> $/,
      blockType: BlockType.QUOTE,
      removePattern: true,
      description: 'Convert "> " to Blockquote'
    },
    {
      pattern: /^```$/,
      blockType: BlockType.CODE,
      removePattern: true,
      description: 'Convert "```" to Code Block'
    },
    {
      pattern: /^---$/,
      blockType: BlockType.DIVIDER,
      removePattern: true,
      description: 'Convert "---" to Divider'
    }
  ];

  constructor(
    private editor: Editor,
    private virtualBlockManager: VirtualBlockManager
  ) {}

  /**
   * Check if the current line matches any auto-conversion pattern
   */
  checkForAutoConversion(): AutoConversionResult {
    if (!this.editor) {
      return { converted: false };
    }

    const { state } = this.editor;
    const { selection } = state;
    const { $head } = selection;

    // Get the current paragraph node and its text content
    const currentNode = $head.parent;
    if (!currentNode || currentNode.type.name !== 'paragraph') {
      return { converted: false };
    }

    const currentText = currentNode.textContent;
    const currentPos = $head.pos;

    // Check each pattern
    for (const pattern of this.patterns) {
      const match = pattern.pattern.exec(currentText);
      
      if (match) {
        console.log('Auto-conversion pattern matched:', {
          pattern: pattern.description,
          text: currentText,
          blockType: pattern.blockType
        });

        // Perform the conversion
        const success = this.performConversion(
          pattern,
          currentPos,
          match[0].length
        );

        if (success) {
          return {
            converted: true,
            newBlockType: pattern.blockType,
            patternLength: match[0].length
          };
        }
      }
    }

    return { converted: false };
  }

  /**
   * Perform the actual block type conversion
   */
  private performConversion(
    pattern: AutoConversionPattern,
    position: number,
    patternLength: number
  ): boolean {
    try {
      const { state, view } = this.editor;
      const { tr, selection } = state;
      const { $head } = selection;

      // Find the start of the current paragraph
      const paragraphStart = $head.start();
      
      // Remove the pattern text if required
      if (pattern.removePattern) {
        tr.delete(paragraphStart, paragraphStart + patternLength);
      }

      // Convert the block type based on the pattern
      switch (pattern.blockType) {
        case BlockType.HEADING_1:
          tr.setBlockType(paragraphStart, paragraphStart, this.editor.schema.nodes.heading, { level: 1 });
          break;
        
        case BlockType.HEADING_2:
          tr.setBlockType(paragraphStart, paragraphStart, this.editor.schema.nodes.heading, { level: 2 });
          break;
        
        case BlockType.HEADING_3:
          tr.setBlockType(paragraphStart, paragraphStart, this.editor.schema.nodes.heading, { level: 3 });
          break;
        
        case BlockType.BULLET_LIST:
          this.convertToList(tr, paragraphStart, 'bulletList');
          break;
        
        case BlockType.NUMBERED_LIST:
          this.convertToList(tr, paragraphStart, 'orderedList');
          break;
        
        case BlockType.QUOTE:
          tr.setBlockType(paragraphStart, paragraphStart, this.editor.schema.nodes.blockquote);
          break;
        
        case BlockType.CODE:
          tr.setBlockType(paragraphStart, paragraphStart, this.editor.schema.nodes.codeBlock);
          break;
        
        case BlockType.DIVIDER:
          // Replace paragraph with horizontal rule
          tr.replaceWith(
            paragraphStart - 1,
            $head.end(),
            this.editor.schema.nodes.horizontalRule.create()
          );
          // Add a new paragraph after the divider
          tr.insert(
            tr.selection.head,
            this.editor.schema.nodes.paragraph.create()
          );
          break;
        
        default:
          console.warn('Unknown block type for auto-conversion:', pattern.blockType);
          return false;
      }

      // Apply the transaction
      view.dispatch(tr);
      
      console.log('Auto-conversion completed successfully:', {
        blockType: pattern.blockType,
        description: pattern.description
      });

      return true;
    } catch (error) {
      console.error('Error during auto-conversion:', error);
      return false;
    }
  }

  /**
   * Convert paragraph to list (bullet or numbered)
   */
  private convertToList(tr: any, position: number, listType: 'bulletList' | 'orderedList'): void {
    const { schema } = this.editor;
    const listNode = schema.nodes[listType];
    const listItemNode = schema.nodes.listItem;
    const paragraphNode = schema.nodes.paragraph;

    if (!listNode || !listItemNode || !paragraphNode) {
      console.error('Required nodes not found in schema for list conversion');
      return;
    }

    // Create the list structure: list > listItem > paragraph
    const listItem = listItemNode.create(null, paragraphNode.create());
    const list = listNode.create(null, listItem);

    // Replace the current paragraph with the list
    const { $head } = tr.selection;
    const paragraphStart = $head.start() - 1;
    const paragraphEnd = $head.end();
    
    tr.replaceWith(paragraphStart, paragraphEnd, list);
  }

  /**
   * Get all available auto-conversion patterns for documentation/help
   */
  getAvailablePatterns(): AutoConversionPattern[] {
    return [...this.patterns];
  }

  /**
   * Add a custom auto-conversion pattern
   */
  addCustomPattern(pattern: AutoConversionPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * Remove a pattern by description
   */
  removePattern(description: string): boolean {
    const index = this.patterns.findIndex(p => p.description === description);
    if (index >= 0) {
      this.patterns.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Check if auto-conversion should be triggered for the current input
   * This is called on space key press to detect pattern completion
   */
  shouldTriggerAutoConversion(event: KeyboardEvent): boolean {
    // Trigger on space key for most patterns
    if (event.key === ' ') {
      return true;
    }
    
    // Trigger on Enter for patterns that end without space (like ---)
    if (event.key === 'Enter') {
      const currentText = this.getCurrentLineText();
      return /^---$|^```$/.test(currentText);
    }

    return false;
  }

  /**
   * Get the current line text for pattern matching
   */
  private getCurrentLineText(): string {
    if (!this.editor) return '';
    
    const { state } = this.editor;
    const { selection } = state;
    const { $head } = selection;
    
    return $head.parent.textContent || '';
  }

  /**
   * Handle auto-conversion trigger
   */
  handleAutoConversionTrigger(event: KeyboardEvent): boolean {
    if (!this.shouldTriggerAutoConversion(event)) {
      return false;
    }

    const result = this.checkForAutoConversion();
    
    if (result.converted) {
      // Prevent the default key behavior since we converted the block
      event.preventDefault();
      return true;
    }

    return false;
  }
}

export default AutoConversionManager;