import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/session";
import {
  MCP_SERVERS,
  discoverOAuthMetadata,
  getOrRegisterClient,
  buildAuthorizationUrl,
  deleteUserToken,
} from "@/lib/mcp-oauth";

export const dynamic = "force-dynamic";

function getRedirectUri(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/api/mcp-auth/callback`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ server: string }> },
) {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  const { server: serverName } = await params;
  const serverInfo = MCP_SERVERS[serverName];
  if (!serverInfo) {
    return NextResponse.json(
      { error: `Unknown MCP server: ${serverName}` },
      { status: 400 },
    );
  }

  try {
    const metadata = await discoverOAuthMetadata(serverInfo.url, serverName);
    const redirectUri = getRedirectUri(request);
    const client = await getOrRegisterClient(
      serverName,
      metadata,
      redirectUri,
    );

    const { url: authUrl, codeVerifier } = await buildAuthorizationUrl(
      metadata,
      client,
      redirectUri,
      "", // placeholder, we set state after getting codeVerifier
      metadata.scopes_supported?.join(" "),
    );

    const statePayload: Record<string, string> = {
      server: serverName,
      userId: authz.userId,
    };
    if (codeVerifier) {
      statePayload.cv = codeVerifier;
    }
    const state = Buffer.from(JSON.stringify(statePayload)).toString(
      "base64url",
    );

    const finalUrl = new URL(authUrl);
    finalUrl.searchParams.set("state", state);

    return NextResponse.redirect(finalUrl.toString());
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to start OAuth flow";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ server: string }> },
) {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  const { server: serverName } = await params;
  if (!MCP_SERVERS[serverName]) {
    return NextResponse.json(
      { error: `Unknown server: ${serverName}` },
      { status: 400 },
    );
  }

  await deleteUserToken(authz.userId, serverName);
  return NextResponse.json({ ok: true });
}
