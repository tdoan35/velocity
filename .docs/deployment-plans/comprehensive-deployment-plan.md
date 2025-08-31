# Velocity Platform - Comprehensive Deployment Plan

**Document Version:** 1.0  
**Date:** August 31, 2025  
**Status:** Draft  
**Project Phase:** Post-Implementation Deployment Strategy  

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Environment Strategy](#3-environment-strategy)
4. [Service-by-Service Deployment](#4-service-by-service-deployment)
5. [Infrastructure as Code](#5-infrastructure-as-code)
6. [CI/CD Pipeline Configuration](#6-cicd-pipeline-configuration)
7. [Security & Compliance](#7-security--compliance)
8. [Monitoring & Observability](#8-monitoring--observability)
9. [Performance Optimization](#9-performance-optimization)
10. [Rollback & Disaster Recovery](#10-rollback--disaster-recovery)
11. [Pre-Deployment Checklist](#11-pre-deployment-checklist)
12. [Post-Deployment Verification](#12-post-deployment-verification)
13. [Maintenance & Operations](#13-maintenance--operations)

---

## 1. Overview

### 1.1 Deployment Philosophy

**Zero-Downtime Deployment Strategy:** All deployments must maintain service availability through blue-green deployment patterns, progressive rollouts, and health checks.

**Environment Promotion:** Code flows through Development → Staging → Production with automated testing and manual approval gates.

**Infrastructure as Code:** All infrastructure, configuration, and deployment procedures are version-controlled and automated.

### 1.2 Success Criteria

- ✅ 99.9% uptime during deployments
- ✅ Sub-5 second rollback capability
- ✅ Automated security scanning and compliance checks
- ✅ Comprehensive monitoring and alerting
- ✅ Performance benchmarks maintained post-deployment

---

## 2. Architecture Overview

### 2.1 Production Architecture

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Vercel Frontend   │    │  Fly.io Orchestr.   │    │  Supabase Backend   │
│   (Global CDN)      │    │   (Multi-Region)    │    │   (Multi-Region)    │
│                     │    │                     │    │                     │
│ ┌─────────────────┐ │    │ ┌─────────────────┐ │    │ ┌─────────────────┐ │
│ │ React/Next.js   │ │    │ │ Node.js API     │ │    │ │ PostgreSQL      │ │
│ │ Monaco Editor   │ │    │ │ Fly Machines    │ │    │ │ Realtime        │ │
│ │ Tailwind CSS    │ │    │ │ WebSocket Hub   │ │    │ │ Storage         │ │
│ └─────────────────┘ │    │ └─────────────────┘ │    │ │ Edge Functions  │ │
└─────────────────────┘    └─────────────────────┘    │ └─────────────────┘ │
                                    │                 └─────────────────────┘
                                    │
                           ┌─────────────────────┐
                           │  Preview Containers │
                           │    (Fly Machines)   │
                           │                     │
                           │ ┌─────────────────┐ │
                           │ │ Node.js Runtime │ │
                           │ │ Vite/Expo Dev   │ │
                           │ │ File Watcher    │ │
                           │ └─────────────────┘ │
                           └─────────────────────┘
```

### 2.2 Service Dependencies

```
Frontend (Vercel) 
├── Depends on: Orchestrator API, Supabase API
├── Fallback: Static error pages, offline mode
└── SLA: 99.9% uptime

Orchestrator (Fly.io)
├── Depends on: Fly Machines API, Supabase DB, GHCR
├── Fallback: Queue requests, legacy preview mode
└── SLA: 99.9% uptime

Preview Containers (Fly Machines)
├── Depends on: Supabase Realtime, Project files
├── Fallback: Container recycling, error states  
└── SLA: 99.5% uptime (ephemeral)

Supabase Backend
├── Depends on: Cloud provider (AWS)
├── Fallback: Read replicas, point-in-time recovery
└── SLA: 99.99% uptime
```

---

## 3. Environment Strategy

### 3.1 Environment Tiers

#### **Development Environment**
- **Purpose:** Local development and testing
- **Infrastructure:** Developer machines, Docker Compose
- **Database:** Local PostgreSQL or Supabase local
- **Preview:** Local Fly.io development containers
- **Domain:** `localhost:3000`, `*.localhost`

#### **Staging Environment**  
- **Purpose:** Pre-production testing and validation
- **Infrastructure:** Reduced-scale production mirrors
- **Database:** Supabase staging project
- **Preview:** Limited Fly.io staging machines
- **Domain:** `staging.velocity-platform.com`

#### **Production Environment**
- **Purpose:** Live user-facing application
- **Infrastructure:** Full-scale, multi-region deployment
- **Database:** Supabase production with read replicas
- **Preview:** Auto-scaling Fly.io machine pools
- **Domain:** `app.velocity-platform.com`

### 3.2 Environment Configuration

| Configuration | Development | Staging | Production |
|---------------|-------------|---------|------------|
| Frontend Instances | 1 | 2 | Global CDN |
| Orchestrator Instances | 1 | 2 | 3+ (Multi-region) |
| Database Connections | 10 | 25 | 100+ |
| Preview Container Pool | 2 | 5 | 20+ |
| Log Retention | 7 days | 30 days | 365 days |
| Backup Frequency | None | Daily | Hourly |
| Monitoring Level | Basic | Standard | Enterprise |

---

## 4. Service-by-Service Deployment

### 4.1 Frontend Deployment (Vercel)

#### **Pre-Deployment Steps**
```bash
# Environment setup
npm run build
npm run test:ci
npm run lighthouse:ci
npm run security:scan

# Bundle analysis
npm run bundle:analyze
npm run performance:audit
```

#### **Deployment Configuration**
```json
{
  "vercel.json": {
    "framework": "nextjs",
    "buildCommand": "npm run build",
    "installCommand": "npm ci",
    "devCommand": "npm run dev",
    "regions": ["iad1", "sfo1", "lhr1", "syd1"],
    "functions": {
      "app/api/**": {
        "maxDuration": 30
      }
    },
    "headers": [
      {
        "source": "/(.*)",
        "headers": [
          {
            "key": "Content-Security-Policy",
            "value": "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' *.vercel.app *.supabase.co; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' *.supabase.co *.fly.dev wss:;"
          },
          {
            "key": "X-Frame-Options", 
            "value": "SAMEORIGIN"
          },
          {
            "key": "X-Content-Type-Options",
            "value": "nosniff"
          }
        ]
      }
    ]
  }
}
```

#### **Deployment Steps**
1. **Automated via GitHub Actions**
2. **Manual override available via Vercel CLI**
3. **Preview deployments for all branches**
4. **Production deployment on main branch merge**

#### **Health Checks**
```bash
# Endpoint health
curl -f https://app.velocity-platform.com/api/health

# Performance check  
curl -w "@curl-format.txt" -s -o /dev/null https://app.velocity-platform.com

# Bundle size check
ls -la .next/static/chunks/
```

### 4.2 Orchestrator Service Deployment (Fly.io)

#### **Pre-Deployment Steps**
```bash
# Build and test
cd orchestrator/
npm run build
npm run test:unit
npm run test:integration
npm run security:audit

# Container build
docker build -t velocity-orchestrator .
docker run --rm velocity-orchestrator npm test
```

#### **Deployment Configuration (`fly.toml`)**
```toml
app = "velocity-orchestrator"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[[services]]
  http_checks = []
  internal_port = 3000
  processes = ["app"]
  protocol = "tcp"
  script_checks = []

  [services.concurrency]
    hard_limit = 100
    soft_limit = 80
    type = "connections"

  [[services.ports]]
    force_https = true
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [[services.tcp_checks]]
    grace_period = "10s"
    interval = "30s"
    restart_limit = 0
    timeout = "5s"

[env]
  NODE_ENV = "production"
  FLY_REGION = "iad"

[experimental]
  auto_rollback = true

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512
```

#### **Multi-Region Deployment**
```bash
# Deploy to primary region
fly deploy --region iad

# Scale to additional regions  
fly machine clone --region sfo
fly machine clone --region lhr

# Verify deployment
fly status
fly logs
```

#### **Health Checks**
```bash
# Service health
fly status
curl https://velocity-orchestrator.fly.dev/health

# Machine management test
curl -X POST https://velocity-orchestrator.fly.dev/sessions/start \
  -H "Authorization: Bearer $API_TOKEN" \
  -d '{"projectId": "test-project"}'
```

### 4.3 Preview Container Registry (GHCR)

#### **Container Build Pipeline**
```dockerfile
# orchestrator/preview-container/Dockerfile
FROM node:18-slim

# System dependencies
RUN apt-get update && apt-get install -y \
    git curl wget \
    && rm -rf /var/lib/apt/lists/*

# Global development tools
RUN npm install -g \
    vite@latest \
    @expo/cli@latest \
    nodemon@latest \
    create-react-app

# Application setup
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# Application code
COPY entrypoint.js ./
COPY templates/ ./templates/

# Container configuration
EXPOSE 8080
USER node
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

CMD ["node", "entrypoint.js"]
```

#### **GitHub Actions Registry Pipeline**
```yaml
# .github/workflows/build-preview-container.yml
name: Build Preview Container

on:
  push:
    branches: [main]
    paths: ['orchestrator/preview-container/**']

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3
      
    - name: Login to GitHub Container Registry
      uses: docker/login-action@v3
      with:
        registry: ghcr.io
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Build and push
      uses: docker/build-push-action@v5
      with:
        context: orchestrator/preview-container
        push: true
        tags: |
          ghcr.io/${{ github.repository }}/preview-container:latest
          ghcr.io/${{ github.repository }}/preview-container:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
```

### 4.4 Supabase Configuration

#### **Database Migration Strategy**
```bash
# Run migrations
npx supabase db push --linked

# Verify schema
npx supabase db diff --linked --schema public

# Create backup point
npx supabase db dump --data-only > backup-$(date +%Y%m%d).sql
```

#### **Edge Functions Deployment**
```bash
# Deploy all functions
npx supabase functions deploy --no-verify-jwt

# Deploy specific function
npx supabase functions deploy ai-code-generation

# Verify deployment
npx supabase functions list
```

#### **Storage Bucket Configuration**
```sql
-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('projects', 'projects', false),
  ('user-assets', 'user-assets', false),
  ('preview-artifacts', 'preview-artifacts', false);

-- Set up storage policies
CREATE POLICY "Users can upload to their own folder" ON storage.objects
  FOR INSERT WITH CHECK (auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view their own files" ON storage.objects
  FOR SELECT USING (auth.uid()::text = (storage.foldername(name))[1]);
```

---

## 5. Infrastructure as Code

### 5.1 Terraform Configuration

#### **Main Configuration (`main.tf`)**
```hcl
terraform {
  required_version = ">= 1.0"
  required_providers {
    fly = {
      source  = "fly-apps/fly"
      version = "~> 0.0.20"
    }
    vercel = {
      source  = "vercel/vercel"
      version = "~> 0.4"
    }
    supabase = {
      source = "supabase/supabase"
      version = "~> 1.0"
    }
  }

  backend "s3" {
    bucket = "velocity-terraform-state"
    key    = "production/terraform.tfstate"
    region = "us-east-1"
  }
}

# Fly.io Orchestrator App
resource "fly_app" "orchestrator" {
  name = "velocity-orchestrator"
  org  = "velocity"
}

resource "fly_machine" "orchestrator" {
  count  = 3
  app    = fly_app.orchestrator.name
  region = var.regions[count.index]
  name   = "orchestrator-${var.regions[count.index]}"
  
  image = "ghcr.io/velocity/velocity-orchestrator:latest"
  
  services = [{
    ports = [{
      port     = 80
      handlers = ["http"]
    }, {
      port     = 443
      handlers = ["tls", "http"]
    }]
    
    internal_port = 3000
    protocol     = "tcp"
  }]

  env = {
    NODE_ENV = "production"
    FLY_REGION = var.regions[count.index]
  }
}

# Vercel Project
resource "vercel_project" "velocity" {
  name      = "velocity-platform"
  framework = "nextjs"
  
  git_repository = {
    type = "github"
    repo = "velocity/velocity-platform"
  }

  environment = [
    {
      key    = "NEXT_PUBLIC_SUPABASE_URL"
      value  = var.supabase_url
      target = ["production"]
    },
    {
      key    = "NEXT_PUBLIC_SUPABASE_ANON_KEY" 
      value  = var.supabase_anon_key
      target = ["production"]
    }
  ]
}
```

#### **Variables (`variables.tf`)**
```hcl
variable "regions" {
  description = "Deployment regions"
  type        = list(string)
  default     = ["iad", "sfo", "lhr"]
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "supabase_url" {
  description = "Supabase project URL"
  type        = string
  sensitive   = true
}

variable "supabase_anon_key" {
  description = "Supabase anonymous key"
  type        = string
  sensitive   = true
}
```

### 5.2 Environment Management

#### **Development (`dev.tfvars`)**
```hcl
environment = "development"
regions     = ["iad"]
```

#### **Staging (`staging.tfvars`)**
```hcl
environment = "staging"
regions     = ["iad", "sfo"]
```

#### **Production (`prod.tfvars`)**
```hcl
environment = "production"
regions     = ["iad", "sfo", "lhr"]
```

---

## 6. CI/CD Pipeline Configuration

### 6.1 GitHub Actions Workflow

#### **Main Pipeline (`.github/workflows/deploy.yml`)**
```yaml
name: Deploy Velocity Platform

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  NODE_VERSION: '18'
  REGISTRY: ghcr.io

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run linting
      run: npm run lint
    
    - name: Run type checking  
      run: npm run type-check
    
    - name: Run unit tests
      run: npm run test:unit
      
    - name: Run integration tests
      run: npm run test:integration
      env:
        DATABASE_URL: postgres://postgres:postgres@localhost:5432/velocity_test
    
    - name: Run security scan
      run: npm audit --audit-level=high

  build-frontend:
    needs: test
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build application
      run: npm run build
      env:
        NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
    
    - name: Upload build artifacts
      uses: actions/upload-artifact@v3
      with:
        name: frontend-build
        path: .next/

  build-orchestrator:
    needs: test
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Docker Buildx
      uses: docker/setup-buildx-action@v3
    
    - name: Login to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Build and push orchestrator
      uses: docker/build-push-action@v5
      with:
        context: orchestrator/
        push: true
        tags: |
          ${{ env.REGISTRY }}/${{ github.repository }}/orchestrator:latest
          ${{ env.REGISTRY }}/${{ github.repository }}/orchestrator:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

  build-preview-container:
    needs: test
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Docker Buildx
      uses: docker/setup-buildx-action@v3
    
    - name: Login to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GITHUB_TOKEN }}
    
    - name: Build and push preview container
      uses: docker/build-push-action@v5
      with:
        context: orchestrator/preview-container/
        push: true
        tags: |
          ${{ env.REGISTRY }}/${{ github.repository }}/preview-container:latest
          ${{ env.REGISTRY }}/${{ github.repository }}/preview-container:${{ github.sha }}
        cache-from: type=gha
        cache-to: type=gha,mode=max

  deploy-staging:
    needs: [build-frontend, build-orchestrator, build-preview-container]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: staging
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Deploy to Vercel Staging
      uses: amondnet/vercel-action@v25
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
        vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
        working-directory: ./
        alias-domains: staging.velocity-platform.com
    
    - name: Deploy Orchestrator to Fly.io Staging
      uses: superfly/flyctl-actions/setup-flyctl@master
      with:
        version: latest
    - run: |
        echo "${{ secrets.FLY_API_TOKEN }}" | flyctl auth docker
        flyctl deploy --config orchestrator/fly.staging.toml
      env:
        FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Deploy to Vercel Production
      uses: amondnet/vercel-action@v25
      with:
        vercel-token: ${{ secrets.VERCEL_TOKEN }}
        vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
        vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
        vercel-args: '--prod'
        working-directory: ./
    
    - name: Deploy Orchestrator to Fly.io Production
      uses: superfly/flyctl-actions/setup-flyctl@master
      with:
        version: latest
    - run: |
        echo "${{ secrets.FLY_API_TOKEN }}" | flyctl auth docker
        flyctl deploy --config orchestrator/fly.toml
      env:
        FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
    
    - name: Run smoke tests
      run: |
        npm run test:smoke -- --url=https://app.velocity-platform.com
```

### 6.2 Deployment Gates & Approvals

#### **Branch Protection Rules**
```yaml
# GitHub repository settings
branch_protection_rules:
  main:
    required_status_checks:
      - "test"
      - "build-frontend" 
      - "build-orchestrator"
      - "build-preview-container"
    required_pull_request_reviews: 2
    dismiss_stale_reviews: true
    require_code_owner_reviews: true
    required_approving_review_count: 2
```

#### **Environment Protection Rules**
```yaml
environments:
  staging:
    deployment_branch_policy:
      protected_branches: true
    
  production:
    deployment_branch_policy:
      protected_branches: true
    reviewers:
      - team: "platform-team"
      - user: "tech-lead"
    wait_timer: 5 # minutes
```

---

## 7. Security & Compliance

### 7.1 Security Scanning Pipeline

#### **SAST (Static Application Security Testing)**
```yaml
# Security scanning job
security-scan:
  runs-on: ubuntu-latest
  
  steps:
  - uses: actions/checkout@v4
  
  - name: Run Semgrep
    uses: returntocorp/semgrep-action@v1
    with:
      config: >-
        p/security-audit
        p/secrets
        p/owasp-top-ten
  
  - name: Run npm audit
    run: npm audit --audit-level=high
  
  - name: Run Snyk
    uses: snyk/actions/node@master
    env:
      SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
    with:
      args: --severity-threshold=high
```

#### **Container Security Scanning**
```yaml
# Container scanning
container-scan:
  runs-on: ubuntu-latest
  
  steps:
  - name: Run Trivy vulnerability scanner
    uses: aquasecurity/trivy-action@master
    with:
      image-ref: 'ghcr.io/${{ github.repository }}/orchestrator:${{ github.sha }}'
      format: 'sarif'
      output: 'trivy-results.sarif'
  
  - name: Upload Trivy scan results
    uses: github/codeql-action/upload-sarif@v2
    with:
      sarif_file: 'trivy-results.sarif'
```

### 7.2 Environment Secrets Management

#### **GitHub Actions Secrets**
```
Production Environment:
- VERCEL_TOKEN
- VERCEL_ORG_ID  
- VERCEL_PROJECT_ID
- FLY_API_TOKEN
- SUPABASE_ACCESS_TOKEN
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- ANTHROPIC_API_KEY
- OPENAI_API_KEY
- SENTRY_DSN
- ANALYTICS_API_KEY

Security Scanning:
- SNYK_TOKEN
- SONARCLOUD_TOKEN
```

#### **Fly.io Secrets Management**
```bash
# Set production secrets
flyctl secrets set \
  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  GITHUB_CONTAINER_REGISTRY_TOKEN="$GHCR_TOKEN"

# Verify secrets
flyctl secrets list
```

### 7.3 Network Security Configuration

#### **Fly.io Network Policies**
```toml
# fly.toml
[experimental]
  private_network = true

[[services]]
  internal_port = 3000
  protocol = "tcp"
  
  [[services.http_checks]]
    interval = 30000
    timeout = 10000
    grace_period = "10s"
    method = "GET"
    path = "/health"
    protocol = "http"
```

#### **Vercel Security Headers**
```javascript
// next.config.js
const securityHeaders = [
  {
    key: 'Content-Security-Policy',
    value: `
      default-src 'self';
      script-src 'self' 'unsafe-eval' 'unsafe-inline' *.vercel.app *.supabase.co;
      style-src 'self' 'unsafe-inline';
      img-src 'self' data: https:;
      connect-src 'self' *.supabase.co *.fly.dev wss:;
      font-src 'self' fonts.gstatic.com;
    `.replace(/\s{2,}/g, ' ').trim()
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options', 
    value: 'nosniff'
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin'
  }
];

module.exports = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};
```

---

## 8. Monitoring & Observability

### 8.1 Application Performance Monitoring

#### **Sentry Configuration**
```javascript
// sentry.client.config.ts
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  environment: process.env.NODE_ENV,
  
  tracesSampleRate: 1.0,
  
  integrations: [
    new Sentry.BrowserTracing({
      beforeNavigate: context => ({
        ...context,
        name: window.location.pathname,
      }),
    }),
  ],
  
  beforeSend(event, hint) {
    // Filter out development errors
    if (event.environment === 'development') {
      return null;
    }
    return event;
  },
});
```

#### **Orchestrator Service Monitoring**
```javascript
// orchestrator/src/monitoring.js
const prometheus = require('prom-client');

// Custom metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status'],
});

const flyMachineOperations = new prometheus.Counter({
  name: 'fly_machine_operations_total',
  help: 'Total number of Fly machine operations',
  labelNames: ['operation', 'status'],
});

const activePreviewSessions = new prometheus.Gauge({
  name: 'active_preview_sessions',
  help: 'Number of active preview sessions',
});

// Middleware
const metricsMiddleware = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode)
      .observe(duration);
  });
  
  next();
};

module.exports = {
  httpRequestDuration,
  flyMachineOperations,
  activePreviewSessions,
  metricsMiddleware,
};
```

### 8.2 Logging Strategy

#### **Structured Logging Configuration**
```javascript
// orchestrator/src/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { 
    service: 'orchestrator',
    environment: process.env.NODE_ENV,
    region: process.env.FLY_REGION,
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
  ],
});

// Production log aggregation
if (process.env.NODE_ENV === 'production') {
  logger.add(new winston.transports.Http({
    host: 'logs.velocity-platform.com',
    port: 443,
    path: '/api/logs',
    ssl: true,
  }));
}

module.exports = logger;
```

### 8.3 Health Check Endpoints

#### **Frontend Health Check**
```javascript
// app/api/health/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    checks: {
      database: 'unknown',
      orchestrator: 'unknown',
    },
  };

  try {
    // Check Supabase connection
    const supabase = createClient();
    await supabase.from('health_check').select('count').limit(1);
    health.checks.database = 'healthy';
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Check Orchestrator service
    const response = await fetch(`${process.env.ORCHESTRATOR_URL}/health`, {
      timeout: 5000,
    });
    health.checks.orchestrator = response.ok ? 'healthy' : 'unhealthy';
  } catch (error) {
    health.checks.orchestrator = 'unhealthy';
    health.status = 'degraded';
  }

  const status = health.status === 'healthy' ? 200 : 503;
  return NextResponse.json(health, { status });
}
```

#### **Orchestrator Health Check**
```javascript
// orchestrator/src/routes/health.js
const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const router = express.Router();

router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    checks: {
      database: 'unknown',
      fly_api: 'unknown',
      container_registry: 'unknown',
    },
  };

  try {
    // Check Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    await supabase.from('preview_sessions').select('count').limit(1);
    health.checks.database = 'healthy';
  } catch (error) {
    health.checks.database = 'unhealthy';
    health.status = 'degraded';
  }

  try {
    // Check Fly API
    const response = await fetch('https://api.machines.dev/v1/apps', {
      headers: { Authorization: `Bearer ${process.env.FLY_API_TOKEN}` },
      timeout: 5000,
    });
    health.checks.fly_api = response.ok ? 'healthy' : 'unhealthy';
  } catch (error) {
    health.checks.fly_api = 'unhealthy';
    health.status = 'degraded';
  }

  const status = health.status === 'healthy' ? 200 : 503;
  res.status(status).json(health);
});

module.exports = router;
```

### 8.4 Alerting Configuration

#### **Prometheus Alert Rules**
```yaml
# alerts.yml
groups:
  - name: velocity-platform
    rules:
    - alert: HighErrorRate
      expr: rate(http_requests_total{status=~"5.."}[5m]) > 0.1
      for: 5m
      labels:
        severity: critical
      annotations:
        summary: High error rate detected
        description: "Error rate is {{ $value }} errors per second"
    
    - alert: HighResponseTime
      expr: histogram_quantile(0.95, http_request_duration_seconds_bucket) > 2
      for: 5m
      labels:
        severity: warning
      annotations:
        summary: High response time detected
        description: "95th percentile response time is {{ $value }}s"
    
    - alert: PreviewContainerPoolExhausted
      expr: active_preview_sessions >= 20
      for: 2m
      labels:
        severity: critical
      annotations:
        summary: Preview container pool exhausted
        description: "All preview containers are in use: {{ $value }}"
```

---

## 9. Performance Optimization

### 9.1 Frontend Performance

#### **Bundle Optimization**
```javascript
// next.config.js
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

module.exports = withBundleAnalyzer({
  // Code splitting
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['@monaco-editor/react', 'lucide-react'],
  },
  
  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    domains: ['images.unsplash.com', 'assets.velocity-platform.com'],
  },
  
  // Compression
  compress: true,
  poweredByHeader: false,
  
  // Static optimization
  trailingSlash: false,
  generateEtags: false,
  
  webpack: (config, { buildId, dev, isServer, defaultLoaders }) => {
    // Monaco Editor optimization
    config.module.rules.push({
      test: /\.worker\.js$/,
      use: { loader: 'worker-loader' },
    });
    
    return config;
  },
});
```

#### **Performance Monitoring**
```javascript
// lib/performance.ts
export function reportWebVitals(metric: any) {
  if (process.env.NODE_ENV === 'production') {
    // Send to analytics
    gtag('event', metric.name, {
      event_category: 'Web Vitals',
      value: Math.round(metric.value),
      event_label: metric.id,
    });
    
    // Send to Sentry
    Sentry.addBreadcrumb({
      category: 'performance',
      message: `${metric.name}: ${metric.value}`,
      level: 'info',
    });
  }
}
```

### 9.2 Backend Performance

#### **Database Optimization**
```sql
-- Critical indexes for performance
CREATE INDEX CONCURRENTLY idx_projects_user_created 
ON projects(user_id, created_at DESC);

CREATE INDEX CONCURRENTLY idx_preview_sessions_status_created 
ON preview_sessions(status, created_at DESC) 
WHERE status IN ('active', 'creating');

CREATE INDEX CONCURRENTLY idx_files_project_path 
ON files(project_id, file_path) 
WHERE deleted_at IS NULL;

-- Connection pooling configuration
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '128MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.7;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
```

#### **Caching Strategy**
```javascript
// orchestrator/src/cache.js
const Redis = require('ioredis');

const redis = new Redis(process.env.REDIS_URL);

const cache = {
  async get(key, fallback) {
    try {
      const cached = await redis.get(key);
      if (cached) {
        return JSON.parse(cached);
      }
      
      const result = await fallback();
      await redis.setex(key, 300, JSON.stringify(result)); // 5 min TTL
      return result;
    } catch (error) {
      console.error('Cache error:', error);
      return fallback();
    }
  },
  
  async invalidate(pattern) {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};

module.exports = cache;
```

### 9.3 CDN & Edge Optimization

#### **Vercel Edge Functions**
```javascript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';
import { geolocation } from '@vercel/edge';

export function middleware(request: NextRequest) {
  const { country, region, city } = geolocation(request);
  
  // Geo-based routing
  if (country === 'CN') {
    return NextResponse.redirect(new URL('/cn', request.url));
  }
  
  // Add geo headers for analytics
  const response = NextResponse.next();
  response.headers.set('x-user-country', country || 'unknown');
  response.headers.set('x-user-region', region || 'unknown');
  
  return response;
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

#### **Static Asset Optimization**
```javascript
// Asset optimization pipeline
const imageOptimization = {
  formats: ['image/avif', 'image/webp'],
  sizes: [640, 750, 828, 1080, 1200, 1920],
  quality: 85,
  domains: ['assets.velocity-platform.com'],
};

const fontOptimization = {
  preload: [
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  ],
  display: 'swap',
};
```

---

## 10. Rollback & Disaster Recovery

### 10.1 Rollback Procedures

#### **Frontend Rollback (Vercel)**
```bash
# Automatic rollback via Vercel dashboard or CLI
vercel rollback <deployment-url>

# Or redeploy previous version
vercel --prod --confirm

# Emergency rollback script
#!/bin/bash
PREVIOUS_DEPLOYMENT=$(vercel ls --meta gitCommitSha=$PREVIOUS_SHA --json | jq -r '.[0].url')
vercel promote $PREVIOUS_DEPLOYMENT --scope=velocity
```

#### **Orchestrator Rollback (Fly.io)**
```bash
# List recent deployments
fly releases

# Rollback to specific release
fly releases rollback v47

# Emergency rollback script
#!/bin/bash
PREVIOUS_IMAGE="ghcr.io/velocity/orchestrator:$PREVIOUS_SHA"
fly deploy --image $PREVIOUS_IMAGE
```

#### **Database Migration Rollback**
```bash
# Supabase migration rollback
npx supabase db reset --linked

# Or specific migration rollback
npx supabase migration down --db-url $DATABASE_URL
```

### 10.2 Disaster Recovery Plan

#### **Recovery Time Objectives (RTO)**
- **Frontend:** 5 minutes (CDN failover)
- **Orchestrator:** 10 minutes (Multi-region deployment)
- **Database:** 15 minutes (Point-in-time recovery)
- **Preview Containers:** 2 minutes (Auto-recreation)

#### **Recovery Point Objectives (RPO)**
- **User Data:** 1 hour (Hourly backups)
- **Project Files:** 15 minutes (Continuous replication)
- **System Configuration:** 1 day (Daily configuration backups)

#### **Backup Strategy**
```bash
# Database backups
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="velocity_backup_$DATE.sql"

# Full database backup
pg_dump $DATABASE_URL > $BACKUP_FILE

# Upload to secure storage
aws s3 cp $BACKUP_FILE s3://velocity-backups/database/
```

#### **Failover Procedures**
```yaml
# DNS failover configuration
failover_rules:
  primary: "app.velocity-platform.com"
  secondary: "app-backup.velocity-platform.com"
  health_check: "/api/health"
  check_interval: 30s
  failover_delay: 60s
```

### 10.3 Communication Plan

#### **Incident Response Team**
- **Incident Commander:** Tech Lead
- **Engineering:** DevOps Engineer, Backend Developer
- **Communication:** Product Manager
- **Customer Success:** Support Team Lead

#### **Communication Channels**
- **Internal:** Slack #incidents channel
- **External:** Status page (status.velocity-platform.com)
- **User Notifications:** In-app banners, email alerts

#### **Status Page Template**
```markdown
# System Status Update

**Incident ID:** INC-2025-001
**Start Time:** 2025-08-31 14:30 UTC
**Status:** Investigating

## Current Status
We are currently investigating reports of slow performance in the preview generation system.

## Impact
- Preview generation may be slower than usual
- All other systems are operating normally

## Next Update
We will provide another update within 30 minutes.

---
*Follow @VelocityStatus for real-time updates*
```

---

## 11. Pre-Deployment Checklist

### 11.1 Code Quality Gates

#### **Automated Checks**
- [ ] All tests passing (unit, integration, e2e)
- [ ] Code coverage above 80%
- [ ] No high/critical security vulnerabilities
- [ ] No linting errors or type violations
- [ ] Bundle size within acceptable limits
- [ ] Performance benchmarks met

#### **Code Review Requirements**
- [ ] 2+ approved reviews from team leads
- [ ] Security review for sensitive changes
- [ ] Architecture review for major changes
- [ ] Documentation updated
- [ ] Migration scripts reviewed

#### **Testing Verification**
- [ ] Feature tested in staging environment
- [ ] Cross-browser compatibility verified
- [ ] Mobile responsiveness confirmed
- [ ] Accessibility standards met (WCAG 2.1 AA)
- [ ] Load testing completed for performance changes

### 11.2 Infrastructure Readiness

#### **Environment Configuration**
- [ ] Environment variables configured
- [ ] Secrets properly stored and rotated
- [ ] Database migrations tested
- [ ] Third-party service integrations verified
- [ ] CDN and DNS configurations updated

#### **Capacity Planning**
- [ ] Resource limits configured
- [ ] Auto-scaling policies in place
- [ ] Database connection pools sized
- [ ] Storage quotas configured
- [ ] Rate limiting rules applied

#### **Security Configuration**
- [ ] Security headers configured
- [ ] HTTPS certificates valid
- [ ] API authentication working
- [ ] Network policies applied
- [ ] Backup procedures tested

### 11.3 Deployment Coordination

#### **Team Communication**
- [ ] Deployment scheduled and communicated
- [ ] All stakeholders notified
- [ ] Rollback procedures reviewed
- [ ] On-call schedule confirmed
- [ ] Post-deployment tasks assigned

#### **Change Management**
- [ ] Change request approved
- [ ] Risk assessment completed
- [ ] Rollback plan documented
- [ ] Success criteria defined
- [ ] Monitoring alerts configured

---

## 12. Post-Deployment Verification

### 12.1 Smoke Tests

#### **Automated Smoke Test Suite**
```javascript
// tests/smoke/production-smoke.test.js
describe('Production Smoke Tests', () => {
  const baseUrl = 'https://app.velocity-platform.com';
  
  test('Homepage loads successfully', async () => {
    const response = await fetch(baseUrl);
    expect(response.status).toBe(200);
  });
  
  test('Authentication flow works', async () => {
    // Test login functionality
    const authResponse = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: process.env.TEST_USER_EMAIL,
        password: process.env.TEST_USER_PASSWORD,
      }),
    });
    expect(authResponse.status).toBe(200);
  });
  
  test('Project creation works', async () => {
    // Test project creation API
    const createResponse = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`,
      },
      body: JSON.stringify({
        name: 'Smoke Test Project',
        description: 'Test project for deployment verification',
      }),
    });
    expect(createResponse.status).toBe(201);
  });
  
  test('Preview generation works', async () => {
    // Test preview orchestration
    const previewResponse = await fetch(`${baseUrl}/api/preview/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${testToken}`,
      },
      body: JSON.stringify({
        projectId: testProjectId,
      }),
    });
    expect(previewResponse.status).toBe(200);
  });
});
```

### 12.2 Performance Verification

#### **Performance Metrics Validation**
```bash
#!/bin/bash
# Performance validation script

BASE_URL="https://app.velocity-platform.com"
ORCHESTRATOR_URL="https://velocity-orchestrator.fly.dev"

echo "🔍 Running post-deployment performance checks..."

# Frontend performance
echo "📊 Frontend Performance:"
curl -w "@curl-format.txt" -s -o /dev/null $BASE_URL
npx lighthouse $BASE_URL --only-categories=performance --output=json | jq '.categories.performance.score'

# API response times
echo "🌐 API Performance:"
curl -w "Response Time: %{time_total}s\n" -s -o /dev/null $BASE_URL/api/health
curl -w "Response Time: %{time_total}s\n" -s -o /dev/null $ORCHESTRATOR_URL/health

# Database performance
echo "🗄️ Database Performance:"
psql $DATABASE_URL -c "SELECT pg_stat_get_db_numbackends(oid) as connections FROM pg_database WHERE datname = current_database();"
```

### 12.3 Security Verification

#### **Security Headers Check**
```bash
#!/bin/bash
# Security validation script

URL="https://app.velocity-platform.com"

echo "🔒 Security Headers Check:"
curl -I $URL | grep -E "(Content-Security-Policy|X-Frame-Options|X-Content-Type-Options)"

echo "🛡️ SSL Configuration:"
echo | openssl s_client -connect velocity-platform.com:443 2>/dev/null | openssl x509 -noout -dates

echo "🔍 Vulnerability Scan:"
nmap -sV --script vuln $URL
```

### 12.4 Monitoring Dashboard Verification

#### **Key Metrics to Monitor (First 24 Hours)**
```yaml
critical_metrics:
  - name: "Error Rate"
    threshold: "< 1%"
    measurement: "5xx responses / total responses"
  
  - name: "Response Time" 
    threshold: "< 2s (95th percentile)"
    measurement: "API endpoint response times"
  
  - name: "Availability"
    threshold: "> 99.5%"
    measurement: "Successful health check responses"
  
  - name: "Preview Success Rate"
    threshold: "> 95%"
    measurement: "Successful container creations"

business_metrics:
  - name: "User Sessions"
    baseline: "Previous week average"
    measurement: "Active user sessions"
  
  - name: "Project Creations"
    baseline: "Previous week average" 
    measurement: "New projects per hour"
  
  - name: "Preview Generations"
    baseline: "Previous week average"
    measurement: "Preview sessions started"
```

---

## 13. Maintenance & Operations

### 13.1 Routine Maintenance Tasks

#### **Daily Operations**
```bash
#!/bin/bash
# Daily maintenance script

echo "📊 Daily Health Check - $(date)"

# Check system health
curl -sf https://app.velocity-platform.com/api/health || echo "❌ Frontend unhealthy"
curl -sf https://velocity-orchestrator.fly.dev/health || echo "❌ Orchestrator unhealthy"

# Check resource usage
fly status velocity-orchestrator
vercel inspect velocity-platform

# Check database performance
psql $DATABASE_URL -c "
SELECT 
  schemaname,
  tablename,
  n_tup_ins + n_tup_upd + n_tup_del as writes,
  seq_scan,
  idx_scan
FROM pg_stat_user_tables 
ORDER BY writes DESC 
LIMIT 10;
"

# Clean up orphaned preview containers
node scripts/cleanup-orphaned-containers.js

echo "✅ Daily maintenance completed"
```

#### **Weekly Operations**
```bash
#!/bin/bash
# Weekly maintenance script

echo "📈 Weekly Performance Review - $(date)"

# Analyze performance trends
npm run analyze:performance -- --weeks=1

# Review security logs
npm run security:audit -- --since="1 week ago"

# Update dependencies (staging first)
npm update
npm audit fix
git commit -am "chore: update dependencies"

# Database maintenance
psql $DATABASE_URL -c "VACUUM ANALYZE;"
psql $DATABASE_URL -c "REINDEX DATABASE velocity;"

echo "✅ Weekly maintenance completed"
```

#### **Monthly Operations**
- Security dependency updates
- Certificate renewal verification
- Performance baseline reviews
- Capacity planning assessment
- Disaster recovery testing
- Team access audit

### 13.2 Scaling Procedures

#### **Auto-Scaling Configuration**
```toml
# fly.toml - Orchestrator scaling
[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512

[metrics]
  port = 9090
  path = "/metrics"

[scaling]
  min_machines_running = 2
  max_machines_running = 10

[[scaling.rules]]
  metric = "cpu_usage"
  comparison = ">"
  value = 70
  duration = "5m"
  action = "scale_up"

[[scaling.rules]]
  metric = "cpu_usage"
  comparison = "<"
  value = 30
  duration = "10m"
  action = "scale_down"
```

#### **Database Scaling**
```sql
-- Connection pooling optimization
ALTER SYSTEM SET max_connections = 400;
ALTER SYSTEM SET shared_buffers = '512MB';

-- Read replica configuration
CREATE PUBLICATION velocity_replica FOR ALL TABLES;

-- Partitioning for large tables
CREATE TABLE preview_sessions_2025_q1 PARTITION OF preview_sessions
FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');
```

### 13.3 Cost Optimization

#### **Monthly Cost Review**
```bash
#!/bin/bash
# Cost analysis script

echo "💰 Monthly Cost Analysis - $(date)"

# Vercel usage
vercel teams list --usage

# Fly.io usage  
fly billing show

# Supabase usage
npx supabase usage --project-ref $SUPABASE_PROJECT_REF

# Storage analysis
du -sh .next/static/
aws s3 ls s3://velocity-assets --recursive --human-readable --summarize

echo "📊 Cost optimization recommendations:"
echo "- Review unused containers older than 7 days"
echo "- Analyze CDN cache hit rates"
echo "- Consider storage lifecycle policies"
```

#### **Resource Optimization**
- Monitor unused preview containers
- Implement container pooling
- Optimize image sizes and caching
- Review database query performance
- Implement intelligent asset preloading

---

## Conclusion

This comprehensive deployment plan provides a robust foundation for deploying the Velocity platform with enterprise-grade reliability, security, and performance. The plan emphasizes:

- **Zero-downtime deployments** with automated rollback capabilities
- **Comprehensive monitoring** and alerting for proactive issue resolution
- **Security-first approach** with automated scanning and compliance checks
- **Performance optimization** across all layers of the stack
- **Operational excellence** with clear procedures and automation

### Next Steps

1. **Review and approve** this deployment plan with the engineering team
2. **Set up the required accounts** and access credentials
3. **Configure the CI/CD pipeline** according to the specifications
4. **Execute a staging deployment** to validate the procedures
5. **Conduct a production deployment** following the checklist
6. **Monitor and optimize** based on real-world performance data

The deployment process is designed to be **repeatable, reliable, and reversible**, ensuring that the Velocity platform can be delivered to users with confidence and maintained with operational excellence.