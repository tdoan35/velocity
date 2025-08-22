import type { FlexiblePRDSection, PRD } from '@/services/prdService'

/**
 * Convert HTML content to Markdown format
 */
function htmlToMarkdown(html: string): string {
  // Create a temporary div to parse HTML
  const tempDiv = document.createElement('div')
  tempDiv.innerHTML = html

  let markdown = ''
  
  // Process each child node
  const processNode = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || ''
    }
    
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      const tagName = element.tagName.toLowerCase()
      const textContent = element.textContent || ''
      
      switch (tagName) {
        case 'h1':
          return `# ${textContent}\n\n`
        case 'h2':
          return `## ${textContent}\n\n`
        case 'h3':
          return `### ${textContent}\n\n`
        case 'h4':
          return `#### ${textContent}\n\n`
        case 'h5':
          return `##### ${textContent}\n\n`
        case 'h6':
          return `###### ${textContent}\n\n`
        case 'p': {
          const pContent = Array.from(element.childNodes).map(child => processNode(child)).join('')
          return pContent.trim() ? `${pContent}\n\n` : ''
        }
        case 'br':
          return '\n'
        case 'strong':
        case 'b':
          return `**${textContent}**`
        case 'em':
        case 'i':
          return `*${textContent}*`
        case 'code':
          return `\`${textContent}\``
        case 'pre':
          return `\`\`\`\n${textContent}\n\`\`\`\n\n`
        case 'blockquote': {
          const quoteContent = Array.from(element.childNodes).map(child => processNode(child)).join('')
          return `> ${quoteContent.replace(/\n\n/g, '\n> ')}\n\n`
        }
        case 'ul': {
          let ulContent = ''
          Array.from(element.children).forEach(li => {
            if (li.tagName.toLowerCase() === 'li') {
              const liContent = Array.from(li.childNodes).map(child => processNode(child)).join('').trim()
              if (liContent) {
                ulContent += `- ${liContent}\n`
              }
            }
          })
          return ulContent + '\n'
        }
        case 'ol': {
          let olContent = ''
          Array.from(element.children).forEach((li, index) => {
            if (li.tagName.toLowerCase() === 'li') {
              const liContent = Array.from(li.childNodes).map(child => processNode(child)).join('').trim()
              if (liContent) {
                olContent += `${index + 1}. ${liContent}\n`
              }
            }
          })
          return olContent + '\n'
        }
        case 'li':
          // This case is handled by ul/ol parents
          return Array.from(element.childNodes).map(child => processNode(child)).join('')
        case 'a': {
          const href = element.getAttribute('href')
          return href ? `[${textContent}](${href})` : textContent
        }
        case 'img': {
          const src = element.getAttribute('src')
          const alt = element.getAttribute('alt') || ''
          return src ? `![${alt}](${src})` : ''
        }
        case 'hr':
          return '---\n\n'
        case 'table': {
          // Basic table support - convert to simple markdown table
          const rows = Array.from(element.querySelectorAll('tr'))
          if (rows.length === 0) return ''
          
          let tableMarkdown = ''
          rows.forEach((row, rowIndex) => {
            const cells = Array.from(row.querySelectorAll('td, th'))
            const cellContents = cells.map(cell => cell.textContent?.trim() || '')
            tableMarkdown += `| ${cellContents.join(' | ')} |\n`
            
            // Add header separator after first row
            if (rowIndex === 0) {
              tableMarkdown += `| ${cellContents.map(() => '---').join(' | ')} |\n`
            }
          })
          return tableMarkdown + '\n'
        }
        case 'div':
        case 'span':
          // Just process children for generic containers
          return Array.from(element.childNodes).map(child => processNode(child)).join('')
        default:
          // For unknown tags, just extract text content
          return Array.from(element.childNodes).map(child => processNode(child)).join('')
      }
    }
    
    return ''
  }

  // Process all child nodes
  Array.from(tempDiv.childNodes).forEach(node => {
    markdown += processNode(node)
  })

  return markdown
}

/**
 * Convert a single PRD section to markdown
 */
function sectionToMarkdown(section: FlexiblePRDSection): string {
  let markdown = ''
  
  // Add section title as H2
  markdown += `## ${section.title}\n\n`
  
  // Convert HTML content to markdown
  if (section.content.html) {
    const htmlMarkdown = htmlToMarkdown(section.content.html)
    markdown += htmlMarkdown
  } else if (section.content.text) {
    // Fallback to plain text if no HTML
    markdown += section.content.text + '\n\n'
  }
  
  return markdown
}

/**
 * Export entire PRD as markdown
 */
export function exportPRDAsMarkdown(prd: PRD): string {
  let markdown = ''
  
  // Add title
  if (prd.title) {
    markdown += `# ${prd.title}\n\n`
  }
  
  // Add metadata
  if (prd.status) {
    markdown += `**Status:** ${prd.status}\n\n`
  }
  
  if (prd.completion_percentage !== undefined) {
    markdown += `**Completion:** ${prd.completion_percentage}%\n\n`
  }
  
  if (prd.created_at) {
    const createdDate = new Date(prd.created_at).toLocaleDateString()
    markdown += `**Created:** ${createdDate}\n\n`
  }
  
  if (prd.updated_at) {
    const updatedDate = new Date(prd.updated_at).toLocaleDateString()
    markdown += `**Last Updated:** ${updatedDate}\n\n`
  }
  
  markdown += '---\n\n'
  
  // Process sections in order
  if (prd.sections && prd.sections.length > 0) {
    const sortedSections = [...prd.sections].sort((a, b) => a.order - b.order)
    
    sortedSections.forEach(section => {
      markdown += sectionToMarkdown(section)
    })
  }
  
  return markdown
}

/**
 * Trigger download of markdown content
 */
export function downloadMarkdown(content: string, filename: string = 'prd.md'): void {
  // Create blob with markdown content
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  
  // Create download link
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  
  // Trigger download
  document.body.appendChild(link)
  link.click()
  
  // Cleanup
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Generate filename based on PRD title and date
 */
export function generateMarkdownFilename(prd: PRD): string {
  const title = prd.title || 'PRD'
  const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD
  
  // Sanitize title for filename
  const sanitizedTitle = title
    .replace(/[^a-z0-9]/gi, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase()
  
  return `${sanitizedTitle}_${date}.md`
}