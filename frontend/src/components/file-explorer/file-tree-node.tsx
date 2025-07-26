import { useState, useCallback } from 'react'
import { ChevronRight, ChevronDown, MoreVertical } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FileIcon } from './file-icon'
import { cn } from '@/lib/utils'
import type { FileNode } from '@/types/store'

interface FileTreeNodeProps {
  node: FileNode
  level: number
  selectedId: string | null
  expandedIds: Set<string>
  onSelect: (node: FileNode) => void
  onToggleExpand: (nodeId: string) => void
  onContextMenu: (event: React.MouseEvent, node: FileNode) => void
  onDrop?: (draggedId: string, targetId: string) => void
}

export function FileTreeNode({
  node,
  level,
  selectedId,
  expandedIds,
  onSelect,
  onToggleExpand,
  onContextMenu,
  onDrop,
}: FileTreeNodeProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const isExpanded = expandedIds.has(node.id)
  const isSelected = selectedId === node.id
  const hasChildren = node.type === 'directory' && node.children && node.children.length > 0

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (node.type === 'directory') {
      onToggleExpand(node.id)
    } else {
      onSelect(node)
    }
  }, [node, onSelect, onToggleExpand])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onContextMenu(e, node)
  }, [node, onContextMenu])

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.setData('nodeId', node.id)
    e.dataTransfer.effectAllowed = 'move'
  }, [node.id])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (node.type === 'directory') {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setIsDragOver(true)
    }
  }, [node.type])

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    
    const draggedId = e.dataTransfer.getData('nodeId')
    if (draggedId && draggedId !== node.id && node.type === 'directory') {
      onDrop?.(draggedId, node.id)
    }
  }, [node.id, node.type, onDrop])

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-1 rounded px-2 py-1 text-sm hover:bg-accent cursor-pointer',
          isSelected && 'bg-accent',
          isDragOver && 'bg-accent ring-2 ring-primary'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {node.type === 'directory' && (
          <button
            className="p-0.5 hover:bg-background/50 rounded"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand(node.id)
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
        
        {node.type === 'file' && <div className="w-4" />}
        
        <FileIcon
          fileName={node.name}
          isDirectory={node.type === 'directory'}
          isOpen={isExpanded}
          className="h-4 w-4 flex-shrink-0"
        />
        
        <span className="flex-1 truncate">{node.name}</span>
        
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 opacity-0 group-hover:opacity-100"
          onClick={handleContextMenu}
        >
          <MoreVertical className="h-3 w-3" />
        </Button>
      </div>
      
      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <FileTreeNode
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onContextMenu={onContextMenu}
              onDrop={onDrop}
            />
          ))}
        </div>
      )}
    </div>
  )
}