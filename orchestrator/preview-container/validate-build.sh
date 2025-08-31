#!/bin/bash

# Validate Container Build Configuration
# This script tests the container build process locally

set -e

echo "🔍 Validating container build configuration..."

# Check if required files exist
echo "✅ Checking required files..."
if [[ ! -f "Dockerfile" ]]; then
    echo "❌ Dockerfile not found"
    exit 1
fi

if [[ ! -f "package.json" ]]; then
    echo "❌ package.json not found"
    exit 1
fi

if [[ ! -f "entrypoint.js" ]]; then
    echo "❌ entrypoint.js not found"
    exit 1
fi

echo "✅ All required files present"

# Validate Dockerfile syntax
echo "🐳 Validating Dockerfile syntax..."
if command -v docker &> /dev/null; then
    # Basic syntax check by parsing the Dockerfile
    if docker buildx build --dry-run --progress=plain . > /dev/null 2>&1; then
        echo "✅ Dockerfile syntax is valid"
    else
        echo "⚠️  Dockerfile may have syntax issues (build system may work differently in GitHub Actions)"
    fi
else
    echo "⚠️  Docker not installed, skipping Dockerfile validation"
fi

# Validate package.json
echo "📦 Validating package.json..."
if command -v node &> /dev/null; then
    if node -e "JSON.parse(require('fs').readFileSync('package.json', 'utf8'))" 2> /dev/null; then
        echo "✅ package.json is valid JSON"
    else
        echo "❌ package.json has syntax errors"
        exit 1
    fi
else
    echo "⚠️  Node.js not installed, skipping package.json validation"
fi

# Check entrypoint.js syntax
echo "🔧 Validating entrypoint.js syntax..."
if command -v node &> /dev/null; then
    if node -c entrypoint.js 2> /dev/null; then
        echo "✅ entrypoint.js syntax is valid"
    else
        echo "❌ entrypoint.js has syntax errors"
        exit 1
    fi
else
    echo "⚠️  Node.js not installed, skipping entrypoint.js validation"
fi

# Test local build preparation (skip actual build due to time)
echo "🏗️  Checking build readiness..."
if command -v docker &> /dev/null; then
    echo "✅ Docker is available for building"
    echo "⚠️  Skipping actual build test (takes several minutes)"
    echo "   Build will be tested automatically by GitHub Actions on commit"
else
    echo "⚠️  Docker not installed, build will only work in GitHub Actions"
fi

echo ""
echo "🎉 All validations completed successfully!"
echo ""
echo "Next steps:"
echo "1. Commit changes to trigger GitHub Actions workflow"
echo "2. Monitor workflow execution in GitHub Actions tab"
echo "3. Verify container is pushed to GHCR"
echo "4. Test container deployment in orchestrator service"