import { NextResponse } from "next/server";
import {
  MCP_SERVERS,
  discoverOAuthMetadata,
  getOrRegisterClient,
  exchangeCodeForToken,
  saveUserToken,
} from "@/lib/mcp-oauth";
import { syncMCPCredential, getOrCreateVaultForUser } from "@/lib/vault";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    const desc = url.searchParams.get("error_description") ?? error;
    return NextResponse.redirect(
      new URL(`/?mcp_error=${encodeURIComponent(desc)}`, url.origin),
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      new URL("/?mcp_error=missing_params", url.origin),
    );
  }

  let state: { server: string; userId: string; cv?: string };
  try {
    state = JSON.parse(
      Buffer.from(stateParam, "base64url").toString("utf-8"),
    );
  } catch {
    return NextResponse.redirect(
      new URL("/?mcp_error=invalid_state", url.origin),
    );
  }

  const serverInfo = MCP_SERVERS[state.server];
  if (!serverInfo) {
    return NextResponse.redirect(
      new URL("/?mcp_error=unknown_server", url.origin),
    );
  }

  try {
    const redirectUri = `${url.origin}/api/mcp-auth/callback`;
    const metadata = await discoverOAuthMetadata(serverInfo.url, state.server);
    const client = await getOrRegisterClient(
      state.server,
      metadata,
      redirectUri,
    );

    const tokenRes = await exchangeCodeForToken(
      metadata,
      client,
      code,
      redirectUri,
      state.cv,
    );

    await saveUserToken(
      state.userId,
      state.server,
      tokenRes.access_token,
      tokenRes.refresh_token,
      tokenRes.expires_in,
    );

    const vaultId = await getOrCreateVaultForUser(state.userId);
    await syncMCPCredential(
      vaultId,
      state.server,
      serverInfo.url,
      tokenRes.access_token,
    );

    return NextResponse.redirect(
      new URL(`/?mcp_connected=${state.server}`, url.origin),
    );
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "OAuth callback failed";
    console.error(`MCP OAuth callback error for ${state.server}:`, message);
    return NextResponse.redirect(
      new URL(`/?mcp_error=${encodeURIComponent(message)}`, url.origin),
    );
  }
}
