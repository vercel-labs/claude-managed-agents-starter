<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Claude Managed Agents Showcase

A Next.js 16 web UI for Anthropic's Managed Agents API. Users sign in with Vercel, create agent sessions, send messages, and watch results stream in via a durable polling workflow. No client-side streaming - the server polls Anthropic, persists events to Postgres, and the UI fetches transcripts.

## Quick Reference

- **Package manager**: `pnpm` (do not use npm or yarn)
- **Framework**: Next.js 16 (App Router, Turbopack)
- **Database**: Neon PostgreSQL via Drizzle ORM
- **Auth**: Better Auth with Sign in with Vercel (generic OAuth / OIDC)
- **AI**: Anthropic SDK (`@anthropic-ai/sdk`) - beta managed sessions API
- **Workflows**: [Workflow SDK](https://useworkflow.dev/) for durable event tailing
- **UI**: shadcn/ui (base-ui primitives) + Tailwind CSS v4
- **Language**: TypeScript (strict mode)
- **Import alias**: `@/*` maps to project root

## Documentation Map

| Doc | What it covers |
|-----|---------------|
| [docs/SPEC.md](docs/SPEC.md) | Product spec: user flows, API contracts, tailing workflow, security model |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Project structure, routing, key directories, end-to-end flow |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Drizzle schema, migrations, database conventions |
| [docs/AUTH.md](docs/AUTH.md) | Better Auth setup, Vercel OAuth, session handling, protecting routes |
| [docs/UI_CONVENTIONS.md](docs/UI_CONVENTIONS.md) | Component patterns, shadcn/base-ui gotchas, layout rules |
| [docs/streaming-long-running-agents.md](docs/streaming-long-running-agents.md) | Architecture essay: streaming vs persistence patterns for long-running agents |

## Key Constraints

1. **pnpm only** - run `pnpm install`, `pnpm add`, `pnpm dev`, etc.
2. **App Router only** - no Pages Router. All routes live under `app/`. Use Server Components by default, add `"use client"` only when necessary.
3. **Anthropic SDK directly** - this project does NOT use Vercel AI SDK or AI Gateway. It calls `@anthropic-ai/sdk` beta sessions API directly. Do not introduce `ai`, `@ai-sdk/*`, or gateway model strings.
4. **No streaming** - the architecture is poll-based. The server-side Workflow polls Anthropic events and persists them to Postgres. The client fetches transcripts via REST. Do not add SSE, WebSocket, or `streamText` patterns.
5. **shadcn/ui for all UI primitives** - add components via `pnpm dlx shadcn@latest add <component>`. This project uses `@base-ui/react` under the hood (not legacy Radix). See [docs/UI_CONVENTIONS.md](docs/UI_CONVENTIONS.md) for gotchas.
6. **Import alias required** - use `@/components`, `@/lib`, etc. Never use relative paths that escape the current directory (no `../../`).
7. **Buttons must show `cursor-pointer`** - all clickable elements must display a pointer cursor on hover.
8. **Dark mode default** - the app uses `next-themes` with `defaultTheme="dark"`. Design for dark backgrounds first.

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for managed sessions |
| `ANTHROPIC_AGENT_ID` | Yes | Managed agent ID from Anthropic console |
| `ANTHROPIC_ENVIRONMENT_ID` | Yes | Environment ID for the managed agent |
| `BETTER_AUTH_SECRET` | Yes | Secret for encrypting sessions / OAuth tokens |
| `BETTER_AUTH_URL` | Yes | Public origin (e.g. `http://localhost:3000`) |
| `VERCEL_CLIENT_ID` | For OAuth | Vercel OAuth app client ID |
| `VERCEL_CLIENT_SECRET` | For OAuth | Vercel OAuth app client secret |

## Project Structure

```
app/
  layout.tsx              Root layout (Geist fonts, ThemeProvider, dark mode)
  error.tsx               Global error boundary
  not-found.tsx           404 page
  (dashboard)/
    layout.tsx            Server component: loads viewer + sessions, renders DashboardShell
    page.tsx              Home: centered NewChatComposer
    dashboard-shell.tsx   Client: sidebar toggle, mobile drawer
    dashboard-sidebar.tsx Client: session list, polling, delete, sign-in/out
    new-chat-composer.tsx Client: create session + send first message
    chat/
      [sessionId]/
        page.tsx          Renders ChatPanel for a session
  api/
    auth/[...all]/        Better Auth handler (sign-in, OAuth, session)
    managed-agents/
      session/            POST: create session, DELETE: remove session
      sessions/           GET: list user's sessions
      message/            POST: send message, start tailing workflow
      transcript/         GET: fetch session events
  workflows/
    tail-session.ts       Durable workflow: poll Anthropic, persist events
  auth/
    error/page.tsx        Custom auth error page

lib/
  schema.ts               Drizzle schema (Better Auth + managed agent tables)
  db.ts                   Neon client + Drizzle instance
  auth.ts                 Better Auth config (Vercel OIDC, Drizzle adapter)
  auth-client.ts          Client-side auth (genericOAuthClient)
  session.ts              requireUserId() guard for API routes
  anthropic.ts            Anthropic SDK client factory
  managed-agents.ts       Session creation + message sending helpers
  managed-agent-events.ts Event ID extraction, terminal detection, timestamp parsing
  utils.ts                cn() utility

components/
  chat/chat-panel.tsx     Transcript UI: polls /transcript, renders messages
  sign-in-modal.tsx       Dialog with "Continue with Vercel" button
  user-menu.tsx           User dropdown (name, email, sign out)
  theme-provider.tsx      next-themes wrapper
  icons.tsx               VercelIcon, AnthropicIcon
  ui/                     shadcn primitives (button, card, dialog, dropdown, etc.)
```

## End-to-End Flow

1. User signs in via Vercel OAuth (Better Auth + generic OAuth plugin)
2. User types a message in the home composer
3. `POST /api/managed-agents/session` creates an Anthropic session + DB row
4. `POST /api/managed-agents/message` sends the message to Anthropic
5. If not already tailing, the message handler starts `tailSessionWorkflow`
6. The workflow polls `client.beta.sessions.events.list()` every 10s
7. New events are inserted into `managed_agent_event` (deduplicated by unique constraint)
8. The workflow exits when it sees a terminal event (`session.status_idle` with `end_turn`, etc.)
9. The chat UI polls `GET /api/managed-agents/transcript` to display events

## Scripts

| Command | What it does |
|---------|-------------|
| `pnpm dev` | Start dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm lint` | Run ESLint |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:push` | Push schema changes to database |

## Iterative Taste Codification

When the user gives feedback on UI, wording, layout, or any design decision, treat it as a taste signal. Update this file, `docs/UI_CONVENTIONS.md`, or the relevant doc to capture the preference as a reusable rule. The goal is to progressively codify the user's taste so future sessions produce the right output without repeated corrections.
