import { useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types';
import type { VirtualBlockManager } from '@/lib/virtual-blocks/VirtualBlockManager';

interface UseVirtualBlockDragIntegrationProps {
  editor: Editor | null;
  virtualBlocks: VirtualContentBlock[];
  virtualBlockManager: VirtualBlockManager;
  enabled: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  sectionId: string;
  onBlockReorder?: (fromIndex: number, toIndex: number) => void;
}

/**
 * Hook that integrates virtual block drag functionality with TipTap editor
 * This approach directly enhances the TipTap DOM elements with drag capabilities
 */
export const useVirtualBlockDragIntegration = ({
  editor,
  virtualBlocks,
  virtualBlockManager,
  enabled,
  containerRef,
  sectionId,
  onBlockReorder
}: UseVirtualBlockDragIntegrationProps) => {

  // Add drag data attributes to TipTap elements
  const enhanceTipTapElementsWithDragData = useCallback(() => {
    if (!editor || !enabled || !containerRef.current) return;

    const editorElement = containerRef.current.querySelector('.ProseMirror');
    if (!editorElement) return;

    // Find all block-level elements in the editor
    const blockElements = editorElement.querySelectorAll('p, h1, h2, h3, h4, h5, h6, ul, ol, li, blockquote, pre, hr');
    
    blockElements.forEach((element, index) => {
      const htmlElement = element as HTMLElement;
      
      // Find corresponding virtual block
      const virtualBlock = virtualBlocks.find(block => {
        // Match by position or content
        const elementText = htmlElement.textContent || '';
        return elementText === block.content.text || 
               (block.position && 
                index >= virtualBlocks.indexOf(block) &&
                index < virtualBlocks.indexOf(block) + 1);
      });

      if (virtualBlock) {
        // Add virtual block data attributes
        htmlElement.setAttribute('data-virtual-block-id', virtualBlock.id);
        htmlElement.setAttribute('data-virtual-block-type', virtualBlock.type);
        htmlElement.setAttribute('data-section-id', sectionId);
        htmlElement.setAttribute('data-draggable', 'true');
        
        // Add visual indicators for virtual blocks
        htmlElement.classList.add('virtual-block-element');
        
        // Add hover effects
        htmlElement.style.transition = 'all 0.2s ease';
      }
    });

    console.log(`Enhanced ${blockElements.length} TipTap elements with virtual block drag data`);
  }, [editor, enabled, containerRef, virtualBlocks, sectionId]);

  // Handle drag events on TipTap elements
  const handleDragStart = useCallback((event: DragEvent) => {
    const target = event.target as HTMLElement;
    const blockId = target.getAttribute('data-virtual-block-id');
    const blockType = target.getAttribute('data-virtual-block-type');
    
    if (!blockId || !blockType) return;

    // Set drag data
    event.dataTransfer?.setData('text/virtual-block-id', blockId);
    event.dataTransfer?.setData('text/virtual-block-type', blockType);
    event.dataTransfer?.setData('text/section-id', sectionId);
    
    // Add visual feedback
    target.style.opacity = '0.5';
    
    console.log('Virtual block drag started:', { blockId, blockType });
  }, [sectionId]);

  const handleDragEnd = useCallback((event: DragEvent) => {
    const target = event.target as HTMLElement;
    
    // Reset visual feedback
    target.style.opacity = '';
    
    console.log('Virtual block drag ended');
  }, []);

  const handleDragOver = useCallback((event: DragEvent) => {
    event.preventDefault(); // Allow drop
  }, []);

  const handleDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    
    const target = event.target as HTMLElement;
    const draggedBlockId = event.dataTransfer?.getData('text/virtual-block-id');
    const targetBlockId = target.getAttribute('data-virtual-block-id');
    
    if (!draggedBlockId || !targetBlockId || draggedBlockId === targetBlockId) {
      return;
    }

    // Find indices of dragged and target blocks
    const draggedIndex = virtualBlocks.findIndex(block => block.id === draggedBlockId);
    const targetIndex = virtualBlocks.findIndex(block => block.id === targetBlockId);
    
    if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
      console.log('Virtual block drop:', { 
        draggedBlockId, 
        targetBlockId, 
        fromIndex: draggedIndex, 
        toIndex: targetIndex 
      });
      
      // Call reorder handler
      onBlockReorder?.(draggedIndex, targetIndex);
    }
  }, [virtualBlocks, onBlockReorder]);

  // Set up drag integration
  useEffect(() => {
    if (!editor || !enabled || !containerRef.current) return;

    // Enhance TipTap elements when virtual blocks change
    enhanceTipTapElementsWithDragData();

    const editorElement = containerRef.current.querySelector('.ProseMirror');
    if (!editorElement) return;

    // Add drag event listeners
    editorElement.addEventListener('dragstart', handleDragStart);
    editorElement.addEventListener('dragend', handleDragEnd);
    editorElement.addEventListener('dragover', handleDragOver);
    editorElement.addEventListener('drop', handleDrop);

    return () => {
      editorElement.removeEventListener('dragstart', handleDragStart);
      editorElement.removeEventListener('dragend', handleDragEnd);
      editorElement.removeEventListener('dragover', handleDragOver);
      editorElement.removeEventListener('drop', handleDrop);
    };
  }, [
    editor, 
    enabled, 
    virtualBlocks, 
    containerRef, 
    enhanceTipTapElementsWithDragData,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop
  ]);

  // Update drag data when virtual blocks change
  useEffect(() => {
    if (enabled) {
      enhanceTipTapElementsWithDragData();
    }
  }, [virtualBlocks, enabled, enhanceTipTapElementsWithDragData]);

  return {
    // Return any utilities that might be needed
    enhanceTipTapElementsWithDragData
  };
};