import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { managedAgentSession, managedAgentEvent } from "@/lib/schema";
import {
  createAnthropicManagedSession,
  createCodingSession,
} from "@/lib/managed-agents";
import { requireUserId } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const authz = await requireUserId();
  if ("error" in authz) return authz.error;

  let body: {
    repoOwner?: string;
    repoName?: string;
    baseBranch?: string;
  } = {};
  try {
    body = await request.json();
  } catch {
    // no body is fine for non-coding sessions
  }

  const isCoding = Boolean(body.repoOwner && body.repoName);
  const id = crypto.randomUUID();

  let anthropic;
  try {
    anthropic = isCoding
      ? await createCodingSession()
      : await createAnthropicManagedSession();
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  await db.insert(managedAgentSession).values({
    id,
    userId: authz.userId,
    anthropicSessionId: anthropic.anthropicSessionId,
    title: "New chat",
    agentId: anthropic.agentId,
    environmentId: anthropic.environmentId,
    tailing: false,
    repoUrl: isCoding
      ? `https://github.com/${body.repoOwner}/${body.repoName}`
      : null,
    repoOwner: body.repoOwner ?? null,
    repoName: body.repoName ?? null,
    baseBranch: body.baseBranch ?? null,
  });

  return NextResponse.json({ id });
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
    .delete(managedAgentEvent)
    .where(eq(managedAgentEvent.sessionId, sessionId));
  await db
    .delete(managedAgentSession)
    .where(eq(managedAgentSession.id, sessionId));

  return NextResponse.json({ ok: true });
}
