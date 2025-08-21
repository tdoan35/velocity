import { Node, mergeAttributes } from '@tiptap/core'
import { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer } from '@tiptap/react'
import { createElement } from 'react'

// Define the PRD Section node
export interface PRDSectionOptions {
  HTMLAttributes: Record<string, any>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    prdSection: {
      /**
       * Add a PRD section
       */
      setPRDSection: (attributes: { 
        id: string
        type: string
        title: string
        order: number
        status?: string
        agent?: string
      }) => ReturnType
      /**
       * Update PRD section attributes
       */
      updatePRDSection: (id: string, attributes: Partial<{
        title: string
        status: string
        order: number
      }>) => ReturnType
    }
  }
}

export const PRDSectionNode = Node.create<PRDSectionOptions>({
  name: 'prdSection',
  
  group: 'block',
  
  content: 'block+',
  
  draggable: true,
  
  addOptions() {
    return {
      HTMLAttributes: {
        class: 'prd-section'
      }
    }
  },
  
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: element => element.getAttribute('data-section-id'),
        renderHTML: attributes => {
          if (!attributes.id) {
            return {}
          }
          return {
            'data-section-id': attributes.id
          }
        }
      },
      type: {
        default: 'custom',
        parseHTML: element => element.getAttribute('data-section-type'),
        renderHTML: attributes => {
          return {
            'data-section-type': attributes.type
          }
        }
      },
      title: {
        default: '',
        parseHTML: element => element.getAttribute('data-section-title'),
        renderHTML: attributes => {
          return {
            'data-section-title': attributes.title
          }
        }
      },
      order: {
        default: 0,
        parseHTML: element => parseInt(element.getAttribute('data-section-order') || '0'),
        renderHTML: attributes => {
          return {
            'data-section-order': attributes.order
          }
        }
      },
      status: {
        default: 'pending',
        parseHTML: element => element.getAttribute('data-section-status'),
        renderHTML: attributes => {
          return {
            'data-section-status': attributes.status
          }
        }
      },
      agent: {
        default: null,
        parseHTML: element => element.getAttribute('data-section-agent'),
        renderHTML: attributes => {
          if (!attributes.agent) {
            return {}
          }
          return {
            'data-section-agent': attributes.agent
          }
        }
      }
    }
  },
  
  parseHTML() {
    return [
      {
        tag: 'div[data-section-id]'
      }
    ]
  },
  
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0]
  },
  
  addCommands() {
    return {
      setPRDSection: (attributes) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: attributes,
          content: [
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [
                {
                  type: 'text',
                  text: attributes.title
                }
              ]
            },
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: 'Section content...'
                }
              ]
            }
          ]
        })
      },
      
      updatePRDSection: (id, attributes) => ({ state, dispatch }) => {
        const { doc, tr } = state
        let updated = false
        
        doc.descendants((node, pos) => {
          if (node.type.name === this.name && node.attrs.id === id) {
            if (dispatch) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                ...attributes
              })
              updated = true
            }
            return false // Stop searching
          }
        })
        
        if (updated && dispatch) {
          dispatch(tr)
        }
        
        return updated
      }
    }
  },
  
  addKeyboardShortcuts() {
    return {
      // Allow Tab to navigate between sections
      Tab: () => {
        return false // Let default Tab behavior work
      },
      // Alt+Up to move section up
      'Alt-ArrowUp': ({ editor }) => {
        const { state } = editor
        const { selection } = state
        const node = selection.$from.node(-1)
        
        if (node && node.type.name === this.name) {
          // Move section up logic
          return true
        }
        return false
      },
      // Alt+Down to move section down
      'Alt-ArrowDown': ({ editor }) => {
        const { state } = editor
        const { selection } = state
        const node = selection.$from.node(-1)
        
        if (node && node.type.name === this.name) {
          // Move section down logic
          return true
        }
        return false
      }
    }
  }
})

// React component for section view (optional, for advanced rendering)
export const PRDSectionView = ({ node, updateAttributes, deleteNode, selected }: any) => {
  const sectionIcons: Record<string, string> = {
    overview: '📋',
    core_features: '✨',
    additional_features: '➕',
    ui_design_patterns: '🎨',
    ux_flows: '🔄',
    technical_architecture: '🏗️',
    tech_integrations: '🔌',
    custom: '📝'
  }
  
  const icon = sectionIcons[node.attrs.type] || '📝'
  
  return createElement(NodeViewWrapper, {
    className: `prd-section-wrapper ${selected ? 'selected' : ''}`,
    'data-section-id': node.attrs.id
  }, [
    createElement('div', {
      className: 'prd-section-header',
      contentEditable: false
    }, [
      createElement('span', { className: 'section-icon' }, icon),
      createElement('h2', { className: 'section-title' }, node.attrs.title),
      createElement('span', { 
        className: `section-status status-${node.attrs.status}` 
      }, node.attrs.status)
    ]),
    createElement(NodeViewContent, { className: 'prd-section-content' })
  ])
}

// Custom serializer for converting to/from JSON
export const prdSectionSerializer = {
  toJSON(node: ProseMirrorNode) {
    return {
      type: 'prdSection',
      attrs: {
        id: node.attrs.id,
        type: node.attrs.type,
        title: node.attrs.title,
        order: node.attrs.order,
        status: node.attrs.status,
        agent: node.attrs.agent
      },
      content: node.content.toJSON()
    }
  },
  
  fromJSON(json: any) {
    return {
      type: 'prdSection',
      attrs: json.attrs,
      content: json.content
    }
  }
}