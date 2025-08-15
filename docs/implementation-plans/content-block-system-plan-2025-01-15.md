# Content Block System Implementation Plan (Evolutionary)

**Date:** January 15, 2025 (Updated)  
**Project:** Velocity PRD Editor Enhancement  
**Feature:** Notion-like Content Block System (Virtual Blocks)  
**Status:** Planning Phase  
**Approach:** Evolutionary enhancement on existing Rich Text Unification

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

#### Task 1.1: Create VirtualBlockManager Class
**Files to modify:**
- Create: `frontend/src/lib/virtual-blocks/VirtualBlockManager.ts`
- Create: `frontend/src/lib/virtual-blocks/types.ts`
- Create: `frontend/src/lib/virtual-blocks/utils.ts`

**Specific changes:**
```typescript
// frontend/src/lib/virtual-blocks/types.ts
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

enum BlockType {
  PARAGRAPH = 'paragraph',
  HEADING_1 = 'heading_1',
  HEADING_2 = 'heading_2',
  HEADING_3 = 'heading_3',
  BULLET_LIST = 'bullet_list',
  NUMBERED_LIST = 'numbered_list',
  QUOTE = 'quote',
  CODE = 'code',
  DIVIDER = 'divider',
  LIST_ITEM = 'list_item'
}
```

**Subtasks:**
1.1.1. Define TypeScript interfaces for VirtualContentBlock and related types
1.1.2. Create HTML parser to identify block elements (`p`, `h1-h6`, `ul`, `ol`, `blockquote`, etc.)
1.1.3. Implement unique ID generation based on DOM position and content hash
1.1.4. Build position tracking system for character offsets within full HTML
1.1.5. Create block type detection logic that maps HTML tags to BlockType enum

#### Task 1.2: Enhance NotionSectionEditor with Virtual Block Support
**Files to modify:**
- `frontend/src/components/prd/blocks/NotionSectionEditor.tsx` (lines 532-670)

**Specific changes:**
```typescript
// Lines 532-540: Replace hybrid content initialization
const [virtualBlocks, setVirtualBlocks] = useState<VirtualContentBlock[]>([])
const virtualBlockManager = useMemo(() => new VirtualBlockManager(), [])

// Lines 602-626: Replace onUpdate handler
onUpdate: ({ editor }) => {
  const html = editor.getHTML()
  const blocks = virtualBlockManager.parseHTMLToBlocks(html)
  setVirtualBlocks(blocks)
  
  const structured = transformRichToStructured(type, html)
  onUpdate(id, structured)
}
```

**Subtasks:**
1.2.1. Replace existing hybridContent state with virtualBlocks state
1.2.2. Integrate VirtualBlockManager into editor initialization
1.2.3. Update TipTap onUpdate handler to parse HTML into virtual blocks
1.2.4. Maintain backward compatibility with existing content format
1.2.5. Add virtual block state management hooks

#### Task 1.3: Create Block Operation Methods
**Files to modify:**
- `frontend/src/lib/virtual-blocks/VirtualBlockManager.ts`

**Specific changes:**
```typescript
class VirtualBlockManager {
  parseHTMLToBlocks(html: string): VirtualContentBlock[]
  updateBlockInHTML(blockId: string, newContent: string): string
  insertBlockAfter(blockId: string, newBlock: Partial<VirtualContentBlock>): string
  deleteBlock(blockId: string): string
  reorderBlocks(fromIndex: number, toIndex: number): string
  convertBlockType(blockId: string, newType: BlockType): string
}
```

**Subtasks:**
1.3.1. Implement HTML parsing logic using DOM parser
1.3.2. Create block content update methods that modify HTML
1.3.3. Build block insertion/deletion operations
1.3.4. Add block reordering functionality
1.3.5. Implement block type conversion (paragraph → heading, etc.)

### Phase 2: Block UI Overlay System
**Goal**: Add visual block indicators and interactions using existing EnhancedBlockControls

#### Task 2.1: Enhance EnhancedBlockControlsDnd for Virtual Blocks
**Files to modify:**
- `frontend/src/components/prd/EnhancedBlockControlsDnd.tsx` (lines 103-322)

**Specific changes:**
```typescript
// Lines 119-141: Add virtual block integration
interface BlockControlsProps {
  editor: Editor | null
  containerRef: React.RefObject<HTMLDivElement | null>
  sectionId: string
  blockId?: string
  virtualBlocks?: VirtualContentBlock[]
  onBlockInsert?: (type: string) => void
  onBlockUpdate?: (blockId: string, content: string) => void
}

// Lines 149-225: Enhance mouse move handler
const handleMouseMove = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  const block = target.closest('.ProseMirror > *') as HTMLElement
  
  if (block && virtualBlocks) {
    const blockId = block.getAttribute('data-block-id')
    const virtualBlock = virtualBlocks.find(vb => vb.id === blockId)
    if (virtualBlock) {
      setHoveredBlock(block)
      setCurrentVirtualBlock(virtualBlock)
    }
  }
}
```

**Subtasks:**
2.1.1. Add virtual block awareness to mouse move detection
2.1.2. Integrate virtual block data with hover controls
2.1.3. Update block positioning logic for virtual blocks
2.1.4. Add visual indicators for different block types
2.1.5. Enhance controls with block-specific actions

#### Task 2.2: Implement Block Type Conversion Menu
**Files to modify:**
- Create: `frontend/src/components/prd/blocks/BlockTypeMenu.tsx`
- Modify: `frontend/src/components/prd/EnhancedBlockControlsDnd.tsx` (lines 323-454)

**Specific changes:**
```typescript
// New BlockTypeMenu component
export function BlockTypeMenu({ 
  position, 
  onTypeSelect, 
  onClose,
  currentType 
}: BlockTypeMenuProps) {
  const blockTypes = [
    { type: BlockType.PARAGRAPH, icon: Type, label: 'Text' },
    { type: BlockType.HEADING_1, icon: Heading1, label: 'Heading 1' },
    // ... other block types
  ]

  return (
    <motion.div 
      className="block-type-menu"
      style={{ top: position.top, left: position.left }}
    >
      {blockTypes.map(type => (
        <BlockTypeOption 
          key={type.type}
          type={type}
          isActive={currentType === type.type}
          onClick={() => onTypeSelect(type.type)}
        />
      ))}
    </motion.div>
  )
}
```

**Subtasks:**
2.2.1. Create floating block type selection menu component
2.2.2. Add keyboard navigation for block type menu
2.2.3. Implement block type conversion handlers
2.2.4. Add visual feedback for current block type
2.2.5. Integrate menu with existing slash command system

#### Task 2.3: Enhance Slash Command Integration
**Files to modify:**
- `frontend/src/components/prd/blocks/NotionSectionEditor.tsx` (lines 634-668)

**Specific changes:**
```typescript
// Lines 634-668: Enhance handleKeyDown for virtual blocks
handleKeyDown: (view, event) => {
  if (event.key === '/' && !showSlashCommand && enableSlashCommands) {
    const pos = view.state.selection.from
    const blockId = virtualBlockManager.getBlockAtPosition(pos)
    
    setSlashCommandContext({ blockId, position: pos })
    setSlashCommandPosition(coords)
    setShowSlashCommand(true)
    return true
  }
  
  // Enhanced navigation for virtual blocks
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    return handleVirtualBlockNavigation(event.key, view)
  }
}
```

**Subtasks:**
2.3.1. Integrate slash commands with virtual block context
2.3.2. Add block-aware command suggestions
2.3.3. Enhance command execution for virtual blocks
2.3.4. Add auto-conversion patterns for common formats
2.3.5. Implement command menu positioning relative to blocks

### Phase 3: Keyboard Navigation & Block Operations
**Goal**: Implement Notion-like keyboard behavior for virtual blocks

#### Task 3.1: Create KeyboardNavigationManager
**Files to create:**
- `frontend/src/lib/virtual-blocks/KeyboardNavigationManager.ts`

**Files to modify:**
- `frontend/src/components/prd/blocks/NotionSectionEditor.tsx` (lines 634-668)

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

**Subtasks:**
3.1.1. Implement arrow key navigation between virtual blocks
3.1.2. Add smart Enter key behavior (new block vs line break)
3.1.3. Create intelligent Backspace handling for empty blocks
3.1.4. Add Tab/Shift+Tab for block indentation
3.1.5. Implement focus management across blocks

#### Task 3.2: Add Block Creation and Deletion
**Files to modify:**
- `frontend/src/lib/virtual-blocks/VirtualBlockManager.ts`
- `frontend/src/components/prd/EnhancedBlockControlsDnd.tsx` (lines 269-321)

**Specific changes:**
```typescript
// Enhanced block operations
handleAddNewLine = useCallback(() => {
  if (!editor || !hoveredBlock || !virtualBlocks) return
  
  const blockId = hoveredBlock.getAttribute('data-block-id')
  const currentBlock = virtualBlocks.find(vb => vb.id === blockId)
  
  if (currentBlock) {
    const newBlockId = virtualBlockManager.insertBlockAfter(
      currentBlock.id, 
      { type: BlockType.PARAGRAPH, content: { html: '<p></p>', text: '' } }
    )
    
    // Update editor with new HTML
    const updatedHTML = virtualBlockManager.getHTML()
    editor.commands.setContent(updatedHTML)
    
    // Focus new block
    keyboardManager.focusBlock(newBlockId)
  }
}, [editor, hoveredBlock, virtualBlocks, virtualBlockManager, keyboardManager])
```

**Subtasks:**
3.2.1. Add block creation methods to VirtualBlockManager
3.2.2. Implement block deletion with proper cleanup
3.2.3. Add block duplication functionality
3.2.4. Create block type conversion operations
3.2.5. Implement undo/redo support for block operations

#### Task 3.3: Auto-conversion Patterns
**Files to modify:**
- `frontend/src/lib/virtual-blocks/AutoConversionManager.ts` (new file)
- `frontend/src/components/prd/blocks/NotionSectionEditor.tsx` (lines 634-668)

**Specific changes:**
```typescript
// Auto-conversion patterns
const autoConversionPatterns = {
  '^# ': () => convertToHeading(1),
  '^## ': () => convertToHeading(2),
  '^### ': () => convertToHeading(3),
  '^- ': () => convertToBulletList(),
  '^\\d+\\. ': () => convertToNumberedList(),
  '^> ': () => convertToBlockquote(),
  '^```': () => convertToCodeBlock(),
  '^---$': () => convertToDivider()
}

// Integration in keydown handler
handleKeyDown: (view, event) => {
  if (event.key === ' ') {
    const currentLine = getCurrentLineText(view)
    const pattern = Object.keys(autoConversionPatterns).find(p => 
      new RegExp(p).test(currentLine)
    )
    
    if (pattern) {
      autoConversionPatterns[pattern]()
      return true
    }
  }
}
```

**Subtasks:**
3.3.1. Define auto-conversion pattern recognition
3.3.2. Implement heading auto-conversion (# → h1, ## → h2, etc.)
3.3.3. Add list auto-conversion (- → bullet, 1. → numbered)
3.3.4. Create blockquote and code block patterns
3.3.5. Add divider auto-conversion (--- → hr)

### Phase 4: Drag & Drop Integration
**Goal**: Integrate virtual blocks with existing @dnd-kit drag and drop system

#### Task 4.1: Virtual Block Drag Integration
**Files to modify:**
- `frontend/src/components/prd/dnd/SortableContentLine.tsx` (enhance for virtual blocks)
- `frontend/src/components/prd/EnhancedBlockControlsDnd.tsx` (lines 118-148)

**Specific changes:**
```typescript
// Enhanced sortable integration
const VirtualBlockSortable = ({ virtualBlock, children }: VirtualBlockSortableProps) => {
  const sortable = useSortable({
    id: virtualBlock.id,
    data: {
      type: 'virtual-block',
      blockType: virtualBlock.type,
      sectionId: virtualBlock.sectionId,
      virtualBlock
    }
  })

  return (
    <div
      ref={sortable.setNodeRef}
      {...sortable.attributes}
      {...sortable.listeners}
      data-block-id={virtualBlock.id}
      data-block-type={virtualBlock.type}
      className={cn(
        'virtual-block-container',
        sortable.isDragging && 'opacity-50'
      )}
      style={{
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition
      }}
    >
      {children}
    </div>
  )
}
```

**Subtasks:**
4.1.1. Wrap virtual blocks with @dnd-kit sortable components
4.1.2. Add virtual block data to drag context
4.1.3. Implement drop zone detection for virtual blocks
4.1.4. Create visual feedback during virtual block dragging
4.1.5. Handle block reordering with HTML regeneration

#### Task 4.2: Multi-Block Selection
**Files to create:**
- `frontend/src/lib/virtual-blocks/SelectionManager.ts`

**Files to modify:**
- `frontend/src/components/prd/blocks/NotionSectionEditor.tsx` (add selection state)

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
- `frontend/src/components/prd/blocks/NotionSectionEditor.tsx`

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