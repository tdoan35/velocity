# Comprehensive Drag & Drop Refactoring Plan Using @dnd-kit

## Executive Summary

This document outlines a comprehensive refactoring plan to replace the problematic native HTML5 drag-and-drop implementation with @dnd-kit, addressing all identified issues in the BlockBasedPRDEditor drag system. The solution will provide a robust, maintainable, and performant drag-and-drop experience.

## Current Issues Summary

### Critical Problems
1. **Multiple Competing Handlers**: Multiple components implement their own drag logic, causing conflicts
2. **Re-rendering During Drag**: Components re-render mid-drag, breaking the drag chain
3. **Event Duplication**: useDragCleanup hook creates 20+ duplicate events per drag
4. **State Corruption**: Non-atomic operations lead to corrupted content structure
5. **TipTap Interference**: Editor's native drag conflicts with custom implementation

## Architecture Design

### Core Principles
1. **Single Source of Truth**: One drag context provider at the root level
2. **Clear Separation of Concerns**: Distinct handling for section vs content drags
3. **Immutable State Updates**: All drag operations are atomic
4. **No Component Re-renders**: Use stable references and memoization
5. **Framework-Managed Cleanup**: Let @dnd-kit handle all cleanup operations

### Component Hierarchy

```
BlockBasedPRDEditor (Root DnD Context)
├── DndContext (Provider)
├── SortableContext (Sections)
│   └── SortableSection (Wrapper)
│       └── NotionSectionEditor
│           ├── SortableContext (Content Lines)
│           └── SortableContentLine (Wrapper)
│               └── TipTap Editor Content
```

## Implementation Plan

### Phase 1: Foundation Setup (Priority: High)

#### 1.1 Create New DnD Infrastructure

**New Files to Create:**

```typescript
// frontend/src/components/prd/dnd/DndProvider.tsx
import { DndContext, DragEndEvent, DragStartEvent, DragOverlay, closestCenter } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers'

export const PRDDndProvider: React.FC<{
  sections: FlexiblePRDSection[]
  onSectionReorder: (sections: FlexiblePRDSection[]) => void
  children: React.ReactNode
}> = ({ sections, onSectionReorder, children }) => {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<'section' | 'content' | null>(null)
  
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )
  
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event
    setActiveId(active.id as string)
    setActiveType(active.data.current?.type || null)
  }
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    if (active.id !== over?.id) {
      // Handle reordering logic
      if (activeType === 'section') {
        handleSectionReorder(active.id, over?.id)
      }
    }
    
    setActiveId(null)
    setActiveType(null)
  }
  
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxis]}
    >
      <SortableContext items={sections.map(s => s.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
      <DragOverlay>
        {activeId ? <DragOverlayContent id={activeId} type={activeType} /> : null}
      </DragOverlay>
    </DndContext>
  )
}
```

```typescript
// frontend/src/components/prd/dnd/SortableSection.tsx
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export const SortableSection: React.FC<{
  id: string
  children: React.ReactNode
}> = ({ id, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: {
      type: 'section',
    },
  })
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  
  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <div className="drag-handle" {...listeners}>
        <GripVertical />
      </div>
      {children}
    </div>
  )
}
```

```typescript
// frontend/src/components/prd/dnd/SortableContentLine.tsx
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export const SortableContentLine: React.FC<{
  id: string
  sectionId: string
  children: React.ReactNode
}> = ({ id, sectionId, children }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id,
    data: {
      type: 'content',
      sectionId,
    },
  })
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  
  return (
    <div ref={setNodeRef} style={style} className="content-line">
      <div className="content-drag-handle" {...listeners} {...attributes}>
        <GripVertical size={16} />
      </div>
      {children}
    </div>
  )
}
```

#### 1.2 Create New Store

```typescript
// frontend/src/stores/dndStore.ts
import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

interface DndState {
  activeId: string | null
  activeType: 'section' | 'content' | null
  activeSectionId: string | null // For content drags
  overId: string | null
  overType: 'section' | 'content' | null
  isDragging: boolean
}

interface DndActions {
  setActive: (id: string | null, type: 'section' | 'content' | null, sectionId?: string | null) => void
  setOver: (id: string | null, type: 'section' | 'content' | null) => void
  reset: () => void
}

export const useDndStore = create<DndState & DndActions>()(
  subscribeWithSelector((set) => ({
    activeId: null,
    activeType: null,
    activeSectionId: null,
    overId: null,
    overType: null,
    isDragging: false,
    
    setActive: (id, type, sectionId = null) => set({
      activeId: id,
      activeType: type,
      activeSectionId: sectionId,
      isDragging: id !== null,
    }),
    
    setOver: (id, type) => set({
      overId: id,
      overType: type,
    }),
    
    reset: () => set({
      activeId: null,
      activeType: null,
      activeSectionId: null,
      overId: null,
      overType: null,
      isDragging: false,
    }),
  }))
)
```

### Phase 2: Refactor Existing Components (Priority: High)

#### 2.1 Refactor BlockBasedPRDEditor

```typescript
// Changes to BlockBasedPRDEditor.enhanced.tsx
export function EnhancedBlockBasedPRDEditor({ projectId, onClose, className }: EnhancedBlockBasedPRDEditorProps) {
  // Remove all drag-related state and handlers
  // Remove useDragCleanup() - no longer needed
  // Remove manual drag handlers
  
  const handleSectionReorder = useCallback((sections: FlexiblePRDSection[]) => {
    setSections(sections)
    // Debounced save to backend
    debouncedSave(sections)
  }, [])
  
  return (
    <PRDDndProvider sections={sections} onSectionReorder={handleSectionReorder}>
      <div className="prd-editor">
        {sections.map((section) => (
          <SortableSection key={section.id} id={section.id}>
            <NotionSectionEditor
              {...section}
              onUpdate={(content) => handleSectionUpdate(section.id, content)}
            />
          </SortableSection>
        ))}
      </div>
    </PRDDndProvider>
  )
}
```

#### 2.2 Refactor NotionSectionEditor

```typescript
// Changes to NotionSectionEditor.tsx
export function NotionSectionEditor({ id, content, ...props }: NotionSectionEditorProps) {
  // Remove useDragCleanup() - no longer needed
  // Remove all drag event handlers
  
  // Parse content lines for sortable context
  const contentLines = useMemo(() => parseContentToLines(content), [content])
  
  const handleContentReorder = useCallback((lines: ContentLine[]) => {
    const updatedContent = linesToContent(lines)
    props.onUpdate?.(updatedContent)
  }, [props.onUpdate])
  
  return (
    <SectionBlock {...props}>
      <ContentDndProvider 
        sectionId={id} 
        lines={contentLines} 
        onReorder={handleContentReorder}
      >
        {contentLines.map((line) => (
          <SortableContentLine key={line.id} id={line.id} sectionId={id}>
            <TipTapLineEditor content={line.content} onChange={...} />
          </SortableContentLine>
        ))}
      </ContentDndProvider>
    </SectionBlock>
  )
}
```

#### 2.3 Create ContentDndProvider

```typescript
// frontend/src/components/prd/dnd/ContentDndProvider.tsx
export const ContentDndProvider: React.FC<{
  sectionId: string
  lines: ContentLine[]
  onReorder: (lines: ContentLine[]) => void
  children: React.ReactNode
}> = ({ sectionId, lines, onReorder, children }) => {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  )
  
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    // Ensure we're only handling content within this section
    if (
      active.data.current?.sectionId === sectionId &&
      over?.data.current?.sectionId === sectionId
    ) {
      if (active.id !== over.id) {
        const oldIndex = lines.findIndex(l => l.id === active.id)
        const newIndex = lines.findIndex(l => l.id === over.id)
        
        const reorderedLines = arrayMove(lines, oldIndex, newIndex)
        onReorder(reorderedLines)
      }
    }
  }
  
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToParentElement]}
    >
      <SortableContext items={lines.map(l => l.id)} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}
```

### Phase 3: TipTap Integration (Priority: Medium)

#### 3.1 Create TipTap Line Editor

```typescript
// frontend/src/components/prd/TipTapLineEditor.tsx
export const TipTapLineEditor: React.FC<{
  content: string
  onChange: (content: string) => void
  readOnly?: boolean
}> = ({ content, onChange, readOnly = false }) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable TipTap's drag-drop completely
        dropcursor: false,
        dragAndDrop: false,
      }),
    ],
    content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
  })
  
  return <EditorContent editor={editor} />
}
```

### Phase 4: Remove Legacy Code (Priority: High)

#### 4.1 Files to Remove/Deprecate
- `frontend/src/components/prd/EnhancedBlockControls.tsx` - Replace with DnD components
- `frontend/src/hooks/useDragCleanup.ts` - No longer needed
- `frontend/src/utils/dragDetection.ts` - Replace with @dnd-kit utilities
- `frontend/src/utils/dragLogger.ts` - No longer needed
- `frontend/src/utils/dragValidator.ts` - No longer needed
- `frontend/src/stores/dragStateStore.ts` - Replace with dndStore.ts

#### 4.2 Clean Up Existing Components
- Remove all `useDragCleanup()` calls
- Remove all native drag event handlers
- Remove drag-related useEffect hooks
- Remove manual cleanup logic

### Phase 5: Testing & Validation (Priority: High)

#### 5.1 Unit Tests

```typescript
// frontend/src/components/prd/dnd/__tests__/DndProvider.test.tsx
describe('PRDDndProvider', () => {
  it('should handle section reordering')
  it('should prevent content from moving between sections')
  it('should handle keyboard navigation')
  it('should provide proper accessibility')
})
```

#### 5.2 E2E Tests

```javascript
// playwright-tests/dnd-refactored.spec.js
test('Section drag and drop', async ({ page }) => {
  await page.goto('/compare-editors')
  
  // Test section reordering
  const section1 = page.locator('[data-section-id="overview"]')
  const section2 = page.locator('[data-section-id="core_features"]')
  
  await section1.dragTo(section2)
  
  // Verify new order
})

test('Content line drag within section', async ({ page }) => {
  // Test content reordering within a section
})

test('Prevent content drag between sections', async ({ page }) => {
  // Verify content stays within its section
})
```

### Phase 6: Performance Optimization (Priority: Medium)

#### 6.1 Memoization Strategy
```typescript
// Use React.memo for all draggable components
export const SortableSection = React.memo(({ ... }) => { ... })
export const SortableContentLine = React.memo(({ ... }) => { ... })

// Use useMemo for expensive computations
const sortableItems = useMemo(() => sections.map(s => s.id), [sections])
```

#### 6.2 Virtual Scrolling (Future Enhancement)
- Implement react-window for large PRDs
- Lazy load sections as needed


## Expected Outcomes

### Performance Improvements
- **Drag Start**: < 10ms (from 71-112ms)
- **No Re-renders**: Components remain stable during drag
- **Event Count**: ~5 events per drag (from 50+)
- **Success Rate**: 100% (from ~60%)

### Developer Experience
- **Simplified Codebase**: ~60% less drag-related code
- **Better Testing**: Framework provides testing utilities
- **Clear Documentation**: Well-documented API
- **Type Safety**: Full TypeScript support

### User Experience
- **Smooth Animations**: Built-in spring physics
- **Keyboard Support**: Full accessibility
- **Touch Support**: Works on mobile devices
- **Visual Feedback**: Clear drag indicators

## Technical Considerations

### Potential Challenges & Solutions

1. **TipTap Conflicts**
   - Solution: Completely disable TipTap drag, use separate line editors

2. **Performance with Large PRDs**
   - Solution: Implement virtualization for sections > 20

3. **Browser Compatibility**
   - Solution: @dnd-kit supports all modern browsers

## Success Metrics

- Zero drag-related errors in console
- Playwright tests pass 100%
- Drag operations complete in < 100ms
- No component re-renders during drag
- User satisfaction increase

## Conclusion

This comprehensive refactoring will eliminate all current drag-and-drop issues by:
1. Using a battle-tested framework (@dnd-kit)
2. Implementing clear separation of concerns
3. Removing problematic native drag handling
4. Ensuring no component re-renders during drag
5. Providing proper cleanup and state management

The solution prioritizes long-term maintainability and robustness over quick fixes, ensuring a solid foundation for the application's drag-and-drop functionality.