# Velocity Project Architecture

## 1. Project Overview

**Velocity** is an AI-native app development platform designed to transform natural language descriptions into production-ready React Native applications. It provides a seamless, browser-based environment that encompasses AI-powered code generation, a rich code editor, real-time mobile previews, and a complete deployment pipeline.

The platform's primary goal is to drastically reduce the time and technical expertise required to build and deploy a mobile app, targeting non-technical entrepreneurs, product managers, and developers looking to accelerate their workflow.

## 2. System Design & Components

Velocity is built on a distributed, cloud-first architecture composed of three main, decoupled services: a web-based frontend, a backend powered by Supabase, and a container orchestration service for managing real-time previews.

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

CONNECTIONS:
─────────────
• User → Frontend (Browser interaction)
• Frontend → Supabase Services (Auth, Realtime, DB, Edge Functions)
• Frontend → Orchestrator (Preview management)
• Frontend → EAS Build (App deployment)
• Edge Functions → Claude AI (Code generation)
• Edge Functions → GitHub API (Repository sync)
• Orchestrator → Preview Environment (Container management)
```

### 2.1. Frontend (`/frontend`)

The frontend is a sophisticated single-page application (SPA) that serves as the user's primary interface. It provides a complete in-browser IDE experience.

- **Framework**: React 19 (with TypeScript)
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with `shadcn/ui` for the component library.
- **State Management**: Zustand
- **Core Components**:
  - **Monaco Editor**: Integrated to provide a VS Code-like editing experience with syntax highlighting, IntelliSense, and real-time error checking for React Native.
  - **AI Interface**: A conversational UI for interacting with the AI code generation service.
  - **Real-time Preview**: An embedded view that displays the live, running mobile application.
  - **File Explorer & Project Management**: UI for navigating the project structure, managing files, and configuring project settings.

### 2.2. Backend (`/supabase`)

The backend is built entirely on the **Supabase** platform, leveraging its integrated services for data, authentication, serverless functions, and real-time communication.

- **Database**: PostgreSQL 17. The `config.toml` specifies this version. It uses the `pgvector` extension to enable semantic similarity searches for AI prompt caching.
- **Authentication**: Supabase Auth, configured to support OAuth with providers like Google and GitHub, as well as email-based signup.
- **Storage**: Supabase Storage is used for managing project assets and build artifacts from the deployment pipeline.
- **Serverless Functions (`/supabase/functions`)**: Deno-based Edge Functions handle the core business logic, most critically the AI integration.
  - `/generate-code`: Receives user prompts, queries the `pgvector` cache to avoid redundant calls, assembles context, and calls the external Anthropic Claude API.
  - `/github-sync`: Manages the two-way synchronization with GitHub repositories.
- **Real-time**: Supabase Realtime is used to enable live collaborative editing features, pushing changes between connected clients.

### 2.3. Orchestrator (`/orchestrator`)

The Orchestrator is a dedicated Node.js service responsible for managing the lifecycle of real-time mobile previews. It is designed and currently deployed on Fly.io.

- **Framework**: Express.js
- **Functionality**:
  - It receives requests from the frontend to start a new preview session.
  - It interacts with external services like **Appetize.io** (as mentioned in the PRD) or manages its own **Fly.io** containers to create a live environment for the React Native app.
  - It establishes a WebSocket (`ws`) connection with the frontend to stream logs and facilitate hot-reloading when code changes are detected.

## 3. Technology Stack

| Category         | Technology                               | Location/File                  |
| ---------------- | ---------------------------------------- | ------------------------------ |
| **Frontend**     | React, Vite, TypeScript, Tailwind CSS    | `frontend/package.json`        |
|                  | Monaco Editor, Zustand, Radix UI         | `frontend/package.json`        |
| **Backend**      | Supabase (PostgreSQL, Auth, Storage)     | `supabase/config.toml`         |
|                  | Deno (for Edge Functions)                | `supabase/config.toml`         |
| **Database**     | PostgreSQL 17 with `pgvector`            | `supabase/config.toml`         |
| **AI**           | Anthropic Claude 3.5 Sonnet              | `velocity_prd.md`              |
|                  | `@ai-sdk/anthropic`                      | `frontend/package.json`        |
| **Orchestrator** | Node.js, Express.js, WebSockets (`ws`)   | `orchestrator/package.json`    |
| **Deployment**   | Fly.io (Orchestrator), EAS Build, Vercel | `velocity_prd.md`, `.github/`  |
| **Tooling**      | Taskmaster CLI, Playwright, Prettier     | `.taskmaster/`, `package.json` |

## 4. Directory Structure

The repository is organized into a monorepo-like structure with clear separation of concerns.

- **`/.docs/`**: Contains all project documentation, including architectural analyses, implementation plans, and this document.
- **`/.github/`**: CI/CD workflows for deploying the frontend and building preview containers.
- **`/.taskmaster/`**: Configuration and task files for the `task-master` CLI tool, which manages the development workflow.
- **`/frontend/`**: The complete source code for the user-facing web application.
- **`/orchestrator/`**: The Node.js service for managing real-time previews. Contains its own `Dockerfile` for containerization.
- **`/supabase/`**: Configuration, database migrations, and serverless Edge Functions for the Supabase backend.

## 5. Development & Deployment Workflow

1.  **Development**: Developers use the `task-master` CLI to manage tasks. The frontend is run locally using Vite's dev server, connecting to the development Supabase instance.
2.  **AI Code Generation**: A user prompt is sent to a Supabase Edge Function. The function queries the database to see if a similar prompt has been processed before. If not, it calls the Claude API, stores the result vector, and streams the code back to the user.
3.  **Real-time Preview**: As code is generated or edited, it's synced to a preview environment managed by the Orchestrator service, providing instant visual feedback.
4.  **CI/CD**:
    - Pushes to the main branch trigger a GitHub Actions workflow (`frontend-deploy.yml`) to build and deploy the frontend to Vercel.
    - The preview container has its own build workflow (`preview-container-build.yml`).
5.  **App Deployment**: The platform integrates with **Expo Application Services (EAS)** to automate the native app compilation and submission process to the Apple App Store and Google Play Store.
