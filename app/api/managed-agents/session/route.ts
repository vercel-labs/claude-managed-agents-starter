import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { start } from "workflow/api";
import { db } from "@/lib/db";
import { managedAgentSession } from "@/lib/schema";
import { createCodingSession } from "@/lib/managed-agents";
import { requireUserId } from "@/lib/session";
import { getOrCreateVaultForUser, syncMCPCredential } from "@/lib/vault";
import { getUserToken, MCP_SERVERS } from "@/lib/mcp-oauth";
import { sessionWorkflow } from "@/app/workflows/tail-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json(
      { error: "text is required" },
      { status: 400 },
    );
  }

  const id = crypto.randomUUID();
  const title = text.length > 60 ? `${text.slice(0, 57)}...` : text;

  let anthropic;
  try {
    const vaultId = await getOrCreateVaultForUser(authz.userId);

    await Promise.all(
      Object.entries(MCP_SERVERS).map(async ([name, info]) => {
        const mcpToken = await getUserToken(authz.userId, name);
        if (mcpToken) {
          await syncMCPCredential(vaultId, name, info.url, mcpToken);
        }
      }),
    );

    anthropic = await createCodingSession([vaultId]);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const run = await start(sessionWorkflow, [
    {
      internalSessionId: id,
      anthropicSessionId: anthropic.anthropicSessionId,
      initialMessage: text,
    },
  ]);

  await db.insert(managedAgentSession).values({
    id,
    userId: authz.userId,
    anthropicSessionId: anthropic.anthropicSessionId,
    title,
    agentId: anthropic.agentId,
    environmentId: anthropic.environmentId,
    workflowRunId: run.runId,
    repoUrl: null,
    repoOwner: null,
    repoName: null,
    baseBranch: null,
  });

  return NextResponse.json({ id, runId: run.runId });
}

export async function DELETE(request: NextRequest) {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  const sessionId = request.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  const [row] = await db
    .select({ id: managedAgentSession.id })
    .from(managedAgentSession)
    .where(
      and(
        eq(managedAgentSession.id, sessionId),
        eq(managedAgentSession.userId, authz.userId),
      ),
    )
    .limit(1);

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db
    .delete(managedAgentSession)
    .where(eq(managedAgentSession.id, sessionId));

  return NextResponse.json({ ok: true });
}
