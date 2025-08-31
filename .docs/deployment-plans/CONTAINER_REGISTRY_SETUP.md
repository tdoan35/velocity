# Container Registry Setup Documentation

## Overview

This document describes the GitHub Container Registry (GHCR) setup for the Velocity preview container automation system.

## Implementation Summary

### 1. GitHub Actions Workflow

**File**: `.github/workflows/preview-container-build.yml`

**Features Implemented**:
- Multi-platform builds (linux/amd64, linux/arm64)
- Automated tagging strategy (latest, branch-sha, pr-number)
- Security scanning with Trivy
- SARIF reporting to GitHub Security tab
- Build caching for faster builds
- Automated environment variable updates
- Pull request automation for image reference updates

**Triggers**:
- Push to main/master branch affecting preview container files
- Pull requests affecting preview container files  
- Manual workflow dispatch

### 2. Container Configuration

**Files**:
- `orchestrator/preview-container/Dockerfile` - Updated with curl dependency for health checks
- `orchestrator/config/container-registry.json` - Registry configuration and versioning strategy
- `orchestrator/.env` - Updated with correct GHCR image reference

**Image Reference**: `ghcr.io/tdoan35/velocity/velocity-preview-container:latest`

### 3. Security Implementation

**Security Features**:
- GITHUB_TOKEN authentication (no additional secrets required)
- Trivy vulnerability scanning on all builds
- SARIF security reports uploaded to GitHub Security tab
- Container runs as non-root user
- Multi-platform support for better security coverage

### 4. Automation Features

**Build Automation**:
- Automatic container building on code changes
- Versioned tagging with commit SHAs
- Automated cleanup of old images
- Build status reporting in GitHub Actions summary

**Deployment Integration**:
- Auto-update of orchestrator environment variables
- Pull request creation for image reference changes
- Integration with existing Fly.io deployment process

## Testing & Validation

### Validation Script

**File**: `orchestrator/preview-container/validate-build.sh`

**Validation Checks**:
- ✅ Required files present (Dockerfile, package.json, entrypoint.js)
- ✅ package.json syntax validation
- ✅ entrypoint.js syntax validation
- ✅ Docker availability check
- ⚠️  Dockerfile syntax (build system differences noted)

### Test Trigger File

**File**: `orchestrator/preview-container/.github-actions-test`
- Created to test workflow trigger
- Contains expected outcomes and checklist
- Will be removed after successful validation

## Usage Instructions

### For Developers

1. **Making Container Changes**:
   ```bash
   # Make changes to files in orchestrator/preview-container/
   git add orchestrator/preview-container/
   git commit -m "feat: update preview container"
   git push origin main
   ```

2. **Monitoring Builds**:
   - Go to GitHub Actions tab
   - Watch "Preview Container Build and Push" workflow
   - Check build summary for image details
   - Review security scan results if any vulnerabilities found

3. **Using Specific Versions**:
   ```bash
   # Latest stable
   docker pull ghcr.io/tdoan35/velocity/velocity-preview-container:latest
   
   # Specific commit
   docker pull ghcr.io/tdoan35/velocity/velocity-preview-container:main-abc1234
   ```

### For Operations

1. **Registry Management**:
   - Images are automatically cleaned up by GitHub's retention policies
   - Manual deletion available via GitHub Container Registry interface
   - Access control managed through GitHub repository permissions

2. **Security Monitoring**:
   - Security scan results appear in GitHub Security tab
   - Critical vulnerabilities will fail the build
   - Regular security updates handled automatically

3. **Troubleshooting**:
   - Check GitHub Actions logs for build failures
   - Review Dockerfile syntax if builds fail
   - Verify image can be pulled from GHCR manually

## Configuration Files

### Registry Configuration
```json
{
  "registry": {
    "host": "ghcr.io",
    "namespace": "tdoan35/velocity",
    "imageName": "velocity-preview-container"
  },
  "versioning": {
    "strategy": "semantic+commit",
    "tagFormats": {
      "latest": "latest",
      "branch": "{branch}-{shortSha}",
      "pullRequest": "pr-{prNumber}"
    }
  }
}
```

### Environment Variables
```bash
# In orchestrator/.env
PREVIEW_CONTAINER_IMAGE=ghcr.io/tdoan35/velocity/velocity-preview-container:latest
```

## Next Steps

1. **Commit Changes**: Push all changes to trigger the first automated build
2. **Monitor Build**: Watch GitHub Actions for successful completion
3. **Verify Images**: Confirm images appear in GitHub Container Registry
4. **Test Integration**: Ensure orchestrator service can pull and use the new images
5. **Clean Up**: Remove test files after successful validation

## Integration Points

- **Orchestrator Service**: Uses `PREVIEW_CONTAINER_IMAGE` environment variable
- **Fly.io Deployment**: Container images pulled during machine provisioning
- **Real-time Preview System**: New containers instantiated with latest image
- **CI/CD Pipeline**: Automated testing and deployment workflow

## Maintenance

- **Image Updates**: Automatic on every commit to main branch
- **Security Patches**: Handled through base image updates and dependency management
- **Cleanup**: Old images cleaned up automatically by GitHub retention policies
- **Monitoring**: GitHub Actions provide build status and security scan results