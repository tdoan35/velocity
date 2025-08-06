import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { CodeSuggestion } from './code-suggestion'
import type { CodeBlock } from '@/types/chat'
import { cn } from '@/lib/utils'

interface MarkdownMessageProps {
  content: string
  codeBlocks?: CodeBlock[]
  onApplyCode?: (code: string) => void
  className?: string
}

export function MarkdownMessage({ 
  content, 
  codeBlocks = [], 
  onApplyCode,
  className 
}: MarkdownMessageProps) {
  // Extract code blocks from markdown if not provided
  const extractedCodeBlocks = extractCodeBlocks(content)
  const allCodeBlocks = [...codeBlocks, ...extractedCodeBlocks]
  
  return (
    <div className={cn('prose prose-sm dark:prose-invert max-w-none overflow-hidden', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Custom code block rendering
          code({ className, children, ...props }: any) {
            const match = /language-(\w+)/.exec(className || '')
            const language = match ? match[1] : ''
            const isInline = !match
            
            if (!isInline && language) {
              const codeString = String(children).replace(/\n$/, '')
              const codeBlock = allCodeBlocks.find(cb => cb.code === codeString) || {
                id: `code-${Date.now()}`,
                language,
                code: codeString,
              }
              
              return (
                <div className="my-4 mx-2">
                  <CodeSuggestion
                    codeBlock={codeBlock}
                    onApply={onApplyCode}
                  />
                </div>
              )
            }
            
            return (
              <code className={cn('bg-muted px-1 py-0.5 rounded', className)} {...props}>
                {children}
              </code>
            )
          },
          // Custom link rendering
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                {children}
              </a>
            )
          },
          // Custom list rendering
          ul({ children }) {
            return <ul className="list-disc pl-6 my-2">{children}</ul>
          },
          ol({ children }) {
            return <ol className="list-decimal pl-6 my-2">{children}</ol>
          },
          // Custom paragraph spacing
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>
          },
          // Custom heading sizes
          h1({ children }) {
            return <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

function extractCodeBlocks(content: string): CodeBlock[] {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g
  const blocks: CodeBlock[] = []
  let match
  
  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push({
      id: `extracted-${blocks.length}`,
      language: match[1] || 'plaintext',
      code: match[2].trim(),
    })
  }
  
  return blocks
}