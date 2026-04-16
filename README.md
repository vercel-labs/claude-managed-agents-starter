# Claude Managed Agents Template

An internal knowledge agent built with [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview). Connect your GitHub, Notion, and Slack via MCP and ask questions across all of them. Read more in the [guide](https://vercel.com/kb/guide/claude-managed-agent-vercel).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fclaude-managed-agents-starter&project-name=claude-managed-agents&repository-name=claude-managed-agents&env=ANTHROPIC_API_KEY%2CANTHROPIC_AGENT_ID%2CANTHROPIC_ENVIRONMENT_ID%2CBETTER_AUTH_SECRET%2CVERCEL_CLIENT_ID%2CVERCEL_CLIENT_SECRET%2CTOKEN_ENCRYPTION_KEY&envDescription=Configure+your+Anthropic+agent+and+Vercel+OAuth+credentials.&envLink=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fclaude-managed-agents-starter%23environment-variables&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22neon%22%2C%22integrationSlug%22%3A%22neon%22%7D%5D&demo-title=Internal+Knowledge+Agent&demo-description=An+internal+knowledge+assistant+powered+by+Claude+Managed+Agents.+Connect+GitHub%2C+Notion%2C+and+Slack+via+MCP+to+search+across+your+tools.)

![Claude Managed Agents](./public/hero.png)

## Stack

| Layer | Choice |
| --- | --- |
| App | [Next.js 16](https://nextjs.org) (App Router), React 19 |
| UI | [shadcn/ui](https://ui.shadcn.com), Tailwind CSS v4 |
| Auth | [Better Auth](https://www.better-auth.com) + [Sign in with Vercel](https://vercel.com/docs/sign-in-with-vercel/getting-started) |
| Data | [Neon](https://neon.tech) + [Drizzle ORM](https://orm.drizzle.team) |
| Background | [Workflow SDK](https://useworkflow.dev) |
| Agents | [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) via `@anthropic-ai/sdk` |

## Quickstart

### 1. Clone, install skills, and provision integrations

```bash
git clone https://github.com/vercel-labs/claude-managed-agents.git
cd claude-managed-agents
npx skills add anthropics/skills --skill claude-api
npx skills add vercel/workflow
vercel link
vercel integration add neon
```

### 2. Generate secrets and pull environment variables

```bash
echo "$(openssl rand -base64 32)" | vercel env add BETTER_AUTH_SECRET production preview development
echo "$(openssl rand -hex 32)" | vercel env add TOKEN_ENCRYPTION_KEY production preview development
vercel env pull
```

This generates both secrets and writes `.env.local` with `DATABASE_URL`, Neon vars, and the secrets.

### 3. Set remaining environment variables

Add these to `.env.local` (or via `vercel env add`):

| Variable | How to get it |
| --- | --- |
| `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| `ANTHROPIC_AGENT_ID` | Create an agent via the [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart) |
| `ANTHROPIC_ENVIRONMENT_ID` | Create an environment for the agent and copy its ID |
| `BETTER_AUTH_URL` | `http://localhost:3000` (or your deployment URL) |
| `VERCEL_CLIENT_ID` | Create an OAuth app via [Sign in with Vercel](https://vercel.com/docs/sign-in-with-vercel/getting-started). Callback: `<url>/api/auth/callback/vercel` |
| `VERCEL_CLIENT_SECRET` | From the same Vercel OAuth app |

Optional for GitHub integration:

| Variable | How to get it |
| --- | --- |
| `GITHUB_CLIENT_ID` | [Create a GitHub OAuth app](https://github.com/settings/applications/new) |
| `GITHUB_CLIENT_SECRET` | From the same GitHub OAuth app |

### 4. Install dependencies and push schema

```bash
pnpm install
pnpm db:push
```

### 5. Run

```bash
pnpm dev
```

### Key files

| File | Purpose |
| --- | --- |
| `lib/auth.ts` | Better Auth config (Vercel OIDC + optional GitHub OAuth) |
| `lib/session.ts` | `getSession()` and `requireUserId()` server helpers |
| `proxy.ts` | Auth guard — redirects unauthenticated users on protected routes |
| `lib/schema.ts` | Drizzle schema (Better Auth tables + managed agent tables) |
| `lib/db.ts` | Neon + Drizzle client |
| `lib/anthropic.ts` | Anthropic SDK client factory |
| `lib/managed-agents.ts` | Session creation + message sending |
| `app/workflows/tail-session.ts` | Durable workflow: polls Anthropic events, persists to Postgres |
| `app/api/managed-agents/` | REST API routes (session, message, transcript) |

## References

- [Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart)
- [Workflow SDK docs](https://useworkflow.dev/docs/getting-started/next)
