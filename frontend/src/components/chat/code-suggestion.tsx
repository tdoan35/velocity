import { useState } from 'react'
import { Copy, Check, Play, FileCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { CodeBlock } from '@/types/chat'

interface CodeSuggestionProps {
  codeBlock: CodeBlock
  onApply?: (code: string) => void
  className?: string
}

export function CodeSuggestion({ codeBlock, onApply, className }: CodeSuggestionProps) {
  const [copied, setCopied] = useState(false)
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(codeBlock.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  
  const getLanguageColor = (language: string) => {
    const colors: Record<string, string> = {
      typescript: 'text-blue-600',
      javascript: 'text-yellow-600',
      python: 'text-green-600',
      java: 'text-orange-600',
      css: 'text-pink-600',
      html: 'text-red-600',
      jsx: 'text-blue-500',
      tsx: 'text-blue-500',
    }
    return colors[language.toLowerCase()] || 'text-gray-600'
  }
  
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex items-center justify-between border-b px-3 py-2 bg-muted/50">
        <div className="flex items-center gap-2">
          <FileCode className="h-4 w-4 text-muted-foreground" />
          <span className={cn('text-sm font-medium', getLanguageColor(codeBlock.language))}>
            {codeBlock.language}
          </span>
          {codeBlock.fileName && (
            <>
              <span className="text-muted-foreground">•</span>
              <span className="text-sm text-muted-foreground">{codeBlock.fileName}</span>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </Button>
          {onApply && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onApply(codeBlock.code)}
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      
      <div className="relative">
        <pre className="p-4 overflow-x-auto">
          <code className={cn('text-sm', `language-${codeBlock.language}`)}>
            {codeBlock.code}
          </code>
        </pre>
      </div>
      
      {codeBlock.description && (
        <div className="border-t px-3 py-2 bg-muted/30">
          <p className="text-sm text-muted-foreground">{codeBlock.description}</p>
        </div>
      )}
    </Card>
  )
}