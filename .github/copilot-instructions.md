# Copilot Instructions for REI Team Admin

## Project Overview
This is an internal admin web application for a Real Estate Investment (REI) team. It is built with **Next.js 15 (App Router)**, **TypeScript**, **Supabase** (Postgres + Auth), and **Tailwind CSS**.

The app lives in the `rei-team-admin/` subdirectory. All source code, config, and migrations are inside that folder.

## Tech Stack
- **Framework**: Next.js 15 with App Router (`rei-team-admin/app/`)
- **Language**: TypeScript (strict mode)
- **Database & Auth**: Supabase (`@supabase/supabase-js`, `@supabase/ssr`)
- **Styling**: Tailwind CSS with a custom dark-mode color palette
- **AI integrations**: OpenAI (`openai`) and Anthropic (`@anthropic-ai/sdk`)
- **Drag-and-drop**: `@dnd-kit/core`, `@dnd-kit/sortable`
- **Linting**: ESLint with `next/core-web-vitals` + `next/typescript`

## Repository Structure
```
rei-team-admin/
  app/              # Next.js App Router pages & API routes
  src/
    components/     # Shared React components
    config/         # App-wide config constants
    context/        # React context providers
    lib/
      supabase/     # Supabase client helpers (browser, server, admin)
      types/        # Shared TypeScript types
      format.ts     # Formatting utilities
  supabase/
    migrations/     # SQL migration files
    functions/      # Supabase Edge Functions
  middleware.ts     # Auth middleware (redirects unauthenticated users)
```

## Key Conventions

### Supabase Clients
- Use `browser.ts` for client-side Supabase access.
- Use `server.ts` for server components and API routes.
- Use `admin.ts` only when service-role access is required (never expose to the client).

### Authentication
- Authentication is handled via Supabase Auth.
- `middleware.ts` protects all routes except `/`, `/login`, and `/reset-password`.
- Public routes are listed in the `PUBLIC_PATHS` array in `middleware.ts`.

### Styling
Custom Tailwind colors are defined in `tailwind.config.ts`:
- `bg-base` – darkest background (`#0f172a`)
- `bg-surface` – card/panel background (`#1e293b`)
- `bg-elevated` – elevated elements (`#334155`)
- `accent` – green accent (`#10b981` / `#059669` / `#34d399`)

Always use these semantic color tokens instead of raw Tailwind colors.

### TypeScript
- All new code must be TypeScript with no `any` types where avoidable.
- Type errors must be resolved before committing.

## Build, Lint & Dev Commands
All commands must be run from inside `rei-team-admin/`:

```bash
cd rei-team-admin

# Install dependencies
npm install

# Local development
npm run dev          # http://localhost:3000

# Lint
npm run lint

# Production build
npm run build
```

## Environment Variables
Copy `.env.example` to `.env.local` and fill in:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (server-only, never exposed to client)

## Database Migrations
SQL migrations live in `rei-team-admin/supabase/migrations/`. Run them in Supabase → SQL Editor in numerical order. Do not modify existing migrations; add new numbered files instead.

## Testing
There is currently no automated test suite. Validate changes manually by running `npm run dev` and exercising the affected pages in the browser.

## What Not to Do
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` or any secret in client-side code.
- Do not use raw hex colors in components — use the Tailwind color tokens.
- Do not add `any` types without a comment explaining why.
- Do not modify existing SQL migration files; always create new ones.
