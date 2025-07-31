import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'

interface Asset {
  path: string
  content: string | Uint8Array
  type: 'image' | 'font' | 'video' | 'audio' | 'other'
  mimeType?: string
}

interface BundledAsset {
  originalPath: string
  bundlePath: string
  url: string
  size: number
  type: string
  mimeType: string
}

export class AssetBundler {
  private supabase: ReturnType<typeof createClient>
  private buildId: string
  private platform: string

  constructor(supabaseUrl: string, supabaseKey: string, buildId: string, platform: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
    this.buildId = buildId
    this.platform = platform
  }

  async bundleAssets(assets: Asset[]): Promise<BundledAsset[]> {
    const bundledAssets: BundledAsset[] = []

    for (const asset of assets) {
      try {
        const bundled = await this.bundleAsset(asset)
        if (bundled) {
          bundledAssets.push(bundled)
        }
      } catch (error) {
        console.error(`Failed to bundle asset ${asset.path}:`, error)
      }
    }

    return bundledAssets
  }

  private async bundleAsset(asset: Asset): Promise<BundledAsset | null> {
    // Determine MIME type
    const mimeType = asset.mimeType || this.getMimeType(asset.path)
    
    // Convert content to Uint8Array if needed
    const content = typeof asset.content === 'string' 
      ? new TextEncoder().encode(asset.content)
      : asset.content

    // Optimize asset based on type and platform
    const optimizedContent = await this.optimizeAsset(content, asset.type, this.platform)
    
    // Generate bundle path
    const bundlePath = this.generateBundlePath(asset.path)
    
    // Upload to storage
    const { data, error } = await this.supabase.storage
      .from('build-assets')
      .upload(`${this.buildId}/${bundlePath}`, optimizedContent, {
        contentType: mimeType,
        cacheControl: '3600'
      })

    if (error) {
      console.error('Asset upload error:', error)
      return null
    }

    // Get public URL
    const { data: { publicUrl } } = this.supabase.storage
      .from('build-assets')
      .getPublicUrl(`${this.buildId}/${bundlePath}`)

    // Save asset metadata
    await this.supabase
      .from('asset_bundles')
      .insert({
        build_id: this.buildId,
        asset_type: asset.type,
        original_path: asset.path,
        bundle_path: bundlePath,
        file_size: optimizedContent.length,
        mime_type: mimeType,
        metadata: {
          platform: this.platform,
          optimized: true
        }
      })

    return {
      originalPath: asset.path,
      bundlePath,
      url: publicUrl,
      size: optimizedContent.length,
      type: asset.type,
      mimeType
    }
  }

  private async optimizeAsset(content: Uint8Array, type: string, platform: string): Promise<Uint8Array> {
    // Platform-specific optimizations
    switch (type) {
      case 'image':
        return await this.optimizeImage(content, platform)
      case 'font':
        return await this.optimizeFont(content, platform)
      default:
        return content
    }
  }

  private async optimizeImage(content: Uint8Array, platform: string): Promise<Uint8Array> {
    // For MVP, return original content
    // In production, use image optimization libraries
    
    // Platform-specific image requirements
    const maxSizes = {
      ios: { width: 3x * 375, height: 3x * 812 }, // iPhone 13 @3x
      android: { width: 1440, height: 3040 }, // xxhdpi
      web: { width: 1920, height: 1080 } // Full HD
    }

    // TODO: Implement actual image resizing/optimization
    // For now, just validate size isn't too large
    const MAX_SIZE = 5 * 1024 * 1024 // 5MB
    if (content.length > MAX_SIZE) {
      console.warn('Image too large, should be optimized')
    }

    return content
  }

  private async optimizeFont(content: Uint8Array, platform: string): Promise<Uint8Array> {
    // For MVP, return original content
    // In production, subset fonts based on used characters
    return content
  }

  private generateBundlePath(originalPath: string): string {
    // Normalize path for bundling
    const normalized = originalPath
      .replace(/\\/g, '/') // Windows path fix
      .replace(/^\//, '') // Remove leading slash
      .replace(/\s+/g, '_') // Replace spaces

    // Add platform prefix
    return `${this.platform}/${normalized}`
  }

  private getMimeType(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || ''
    
    const mimeTypes: Record<string, string> = {
      // Images
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'svg': 'image/svg+xml',
      
      // Fonts
      'ttf': 'font/ttf',
      'otf': 'font/otf',
      'woff': 'font/woff',
      'woff2': 'font/woff2',
      
      // Audio
      'mp3': 'audio/mpeg',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      
      // Video
      'mp4': 'video/mp4',
      'webm': 'video/webm',
      
      // Other
      'json': 'application/json',
      'txt': 'text/plain'
    }

    return mimeTypes[ext] || 'application/octet-stream'
  }

  // Generate asset manifest for React Native
  generateAssetManifest(bundledAssets: BundledAsset[]): string {
    const manifest: Record<string, any> = {
      version: 1,
      platform: this.platform,
      assets: {}
    }

    for (const asset of bundledAssets) {
      // React Native asset resolution format
      const assetKey = asset.originalPath.replace(/\.[^.]+$/, '')
      
      manifest.assets[assetKey] = {
        uri: asset.url,
        type: asset.type,
        width: undefined, // TODO: Extract from image metadata
        height: undefined,
        scales: [1] // TODO: Handle @2x, @3x assets
      }
    }

    return JSON.stringify(manifest, null, 2)
  }

  // Extract assets from project files
  static extractAssetsFromFiles(files: Record<string, string>): Asset[] {
    const assets: Asset[] = []
    
    for (const [path, content] of Object.entries(files)) {
      const assetType = AssetBundler.getAssetType(path)
      
      if (assetType !== 'other' || AssetBundler.isAssetFile(path)) {
        // For text files, content is already a string
        // For binary files, we'd need to handle base64 or binary data
        assets.push({
          path,
          content,
          type: assetType
        })
      }
    }

    return assets
  }

  private static getAssetType(path: string): Asset['type'] {
    const ext = path.split('.').pop()?.toLowerCase() || ''
    
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
      return 'image'
    }
    if (['ttf', 'otf', 'woff', 'woff2'].includes(ext)) {
      return 'font'
    }
    if (['mp3', 'wav', 'ogg'].includes(ext)) {
      return 'audio'
    }
    if (['mp4', 'webm'].includes(ext)) {
      return 'video'
    }
    
    return 'other'
  }

  private static isAssetFile(path: string): boolean {
    // Check if file is in assets directory or has asset-like path
    return path.includes('/assets/') || 
           path.includes('/images/') ||
           path.includes('/fonts/') ||
           path.includes('/sounds/') ||
           path.includes('/videos/')
  }
}