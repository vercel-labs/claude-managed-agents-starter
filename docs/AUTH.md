# Authentication (Sign in with Vercel)

This app uses [Better Auth](https://www.better-auth.com) with the Vercel OpenID provider ([Sign in with Vercel](https://vercel.com/docs/sign-in-with-vercel/getting-started)).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `BETTER_AUTH_SECRET` | Secret for encrypting sessions and OAuth tokens. Generate a long random string. |
| `BETTER_AUTH_URL` | Public origin of this app (e.g. `http://localhost:3000` locally, `https://your-deployment.vercel.app` in production). |
| `VERCEL_CLIENT_ID` | OAuth client ID from your Vercel OAuth app. |
| `VERCEL_CLIENT_SECRET` | OAuth client secret. |

Copy `.env.example` to `.env.local` and fill in values. On Vercel, use `vercel env pull` after linking the project.

## Vercel OAuth app setup

1. In the Vercel dashboard, create an OAuth application for Sign in with Vercel (see Vercel docs above).
2. Add **redirect / callback URLs** for each environment (Better Auth generic OAuth uses `/oauth2/callback/:providerId` under the auth mount):
   - Local: `http://localhost:3000/api/auth/oauth2/callback/vercel`
   - Production: `https://<your-domain>/api/auth/oauth2/callback/vercel`
3. Copy the client ID and secret into `VERCEL_CLIENT_ID` and `VERCEL_CLIENT_SECRET`.

If sign-in fails, confirm `BETTER_AUTH_URL` exactly matches the origin users use in the browser (including `https` and no trailing slash issues in your deployment).

## Database

Better Auth persists users, sessions, and OAuth accounts in Postgres via Drizzle. After setting `DATABASE_URL`, run:

```bash
pnpm db:push
```
