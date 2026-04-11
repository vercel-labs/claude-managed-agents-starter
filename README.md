# Claude Managed Agents Template

An internal knowledge agent built with [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview). Connect your GitHub, Notion, and Slack via MCP and ask questions across all of them. Read more in the [guide](https://vercel.com/kb/guide/claude-managed-agent-vercel).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fclaude-managed-agents-starter&project-name=claude-managed-agents&repository-name=claude-managed-agents&env=ANTHROPIC_API_KEY%2CANTHROPIC_AGENT_ID%2CANTHROPIC_ENVIRONMENT_ID%2CBETTER_AUTH_SECRET%2CVERCEL_CLIENT_ID%2CVERCEL_CLIENT_SECRET%2CTOKEN_ENCRYPTION_KEY&envDescription=Configure+your+Anthropic+agent+and+Vercel+OAuth+credentials.&envLink=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Fclaude-managed-agents-starter%23environment-variables&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22neon%22%2C%22integrationSlug%22%3A%22neon%22%7D%5D&demo-title=Internal+Knowledge+Agent&demo-description=An+internal+knowledge+assistant+powered+by+Claude+Managed+Agents.+Connect+GitHub%2C+Notion%2C+and+Slack+via+MCP+to+search+across+your+tools.)

## Stack

| Layer | Choice |
| --- | --- |
| App | [Next.js 16](https://nextjs.org) (App Router), React 19 |
| UI | [shadcn/ui](https://ui.shadcn.com), Tailwind CSS v4 |
| Auth | [Better Auth](https://www.better-auth.com) + [Sign in with Vercel](https://vercel.com/docs/sign-in-with-vercel/getting-started) |
| Data | [Neon](https://neon.tech) + [Drizzle ORM](https://orm.drizzle.team) |
| Background | [Workflow SDK](https://useworkflow.dev) |
| Agents | [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/overview) via `@anthropic-ai/sdk` |

## Setup

### 1. Clone and install

```bash
pnpm install
```

### 2. Environment variables

Copy `.env.example` to `.env.local` and fill in each variable:

| Variable | Where to get it |
| --- | --- |
| `DATABASE_URL` | Auto-provisioned by the Deploy button, or via `vercel integration add neon`. Or create a database at [neon.tech](https://neon.tech). |
| `ANTHROPIC_API_KEY` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| `ANTHROPIC_AGENT_ID` | Create an agent via the [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart). |
| `ANTHROPIC_ENVIRONMENT_ID` | Create an environment for your agent and copy the ID. |
| `BETTER_AUTH_SECRET` | Generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | `http://localhost:3000` locally, your deployment URL in production. |
| `VERCEL_CLIENT_ID` | Create an OAuth app via [Sign in with Vercel](https://vercel.com/docs/sign-in-with-vercel/getting-started). Callback: `<your-url>/api/auth/callback/vercel`. |
| `VERCEL_CLIENT_SECRET` | From the same Vercel OAuth app. |
| `TOKEN_ENCRYPTION_KEY` | Generate with `openssl rand -hex 32`. |
| `GITHUB_CLIENT_ID` | *(Optional)* [Create a GitHub OAuth app](https://github.com/settings/applications/new) for the GitHub integration. |
| `GITHUB_CLIENT_SECRET` | *(Optional)* From the same GitHub OAuth app. |

### 3. Push database schema

```bash
pnpm db:push
```

### 4. Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign in, and start asking questions.

## References

- [Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Managed Agents quickstart](https://platform.claude.com/docs/en/managed-agents/quickstart)
- [Workflow SDK docs](https://useworkflow.dev/docs/getting-started/next)
