import { and, eq } from "drizzle-orm";
import {
  symmetricDecrypt,
  symmetricEncrypt,
} from "better-auth/crypto";
import { db } from "@/lib/db";
import { account } from "@/lib/schema";

type TokenRow = {
  id: string;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
};

function getSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set");
  return secret;
}

async function decrypt(token: string): Promise<string> {
  return symmetricDecrypt({ key: getSecret(), data: token });
}

async function encrypt(token: string): Promise<string> {
  return symmetricEncrypt({ key: getSecret(), data: token });
}

export async function getGithubTokenForUser(
  userId: string,
): Promise<string | null> {
  const oauthConfigured = Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() &&
      process.env.GITHUB_CLIENT_SECRET?.trim(),
  );

  const [row] = await db
    .select({
      id: account.id,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
    })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "github")))
    .limit(1);

  if (!row?.accessToken) return null;

  if (!isExpired(row)) return decrypt(row.accessToken);
  if (!oauthConfigured || !row.refreshToken) {
    return decrypt(row.accessToken);
  }

  try {
    const decryptedRefresh = await decrypt(row.refreshToken);
    const refreshed = await refreshGithubToken(decryptedRefresh);
    await db
      .update(account)
      .set({
        accessToken: await encrypt(refreshed.accessToken),
        refreshToken: refreshed.refreshToken
          ? await encrypt(refreshed.refreshToken)
          : row.refreshToken,
        accessTokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
        updatedAt: new Date(),
      })
      .where(eq(account.id, row.id));
    return refreshed.accessToken;
  } catch (error) {
    console.error("[auth/github] token refresh failed", error);
    return decrypt(row.accessToken);
  }
}

export async function getGitHubIdentityForUser(
  userId: string,
): Promise<{ name: string; email: string; login: string } | null> {
  const token = await getGithubTokenForUser(userId);
  if (!token) return null;

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) return null;
    const profile = (await res.json()) as {
      id: number;
      login: string;
      name: string | null;
    };
    if (!profile?.id || !profile?.login) return null;
    return {
      name: profile.name || profile.login,
      email: `${profile.id}+${profile.login}@users.noreply.github.com`,
      login: profile.login,
    };
  } catch {
    return null;
  }
}

function isExpired(row: TokenRow): boolean {
  const expiresAtMs = row.accessTokenExpiresAt?.getTime();
  if (!expiresAtMs) return false;
  return expiresAtMs <= Date.now() + 30_000;
}

async function refreshGithubToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GitHub OAuth credentials are not configured");
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to refresh GitHub token (${res.status}): ${body}`);
  }
  const payload = await res.json();
  return {
    accessToken: String(payload.access_token),
    refreshToken:
      typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    expiresIn:
      typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
        ? payload.expires_in
        : 3600,
  };
}
