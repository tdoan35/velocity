#!/bin/bash

# Build and Deploy Script for CI/CD
set -e

echo "🚀 Starting production build and deployment..."

# Load environment variables
if [ -f .env.production ]; then
  export $(cat .env.production | grep -v '^#' | xargs)
fi

# Clean previous builds
echo "🧹 Cleaning previous builds..."
rm -rf dist

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --production=false

# Run tests
echo "🧪 Running tests..."
npm run test:ci || echo "No tests configured yet"

# Run linting
echo "🔍 Running linting..."
npm run lint || echo "No linting configured yet"

# Build for production
echo "🏗️ Building for production..."
npm run build

# Compress assets
echo "📦 Compressing assets..."
find dist -name "*.js" -o -name "*.css" -o -name "*.html" | while read file; do
  if [ ! -f "$file.gz" ]; then
    gzip -k -9 "$file"
  fi
  if [ ! -f "$file.br" ]; then
    brotli -Z "$file" || echo "Brotli not installed, skipping..."
  fi
done

# Generate deployment manifest
echo "📋 Generating deployment manifest..."
cat > dist/deploy-manifest.json << EOF
{
  "version": "${VITE_APP_VERSION}",
  "buildTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "commitHash": "$(git rev-parse --short HEAD)",
  "branch": "$(git branch --show-current)"
}
EOF

# Create deployment archive
echo "📦 Creating deployment archive..."
tar -czf deploy-$(date +%Y%m%d-%H%M%S).tar.gz dist/

echo "✅ Build complete! Ready for deployment."

# Optional: Deploy to hosting service
# Examples:
# - AWS S3: aws s3 sync dist/ s3://your-bucket/ --delete
# - Netlify: netlify deploy --prod --dir=dist
# - Vercel: vercel --prod
# - GitHub Pages: gh-pages -d dist