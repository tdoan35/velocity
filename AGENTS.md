# Repository Guidelines

## Project Structure & Module Organization
- `frontend/`: Vite + React + TypeScript app (UI, Tailwind). Build output in `frontend/dist/`.
- `orchestrator/`: Node/Express TypeScript service (real‑time preview orchestration). Compiles to `orchestrator/dist/`.
- `supabase/`: SQL migrations and Deno Edge Functions (`supabase/functions/*`).
- Supporting: `.docs/` (plans/guides), `.github/workflows/` (CI), `.env*` files for local config.

## Build, Test, and Development Commands
- Frontend: `cd frontend`
  - `npm install` then `npm run dev` (start Vite), `npm run build` (type‑check + build), `npm run preview` (serve build).
  - Lint/format: `npm run lint`, `npm run format` or `format:check`.
- Orchestrator: `cd orchestrator`
  - `npm install` then `npm run dev` (ts-node + nodemon), `npm run build` (tsc), `npm start` (run compiled).
  - Tests: `npm test`, `npm run test:watch`, `npm run test:coverage` (outputs `coverage/`).
- E2E: from repo root, Playwright uses `playwright.config.js`.
  - `npx playwright test` (optionally `npx playwright install` on first run).

## Coding Style & Naming Conventions
- Language: TypeScript in `frontend` and `orchestrator` (strict in orchestrator `tsconfig.json`).
- Formatting: Prettier; 2‑space indent; run `frontend/npm run format` before PRs.
- ESLint: `frontend` enforced (`npm run lint`). Fix warnings before commit.
- Naming: React components PascalCase (e.g., `ButtonGroup.tsx`), hooks `use*.ts`, utils camelCase, tests `*.spec.ts|*.test.ts`.

## Testing Guidelines
- Orchestrator: Jest with `ts-jest`; tests live in `src/__tests__/**` or alongside as `*.spec.ts|*.test.ts`. Coverage collected from `src/**/*.ts` excluding tests/types.
- Frontend: No unit tests configured yet; use Playwright for flows. Add tests near features when introducing logic.
- Aim for deterministic tests; avoid network where possible (mock Supabase/HTTP).

## Commit & Pull Request Guidelines
- Commits: Conventional style observed (`feat:`, `fix:`, `build:`, `revert:`, `debug:`). Write imperative, scoped messages.
- PRs: Include purpose, linked issues, test plan (commands + results), screenshots for UI changes, and notes on env/config if needed.

## Security & Configuration Tips
- Never commit secrets. Use `.env.local` (root) and `orchestrator/.env`. See `supabase/functions/.env.example` for function envs.
- If using Supabase CLI, manage local services via `supabase start` and deploy functions per guides in `supabase/.guides/`.
