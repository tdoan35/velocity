# Baseline PRD Editor Drag and Drop

This directory contains the drag and drop implementation for the baseline PRD editor, using @dnd-kit for section reordering.

## Components

### `PRDDndProvider`
Main context provider that wraps sections and handles drag events.

**Props:**
- `sections`: Array of FlexiblePRDSection objects
- `onSectionReorder`: Callback when sections are reordered
- `children`: React nodes to render within the drag context

### `SortableSection`
Wrapper component that makes individual sections draggable.

**Props:**
- `id`: Unique section identifier
- `children`: Section content to render
- `className`: Optional CSS classes
- `disabled`: Whether dragging is disabled

### `DropIndicator`
Visual indicator showing where items will be dropped.

### `DragOverlay`
Overlay component shown during drag operations.

## Usage Example

```tsx
import { PRDDndProvider, SortableSection } from './dnd'

function MyPRDEditor() {
  const [sections, setSections] = useState<FlexiblePRDSection[]>([])

  const handleSectionReorder = useCallback((reorderedSections) => {
    setSections(reorderedSections)
    // Save to backend...
  }, [])

  return (
    <PRDDndProvider 
      sections={sections}
      onSectionReorder={handleSectionReorder}
    >
      {sections.map((section) => (
        <SortableSection key={section.id} id={section.id}>
          <SectionComponent section={section} />
        </SortableSection>
      ))}
    </PRDDndProvider>
  )
}
```

## Features

- ✅ Vertical section reordering
- ✅ Visual drag indicators
- ✅ Drag overlay with section preview
- ✅ Keyboard accessibility
- ✅ Touch device support
- ✅ Backend persistence
- ✅ Error handling with rollback

## Migration from Block-Based Editor

This implementation replaces the drag and drop functionality from `../block-based/dnd` with a simplified version focused on section reordering for the baseline editor.