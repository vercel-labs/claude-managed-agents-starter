import { eq } from "drizzle-orm";
import { ConflictError } from "@anthropic-ai/sdk/error";
import { getAnthropic } from "./anthropic";
import { db } from "./db";
import { user } from "./schema";
import { MCP_SERVERS } from "./mcp-oauth";

export async function getOrCreateVaultForUser(
  userId: string,
): Promise<string> {
  const [row] = await db
    .select({ vaultId: user.vaultId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (row?.vaultId) return row.vaultId;

  const client = getAnthropic();
  const vault = await client.beta.vaults.create({
    display_name: `user-${userId}`,
    metadata: { userId },
  });

  await db
    .update(user)
    .set({ vaultId: vault.id })
    .where(eq(user.id, userId));

  return vault.id;
}

async function findCredentialForServer(
  vaultId: string,
  serverUrl: string,
): Promise<string | null> {
  const client = getAnthropic();
  const normalizedUrl = serverUrl.replace(/\/$/, "");
  for await (const cred of client.beta.vaults.credentials.list(vaultId)) {
    if (cred.auth.type === "static_bearer" && !cred.archived_at) {
      const credUrl = cred.auth.mcp_server_url?.replace(/\/$/, "");
      if (credUrl === normalizedUrl || credUrl === serverUrl) {
        return cred.id;
      }
    }
  }
  return null;
}

export async function syncMCPCredential(
  vaultId: string,
  serverName: string,
  serverUrl: string,
  token: string,
): Promise<string> {
  const client = getAnthropic();

  const existingId = await findCredentialForServer(vaultId, serverUrl);
  if (existingId) {
    const updated = await client.beta.vaults.credentials.update(existingId, {
      vault_id: vaultId,
      auth: { type: "static_bearer", token },
    });
    return updated.id;
  }

  try {
    const credential = await client.beta.vaults.credentials.create(vaultId, {
      display_name: `${serverName} Token`,
      auth: {
        type: "static_bearer",
        token,
        mcp_server_url: serverUrl,
      },
    });
    return credential.id;
  } catch (err) {
    if (err instanceof ConflictError) {
      const retryId = await findCredentialForServer(vaultId, serverUrl);
      if (retryId) {
        const updated = await client.beta.vaults.credentials.update(retryId, {
          vault_id: vaultId,
          auth: { type: "static_bearer", token },
        });
        return updated.id;
      }
    }
    throw err;
  }
}

