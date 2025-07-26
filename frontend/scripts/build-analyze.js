#!/usr/bin/env node

import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

console.log('📊 Building with bundle analysis...')

try {
  // Set environment variable for analysis
  process.env.ANALYZE = 'true'
  
  // Run build command
  execSync('npm run build', {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, ANALYZE: 'true' }
  })
  
  console.log('\n✅ Build complete! Check dist/stats.html for bundle analysis.')
} catch (error) {
  console.error('\n❌ Build failed:', error.message)
  process.exit(1)
}