/**
 * Virtual Block System Demo Page
 * 
 * Demonstrates the virtual block system implementation with
 * Notion-like block editing capabilities.
 */

import React, { useState } from 'react'
import { NotionSectionEditor } from '@/components/prd-editors/block-based/blocks/NotionSectionEditor'
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types'

// Sample content for testing
const sampleContent = `
<h1>Virtual Block System Demo</h1>
<p>This is a demonstration of the virtual block system that provides Notion-like editing capabilities.</p>

<h2>Key Features</h2>
<ul>
  <li>Virtual blocks parsed from HTML</li>
  <li>Block type conversion with slash commands</li>
  <li>Keyboard navigation between blocks</li>
  <li>Block-level operations</li>
</ul>

<h3>Try These Actions</h3>
<p>Type "/" to see available block types and commands.</p>
<p>Use arrow keys to navigate between blocks.</p>
<p>Hover over blocks to see controls.</p>

<blockquote>
  <p>This is a quote block. You can convert it to other block types using slash commands.</p>
</blockquote>

<pre><code>// Code block example
function virtualBlocks() {
  return "Notion-like editing"
}</code></pre>
`

export function VirtualBlockDemo() {
  const [content, setContent] = useState(sampleContent)
  const [virtualBlocks, setVirtualBlocks] = useState<VirtualContentBlock[]>([])
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-6xl mx-auto p-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Virtual Block System Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Test the Notion-like block editing capabilities with virtual blocks
          </p>
        </div>
        
        {/* Main Editor */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Editor Column */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
              <NotionSectionEditor
                id="demo-section"
                type="overview"
                title="Demo Editor"
                content={content}
                isEditable={true}
                enableSlashCommands={true}
                enableBubbleMenu={true}
                enableVirtualBlocks={true}
                onUpdate={(id, updatedContent) => {
                  console.log('Content updated:', updatedContent)
                  setContent(updatedContent.html || updatedContent)
                }}
                onBlocksUpdate={(blocks) => {
                  console.log('Virtual blocks updated:', blocks)
                  setVirtualBlocks(blocks)
                }}
              />
            </div>
            
            {/* Instructions */}
            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">
                Try These Features:
              </h3>
              <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-400">
                <li>• Type "/" to open the block type menu</li>
                <li>• Use arrow keys to navigate between blocks</li>
                <li>• Press Enter at the end of a block to create a new one</li>
                <li>• Hover over blocks to see drag handles and controls</li>
                <li>• Select text and use the bubble menu for formatting</li>
                <li>• Try auto-conversion: "# " for heading, "- " for list</li>
              </ul>
            </div>
          </div>
          
          {/* Virtual Blocks Inspector */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 sticky top-8">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Virtual Blocks Inspector
              </h2>
              
              {virtualBlocks.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  No virtual blocks parsed yet. Start editing to see blocks appear here.
                </p>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {virtualBlocks.map((block, index) => (
                    <div
                      key={block.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedBlockId === block.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                      }`}
                      onClick={() => setSelectedBlockId(block.id)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                          #{index + 1}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                          {block.type}
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-700 dark:text-gray-300 truncate">
                        {block.content.text || '(empty)'}
                      </div>
                      
                      {selectedBlockId === block.id && (
                        <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600 text-xs space-y-1">
                          <div className="text-gray-500 dark:text-gray-400">
                            <span className="font-semibold">ID:</span> {block.id.slice(0, 16)}...
                          </div>
                          <div className="text-gray-500 dark:text-gray-400">
                            <span className="font-semibold">Position:</span> {block.position.start}-{block.position.end}
                          </div>
                          <div className="text-gray-500 dark:text-gray-400">
                            <span className="font-semibold">Depth:</span> {block.metadata?.depth || 0}
                          </div>
                          {block.children && block.children.length > 0 && (
                            <div className="text-gray-500 dark:text-gray-400">
                              <span className="font-semibold">Children:</span> {block.children.length}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Stats */}
              {virtualBlocks.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Total Blocks:</span>
                      <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                        {virtualBlocks.length}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 dark:text-gray-400">Selected:</span>
                      <span className="ml-2 font-semibold text-gray-900 dark:text-white">
                        {selectedBlockId ? '1' : '0'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}