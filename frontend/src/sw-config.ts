// Service Worker Configuration for optimal caching

export const cacheConfig = {
  // Cache names
  cacheNames: {
    precache: 'velocity-precache-v1',
    runtime: 'velocity-runtime-v1',
    images: 'velocity-images-v1',
    fonts: 'velocity-fonts-v1',
    api: 'velocity-api-v1',
  },

  // Cache expiration times (in seconds)
  expirationTimes: {
    images: 30 * 24 * 60 * 60, // 30 days
    fonts: 365 * 24 * 60 * 60, // 1 year
    api: 5 * 60, // 5 minutes
    default: 24 * 60 * 60, // 24 hours
  },

  // Runtime caching strategies
  runtimeCaching: [
    // Images - Cache First
    {
      urlPattern: /\.(png|jpg|jpeg|svg|gif|webp|ico)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'images',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },

    // Fonts - Cache First
    {
      urlPattern: /\.(woff|woff2|ttf|otf|eot)$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'fonts',
        expiration: {
          maxEntries: 20,
          maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
        },
      },
    },

    // API calls - Network First
    {
      urlPattern: /^https?:\/\/api\./,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'api',
        networkTimeoutSeconds: 5,
        expiration: {
          maxEntries: 50,
          maxAgeSeconds: 5 * 60, // 5 minutes
        },
      },
    },

    // Monaco Editor CDN - Cache First with long expiration
    {
      urlPattern: /^https:\/\/cdn\.jsdelivr\.net\/npm\/monaco-editor/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'monaco-cdn',
        expiration: {
          maxEntries: 100,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
      },
    },

    // Google Fonts - Cache First
    {
      urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
        },
      },
    },
  ],

  // Precache manifest filter
  precacheFilter: (url: string) => {
    // Exclude source maps from precaching in production
    if (url.endsWith('.map')) return false
    
    // Exclude large assets that should be lazy loaded
    if (url.includes('monaco-vendor')) return false
    
    return true
  },

  // Skip waiting configuration
  skipWaiting: true,
  clientsClaim: true,
}

// Cache versioning strategy
export const getCacheVersion = () => {
  return `v${__APP_VERSION__}-${__BUILD_TIME__}`
}

// Clear old caches
export const clearOldCaches = async () => {
  const currentCaches = Object.values(cacheConfig.cacheNames)
  const cacheWhitelist = currentCaches.map(name => `${name}-${getCacheVersion()}`)
  
  const cacheNames = await caches.keys()
  const cachesToDelete = cacheNames.filter(name => !cacheWhitelist.includes(name))
  
  await Promise.all(cachesToDelete.map(name => caches.delete(name)))
}