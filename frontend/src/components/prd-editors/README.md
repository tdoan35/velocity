# PRD Editors - Separated Structure

This directory contains all PRD editor implementations, now properly separated for easier management and maintenance.

## Directory Structure

```
prd-editors/
├── shared/                           # Shared utilities across all editors
│   ├── components/                   # Shared components (PRDStatusBadge)
│   ├── hooks/                        # Shared hooks (useAutoSave, usePRDSections)
│   └── utils/                        # Shared utilities (debugTools, transactionManager)
│
├── notion-original/                  # Original NotionPRDEditor
│   ├── NotionPRDEditor.tsx          # Single-document TipTap editor
│   └── index.ts                     # Export file
│
├── notion-enhanced/                  # Enhanced NotionPRDEditor  
│   ├── NotionPRDEditor.enhanced.tsx # Enhanced version with section management
│   ├── extensions/                   # TipTap extensions (PRDSectionNode)
│   └── index.ts                     # Export file
│
├── block-based/                      # Block-based editor with @dnd-kit
│   ├── BlockBasedPRDEditor.tsx      # Original block-based editor
│   ├── BlockBasedPRDEditor.enhanced.tsx # Enhanced block-based editor
│   ├── components/                   # Block controls and wrappers
│   ├── dnd/                         # @dnd-kit components
│   ├── blocks/                      # Block type editors
│   └── index.ts                     # Export file
│
├── editor-v2/                       # V2 editor with hello-pangea/dnd
│   ├── PRDEditorV2.tsx              # Main V2 editor
│   ├── SectionEditor*.tsx           # Section editors
│   ├── components/                   # V2 specific components
│   ├── stores/                      # V2 specific stores
│   └── index.ts                     # Export file
│
└── baseline/                        # New baseline editor (from new-prd/)
    ├── BlockNotionPRDEditor.tsx     # Baseline editor implementation
    ├── blocks/                      # Block components
    └── index.ts                     # Export file
```

## Usage

Each editor can now be imported cleanly:

```typescript
// Notion Original
import { NotionPRDEditor } from '@/components/prd-editors/notion-original'

// Block-based Enhanced
import { EnhancedBlockBasedPRDEditor } from '@/components/prd-editors/block-based'

// Editor V2
import { PRDEditorV2, usePRDEditorStore } from '@/components/prd-editors/editor-v2'

// Baseline
import { BlockNotionPRDEditor } from '@/components/prd-editors/baseline'
```

## Routes Updated

- `/compare-editors` - Uses all editors for comparison
- `/prd-editor` - Uses the baseline editor
- `/test-prd-v2` - Uses the V2 editor

## Benefits

1. **Isolated Dependencies**: Each editor only contains what it needs
2. **Easy Deprecation**: Remove entire directories when editors are no longer needed
3. **Clear Ownership**: Each editor has its own space for development  
4. **Reduced Complexity**: No more interdependencies between different editor approaches
5. **Easier Testing**: Test each editor implementation independently

## Migration Status

✅ All editor files moved to new structure
✅ Import paths updated in consuming components  
✅ Index files created for clean imports
✅ Shared utilities moved to common location
⚠️  Some minor TypeScript errors remain (mainly unused variables)

## Next Steps

1. Test each editor route individually
2. Fix remaining TypeScript issues
3. Deprecate unused editors once final decision is made
4. Update documentation for chosen editor approach