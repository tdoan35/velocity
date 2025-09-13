# Velocity

An AI-powered app development platform that transforms natural language descriptions into production-ready React Native applications.

## Overview

Velocity provides a seamless, browser-based environment that encompasses AI-powered code generation, a rich code editor, real-time mobile previews, and a complete deployment pipeline. The platform drastically reduces the time and technical expertise required to build and deploy mobile apps, targeting non-technical entrepreneurs, product managers, and developers looking to accelerate their workflow.

## Architecture

Velocity is built on a distributed, cloud-first architecture with three main decoupled services:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            VELOCITY ARCHITECTURE                        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│  User's Browser │
│    ┌──────┐     │
│    │ User │ ────┼─────────────┐
│    └──────┘     │             │
└─────────────────┘             │
                                │
┌─────────────────┐             │
│     Vercel      │             │
│  ┌────────────┐ │             │
│  │ Frontend   │◄┼─────────────┘
│  │(React SPA) │ │
│  └─────┬──────┘ │
└────────┼────────┘
         │
    ┌────┼──────────────────────────┐
    │    │                         │
    │    ▼                         │
┌───┴─────────────────────────────────────────────────────────────────┐
│                    SUPABASE PLATFORM                               │
│                                                                     │
│  ┌─────────────────┐              ┌─────────────────────────────┐   │
│  │ Backend Logic   │              │      Data & State           │   │
│  │                 │              │                             │   │
│  │ ┌─────────────┐ │              │ ┌─────────────────────────┐ │   │
│  │ │Edge Functions│◄┼──────────────┼─┤PostgreSQL (with pgvector)││   │
│  │ │   (Deno)    │ │              │ └─────────────────────────┘ │   │
│  │ └──────┬──────┘ │              │                             │   │
│  └────────┼────────┘              │ ┌─────────────────────────┐ │   │
│           │                       │ │    Supabase Auth        │ │   │
│           │                       │ └─────────────────────────┘ │   │
│           │                       │                             │   │
│           │                       │ ┌─────────────────────────┐ │   │
│           │                       │ │Realtime (WebSockets)    │ │   │
│           │                       │ └─────────────────────────┘ │   │
│           │                       │                             │   │
│           │                       │ ┌─────────────────────────┐ │   │
│           │                       │ │   Supabase Storage      │ │   │
│           │                       │ └─────────────────────────┘ │   │
│           │                       └─────────────────────────────┘   │
└───────────┼─────────────────────────────────────────────────────────┘
            │
         ┌──┼─────────┐
         │  │         │
         │  ▼         │
┌────────┴─────────────┴────────┐
│          Fly.io               │
│    ┌──────────────────┐       │
│    │  Orchestrator    │       │
│    │   (Node.js)      │       │
│    └─────────┬────────┘       │
└──────────────┼────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                             │
│                                                                     │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐ │
│  │ Anthropic       │  │   GitHub API    │  │     EAS Build       │ │
│  │  Claude AI      │  │                 │  │                     │ │
│  └─────────▲───────┘  └─────────▲───────┘  └─────────────────────┘ │
│            │                    │                                  │
│  ┌─────────┴─────────────────────┴──────────────────────────────┐   │
│  │        Preview Environment (Appetize.io/Fly.io)             │   │
│  │                                                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Core Components

- **Frontend**: React SPA with Monaco Editor, deployed on Vercel
- **Backend**: Supabase platform with PostgreSQL, Auth, and Edge Functions
- **Orchestrator**: Node.js service on Fly.io for managing real-time previews
- **External Services**: Claude AI, GitHub API, EAS Build, Preview Environment

## Technology Stack

| Category         | Technology                               |
| ---------------- | ---------------------------------------- |
| **Frontend**     | React 19, Vite, TypeScript, Tailwind CSS |
|                  | Monaco Editor, Zustand, shadcn/ui        |
| **Backend**      | Supabase (PostgreSQL, Auth, Storage)     |
|                  | Deno (for Edge Functions)                |
| **Database**     | PostgreSQL 17 with pgvector              |
| **AI**           | Anthropic Claude 3.5 Sonnet              |
| **Orchestrator** | Node.js, Express.js, WebSockets          |
| **Deployment**   | Fly.io, EAS Build, Vercel                |

## Project Structure

```
velocity/
├── .docs/                  # Project documentation
├── .github/               # CI/CD workflows
├── .taskmaster/           # Task management configuration
├── frontend/              # React SPA source code
├── orchestrator/          # Node.js preview service
├── supabase/             # Backend configuration and functions
└── README.md             # This file
```

## Development Setup

### Prerequisites

- Node.js 18+
- Deno (for Supabase Edge Functions)
- Supabase CLI
- Taskmaster CLI

### Environment Configuration

1. Copy `.env.example` to `.env` and configure API keys:
   ```bash
   # Required API keys
   ANTHROPIC_API_KEY=your_anthropic_key
   OPENAI_API_KEY=your_openai_key  # Optional fallback
   SUPABASE_URL=your_supabase_url
   SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

2. Configure Taskmaster AI models:
   ```bash
   task-master models --setup
   ```

### Local Development

1. **Start Supabase locally**:
   ```bash
   npx supabase start
   ```

2. **Run the frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Deploy Edge Functions** (development):
   ```bash
   npx supabase functions deploy generate-code
   npx supabase functions deploy github-sync
   ```

4. **Start the orchestrator** (optional for preview features):
   ```bash
   cd orchestrator
   npm install
   npm run dev
   ```

## Task Management

This project uses [Taskmaster](https://github.com/taskmaster-ai/taskmaster) for AI-powered task management:

### Common Commands

```bash
# List current tasks
task-master list

# Show next available task
task-master next

# View task details
task-master show <id>

# Break down complex tasks
task-master expand --id=<id> --research --force

# Update task status
task-master set-status --id=<id> --status=done

# Add new tasks
task-master add-task --prompt="<description>" --research
```

### Development Workflow

1. Start with `task-master list` to see current tasks
2. Use `task-master next` to identify dependency-ready tasks
3. Get implementation details with `task-master show <id>`
4. Break down complex tasks with `task-master expand`
5. Log progress with `task-master update-subtask`
6. Mark completed with `task-master set-status`

## Key Features

- **AI-Powered Code Generation**: Transform natural language into React Native code using Claude AI
- **Browser-Based IDE**: Complete development environment with Monaco Editor
- **Real-Time Preview**: Live mobile app preview with hot reloading
- **GitHub Integration**: Two-way synchronization with GitHub repositories
- **Deployment Pipeline**: Automated builds and app store submission via EAS
- **Collaborative Editing**: Real-time collaboration through Supabase Realtime
- **Semantic Caching**: pgvector-powered prompt caching for faster responses

## Important Notes

- **TypeScript Configuration**: This project uses `verbatimModuleSyntax` - always use `import type` for types
- **Supabase Commands**: Use `npx supabase functions list` instead of MCP tools due to token limits
- **Research Flag**: Use `--research` flag extensively for AI-powered task generation
- **High Complexity**: All tasks are high complexity (6-9 scores) requiring detailed breakdown

## Contributing

This is a Taskmaster-managed project currently in the initial implementation phase. Development follows a structured, task-driven approach with AI assistance.

## Documentation

See `.docs/PROJECT_ARCHITECTURE.md` for detailed architectural information and implementation plans.

## License

[License information to be added]