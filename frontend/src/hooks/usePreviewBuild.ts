import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/hooks/use-toast'
import { useAppStore } from '@/stores/useAppStore'
import { useFileSystemStore } from '@/stores/useFileSystemStore'

interface BuildOptions {
  platform?: 'ios' | 'android' | 'web'
  sdkVersion?: string
  optimize?: boolean
  cache?: boolean
}

interface BuildResult {
  success: boolean
  buildId?: string
  bundleUrl?: string
  error?: string
  logs?: string[]
}

interface BuildProgress {
  stage: 'idle' | 'preparing' | 'bundling' | 'optimizing' | 'uploading' | 'completed' | 'failed'
  progress: number
  message: string
}

export function usePreviewBuild() {
  const { toast } = useToast()
  const { currentProject } = useAppStore()
  const { files } = useFileSystemStore()
  const [isBuilding, setIsBuilding] = useState(false)
  const [buildProgress, setBuildProgress] = useState<BuildProgress>({
    stage: 'idle',
    progress: 0,
    message: ''
  })
  const [lastBuildResult, setLastBuildResult] = useState<BuildResult | null>(null)
  const [buildCache, setBuildCache] = useState<Map<string, string>>(new Map())

  // Generate cache key from dependencies and SDK version
  const generateCacheKey = useCallback((dependencies: Record<string, string>, sdkVersion: string, platform: string) => {
    const sorted = Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))
    const depString = sorted.map(([name, version]) => `${name}@${version}`).join(',')
    return `${platform}-${sdkVersion}-${depString}`
  }, [])

  // Check build cache
  const checkBuildCache = useCallback(async (cacheKey: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from('build_cache')
        .select('bundle_url')
        .eq('cache_key', cacheKey)
        .single()

      if (error || !data) return null

      // Increment cache hit count
      await supabase.rpc('increment_cache_hit', { p_cache_key: cacheKey })
      
      return data.bundle_url
    } catch (error) {
      console.error('Cache check error:', error)
      return null
    }
  }, [])

  // Save to build cache
  const saveToBuildCache = useCallback(async (
    cacheKey: string, 
    bundleUrl: string, 
    dependencies: Record<string, string>,
    sdkVersion: string,
    platform: string
  ) => {
    try {
      await supabase
        .from('build_cache')
        .upsert({
          cache_key: cacheKey,
          dependencies,
          sdk_version: sdkVersion,
          platform,
          bundle_url: bundleUrl
        })
    } catch (error) {
      console.error('Cache save error:', error)
    }
  }, [])

  // Extract dependencies from package.json
  const extractDependencies = useCallback(() => {
    const packageJsonFile = files.find(f => f.name === 'package.json')
    if (!packageJsonFile?.content) {
      return {}
    }

    try {
      const packageJson = JSON.parse(packageJsonFile.content)
      return {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      }
    } catch (error) {
      console.error('Failed to parse package.json:', error)
      return {}
    }
  }, [files])

  // Prepare files for bundling
  const prepareFiles = useCallback(() => {
    const fileMap: Record<string, string> = {}
    
    files.forEach(file => {
      if (file.type === 'file' && file.content) {
        fileMap[file.path] = file.content
      }
    })

    // Ensure we have an entry point
    if (!fileMap['App.js'] && !fileMap['App.jsx'] && !fileMap['App.tsx'] && !fileMap['App.ts']) {
      // Create a default App.js if none exists
      fileMap['App.js'] = `
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to Velocity!</Text>
      <Text style={styles.subtext}>Start editing App.js to see changes</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtext: {
    fontSize: 16,
    color: '#666',
  },
});
`
    }

    return fileMap
  }, [files])

  // Build preview
  const buildPreview = useCallback(async (options: BuildOptions = {}) => {
    if (!currentProject?.id) {
      toast({
        title: 'Error',
        description: 'No project selected',
        variant: 'destructive'
      })
      return null
    }

    const {
      platform = 'ios',
      sdkVersion = '50.0.0',
      optimize = true,
      cache = true
    } = options

    setIsBuilding(true)
    setBuildProgress({ stage: 'preparing', progress: 10, message: 'Preparing files...' })

    try {
      const dependencies = extractDependencies()
      const fileMap = prepareFiles()

      // Check cache if enabled
      if (cache) {
        const cacheKey = generateCacheKey(dependencies, sdkVersion, platform)
        const cachedUrl = await checkBuildCache(cacheKey)
        
        if (cachedUrl) {
          setBuildProgress({ 
            stage: 'completed', 
            progress: 100, 
            message: 'Loaded from cache' 
          })
          
          const result = {
            success: true,
            bundleUrl: cachedUrl,
            buildId: 'cached'
          }
          
          setLastBuildResult(result)
          setIsBuilding(false)
          
          toast({
            title: 'Build Complete',
            description: 'Preview loaded from cache',
          })
          
          return result
        }
      }

      setBuildProgress({ stage: 'bundling', progress: 30, message: 'Bundling React Native code...' })

      // Call the build Edge Function
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Not authenticated')

      const response = await supabase.functions.invoke('build-preview', {
        body: {
          projectId: currentProject.id,
          userId: session.user.id,
          files: fileMap,
          dependencies,
          sdkVersion,
          platform
        }
      })

      if (response.error) throw response.error

      const buildResult: BuildResult = response.data

      if (buildResult.success) {
        setBuildProgress({ stage: 'completed', progress: 100, message: 'Build successful!' })
        
        // Save to cache if enabled
        if (cache && buildResult.bundleUrl) {
          const cacheKey = generateCacheKey(dependencies, sdkVersion, platform)
          await saveToBuildCache(cacheKey, buildResult.bundleUrl, dependencies, sdkVersion, platform)
        }

        toast({
          title: 'Build Complete',
          description: 'Your preview is ready',
        })
      } else {
        setBuildProgress({ 
          stage: 'failed', 
          progress: 0, 
          message: buildResult.error || 'Build failed' 
        })
        
        toast({
          title: 'Build Failed',
          description: buildResult.error || 'Failed to build preview',
          variant: 'destructive'
        })
      }

      setLastBuildResult(buildResult)
      return buildResult

    } catch (error) {
      console.error('Build error:', error)
      setBuildProgress({ 
        stage: 'failed', 
        progress: 0, 
        message: error.message || 'Build failed' 
      })
      
      toast({
        title: 'Build Error',
        description: error.message || 'Failed to build preview',
        variant: 'destructive'
      })

      const result = {
        success: false,
        error: error.message || 'Build failed'
      }
      
      setLastBuildResult(result)
      return result

    } finally {
      setIsBuilding(false)
    }
  }, [currentProject, files, toast, extractDependencies, prepareFiles, generateCacheKey, checkBuildCache, saveToBuildCache])

  // Auto-build on significant file changes (debounced)
  useEffect(() => {
    if (!currentProject?.id || files.length === 0) return

    const hasCodeFiles = files.some(f => 
      f.type === 'file' && 
      (f.name.endsWith('.js') || f.name.endsWith('.jsx') || 
       f.name.endsWith('.ts') || f.name.endsWith('.tsx'))
    )

    if (!hasCodeFiles) return

    // Debounce auto-build
    const timer = setTimeout(() => {
      if (!isBuilding) {
        buildPreview({ cache: true })
      }
    }, 2000) // 2 second delay

    return () => clearTimeout(timer)
  }, [files, currentProject, isBuilding]) // Intentionally not including buildPreview to avoid loops

  return {
    buildPreview,
    isBuilding,
    buildProgress,
    lastBuildResult,
    buildCache: Array.from(buildCache.entries()).map(([key, url]) => ({ key, url }))
  }
}