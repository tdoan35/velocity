import { useState, useCallback, useRef } from 'react'
import { useVelocityChat } from './useVelocityChat'
import { useUnifiedEditorStore } from '../stores/useUnifiedEditorStore'
import type { FileOperation, BuildProgress, BuildStep, BuilderModel } from '../types/ai'
import type { ProjectContext } from '../services/conversationService'

export interface DesignSpec {
  product_overview: any
  product_roadmap: any
  data_model: any
  design_system: any
  shell_spec: any
  sections: Array<{
    title: string
    description: string
    spec: any
    sample_data: any
    types_definition?: string
  }>
}

interface UseBuilderChatOptions {
  projectId: string
  conversationId?: string
  model?: BuilderModel
  projectContext?: ProjectContext
  onConversationCreated?: (conversationId: string) => void
  onTitleGenerated?: (title: string) => void
  onBuildComplete?: () => void
}

const BUILD_STEPS: { id: BuildStep; label: string; buildPrompt: (spec: DesignSpec) => string }[] = [
  {
    id: 'scaffold',
    label: 'Creating project scaffold...',
    buildPrompt: (spec) =>
      `Generate the project scaffold for "${spec.product_overview?.name || 'App'}". ` +
      `Set up package.json, config files, and the entry point. This is step 1 of 6.`,
  },
  {
    id: 'types',
    label: 'Generating TypeScript types...',
    buildPrompt: (spec) =>
      `Generate TypeScript type definitions based on the data model. ` +
      `Entities: ${spec.data_model?.entities?.map((e: any) => e.name).join(', ') || 'from spec'}. Step 2 of 6.`,
  },
  {
    id: 'components',
    label: 'Building UI components...',
    buildPrompt: (spec) =>
      `Generate reusable UI components using the design system. ` +
      `Colors: primary=${spec.design_system?.colors?.primary?.value || 'from spec'}. ` +
      `Typography: heading=${spec.design_system?.typography?.heading?.family || 'from spec'}. Step 3 of 6.`,
  },
  {
    id: 'pages',
    label: 'Creating page views...',
    buildPrompt: (spec) =>
      `Generate page components for each section: ${spec.product_roadmap?.sections?.map((s: any) => s.title).join(', ') || 'from spec'}. ` +
      `Use the components and types created in previous steps. Step 4 of 6.`,
  },
  {
    id: 'routing',
    label: 'Wiring up navigation...',
    buildPrompt: (spec) =>
      `Generate App.tsx with routing and navigation wiring. ` +
      `Shell layout: ${spec.shell_spec?.layoutPattern || 'from spec'}. ` +
      `Nav items: ${spec.shell_spec?.navigationItems?.map((n: any) => n.label).join(', ') || 'from spec'}. Step 5 of 6.`,
  },
  {
    id: 'data',
    label: 'Adding sample data...',
    buildPrompt: (spec) =>
      `Generate sample data files and mock services using the types and section sample data. Step 6 of 6.`,
  },
]

const initialProgress: BuildProgress = {
  status: 'idle',
  filesCompleted: 0,
  filesTotal: 0,
  stepsCompleted: 0,
  stepsTotal: BUILD_STEPS.length,
  errors: [],
}

export function useBuilderChat({
  projectId,
  conversationId: initialConversationId,
  model = 'claude-sonnet-4-5-20250929',
  projectContext,
  onConversationCreated,
  onTitleGenerated,
  onBuildComplete,
}: UseBuilderChatOptions) {
  const [buildProgress, setBuildProgress] = useState<BuildProgress>(initialProgress)
  const isBuildingRef = useRef(false)
  const streamEndResolverRef = useRef<(() => void) | null>(null)
  const broadcastQueueRef = useRef<{ filePath: string; content: string }[]>([])

  // Mutable context object that persists across renders
  // The transport's context getter reads latestRef.current.phaseContext
  // which points to this same object. We mutate in-place so the reference stays stable.
  const [builderContext] = useState<Record<string, any>>(() => ({}))

  const handleFileOperation = useCallback((op: FileOperation) => {
    const store = useUnifiedEditorStore.getState()
    if (op.operation === 'create' || op.operation === 'update') {
      store.createFile(op.filePath, op.content || '')
      broadcastQueueRef.current.push({ filePath: op.filePath, content: op.content || '' })
    } else if (op.operation === 'delete') {
      store.deleteFile(op.filePath)
    }
    setBuildProgress(prev => ({
      ...prev,
      filesCompleted: prev.filesCompleted + 1,
      currentFile: op.filePath,
    }))
  }, [])

  const handleBuildStatus = useCallback((status: { step: string; filesCompleted: number; filesTotal: number }) => {
    setBuildProgress(prev => ({
      ...prev,
      currentStep: status.step,
      filesTotal: Math.max(prev.filesTotal, status.filesTotal),
    }))
  }, [])

  const handleStreamEnd = useCallback((usage: any) => {
    streamEndResolverRef.current?.()
    streamEndResolverRef.current = null
  }, [])

  const chat = useVelocityChat({
    conversationId: initialConversationId,
    projectId,
    initialAgent: 'builder',
    projectContext,
    // phaseContext is read dynamically at send time via the context getter
    // We use a stable mutable object so the reference in latestRef stays current
    phaseContext: builderContext,
    onFileOperation: handleFileOperation,
    onBuildStatus: handleBuildStatus,
    onStreamEnd: handleStreamEnd,
    onConversationCreated,
    onTitleGenerated,
  })

  const startBuild = useCallback(async (designSpec: DesignSpec) => {
    if (isBuildingRef.current) return
    isBuildingRef.current = true

    setBuildProgress({
      status: 'generating',
      filesCompleted: 0,
      filesTotal: 0,
      stepsCompleted: 0,
      stepsTotal: BUILD_STEPS.length,
      errors: [],
    })

    try {
      for (let i = 0; i < BUILD_STEPS.length; i++) {
        const step = BUILD_STEPS[i]
        setBuildProgress(prev => ({
          ...prev,
          currentStep: step.label,
          stepsCompleted: i,
        }))

        // Update the mutable context in-place before sending
        const store = useUnifiedEditorStore.getState()
        const existingFiles = Object.keys(store.files)
        Object.assign(builderContext, {
          designSpec,
          buildStep: step.id,
          model,
          existingFiles,
        })

        const prompt = step.buildPrompt(designSpec)

        // Send and wait for stream to complete
        await new Promise<void>((resolve) => {
          streamEndResolverRef.current = resolve
          chat.sendMessage(null, prompt)
        })
      }

      setBuildProgress(prev => ({
        ...prev,
        status: 'complete',
        stepsCompleted: BUILD_STEPS.length,
      }))

      // Clear build step from context for follow-up messages
      const storeAfter = useUnifiedEditorStore.getState()
      delete builderContext.buildStep
      Object.assign(builderContext, {
        designSpec,
        existingFiles: Object.keys(storeAfter.files),
        model,
      })

      onBuildComplete?.()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Build failed'
      setBuildProgress(prev => ({
        ...prev,
        status: 'error',
        errors: [...prev.errors, errorMessage],
      }))
    } finally {
      isBuildingRef.current = false
    }
  }, [chat, model, onBuildComplete])

  const flushBroadcasts = useCallback((broadcastFn: (filePath: string, content: string) => void) => {
    const queue = broadcastQueueRef.current
    broadcastQueueRef.current = []
    queue.forEach(({ filePath, content }) => broadcastFn(filePath, content))
  }, [])

  return {
    ...chat,
    buildProgress,
    startBuild,
    flushBroadcasts,
    isBuilding: isBuildingRef.current || buildProgress.status === 'generating',
  }
}
