# Claude Managed Agents (Vercel Labs)

Demo app for [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/quickstart): create sessions, send `user.message` events, and **tail** new events with [Vercel Workflow](https://useworkflow.dev) (`sleep` + polled `events.list`). The browser only reads **Neon** via `GET /api/managed-agents/transcript` (no Anthropic on that path).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/vercel-labs/claude-managed-agents)

**Template / project:** [vercel.com/vercel-labs/claude-managed-agents](https://vercel.com/vercel-labs/claude-managed-agents)

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router), React 19 |
| UI | [shadcn/ui](https://ui.shadcn.com), Tailwind CSS v4 |
| Auth | [Better Auth](https://www.better-auth.com) + [Sign in with Vercel](https://vercel.com/docs/sign-in-with-vercel/getting-started) |
| Data | [Neon](https://neon.tech) + [Drizzle ORM](https://orm.drizzle.team) |
| Background | [Workflow DevKit](https://useworkflow.dev) — `app/workflows/tail-session.ts` |
| Agents API | `@anthropic-ai/sdk` — `beta.sessions` / `events.send` / `events.list` |
| Package manager | [pnpm](https://pnpm.io) (see `packageManager` in `package.json`) |

## Product behavior

- **Routes:** `/login`, `/chat`, `/chat/[sessionId]`. Sidebar lists your sessions (from `GET /api/managed-agents/sessions`); **New chat** creates a row and navigates to the new id.
- **Messaging:** `POST /api/managed-agents/message` calls Anthropic `events.send`, bumps `updatedAt`, acquires a **tail lock** (`tailing = true` only if it was `false`), and starts `tailSessionWorkflow` when the lock is acquired.
- **Tail workflow:** A step lists events (desc, paginated), inserts into Postgres with a **unique** `(sessionId, anthropicEventId)` dedupe, updates `updatedAt` when new rows appear, and stops when it sees a **terminal** idle/terminated/deleted/error event—then clears `tailing`.
- **Transcript UI:** Polls `GET /api/managed-agents/transcript?sessionId=` (faster interval while `tailing` is true).

## Local setup

Use [pnpm](https://pnpm.io). With [Corepack](https://nodejs.org/api/corepack.html): `corepack enable` (Node 16.13+), then the `packageManager` field in `package.json` selects the right pnpm version.

1. **Clone & install**

   ```bash
   pnpm install
   ```

2. **Environment** — copy `.env.example` to `.env.local` and set variables (see [docs/AUTH.md](./docs/AUTH.md) for Sign in with Vercel). In production, set a strong `BETTER_AUTH_SECRET` (never rely on the dev fallback in `lib/auth.ts`).

3. **Database** — push Drizzle schema to Neon:

   ```bash
   pnpm db:push
   ```

4. **Dev server**

   ```bash
   pnpm dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) → sign in → use **New chat** and the composer.

Use the same **callback URL** origin as `BETTER_AUTH_URL` (e.g. `http://localhost:3000`) in your Vercel OAuth app settings.

## Scripts

- `pnpm dev` — Next.js dev (Workflow local data under `.next/workflow-data`)
- `pnpm build` / `pnpm start` — production
- `pnpm db:generate` — Drizzle migrations (optional)
- `pnpm db:push` — apply schema to `DATABASE_URL`

## References

- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart)
- [Workflow Next.js setup](https://useworkflow.dev/docs/getting-started/next)
