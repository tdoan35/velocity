#!/bin/bash

# Velocity Preview Container Build Script
# This script builds and optionally pushes the preview container image

set -e

# Configuration
IMAGE_NAME="ghcr.io/velocity/preview-container"
TAG="${1:-latest}"
DOCKERFILE_PATH="./Dockerfile"

echo "🚀 Building Velocity Preview Container"
echo "📦 Image: ${IMAGE_NAME}:${TAG}"

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build the image
echo "🔨 Building Docker image..."
docker build \
    --platform linux/amd64 \
    --tag "${IMAGE_NAME}:${TAG}" \
    --file "${DOCKERFILE_PATH}" \
    .

echo "✅ Build completed successfully!"

# Get image size
IMAGE_SIZE=$(docker images "${IMAGE_NAME}:${TAG}" --format "table {{.Size}}" | tail -1)
echo "📏 Image size: ${IMAGE_SIZE}"

# Ask if user wants to push
if [ "${2}" = "--push" ]; then
    echo "🚀 Pushing image to registry..."
    docker push "${IMAGE_NAME}:${TAG}"
    echo "✅ Image pushed successfully!"
else
    echo ""
    echo "To push the image to the registry, run:"
    echo "  ./build.sh ${TAG} --push"
fi

echo ""
echo "To test the image locally:"
echo "  docker run -p 8080:8080 \\"
echo "    -e PROJECT_ID=test-project \\"
echo "    -e SUPABASE_URL=https://your-project.supabase.co \\"
echo "    -e SUPABASE_ANON_KEY=your-key \\"
echo "    ${IMAGE_NAME}:${TAG}"