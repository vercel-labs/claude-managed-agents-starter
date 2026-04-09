import { db } from "./db";
import { mcpOAuthClient, mcpOAuthToken } from "./schema";
import { and, eq } from "drizzle-orm";

export interface MCPServerInfo {
  name: string;
  url: string;
}

export const MCP_SERVERS: Record<string, MCPServerInfo> = {
  github: { name: "github", url: "https://api.githubcopilot.com/mcp/" },
  notion: { name: "notion", url: "https://mcp.notion.com/mcp" },
  slack: { name: "slack", url: "https://mcp.slack.com/mcp" },
};

interface OAuthMetadata {
  issuer?: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
}

interface ClientRegistration {
  client_id: string;
  client_secret?: string;
  redirect_uris: string[];
}

const OAUTH_METADATA_OVERRIDES: Record<string, OAuthMetadata> = {
  github: {
    authorization_endpoint: "https://github.com/login/oauth/authorize",
    token_endpoint: "https://github.com/login/oauth/access_token",
    scopes_supported: ["repo", "read:org", "read:user"],
  },
};

function getBaseUrl(serverUrl: string): string {
  const u = new URL(serverUrl);
  return `${u.protocol}//${u.host}`;
}

export async function discoverOAuthMetadata(
  serverUrl: string,
  serverName?: string,
): Promise<OAuthMetadata> {
  if (serverName && OAUTH_METADATA_OVERRIDES[serverName]) {
    return OAUTH_METADATA_OVERRIDES[serverName];
  }

  const base = getBaseUrl(serverUrl);
  const wellKnownUrl = `${base}/.well-known/oauth-authorization-server`;
  const res = await fetch(wellKnownUrl, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `OAuth discovery failed for ${wellKnownUrl}: ${res.status}`,
    );
  }
  return res.json() as Promise<OAuthMetadata>;
}

export async function getOrRegisterClient(
  serverName: string,
  metadata: OAuthMetadata,
  redirectUri: string,
): Promise<ClientRegistration> {
  const envPrefix = `MCP_OAUTH_${serverName.toUpperCase()}`;
  const envClientId =
    process.env[`${envPrefix}_CLIENT_ID`] ??
    process.env[`${serverName.toUpperCase()}_CLIENT_ID`];
  const envClientSecret =
    process.env[`${envPrefix}_CLIENT_SECRET`] ??
    process.env[`${serverName.toUpperCase()}_CLIENT_SECRET`];

  if (envClientId) {
    await db
      .insert(mcpOAuthClient)
      .values({
        serverName,
        clientId: envClientId,
        clientSecret: envClientSecret ?? null,
        redirectUri: null,
        fromEnv: true,
        registeredAt: new Date(),
      })
      .onConflictDoUpdate({
        target: mcpOAuthClient.serverName,
        set: {
          clientId: envClientId,
          clientSecret: envClientSecret ?? null,
          fromEnv: true,
        },
      });

    return {
      client_id: envClientId,
      client_secret: envClientSecret,
      redirect_uris: [redirectUri],
    };
  }

  const [existing] = await db
    .select()
    .from(mcpOAuthClient)
    .where(eq(mcpOAuthClient.serverName, serverName))
    .limit(1);

  if (existing && (existing.fromEnv || existing.redirectUri === redirectUri)) {
    return {
      client_id: existing.clientId,
      client_secret: existing.clientSecret ?? undefined,
      redirect_uris: [redirectUri],
    };
  }

  if (!metadata.registration_endpoint) {
    throw new Error(
      `MCP server "${serverName}" requires OAuth client credentials. ` +
        `Set ${envPrefix}_CLIENT_ID and ${envPrefix}_CLIENT_SECRET in your .env.local.`,
    );
  }

  const res = await fetch(metadata.registration_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "Claude Managed Agents",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Dynamic client registration failed for ${serverName}: ${res.status} ${body}`,
    );
  }

  const reg = (await res.json()) as {
    client_id: string;
    client_secret?: string;
  };

  await db
    .insert(mcpOAuthClient)
    .values({
      serverName,
      clientId: reg.client_id,
      clientSecret: reg.client_secret ?? null,
      redirectUri,
      fromEnv: false,
      registeredAt: new Date(),
    })
    .onConflictDoUpdate({
      target: mcpOAuthClient.serverName,
      set: {
        clientId: reg.client_id,
        clientSecret: reg.client_secret ?? null,
        redirectUri,
        fromEnv: false,
        registeredAt: new Date(),
      },
    });

  return {
    client_id: reg.client_id,
    client_secret: reg.client_secret,
    redirect_uris: [redirectUri],
  };
}

function generateCodeVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

async function computeCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return Buffer.from(digest).toString("base64url");
}

export async function buildAuthorizationUrl(
  metadata: OAuthMetadata,
  client: ClientRegistration,
  redirectUri: string,
  state: string,
  scope?: string,
): Promise<{ url: string; codeVerifier?: string }> {
  const authUrl = new URL(metadata.authorization_endpoint);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", client.client_id);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("state", state);
  if (scope) authUrl.searchParams.set("scope", scope);

  let codeVerifier: string | undefined;
  if (metadata.code_challenge_methods_supported?.includes("S256")) {
    codeVerifier = generateCodeVerifier();
    const challenge = await computeCodeChallenge(codeVerifier);
    authUrl.searchParams.set("code_challenge", challenge);
    authUrl.searchParams.set("code_challenge_method", "S256");
  }

  return { url: authUrl.toString(), codeVerifier };
}

export async function exchangeCodeForToken(
  metadata: OAuthMetadata,
  client: ClientRegistration,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<{
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type: string;
  scope?: string;
}> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: client.client_id,
  });
  if (client.client_secret) {
    body.set("client_secret", client.client_secret);
  }
  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const res = await fetch(metadata.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  return res.json();
}

export async function saveUserToken(
  userId: string,
  serverName: string,
  accessToken: string,
  refreshToken?: string,
  expiresIn?: number,
): Promise<void> {
  const expiresAt = expiresIn
    ? new Date(Date.now() + expiresIn * 1000)
    : null;

  const [existing] = await db
    .select()
    .from(mcpOAuthToken)
    .where(
      and(
        eq(mcpOAuthToken.userId, userId),
        eq(mcpOAuthToken.serverName, serverName),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(mcpOAuthToken)
      .set({
        accessToken,
        refreshToken: refreshToken ?? existing.refreshToken,
        expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(mcpOAuthToken.id, existing.id));
  } else {
    await db.insert(mcpOAuthToken).values({
      id: crypto.randomUUID(),
      userId,
      serverName,
      accessToken,
      refreshToken: refreshToken ?? null,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

export async function getUserToken(
  userId: string,
  serverName: string,
): Promise<string | null> {
  const [row] = await db
    .select()
    .from(mcpOAuthToken)
    .where(
      and(
        eq(mcpOAuthToken.userId, userId),
        eq(mcpOAuthToken.serverName, serverName),
      ),
    )
    .limit(1);
  return row?.accessToken ?? null;
}

export async function deleteUserToken(
  userId: string,
  serverName: string,
): Promise<void> {
  await db
    .delete(mcpOAuthToken)
    .where(
      and(
        eq(mcpOAuthToken.userId, userId),
        eq(mcpOAuthToken.serverName, serverName),
      ),
    );
}

export async function getUserMCPConnections(
  userId: string,
): Promise<Record<string, boolean>> {
  const rows = await db
    .select({ serverName: mcpOAuthToken.serverName })
    .from(mcpOAuthToken)
    .where(eq(mcpOAuthToken.userId, userId));

  const connected: Record<string, boolean> = {};
  for (const row of rows) {
    connected[row.serverName] = true;
  }
  return connected;
}
