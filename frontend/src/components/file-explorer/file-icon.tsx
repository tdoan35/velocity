import { FileCode, FileText, FileImage, FileJson, Folder, FolderOpen } from 'lucide-react'

interface FileIconProps {
  fileName: string
  isDirectory: boolean
  isOpen?: boolean
  className?: string
}

const fileExtensionIcons: Record<string, typeof FileCode> = {
  // Code files
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  py: FileCode,
  java: FileCode,
  cpp: FileCode,
  c: FileCode,
  cs: FileCode,
  php: FileCode,
  rb: FileCode,
  go: FileCode,
  rs: FileCode,
  kt: FileCode,
  swift: FileCode,
  
  // Data files
  json: FileJson,
  xml: FileCode,
  yaml: FileCode,
  yml: FileCode,
  toml: FileCode,
  
  // Text files
  md: FileText,
  txt: FileText,
  log: FileText,
  
  // Image files
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
  ico: FileImage,
}

export function FileIcon({ fileName, isDirectory, isOpen = false, className = '' }: FileIconProps) {
  if (isDirectory) {
    const Icon = isOpen ? FolderOpen : Folder
    return <Icon className={`text-blue-500 ${className}`} />
  }

  const extension = fileName.split('.').pop()?.toLowerCase() || ''
  const Icon = fileExtensionIcons[extension] || FileText

  // Apply color based on file type
  let colorClass = 'text-gray-500'
  if (['ts', 'tsx', 'js', 'jsx'].includes(extension)) {
    colorClass = 'text-blue-600'
  } else if (['py', 'rb'].includes(extension)) {
    colorClass = 'text-yellow-600'
  } else if (['java', 'kt'].includes(extension)) {
    colorClass = 'text-orange-600'
  } else if (['cpp', 'c', 'cs'].includes(extension)) {
    colorClass = 'text-purple-600'
  } else if (['go', 'rs'].includes(extension)) {
    colorClass = 'text-cyan-600'
  } else if (['json', 'xml', 'yaml', 'yml'].includes(extension)) {
    colorClass = 'text-green-600'
  } else if (['png', 'jpg', 'jpeg', 'gif', 'svg'].includes(extension)) {
    colorClass = 'text-pink-600'
  }

  return <Icon className={`${colorClass} ${className}`} />
}