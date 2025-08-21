# Content Block System Implementation Plan (Evolutionary)

**Date:** January 15, 2025 (Updated)  
**Project:** Velocity PRD Editor Enhancement  
**Feature:** Notion-like Content Block System (Virtual Blocks)  
**Status:** Phase 1 Complete, Phase 2 In Progress, Phase 3-4 Pending  
**Approach:** Evolutionary enhancement on existing Rich Text Unification

## Current Implementation Status (Updated January 15, 2025)

### ✅ **PHASE 1 COMPLETE** - Virtual Block Foundation
- **VirtualBlockManager**: Fully implemented with caching and all block operations
- **Virtual Block Types**: Complete type system with comprehensive interfaces  
- **NotionSectionEditor Integration**: Virtual blocks successfully integrated
- **Basic HTML Parsing**: Working with position tracking and block identification

### ✅ **PHASE 2 COMPLETE** - Block UI Overlay System  
- **EnhancedBlockControlsDnd**: ✅ Fully integrated with virtual block awareness
- **Slash Commands**: ✅ Block-aware context with suggested commands
- **Block Type Menu**: ✅ Created and integrated (BlockTypeMenu.tsx)
- **Visual Block Indicators**: ✅ Fully implemented with type indicators and actions

### 🔄 **PHASE 3 PARTIAL COMPLETE** - Navigation & Auto-Conversion
- ✅ **KeyboardNavigationManager**: Fully implemented
- ✅ **Auto-conversion Patterns**: Fully implemented with 8 conversion patterns
- ❌ **Multi-block Selection**: Not implemented
- ❌ **Performance Optimizations**: Not implemented

### 🔄 **PHASE 4 PARTIAL COMPLETE** - Drag/Drop Integration
- ✅ **Virtual Block Drag Integration**: Fully implemented with dual @dnd-kit + HTML5 approach
- ❌ **Multi-Block Selection**: Not implemented  
- ❌ **Performance Optimization**: Not implemented

## Current Component Integration Status

### ✅ **FULLY INTEGRATED COMPONENTS**

**BlockNotionPRDEditor.tsx** (`frontend/src/components/prd-editors/baseline/BlockNotionPRDEditor.tsx`)
- ✅ Lines 13, 22: VirtualContentBlock types imported and used
- ✅ Line 22: State management for section virtual blocks
- ✅ Lines 259-266: Virtual blocks enabled via props and callback handling
- ✅ Proper data flow to child components

**NotionSectionEditor.tsx** (`frontend/src/components/prd-editors/block-based/blocks/NotionSectionEditor.tsx`)
- ✅ Lines 22-24: VirtualBlockManager and types imported
- ✅ Lines 549-550: VirtualBlockManager instance and state management
- ✅ Lines 644-649: Virtual blocks parsed on editor updates
- ✅ Lines 674-729: Virtual block navigation in keyboard handler
- ✅ Lines 817-842: Virtual block integration with slash commands

**SectionBlockEditor.tsx** (`frontend/src/components/prd-editors/baseline/blocks/SectionBlockEditor.tsx`)
- ✅ Lines 21, 28-29: VirtualContentBlock types and props
- ✅ Line 40: Virtual blocks state management
- ✅ Proper prop forwarding to NotionSectionEditor

**Virtual Block Library** (`frontend/src/lib/virtual-blocks/`)
- ✅ Complete implementation with all utilities
- ✅ VirtualBlockManager with caching and full CRUD operations
- ✅ Comprehensive type system and utility functions

### 🔄 **PARTIALLY INTEGRATED COMPONENTS**

**EnhancedBlockControlsDnd.tsx** (`frontend/src/components/prd-editors/block-based/components/EnhancedBlockControlsDnd.tsx`)
- ✅ Lines 20, 27: VirtualContentBlock types imported
- ✅ Lines 171-178: Virtual block detection on mouse move
- ❌ Block-specific actions need completion
- ❌ Visual indicators for different block types missing

## Overview

Enhance the current PRD editor (which uses Rich Text Unification) with Notion-like block editing capabilities by implementing a virtual block layer on top of the existing HTML content model. This approach provides block-level UX without requiring data model changes, building incrementally on the recently implemented rich text system.

## Current State Analysis

### Recently Implemented Rich Text System (Jan 15, 2025)
- **Clean data model**: `{html: string, text: string}` as single source of truth
- **TipTap editor**: Modern rich text editing with bubble menu
- **Template system**: Structured templates for each PRD section
- **AI extraction**: Content extraction service for structured data
- **Performance optimized**: Debounced saves, proper indexing
- **No migration debt**: Clean implementation from start

### Enhancement Goals
- Add block-level editing UX while preserving HTML source of truth
- Enable "/" command for block type conversion  
- Implement keyboard navigation between semantic elements
- Provide drag & drop for content reordering
- Maintain backwards compatibility with existing rich text system

## Technical Specification

### 1. Virtual Block Model (No Database Changes)

```typescript
// Virtual blocks generated from HTML content
interface VirtualContentBlock {
  id: string                    // Generated from DOM position/content hash
  type: BlockType              // Detected from HTML element
  domElement: HTMLElement      // Reference to actual DOM node
  content: {
    html: string               // Raw HTML for this block
    text: string               // Plain text content
  }
  properties: BlockProperties  // Visual/interaction properties
  position: {
    start: number              // Character offset in full HTML
    end: number                // End character offset
  }
  parent?: VirtualContentBlock // For nested elements
}

// Block types detected from HTML structure
enum BlockType {
  PARAGRAPH = 'paragraph',      // <p> elements
  HEADING_1 = 'heading_1',      // <h1> elements  
  HEADING_2 = 'heading_2',      // <h2> elements
  HEADING_3 = 'heading_3',      // <h3> elements
  BULLET_LIST = 'bullet_list',  // <ul><li> elements
  NUMBERED_LIST = 'numbered_list', // <ol><li> elements
  QUOTE = 'quote',              // <blockquote> elements
  CODE = 'code',                // <pre><code> elements
  DIVIDER = 'divider',          // <hr> elements
  LIST_ITEM = 'list_item'       // Individual <li> elements
}

interface BlockProperties {
  isEditable: boolean
  isFocused: boolean
  isSelected: boolean
  showActions: boolean
}
```

### 2. Enhanced Component Architecture

```
BlockNotionPRDEditor (existing, enhanced)
├── SectionBlockEditor (existing, enhanced)
│   └── EnhancedNotionRichTextEditor (enhanced from existing)
│       ├── VirtualBlockManager (new layer)
│       ├── TipTapEditor (existing core)
│       ├── BlockOverlaySystem (new)
│       │   ├── BlockActionButtons (new)
│       │   ├── BlockDragHandles (new)
│       │   └── BlockTypeSelector (new)
│       └── KeyboardNavigationManager (new)
```

#### New Enhancement Layers

**VirtualBlockManager** (Core Enhancement)
```typescript
class VirtualBlockManager {
  parseHTMLToBlocks(html: string): VirtualContentBlock[]
  updateBlockInHTML(blockId: string, newContent: string): string
  insertBlockAfter(blockId: string, newBlock: Partial<VirtualContentBlock>): string
  deleteBlock(blockId: string): string
  reorderBlocks(fromIndex: number, toIndex: number): string
}
```

**BlockOverlaySystem** (UX Enhancement)
- Renders interactive elements on top of TipTap editor
- Shows block boundaries and actions on hover
- Handles "/" command trigger and menu positioning
- Manages drag handles and drop zones

**KeyboardNavigationManager** (Navigation Enhancement)
- Intercepts arrow key navigation between blocks
- Handles Enter/Backspace for block creation/deletion
- Manages focus states across virtual blocks
- Implements block-level shortcuts

### 3. No Database Changes Required

**Key Advantage**: The virtual block system requires **zero database schema changes**. The existing rich text unification schema already provides everything needed

### 4. Enhanced Service Layer (Client-Side Only)

```typescript
// EXTENDS existing prdService - no backend changes needed
interface VirtualBlockService {
  // Virtual block operations (client-side only)
  parseHTMLToVirtualBlocks(html: string): VirtualContentBlock[]
  updateVirtualBlockHTML(
    originalHTML: string, 
    blockId: string, 
    newContent: string
  ): string
  
  // Block manipulation (returns updated HTML)
  insertBlockAfter(
    html: string, 
    targetBlockId: string, 
    newBlock: { type: BlockType; content: string }
  ): string
  
  deleteVirtualBlock(html: string, blockId: string): string
  moveVirtualBlock(html: string, fromIndex: number, toIndex: number): string
  
  // Type conversion
  convertBlockType(
    html: string, 
    blockId: string, 
    newType: BlockType
  ): string
}

// USES existing prdService for persistence
const blockService = {
  async saveSection(sectionId: string, updatedHTML: string) {
    const text = extractTextFromHtml(updatedHTML)
    return prdService.updateSection(sectionId, { html: updatedHTML, text })
  }
}
```

### 5. User Experience Features

#### Block Operations
- **Add Block**: Click "+ Add Block" or Enter key
- **Delete Block**: Backspace on empty block or explicit delete
- **Duplicate Block**: Cmd+D keyboard shortcut
- **Convert Type**: "/" command shows type picker
- **Reorder**: Drag handle with visual drop zones
- **Indent/Outdent**: Tab/Shift+Tab for nesting

#### Keyboard Shortcuts
```typescript
const KEYBOARD_SHORTCUTS = {
  // Navigation
  'ArrowUp': 'focusPreviousBlock',
  'ArrowDown': 'focusNextBlock',
  
  // Block Creation
  'Enter': 'createBlockAfter',
  'Shift+Enter': 'insertLineBreak',
  
  // Block Deletion
  'Backspace': 'deleteBlockIfEmpty',
  'Cmd+Shift+Backspace': 'deleteBlock',
  
  // Type Conversion
  '/': 'showBlockTypePicker',
  'Cmd+Opt+1': 'convertToHeading1',
  'Cmd+Opt+2': 'convertToHeading2',
  'Cmd+Shift+7': 'convertToBulletList',
  'Cmd+Shift+8': 'convertToNumberedList',
  
  // Organization
  'Tab': 'indentBlock',
  'Shift+Tab': 'outdentBlock',
  'Cmd+D': 'duplicateBlock',
  
  // Selection
  'Shift+Click': 'extendSelection',
  'Cmd+A': 'selectAllInSection'
}
```

#### Auto-conversion Patterns
- `"# "` → Heading 1
- `"## "` → Heading 2  
- `"### "` → Heading 3
- `"- "` → Bullet List
- `"1. "` → Numbered List
- `"[ ] "` → Todo List
- `"> "` → Quote Block
- `"```"` → Code Block
- `"---"` → Divider

## Implementation Phases (Evolutionary Approach)

### Phase 1: Virtual Block Foundation
**Goal**: Build virtual block parsing and management layer on top of existing TipTap infrastructure

#### Task 1.1: Create VirtualBlockManager Class ✅ **COMPLETED**
**Files to modify:**
- ✅ Create: `frontend/src/lib/virtual-blocks/VirtualBlockManager.ts` - **DONE**
- ✅ Create: `frontend/src/lib/virtual-blocks/types.ts` - **DONE**
- ✅ Create: `frontend/src/lib/virtual-blocks/utils.ts` - **DONE**

**Implementation Status:**
- ✅ Complete VirtualBlockManager class with caching (lines 34-500)
- ✅ Comprehensive type system with 17 block types and validation
- ✅ Full CRUD operations: parseHTMLToBlocks, updateBlockInHTML, insertBlockAfter, deleteBlock, reorderBlocks, convertBlockType
- ✅ HTML parsing with position tracking and DOM element references
- ✅ Utility functions for block operations, validation, and sanitization

**Subtasks:**
✅ 1.1.1. Define TypeScript interfaces for VirtualContentBlock and related types - **COMPLETED**
✅ 1.1.2. Create HTML parser to identify block elements (`p`, `h1-h6`, `ul`, `ol`, `blockquote`, etc.) - **COMPLETED**
✅ 1.1.3. Implement unique ID generation based on DOM position and content hash - **COMPLETED**
✅ 1.1.4. Build position tracking system for character offsets within full HTML - **COMPLETED**
✅ 1.1.5. Create block type detection logic that maps HTML tags to BlockType enum - **COMPLETED**

#### Task 1.2: Enhance NotionSectionEditor with Virtual Block Support ✅ **COMPLETED**
**Files to modify:**
- ✅ `frontend/src/components/prd-editors/block-based/blocks/NotionSectionEditor.tsx` - **DONE**

**Implementation Status:**
- ✅ VirtualBlockManager integrated (lines 22-24, 549-550)
- ✅ Virtual block state management (line 550)
- ✅ onUpdate handler parsing HTML to virtual blocks (lines 644-649)
- ✅ Virtual blocks passed to onBlocksUpdate callback (line 648)
- ✅ Keyboard navigation integration (lines 674-729)
- ✅ Slash command integration with block context (lines 817-842)

**Subtasks:**
✅ 1.2.1. Replace existing hybridContent state with virtualBlocks state - **COMPLETED**
✅ 1.2.2. Integrate VirtualBlockManager into editor initialization - **COMPLETED**
✅ 1.2.3. Update TipTap onUpdate handler to parse HTML into virtual blocks - **COMPLETED**
✅ 1.2.4. Maintain backward compatibility with existing content format - **COMPLETED**
✅ 1.2.5. Add virtual block state management hooks - **COMPLETED**

#### Task 1.3: Create Block Operation Methods ✅ **COMPLETED**
**Files to modify:**
- ✅ `frontend/src/lib/virtual-blocks/VirtualBlockManager.ts` - **DONE**

**Implementation Status:**
- ✅ Complete method implementations (lines 174-440)
- ✅ updateBlockInHTML with validation (lines 174-212)
- ✅ insertBlockAfter with HTML generation (lines 217-265)
- ✅ deleteBlock with position-based removal (lines 270-308)
- ✅ reorderBlocks with complex position recalculation (lines 314-380)
- ✅ convertBlockType with tag transformation (lines 385-440)
- ✅ Error handling and validation for all operations

**Subtasks:**
✅ 1.3.1. Implement HTML parsing logic using DOM parser - **COMPLETED**
✅ 1.3.2. Create block content update methods that modify HTML - **COMPLETED**
✅ 1.3.3. Build block insertion/deletion operations - **COMPLETED**
✅ 1.3.4. Add block reordering functionality - **COMPLETED**
✅ 1.3.5. Implement block type conversion (paragraph → heading, etc.) - **COMPLETED**

### Phase 2: Block UI Overlay System
**Goal**: Add visual block indicators and interactions using existing EnhancedBlockControls

#### Task 2.1: Enhance EnhancedBlockControlsDnd for Virtual Blocks ✅ **COMPLETED**
**Files to modify:**
- ✅ `frontend/src/components/prd-editors/block-based/components/EnhancedBlockControlsDnd.tsx` - **DONE**

**Implementation Status:**
- ✅ Virtual block types imported with all required icons
- ✅ VirtualContentBlock interface fully integrated
- ✅ Mouse move handler with virtual block detection
- ✅ Virtual block state management
- ✅ Block-specific visual indicators with color-coded type labels
- ✅ Enhanced controls with block-specific conversion actions
- ✅ Clickable block type indicator to open conversion menu

**Subtasks:**
✅ 2.1.1. Add virtual block awareness to mouse move detection - **COMPLETED**
✅ 2.1.2. Integrate virtual block data with hover controls - **COMPLETED**
✅ 2.1.3. Update block positioning logic for virtual blocks - **COMPLETED**
✅ 2.1.4. Add visual indicators for different block types - **COMPLETED**
✅ 2.1.5. Enhance controls with block-specific actions - **COMPLETED**

#### Task 2.2: Implement Block Type Conversion Menu ✅ **COMPLETED**
**Files to modify:**
- ✅ Created: `frontend/src/components/prd-editors/block-based/blocks/BlockTypeMenu.tsx` - **DONE**
- ✅ Modified: `frontend/src/components/prd-editors/block-based/components/EnhancedBlockControlsDnd.tsx` - **INTEGRATED**

**Implementation Status:**
- ✅ BlockTypeMenu component created with full functionality
- ✅ Floating type selection menu with animations
- ✅ Block type conversion integrated with hover controls
- ✅ Visual indication of current block type with clickable indicator
- ✅ Full integration with EnhancedBlockControlsDnd

**Subtasks:**
✅ 2.2.1. Create floating block type selection menu component - **COMPLETED**
✅ 2.2.2. Add keyboard navigation for block type menu - **COMPLETED**
✅ 2.2.3. Implement block type conversion handlers - **COMPLETED**
✅ 2.2.4. Add visual feedback for current block type - **COMPLETED**
✅ 2.2.5. Integrate menu with existing slash command system - **COMPLETED**

#### Task 2.3: Enhance Slash Command Integration ✅ **COMPLETED**
**Files to modify:**
- ✅ `frontend/src/components/prd-editors/block-based/blocks/NotionSectionEditor.tsx` - **DONE**

**Implementation Status:**
- ✅ Slash command detection working with '/' trigger
- ✅ Virtual block context fully integrated in slash commands
- ✅ Block type conversion on command execution
- ✅ Command menu positioning relative to cursor
- ✅ Basic auto-conversion pattern detection
- ✅ Block-aware command suggestions with context filtering
- ✅ Enhanced command menu showing "Suggested" commands

**Subtasks:**
✅ 2.3.1. Integrate slash commands with virtual block context - **COMPLETED**
✅ 2.3.2. Add block-aware command suggestions - **COMPLETED**
✅ 2.3.3. Enhance command execution for virtual blocks - **COMPLETED**
✅ 2.3.4. Add auto-conversion patterns for common formats - **COMPLETED**
✅ 2.3.5. Implement command menu positioning relative to blocks - **COMPLETED**

### Phase 3: Keyboard Navigation & Block Operations
**Goal**: Implement Notion-like keyboard behavior for virtual blocks

#### Task 3.1: Create KeyboardNavigationManager ✅ **COMPLETED**
**Files created:**
- ✅ `frontend/src/lib/virtual-blocks/KeyboardNavigationManager.ts` - **DONE**

**Files modified:**
- ✅ `frontend/src/components/prd-editors/block-based/blocks/NotionSectionEditor.tsx` - **DONE**
- ✅ `frontend/src/components/prd-editors/baseline/blocks/NotionRichTextEditor.tsx` - **DONE**

**Specific changes:**
```typescript
// New KeyboardNavigationManager class
class KeyboardNavigationManager {
  constructor(private editor: Editor, private virtualBlockManager: VirtualBlockManager) {}
  
  handleArrowNavigation(direction: 'up' | 'down'): boolean
  handleEnterKey(isShift: boolean): boolean
  handleBackspaceKey(): boolean
  handleTabIndentation(isShift: boolean): boolean
  focusBlock(blockId: string): void
  createBlockAfter(blockId: string, type: BlockType): void
  deleteBlock(blockId: string): void
}

// Integration in NotionSectionEditor
const keyboardManager = useMemo(() => 
  new KeyboardNavigationManager(editor!, virtualBlockManager), 
  [editor, virtualBlockManager]
)
```

**Implementation Status:**
- ✅ Complete KeyboardNavigationManager class with all navigation methods
- ✅ Arrow key navigation with block boundary detection
- ✅ Smart Enter key handling (new block vs line break)
- ✅ Intelligent Backspace for empty blocks and merging
- ✅ Tab/Shift+Tab for list indentation
- ✅ Focus management across virtual blocks
- ✅ Block duplication (Cmd/Ctrl+D)
- ✅ Block type conversion shortcuts
- ✅ Full integration with NotionSectionEditor via useEffect
- ✅ Full integration with NotionRichTextEditor for baseline path

**Subtasks:**
✅ 3.1.1. Implement arrow key navigation between virtual blocks - **COMPLETED**
✅ 3.1.2. Add smart Enter key behavior (new block vs line break) - **COMPLETED**
✅ 3.1.3. Create intelligent Backspace handling for empty blocks - **COMPLETED**
✅ 3.1.4. Add Tab/Shift+Tab for block indentation - **COMPLETED**
✅ 3.1.5. Implement focus management across blocks - **COMPLETED**

#### Task 3.2: Add Block Creation and Deletion ✅ **COMPLETED**
**Files modified:**
- ✅ `frontend/src/lib/virtual-blocks/VirtualBlockManager.ts` - **ENHANCED**
- ✅ `frontend/src/lib/virtual-blocks/UndoRedoManager.ts` - **CREATED**
- ✅ `frontend/src/components/prd-editors/block-based/components/EnhancedBlockControlsDnd.tsx` - **ENHANCED**

**Implementation Status:**
- ✅ VirtualBlockManager enhanced with comprehensive block operations
- ✅ UndoRedoManager class created for history management (50 states)
- ✅ Block creation methods: `createBlockAt`, `insertBlockAfter`
- ✅ Block deletion methods: `deleteBlock`, `deleteBlocks`
- ✅ Block duplication method: `duplicateBlock`
- ✅ Block replacement method: `replaceBlock`
- ✅ Undo/Redo support with full history tracking
- ✅ EnhancedBlockControlsDnd integrated with VirtualBlockManager
- ✅ UI buttons added for duplicate (Copy icon) and delete (Trash2 icon)
- ✅ Virtual block-aware operations with HTML fallback

**Subtasks:**
✅ 3.2.1. Add block creation methods to VirtualBlockManager - **COMPLETED**
✅ 3.2.2. Implement block deletion with proper cleanup - **COMPLETED**
✅ 3.2.3. Add block duplication functionality - **COMPLETED**
✅ 3.2.4. Create block type conversion operations - **COMPLETED**
✅ 3.2.5. Implement undo/redo support for block operations - **COMPLETED**

#### Task 3.3: Auto-conversion Patterns ✅ **COMPLETED**
**Files modified:**
- ✅ Created: `frontend/src/lib/virtual-blocks/AutoConversionManager.ts` - **DONE**
- ✅ Modified: `frontend/src/components/prd-editors/block-based/blocks/NotionSectionEditor.tsx` - **DONE**
- ✅ Modified: `frontend/src/components/prd-editors/baseline/blocks/NotionRichTextEditor.tsx` - **DONE**

**Implementation Status:**
- ✅ Complete AutoConversionManager class with 8 auto-conversion patterns
- ✅ Pattern detection for `# ` → Heading 1, `## ` → Heading 2, `### ` → Heading 3  
- ✅ List conversion: `- ` → Bullet List, `1. ` → Numbered List
- ✅ Block conversion: `> ` → Blockquote, ``` → Code Block, `---` → Divider
- ✅ Smart trigger detection on space and Enter keys
- ✅ TipTap transaction-based conversions with proper state management
- ✅ Integration with NotionSectionEditor keyboard handler (lines 839-845)
- ✅ Integration with NotionRichTextEditor for baseline path (lines 98-126)
- ✅ Error handling and graceful fallback on conversion failure

**Subtasks:**
✅ 3.3.1. Define auto-conversion pattern recognition - **COMPLETED**
✅ 3.3.2. Implement heading auto-conversion (# → h1, ## → h2, etc.) - **COMPLETED**
✅ 3.3.3. Add list auto-conversion (- → bullet, 1. → numbered) - **COMPLETED**
✅ 3.3.4. Create blockquote and code block patterns - **COMPLETED**
✅ 3.3.5. Add divider auto-conversion (--- → hr) - **COMPLETED**

### Phase 4: Drag & Drop Integration
**Goal**: Integrate virtual blocks with existing @dnd-kit drag and drop system

#### Task 4.1: Virtual Block Drag Integration ✅ **COMPLETED**
**Files created/modified:**
- ✅ Created: `frontend/src/components/prd-editors/block-based/dnd/VirtualBlockSortable.tsx` - **DONE**
- ✅ Created: `frontend/src/components/prd-editors/block-based/dnd/VirtualBlockDragOverlay.tsx` - **DONE**
- ✅ Created: `frontend/src/components/prd-editors/block-based/dnd/VirtualBlockDndProvider.tsx` - **DONE**
- ✅ Created: `frontend/src/components/prd-editors/block-based/hooks/useVirtualBlockDragIntegration.ts` - **DONE**
- ✅ Modified: `frontend/src/components/prd-editors/block-based/dnd/index.ts` - **DONE**
- ✅ Modified: `frontend/src/components/prd-editors/block-based/blocks/NotionSectionEditor.tsx` - **DONE**
- ✅ Modified: `frontend/src/components/prd-editors/block-based/components/EnhancedBlockControlsDnd.tsx` - **DONE**
- ✅ Modified: `frontend/src/styles/notion-editor.css` - **DONE**

**Implementation Status:**
- ✅ Complete virtual block drag system with multiple integration approaches
- ✅ VirtualBlockSortable component with @dnd-kit integration
- ✅ VirtualBlockDragOverlay with enhanced visual feedback and block type indicators
- ✅ VirtualBlockDndProvider for managing drag operations and collisions
- ✅ useVirtualBlockDragIntegration hook for direct TipTap element enhancement
- ✅ Dual integration strategy: @dnd-kit components + native HTML5 drag hooks
- ✅ Enhanced TipTap elements with drag data attributes and visual feedback
- ✅ Block reordering through VirtualBlockManager with HTML regeneration
- ✅ CSS styling for hover effects, drag feedback, and block type indicators
- ✅ Integration with NotionSectionEditor and EnhancedBlockControlsDnd

**Key Features:**
- **Drag Handles**: Virtual blocks show grab cursors and drag handles on hover
- **Visual Feedback**: Color-coded borders by block type (blue for H1, green for H2, etc.)
- **Drag Overlay**: Custom drag preview showing block type, content preview, and metadata
- **HTML5 + @dnd-kit**: Hybrid approach supporting both native drag events and @dnd-kit
- **Position Tracking**: Automatic DOM element enhancement with virtual block data
- **Smooth Reordering**: VirtualBlockManager handles HTML regeneration and cursor position

**Subtasks:**
✅ 4.1.1. Wrap virtual blocks with @dnd-kit sortable components - **COMPLETED**
✅ 4.1.2. Add virtual block data to drag context - **COMPLETED**
✅ 4.1.3. Implement drop zone detection for virtual blocks - **COMPLETED**
✅ 4.1.4. Create visual feedback during virtual block dragging - **COMPLETED**
✅ 4.1.5. Handle block reordering with HTML regeneration - **COMPLETED**

#### Task 4.2: Multi-Block Selection
**Files to create:**
- `frontend/src/lib/virtual-blocks/SelectionManager.ts`

**Files to modify:**
- `frontend/src/components/prd-editors/block-based/blocks/NotionSectionEditor.tsx` (add selection state)
- `frontend/src/components/prd-editors/baseline/blocks/NotionRichTextEditor.tsx`

**Specific changes:**
```typescript
// Selection manager for multiple blocks
class SelectionManager {
  private selectedBlocks: Set<string> = new Set()
  
  selectBlock(blockId: string, isMulti: boolean = false): void
  deselectBlock(blockId: string): void
  selectRange(startBlockId: string, endBlockId: string): void
  clearSelection(): void
  getSelectedBlocks(): string[]
  isSelected(blockId: string): boolean
}

// Integration in NotionSectionEditor
const [selectedBlocks, setSelectedBlocks] = useState<Set<string>>(new Set())
const selectionManager = useMemo(() => new SelectionManager(), [])

// Enhanced click handler for block selection
const handleBlockClick = useCallback((e: MouseEvent, blockId: string) => {
  if (e.shiftKey) {
    selectionManager.selectRange(lastSelectedBlock, blockId)
  } else if (e.ctrlKey || e.metaKey) {
    selectionManager.selectBlock(blockId, true)
  } else {
    selectionManager.selectBlock(blockId, false)
  }
  
  setSelectedBlocks(new Set(selectionManager.getSelectedBlocks()))
}, [selectionManager, lastSelectedBlock])
```

**Subtasks:**
4.2.1. Create multi-block selection state management
4.2.2. Add Shift+click for range selection
4.2.3. Implement Ctrl/Cmd+click for multi-selection
4.2.4. Add visual feedback for selected blocks
4.2.5. Create bulk operations for selected blocks

#### Task 4.3: Performance Optimization
**Files to modify:**
- `frontend/src/lib/virtual-blocks/VirtualBlockManager.ts`
- `frontend/src/components/prd-editors/block-based/blocks/NotionSectionEditor.tsx`
- `frontend/src/components/prd-editors/baseline/blocks/NotionRichTextEditor.tsx`

**Specific changes:**
```typescript
// Optimized virtual block parsing with caching
class VirtualBlockManager {
  private blockCache = new Map<string, VirtualContentBlock[]>()
  private htmlHash: string = ''
  
  parseHTMLToBlocks(html: string): VirtualContentBlock[] {
    const currentHash = this.hashHTML(html)
    
    if (this.htmlHash === currentHash && this.blockCache.has(currentHash)) {
      return this.blockCache.get(currentHash)!
    }
    
    const blocks = this.doParse(html)
    this.blockCache.set(currentHash, blocks)
    this.htmlHash = currentHash
    
    return blocks
  }
  
  private hashHTML(html: string): string {
    // Fast hash function for HTML content
    let hash = 0
    for (let i = 0; i < html.length; i++) {
      const char = html.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString()
  }
}

// Debounced updates in NotionSectionEditor
const debouncedUpdateBlocks = useMemo(
  () => debounce((html: string) => {
    const blocks = virtualBlockManager.parseHTMLToBlocks(html)
    setVirtualBlocks(blocks)
  }, 150),
  [virtualBlockManager]
)
```

**Subtasks:**
4.3.1. Add caching for virtual block parsing results
4.3.2. Implement debounced updates for block changes
4.3.3. Optimize DOM queries and event handlers
4.3.4. Add memory cleanup for removed blocks
4.3.5. Profile and optimize rendering performance

## Technical Considerations

### Performance (Enhanced Approach)
- **Efficient HTML Parsing**: Cache virtual blocks to avoid re-parsing
- **Selective Re-rendering**: Only update changed blocks in overlay
- **Debounced HTML Updates**: Batch virtual block changes before HTML regeneration
- **Memory Management**: Clean up DOM references for removed blocks

### Backwards Compatibility
- **Zero Breaking Changes**: Existing PRDs continue working unchanged
- **Graceful Degradation**: Falls back to standard TipTap if virtual blocks fail
- **Feature Flag**: Can enable/disable block features per section or user
- **Progressive Enhancement**: Block features enhance rather than replace existing functionality

### HTML Integrity
- **Robust Parsing**: Handle malformed HTML gracefully
- **Content Preservation**: Ensure HTML→blocks→HTML round-trip preserves content
- **Validation**: Validate HTML structure after block operations
- **Fallback Recovery**: Revert to last known good HTML state on errors