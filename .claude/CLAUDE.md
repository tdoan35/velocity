# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Velocity** is an AI-powered app development platform that transforms natural language descriptions into production-ready React / React Native applications. This is a Taskmaster-managed project currently in the planning/setup phase.

**Technology Stack**:

- **Frontend**: React, React Native, Expo, Monaco Editor, Tailwind CSS, Vite
- **Backend**: Supabase (PostgreSQL + pgvector), Edge Functions
- **AI**: Claude AI (Anthropic), vector similarity search
- **Mobile**: Fly.io containers for previews, EAS Build for compilation
- **Deployment**: App Store Connect, Google Play Console
- **Version Control**: GitHub synchronization

## Project Status

This project is in the **initial implementation phase**. Development follows a structured task-driven approach managed by Taskmaster. There are 12 major high-complexity tasks (scores 6-9) identified for implementation.

## Development Commands

### Supabase Edge Functions

- **List edge functions**: Use `npx supabase functions list` instead of the MCP tool `mcp__supabase__list_edge_functions` as it exceeds token limits
- **Deploy edge functions**: Use `npx supabase functions deploy <function-name>` instead of the MCP tool `mcp__supabase__deploy_edge_function` as it fails with internal errors

### Taskmaster Management

- **List tasks**: `task-master list`
- **Show next task**: `task-master next`
- **View task details**: `task-master show <id>`
- **Break down complex tasks**: `task-master expand --id=<id> --research --force`
- **Update task status**: `task-master set-status --id=<id> --status=done`
- **Add new tasks**: `task-master add-task --prompt="<description>" --research`
- **Update tasks with changes**: `task-master update --from=<id> --prompt="<changes>" --research`

### Configuration

- **View/set AI models**: `task-master models`
- **Interactive setup**: `task-master models --setup`
- **Analyze task complexity**: `task-master analyze-complexity --research`
- **View complexity report**: `task-master complexity-report`

## Key Configuration Files

- **`.taskmaster/config.json`**: AI model configuration (Claude Code, Perplexity, fallback models)
- **`.env.example`**: API key template for AI providers (Anthropic, OpenAI, etc.)
- **`.taskmaster/tasks/tasks.json`**: Main tasks file (28,093 tokens - very detailed)
- **`.taskmaster/reports/task-complexity-report.json`**: Task complexity analysis
- **`.taskmaster/templates/velocity_prd.md`**: Product Requirements Document

## Development Workflow

1. **Start coding sessions**: Run `task-master list` to see current tasks
2. **Identify next work**: Use `task-master next` for dependency-ready tasks
3. **Get task details**: Use `task-master show <id>` for implementation requirements
4. **Break down complex tasks**: Use `task-master expand --id=<id> --research --force`
5. **Log progress**: Use `task-master update-subtask --id=<id> --prompt="<findings>"`
6. **Mark completed**: Use `task-master set-status --id=<id> --status=done`

## Important Notes

- **No source code exists yet** - this is a planning/task definition phase
- **Use the `--research` flag** extensively for AI-powered research and task generation
- **All tasks are high complexity** (6-9 scores) - expect detailed breakdown requirements
- **API keys required**: Set up `.env` file with Anthropic and other provider keys
- **Tagged task lists**: Default "master" tag context, create feature branches as needed

## TypeScript Configuration

- **Type-only imports required**: This project has `verbatimModuleSyntax` enabled in tsconfig.json
  - Always use `import type` for TypeScript types, interfaces, and type-only imports
  - Example: `import type { ConnectionTestResult } from './types'`
  - Regular imports for values: `import { myFunction } from './module'`
  - Combined imports: `import React, { type FC, type ReactNode } from 'react'`

## Architecture Insights

Based on the PRD analysis:

- **Cloud-first architecture** with Supabase backend
- **Real-time collaboration** via Supabase Realtime
- **AI-driven code generation** with Claude integration
- **Browser-based IDE** using Monaco Editor
- **Mobile preview** via Fly.io container integration
- **CI/CD pipeline** through EAS Build and app store deployment

When implementing, focus on the AI-powered code generation workflow as the core differentiator, with seamless mobile preview and deployment as key user experience elements.
