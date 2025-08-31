import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'
import { AssetBundler } from '../_shared/asset-bundler.ts'
import { BuildOptimizer } from '../_shared/build-optimizer.ts'

// Metro bundler configuration for React Native
interface BuildConfig {
  projectId: string
  userId: string
  files: Record<string, string>
  dependencies: Record<string, string>
  sdkVersion: string
  platform: 'ios' | 'android' | 'web'
}

interface BuildResult {
  success: boolean
  bundleUrl?: string
  error?: string
  buildId?: string
  logs?: string[]
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { projectId, userId, files, dependencies, sdkVersion = '50.0.0', platform = 'ios' } = await req.json() as BuildConfig

    // Validate user access to project
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single()

    if (!project) {
      throw new Error('Unauthorized access to project')
    }

    // Create build record
    const { data: build, error: buildError } = await supabase
      .from('preview_builds')
      .insert({
        project_id: projectId,
        user_id: userId,
        status: 'building',
        platform,
        sdk_version: sdkVersion,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (buildError) throw buildError

    // Check build cache first
    const cacheKey = generateCacheKey(dependencies, sdkVersion, platform)
    const cachedBuild = await checkBuildCache(cacheKey)
    
    if (cachedBuild) {
      // Update build record with cached result
      await supabase
        .from('preview_builds')
        .update({
          status: 'completed',
          bundle_url: cachedBuild.bundle_url,
          completed_at: new Date().toISOString(),
          metadata: { cached: true }
        })
        .eq('id', build.id)

      return new Response(
        JSON.stringify({
          success: true,
          buildId: build.id,
          bundleUrl: cachedBuild.bundle_url,
          cached: true
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    // Initialize build optimizer
    const optimizer = new BuildOptimizer({
      platform,
      minify: true,
      treeshake: true,
      removeConsole: true
    })

    // Generate optimized Metro bundler configuration
    const metroConfig = optimizer.generateOptimizedMetroConfig()
    
    // Create entry point file
    const entryPoint = generateEntryPoint(files)
    
    // Extract and bundle assets
    const assetBundler = new AssetBundler(
      supabaseUrl,
      supabaseServiceKey,
      build.id,
      platform
    )
    const assets = AssetBundler.extractAssetsFromFiles(files)
    const bundledAssets = await assetBundler.bundleAssets(assets)
    
    // Generate asset manifest
    const assetManifest = assetBundler.generateAssetManifest(bundledAssets)
    
    // Bundle the React Native code with optimizations
    const bundleResult = await bundleReactNativeCode({
      buildId: build.id,
      files: { 
        ...files, 
        'index.js': entryPoint,
        'asset-manifest.json': assetManifest
      },
      dependencies,
      metroConfig,
      platform,
      optimizer
    })

    // Save to cache if successful
    if (bundleResult.success && bundleResult.bundleUrl) {
      await saveToBuildCache(cacheKey, bundleResult.bundleUrl, dependencies, sdkVersion, platform)
    }

    // Update build record with result
    await supabase
      .from('preview_builds')
      .update({
        status: bundleResult.success ? 'completed' : 'failed',
        bundle_url: bundleResult.bundleUrl,
        error: bundleResult.error,
        logs: bundleResult.logs,
        completed_at: new Date().toISOString()
      })
      .eq('id', build.id)

    return new Response(
      JSON.stringify({
        success: bundleResult.success,
        buildId: build.id,
        bundleUrl: bundleResult.bundleUrl,
        error: bundleResult.error,
        logs: bundleResult.logs
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: bundleResult.success ? 200 : 400
      }
    )

  } catch (error) {
    console.error('Build preview error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to build preview' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

function generateCacheKey(
  dependencies: Record<string, string>,
  sdkVersion: string,
  platform: string
): string {
  const sorted = Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))
  const depString = sorted.map(([name, version]) => `${name}@${version}`).join(',')
  const hashInput = `${platform}-${sdkVersion}-${depString}`
  
  // Simple hash function (in production, use crypto)
  let hash = 0
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  
  return `build-${Math.abs(hash).toString(36)}`
}

async function checkBuildCache(cacheKey: string): Promise<{ bundle_url: string } | null> {
  try {
    const { data, error } = await supabase
      .from('build_cache')
      .select('bundle_url')
      .eq('cache_key', cacheKey)
      .single()

    if (error || !data) return null

    // Increment cache hit count
    await supabase.rpc('increment_cache_hit', { p_cache_key: cacheKey })
    
    return data
  } catch (error) {
    console.error('Cache check error:', error)
    return null
  }
}

async function saveToBuildCache(
  cacheKey: string,
  bundleUrl: string,
  dependencies: Record<string, string>,
  sdkVersion: string,
  platform: string
): Promise<void> {
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
}

function generateMetroConfig(
  files: Record<string, string>, 
  dependencies: Record<string, string>,
  sdkVersion: string,
  platform: string
): string {
  return `
module.exports = {
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
    minifierConfig: {
      keep_fnames: true,
      mangle: {
        keep_fnames: true,
      },
    },
  },
  resolver: {
    sourceExts: ['js', 'jsx', 'ts', 'tsx', 'json'],
    assetExts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ttf', 'otf', 'woff', 'woff2'],
    platforms: ['${platform}'],
  },
  serializer: {
    processModuleFilter: (module) => {
      // Optimize bundle size by excluding unnecessary modules
      if (module.path.includes('node_modules/@babel')) return false
      if (module.path.includes('__tests__')) return false
      return true
    },
  },
  server: {
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        // Add CORS headers for container preview
        res.setHeader('Access-Control-Allow-Origin', '*')
        return middleware(req, res, next)
      }
    },
  },
  // Expo SDK configuration
  projectRoot: process.cwd(),
  watchFolders: [],
  resetCache: true,
}`
}

function generateEntryPoint(files: Record<string, string>): string {
  // Detect main entry file
  const mainFile = files['App.tsx'] ? 'App.tsx' : 
                  files['App.jsx'] ? 'App.jsx' :
                  files['App.js'] ? 'App.js' : 
                  'index.js'

  return `
import { registerRootComponent } from 'expo'
import App from './${mainFile.replace(/\.(js|jsx|ts|tsx)$/, '')}'

// Register the app
registerRootComponent(App)
`
}

async function bundleReactNativeCode(config: {
  buildId: string
  files: Record<string, string>
  dependencies: Record<string, string>
  metroConfig: string
  platform: string
  optimizer?: BuildOptimizer
}): Promise<BuildResult> {
  try {
    // Create temporary build directory
    const buildDir = `/tmp/builds/${config.buildId}`
    await Deno.mkdir(buildDir, { recursive: true })

    // Write all project files
    for (const [filePath, content] of Object.entries(config.files)) {
      const fullPath = `${buildDir}/${filePath}`
      const dir = fullPath.substring(0, fullPath.lastIndexOf('/'))
      await Deno.mkdir(dir, { recursive: true })
      await Deno.writeTextFile(fullPath, content)
    }

    // Write Metro config
    await Deno.writeTextFile(`${buildDir}/metro.config.js`, config.metroConfig)

    // Generate package.json with dependencies
    const packageJson = {
      name: 'velocity-preview',
      version: '1.0.0',
      main: 'index.js',
      dependencies: {
        'expo': '^50.0.0',
        'react': '18.2.0',
        'react-native': '0.73.0',
        ...config.dependencies
      }
    }
    await Deno.writeTextFile(
      `${buildDir}/package.json`, 
      JSON.stringify(packageJson, null, 2)
    )

    // Run Metro bundler
    const bundleCommand = new Deno.Command('npx', {
      args: [
        'react-native',
        'bundle',
        '--platform', config.platform,
        '--dev', 'false',
        '--entry-file', 'index.js',
        '--bundle-output', `${buildDir}/bundle.js`,
        '--assets-dest', `${buildDir}/assets`,
        '--reset-cache'
      ],
      cwd: buildDir,
      stdout: 'piped',
      stderr: 'piped'
    })

    const { code, stdout, stderr } = await bundleCommand.output()
    const logs = [
      new TextDecoder().decode(stdout),
      new TextDecoder().decode(stderr)
    ].filter(Boolean)

    if (code !== 0) {
      throw new Error(`Bundle failed: ${logs.join('\n')}`)
    }

    // Upload bundle to Supabase Storage
    const bundleContent = await Deno.readFile(`${buildDir}/bundle.js`)
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('preview-bundles')
      .upload(`${config.buildId}/bundle.js`, bundleContent, {
        contentType: 'application/javascript',
        cacheControl: '3600'
      })

    if (uploadError) throw uploadError

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('preview-bundles')
      .getPublicUrl(`${config.buildId}/bundle.js`)

    // Clean up temporary files
    await Deno.remove(buildDir, { recursive: true })

    return {
      success: true,
      bundleUrl: publicUrl,
      logs
    }

  } catch (error) {
    console.error('Bundling error:', error)
    return {
      success: false,
      error: error.message || 'Failed to bundle code',
      logs: []
    }
  }
}