# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Velocity** is an AI-powered app development platform that transforms natural language descriptions into production-ready React / React Native applications. This project is currently in the planning/setup phase.

**Technology Stack**:

- **Frontend**: React, React Native, Expo, Monaco Editor, Tailwind CSS, Vite
- **Backend**: Supabase (PostgreSQL + pgvector), Edge Functions
- **AI**: Claude AI (Anthropic), vector similarity search
- **Mobile**: Fly.io containers for previews, EAS Build for compilation
- **Deployment**: App Store Connect, Google Play Console
- **Version Control**: GitHub synchronization

## Project Status

This project is in the **initial implementation phase**.

## Development Commands

### Supabase Edge Functions

- **List edge functions**: Use `npx supabase functions list` instead of the MCP tool `mcp__supabase__list_edge_functions` as it exceeds token limits
- **Deploy edge functions**: Use `npx supabase functions deploy <function-name>` instead of the MCP tool `mcp__supabase__deploy_edge_function` as it fails with internal errors


## Key Configuration Files

- **`.env.example`**: API key template for AI providers (Anthropic, OpenAI, etc.)

## Important Notes

- **No source code exists yet** - this is a planning/task definition phase
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
