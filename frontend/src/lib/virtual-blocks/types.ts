/**
 * Virtual Content Block System Types
 * 
 * These types define the virtual block layer that sits on top of HTML content,
 * providing Notion-like block editing capabilities without database changes.
 */

export interface VirtualContentBlock {
  /** Generated from DOM position/content hash */
  id: string;
  
  /** Detected from HTML element */
  type: BlockType;
  
  /** Reference to actual DOM node (optional when parsing server-side) */
  domElement?: HTMLElement;
  
  /** Content of this block */
  content: {
    /** Raw HTML for this block */
    html: string;
    /** Plain text content */
    text: string;
  };
  
  /** Visual/interaction properties */
  properties: BlockProperties;
  
  /** Position in the full HTML string */
  position: {
    /** Character offset in full HTML */
    start: number;
    /** End character offset */
    end: number;
  };
  
  /** For nested elements like list items */
  parent?: VirtualContentBlock;
  
  /** Child blocks for containers like lists */
  children?: VirtualContentBlock[];
  
  /** Metadata for tracking */
  metadata?: {
    /** Original HTML tag name */
    tagName: string;
    /** HTML attributes */
    attributes?: Record<string, string>;
    /** Depth level for nested blocks */
    depth: number;
  };
}

/** Block types detected from HTML structure */
export const BlockType = {
  PARAGRAPH: 'paragraph',           // <p> elements
  HEADING_1: 'heading_1',          // <h1> elements  
  HEADING_2: 'heading_2',          // <h2> elements
  HEADING_3: 'heading_3',          // <h3> elements
  HEADING_4: 'heading_4',          // <h4> elements
  HEADING_5: 'heading_5',          // <h5> elements
  HEADING_6: 'heading_6',          // <h6> elements
  BULLET_LIST: 'bullet_list',      // <ul> elements
  NUMBERED_LIST: 'numbered_list',  // <ol> elements
  LIST_ITEM: 'list_item',          // <li> elements
  QUOTE: 'quote',                  // <blockquote> elements
  CODE: 'code',                    // <pre><code> elements
  DIVIDER: 'divider',              // <hr> elements
  IMAGE: 'image',                  // <img> elements
  TABLE: 'table',                  // <table> elements
  TABLE_ROW: 'table_row',          // <tr> elements
  TABLE_CELL: 'table_cell',        // <td> elements
  UNKNOWN: 'unknown'               // Fallback for unrecognized elements
} as const;

export type BlockType = typeof BlockType[keyof typeof BlockType];

/** Properties controlling block behavior and appearance */
export interface BlockProperties {
  /** Whether the block content can be edited */
  isEditable: boolean;
  
  /** Whether the block is currently focused */
  isFocused: boolean;
  
  /** Whether the block is selected */
  isSelected: boolean;
  
  /** Whether to show action buttons */
  showActions: boolean;
  
  /** Whether the block can be dragged */
  isDraggable: boolean;
  
  /** Whether the block can accept drops */
  isDropTarget: boolean;
  
  /** Custom CSS classes for the block */
  className?: string;
}

/** Options for parsing HTML to virtual blocks */
export interface ParseOptions {
  /** Include inline elements as blocks */
  includeInline?: boolean;
  
  /** Preserve whitespace blocks */
  preserveWhitespace?: boolean;
  
  /** Maximum depth for nested blocks */
  maxDepth?: number;
  
  /** Custom block type mappings */
  customTypeMappings?: Record<string, BlockType>;
}

/** Result of a block operation */
export interface BlockOperationResult {
  /** Whether the operation succeeded */
  success: boolean;
  
  /** Updated HTML after the operation */
  html?: string;
  
  /** Updated blocks after the operation */
  blocks?: VirtualContentBlock[];
  
  /** Error message if operation failed */
  error?: string;
  
  /** IDs of affected blocks */
  affectedBlockIds?: string[];
}

/** Context for block operations */
export interface BlockOperationContext {
  /** Current HTML content */
  html: string;
  
  /** Current virtual blocks */
  blocks: VirtualContentBlock[];
  
  /** Target block for the operation */
  targetBlockId?: string;
  
  /** Additional operation parameters */
  params?: Record<string, any>;
}

/** Block type conversion mapping */
export interface BlockTypeConversion {
  /** Source block type */
  from: BlockType;
  
  /** Target block type */
  to: BlockType;
  
  /** HTML transformation function */
  transform: (html: string) => string;
  
  /** Whether conversion is allowed */
  canConvert?: (block: VirtualContentBlock) => boolean;
}

/** Auto-conversion pattern definition */
export interface AutoConversionPattern {
  /** Pattern to match (regex string) */
  pattern: string;
  
  /** Target block type */
  targetType: BlockType;
  
  /** Function to transform matched text */
  transform: (match: string) => string;
  
  /** Whether to trigger on space key */
  triggerOnSpace?: boolean;
  
  /** Whether to trigger on enter key */
  triggerOnEnter?: boolean;
}

/** Keyboard shortcut definition */
export interface KeyboardShortcut {
  /** Key combination (e.g., "Cmd+Shift+1") */
  key: string;
  
  /** Action to perform */
  action: string;
  
  /** Handler function */
  handler: (context: BlockOperationContext) => BlockOperationResult;
  
  /** Whether to prevent default behavior */
  preventDefault?: boolean;
}

/** Block validation result */
export interface BlockValidationResult {
  /** Whether the block is valid */
  isValid: boolean;
  
  /** Validation errors */
  errors?: string[];
  
  /** Validation warnings */
  warnings?: string[];
  
  /** Suggested fixes */
  fixes?: Array<{
    message: string;
    apply: () => void;
  }>;
}