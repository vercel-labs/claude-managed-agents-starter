import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { db } from "./db";
import * as schema from "./schema";

const vercelClientId = process.env.VERCEL_CLIENT_ID?.trim();
const vercelClientSecret = process.env.VERCEL_CLIENT_SECRET?.trim();
const vercelOAuthConfigured = Boolean(vercelClientId && vercelClientSecret);

const authSecret =
  process.env.BETTER_AUTH_SECRET?.trim() ??
  "development-only-better-auth-secret-min-32-chars!";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  secret: authSecret,
  baseURL:
    process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000",
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ].filter((x): x is string => Boolean(x)),
  onAPIError: {
    errorURL: "/auth/error",
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["vercel"],
      allowDifferentEmails: true,
    },
  },
  socialProviders: {},
  plugins: [
    ...(vercelOAuthConfigured
      ? [
          genericOAuth({
            config: [
              {
                providerId: "vercel",
                discoveryUrl:
                  "https://vercel.com/.well-known/openid-configuration",
                clientId: vercelClientId!,
                clientSecret: vercelClientSecret!,
                scopes: ["openid", "email", "profile", "offline_access"],
                pkce: true,
              },
            ],
          }),
        ]
      : []),
    nextCookies(),
  ],
});
