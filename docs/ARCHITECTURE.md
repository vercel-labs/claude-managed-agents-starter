# Architecture

## Overview

This is a Next.js 16 App Router application that provides a web UI for Anthropic's Managed Agents API. The core pattern is **poll and persist**: a durable Workflow polls Anthropic for session events, writes them to Postgres, and the client reads transcripts via REST.

There is no client-side streaming. The Anthropic SDK runs server-side only.

## Routing

### Route Groups

- **`(dashboard)`** - main authenticated UI. The parenthesized name means it does not affect the URL path. Routes: `/` (home), `/chat/[sessionId]`.
- **`api/`** - REST endpoints for auth and managed agents.
- **`auth/`** - auth-related pages (error).

### Page Routes

| URL | File | Auth | Description |
|-----|------|------|-------------|
| `/` | `app/(dashboard)/page.tsx` | No (public) | Home page with centered chat composer. Shows sign-in modal if unauthenticated. |
| `/chat/[sessionId]` | `app/(dashboard)/chat/[sessionId]/page.tsx` | Yes | Chat transcript for a specific session. |
| `/auth/error` | `app/auth/error/page.tsx` | No | Custom error page for auth failures. |

### API Routes

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/*` | GET, POST | N/A | Better Auth catch-all (sign-in, callbacks, session, sign-out) |
| `/api/managed-agents/session` | POST | Yes | Create new Anthropic session + DB row |
| `/api/managed-agents/session?sessionId=` | DELETE | Yes | Delete session and its events (user-scoped) |
| `/api/managed-agents/sessions` | GET | Yes | List user's sessions (limit 50, ordered by updatedAt desc) |
| `/api/managed-agents/message` | POST | Yes | Send message to Anthropic, start tailing workflow if needed |
| `/api/managed-agents/transcript?sessionId=` | GET | Yes | Fetch persisted events for a session |

### Workflow Routes

The Workflow SDK generates routes under `app/.well-known/workflow/v1/` at build time. These are runtime artifacts - do not edit them.

## Middleware

`proxy.ts` runs on every request (except static assets and workflow internals).

- **Public paths**: `/`, `/login*`, `/api/auth*`, `/auth/error*`, `/.well-known/workflow*`
- **Protected paths**: `/chat*`, `/api/managed-agents*` - requires a Better Auth session cookie
- Missing cookie on API routes returns 401 JSON; on page routes redirects to `/`

## Layout Hierarchy

```
app/layout.tsx (root)
  - Geist Sans + Geist Mono fonts
  - ThemeProvider (dark mode default)
  - <main> wrapper

  app/(dashboard)/layout.tsx (server component)
    - Resolves Better Auth session (viewer may be null)
    - Loads user's managed agent sessions from DB
    - Renders DashboardShell with sidebar + children

    app/(dashboard)/page.tsx -> NewChatComposer
    app/(dashboard)/chat/[sessionId]/page.tsx -> ChatPanel
```

## Key Directories

| Directory | Purpose |
|-----------|---------|
| `app/` | Next.js App Router pages, layouts, API routes, workflows |
| `lib/` | Shared server utilities (DB, auth, Anthropic helpers) |
| `components/` | Reusable React components (chat UI, auth, icons, shadcn primitives) |
| `docs/` | Project documentation |
| `drizzle/` | Generated migration output (from `pnpm db:generate`) |

## End-to-End Session Flow

```
User sends message
  |
  v
POST /api/managed-agents/session
  -> client.beta.sessions.create({ agent, environment_id })
  -> INSERT managed_agent_session
  -> return { id }
  |
  v
POST /api/managed-agents/message
  -> client.beta.sessions.events.send(anthropicSessionId, { events: [{ type: "user.message", ... }] })
  -> UPDATE title from first message (truncated to 80 chars)
  -> If not tailing: SET tailing=true, start tailSessionWorkflow
  |
  v
tailSessionWorkflow (durable, runs in background)
  loop:
    -> client.beta.sessions.events.list(anthropicSessionId, { order: "desc", limit: 50 })
    -> INSERT new events (ON CONFLICT DO NOTHING for idempotency)
    -> If terminal event seen: SET tailing=false, exit
    -> sleep 10s
  |
  v
Client polls GET /api/managed-agents/transcript?sessionId=...
  -> SELECT events ORDER BY occurred_at
  -> Display messages, tool calls, results
```

## Workflow SDK Integration

The app uses the [Workflow SDK](https://useworkflow.dev/) for durable background execution:

- `next.config.ts` wraps the config with `withWorkflow()` from `workflow/next`
- Workflow files use `"use workflow"` and `"use step"` directives
- Steps are individually retryable and survive server restarts
- `sleep()` from `workflow` provides durable timers (not `setTimeout`)
- The workflow runtime generates routes under `.well-known/workflow/` - these must be excluded from proxy auth checks

## Server External Packages

`@anthropic-ai/sdk` is listed in `serverExternalPackages` in `next.config.ts` to prevent Turbopack from bundling it into server chunks, which causes issues with the SDK's internal module structure.
